from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from contracts.models import Contract
from contracts.services import release_contract_issue


class Command(BaseCommand):
    help = (
        "Libere les contrats bloques en ISSUING (crash pendant l'appel ASS) "
        "en les remettant au statut PAID. La reference_trx_partner est conservee : "
        "si l'attestation a reellement ete emise cote ASS, une nouvelle tentative "
        "sera rejetee comme doublon (code 5006) au lieu de consommer un second QR. "
        "Verifier le statut reel aupres d'ASS avant de relancer une emission."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=15,
            help="Anciennete minimale de l'emission en minutes (defaut: 15).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Affiche les contrats concernes sans les modifier.",
        )

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(minutes=options["minutes"])
        stale_contracts = Contract.objects.filter(
            internal_status=Contract.InternalStatus.ISSUING
        ).filter(
            Q(issuance_started_at__lt=cutoff) | Q(issuance_started_at__isnull=True)
        )

        if not stale_contracts.exists():
            self.stdout.write("Aucune emission bloquee.")
            return

        for contract in stale_contracts:
            started = (
                contract.issuance_started_at.isoformat()
                if contract.issuance_started_at
                else "inconnu"
            )
            if options["dry_run"]:
                self.stdout.write(
                    f"[dry-run] Contrat #{contract.pk} "
                    f"(ref={contract.reference_trx_partner}, demarre={started})"
                )
                continue

            # release_contract_issue reverifie le statut sous verrou : un contrat
            # finalise entre-temps n'est pas touche.
            release_contract_issue(contract.pk)
            self.stdout.write(
                self.style.WARNING(
                    f"Contrat #{contract.pk} libere (ref={contract.reference_trx_partner}, "
                    f"demarre={started}). Verifier aupres d'ASS avant re-emission."
                )
            )

        if not options["dry_run"]:
            self.stdout.write(self.style.SUCCESS("Liberation terminee."))
