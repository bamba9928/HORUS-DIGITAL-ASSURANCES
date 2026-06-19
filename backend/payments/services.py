from django.db import IntegrityError, transaction
from django.utils import timezone

from contracts.models import Contract
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
