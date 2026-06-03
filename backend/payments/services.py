from django.core.exceptions import ValidationError
from django.utils import timezone

from contracts.models import Contract
from payments.models import Payment


class PaymentConfirmationError(ValueError):
    pass


def confirm_manual_payment(*, contract, amount=None, external_reference="", created_by=None):
    if contract.internal_status not in {
        Contract.InternalStatus.QUOTE_READY,
        Contract.InternalStatus.PAYMENT_PENDING,
        Contract.InternalStatus.PAID,
    }:
        raise PaymentConfirmationError("Le devis doit etre calcule avant le paiement.")

    if contract.prime_rc_ass is None:
        raise PaymentConfirmationError("Prime RC ASS manquante.")

    amount = int(amount or contract.prime_rc_ass + contract.cout_police_ass)
    if amount <= 0:
        raise ValidationError("Le montant du paiement doit etre positif.")

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
