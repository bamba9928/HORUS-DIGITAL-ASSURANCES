import logging
import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from contracts.models import Contract
from integrations.ass.client import parse_ass_amount
from integrations.orange_money.client import OmClient
from integrations.orange_money.constants import (
    OM_MIN_AMOUNT,
    OM_STATUS_SUCCESS,
    OM_TERMINAL_FAILURE_STATUSES,
)
from payments.models import Payment


logger = logging.getLogger("payments.orange_money")


class PaymentConfirmationError(ValueError):
    pass


def assert_om_mock_allowed():
    """Refuse les parcours Orange Money simules hors developpement.

    Le mock fait passer un paiement a SUCCESS apres quelques secondes, sans
    qu'un franc ne bouge. En production cela suffisait a n'importe quel porteur
    de compte pour marquer son contrat PAYE, puis declencher une emission ASS
    reelle : une vraie police, un QR preleve sur le stock, et aucun encaissement
    en face.

    La confirmation manuelle (`confirm_manual_payment`) reste ouverte : elle est
    reservee aux profils finance/admin et constitue une decision tracee, pas un
    encaissement automatique declenche par l'apporteur lui-meme.
    """
    if not settings.OM_MOCK_ENABLED:
        return
    if settings.DEBUG or settings.OM_ALLOW_MOCK_IN_PRODUCTION:
        return
    raise PaymentConfirmationError(
        "Paiement Orange Money indisponible : l'integration est en mode simule, "
        "refuse hors developpement. Configurer les acces Orange Money reels."
    )


def expected_payment_amount(contract):
    """Net a verser : ce que l'apporteur paie via Orange Money avant emission.

    Regle du 2026-08-28 : `TTC - cout de police`. L'apporteur retient le cout de
    police a la source — c'est sa remuneration, uniforme sur tous les comptes —
    et ne verse que le solde. Horus y preleve ensuite sa commission d'apport et
    reverse le reste a ASS hors plateforme (voir commissions.services).
    """
    return max(0, _contract_ttc(contract) - contract.cout_police_ass)


def _contract_ttc(contract):
    """Prime totale TTC facturee par ASS pour ce contrat."""
    response_payload = contract.ass_response_payload
    if isinstance(response_payload, dict):
        # Format API reelle (valide en sandbox 2026-06-11) : PrimeTotale a la
        # racine, montant en chaine ("8927").
        prime_totale = _parse_amount(response_payload.get("PrimeTotale"))
        if prime_totale > 0:
            return prime_totale

        # Format mock interne : data.primeTotale.
        response_data = response_payload.get("data")
        if isinstance(response_data, dict):
            prime_totale = _parse_amount(response_data.get("primeTotale"))
            if prime_totale > 0:
                return prime_totale
    # Repli — notamment FLOTTE : la reponse rc.flotte n'expose pas de PrimeTotale
    # (elle est imbriquee sous "flotte"/"remorques"). ATTENTION : ce repli ne couvre
    # que RC + cout de police, SANS taxes/FGA/CEDEAO. A revoir des que le format reel
    # de tarification flotte sera connu (rc.flotte.request bloque cote ASS : bug
    # serveur ga_def_recours, reproduit en production le 2026-08-28).
    return contract.prime_rc_ass + contract.cout_police_ass


def _parse_amount(value):
    """Montant ASS -> entier. "63226.0" est un format reel : voir parse_ass_amount."""
    return parse_ass_amount(value, 0)


@transaction.atomic
def confirm_manual_payment(*, contract, amount=None, external_reference="", created_by=None):
    contract = Contract.objects.select_for_update().get(pk=contract.pk)

    if contract.internal_status not in {
        Contract.InternalStatus.QUOTE_READY,
        Contract.InternalStatus.PAYMENT_PENDING,
    }:
        raise PaymentConfirmationError("Le devis doit etre calcule avant le paiement.")

    if contract.prime_rc_ass is None:
        raise PaymentConfirmationError("Prime RC ASS manquante.")

    if contract.payments.filter(status=Payment.Status.CONFIRMED).exists():
        raise PaymentConfirmationError("Un paiement confirme existe deja pour ce contrat.")

    expected_amount = expected_payment_amount(contract)
    if amount in (None, ""):
        amount = expected_amount
    else:
        try:
            amount = int(amount)
        except (TypeError, ValueError) as exc:
            raise PaymentConfirmationError("Le montant du paiement est invalide.") from exc

    if amount != expected_amount:
        raise PaymentConfirmationError(
            f"Le montant du paiement doit etre exactement de {expected_amount} FCFA."
        )

    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                contract=contract,
                amount=amount,
                status=Payment.Status.CONFIRMED,
                external_reference=external_reference,
                confirmed_at=timezone.now(),
                created_by=created_by if created_by and created_by.is_authenticated else None,
            )
    except IntegrityError as exc:
        raise PaymentConfirmationError(
            "Un paiement confirme existe deja pour ce contrat."
        ) from exc

    contract.internal_status = Contract.InternalStatus.PAID
    # ttc_ass porte la prime totale ASS, PAS le montant encaisse : depuis la
    # regle du 28/08/2026 l'apporteur ne verse que TTC - cout de police. Le
    # confondre avec le montant du paiement retrancherait deux fois le cout de
    # police dans le calcul de commission.
    contract.ttc_ass = _contract_ttc(contract)
    contract.save(update_fields=["internal_status", "ttc_ass", "updated_at"])
    return payment


def has_confirmed_payment(contract):
    return contract.payments.filter(status=Payment.Status.CONFIRMED).exists()


# ─── Orange Money ──────────────────────────────────────────────────────────────


def _validate_payable_contract(contract):
    if contract.internal_status not in {
        Contract.InternalStatus.QUOTE_READY,
        Contract.InternalStatus.PAYMENT_PENDING,
    }:
        raise PaymentConfirmationError("Le devis doit etre calcule avant le paiement.")
    if contract.prime_rc_ass is None:
        raise PaymentConfirmationError("Prime RC ASS manquante.")
    if contract.payments.filter(status=Payment.Status.CONFIRMED).exists():
        raise PaymentConfirmationError("Un paiement confirme existe deja pour ce contrat.")


def initiate_om_payment(*, contract, created_by=None, client=None):
    """Crée un paiement Orange Money PENDING et la demande QR côté OM.

    Retourne (payment, qr_data). Les initiations précédentes non confirmées
    du même contrat sont annulées (une seule demande active à la fois).

    L'appel réseau à Orange Money est fait DÉLIBÉRÉMENT hors de la transaction :
    dans le bloc atomique, un simple dépassement de délai annulait la ligne
    Payment alors qu'Orange, lui, avait pu créer le QR — un client pouvait donc
    payer une référence dont nous n'avions plus aucune trace. La ligne est donc
    committée d'abord ; si l'appel échoue ensuite, elle reste PENDING et la
    réconciliation (`manage.py om_reconcile`) la rattrapera.
    """
    assert_om_mock_allowed()

    with transaction.atomic():
        contract = Contract.objects.select_for_update().get(pk=contract.pk)
        _validate_payable_contract(contract)

        amount = expected_payment_amount(contract)
        if amount < OM_MIN_AMOUNT:
            # Orange rejette en dessous de 10 XOF. Sans ce garde-fou l'apporteur
            # recevait un 502 opaque venu de la passerelle, sur un devis dont le
            # net a verser est nul ou derisoire.
            raise PaymentConfirmationError(
                f"Le montant a regler ({amount} FCFA) est inferieur au minimum "
                f"Orange Money de {OM_MIN_AMOUNT} FCFA. Verifier le devis."
            )
        reference = f"HORUS-{contract.pk}-{uuid.uuid4().hex[:10].upper()}"

        # Les demandes precedentes passent en CANCELLED cote Horus, mais leur QR
        # reste payable chez Orange jusqu'a expiration : la reconciliation
        # reinterroge ces references, sans quoi un client payant l'ancien QR
        # verserait de l'argent sans jamais faire passer son contrat en PAYE.
        contract.payments.filter(
            status=Payment.Status.PENDING, method=Payment.Method.ORANGE_MONEY
        ).update(status=Payment.Status.CANCELLED)

        payment = Payment.objects.create(
            contract=contract,
            amount=amount,
            status=Payment.Status.PENDING,
            method=Payment.Method.ORANGE_MONEY,
            external_reference=reference,
            created_by=created_by if created_by and created_by.is_authenticated else None,
        )

        if contract.internal_status == Contract.InternalStatus.QUOTE_READY:
            contract.internal_status = Contract.InternalStatus.PAYMENT_PENDING
            contract.save(update_fields=["internal_status", "updated_at"])

    client = client or OmClient()
    qr_data = client.create_payment_qrcode(
        amount=amount,
        reference=reference,
        client_label=f"contrat-{contract.pk}",
    )
    qr_id = qr_data.get("qrId") if isinstance(qr_data, dict) else None
    if qr_id:
        payment.om_qr_id = str(qr_id)[:120]
        payment.save(update_fields=["om_qr_id", "updated_at"])
    return payment, qr_data


def check_om_payment(*, payment, client=None, revive_cancelled=False):
    """Interroge le statut OM (source de vérité) et synchronise le paiement.

    Confirmations idempotentes : rejouable sans effet de bord (callback + polling
    peuvent arriver en concurrence, le verrou de ligne sérialise).

    `revive_cancelled` autorise la reprise d'un paiement passé en CANCELLED par
    une ré-initiation : son QR restait payable chez Orange, et seule la
    réconciliation peut constater après coup qu'il a bel et bien été réglé.
    Réservé à `manage.py om_reconcile` — le parcours normal ne l'active pas.
    """
    assert_om_mock_allowed()
    client = client or OmClient()
    mismatch_message = None
    revivable = {Payment.Status.PENDING}
    if revive_cancelled:
        revivable.add(Payment.Status.CANCELLED)

    with transaction.atomic():
        payment = (
            Payment.objects.select_for_update().select_related("contract").get(pk=payment.pk)
        )
        if payment.status == Payment.Status.CONFIRMED:
            return payment
        if payment.method != Payment.Method.ORANGE_MONEY:
            raise PaymentConfirmationError("Ce paiement n'est pas un paiement Orange Money.")
        if payment.status not in revivable:
            return payment

        txn = client.find_transaction(
            reference=payment.external_reference, since=payment.created_at
        )
        if txn is None:
            return payment

        txn_status = (txn.get("status") or "").upper()
        if txn_status == OM_STATUS_SUCCESS:
            raw_amount = txn.get("amount")
            txn_amount = _parse_amount(raw_amount)
            if raw_amount is None or txn_amount <= 0:
                # ECHEC FERME : sans montant lisible, impossible de verifier que
                # ce qui a ete encaisse correspond au devis. Auparavant le
                # garde-fou etait saute et le paiement confirme a l'aveugle. On
                # laisse PENDING : la reconciliation rejouera avec une reponse
                # complete plutot que d'emettre une police non financee.
                logger.warning(
                    "Transaction OM %s SUCCESS sans montant exploitable (paiement %s) — "
                    "confirmation differee.",
                    txn.get("transactionId"),
                    payment.pk,
                )
                return payment
            if txn_amount != payment.amount:
                # Montant encaissé différent du devis : on n'auto-confirme pas,
                # à trancher manuellement (protection contre paiement partiel).
                # Le FAILED est committé AVANT de lever (hors du bloc atomique).
                payment.status = Payment.Status.FAILED
                payment.om_transaction_id = txn.get("transactionId") or ""
                payment.save(update_fields=["status", "om_transaction_id", "updated_at"])
                mismatch_message = (
                    f"Montant encaisse ({txn_amount} FCFA) different du devis "
                    f"({payment.amount} FCFA) — verification manuelle requise."
                )
            else:
                contract = Contract.objects.select_for_update().get(pk=payment.contract_id)
                if contract.payments.filter(status=Payment.Status.CONFIRMED).exists():
                    return payment

                payment.status = Payment.Status.CONFIRMED
                payment.om_transaction_id = txn.get("transactionId") or ""
                payment.confirmed_at = timezone.now()
                try:
                    payment.save(
                        update_fields=[
                            "status",
                            "om_transaction_id",
                            "confirmed_at",
                            "updated_at",
                        ]
                    )
                except IntegrityError as exc:
                    raise PaymentConfirmationError(
                        "Un paiement confirme existe deja pour ce contrat."
                    ) from exc

                contract.internal_status = Contract.InternalStatus.PAID
                # Prime totale ASS, pas le montant encaisse : voir
                # confirm_manual_payment.
                contract.ttc_ass = _contract_ttc(contract)
                contract.save(update_fields=["internal_status", "ttc_ass", "updated_at"])
                # Le contrat est paye : toute autre demande OM encore en attente
                # est caduque. Sans ce menage, la reconciliation d'un ancien QR
                # laissait derriere elle un PENDING orphelin que plus rien ne
                # concluait jamais.
                contract.payments.filter(
                    status=Payment.Status.PENDING, method=Payment.Method.ORANGE_MONEY
                ).exclude(pk=payment.pk).update(status=Payment.Status.CANCELLED)
                # Rafraîchit la relation en cache pour que l'appelant voie le nouvel état.
                payment.contract = contract
        elif payment.status != Payment.Status.PENDING:
            # Paiement deja CANCELLED : rien a redescendre, seul un SUCCESS
            # justifiait de le rouvrir.
            return payment
        elif txn_status in OM_TERMINAL_FAILURE_STATUSES:
            # CANCELLED / FAILED / REJECTED sont definitifs cote OM. Les statuts
            # transitoires (ACCEPTED, INITIATED, PENDING, PRE_INITIATED) laissent
            # le paiement en attente : OM garantit un statut final sous 24 h.
            payment.status = Payment.Status.FAILED
            payment.om_transaction_id = txn.get("transactionId") or ""
            payment.save(update_fields=["status", "om_transaction_id", "updated_at"])

    if mismatch_message:
        raise PaymentConfirmationError(mismatch_message)
    return payment
