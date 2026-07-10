"""Tests du flux de paiement Orange Money (mode mock)."""

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
    assert data["payment"]["amount"] == 27_000
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

    assert response.status_code == 200
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

    assert response.status_code == 200
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
