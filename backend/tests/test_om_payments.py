"""Tests du flux de paiement Orange Money (mode mock)."""

import json
import time

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from contracts.models import Contract
from organizations.models import Organization
from payments.models import Payment


pytestmark = pytest.mark.django_db


def make_contributor(username="om-contributor", org_code="OM-TEST"):
    organization = Organization.objects.create(
        name=f"Groupe {org_code}",
        code=org_code,
    )
    user = User.objects.create_user(
        username=username,
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
        commission_percent_on_prime_rc=0,
        commission_fixed_on_policy_fee=0,
    )
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def create_quote_ready_contract(contributor):
    return Contract.objects.create(
        organization=contributor.organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.QUOTE_READY,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
    )


def initiate(client, contract):
    return client.post(
        "/api/payments/om/initiate/",
        {"contract_id": contract.id},
        format="json",
    )


def test_initiate_creates_pending_payment_with_qr(settings):
    settings.OM_MOCK_ENABLED = True
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)

    response = initiate(client, contract)

    assert response.status_code == 200
    data = response.data
    assert data["payment"]["status"] == Payment.Status.PENDING
    assert data["payment"]["method"] == Payment.Method.ORANGE_MONEY
    # Net a verser : TTC 27 000 - cout de police 3 000, retenu a la source
    # par l'apporteur (regle du 28/08/2026).
    assert data["payment"]["amount"] == 24_000
    assert data["payment"]["external_reference"].startswith(f"HORUS-{contract.id}-")
    assert data["qr"]["qr_code"].startswith("data:image/")
    assert "MAXIT" in data["qr"]["deep_links"]
    assert data["qr"]["mock"] is True

    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAYMENT_PENDING


def test_initiate_cancels_previous_pending_om_payment(settings):
    settings.OM_MOCK_ENABLED = True
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)

    first = initiate(client, contract)
    second = initiate(client, contract)

    assert first.status_code == 200
    assert second.status_code == 200
    first_payment = Payment.objects.get(pk=first.data["payment"]["id"])
    assert first_payment.status == Payment.Status.CANCELLED
    assert (
        contract.payments.filter(
            status=Payment.Status.PENDING, method=Payment.Method.ORANGE_MONEY
        ).count()
        == 1
    )


def test_status_stays_pending_before_mock_delay(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 3600
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]

    response = client.get(f"/api/payments/om/{payment_id}/status/")

    assert response.status_code == 200
    assert response.data["payment"]["status"] == Payment.Status.PENDING
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAYMENT_PENDING


def test_status_confirms_after_mock_delay(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]

    response = client.get(f"/api/payments/om/{payment_id}/status/")

    assert response.status_code == 200
    assert response.data["payment"]["status"] == Payment.Status.CONFIRMED
    assert response.data["payment"]["om_transaction_id"] == f"MOCK-OM-{payment_id}"
    assert response.data["contract_internal_status"] == Contract.InternalStatus.PAID
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAID
    assert contract.ttc_ass == 27_000


def test_status_confirmation_is_idempotent(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]

    first = client.get(f"/api/payments/om/{payment_id}/status/")
    second = client.get(f"/api/payments/om/{payment_id}/status/")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.data["payment"]["status"] == Payment.Status.CONFIRMED
    assert (
        Payment.objects.filter(
            contract=contract, status=Payment.Status.CONFIRMED
        ).count()
        == 1
    )


def test_callback_confirms_payment_without_auth(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    reference = initiate(client, contract).data["payment"]["external_reference"]

    anonymous = APIClient()
    response = anonymous.post(
        "/api/payments/om/callback/",
        {"reference": reference, "status": "SUCCESS"},
        format="json",
    )

    assert response.status_code == 202
    payment = Payment.objects.get(external_reference=reference)
    assert payment.status == Payment.Status.CONFIRMED
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAID


def test_callback_does_not_trust_body_status(settings):
    """Le callback ne confirme jamais sur la seule foi du body : la transaction
    doit être SUCCESS côté API OM (ici mock encore PENDING)."""
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 3600
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    reference = initiate(client, contract).data["payment"]["external_reference"]

    anonymous = APIClient()
    response = anonymous.post(
        "/api/payments/om/callback/",
        {"reference": reference, "status": "SUCCESS"},
        format="json",
    )

    assert response.status_code == 202
    payment = Payment.objects.get(external_reference=reference)
    assert payment.status == Payment.Status.PENDING


def test_initiate_forbidden_for_other_contributor(settings):
    settings.OM_MOCK_ENABLED = True
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    other = User.objects.create_user(
        username="om-other-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=contributor.organization,
    )
    client.force_authenticate(other)

    response = initiate(client, contract)

    # L'isolation des contrats (queryset apporteur) rend le contrat invisible.
    assert response.status_code == 404
    assert not Payment.objects.filter(contract=contract).exists()


def test_status_amount_mismatch_marks_payment_failed(settings, monkeypatch):
    settings.OM_MOCK_ENABLED = True
    client, contributor = make_contributor()
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]

    from integrations.orange_money.client import OmClient

    monkeypatch.setattr(
        OmClient,
        "find_transaction",
        lambda self, *, reference, since=None: {
            "status": "SUCCESS",
            "transactionId": "TXN-MISMATCH",
            "amount": 10_000,
        },
    )

    response = client.get(f"/api/payments/om/{payment_id}/status/")

    assert response.status_code == 400
    assert "verification manuelle" in response.data["detail"]
    payment = Payment.objects.get(pk=payment_id)
    assert payment.status == Payment.Status.FAILED
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAYMENT_PENDING


# ─── Conformité à la spec OpenAPI Orange Money v1.1.0 ─────────────────────────


def _sign(secret, raw_body, timestamp=None):
    """Reproduit la signature Sonatel : HMAC-SHA256 hex de "{t},{corps brut}"."""
    import hashlib
    import hmac

    ts = int(time.time()) if timestamp is None else int(timestamp)
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{ts},".encode("ascii") + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return ts, digest


def test_oauth_endpoint_matches_published_spec():
    """Le nouveau portail expose /oauth/v1/token — /oauth/token renvoie 404."""
    from integrations.orange_money.constants import OM_ENDPOINT_OAUTH_TOKEN

    assert OM_ENDPOINT_OAUTH_TOKEN == "/oauth/v1/token"


def test_qrcode_response_is_normalized_for_the_front():
    """L'API renvoie un base64 nu : le front a besoin d'une data-URI affichable."""
    from integrations.orange_money.client import OmClient

    normalized = OmClient._normalize_qrcode(
        {
            "qrCode": "iVBORw0KGgoAAAANSUhEUg==",
            "deepLink": "https://sugu.orange-sonatel.com/mp/123456789",
            "validity": 300,
        }
    )

    assert normalized["qrCode"] == "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
    assert normalized["deepLinks"] == {
        "MAXIT": "https://sugu.orange-sonatel.com/mp/123456789"
    }


def test_qrcode_normalization_leaves_data_uri_untouched():
    from integrations.orange_money.client import OmClient

    already = {
        "qrCode": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "deepLinks": {"OM": "x"},
    }
    assert OmClient._normalize_qrcode(dict(already)) == already


@pytest.mark.parametrize("om_status", ["CANCELLED", "FAILED", "REJECTED"])
def test_status_marks_payment_failed_on_terminal_statuses(settings, monkeypatch, om_status):
    settings.OM_MOCK_ENABLED = True
    client, contributor = make_contributor(
        username=f"om-term-{om_status.lower()}", org_code=f"OM-T-{om_status[:3]}"
    )
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]

    from integrations.orange_money.client import OmClient

    monkeypatch.setattr(
        OmClient,
        "find_transaction",
        lambda self, *, reference, since=None: {
            "status": om_status,
            "transactionId": "MP220928.1029.C58502",
            "amount": 27_000,
        },
    )

    response = client.get(f"/api/payments/om/{payment_id}/status/")

    assert response.status_code == 200
    assert response.data["payment"]["status"] == Payment.Status.FAILED
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAYMENT_PENDING


@pytest.mark.parametrize("om_status", ["ACCEPTED", "INITIATED", "PENDING", "PRE_INITIATED"])
def test_status_stays_pending_on_transient_statuses(settings, monkeypatch, om_status):
    """OM garantit un statut final sous 24 h : rien de transitoire ne doit echouer."""
    settings.OM_MOCK_ENABLED = True
    client, contributor = make_contributor(
        username=f"om-trans-{om_status.lower()}", org_code=f"OM-P-{om_status[:4]}"
    )
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]

    from integrations.orange_money.client import OmClient

    monkeypatch.setattr(
        OmClient,
        "find_transaction",
        lambda self, *, reference, since=None: {
            "status": om_status,
            "transactionId": "MP220928.1029.C58502",
            "amount": 27_000,
        },
    )

    response = client.get(f"/api/payments/om/{payment_id}/status/")

    assert response.status_code == 200
    assert response.data["payment"]["status"] == Payment.Status.PENDING


def test_callback_rejects_invalid_signature(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    settings.OM_CALLBACK_SIGNING_SECRET = "secret-partenaire"
    client, contributor = make_contributor(username="om-badsig", org_code="OM-BADSIG")
    contract = create_quote_ready_contract(contributor)
    reference = initiate(client, contract).data["payment"]["external_reference"]

    raw_body = json.dumps({"reference": reference, "status": "SUCCESS"}).encode("utf-8")
    ts, _ = _sign("un-autre-secret", raw_body)

    response = APIClient().post(
        "/api/payments/om/callback/",
        data=raw_body,
        content_type="application/json",
        HTTP_X_SONATEL_SIGNATURE=f"t={ts},v1=" + "0" * 64,
    )

    # 400 = rejet definitif cote OM (pas de reemission) : c'est le comportement
    # voulu pour une requete non authentique.
    assert response.status_code == 400
    assert Payment.objects.get(external_reference=reference).status == Payment.Status.PENDING


def test_callback_accepts_valid_signature(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    settings.OM_CALLBACK_SIGNING_SECRET = "secret-partenaire"
    client, contributor = make_contributor(username="om-goodsig", org_code="OM-GOODSIG")
    contract = create_quote_ready_contract(contributor)
    reference = initiate(client, contract).data["payment"]["external_reference"]

    raw_body = json.dumps({"reference": reference, "status": "SUCCESS"}).encode("utf-8")
    ts, digest = _sign("secret-partenaire", raw_body)

    response = APIClient().post(
        "/api/payments/om/callback/",
        data=raw_body,
        content_type="application/json",
        HTTP_X_SONATEL_SIGNATURE=f"t={ts},v1={digest}",
    )

    assert response.status_code == 202
    assert Payment.objects.get(external_reference=reference).status == Payment.Status.CONFIRMED


def test_callback_rejects_replayed_signature(settings):
    """Un horodatage hors tolerance (300 s) bloque le rejeu d'une notification."""
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    settings.OM_CALLBACK_SIGNING_SECRET = "secret-partenaire"
    client, contributor = make_contributor(username="om-replay", org_code="OM-REPLAY")
    contract = create_quote_ready_contract(contributor)
    reference = initiate(client, contract).data["payment"]["external_reference"]

    raw_body = json.dumps({"reference": reference, "status": "SUCCESS"}).encode("utf-8")
    ts, digest = _sign("secret-partenaire", raw_body, timestamp=int(time.time()) - 3600)

    response = APIClient().post(
        "/api/payments/om/callback/",
        data=raw_body,
        content_type="application/json",
        HTTP_X_SONATEL_SIGNATURE=f"t={ts},v1={digest}",
    )

    assert response.status_code == 400
    assert Payment.objects.get(external_reference=reference).status == Payment.Status.PENDING


def test_callback_rejects_bad_basic_authorization(settings):
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    settings.OM_CALLBACK_API_KEY = "cle-partagee"
    client, contributor = make_contributor(username="om-badauth", org_code="OM-BADAUTH")
    contract = create_quote_ready_contract(contributor)
    reference = initiate(client, contract).data["payment"]["external_reference"]

    response = APIClient().post(
        "/api/payments/om/callback/",
        {"reference": reference, "status": "SUCCESS"},
        format="json",
        HTTP_AUTHORIZATION="Basic mauvaise-cle",
    )

    assert response.status_code == 400
    assert Payment.objects.get(external_reference=reference).status == Payment.Status.PENDING


def test_callback_matches_payment_by_transaction_id(settings):
    """Notification arrivee apres le sondage : on retrouve le paiement par txn id."""
    settings.OM_MOCK_ENABLED = True
    settings.OM_MOCK_CONFIRM_DELAY_SECONDS = 0
    client, contributor = make_contributor(username="om-bytxn", org_code="OM-BYTXN")
    contract = create_quote_ready_contract(contributor)
    payment_id = initiate(client, contract).data["payment"]["id"]
    client.get(f"/api/payments/om/{payment_id}/status/")

    payment = Payment.objects.get(pk=payment_id)
    assert payment.status == Payment.Status.CONFIRMED

    response = APIClient().post(
        "/api/payments/om/callback/",
        {"transactionId": payment.om_transaction_id, "status": "SUCCESS"},
        format="json",
    )

    assert response.status_code == 202
    assert (
        Payment.objects.filter(contract=contract, status=Payment.Status.CONFIRMED).count() == 1
    )
