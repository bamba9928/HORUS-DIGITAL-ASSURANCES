from unittest.mock import patch

import pytest
import requests
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
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
@pytest.mark.parametrize("role", [User.Role.ADMIN_GROUP, User.Role.FINANCE])
def test_non_admin_general_roles_cannot_read_ass_stock_qr(role):
    # ASS est un fournisseur technique : seul l'admin general y a accès (ni
    # l'admin de groupe, ni finance) — voir canViewAssIntegration cote front.
    organization = Organization.objects.create(
        name=f"Groupe Stock QR {role}", code=f"STOCK-{role}"
    )
    user = User.objects.create_user(
        username=f"user-ass-stock-{role.lower()}",
        password="test-pass-123",
        role=role,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(user)

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
    admin = User.objects.create_user(
        username="admin-ass-stock-real-calls",
        password="test-pass-123",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

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
@override_settings(DEBUG=True, AAS_DIOTALI_MOCK_ENABLED=True)
def test_can_verify_registration_with_aas_diotali_mock_in_debug_mode():
    organization = Organization.objects.create(name="Groupe Verification", code="VERIFY")
    contributor = User.objects.create_user(
        username="contributor-ass-verification",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    already_insured = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "aas-001"},
        format="json",
    )
    free = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "DK-0042-ZZ"},
        format="json",
    )

    # Le registre AAS Diotali ne renvoie jamais les caracteristiques du
    # vehicule, seulement l'existence (ou non) d'un contrat en cours.
    assert already_insured.status_code == 200
    assert already_insured.data["mode"] == "mock"
    # Echo canonique : "AAS001" n'est pas une plaque standard (2 lettres,
    # 3-4 chiffres, 2 lettres), donc pas de tirets inventes.
    assert already_insured.data["immatriculation"] == "AAS001"
    assert already_insured.data["is_registered"] is True
    assert already_insured.data["vehicle"] is None
    assert "MOCK ASSURANCES" in already_insured.data["operation_message"]

    assert free.status_code == 200
    assert free.data["is_registered"] is False
    assert free.data["vehicle"] is None


@pytest.mark.django_db
@override_settings(AAS_DIOTALI_MOCK_ENABLED=True)
def test_verify_registration_lets_through_when_existing_cover_expires_before_new_effect_date():
    # Sentinelle mock : echeance fixee au 2026-12-31 (voir
    # integrations/aas_diotali/client.py). Une nouvelle date d'effet
    # posterieure signifie que le vehicule ne sera plus couvert par
    # l'ancien contrat : on laisse passer.
    organization = Organization.objects.create(name="Groupe Renouvellement", code="RENEW")
    contributor = User.objects.create_user(
        username="contributor-ass-renouvellement",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    after_expiry = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "aas-002", "date_effet": "2027-01-05"},
        format="json",
    )
    before_expiry = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "aas-002", "date_effet": "2026-06-01"},
        format="json",
    )
    no_date_provided = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "aas-002"},
        format="json",
    )

    assert after_expiry.data["is_registered"] is False
    assert after_expiry.data["details"] is None
    assert before_expiry.data["is_registered"] is True
    assert before_expiry.data["details"]["attestation_number"] == "MOCKAAS0001"
    assert before_expiry.data["details"]["date_echeance"] == "2026-12-31"
    # Sans date d'effet (formulaire pas encore arrive a la couverture) : bloque par defaut.
    assert no_date_provided.data["is_registered"] is True


@pytest.mark.django_db
@override_settings(AAS_DIOTALI_MOCK_ENABLED=False)
@patch("integrations.aas_diotali.client.AasDiotaliClient.verify_vehicle")
def test_verify_registration_says_unavailable_instead_of_free_when_registry_is_down(
    verify_vehicle,
):
    """Une panne du tiers laisse passer la vente, mais ne doit pas la maquiller
    en « immatriculation libre » : sans verification, on ne sait rien."""
    verify_vehicle.side_effect = requests.exceptions.Timeout("registre injoignable")
    organization = Organization.objects.create(name="Groupe Panne", code="OUTAGE")
    contributor = User.objects.create_user(
        username="contributor-aas-outage",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "DK-7788-HZ"},
        format="json",
    )

    assert response.status_code == 200
    # FAIL_OPEN : la vente n'est pas bloquee...
    assert response.data["is_registered"] is False
    # ... mais le statut dit clairement que rien n'a pu etre verifie.
    assert response.data["operation_status"] == "UNAVAILABLE"
    assert response.data["details"] is None


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_verify_registration_requires_registration_value():
    organization = Organization.objects.create(name="Groupe Validation", code="VALIDATE")
    contributor = User.objects.create_user(
        username="contributor-ass-validation",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": ""},
        format="json",
    )

    assert response.status_code == 400
    assert "immatriculation" in response.data


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_verify_registration_rejects_invalid_characters():
    organization = Organization.objects.create(
        name="Groupe Validation Format",
        code="VALIDATE-FORMAT",
    )
    contributor = User.objects.create_user(
        username="contributor-ass-validation-format",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "DK 1234/AB"},
        format="json",
    )

    assert response.status_code == 400
    assert "immatriculation" in response.data


@pytest.mark.django_db
@override_settings(DEBUG=True, AAS_DIOTALI_MOCK_ENABLED=True)
def test_verify_registration_requires_authentication_even_in_debug():
    client = APIClient()

    response = client.post(
        "/api/integrations/ass/verify-registration/",
        {"immatriculation": "AA-917-XQ"},
        format="json",
    )

    assert response.status_code in {401, 403}


@pytest.mark.django_db
@override_settings(AAS_DIOTALI_MOCK_ENABLED=True, ASS_MOCK_ENABLED=True)
def test_verify_registration_answers_the_same_however_the_plate_is_typed():
    """« AA-917-VL » et « AA917VL » sont le meme vehicule, donc la meme reponse.

    Sans forme canonique, l'echo renvoyait la saisie brute et la meme plaque
    semblait donner deux resultats differents a l'apporteur.
    """
    organization = Organization.objects.create(name="Groupe Format", code="FORMAT")
    contributor = User.objects.create_user(
        username="contributor-format",
        password="test-pass-123",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    responses = [
        client.post(
            "/api/integrations/ass/verify-registration/",
            {"immatriculation": raw},
            format="json",
        ).data
        for raw in ["AA-917-VL", "aa917vl", "AA917VL"]
    ]

    assert all(response["immatriculation"] == "AA-917-VL" for response in responses)
    assert len({response["operation_status"] for response in responses}) == 1
    assert len({response["is_registered"] for response in responses}) == 1
