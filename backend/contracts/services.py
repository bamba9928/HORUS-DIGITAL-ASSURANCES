from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from commissions.models import CommissionSnapshot
from commissions.services import CommissionNotConfiguredError, build_commission_snapshot_values
from contracts.models import Contract
from integrations.ass.client import AssClient
from integrations.ass.constants import ASS_POLICY_FEE, ASS_SUCCESS_STATUS
from payments.services import has_confirmed_payment


class QuoteCalculationError(ValueError):
    pass


class ContractIssueError(ValueError):
    pass


def calculate_contract_quote(contract, ass_client=None):
    ass_client = ass_client or AssClient()

    if contract.contract_type == Contract.ContractType.AUTO_MONO:
        request_payload = build_auto_rc_payload(contract.draft_payload.get("vehicle", {}))
        ass_response = ass_client.calculate_auto_rc(request_payload)
        prime_rc_ass = extract_prime_rc(ass_response)
        quote = {
            "type": "AUTO_MONO",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": [],
            "warnings": [],
        }
    elif contract.contract_type == Contract.ContractType.MOTO:
        request_payload = build_moto_rc_payload(contract.draft_payload.get("vehicle", {}))
        ass_response = ass_client.calculate_moto_rc(request_payload)
        prime_rc_ass = extract_prime_rc(ass_response)
        quote = {
            "type": "MOTO",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": [],
            "warnings": ["Les valeurs usage moto restent a confirmer avec ASS avant appels reels."],
        }
    elif contract.contract_type == Contract.ContractType.FLEET:
        request_payload = build_fleet_rc_payload(contract.draft_payload)
        ass_response = ass_client.calculate_fleet_rc(request_payload)
        items = extract_fleet_items(ass_response)
        trailer_items = build_trailer_quote_items(contract.draft_payload)
        prime_rc_ass = sum(item["prime_rc_ass"] for item in items + trailer_items)
        quote = {
            "type": "FLEET",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": items + trailer_items,
            "warnings": [
                "Les remorques sont rattachees au tracteur; leur tarification reelle sera confirmee via ASS."
            ]
            if trailer_items
            else [],
        }
    else:
        raise QuoteCalculationError("Ce type de contrat n'est pas encore actif pour le devis.")

    contract.prime_rc_ass = prime_rc_ass
    contract.cout_police_ass = ASS_POLICY_FEE
    contract.ttc_ass = None
    contract.internal_status = Contract.InternalStatus.QUOTE_READY
    contract.ass_request_payload = request_payload
    contract.ass_response_payload = ass_response
    contract.save(
        update_fields=[
            "prime_rc_ass",
            "cout_police_ass",
            "ttc_ass",
            "internal_status",
            "ass_request_payload",
            "ass_response_payload",
            "updated_at",
        ]
    )

    return quote


@transaction.atomic
def issue_contract(contract, ass_client=None):
    ass_client = ass_client or AssClient()

    if contract.internal_status != Contract.InternalStatus.PAID:
        raise ContractIssueError("Le paiement doit etre confirme avant emission.")
    if not has_confirmed_payment(contract):
        raise ContractIssueError("Aucun paiement confirme pour ce contrat.")
    if contract.prime_rc_ass is None or contract.ttc_ass is None:
        raise ContractIssueError("Le devis et le montant paye sont requis avant emission.")
    if not contract.contributor.has_configured_commission:
        raise CommissionNotConfiguredError("Commission non configuree pour cet apporteur.")

    reference = contract.reference_trx_partner or build_reference_trx_partner(contract)
    contract.reference_trx_partner = reference

    if contract.contract_type == Contract.ContractType.AUTO_MONO:
        request_payload = build_auto_issue_payload(contract, reference)
        ass_response = ass_client.issue_auto_contract(request_payload)
        issue_data = extract_issue_data(ass_response)
    elif contract.contract_type == Contract.ContractType.MOTO:
        request_payload = build_moto_issue_payload(contract, reference)
        ass_response = ass_client.issue_moto_contract(request_payload)
        issue_data = extract_issue_data(ass_response)
    elif contract.contract_type == Contract.ContractType.FLEET:
        request_payload = build_fleet_issue_payload(contract, reference)
        ass_response = ass_client.issue_fleet_contract(request_payload)
        issue_data = extract_fleet_issue_data(ass_response)
    else:
        raise ContractIssueError("Ce type de contrat n'est pas encore actif pour emission.")

    snapshot_values = build_commission_snapshot_values(
        contributor=contract.contributor,
        prime_rc_ass=contract.prime_rc_ass,
        cout_police_ass=contract.cout_police_ass,
        ttc_ass=contract.ttc_ass,
    )
    CommissionSnapshot.objects.get_or_create(
        contract=contract,
        defaults={
            "contributor": contract.contributor,
            **snapshot_values,
        },
    )

    contract.internal_status = Contract.InternalStatus.ISSUED
    contract.ass_status = Contract.AssStatus.VALIDATED
    contract.immatriculation = issue_data.get("immatriculation", "")
    contract.attestation_number = issue_data.get("attestationNumber", "")
    contract.secure_key = issue_data.get("secureKey", "")
    contract.reference_externe = issue_data.get("referenceExterne", reference)
    contract.date_expiration = parse_ass_datetime(issue_data.get("dateExpiration", ""))
    contract.link_attestation_digitale = issue_data.get("linkAttestation", "")
    contract.link_attestation_cedeao = issue_data.get("linkCarteBrune", "")
    contract.ass_issue_request_payload = request_payload
    contract.ass_issue_response_payload = ass_response
    contract.save(
        update_fields=[
            "reference_trx_partner",
            "internal_status",
            "ass_status",
            "immatriculation",
            "attestation_number",
            "secure_key",
            "reference_externe",
            "date_expiration",
            "link_attestation_digitale",
            "link_attestation_cedeao",
            "ass_issue_request_payload",
            "ass_issue_response_payload",
            "updated_at",
        ]
    )

    return {
        "contract_id": contract.id,
        "internal_status": contract.internal_status,
        "ass_status": contract.ass_status,
        "reference_trx_partner": contract.reference_trx_partner,
        "reference_externe": contract.reference_externe,
        "attestation_number": contract.attestation_number,
        "secure_key": contract.secure_key,
        "date_expiration": contract.date_expiration.isoformat() if contract.date_expiration else None,
        "link_attestation_digitale": contract.link_attestation_digitale,
        "link_attestation_cedeao": contract.link_attestation_cedeao,
    }


def build_auto_rc_payload(vehicle):
    return {
        "puissanceFiscale": to_int(vehicle.get("fiscalPower"), default=1),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": "MOIS",
        "genre": vehicle.get("subcategory"),
        "nombrePlace": to_int(vehicle.get("seats"), default=1),
        "energie": vehicle.get("energy"),
        "valeurNeuve": to_int(vehicle.get("newValue"), default=0),
        "valeurActuelle": to_int(vehicle.get("currentValue"), default=0),
        "garanties": [],
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
    }


def build_auto_issue_payload(contract, reference):
    vehicle = contract.draft_payload.get("vehicle", {})
    return {
        "responsabiliteCivile": contract.prime_rc_ass,
        "dateEffet": vehicle.get("effectDate"),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": "MOIS",
        "police": f"HORUS-POL-{contract.id}",
        "referenceTrxPartner": reference,
        "typePersonne": "PHYSIQUE",
        "souscripteur": build_mock_person(),
        "assure": build_mock_person(),
        "vehicule": build_issue_vehicle_payload(vehicle),
    }


def build_moto_rc_payload(vehicle):
    return {
        "cylindre": to_int(vehicle.get("cylindree"), default=0),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": "MOIS",
        "genre": vehicle.get("subcategory"),
        "energie": vehicle.get("energy"),
        "usage": vehicle.get("motoUsage"),
        "nombrePlace": to_int(vehicle.get("seats"), default=1),
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
        "garanties": [],
    }


def build_moto_issue_payload(contract, reference):
    vehicle = contract.draft_payload.get("vehicle", {})
    return {
        "responsabiliteCivile": contract.prime_rc_ass,
        "dateEffet": vehicle.get("effectDate"),
        "dateExpiration": "",
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": "MOIS",
        "police": f"HORUS-MOTO-{contract.id}",
        "referenceTrxPartner": reference,
        "typePersonne": "PHYSIQUE",
        "souscripteur": build_mock_person(),
        "assure": build_mock_person(),
        "vehicule": {
            **build_issue_vehicle_payload(vehicle),
            "cylindre": to_int(vehicle.get("cylindree"), default=0),
            "usage": vehicle.get("motoUsage"),
        },
    }


def build_fleet_rc_payload(draft_payload):
    vehicles = draft_payload.get("fleet", {}).get("vehicles", [])
    return {
        "referenceFlotte": draft_payload.get("referenceFlotte", "HORUS-DRAFT-FLEET"),
        "periodicite": "MOIS",
        "duree": to_int(first_value(vehicles, "duration"), default=1),
        "dateEffet": first_value(vehicles, "effectDate") or "",
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
        "requests": [
            {
                "requestId": vehicle.get("id"),
                "puissanceFiscale": to_int(vehicle.get("fiscalPower"), default=1),
                "duree": to_int(vehicle.get("duration"), default=1),
                "genre": vehicle.get("subcategory"),
                "energie": vehicle.get("energy"),
                "valeurNeuve": to_int(vehicle.get("newValue"), default=0),
                "valeurActuelle": to_int(vehicle.get("currentValue"), default=0),
                "garanties": [],
            }
            for vehicle in vehicles
        ],
    }


def build_fleet_issue_payload(contract, reference):
    vehicles = contract.draft_payload.get("fleet", {}).get("vehicles", [])
    return {
        "referenceFlotte": f"HORUS-FLEET-{contract.id}",
        "dateEffet": first_value(vehicles, "effectDate") or "",
        "duree": to_int(first_value(vehicles, "duration"), default=1),
        "periodicite": "MOIS",
        "typePersonne": "MORALE",
        "police": f"HORUS-FLEET-POL-{contract.id}",
        "souscripteur": build_mock_person(),
        "items": [
            {
                "responsabiliteCivile": 0,
                "referenceTrxPartner": f"{reference}-{index}",
                "assure": build_mock_person(),
                "vehicule": build_issue_vehicle_payload(vehicle),
            }
            for index, vehicle in enumerate(vehicles, start=1)
        ],
    }


def build_issue_vehicle_payload(vehicle):
    return {
        "puissanceFiscale": to_int(vehicle.get("fiscalPower"), default=1),
        "dateMiseCirculation": vehicle.get("firstCirculationDate") or "",
        "nombrePlace": to_int(vehicle.get("seats"), default=1),
        "valeurNeuve": to_int(vehicle.get("newValue"), default=0),
        "valeurActuelle": to_int(vehicle.get("currentValue"), default=0),
        "immatriculation": vehicle.get("registration") or "",
        "energie": vehicle.get("energy") or "",
        "genre": vehicle.get("subcategory") or "",
        "modele": vehicle.get("model") or "",
        "marque": vehicle.get("brand") or "",
        "chassis": vehicle.get("chassis") or "",
    }


def build_mock_person():
    return {
        "nom": "DEMO",
        "prenom": "HORUS",
        "cellulaire": "770000000",
        "email": "demo@horus.test",
    }


def build_trailer_quote_items(draft_payload):
    items = []
    for vehicle in draft_payload.get("fleet", {}).get("vehicles", []):
        for index, trailer in enumerate(vehicle.get("trailers", []), start=1):
            items.append(
                {
                    "request_id": trailer.get("id"),
                    "label": trailer.get("registration") or trailer.get("chassis") or "Remorque",
                    "prime_rc_ass": 0 if index == 1 else 0,
                    "kind": "TRAILER",
                    "tractor_vehicle_id": vehicle.get("id"),
                }
            )
    return items


def extract_prime_rc(ass_response):
    if ass_response.get("operationStatus") != ASS_SUCCESS_STATUS:
        raise QuoteCalculationError(ass_response.get("operationMessage", "Calcul ASS echoue."))
    try:
        return int(ass_response["data"])
    except (KeyError, TypeError, ValueError) as exc:
        raise QuoteCalculationError("Reponse ASS invalide pour la Prime RC.") from exc


def extract_fleet_items(ass_response):
    status = ass_response.get("status") or ass_response.get("operationStatus")
    if status != ASS_SUCCESS_STATUS:
        raise QuoteCalculationError(ass_response.get("message") or ass_response.get("operationMessage") or "Calcul ASS echoue.")

    items = []
    for item in ass_response.get("items", []):
        try:
            prime_rc_ass = int(item["responsabiliteCivile"])
        except (KeyError, TypeError, ValueError) as exc:
            raise QuoteCalculationError("Reponse ASS flotte invalide.") from exc
        items.append(
            {
                "request_id": item.get("requestId"),
                "label": item.get("requestId"),
                "prime_rc_ass": prime_rc_ass,
                "kind": "VEHICLE",
            }
        )
    return items


def extract_issue_data(ass_response):
    if ass_response.get("operationStatus") != ASS_SUCCESS_STATUS:
        raise ContractIssueError(ass_response.get("operationMessage", "Emission ASS echouee."))
    data = ass_response.get("data")
    if not isinstance(data, dict):
        raise ContractIssueError("Reponse ASS emission invalide.")
    return data


def extract_fleet_issue_data(ass_response):
    if ass_response.get("operationStatus") != ASS_SUCCESS_STATUS:
        raise ContractIssueError(ass_response.get("operationMessage", "Emission ASS echouee."))
    items = ass_response.get("items") or []
    if not items:
        raise ContractIssueError("Reponse ASS emission flotte invalide.")
    return items[0]


def build_reference_trx_partner(contract):
    return f"HORUS-{contract.id}-{uuid4().hex[:12].upper()}"


def parse_ass_datetime(value):
    parsed = parse_datetime(value) if value else None
    if parsed and timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def to_int(value, default=0):
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Valeur numerique invalide.") from exc


def first_value(items, key):
    for item in items:
        if item.get(key):
            return item[key]
    return None
