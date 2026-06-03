from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError

from integrations.ass.constants import ASS_POLICY_FEE


class CommissionNotConfiguredError(ValueError):
    pass


def calculate_commission_amounts(
    *,
    prime_rc_ass,
    ttc_ass,
    commission_percent_on_prime_rc,
    commission_fixed_on_policy_fee,
    cout_police_ass=ASS_POLICY_FEE,
):
    if commission_percent_on_prime_rc is None or commission_fixed_on_policy_fee is None:
        raise CommissionNotConfiguredError("Commission non configuree pour cet apporteur.")

    if prime_rc_ass < 0 or ttc_ass < 0 or cout_police_ass < 0:
        raise ValidationError("Les montants ASS ne peuvent pas etre negatifs.")

    percent = Decimal(str(commission_percent_on_prime_rc))
    if percent < 0:
        raise ValidationError("Le pourcentage de commission ne peut pas etre negatif.")

    fixed_policy_fee = int(commission_fixed_on_policy_fee)
    if fixed_policy_fee < 0:
        raise ValidationError("La commission fixe ne peut pas etre negative.")
    if fixed_policy_fee > cout_police_ass:
        raise ValidationError(
            f"La commission fixe sur cout de police ne peut pas depasser {cout_police_ass} FCFA."
        )

    commission_prime_rc_amount = int(
        (Decimal(prime_rc_ass) * percent / Decimal("100")).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )
    commission_policy_fee_amount = fixed_policy_fee
    commission_total = commission_prime_rc_amount + commission_policy_fee_amount
    net_to_horus = int(ttc_ass) - commission_total

    if net_to_horus < 0:
        raise ValidationError("La commission totale ne peut pas depasser le TTC ASS.")

    return {
        "prime_rc_ass": int(prime_rc_ass),
        "cout_police_ass": int(cout_police_ass),
        "ttc_ass": int(ttc_ass),
        "commission_percent_used": percent,
        "commission_fixed_policy_fee_used": fixed_policy_fee,
        "commission_prime_rc_amount": commission_prime_rc_amount,
        "commission_policy_fee_amount": commission_policy_fee_amount,
        "commission_total": commission_total,
        "net_to_horus": net_to_horus,
    }


def build_commission_snapshot_values(*, contributor, prime_rc_ass, ttc_ass, cout_police_ass=ASS_POLICY_FEE):
    return calculate_commission_amounts(
        prime_rc_ass=prime_rc_ass,
        ttc_ass=ttc_ass,
        cout_police_ass=cout_police_ass,
        commission_percent_on_prime_rc=contributor.commission_percent_on_prime_rc,
        commission_fixed_on_policy_fee=contributor.commission_fixed_on_policy_fee,
    )
