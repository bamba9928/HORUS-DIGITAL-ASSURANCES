from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from integrations.ass.constants import ASS_POLICY_FEE
from organizations.models import Organization


@pytest.mark.django_db
def test_auth_login_me_logout_flow():
    organization = Organization.objects.create(name="Groupe Auth", code="AUTH")
    User.objects.create_user(
        username="auth-user",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    client = APIClient()

    anonymous_response = client.get("/api/accounts/auth/me/")
    login_response = client.post(
        "/api/accounts/auth/login/",
        {"username": "auth-user", "password": "test-pass-123"},
        format="json",
    )
    me_response = client.get("/api/accounts/auth/me/")
    logout_response = client.post("/api/accounts/auth/logout/")
    logged_out_response = client.get("/api/accounts/auth/me/")

    assert anonymous_response.status_code == 200
    assert anonymous_response.data["authenticated"] is False
    assert login_response.status_code == 200
    assert login_response.data["authenticated"] is True
    assert login_response.data["user"]["username"] == "auth-user"
    assert me_response.data["authenticated"] is True
    assert logout_response.status_code == 200
    assert logged_out_response.data["authenticated"] is False


@pytest.mark.django_db
def test_auth_login_rejects_invalid_credentials():
    User.objects.create_user(
        username="invalid-login-user",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()

    response = client.post(
        "/api/accounts/auth/login/",
        {"username": "invalid-login-user", "password": "wrong-password"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["detail"] == "Identifiants invalides."


@pytest.mark.django_db
def test_admin_general_can_create_contributor_with_null_commissions():
    organization = Organization.objects.create(name="Groupe Dakar", code="DKR")
    admin = User.objects.create_user(
        username="admin-general-api",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-api",
            "password": "test-pass-123",
            "role": User.Role.CONTRIBUTOR,
            "organization": organization.id,
        },
        format="json",
    )

    assert response.status_code == 201
    contributor = User.objects.get(username="apporteur-api")
    assert contributor.organization == organization
    assert contributor.commission_percent_on_prime_rc is None
    assert contributor.commission_fixed_on_policy_fee is None
    assert response.data["has_configured_commission"] is False


@pytest.mark.django_db
def test_django_superuser_is_treated_as_general_admin():
    organization = Organization.objects.create(name="Groupe Superuser", code="SUPER")
    superuser = User.objects.create_superuser(
        username="django-superuser",
        password="test-pass-123",
    )
    client = APIClient()
    client.force_authenticate(superuser)

    response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-created-by-superuser",
            "password": "test-pass-123",
            "role": User.Role.CONTRIBUTOR,
            "organization": organization.id,
        },
        format="json",
    )

    assert superuser.is_admin_general is True
    assert response.status_code == 201


@pytest.mark.django_db
def test_admin_group_creates_user_only_in_own_group():
    own_group = Organization.objects.create(name="Groupe Thies", code="THS")
    other_group = Organization.objects.create(name="Groupe Louga", code="LGA")
    admin_group = User.objects.create_user(
        username="admin-group-api",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    own_response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-own-group",
            "password": "test-pass-123",
            "role": User.Role.CONTRIBUTOR,
        },
        format="json",
    )
    other_response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-other-group",
            "password": "test-pass-123",
            "role": User.Role.CONTRIBUTOR,
            "organization": other_group.id,
        },
        format="json",
    )

    assert own_response.status_code == 201
    assert own_response.data["organization"] == own_group.id
    assert other_response.status_code == 400
    assert User.objects.filter(username="apporteur-other-group").exists() is False


@pytest.mark.django_db
def test_admin_general_can_configure_contributor_commission():
    organization = Organization.objects.create(name="Groupe Kaolack", code="KLK")
    admin = User.objects.create_user(
        username="admin-general-commission",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    contributor = User.objects.create_user(
        username="apporteur-commission",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.patch(
        f"/api/accounts/users/{contributor.id}/commission/",
        {
            "commission_percent_on_prime_rc": "18.00",
            "commission_fixed_on_policy_fee": 2_000,
        },
        format="json",
    )

    assert response.status_code == 200
    contributor.refresh_from_db()
    assert contributor.commission_percent_on_prime_rc == Decimal("18.00")
    assert contributor.commission_fixed_on_policy_fee == 2_000
    assert contributor.has_configured_commission is True
    assert contributor.commission_configured_by == admin


@pytest.mark.django_db
def test_admin_group_cannot_configure_commission_in_another_group():
    own_group = Organization.objects.create(name="Groupe Ziguinchor", code="ZIG")
    other_group = Organization.objects.create(name="Groupe Matam", code="MTM")
    admin_group = User.objects.create_user(
        username="admin-group-commission",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="apporteur-other-commission",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.patch(
        f"/api/accounts/users/{other_contributor.id}/commission/",
        {
            "commission_percent_on_prime_rc": "18.00",
            "commission_fixed_on_policy_fee": 2_000,
        },
        format="json",
    )

    assert response.status_code == 403
    other_contributor.refresh_from_db()
    assert other_contributor.commission_percent_on_prime_rc is None
    assert other_contributor.commission_fixed_on_policy_fee is None


@pytest.mark.django_db
def test_contributor_cannot_modify_own_commission():
    organization = Organization.objects.create(name="Groupe Fatick", code="FTK")
    contributor = User.objects.create_user(
        username="apporteur-self-commission",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.patch(
        f"/api/accounts/users/{contributor.id}/commission/",
        {
            "commission_percent_on_prime_rc": "18.00",
            "commission_fixed_on_policy_fee": 2_000,
        },
        format="json",
    )

    assert response.status_code == 403
    contributor.refresh_from_db()
    assert contributor.has_configured_commission is False


@pytest.mark.django_db
def test_rejects_fixed_policy_fee_commission_above_ass_policy_fee_via_api():
    organization = Organization.objects.create(name="Groupe Saint-Louis", code="STL")
    admin = User.objects.create_user(
        username="admin-fixed-policy-fee",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    contributor = User.objects.create_user(
        username="apporteur-fixed-policy-fee",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.patch(
        f"/api/accounts/users/{contributor.id}/commission/",
        {
            "commission_percent_on_prime_rc": "10.00",
            "commission_fixed_on_policy_fee": ASS_POLICY_FEE + 1,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "commission_fixed_on_policy_fee" in response.data


@pytest.mark.django_db
def test_zero_commission_is_configured_via_api():
    organization = Organization.objects.create(name="Groupe Tambacounda", code="TMB")
    admin = User.objects.create_user(
        username="admin-zero-commission",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    contributor = User.objects.create_user(
        username="apporteur-zero-commission",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.patch(
        f"/api/accounts/users/{contributor.id}/commission/",
        {
            "commission_percent_on_prime_rc": "0.00",
            "commission_fixed_on_policy_fee": 0,
        },
        format="json",
    )

    assert response.status_code == 200
    contributor.refresh_from_db()
    assert contributor.commission_percent_on_prime_rc == Decimal("0.00")
    assert contributor.commission_fixed_on_policy_fee == 0
    assert contributor.has_configured_commission is True


@pytest.mark.django_db
def test_contributor_can_list_only_own_commission_snapshots():
    own_group = Organization.objects.create(name="Groupe Rufisque", code="RFS")
    other_group = Organization.objects.create(name="Groupe Kolda", code="KLD")
    contributor = User.objects.create_user(
        username="apporteur-snapshot",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="apporteur-other-snapshot",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    own_snapshot = create_commission_snapshot(own_group, contributor)
    create_commission_snapshot(other_group, other_contributor)
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get("/api/commissions/snapshots/")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [own_snapshot.id]


@pytest.mark.django_db
def test_finance_can_update_commission_snapshot_status_in_own_group():
    organization = Organization.objects.create(name="Groupe Finance", code="FIN")
    contributor = User.objects.create_user(
        username="apporteur-finance-snapshot",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    finance = User.objects.create_user(
        username="finance-snapshot",
        password="test-pass-123",
        role=User.Role.FINANCE,
        organization=organization,
    )
    snapshot = create_commission_snapshot(organization, contributor)
    client = APIClient()
    client.force_authenticate(finance)

    response = client.patch(
        f"/api/commissions/snapshots/{snapshot.id}/status/",
        {"status": CommissionSnapshot.Status.PAYABLE},
        format="json",
    )

    assert response.status_code == 200
    snapshot.refresh_from_db()
    assert snapshot.status == CommissionSnapshot.Status.PAYABLE


def create_commission_snapshot(organization, contributor):
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )
    return CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
        commission_percent_used=Decimal("18.00"),
        commission_fixed_policy_fee_used=2_000,
        commission_prime_rc_amount=9_000,
        commission_policy_fee_amount=2_000,
        commission_total=11_000,
        net_to_horus=54_000,
    )
