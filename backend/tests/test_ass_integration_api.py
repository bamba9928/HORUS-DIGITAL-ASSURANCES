import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from organizations.models import Organization


@pytest.mark.django_db
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_admin_general_can_read_mock_ass_stock_qr():
    admin = User.objects.create_user(
        username="admin-ass-stock",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.get("/api/integrations/ass/stock-qr/")

    assert response.status_code == 200
    assert response.data["mode"] == "mock"
    assert response.data["available_qr"] == 80
    assert response.data["operation_status"] == "SUCCESS"


@pytest.mark.django_db
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_contributor_cannot_read_ass_stock_qr():
    organization = Organization.objects.create(name="Groupe Stock QR", code="STOCK")
    contributor = User.objects.create_user(
        username="contributor-ass-stock",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get("/api/integrations/ass/stock-qr/")

    assert response.status_code == 403


@pytest.mark.django_db
@override_settings(
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=False,
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
)
def test_stock_qr_endpoint_does_not_call_real_ass_when_real_calls_are_disabled():
    finance = User.objects.create_user(
        username="finance-ass-stock",
        password="test-pass-123",
        role=User.Role.FINANCE,
    )
    client = APIClient()
    client.force_authenticate(finance)

    response = client.get("/api/integrations/ass/stock-qr/")

    assert response.status_code == 503
    assert "appels reels ass" in response.data["detail"].lower()


@pytest.mark.django_db
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_stock_qr_endpoint_requires_authentication():
    client = APIClient()

    response = client.get("/api/integrations/ass/stock-qr/")

    assert response.status_code in {401, 403}


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_verify_registration_with_ass_mock_in_debug_mode():
    client = APIClient()

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "ass-001"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["mode"] == "mock"
    assert response.data["operation_status"] == "SUCCESS"
    assert response.data["immatriculation"] == "ASS-001"
    assert response.data["is_registered"] is True


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_verify_registration_requires_registration_value():
    client = APIClient()

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": ""},
        format="json",
    )

    assert response.status_code == 400
    assert "immatriculation" in response.data


@pytest.mark.django_db
@override_settings(
    DEBUG=False,
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=False,
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
)
def test_verify_registration_does_not_call_real_ass_when_real_calls_are_disabled():
    finance = User.objects.create_user(
        username="finance-ass-verif",
        password="test-pass-123",
        role=User.Role.FINANCE,
    )
    client = APIClient()
    client.force_authenticate(finance)

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "AA-917-XQ"},
        format="json",
    )

    assert response.status_code == 503
    assert "appels reels ass" in response.data["detail"].lower()


@pytest.mark.django_db
@override_settings(DEBUG=False, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_verify_registration_requires_authentication_outside_debug():
    client = APIClient()

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "AA-917-XQ"},
        format="json",
    )

    assert response.status_code == 403
