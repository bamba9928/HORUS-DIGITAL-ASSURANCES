import pytest
from django.core import mail
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from organizations.models import Organization


def organization_payload(**overrides):
    payload = {
        "name": "Cabinet Diop Assurance",
        "code": "ORG-0001",
        "legal_person_type": Organization.LegalPersonType.MORALE,
        "organization_type": Organization.OrganizationType.AGENCY,
        "status": Organization.Status.ACTIVE,
        "description": "Agence partenaire basée à Dakar",
        "legal_form": "SARL",
        "ninea_rccm": "SN-DKR-2024-A-00001",
        "insurance_license_number": "AGR-ASS-001",
        "country": "Sénégal",
        "currency": "FCFA",
        "address": "Liberté 6, Dakar",
        "city": "Dakar",
        "region": "Dakar",
        "phone": "+221 77 000 00 00",
        "professional_email": "contact@agence.test",
        "website": "agence.test",
        "contact_access_mode": Organization.ContactAccessMode.NONE,
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def admin_general():
    return User.objects.create_user(
        username="admin-general-organizations",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )


@pytest.fixture
def admin_general_client(admin_general):
    client = APIClient()
    client.force_authenticate(admin_general)
    return client


@pytest.mark.django_db
def test_only_admin_general_can_create_group():
    own_group = Organization.objects.create(name="Groupe Existant", code="EXIST")
    admin_general = User.objects.create_user(
        username="admin-general-groups",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    admin_group = User.objects.create_user(
        username="admin-group-groups",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    contributor = User.objects.create_user(
        username="contributor-groups",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=own_group,
    )

    general_client = APIClient()
    general_client.force_authenticate(admin_general)
    group_client = APIClient()
    group_client.force_authenticate(admin_group)
    contributor_client = APIClient()
    contributor_client.force_authenticate(contributor)

    general_response = general_client.post(
        "/api/organizations/",
        organization_payload(
            name="Nouveau Groupe",
            code="NEW-GROUP",
            professional_email="nouveau-groupe@example.test",
        ),
        format="json",
    )
    group_response = group_client.post(
        "/api/organizations/",
        {"name": "Groupe Interdit", "code": "FORBIDDEN-GROUP"},
        format="json",
    )
    contributor_response = contributor_client.post(
        "/api/organizations/",
        {"name": "Groupe Interdit 2", "code": "FORBIDDEN-CONTRIB"},
        format="json",
    )

    assert general_response.status_code == 201
    assert group_response.status_code == 403
    assert contributor_response.status_code == 403
    assert Organization.objects.filter(code="NEW-GROUP").exists() is True
    assert Organization.objects.filter(code="FORBIDDEN-GROUP").exists() is False
    assert Organization.objects.filter(code="FORBIDDEN-CONTRIB").exists() is False


@pytest.mark.django_db
def test_admin_general_creates_complete_legal_entity(admin_general_client):
    response = admin_general_client.post(
        "/api/organizations/",
        organization_payload(),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["legal_person_type"] == Organization.LegalPersonType.MORALE
    assert response.data["phone"] == "+221770000000"
    assert response.data["website"] == "https://agence.test"
    assert response.data["is_active"] is True
    organization = Organization.objects.get(code="ORG-0001")
    assert organization.ninea_rccm == "SN-DKR-2024-A-00001"
    assert organization.organization_type == Organization.OrganizationType.AGENCY


@pytest.mark.django_db
def test_admin_general_creates_individual_suspended_organization(admin_general_client):
    response = admin_general_client.post(
        "/api/organizations/",
        organization_payload(
            name="Awa Diop",
            code="PHY-0001",
            legal_person_type=Organization.LegalPersonType.PHYSIQUE,
            organization_type=Organization.OrganizationType.CONTRIBUTOR,
            status=Organization.Status.SUSPENDED,
            legal_form="",
            ninea_rccm="",
            insurance_license_number="",
            professional_email="awa.diop@example.test",
        ),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["status"] == Organization.Status.SUSPENDED
    assert response.data["is_active"] is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    "missing_field",
    [
        "name",
        "code",
        "legal_person_type",
        "organization_type",
        "status",
        "country",
        "currency",
        "address",
        "city",
        "phone",
        "professional_email",
    ],
)
def test_organization_required_fields_are_explicitly_validated(
    admin_general_client,
    missing_field,
):
    payload = organization_payload()
    payload.pop(missing_field)

    response = admin_general_client.post(
        "/api/organizations/",
        payload,
        format="json",
    )

    assert response.status_code == 400
    assert missing_field in response.data


@pytest.mark.django_db
def test_organization_rejects_invalid_senegal_phone(admin_general_client):
    response = admin_general_client.post(
        "/api/organizations/",
        organization_payload(phone="+221 33 000 00 00"),
        format="json",
    )

    assert response.status_code == 400
    assert "format sénégalais" in response.data["phone"][0]


@pytest.mark.django_db
def test_temporary_password_provisions_contact_account(admin_general_client):
    response = admin_general_client.post(
        "/api/organizations/",
        organization_payload(
            contact_first_name="Aminata",
            contact_last_name="Fall",
            contact_email="aminata.fall@example.test",
            contact_phone="+221 77 111 22 33",
            contact_role=User.Role.ADMIN_GROUP,
            contact_access_mode=Organization.ContactAccessMode.TEMPORARY_PASSWORD,
            contact_temporary_password="Strong!Temporary2026",
        ),
        format="json",
    )

    assert response.status_code == 201
    contact = User.objects.get(email="aminata.fall@example.test")
    assert contact.organization_id == response.data["id"]
    assert response.data["contact_username"] == "contact-org-0001"
    assert response.data["user_count"] == 1
    assert contact.username == "contact-org-0001"
    assert contact.phone == "771112233"
    assert contact.role == User.Role.ADMIN_GROUP
    assert contact.check_password("Strong!Temporary2026") is True
    assert "contact_temporary_password" not in response.data

    login_client = APIClient()
    login_response = login_client.post(
        "/api/accounts/auth/login/",
        {
            "identifier": "contact-org-0001",
            "password": "Strong!Temporary2026",
        },
        format="json",
    )
    assert login_response.status_code == 200


@pytest.mark.django_db
@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="https://app.horus.test",
)
def test_email_invitation_allows_contact_to_define_password(admin_general_client):
    response = admin_general_client.post(
        "/api/organizations/",
        organization_payload(
            contact_first_name="Moussa",
            contact_last_name="Ndiaye",
            contact_email="moussa.ndiaye@example.test",
            contact_phone="78 111 22 33",
            contact_role=User.Role.CONTRIBUTOR,
            contact_access_mode=Organization.ContactAccessMode.EMAIL_INVITATION,
        ),
        format="json",
    )

    assert response.status_code == 201
    assert len(mail.outbox) == 1
    assert "Votre identifiant est contact-org-0001." in mail.outbox[0].body
    invitation_url = mail.outbox[0].body.split("ici : ", 1)[1].strip()
    assert invitation_url.startswith("https://app.horus.test/invite?")
    query = invitation_url.split("?", 1)[1]
    params = dict(item.split("=", 1) for item in query.split("&"))

    contact = User.objects.get(email="moussa.ndiaye@example.test")
    assert contact.has_usable_password() is False

    invitation_client = APIClient()
    invitation_response = invitation_client.post(
        "/api/accounts/auth/invitations/accept/",
        {
            "uid": params["uid"],
            "token": params["token"],
            "password": "Strong!Invitation2026",
        },
        format="json",
    )

    assert invitation_response.status_code == 200
    contact.refresh_from_db()
    assert contact.check_password("Strong!Invitation2026") is True

    replay_response = invitation_client.post(
        "/api/accounts/auth/invitations/accept/",
        {
            "uid": params["uid"],
            "token": params["token"],
            "password": "Another!Password2026",
        },
        format="json",
    )
    assert replay_response.status_code == 400


@pytest.mark.django_db
def test_only_admin_general_can_update_group():
    organization = Organization.objects.create(name="Groupe Initial", code="INITIAL")
    admin_general = User.objects.create_user(
        username="admin-general-update-group",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    admin_group = User.objects.create_user(
        username="admin-group-update-group",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    group_client = APIClient()
    group_client.force_authenticate(admin_group)

    forbidden_response = group_client.patch(
        f"/api/organizations/{organization.id}/",
        {"name": "Modification Interdite"},
        format="json",
    )

    assert forbidden_response.status_code == 403
    organization.refresh_from_db()
    assert organization.name == "Groupe Initial"

    general_client = APIClient()
    general_client.force_authenticate(admin_general)
    allowed_response = general_client.patch(
        f"/api/organizations/{organization.id}/",
        {"name": "Groupe Modifie"},
        format="json",
    )

    assert allowed_response.status_code == 200
    organization.refresh_from_db()
    assert organization.name == "Groupe Modifie"


@pytest.mark.django_db
def test_status_update_synchronizes_legacy_active_flag(admin_general_client):
    organization = Organization.objects.create(
        name="Groupe Statut",
        code="STATUS",
    )

    response = admin_general_client.patch(
        f"/api/organizations/{organization.id}/",
        {"status": Organization.Status.SUSPENDED},
        format="json",
    )

    assert response.status_code == 200
    organization.refresh_from_db()
    assert organization.status == Organization.Status.SUSPENDED
    assert organization.is_active is False


@pytest.mark.django_db
def test_admin_group_can_only_view_own_group():
    own_group = Organization.objects.create(name="Groupe Propre", code="OWN")
    Organization.objects.create(name="Groupe Autre", code="OTHER")
    admin_group = User.objects.create_user(
        username="admin-group-view-own",
        password="test-pass-123",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.get("/api/organizations/")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [own_group.id]
