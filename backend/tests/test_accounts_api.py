from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from integrations.ass.constants import ASS_POLICY_FEE
from organizations.models import Organization


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "http://127.0.0.1:3000"],
)
def test_auth_endpoint_allows_local_frontend_origins(client, origin):
    response = client.get("/api/accounts/auth/me/", HTTP_ORIGIN=origin)

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == origin


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
@pytest.mark.parametrize(
    ("identifier", "expected_username"),
    [
        ("multi-login-user", "multi-login-user"),
        ("multi.login@example.test", "multi-login-user"),
        ("771112233", "multi-login-user"),
        ("77 111-22-33", "multi-login-user"),
    ],
)
def test_auth_login_accepts_username_email_or_senegal_phone(
    identifier,
    expected_username,
):
    User.objects.create_user(
        username="multi-login-user",
        password="test-pass-123",
        email="multi.login@example.test",
        phone="771112233",
        role=User.Role.CONTRIBUTOR,
    )
    client = APIClient()

    response = client.post(
        "/api/accounts/auth/login/",
        {"identifier": identifier, "password": "test-pass-123"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["authenticated"] is True
    assert response.data["user"]["username"] == expected_username


@pytest.mark.django_db
def test_auth_login_keeps_username_payload_backward_compatible():
    User.objects.create_user(
        username="legacy-login-user",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
    )
    client = APIClient()

    response = client.post(
        "/api/accounts/auth/login/",
        {"username": "legacy-login-user", "password": "test-pass-123"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["authenticated"] is True


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
def test_user_creation_adds_personal_fields_and_generated_read_only_matricule():
    organization = Organization.objects.create(name="Groupe Identite", code="IDENT")
    admin = User.objects.create_user(
        username="admin-general-identite",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

    first_response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-identite-1",
            "password": "Strong!Pass2026-A",
            "first_name": "Awa",
            "last_name": "Diop",
            "email": "awa@example.test",
            "phone": "77 111-22-33",
            "address": "Dakar Plateau",
            "matricule": "MATRICULE-IMPOSE",
            "role": User.Role.CONTRIBUTOR,
            "organization": organization.id,
        },
        format="json",
    )
    second_response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-identite-2",
            "password": "Strong!Pass2026-B",
            "role": User.Role.CONTRIBUTOR,
            "organization": organization.id,
        },
        format="json",
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.data["phone"] == "771112233"
    assert first_response.data["address"] == "Dakar Plateau"
    assert first_response.data["matricule"].startswith("HOR-")
    assert first_response.data["matricule"] != "MATRICULE-IMPOSE"
    assert first_response.data["matricule"] != second_response.data["matricule"]


@pytest.mark.django_db
def test_admin_group_can_update_personal_info_only_inside_own_group():
    own_group = Organization.objects.create(name="Groupe Personnel", code="PERS")
    other_group = Organization.objects.create(name="Groupe Externe", code="EXT")
    admin_group = User.objects.create_user(
        username="admin-group-personnel",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    own_user = User.objects.create_user(
        username="own-user-personnel",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=own_group,
    )
    other_user = User.objects.create_user(
        username="other-user-personnel",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    own_response = client.patch(
        f"/api/accounts/users/{own_user.id}/",
        {
            "first_name": "Fatou",
            "phone": "77 111 22 33",
            "address": "Thies",
        },
        format="json",
    )
    other_response = client.patch(
        f"/api/accounts/users/{other_user.id}/",
        {"first_name": "Interdit"},
        format="json",
    )

    assert own_response.status_code == 200
    assert own_response.data["first_name"] == "Fatou"
    assert own_response.data["phone"] == "771112233"
    assert own_response.data["address"] == "Thies"
    assert other_response.status_code == 403
    other_user.refresh_from_db()
    assert other_user.first_name == ""


@pytest.mark.django_db
def test_admin_group_can_update_own_personal_info_without_changing_access():
    organization = Organization.objects.create(name="Groupe Admin Personnel", code="ADP")
    admin_group = User.objects.create_user(
        username="admin-group-own-personnel",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    personal_response = client.patch(
        f"/api/accounts/users/{admin_group.id}/",
        {"first_name": "Aminata", "address": "Dakar"},
        format="json",
    )
    access_response = client.patch(
        f"/api/accounts/users/{admin_group.id}/",
        {"is_active": False},
        format="json",
    )

    assert personal_response.status_code == 200
    assert personal_response.data["first_name"] == "Aminata"
    assert access_response.status_code == 403
    admin_group.refresh_from_db()
    assert admin_group.is_active is True


@pytest.mark.django_db
def test_non_admin_cannot_update_own_personal_info():
    organization = Organization.objects.create(name="Groupe Profil Lecture", code="PRL")
    contributor = User.objects.create_user(
        username="contributor-read-only-profile",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
        first_name="Initial",
    )
    client = APIClient()
    client.force_authenticate(contributor)

    profile_response = client.patch(
        "/api/accounts/profile/",
        {"first_name": "Modifie"},
        format="json",
    )
    detail_response = client.patch(
        f"/api/accounts/users/{contributor.id}/",
        {"first_name": "Modifie"},
        format="json",
    )

    assert profile_response.status_code == 403
    assert detail_response.status_code == 403
    contributor.refresh_from_db()
    assert contributor.first_name == "Initial"


@pytest.mark.django_db
def test_user_creation_rejects_invalid_or_duplicate_login_identities():
    organization = Organization.objects.create(name="Groupe Unicite", code="UNIQ")
    admin = User.objects.create_user(
        username="admin-general-unicite",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    User.objects.create_user(
        username="existing-login-identity",
        password="test-pass-123",
        email="existing@example.test",
        phone="771234567",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin)
    base_payload = {
        "password": "Strong!Pass2026-C",
        "role": User.Role.CONTRIBUTOR,
        "organization": organization.id,
    }

    invalid_phone = client.post(
        "/api/accounts/users/",
        {
            **base_payload,
            "username": "invalid-phone-user",
            "phone": "661234567",
        },
        format="json",
    )
    duplicate_phone = client.post(
        "/api/accounts/users/",
        {
            **base_payload,
            "username": "duplicate-phone-user",
            "phone": "77 123 45 67",
        },
        format="json",
    )
    duplicate_email = client.post(
        "/api/accounts/users/",
        {
            **base_payload,
            "username": "duplicate-email-user",
            "email": "EXISTING@example.test",
        },
        format="json",
    )

    assert invalid_phone.status_code == 400
    assert "commencer par 7" in invalid_phone.data["phone"][0]
    assert duplicate_phone.status_code == 400
    assert "déjà utilisé" in duplicate_phone.data["phone"][0]
    assert duplicate_email.status_code == 400
    assert "déjà utilisée" in duplicate_email.data["email"][0]


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
def test_superuser_is_serialized_with_effective_general_admin_role():
    superuser = User.objects.create_superuser(
        username="effective-role-superuser",
        password="test-pass-123",
        email="effective@example.test",
    )
    client = APIClient()
    client.force_authenticate(superuser)

    response = client.get("/api/accounts/auth/me/")

    assert response.status_code == 200
    assert response.data["user"]["role"] == User.Role.ADMIN_GENERAL


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
        montant_reverse_ass=62_000,
        marge_horus=-8_000,
    )


@pytest.mark.django_db
def test_admin_group_cannot_demote_or_deactivate_admins_of_own_group():
    organization = Organization.objects.create(name="Groupe Escalade", code="ESC")
    admin_group = User.objects.create_user(
        username="admin-group-escalade",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    admin_general = User.objects.create_user(
        username="admin-general-escalade",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
        organization=organization,
    )
    other_admin_group = User.objects.create_user(
        username="autre-admin-group-escalade",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    demote_general = client.patch(
        f"/api/accounts/users/{admin_general.id}/",
        {"role": User.Role.CONTRIBUTOR, "is_active": False},
        format="json",
    )
    demote_group = client.patch(
        f"/api/accounts/users/{other_admin_group.id}/",
        {"role": User.Role.FINANCE},
        format="json",
    )

    assert demote_general.status_code == 403
    assert demote_group.status_code == 403
    admin_general.refresh_from_db()
    other_admin_group.refresh_from_db()
    assert admin_general.role == User.Role.ADMIN_GENERAL
    assert admin_general.is_active is True
    assert other_admin_group.role == User.Role.ADMIN_GROUP


@pytest.mark.django_db
def test_admin_group_can_still_view_admins_of_own_group():
    organization = Organization.objects.create(name="Groupe Lecture", code="LECT")
    admin_group = User.objects.create_user(
        username="admin-group-lecture",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    admin_general = User.objects.create_user(
        username="admin-general-lecture",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.get(f"/api/accounts/users/{admin_general.id}/")

    assert response.status_code == 200
    assert response.data["username"] == "admin-general-lecture"


@pytest.mark.django_db
def test_user_creation_rejects_common_password():
    organization = Organization.objects.create(name="Groupe MotDePasse", code="MDP")
    admin = User.objects.create_user(
        username="admin-general-mdp",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.post(
        "/api/accounts/users/",
        {
            "username": "apporteur-mdp",
            "password": "password123",
            "role": User.Role.CONTRIBUTOR,
            "organization": organization.id,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "password" in response.data
    assert User.objects.filter(username="apporteur-mdp").exists() is False


@pytest.mark.django_db
def test_change_password_rejects_common_password():
    user = User.objects.create_user(
        username="user-change-mdp",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
    )
    client = APIClient()
    client.force_authenticate(user)

    response = client.post(
        "/api/accounts/profile/change-password/",
        {"current_password": "test-pass-123", "new_password": "password123"},
        format="json",
    )

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.check_password("test-pass-123") is True


@pytest.mark.django_db
def test_auth_login_is_throttled_after_repeated_attempts():
    User.objects.create_user(
        username="throttle-user",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
    )
    client = APIClient()

    responses = [
        client.post(
            "/api/accounts/auth/login/",
            {"username": "throttle-user", "password": "wrong-password"},
            format="json",
        )
        for _ in range(11)
    ]

    assert all(response.status_code == 400 for response in responses[:10])
    assert responses[10].status_code == 429


@pytest.mark.django_db
def test_commission_status_transitions_are_enforced():
    organization = Organization.objects.create(name="Groupe Transitions", code="TRX")
    contributor = User.objects.create_user(
        username="apporteur-transitions",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    finance = User.objects.create_user(
        username="finance-transitions",
        password="test-pass-123",
        role=User.Role.FINANCE,
        organization=organization,
    )
    snapshot = create_commission_snapshot(organization, contributor)
    client = APIClient()
    client.force_authenticate(finance)

    def patch_status(status):
        return client.patch(
            f"/api/commissions/snapshots/{snapshot.id}/status/",
            {"status": status},
            format="json",
        )

    # CANCELLED est reserve a l'annulation du contrat.
    cancelled_response = patch_status(CommissionSnapshot.Status.CANCELLED)
    assert cancelled_response.status_code == 400

    # PENDING -> PAID : autorise, trace le paiement.
    paid_response = patch_status(CommissionSnapshot.Status.PAID)
    assert paid_response.status_code == 200
    assert paid_response.data["paid_by_username"] == "finance-transitions"
    snapshot.refresh_from_db()
    assert snapshot.status == CommissionSnapshot.Status.PAID
    assert snapshot.paid_at is not None
    assert snapshot.paid_by == finance

    # PAID -> PENDING : transition interdite.
    rollback_response = patch_status(CommissionSnapshot.Status.PENDING)
    assert rollback_response.status_code == 400
    snapshot.refresh_from_db()
    assert snapshot.status == CommissionSnapshot.Status.PAID

    # PAID -> DISPUTED : contestation possible, le paiement reste trace.
    disputed_response = patch_status(CommissionSnapshot.Status.DISPUTED)
    assert disputed_response.status_code == 200
    snapshot.refresh_from_db()
    assert snapshot.status == CommissionSnapshot.Status.DISPUTED
    assert snapshot.paid_at is not None
