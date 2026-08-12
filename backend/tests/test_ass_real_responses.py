"""Tests bases sur les reponses REELLES de la sandbox ASS (capturees le 2026-06-11).

Chaque fixture est la copie conforme d'une reponse renvoyee par
https://kiiraytest.lasecu-assurances.sn — voir docs/ass/validation_sandbox_2026-06-11.md.
"""

import pytest

from contracts.models import Contract
from contracts.services import (
    ContractIssueError,
    contract_commission_basis,
    extract_issue_data,
    extract_prime_rc,
    extract_rc_breakdown,
    normalize_moto_usage,
    parse_ass_datetime,
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

# Sondes reelles du 2026-08-12 : `data` a derive et ne vaut plus PrimeRC + Cedeao.
# Reponses sandbox exactes, conservees telles quelles.
REAL_RC_GARAGE_RESPONSE = {
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "data": "164183",  # > PrimeTotale : inexploitable comme assiette RC
    "PrimeRC": "68831",
    "Reduction": "17208",
    "CoutPolice": "3000",
    "PrimeAG": "0",
    "Taxe": "10056",
    "Fga": "1721",
    "Cedeao": "300",
    "PrimeTotale": "83908",
}
REAL_RC_BUS_RESPONSE = {
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "data": "241718",  # 10x la prime totale
    "PrimeRC": "16899",
    "Reduction": "4225",
    "CoutPolice": "3000",
    "PrimeAG": "0",
    "Taxe": "2786",
    "Fga": "422",
    "Cedeao": "300",
    "PrimeTotale": "23407",
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
    # PrimeRC (4469) + Cedeao (300) — ici `data` vaut encore la meme chose.
    assert extract_prime_rc(REAL_RC_RESPONSE) == 4769


@pytest.mark.parametrize(
    "response",
    [REAL_RC_GARAGE_RESPONSE, REAL_RC_BUS_RESPONSE],
)
def test_extract_prime_rc_sends_data_even_when_it_looks_wrong(response):
    """`responsabiliteCivile` doit valoir `data`, aussi surprenant soit-il.

    ASS controle le montant : envoyer PrimeRC + CEDEAO fait echouer l'emission en
    4006 "Merci de renseigner une Responsabilite civile valide" (constate en
    production le 2026-08-12).
    """
    assert extract_prime_rc(response) == int(response["data"])


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (REAL_RC_GARAGE_RESPONSE, 68_831 + 300),
        (REAL_RC_BUS_RESPONSE, 16_899 + 300),
    ],
)
def test_commission_basis_ignores_data_when_it_diverges(response, expected):
    """La commission ne se calcule pas sur `data`.

    Sur ces deux reponses reelles, `data` depasse la prime totale encaissee :
    commissionner dessus paierait l'apporteur sur plus que ce que le client a
    paye. L'assiette repart de la ventilation, PrimeRC + CEDEAO.
    """
    contract = Contract(prime_rc_ass=int(response["data"]), ass_response_payload=response)

    assert contract_commission_basis(contract) == expected
    assert contract_commission_basis(contract) < int(response["PrimeTotale"])


def test_commission_basis_falls_back_when_no_breakdown():
    """Flotte, remorque, formats historiques : pas de ventilation exploitable."""
    contract = Contract(
        prime_rc_ass=24_300,
        ass_response_payload={"operationStatus": "SUCCESS", "data": "24300"},
    )

    assert contract_commission_basis(contract) == 24_300


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


# ─── Emission (reponse sandbox exacte, capturee le 2026-08-06) ───────────────
# Point critique : la reponse d'emission reelle n'a PAS de cle "data". Les
# references d'attestation sont a la RACINE. Un extract_issue_data qui exigeait
# data=dict rejetait donc une emission pourtant reussie — apres qu'ASS ait
# consomme un QR et genere l'attestation.
REAL_ISSUE_RESPONSE = {
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "referenceExterne": "HORUS-SBX-3F2A91C4D0E7",
    "linkAttestation": "https://aastest.diotali.com/#/attestation/SN004TESTF6EBFK",
    "attestationNumber": "SN004TESTF6EBFK",
    "secureKey": "xxxxxxxxxxxxxx",
    "dateExpiration": "2026-09-11 23:59:59",
    "linkCarteBrune": "https://aastest.diotali.com/#/attestation/SN004TESTF6EBFK",
    "PrimeRC": "3575",
    "Reduction": "894",
    "CoutPolice": "3000",
    "PrimeTotale": "7884",
}


def test_extract_issue_data_accepte_le_format_racine_reel():
    data = extract_issue_data(REAL_ISSUE_RESPONSE)

    assert data["attestationNumber"] == "SN004TESTF6EBFK"
    assert data["linkAttestation"].startswith("https://aastest.diotali.com/")
    assert data["linkCarteBrune"].startswith("https://aastest.diotali.com/")
    assert data["dateExpiration"] == "2026-09-11 23:59:59"


def test_extract_issue_data_accepte_toujours_le_format_mock_imbrique():
    mock = {
        "operationStatus": "SUCCESS",
        "data": {"attestationNumber": "SNMOCK0001", "linkAttestation": "https://example.test/a"},
    }

    assert extract_issue_data(mock)["attestationNumber"] == "SNMOCK0001"


def test_extract_issue_data_refuse_une_reponse_sans_attestation():
    """Une reponse SUCCESS mais vide de references reste une erreur."""
    with pytest.raises(ContractIssueError):
        extract_issue_data({"operationStatus": "SUCCESS", "data": "4769"})


def test_date_expiration_reelle_est_parsee():
    """Le format reel utilise un espace, pas le "T" du PDF."""
    parsed = parse_ass_datetime(REAL_ISSUE_RESPONSE["dateExpiration"])

    assert parsed is not None
    assert (parsed.year, parsed.month, parsed.day) == (2026, 9, 11)


def test_reduction_reelle_est_bien_appliquee_par_ass():
    """remise_rc=20 envoye -> ASS renvoie Reduction=894 et une PrimeTotale reduite."""
    assert REAL_ISSUE_RESPONSE["Reduction"] == "894"
    assert int(REAL_ISSUE_RESPONSE["PrimeTotale"]) < 8_927
