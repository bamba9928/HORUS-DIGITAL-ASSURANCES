from django.db import transaction
from django.utils import timezone

from contracts.models import Contract
from payments.models import Payment


class PaymentConfirmationError(ValueError):
    pass


@transaction.atomic
def confirm_manual_payment(*, contract, amount=None, external_reference="", created_by=None):
    if contract.internal_status not in {
        Contract.InternalStatus.QUOTE_READY,
        Contract.InternalStatus.PAYMENT_PENDING,
    }:
        raise PaymentConfirmationError("Le devis doit etre calcule avant le paiement.")

    if contract.prime_rc_ass is None:
        raise PaymentConfirmationError("Prime RC ASS manquante.")

    if contract.payments.filter(status=Payment.Status.CONFIRMED).exists():
        raise PaymentConfirmationError("Un paiement confirme existe deja pour ce contrat.")

    expected_amount = contract.prime_rc_ass + contract.cout_police_ass
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

    payment = Payment.objects.create(
        contract=contract,
        amount=amount,
        status=Payment.Status.CONFIRMED,
        external_reference=external_reference,
        confirmed_at=timezone.now(),
        created_by=created_by if created_by and created_by.is_authenticated else None,
    )
    contract.internal_status = Contract.InternalStatus.PAID
    contract.ttc_ass = amount
    contract.save(update_fields=["internal_status", "ttc_ass", "updated_at"])
    return payment


def has_confirmed_payment(contract):
    return contract.payments.filter(status=Payment.Status.CONFIRMED).exists()
