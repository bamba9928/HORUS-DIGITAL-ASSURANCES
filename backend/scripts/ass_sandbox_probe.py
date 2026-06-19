"""Sondes de validation sandbox ASS.

Valide les payloads construits par nos builders (contracts.services) contre la
sandbox reelle, sans toucher a la configuration de l'app (le .env reste en mock :
ce script force le mode reel uniquement pour son propre process).

Usage :
    uv run python backend/scripts/ass_sandbox_probe.py stock
    uv run python backend/scripts/ass_sandbox_probe.py rc-auto rc-moto
    uv run python backend/scripts/ass_sandbox_probe.py all

Les sondes "rc-*", "stock" et "verif" sont des simulations (aucun QR consomme).
La sonde "issue-mono" genere une vraie attestation sandbox (consomme 1 QR de
test) puis "cancel" l'annule : a lancer explicitement.
"""

import json
import os
import sys
from uuid import uuid4

os.environ["ASS_MOCK_ENABLED"] = "False"
os.environ["ASS_REAL_CALLS_ALLOWED"] = "True"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import django  # noqa: E402

django.setup()

from integrations.ass.client import AssClient  # noqa: E402
from integrations.ass.exceptions import AssApiError  # noqa: E402


EFFECT_DATE = "2026-06-12"

# Vehicule VP tel que le wizard le produit (valeurs par defaut assumees :
# chassis vide — facultatif —, 1ere circulation 2000-01-01, valeurs a 0).
VEHICLE_VP = {
    "brand": "TOYOTA",
    "model": "YARIS",
    "category": "C1",
    "subcategory": "VP",
    "registration": "DK-1234-AB",
    "chassis": "",
    "energy": "ESSENCE",
    "fiscalPower": "8",
    "seats": "5",
    "firstCirculationDate": "2000-01-01",
    "newValue": "0",
    "currentValue": "0",
    "effectDate": EFFECT_DATE,
    "duration": "1",
    "periodicity": "MOIS",
    "personType": "PHYSIQUE",
}

PERSON = {
    "firstName": "TEST",
    "lastName": "HORUS",
    "phone": "770000001",
    "email": "test@horus.test",
}


def show(title, payload, call):
    print(f"\n{'=' * 70}\n# {title}\n{'=' * 70}")
    print("--- payload envoye ---")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    try:
        response = call()
    except AssApiError as exc:
        print(f"--- ERREUR ASS (HTTP {exc.status_code}) ---")
        body = exc.response_body
        if isinstance(body, (dict, list)):
            print(json.dumps(body, indent=2, ensure_ascii=False))
        else:
            print(body)
        return None
    print("--- reponse ASS ---")
    print(json.dumps(response, indent=2, ensure_ascii=False))
    return response


def probe_stock(client):
    return show("stock.qr", {"code": "1000"}, lambda: client.stock_qr({"code": "1000"}))


def probe_rc_auto(client):
    from contracts.services import build_auto_rc_payload

    payload = build_auto_rc_payload(VEHICLE_VP, guarantees=[], guarantee_options={})
    return show("rc.request — VP, garanties []", payload, lambda: client.calculate_auto_rc(payload))


def probe_rc_auto_options(client):
    from contracts.services import build_auto_rc_payload

    vehicle = {**VEHICLE_VP, "newValue": "8000000", "currentValue": "5000000"}
    payload = build_auto_rc_payload(
        vehicle,
        guarantees=[1, 2, 4],
        guarantee_options={"garantiesOptPT": "OPTION_1", "garantiesOptAR": "500000", "garantiesOptAS": "OPTION_1"},
    )
    return show(
        "rc.request — VP, garanties [1,2,4] + options",
        payload,
        lambda: client.calculate_auto_rc(payload),
    )


def probe_rc_tpc(client):
    from contracts.services import build_auto_rc_payload

    vehicle = {**VEHICLE_VP, "category": "C2", "subcategory": "TPC3T500", "seats": "3"}
    payload = build_auto_rc_payload(vehicle, guarantees=[], guarantee_options={})
    show(
        "rc.request — TPC3T500 SANS chargeUtile",
        payload,
        lambda: client.calculate_auto_rc(payload),
    )

    payload_with = {**payload, "chargeUtile": 1}
    return show(
        "rc.request — TPC3T500 AVEC chargeUtile=1",
        payload_with,
        lambda: client.calculate_auto_rc(payload_with),
    )


def probe_rc_moto(client):
    from contracts.services import build_moto_rc_payload

    vehicle = {
        **VEHICLE_VP,
        "category": "C5",
        "subcategory": "2RMOT",
        "cylindree": "300",
        "motoUsage": "non_commerciale",
        "fiscalPower": "",
        "seats": "2",
    }
    payload = build_moto_rc_payload(vehicle, guarantees=[], guarantee_options={})
    response = show("rc.moto — 2RMOT usage NON_COMMERCIALE", payload, lambda: client.calculate_moto_rc(payload))

    if not response or (response.get("operationStatus") or response.get("status")) != "SUCCESS":
        payload_variant = {**payload, "usage": "NON_COMMERCIAL"}
        show(
            "rc.moto — variante usage NON_COMMERCIAL (sans E)",
            payload_variant,
            lambda: client.calculate_moto_rc(payload_variant),
        )
    return response


def probe_rc_bus(client):
    from contracts.services import build_bus_rc_payload

    vehicle = {**VEHICLE_VP, "category": "BUS", "subcategory": "BE-VTA", "seats": "30", "fiscalPower": "12"}
    payload = build_bus_rc_payload(vehicle)
    return show("bus.ecole.rc — BE-VTA", payload, lambda: client.calculate_bus_rc(payload))


def probe_rc_garage(client):
    from contracts.services import build_garage_rc_payload

    garage = {
        "subcategory": "C6-WG-4R",
        "nombreCarte": "2",
        "registration": "DK-9999-GG",
        "effectDate": EFFECT_DATE,
        "duration": "12",
        "periodicity": "MOIS",
        "personType": "MORALE",
    }
    payload = build_garage_rc_payload(garage)
    return show("rc.garage — C6-WG-4R", payload, lambda: client.calculate_garage_rc(payload))


def probe_rc_fleet(client):
    from contracts.services import build_fleet_rc_payload

    draft = {
        "referenceFlotte": f"HORUS-SBX-FLEET-{uuid4().hex[:8].upper()}",
        "fleet": {
            "effectDate": EFFECT_DATE,
            "duration": "12",
            "periodicity": "MOIS",
            "personType": "MORALE",
            "vehicles": [
                {**VEHICLE_VP, "id": "veh-1", "registration": "DK-1111-AA", "duration": "12"},
                {**VEHICLE_VP, "id": "veh-2", "registration": "DK-2222-BB", "duration": "12", "fiscalPower": "11"},
            ],
        },
        "guarantees": [],
        "guaranteeOptions": {},
    }
    payload = build_fleet_rc_payload(draft)
    return show("rc.flotte.request — 2 VP", payload, lambda: client.calculate_fleet_rc(payload))


def probe_verif(client):
    payload = {"immatriculation": "DK-1234-AB"}
    return show("verif.immatriculation", payload, lambda: client.verify_registration(payload))


def probe_issue_mono(client):
    """Genere une attestation sandbox (consomme 1 QR de test) puis l'annule."""
    from contracts.models import Contract
    from contracts.services import build_auto_issue_payload, build_auto_rc_payload, extract_prime_rc

    rc_payload = build_auto_rc_payload(VEHICLE_VP, guarantees=[], guarantee_options={})
    rc_response = client.calculate_auto_rc(rc_payload)
    prime_rc = extract_prime_rc(rc_response)
    print(f"\nPrime RC calculee pour l'emission : {prime_rc}")

    contract = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        draft_payload={
            "vehicle": VEHICLE_VP,
            "policyholder": PERSON,
            "insured": PERSON,
            "guarantees": [],
            "guaranteeOptions": {},
        },
        prime_rc_ass=prime_rc,
    )
    contract.pk = 0  # uniquement pour le numero de police de test
    reference = f"HORUS-SBX-{uuid4().hex[:12].upper()}"
    payload = build_auto_issue_payload(contract, reference)
    payload["police"] = f"HORUS-SBX-POL-{reference[-6:]}"

    response = show("qrcode.request — emission mono SANDBOX", payload, lambda: client.issue_auto_contract(payload))
    if not response or (response.get("operationStatus") or response.get("status")) != "SUCCESS":
        print("\nEmission non aboutie : pas d'annulation a tester.")
        return None

    cancel_payload = {
        "referenceTrxPartner": reference,
        "methode": "ANNULER",
        "motif": "Test integration sandbox Horus",
    }
    show("qrcode.mono.cancel — annulation du test", cancel_payload, lambda: client.cancel_attestation(cancel_payload))
    return response


PROBES = {
    "stock": probe_stock,
    "rc-auto": probe_rc_auto,
    "rc-auto-options": probe_rc_auto_options,
    "rc-tpc": probe_rc_tpc,
    "rc-moto": probe_rc_moto,
    "rc-bus": probe_rc_bus,
    "rc-garage": probe_rc_garage,
    "rc-fleet": probe_rc_fleet,
    "verif": probe_verif,
    "issue-mono": probe_issue_mono,
}

SIMULATION_PROBES = [name for name in PROBES if name != "issue-mono"]


def main():
    names = sys.argv[1:]
    if not names:
        print(__doc__)
        print(f"Sondes disponibles : {', '.join(PROBES)}, all (= simulations seulement)")
        return

    if "all" in names:
        names = SIMULATION_PROBES

    client = AssClient()
    for name in names:
        probe = PROBES.get(name)
        if probe is None:
            print(f"Sonde inconnue : {name}")
            continue
        probe(client)


if __name__ == "__main__":
    main()
