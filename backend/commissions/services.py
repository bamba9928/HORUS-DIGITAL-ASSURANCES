from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError

from integrations.ass.constants import ASS_POLICY_FEE


class CommissionNotConfiguredError(ValueError):
    pass


def _round_half_up(value):
    return int(Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def calculate_commission_amounts(
    *,
    prime_rc_ass,
    ttc_ass,
    commission_percent_on_prime_rc,
    commission_fixed_on_policy_fee,
    cout_police_ass=ASS_POLICY_FEE,
    ass_partner_commission_rate=None,
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

    # Commission apporteur (versee par Horus a l'apporteur).
    commission_prime_rc_amount = _round_half_up(Decimal(prime_rc_ass) * percent / Decimal("100"))
    commission_policy_fee_amount = fixed_policy_fee
    commission_total = commission_prime_rc_amount + commission_policy_fee_amount

    if commission_total > int(ttc_ass):
        raise ValidationError("La commission totale ne peut pas depasser le TTC ASS.")

    # Revenu de Horus = frais de police + commission d'apport reversee par ASS sur
    # la PrimeRC (taux du contrat ASS ; 0 par defaut tant qu'il n'est pas confirme).
    # Le reste du TTC encaisse est reverse a ASS (prime assureur + taxes/fonds).
    if ass_partner_commission_rate is None:
        ass_partner_commission_rate = settings.ASS_PARTNER_COMMISSION_RATE
    ass_rate = Decimal(str(ass_partner_commission_rate))
    if ass_rate < 0:
        raise ValidationError("Le taux de commission d'apport ASS ne peut pas etre negatif.")
    ass_partner_commission = _round_half_up(Decimal(prime_rc_ass) * ass_rate / Decimal("100"))

    horus_gross_revenue = int(cout_police_ass) + ass_partner_commission
    montant_reverse_ass = int(ttc_ass) - horus_gross_revenue
    if montant_reverse_ass < 0:
        raise ValidationError(
            "Le revenu Horus (frais de police + commission d'apport ASS) "
            "ne peut pas depasser le TTC encaisse."
        )
    # Marge nette Horus. Peut etre negative si la commission apporteur depasse le
    # revenu Horus (signal d'un parametrage commission a revoir) : on l'enregistre
    # telle quelle plutot que de masquer le probleme.
    marge_horus = horus_gross_revenue - commission_total

    return {
        "prime_rc_ass": int(prime_rc_ass),
        "cout_police_ass": int(cout_police_ass),
        "ttc_ass": int(ttc_ass),
        "commission_percent_used": percent,
        "commission_fixed_policy_fee_used": fixed_policy_fee,
        "commission_prime_rc_amount": commission_prime_rc_amount,
        "commission_policy_fee_amount": commission_policy_fee_amount,
        "commission_total": commission_total,
        "ass_partner_commission": ass_partner_commission,
        "montant_reverse_ass": montant_reverse_ass,
        "marge_horus": marge_horus,
    }


def build_commission_snapshot_values(*, contributor, prime_rc_ass, ttc_ass, cout_police_ass=ASS_POLICY_FEE):
    return calculate_commission_amounts(
        prime_rc_ass=prime_rc_ass,
        ttc_ass=ttc_ass,
        cout_police_ass=cout_police_ass,
        commission_percent_on_prime_rc=contributor.commission_percent_on_prime_rc,
        commission_fixed_on_policy_fee=contributor.commission_fixed_on_policy_fee,
    )
