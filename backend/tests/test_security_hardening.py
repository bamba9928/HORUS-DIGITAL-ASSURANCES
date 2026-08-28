"""Tests des protections posees lors de l'audit de securite du 2026-08-28.

Chacun correspond a une faille constatee sur l'instance de production, pas a un
risque theorique : ils sont la pour empecher une regression silencieuse.
"""

import pytest
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import User
from contracts.models import Contract
from organizations.models import Organization
from payments.models import Payment
from payments.services import PaymentConfirmationError, assert_om_mock_allowed


# ─── Paiement Orange Money simule hors developpement ──────────────────────────


def test_om_mock_is_refused_outside_development(settings):
    """Le mock confirme un paiement sans qu'un franc ne bouge.

    En production, cela suffisait a un apporteur pour passer son contrat en
    PAYE, puis declencher une emission ASS reelle : une vraie police et un QR
    preleve sur le stock, sans encaissement en face.
    """
    settings.OM_MOCK_ENABLED = True
    settings.DEBUG = False
    settings.OM_ALLOW_MOCK_IN_PRODUCTION = False

    with pytest.raises(PaymentConfirmationError, match="mode simule"):
        assert_om_mock_allowed()


def test_om_mock_is_allowed_in_development(settings):
    settings.OM_MOCK_ENABLED = True
    settings.DEBUG = True
    settings.OM_ALLOW_MOCK_IN_PRODUCTION = False

    assert_om_mock_allowed() is None


def test_real_om_integration_is_never_blocked(settings):
    """Le garde-fou ne porte que sur le mock : l'integration reelle passe."""
    settings.OM_MOCK_ENABLED = False
    settings.DEBUG = False
    settings.OM_ALLOW_MOCK_IN_PRODUCTION = False

    assert assert_om_mock_allowed() is None


@pytest.mark.django_db
def test_om_initiate_endpoint_refuses_mock_outside_development(settings):
    settings.OM_MOCK_ENABLED = True
    settings.DEBUG = False
    settings.OM_ALLOW_MOCK_IN_PRODUCTION = False

    organization = Organization.objects.create(name="Groupe Secu", code="SEC")
    contributor = User.objects.create_user(
        username="apporteur-secu",
        password="mot-de-passe-tres-long-2026",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.QUOTE_READY,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.post(
        "/api/payments/om/initiate/", {"contract_id": contract.id}, format="json"
    )

    assert response.status_code == 400
    assert not Payment.objects.filter(contract=contract).exists()


# ─── Identite de limitation : l'en-tete X-Forwarded-For est fourni par le client ──


def _throttle_ident(**meta):
    request = APIRequestFactory().post("/api/accounts/auth/login/", **meta)
    return ScopedRateThrottle().get_ident(request)


def test_throttle_key_ignores_the_client_supplied_forwarded_for():
    """Sans NUM_PROXIES, DRF prend TOUT l'en-tete comme identite.

    nginx fait `$proxy_add_x_forwarded_for` : il AJOUTE la vraie IP derriere ce
    que le client a envoye. N'importe qui obtenait donc un compteur neuf a
    chaque requete en variant l'en-tete, ce qui annulait la limitation
    anti-force-brute de la connexion et le plafond exige par les CGU ASS.
    """
    forge = _throttle_ident(HTTP_X_FORWARDED_FOR="203.0.113.9, 198.51.100.4")
    autre_forge = _throttle_ident(HTTP_X_FORWARDED_FOR="192.0.2.1, 198.51.100.4")

    # Seule compte la derniere adresse, celle que nginx ajoute : deux requetes
    # du meme client partagent le meme compteur quoi qu'il envoie devant.
    assert forge == "198.51.100.4"
    assert forge == autre_forge


def test_throttle_key_falls_back_to_remote_addr_without_proxy():
    assert _throttle_ident(REMOTE_ADDR="198.51.100.7") == "198.51.100.7"


# ─── Robustesse des mots de passe ─────────────────────────────────────────────


def test_short_passwords_are_rejected():
    """8 caracteres, le defaut Django, est trop court pour cette plateforme."""
    with pytest.raises(ValidationError):
        validate_password("Chaton12")


def test_twelve_character_passwords_are_accepted():
    validate_password("brouette-lampadaire-27")
