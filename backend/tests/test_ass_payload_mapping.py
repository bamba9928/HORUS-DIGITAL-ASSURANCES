import pytest
from django.core.exceptions import ValidationError

from accounts.models import User
from contracts.models import Contract
from contracts.services import (
    QuoteCalculationError,
    build_auto_issue_payload,
    build_auto_rc_payload,
    build_fleet_issue_payload,
    build_fleet_trailer_issue_payloads,
    build_moto_issue_payload,
    build_moto_rc_payload,
    calculate_contract_quote,
    extract_prime_rc,
)
from organizations.models import Organization


class FakeAssQuoteClient:
    def __init__(self):
        self.trailer_rc_payloads = []

    def calculate_fleet_rc(self, payload):
        return {
            "code": 2000,
            "status": "SUCCESS",
            "message": "Operation effectuee avec succes.",
            "items": [
                {
                    "requestId": "veh-1",
                    "responsabiliteCivile": 24_000,
                }
            ],
        }

    def calculate_trailer_rc(self, payload):
        self.trailer_rc_payloads.append(payload)
        return {
            "code": 2000,
            "operationStatus": "SUCCESS",
            "operationMessage": "Operation effectuee avec succes.",
            "data": 3_000,
        }


TEST_POLICYHOLDER = {
    "lastName": "DIOP",
    "firstName": "Awa",
    "phone": "771112233",
    "email": "awa.diop@example.test",
}

TEST_INSURED = {
    "lastName": "NDIAYE",
    "firstName": "Moussa",
    "phone": "772223344",
    "email": "moussa.ndiaye@example.test",
}


def test_auto_payload_uses_referential_periodicity_and_person_type():
    contract = Contract(
        id=6,
        prime_rc_ass=18_000,
        draft_payload={
            "guarantees": [3, 1, 1],
            "guaranteeOptions": {
                "garantiesOptAS": "OPTION_1",
            },
            "policyholder": TEST_POLICYHOLDER,
            "insured": TEST_INSURED,
            "vehicle": {
                "brand": "TOYOTA",
                "model": "YARIS",
                "subcategory": "VP",
                "energy": "ESSENCE",
                "fiscalPower": "8",
                "seats": "5",
                "duration": "30",
                "periodicity": "JOUR",
                "personType": "MORALE",
            }
        },
    )

    rc_payload = build_auto_rc_payload(
        contract.draft_payload["vehicle"],
        guarantees=contract.draft_payload["guarantees"],
        guarantee_options=contract.draft_payload["guaranteeOptions"],
    )
    issue_payload = build_auto_issue_payload(contract, "REF-AUTO")

    assert rc_payload["periodicite"] == "JOUR"
    assert rc_payload["garanties"] == [1, 3]
    assert rc_payload["garantiesOptAS"] == "OPTION_1"
    assert issue_payload["periodicite"] == "JOUR"
    assert issue_payload["typePersonne"] == "MORALE"
    assert issue_payload["garanties"] == [1, 3]
    assert issue_payload["garantiesOptAS"] == "OPTION_1"
    assert issue_payload["souscripteur"]["nom"] == "DIOP"
    assert issue_payload["assure"]["nom"] == "NDIAYE"


def test_ass_error_message_uses_real_error_description_fields():
    with pytest.raises(QuoteCalculationError, match="Solde QR insuffisant"):
        extract_prime_rc(
            {
                "operationStatus": "ERROR",
                "error_descrip": "Solde QR insuffisant",
            }
        )


def test_issue_payload_requires_policyholder_and_insured():
    contract = Contract(
        id=8,
        prime_rc_ass=18_000,
        draft_payload={
            "vehicle": {
                "brand": "TOYOTA",
                "subcategory": "VP",
                "energy": "ESSENCE",
                "fiscalPower": "8",
            }
        },
    )

    with pytest.raises(ValidationError, match="Souscripteur"):
        build_auto_issue_payload(contract, "REF-AUTO")


def test_moto_payload_uses_pdf_usage_values_and_expiration_date():
    contract = Contract(
        id=7,
        prime_rc_ass=14_273,
        draft_payload={
            "guarantees": [2],
            "guaranteeOptions": {
                "garantiesOptPT": "OPTION_1",
            },
            "policyholder": TEST_POLICYHOLDER,
            "insured": TEST_POLICYHOLDER,
            "vehicle": {
                "brand": "YAMAHA",
                "model": "Vespa",
                "subcategory": "2RCYC",
                "energy": "ESSENCE",
                "cylindree": "126",
                "duration": "6",
                "periodicity": "MOIS",
                "personType": "PHYSIQUE",
                "effectDate": "2024-07-11",
                "firstCirculationDate": "2022-11-08",
                "registration": "DK-0000-MT",
                "motoUsage": "NON_COMMERCIAL",
                "seats": "2",
            }
        },
    )

    rc_payload = build_moto_rc_payload(
        contract.draft_payload["vehicle"],
        guarantees=contract.draft_payload["guarantees"],
        guarantee_options=contract.draft_payload["guaranteeOptions"],
    )
    issue_payload = build_moto_issue_payload(contract, "REF-MOTO")

    assert rc_payload["usage"] == "non_commerciale"
    assert rc_payload["garanties"] == [2]
    assert rc_payload["garantiesOptPT"] == "OPTION_1"
    assert issue_payload["dateExpiration"] == "2025-01-10"
    assert issue_payload["periodicite"] == "MOIS"
    assert issue_payload["typePersonne"] == "PHYSIQUE"
    assert issue_payload["vehicule"]["usage"] == "non_commerciale"
    assert issue_payload["vehicule"]["cylindre"] == 126
    assert issue_payload["garanties"] == [2]
    assert issue_payload["garantiesOptPT"] == "OPTION_1"
    assert issue_payload["souscripteur"]["cellulaire"] == "771112233"
    assert issue_payload["cout_police"] == 3_000


@pytest.mark.django_db
def test_fleet_quote_prices_second_trailer_with_remorque_rc_request():
    organization = Organization.objects.create(name="Groupe Fleet Mapper", code="FLEET-MAP")
    contributor = User.objects.create_user(
        username="fleet-mapper",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.FLEET,
        draft_payload={
            "guarantees": [1, 2],
            "guaranteeOptions": {
                "garantiesOptPT": "OPTION_1",
            },
            "fleet": {
                "vehicles": [
                    {
                        "id": "veh-1",
                        "brand": "TOYOTA",
                        "model": "YARIS",
                        "subcategory": "VP",
                        "registration": "AA-917-XQ",
                        "energy": "ESSENCE",
                        "fiscalPower": "8",
                        "duration": "3",
                        "periodicity": "MOIS",
                        "effectDate": "2026-06-01",
                        "trailers": [
                            {
                                "id": "rem-1",
                                "tractorVehicleId": "veh-1",
                                "registration": "REM-001",
                            },
                            {
                                "id": "rem-2",
                                "tractorVehicleId": "veh-1",
                                "registration": "REM-002",
                            },
                        ],
                    }
                ]
            }
        },
    )
    fake_client = FakeAssQuoteClient()

    quote = calculate_contract_quote(contract, ass_client=fake_client)

    contract.refresh_from_db()
    assert quote["prime_rc_ass"] == 27_000
    assert quote["items"][1]["prime_rc_ass"] == 0
    assert quote["items"][2]["prime_rc_ass"] == 3_000
    assert fake_client.trailer_rc_payloads == [
        {
            "duree": 3,
            "periodicite": "MOIS",
            "referenceVehicule": "AA-917-XQ",
        }
    ]
    assert contract.ass_request_payload["remorques"][0]["trailer_id"] == "rem-2"
    assert contract.ass_request_payload["flotte"]["requests"][0]["garanties"] == [1, 2]
    assert contract.ass_request_payload["flotte"]["requests"][0]["garantiesOptPT"] == "OPTION_1"
    assert contract.ass_response_payload["remorques"][0]["prime_rc_ass"] == 0
    assert contract.ass_response_payload["remorques"][1]["prime_rc_ass"] == 3_000


def test_fleet_issue_payload_reuses_rc_amounts_returned_by_ass_quote():
    contract = Contract(
        id=9,
        ass_response_payload={
            "flotte": {
                "code": 2000,
                "status": "SUCCESS",
                "message": "Operation effectuee avec succes.",
                "items": [
                    {
                        "requestId": "veh-1",
                        "responsabiliteCivile": 24_000,
                    }
                ],
            }
        },
        draft_payload={
            "guarantees": [4],
            "guaranteeOptions": {
                "garantiesOptAR": "CAPITAL",
            },
            "policyholder": TEST_POLICYHOLDER,
            "insured": TEST_INSURED,
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
                        "periodicity": "JOUR",
                        "personType": "MORALE",
                    }
                ]
            }
        },
    )

    payload = build_fleet_issue_payload(contract, "REF-FLEET")

    assert payload["items"][0]["responsabiliteCivile"] == 24_000
    assert payload["periodicite"] == "JOUR"
    assert payload["typePersonne"] == "MORALE"
    assert "garanties" not in payload
    assert payload["items"][0]["vehicule"]["garanties"] == [4]
    assert payload["items"][0]["vehicule"]["garantiesOptAR"] == "CAPITAL"
    assert payload["souscripteur"]["nom"] == "DIOP"
    assert payload["items"][0]["assure"]["nom"] == "NDIAYE"
    assert payload["cout_police"] == 3_000
    assert payload["remise_rc"] == 0


def test_trailer_issue_payload_uses_issued_vehicle_reference_and_pdf_expiration_date():
    contract = Contract(
        id=10,
        ass_response_payload={
            "remorques": [
                {"trailer_id": "rem-1", "prime_rc_ass": 0},
                {"trailer_id": "rem-2", "prime_rc_ass": 3_000},
            ]
        },
        draft_payload={
            "policyholder": TEST_POLICYHOLDER,
            "insured": TEST_INSURED,
            "fleet": {
                "vehicles": [
                    {
                        "id": "veh-1",
                        "brand": "TOYOTA",
                        "subcategory": "VP",
                        "registration": "AA-917-XQ",
                        "energy": "ESSENCE",
                        "duration": "6",
                        "periodicity": "JOUR",
                        "personType": "MORALE",
                        "effectDate": "2024-07-11",
                        "trailers": [
                            {
                                "id": "rem-1",
                                "registration": "REM-001",
                                "brand": "TRAIL",
                                "model": "T1",
                            },
                            {
                                "id": "rem-2",
                                "registration": "REM-002",
                                "brand": "TRAIL",
                                "model": "T2",
                                "periodicity": "MOIS",
                                "personType": "PHYSIQUE",
                            },
                        ],
                    }
                ]
            }
        },
    )
    fleet_request_payload = {
        "items": [
            {
                "referenceTrxPartner": "REF-FLEET-1",
            }
        ]
    }
    fleet_issue_items = [
        {
            "referenceExterne": "REF-FLEET-1",
        }
    ]

    payloads = build_fleet_trailer_issue_payloads(
        contract=contract,
        reference="REF-FLEET",
        fleet_request_payload=fleet_request_payload,
        fleet_issue_items=fleet_issue_items,
    )

    assert payloads[0]["responsabiliteCivile"] == 0
    assert payloads[0]["referenceVehicule"] == "REF-FLEET-1"
    assert payloads[0]["periodicite"] == "JOUR"
    assert payloads[0]["typePersonne"] == "MORALE"
    assert payloads[0]["souscripteur"]["nom"] == "DIOP"
    assert payloads[0]["assure"]["nom"] == "NDIAYE"
    assert payloads[0]["dateExpiration"] == "2024-07-16"
    assert payloads[1]["responsabiliteCivile"] == 3_000
    assert payloads[1]["periodicite"] == "MOIS"
    assert payloads[1]["typePersonne"] == "PHYSIQUE"
    assert payloads[1]["referenceTrxPartner"] == "REF-FLEET-REM-1-2"
