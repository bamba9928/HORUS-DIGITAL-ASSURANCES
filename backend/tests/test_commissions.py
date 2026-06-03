from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from accounts.models import User
from commissions.models import CommissionSnapshot
from commissions.services import (
    CommissionNotConfiguredError,
    build_commission_snapshot_values,
    calculate_commission_amounts,
)
from contracts.models import Contract
from integrations.ass.constants import ASS_POLICY_FEE
from organizations.models import Organization


@pytest.mark.django_db
def test_contributor_is_created_with_null_commissions():
    organization = Organization.objects.create(name="Groupe Dakar", code="DKR")

    contributor = User.objects.create_user(
        username="apporteur",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )

    assert contributor.commission_percent_on_prime_rc is None
    assert contributor.commission_fixed_on_policy_fee is None
    assert contributor.has_configured_commission is False


def test_unconfigured_commission_blocks_calculation():
    with pytest.raises(CommissionNotConfiguredError, match="Commission non configuree"):
        calculate_commission_amounts(
            prime_rc_ass=50_000,
            ttc_ass=65_000,
            commission_percent_on_prime_rc=None,
            commission_fixed_on_policy_fee=0,
        )


def test_calculates_18_percent_on_prime_rc_plus_fixed_policy_fee():
    result = calculate_commission_amounts(
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
        commission_percent_on_prime_rc=Decimal("18"),
        commission_fixed_on_policy_fee=2_000,
    )

    assert ASS_POLICY_FEE == 3_000
    assert result["commission_prime_rc_amount"] == 9_000
    assert result["commission_policy_fee_amount"] == 2_000
    assert result["commission_total"] == 11_000
    assert result["net_to_horus"] == 54_000


def test_rejects_fixed_policy_fee_commission_above_ass_policy_fee():
    with pytest.raises(ValidationError, match="ne peut pas depasser"):
        calculate_commission_amounts(
            prime_rc_ass=50_000,
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=65_000,
            commission_percent_on_prime_rc=Decimal("18"),
            commission_fixed_on_policy_fee=3_001,
        )


@pytest.mark.django_db
def test_commission_snapshot_is_kept_after_contributor_rate_change():
    organization = Organization.objects.create(name="Groupe Thies", code="THS")
    contributor = User.objects.create_user(
        username="apporteur-thies",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
        commission_percent_on_prime_rc=Decimal("18"),
        commission_fixed_on_policy_fee=2_000,
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
        contributor=contributor,
        prime_rc_ass=contract.prime_rc_ass,
        cout_police_ass=contract.cout_police_ass,
        ttc_ass=contract.ttc_ass,
    )
    snapshot = CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        **values,
    )

    contributor.commission_percent_on_prime_rc = Decimal("5")
    contributor.commission_fixed_on_policy_fee = 0
    contributor.save()

    snapshot.refresh_from_db()
    assert snapshot.commission_percent_used == Decimal("18")
    assert snapshot.commission_fixed_policy_fee_used == 2_000
    assert snapshot.commission_total == 11_000
    assert snapshot.net_to_horus == 54_000
