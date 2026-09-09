"""Reconciliation des paiements Orange Money restes sans conclusion.

Le rapprochement nominal repose sur deux chemins : la notification poussee par
Orange et le sondage du navigateur. Les deux peuvent manquer :

- la notification est livree « au moins une fois », mais un 4xx de notre cote
  (signature, apiKey, indisponibilite) est traite comme un rejet DEFINITIF par
  Orange, qui ne la reemet jamais ;
- le sondage s'arrete des que l'apporteur ferme l'onglet ou perd le reseau.

Dans les deux cas l'argent est encaisse et le contrat reste en PAYMENT_PENDING,
en silence. Cette commande rejoue la source de verite (`GET /transactions`) sur
toutes les demandes non conclues et confirme celles qui ont ete reglees.

Elle reprend aussi les paiements passes en CANCELLED par une re-initiation : le
QR precedent restait payable chez Orange jusqu'a expiration, et un client ayant
scanne l'ancien code aurait paye sans que rien ne le rattrape.

Usage (cron, toutes les 10 minutes) :
    manage.py om_reconcile
    manage.py om_reconcile --since-hours 72 --dry-run
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from integrations.orange_money.exceptions import OmIntegrationError
from payments.models import Payment
from payments.services import (
    PaymentConfirmationError,
    check_om_payment,
    release_payment_pending,
)

# Orange garantit un statut final sous 24 h ; on ratisse deux fois plus large
# pour absorber une panne de cron d'une journee.
DEFAULT_SINCE_HOURS = 48

# Passe ce delai sans qu'Orange ne connaisse la moindre transaction, la demande
# est morte : le QR a expire sans etre scanne. On la ferme pour que le contrat
# quitte « paiement en attente », ou il restait sinon indefiniment.
DEFAULT_EXPIRE_AFTER_HOURS = 24


class Command(BaseCommand):
    help = "Rejoue le statut Orange Money des paiements non conclus et confirme ceux qui ont ete regles."

    def add_arguments(self, parser):
        parser.add_argument(
            "--since-hours",
            type=int,
            default=DEFAULT_SINCE_HOURS,
            help=f"Fenetre d'examen en heures (defaut : {DEFAULT_SINCE_HOURS}).",
        )
        parser.add_argument(
            "--expire-after-hours",
            type=int,
            default=DEFAULT_EXPIRE_AFTER_HOURS,
            help=(
                "Age a partir duquel une demande sans transaction cote Orange est "
                f"fermee et le contrat libere (defaut : {DEFAULT_EXPIRE_AFTER_HOURS})."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Liste les paiements concernes sans interroger Orange Money.",
        )

    def handle(self, *args, **options):
        since = timezone.now() - timezone.timedelta(hours=options["since_hours"])
        candidates = (
            Payment.objects.select_related("contract")
            .filter(
                method=Payment.Method.ORANGE_MONEY,
                status__in=[Payment.Status.PENDING, Payment.Status.CANCELLED],
                created_at__gte=since,
            )
            # Un contrat deja paye n'a rien a reconcilier : la contrainte
            # d'unicite refuserait de toute facon un second CONFIRMED.
            .exclude(contract__payments__status=Payment.Status.CONFIRMED)
            .order_by("created_at")
        )

        expiry_cutoff = timezone.now() - timezone.timedelta(
            hours=options["expire_after_hours"]
        )
        confirmed = failed = unchanged = errors = expired = 0
        total = candidates.count()
        self.stdout.write(f"{total} paiement(s) Orange Money a examiner depuis {since:%Y-%m-%d %H:%M}.")

        for payment in candidates:
            label = f"#{payment.pk} contrat {payment.contract_id} ref {payment.external_reference}"
            if options["dry_run"]:
                self.stdout.write(f"  [dry-run] {label} ({payment.status})")
                continue
            try:
                updated = check_om_payment(payment=payment, revive_cancelled=True)
            except (PaymentConfirmationError, OmIntegrationError) as exc:
                # Un montant partiel leve PaymentConfirmationError apres avoir
                # committe le FAILED : c'est un cas a trancher a la main, pas un
                # incident de la commande.
                errors += 1
                self.stderr.write(self.style.WARNING(f"  {label} : {exc}"))
                continue
            if updated.status == Payment.Status.CONFIRMED:
                confirmed += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  {label} : CONFIRME ({updated.amount} FCFA)")
                )
            elif updated.status == Payment.Status.FAILED:
                failed += 1
                self.stdout.write(f"  {label} : echec definitif cote Orange")
            elif (
                updated.status == Payment.Status.PENDING
                and updated.created_at < expiry_cutoff
            ):
                # Orange ne connait aucune transaction pour cette reference et le
                # delai de statut final est passe : le QR a expire sans etre
                # scanne. Sans cette fermeture, le contrat restait a vie en
                # « paiement en attente ».
                updated.status = Payment.Status.CANCELLED
                updated.save(update_fields=["status", "updated_at"])
                expired += 1
                self.stdout.write(f"  {label} : demande expiree, contrat libere")
                release_payment_pending(updated.contract_id)
            else:
                unchanged += 1

        if not options["dry_run"]:
            self.stdout.write(
                f"Bilan : {confirmed} confirme(s), {failed} echec(s), "
                f"{expired} expiree(s), {unchanged} toujours en attente, "
                f"{errors} a examiner."
            )
