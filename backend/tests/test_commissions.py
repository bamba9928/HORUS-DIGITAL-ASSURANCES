from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from accounts.models import User
from commissions.models import CommissionSnapshot
from commissions.services import (
    build_commission_snapshot_values,
    calculate_commission_amounts,
    net_a_verser,
)
from contracts.models import Contract
from integrations.ass.constants import ASS_POLICY_FEE
from organizations.models import Organization


def test_net_a_verser_is_ttc_minus_policy_fee():
    """Ce que l'apporteur paie via Orange Money avant emission."""
    assert ASS_POLICY_FEE == 3_000
    assert net_a_verser(ttc_ass=65_000) == 62_000


def test_default_rate_splits_between_contributor_horus_and_ass():
    result = calculate_commission_amounts(
        prime_nette=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )

    # L'apporteur retient le cout de police a la source.
    assert result["commission_total"] == 3_000
    assert result["commission_policy_fee_amount"] == 3_000
    assert result["commission_prime_rc_amount"] == 0
    assert result["commission_percent_used"] == Decimal("0")
    # Horus garde 20 % de la prime nette.
    assert result["ass_partner_commission_rate_used"] == Decimal("20")
    assert result["ass_partner_commission"] == 10_000
    assert result["marge_horus"] == 10_000
    # ASS recoit le solde du net a verser (62 000 - 10 000).
    assert result["montant_reverse_ass"] == 52_000
    # Le compte est juste : apporteur + Horus + ASS = TTC.
    assert 3_000 + 10_000 + 52_000 == 65_000


def test_tpc_rate_is_forty_percent():
    result = calculate_commission_amounts(
        prime_nette=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
        ass_partner_commission_rate=40,
    )

    assert result["ass_partner_commission"] == 20_000
    assert result["marge_horus"] == 20_000
    assert result["montant_reverse_ass"] == 42_000


def test_commission_is_rounded_half_up():
    result = calculate_commission_amounts(
        prime_nette=2_377,  # 20 % = 475,4
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=10_000,
    )
    assert result["ass_partner_commission"] == 475


def test_rejects_policy_fee_above_ttc():
    with pytest.raises(ValidationError, match="net a verser serait negatif"):
        calculate_commission_amounts(
            prime_nette=1_000,
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=2_000,
        )


def test_rejects_commission_above_collected_amount():
    """Garde-fou : une prime nette incoherente avec le TTC ne doit pas passer."""
    with pytest.raises(ValidationError, match="depasse le montant encaisse"):
        calculate_commission_amounts(
            prime_nette=200_000,  # 20 % = 40 000, pour un net a verser de 2 000
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=5_000,
        )


def test_rejects_negative_rate():
    with pytest.raises(ValidationError, match="ne peut pas etre negatif"):
        calculate_commission_amounts(
            prime_nette=50_000,
            ttc_ass=65_000,
            ass_partner_commission_rate=-1,
        )


@pytest.mark.django_db
def test_snapshot_does_not_depend_on_contributor_commission_fields():
    """La regle est uniforme : aucun bareme par compte n'existe plus."""
    organization = Organization.objects.create(name="Groupe Thies", code="THS")
    contributor = User.objects.create_user(
        username="apporteur-thies",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )
    values = build_commission_snapshot_values(
        prime_nette=contract.prime_rc_ass,
        cout_police_ass=contract.cout_police_ass,
        ttc_ass=contract.ttc_ass,
        ass_partner_commission_rate=20,
    )
    snapshot = CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        **values,
    )

    snapshot.refresh_from_db()
    assert snapshot.commission_total == 3_000
    assert snapshot.ass_partner_commission == 10_000
    assert snapshot.montant_reverse_ass == 52_000
    assert snapshot.marge_horus == 10_000
    assert snapshot.net_a_verser == 62_000


@pytest.mark.django_db
def test_snapshot_freezes_the_rate_used():
    """Le bareme peut changer : le contrat emis reste auditable."""
    organization = Organization.objects.create(name="Groupe Louga", code="LGA")
    contributor = User.objects.create_user(
        username="apporteur-louga",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )
    snapshot = CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        **build_commission_snapshot_values(
            prime_nette=50_000,
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=65_000,
            ass_partner_commission_rate=40,
        ),
    )

    snapshot.refresh_from_db()
    assert snapshot.ass_partner_commission_rate_used == Decimal("40.00")
    assert snapshot.ass_partner_commission == 20_000
