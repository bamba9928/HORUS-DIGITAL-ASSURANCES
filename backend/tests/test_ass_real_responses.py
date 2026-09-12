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

# rc.request — VP, puissance 8, 12 mois, PRODUCTION (manager.ass-assurances.sn),
# capturee le 2026-08-28. Montants melanges : `data`, `PrimeRC` et `PrimeTotale`
# arrivent en FLOTTANTS, `Taxe`, `Fga`, `Cedeao` et `Reduction` en entiers. Ce
# formatage ne depend pas de `remise_rc` (identique avec 0 et avec 20).
REAL_RC_VP_PRODUCTION_RESPONSE = {
    "code": "2000",
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "data": "51378.0",
    "PrimeRC": "51078.0",
    "Reduction": "0",
    "CoutPolice": "3000",
    "PrimeAG": "0",
    "Taxe": "7571",
    "Fga": "1277",
    "Cedeao": "300",
    "PrimeTotale": "63226.0",
    "ga_def_recours": "0",
}


def test_float_formatted_amounts_do_not_break_the_quote():
    """Regression : `int("51378.0")` levait et cassait TOUT devis auto en production."""
    assert extract_prime_rc(REAL_RC_VP_PRODUCTION_RESPONSE) == 51_378


def test_float_formatted_breakdown_is_not_silently_zeroed():
    """Regression : `_safe_int` retournait 0 sur "51078.0", mettant l'assiette a zero."""
    breakdown = extract_rc_breakdown(REAL_RC_VP_PRODUCTION_RESPONSE)

    assert breakdown["prime_rc_ass"] == 51_078
    assert breakdown["prime_totale"] == 63_226
    assert breakdown["taxe"] == 7_571
    assert breakdown["cedeao"] == 300
    # Ventilation juste au franc pres, malgre le melange de formats.
    assert (
        breakdown["prime_rc_ass"]
        + breakdown["cout_police"]
        + breakdown["prime_ag"]
        + breakdown["taxe"]
        + breakdown["fonds_garantie"]
        + breakdown["cedeao"]
    ) == breakdown["prime_totale"]


def test_float_formatted_response_drives_net_a_verser_and_commission_basis():
    contract = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=51_378,
        cout_police_ass=3_000,
        ass_response_payload=REAL_RC_VP_PRODUCTION_RESPONSE,
    )

    # Net a verser = PrimeTotale - cout de police.
    assert expected_payment_amount(contract) == 60_226
    # Assiette = PrimeRC + CEDEAO. Ici elle rejoint `data` (51 078 + 300), mais
    # c'est fortuit : sur garage et bus ecole, `data` a derive loin au-dessus.
    assert contract_commission_basis(contract) == 51_378


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
        # Prime BRUTE : la PrimeRC renvoyee est nette des 20 % de remise, il faut
        # y rajouter `Reduction` avant d'ajouter la CEDEAO.
        (REAL_RC_GARAGE_RESPONSE, 68_831 + 17_208 + 300),
        (REAL_RC_BUS_RESPONSE, 16_899 + 4_225 + 300),
    ],
)
def test_commission_basis_ignores_data_when_it_diverges(response, expected):
    """La commission ne se calcule pas sur `data`, et pas sur la prime nette.

    Sur ces deux reponses reelles, `data` depasse la prime totale encaissee :
    commissionner dessus paierait Horus sur plus que ce que le client a paye.
    L'assiette repart de la ventilation.

    Elle reconstitue la prime BRUTE. Depuis le retablissement de `remise_rc` a 20
    le 2026-09-10, la `PrimeRC` renvoyee est nette de la remise accordee au
    client : s'en tenir a `PrimeRC + CEDEAO` amputerait l'assiette de 20 %.
    """
    contract = Contract(prime_rc_ass=int(response["data"]), ass_response_payload=response)
    basis = contract_commission_basis(contract)

    assert basis == expected
    # Le garde-fou d'origine — « assiette < prime totale » — ne tient plus depuis
    # la reconstitution du brut, et c'est normal : sur le garage la remise
    # (17 208) pese plus lourd que les taxes, si bien que la RC brute depasse de
    # 2,9 % la prime effectivement payee. Ce qui compte est ailleurs :
    #   1. l'assiette n'a plus rien a voir avec `data`, l'aberration d'origine ;
    #   2. la commission qui en decoule reste tres inferieure a l'encaissement,
    #      seule contrainte que `calculate_commission_amounts` fait respecter.
    assert basis < int(response["data"]) / 1.5
    encaisse = int(response["PrimeTotale"]) - int(response["CoutPolice"])
    assert basis * 0.40 < encaisse


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


def test_expected_payment_amount_is_ttc_minus_policy_fee():
    contract = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=4769,
        cout_police_ass=3000,
        ass_response_payload=REAL_RC_RESPONSE,
    )

    # PrimeTotale 8927 - cout de police 3000 : l'apporteur retient la police.
    assert expected_payment_amount(contract) == 5927


def test_expected_payment_amount_is_none_without_prime_totale():
    """Sans Prime Totale d'ASS, pas de net a verser — et surtout pas d'invention.

    Un repli existait : `prime_rc_ass + cout_police_ass`. Il fabriquait un TTC
    ampute des taxes, du FGA et de la CEDEAO, et l'apporteur reglait ce montant
    errone. Horus ne tarife pas : la seule reponse honnete est « je ne sais pas ».
    """
    contract = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=4769,
        cout_police_ass=3000,
        ass_response_payload={"operationStatus": "SUCCESS", "data": "4769"},
    )

    assert expected_payment_amount(contract) is None


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


# ─── Retablissement de remise_rc a 20 (2026-09-10) ───────────────────────────

# Reponse REELLE de l'API de production ASS pour un VP 6 CV, 1 mois, 5 places,
# avec `remise_rc = 20`. Correspond exactement a la grille tarifaire ASS
# « CATEGORIE 1 Particuliers 5 Places, 3 a 6 CV » : R. Civil 3 162, Frais 3 000,
# Taxe 863, F.G.A 79, Prime T 7 404.
REAL_RC_VP_WITH_REMISE = {
    "operationStatus": "SUCCESS",
    "operationMessage": "Opération effectuée avec succès.",
    "data": "4553",
    "PrimeRC": "3162",
    "Reduction": "791",
    "CoutPolice": "3000",
    "Taxe": "863",
    "Cedeao": "300",
    "Fga": "79",
    "PrimeTotale": "7404",
}


def test_remise_sent_to_ass_is_the_gateway_maximum():
    """20 est un plafond DUR de l'API ASS, pas une preference.

    Verifie contre la production le 2026-09-10 : `remise_rc = 40` repond
    HTTP 400 « Erreur (8OO) : la remise RC doit etre compris entre 0 et 20%. »
    Les genres TPC gardent donc leur 40 % en commission d'apport hors
    plateforme ; le client, lui, ne peut recevoir que 20 %.
    """
    from integrations.ass.referentials import (
        ASS_REMISE_RC_SENT,
        HORUS_COMMISSION_RATE_TPC,
    )

    assert ASS_REMISE_RC_SENT == 20
    assert HORUS_COMMISSION_RATE_TPC == 40, (
        "Le 40 % TPC reste la commission d'apport Horus : il ne transite pas par "
        "`remise_rc`, que la passerelle plafonne a 20."
    )


def test_quote_with_remise_matches_the_ass_price_list():
    """Le decompte renvoye reproduit la grille tarifaire ASS, ligne a ligne."""
    breakdown = extract_rc_breakdown(REAL_RC_VP_WITH_REMISE)

    assert breakdown["prime_rc_ass"] == 3_162
    assert breakdown["cout_police"] == 3_000
    assert breakdown["taxe"] == 863
    assert breakdown["fonds_garantie"] == 79
    assert breakdown["prime_totale"] == 7_404
    somme = (
        breakdown["prime_rc_ass"]
        + breakdown["cout_police"]
        + breakdown["taxe"]
        + breakdown["cedeao"]
        + breakdown["fonds_garantie"]
    )
    assert somme == breakdown["prime_totale"]


def test_commission_basis_reconstitutes_the_gross_premium():
    """La remise ne doit pas amputer l'assiette de commission de Horus.

    3 162 (net) + 791 (remise) = 3 953, soit exactement la PrimeRC que l'API
    renvoie quand `remise_rc` vaut 0. Verifie sur la production le 2026-09-10.
    """
    contract = Contract(
        prime_rc_ass=4_553, ass_response_payload=REAL_RC_VP_WITH_REMISE
    )

    assert contract_commission_basis(contract) == 3_953 + 300
