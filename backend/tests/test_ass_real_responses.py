"""Tests bases sur les reponses REELLES de la sandbox ASS (capturees le 2026-06-11).

Chaque fixture est la copie conforme d'une reponse renvoyee par
https://kiiraytest.lasecu-assurances.sn — voir docs/ass/validation_sandbox_2026-06-11.md.
"""

import pytest

from contracts.models import Contract
from contracts.services import (
    extract_prime_rc,
    extract_rc_breakdown,
    normalize_moto_usage,
)
from integrations.ass.client import extract_available_qr
from integrations.ass.views import AssVerifyRegistrationView
from payments.services import expected_payment_amount


# rc.request — VP, puissance 8, 1 mois, garanties [] (reponse sandbox exacte)
REAL_RC_RESPONSE = {
    "code": "2000",
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "data": "4769",
    "PrimeRC": "4469",
    "Reduction": "0",
    "CoutPolice": "3000",
    "PrimeAG": "0",
    "Taxe": "1046",
    "Fga": "112",
    "Cedeao": "300",
    "PrimeTotale": "8927",
}

# stock.qr — compte sandbox sans stock alloue
REAL_STOCK_RESPONSE = {
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "data": "-1.0",
}

# verif.immatriculation — vehicule deja assure / immatriculation libre
REAL_VERIF_ALREADY_INSURED = {
    "code": "5006",
    "message": "Ce véhicule DK1234AB dispose déjà d'une police d'assurance chez: PREVOYANCE ASSURANCES",
    "status": "ERREUR",
    "data": "",
}
REAL_VERIF_FREE = {
    "code": "4000",
    "message": "L'attestation d'assurance (ZZ0000ZZ) n'est pas valide.",
    "status": "ERROR",
    "data": "",
}


def test_extract_prime_rc_supports_real_string_data():
    assert extract_prime_rc(REAL_RC_RESPONSE) == 4769


def test_extract_rc_breakdown_supports_real_root_pascal_case_format():
    breakdown = extract_rc_breakdown(REAL_RC_RESPONSE)

    assert breakdown == {
        "prime_rc_ass": 4469,
        "taxe": 1046,
        "cedeao": 300,
        "reduction": 0,
        "prime_ag": 0,
        "fonds_garantie": 112,
        "cout_police": 3000,
        "prime_totale": 8927,
    }
    # Coherence comptable de la reponse reelle :
    # PrimeRC + CoutPolice + PrimeAG + Taxe + Fga + Cedeao = PrimeTotale.
    assert 4469 + 3000 + 0 + 1046 + 112 + 300 == breakdown["prime_totale"]


def test_extract_rc_breakdown_still_supports_mock_data_dict_format():
    mock_response = {
        "operationStatus": "SUCCESS",
        "data": {
            "responsabiliteCivile": 5000,
            "coutPolice": 3000,
            "taxe": 850,
            "cedeao": 300,
            "reduction": 0,
            "primeAG": 0,
            "fondsGarantie": 125,
            "primeTotale": 9275,
        },
    }

    breakdown = extract_rc_breakdown(mock_response)

    assert breakdown["prime_totale"] == 9275
    assert breakdown["fonds_garantie"] == 125
    assert "prime_rc_ass" not in breakdown


def test_expected_payment_amount_reads_real_root_prime_totale():
    contract = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=4769,
        cout_police_ass=3000,
        ass_response_payload=REAL_RC_RESPONSE,
    )

    assert expected_payment_amount(contract) == 8927


def test_expected_payment_amount_falls_back_without_breakdown():
    contract = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=4769,
        cout_police_ass=3000,
        ass_response_payload={"operationStatus": "SUCCESS", "data": "4769"},
    )

    assert expected_payment_amount(contract) == 7769


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("non_commerciale", "NON_COMMERCIAL"),
        ("commerciale", "COMMERCIAL"),
        ("NON_COMMERCIAL", "NON_COMMERCIAL"),
        ("COMMERCIAL", "COMMERCIAL"),
        ("NON_COMMERCIALE", "NON_COMMERCIAL"),
    ],
)
def test_normalize_moto_usage_targets_sandbox_accepted_values(raw, expected):
    assert normalize_moto_usage(raw) == expected


def test_stock_extractor_parses_real_string_value():
    assert extract_available_qr(REAL_STOCK_RESPONSE) == -1
    assert extract_available_qr({"data": 80}) == 80
    assert extract_available_qr({"data": {"stock": "12"}}) == 12
    assert extract_available_qr({"data": "n/a"}) is None


def test_verify_registration_maps_real_status_codes():
    view = AssVerifyRegistrationView()

    assert view._extract_is_registered(REAL_VERIF_ALREADY_INSURED) is True
    assert view._extract_is_registered(REAL_VERIF_FREE) is False
    assert view._extract_vehicle(REAL_VERIF_ALREADY_INSURED) is None
