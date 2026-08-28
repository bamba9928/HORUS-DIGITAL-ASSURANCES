from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError

from integrations.ass.constants import ASS_POLICY_FEE
from integrations.ass.referentials import HORUS_COMMISSION_RATE_DEFAULT


def _round_half_up(value):
    return int(Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def net_a_verser(*, ttc_ass, cout_police_ass=ASS_POLICY_FEE):
    """Montant que l'apporteur paie via Orange Money avant emission.

    L'apporteur retient le cout de police a la source : il ne verse que le
    reste. C'est le seul montant qui transite reellement par la plateforme.
    """
    return int(ttc_ass) - int(cout_police_ass)


def calculate_commission_amounts(
    *,
    prime_nette,
    ttc_ass,
    cout_police_ass=ASS_POLICY_FEE,
    ass_partner_commission_rate=HORUS_COMMISSION_RATE_DEFAULT,
):
    """Ventile un contrat entre l'apporteur, Horus et ASS.

    Regle du 2026-08-28, uniforme sur TOUS les comptes :

    - l'apporteur retient le cout de police A LA SOURCE. Il ne verse que
      `TTC - cout de police` (le "net a verser", encaisse par Orange Money avant
      emission), et sa remuneration est donc exactement le cout de police —
      acquis sans aucun mouvement de fonds en retour ;
    - Horus garde la commission d'apport ASS : `prime nette x taux` (20 %, 40 %
      sur les genres TPC) ;
    - le solde part a ASS, reglement HORS PLATEFORME :
      `TTC - cout de police - commission`.

    Il n'y a plus de taux par apporteur : les champs `commission_*` du compte
    utilisateur ne participent plus au calcul. Les cles `commission_*` renvoyees
    ici decrivent la retenue de l'apporteur, conservee sous les noms historiques
    du modele CommissionSnapshot.
    """
    prime_nette = int(prime_nette)
    ttc_ass = int(ttc_ass)
    cout_police_ass = int(cout_police_ass)

    if prime_nette < 0 or ttc_ass < 0 or cout_police_ass < 0:
        raise ValidationError("Les montants ASS ne peuvent pas etre negatifs.")

    rate = Decimal(str(ass_partner_commission_rate))
    if rate < 0:
        raise ValidationError("Le taux de commission d'apport ne peut pas etre negatif.")

    if cout_police_ass > ttc_ass:
        raise ValidationError(
            "Le cout de police ne peut pas depasser le TTC : le net a verser serait negatif."
        )

    # Retenue a la source de l'apporteur = la totalite du cout de police.
    commission_apporteur = cout_police_ass
    montant_encaisse = net_a_verser(ttc_ass=ttc_ass, cout_police_ass=cout_police_ass)

    # Revenu de Horus : la commission d'apport ASS sur la prime nette.
    ass_partner_commission = _round_half_up(Decimal(prime_nette) * rate / Decimal("100"))

    montant_reverse_ass = montant_encaisse - ass_partner_commission
    if montant_reverse_ass < 0:
        raise ValidationError(
            "La commission d'apport depasse le montant encaisse : "
            f"{ass_partner_commission} FCFA pour un net a verser de {montant_encaisse} FCFA."
        )

    return {
        "prime_rc_ass": prime_nette,
        "cout_police_ass": cout_police_ass,
        "ttc_ass": ttc_ass,
        # Retenue apporteur : forfaitaire, plus aucune part proportionnelle.
        "commission_percent_used": Decimal("0"),
        "commission_fixed_policy_fee_used": commission_apporteur,
        "commission_prime_rc_amount": 0,
        "commission_policy_fee_amount": commission_apporteur,
        "commission_total": commission_apporteur,
        "ass_partner_commission_rate_used": rate,
        "ass_partner_commission": ass_partner_commission,
        "montant_reverse_ass": montant_reverse_ass,
        # Horus ne touche que la commission d'apport : le cout de police est
        # integralement retenu par l'apporteur.
        "marge_horus": ass_partner_commission,
    }


def build_commission_snapshot_values(
    *,
    prime_nette,
    ttc_ass,
    cout_police_ass=ASS_POLICY_FEE,
    ass_partner_commission_rate=HORUS_COMMISSION_RATE_DEFAULT,
):
    return calculate_commission_amounts(
        prime_nette=prime_nette,
        ttc_ass=ttc_ass,
        cout_police_ass=cout_police_ass,
        ass_partner_commission_rate=ass_partner_commission_rate,
    )
