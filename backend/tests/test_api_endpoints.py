import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from organizations.models import Organization
from payments.models import Payment


@pytest.mark.django_db
def test_vehicle_subcategories_are_filtered_by_category():
    client = APIClient()

    response = client.get("/api/referentials/vehicle-subcategories/", {"category": "C5"})

    assert response.status_code == 200
    values = {item["value"] for item in response.data["results"]}
    assert values == {"2RCYC", "2RSCO", "2RMOT", "2RSID"}


def test_vehicle_brand_search_returns_select_options():
    client = APIClient()

    response = client.get("/api/referentials/vehicle-brands/", {"search": "toy"})

    assert response.status_code == 200
    assert response.data["results"] == [{"value": "TOYOTA", "label": "Toyota"}]


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_can_create_contract_draft_in_debug_mode():
    client = APIClient()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "MOTO",
            "draft_payload": {
                "vehicle": {
                    "brand": "YAMAHA",
                    "cylindree": 126,
                }
            },
        },
        format="json",
    )

    assert response.status_code == 201
    draft = Contract.objects.get(id=response.data["id"])
    assert draft.internal_status == Contract.InternalStatus.DRAFT
    assert draft.contract_type == Contract.ContractType.MOTO
    assert draft.draft_payload["vehicle"]["cylindree"] == 126


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_rejects_disabled_contract_type_for_draft():
    client = APIClient()

    response = client.post(
        "/api/contracts/drafts/",
        {"contract_type": "GARAGE", "draft_payload": {}},
        format="json",
    )

    assert response.status_code == 400
    assert "contract_type" in response.data


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_can_create_fleet_draft_with_trailer_attached_to_vehicle():
    client = APIClient()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "registration": "AA-917-XQ",
                            "trailers": [
                                {
                                    "id": "rem-1",
                                    "tractorVehicleId": "veh-1",
                                    "registration": "REM-001",
                                    "subcategory": "REMORQUE",
                                }
                            ],
                        }
                    ]
                }
            },
        },
        format="json",
    )

    assert response.status_code == 201
    draft = Contract.objects.get(id=response.data["id"])
    trailer = draft.draft_payload["fleet"]["vehicles"][0]["trailers"][0]
    assert trailer["tractorVehicleId"] == "veh-1"


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_rejects_fleet_trailer_with_unknown_tractor():
    client = APIClient()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "trailers": [
                                {
                                    "id": "rem-1",
                                    "tractorVehicleId": "missing-vehicle",
                                }
                            ],
                        }
                    ]
                }
            },
        },
        format="json",
    )

    assert response.status_code == 400
    assert "draft_payload" in response.data


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_calculate_auto_quote_from_ass_mock():
    client = APIClient()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )

    response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    assert response.status_code == 200
    assert response.data["internal_status"] == Contract.InternalStatus.QUOTE_READY
    assert response.data["quote"]["prime_rc_ass"] == 24_000
    assert response.data["quote"]["policy_fee_ass"] == 3_000
    draft = Contract.objects.get(id=draft_response.data["id"])
    assert draft.prime_rc_ass == 24_000
    assert draft.ttc_ass is None
    assert draft.ass_request_payload["puissanceFiscale"] == 8


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_calculate_fleet_quote_with_trailer_from_ass_mock():
    client = APIClient()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "registration": "AA-917-XQ",
                            "energy": "ESSENCE",
                            "fiscalPower": "8",
                            "duration": "3",
                            "trailers": [
                                {
                                    "id": "rem-1",
                                    "tractorVehicleId": "veh-1",
                                    "registration": "REM-001",
                                    "subcategory": "REMORQUE",
                                }
                            ],
                        }
                    ]
                }
            },
        },
        format="json",
    )

    response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    assert response.status_code == 200
    assert response.data["quote"]["prime_rc_ass"] == 24_000
    assert response.data["quote"]["items"][0]["kind"] == "VEHICLE"
    assert response.data["quote"]["items"][1]["kind"] == "TRAILER"
    assert response.data["quote"]["items"][1]["prime_rc_ass"] == 0
    assert response.data["quote"]["warnings"]


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_issue_is_blocked_without_confirmed_payment():
    client = APIClient()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )
    quote_response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    response = client.post(f"/api/contracts/{quote_response.data['contract_id']}/issue/")

    assert response.status_code == 400
    assert "paiement" in response.data["detail"].lower()


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_confirm_payment_then_issue_mock_contract():
    client = APIClient()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )
    quote_response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")
    contract_id = quote_response.data["contract_id"]

    payment_response = client.post(
        f"/api/contracts/{contract_id}/payments/confirm/",
        {"amount": 27_000, "external_reference": "PAY-TEST"},
        format="json",
    )
    issue_response = client.post(f"/api/contracts/{contract_id}/issue/")

    assert payment_response.status_code == 200
    assert payment_response.data["payment"]["status"] == Payment.Status.CONFIRMED
    assert issue_response.status_code == 200
    assert issue_response.data["internal_status"] == Contract.InternalStatus.ISSUED
    assert issue_response.data["ass_status"] == Contract.AssStatus.VALIDATED
    assert issue_response.data["attestation_number"] == "SNMOCK0001"

    contract = Contract.objects.get(id=contract_id)
    assert contract.internal_status == Contract.InternalStatus.ISSUED
    assert contract.reference_trx_partner.startswith("HORUS-")
    assert contract.ttc_ass == 27_000
    assert CommissionSnapshot.objects.filter(contract=contract).exists()


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_issue_is_blocked_when_contributor_commission_is_not_configured():
    client = APIClient()
    organization = Organization.objects.create(name="Groupe Test", code="TEST-COM")
    contributor = User.objects.create_user(
        username="apporteur-no-commission",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.PAID,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
        ttc_ass=27_000,
        draft_payload={
            "vehicle": {
                "brand": "TOYOTA",
                "subcategory": "VP",
                "energy": "ESSENCE",
                "fiscalPower": "8",
                "duration": "3",
                "registration": "AA-917-XQ",
            }
        },
    )
    Payment.objects.create(
        contract=contract,
        amount=27_000,
        status=Payment.Status.CONFIRMED,
    )

    response = client.post(f"/api/contracts/{contract.id}/issue/")

    assert response.status_code == 400
    assert "Commission non configuree" in response.data["detail"]
