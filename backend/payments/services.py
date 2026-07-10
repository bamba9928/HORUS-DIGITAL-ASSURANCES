import uuid

from django.db import IntegrityError, transaction
from django.utils import timezone

from contracts.models import Contract
from integrations.orange_money.client import OmClient
from integrations.orange_money.constants import (
    OM_STATUS_EXPIRED,
    OM_STATUS_FAILED,
    OM_STATUS_SUCCESS,
)
from payments.models import Payment


class PaymentConfirmationError(ValueError):
    pass


def expected_payment_amount(contract):
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
    # de tarification flotte sera connu (rc.flotte.request bloque cote ASS au
    # 2026-06-11 : bug serveur ga_def_recours).
    return contract.prime_rc_ass + contract.cout_police_ass


def _parse_amount(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


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
    contract.ttc_ass = amount
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


@transaction.atomic
def initiate_om_payment(*, contract, created_by=None, client=None):
    """Crée un paiement Orange Money PENDING et la demande QR côté OM.

    Retourne (payment, qr_data). Les initiations précédentes non confirmées
    du même contrat sont annulées (une seule demande active à la fois).
    """
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    _validate_payable_contract(contract)

    amount = expected_payment_amount(contract)
    reference = f"HORUS-{contract.pk}-{uuid.uuid4().hex[:10].upper()}"

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
    return payment, qr_data


def check_om_payment(*, payment, client=None):
    """Interroge le statut OM (source de vérité) et synchronise le paiement.

    Confirmations idempotentes : rejouable sans effet de bord (callback + polling
    peuvent arriver en concurrence, le verrou de ligne sérialise).
    """
    client = client or OmClient()
    mismatch_message = None

    with transaction.atomic():
        payment = (
            Payment.objects.select_for_update().select_related("contract").get(pk=payment.pk)
        )
        if payment.status == Payment.Status.CONFIRMED:
            return payment
        if payment.method != Payment.Method.ORANGE_MONEY:
            raise PaymentConfirmationError("Ce paiement n'est pas un paiement Orange Money.")
        if payment.status != Payment.Status.PENDING:
            return payment

        txn = client.find_transaction(
            reference=payment.external_reference, since=payment.created_at
        )
        if txn is None:
            return payment

        txn_status = (txn.get("status") or "").upper()
        if txn_status == OM_STATUS_SUCCESS:
            txn_amount = _parse_amount(txn.get("amount"))
            if txn_amount and txn_amount != payment.amount:
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
                contract.ttc_ass = payment.amount
                contract.save(update_fields=["internal_status", "ttc_ass", "updated_at"])
                # Rafraîchit la relation en cache pour que l'appelant voie le nouvel état.
                payment.contract = contract
        elif txn_status in {OM_STATUS_FAILED, OM_STATUS_EXPIRED}:
            payment.status = Payment.Status.FAILED
            payment.om_transaction_id = txn.get("transactionId") or ""
            payment.save(update_fields=["status", "om_transaction_id", "updated_at"])

    if mismatch_message:
        raise PaymentConfirmationError(mismatch_message)
    return payment
