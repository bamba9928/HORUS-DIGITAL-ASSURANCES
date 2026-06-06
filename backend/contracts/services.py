from calendar import monthrange
from datetime import date, timedelta
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from commissions.models import CommissionSnapshot
from commissions.services import CommissionNotConfiguredError, build_commission_snapshot_values
from contracts.models import Contract
from integrations.ass.client import AssClient
from integrations.ass.constants import ASS_CANCEL_METHODS, ASS_POLICY_FEE, ASS_SUCCESS_STATUS
from payments.services import has_confirmed_payment


class QuoteCalculationError(ValueError):
    pass


class ContractIssueError(ValueError):
    pass


class ContractCancelError(ValueError):
    pass


def calculate_contract_quote(contract, ass_client=None):
    ass_client = ass_client or AssClient()
    guarantees = selected_guarantees(contract.draft_payload)
    guarantee_options = selected_guarantee_options(contract.draft_payload)

    if contract.contract_type == Contract.ContractType.AUTO_MONO:
        request_payload = build_auto_rc_payload(
            contract.draft_payload.get("vehicle", {}),
            guarantees=guarantees,
            guarantee_options=guarantee_options,
        )
        ass_response = ass_client.calculate_auto_rc(request_payload)
        prime_rc_ass = extract_prime_rc(ass_response)
        response_payload = ass_response
        quote = {
            "type": "AUTO_MONO",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": [],
            "warnings": [],
        }
    elif contract.contract_type == Contract.ContractType.MOTO:
        request_payload = build_moto_rc_payload(
            contract.draft_payload.get("vehicle", {}),
            guarantees=guarantees,
            guarantee_options=guarantee_options,
        )
        ass_response = ass_client.calculate_moto_rc(request_payload)
        prime_rc_ass = extract_prime_rc(ass_response)
        response_payload = ass_response
        quote = {
            "type": "MOTO",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": [],
            "warnings": [],
        }
    elif contract.contract_type == Contract.ContractType.FLEET:
        fleet_request_payload = build_fleet_rc_payload(contract.draft_payload)
        fleet_response = ass_client.calculate_fleet_rc(fleet_request_payload)
        items = extract_fleet_items(fleet_response)
        trailer_quote = calculate_trailer_quote_items(contract.draft_payload, ass_client)
        trailer_items = trailer_quote["items"]
        request_payload = {
            "flotte": fleet_request_payload,
            "remorques": trailer_quote["requests"],
        }
        response_payload = {
            "flotte": fleet_response,
            "remorques": trailer_quote["responses"],
        }
        prime_rc_ass = sum(item["prime_rc_ass"] for item in items + trailer_items)
        quote = {
            "type": "FLEET",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": items + trailer_items,
            "warnings": [],
        }
    elif contract.contract_type == Contract.ContractType.BUS_SCHOOL:
        request_payload = build_bus_rc_payload(contract.draft_payload.get("vehicle", {}))
        ass_response = ass_client.calculate_bus_rc(request_payload)
        prime_rc_ass = extract_prime_rc(ass_response)
        response_payload = ass_response
        quote = {
            "type": "BUS_SCHOOL",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": [],
            "warnings": [],
        }
    elif contract.contract_type == Contract.ContractType.GARAGE:
        request_payload = build_garage_rc_payload(contract.draft_payload.get("garage", {}))
        ass_response = ass_client.calculate_garage_rc(request_payload)
        prime_rc_ass = extract_prime_rc(ass_response)
        response_payload = ass_response
        quote = {
            "type": "GARAGE",
            "prime_rc_ass": prime_rc_ass,
            "policy_fee_ass": ASS_POLICY_FEE,
            "items": [],
            "warnings": [],
        }
    else:
        raise QuoteCalculationError("Ce type de contrat n'est pas encore actif pour le devis.")

    contract.prime_rc_ass = prime_rc_ass
    contract.cout_police_ass = ASS_POLICY_FEE
    contract.ttc_ass = None
    contract.internal_status = Contract.InternalStatus.QUOTE_READY
    contract.ass_request_payload = request_payload
    contract.ass_response_payload = response_payload
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
        fleet_request_payload = build_fleet_issue_payload(contract, reference)
        fleet_response = ass_client.issue_fleet_contract(fleet_request_payload)
        fleet_issue_items = extract_fleet_issue_items(fleet_response)
        trailer_request_payloads = build_fleet_trailer_issue_payloads(
            contract=contract,
            reference=reference,
            fleet_request_payload=fleet_request_payload,
            fleet_issue_items=fleet_issue_items,
        )
        trailer_responses = []
        for trailer_payload in trailer_request_payloads:
            trailer_response = ass_client.issue_trailer_contract(trailer_payload)
            extract_issue_data(trailer_response)
            trailer_responses.append(trailer_response)
        request_payload = {
            "flotte": fleet_request_payload,
            "remorques": trailer_request_payloads,
        }
        ass_response = {
            "flotte": fleet_response,
            "remorques": trailer_responses,
        }
        issue_data = fleet_issue_items[0]
    elif contract.contract_type == Contract.ContractType.BUS_SCHOOL:
        request_payload = build_bus_issue_payload(contract, reference)
        ass_response = ass_client.issue_bus_contract(request_payload)
        issue_data = extract_issue_data(ass_response)
    elif contract.contract_type == Contract.ContractType.GARAGE:
        request_payload = build_garage_issue_payload(contract, reference)
        ass_response = ass_client.issue_garage_contract(request_payload)
        issue_data = extract_issue_data(ass_response)
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


@transaction.atomic
def cancel_contract(contract, method, motif="", ass_client=None):
    ass_client = ass_client or AssClient()
    if contract.internal_status != Contract.InternalStatus.ISSUED:
        raise ContractCancelError("Seuls les contrats emis peuvent etre annules.")
    if method not in ASS_CANCEL_METHODS:
        raise ContractCancelError(
            f"Methode invalide. Valeurs acceptees: {', '.join(sorted(ASS_CANCEL_METHODS))}"
        )
    if not contract.reference_trx_partner:
        raise ContractCancelError("Reference de transaction requise pour l'annulation.")

    request_payload = {
        "referenceTrxPartner": contract.reference_trx_partner,
        "methode": method,
        "motif": motif,
    }
    ass_response = ass_client.cancel_attestation(request_payload)
    if not is_success_response(ass_response):
        raise ContractCancelError(response_message(ass_response, "Annulation ASS echouee."))

    contract.internal_status = Contract.InternalStatus.CANCELLED
    contract.ass_status = Contract.AssStatus.CANCELLED
    contract.save(update_fields=["internal_status", "ass_status", "updated_at"])

    snapshot = getattr(contract, "commission_snapshot", None)
    if snapshot is not None:
        snapshot.status = CommissionSnapshot.Status.CANCELLED
        snapshot.save(update_fields=["status", "updated_at"])

    return {
        "contract_id": contract.id,
        "internal_status": contract.internal_status,
        "ass_status": contract.ass_status,
    }


def build_auto_rc_payload(vehicle, guarantees=None, guarantee_options=None):
    periodicity = vehicle_periodicity(vehicle)
    return {
        "puissanceFiscale": to_int(vehicle.get("fiscalPower"), default=1),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": periodicity,
        "genre": vehicle.get("subcategory"),
        "nombrePlace": to_int(vehicle.get("seats"), default=1),
        "energie": vehicle.get("energy"),
        "valeurNeuve": to_int(vehicle.get("newValue"), default=0),
        "valeurActuelle": to_int(vehicle.get("currentValue"), default=0),
        "garanties": normalize_guarantees(guarantees),
        **guarantee_options_for_payload(guarantees, guarantee_options),
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
    }


def build_auto_issue_payload(contract, reference):
    vehicle = contract.draft_payload.get("vehicle", {})
    periodicity = vehicle_periodicity(vehicle)
    policyholder = policyholder_payload(contract.draft_payload)
    insured = insured_payload(contract.draft_payload)
    guarantee_options = selected_guarantee_options(contract.draft_payload)
    return {
        "responsabiliteCivile": contract.prime_rc_ass,
        "dateEffet": vehicle.get("effectDate"),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": periodicity,
        "police": f"HORUS-POL-{contract.id}",
        "referenceTrxPartner": reference,
        "typePersonne": vehicle_person_type(vehicle, default="PHYSIQUE"),
        "garanties": selected_guarantees(contract.draft_payload),
        **guarantee_options,
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
        "souscripteur": policyholder,
        "assure": insured,
        "vehicule": build_issue_vehicle_payload(vehicle),
    }


def build_moto_rc_payload(vehicle, guarantees=None, guarantee_options=None):
    periodicity = vehicle_periodicity(vehicle)
    return {
        "cylindre": to_int(vehicle.get("cylindree"), default=0),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": periodicity,
        "genre": vehicle.get("subcategory"),
        "energie": vehicle.get("energy"),
        "usage": normalize_moto_usage(vehicle.get("motoUsage")),
        "nombrePlace": to_int(vehicle.get("seats"), default=1),
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
        "garanties": normalize_guarantees(guarantees),
        **guarantee_options_for_payload(guarantees, guarantee_options),
    }


def build_moto_issue_payload(contract, reference):
    vehicle = contract.draft_payload.get("vehicle", {})
    duration = to_int(vehicle.get("duration"), default=1)
    periodicity = vehicle_periodicity(vehicle)
    policyholder = policyholder_payload(contract.draft_payload)
    insured = insured_payload(contract.draft_payload)
    guarantee_options = selected_guarantee_options(contract.draft_payload)
    return {
        "responsabiliteCivile": contract.prime_rc_ass,
        "dateEffet": vehicle.get("effectDate"),
        "dateExpiration": calculate_expiration_date(
            vehicle.get("effectDate"),
            duration,
            periodicity,
        ),
        "duree": duration,
        "periodicite": periodicity,
        "police": f"HORUS-MOTO-{contract.id}",
        "referenceTrxPartner": reference,
        "typePersonne": vehicle_person_type(vehicle, default="PHYSIQUE"),
        "garanties": selected_guarantees(contract.draft_payload),
        **guarantee_options,
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
        "souscripteur": policyholder,
        "assure": insured,
        "vehicule": {
            **build_issue_vehicle_payload(vehicle),
            "cylindre": to_int(vehicle.get("cylindree"), default=0),
            "usage": normalize_moto_usage(vehicle.get("motoUsage")),
        },
    }


def build_fleet_rc_payload(draft_payload):
    vehicles = draft_payload.get("fleet", {}).get("vehicles", [])
    periodicity = first_vehicle_periodicity(vehicles)
    guarantees = selected_guarantees(draft_payload)
    guarantee_options = selected_guarantee_options(draft_payload)
    return {
        "referenceFlotte": draft_payload.get("referenceFlotte", "HORUS-DRAFT-FLEET"),
        "periodicite": periodicity,
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
                "garanties": guarantees,
                **guarantee_options,
            }
            for vehicle in vehicles
        ],
    }


def build_fleet_issue_payload(contract, reference):
    vehicles = contract.draft_payload.get("fleet", {}).get("vehicles", [])
    prime_by_request_id = get_fleet_prime_rc_by_request_id(contract)
    periodicity = first_vehicle_periodicity(vehicles)
    guarantees = selected_guarantees(contract.draft_payload)
    guarantee_options = selected_guarantee_options(contract.draft_payload)
    policyholder = policyholder_payload(contract.draft_payload)
    insured = insured_payload(contract.draft_payload)
    return {
        "referenceFlotte": f"HORUS-FLEET-{contract.id}",
        "dateEffet": first_value(vehicles, "effectDate") or "",
        "duree": to_int(first_value(vehicles, "duration"), default=1),
        "periodicite": periodicity,
        "typePersonne": first_vehicle_person_type(vehicles, default="MORALE"),
        "police": f"HORUS-FLEET-POL-{contract.id}",
        "cout_police": ASS_POLICY_FEE,
        "remise_rc": 0,
        "souscripteur": policyholder,
        "items": [
            {
                "responsabiliteCivile": prime_by_request_id.get(vehicle.get("id"), 0),
                "referenceTrxPartner": f"{reference}-{index}",
                "assure": insured,
                "vehicule": build_issue_vehicle_payload(
                    vehicle,
                    guarantees=guarantees,
                    guarantee_options=guarantee_options,
                ),
            }
            for index, vehicle in enumerate(vehicles, start=1)
        ],
    }


def build_issue_vehicle_payload(vehicle, guarantees=None, guarantee_options=None):
    payload = {
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
    if guarantees is not None:
        payload["garanties"] = normalize_guarantees(guarantees)
        payload.update(guarantee_options_for_payload(guarantees, guarantee_options))
    return payload


def calculate_trailer_quote_items(draft_payload, ass_client):
    items = []
    requests = []
    responses = []
    for vehicle in draft_payload.get("fleet", {}).get("vehicles", []):
        for index, trailer in enumerate(vehicle.get("trailers", []), start=1):
            if index == 1:
                prime_rc_ass = 0
                request_payload = None
                response_payload = {
                    "operationStatus": ASS_SUCCESS_STATUS,
                    "operationMessage": "Premiere remorque rattachee au tracteur, RC a zero.",
                    "data": 0,
                }
            else:
                request_payload = build_trailer_rc_payload(vehicle, trailer)
                response_payload = ass_client.calculate_trailer_rc(request_payload)
                prime_rc_ass = extract_prime_rc(response_payload)

            if request_payload:
                requests.append(
                    {
                        "vehicle_id": vehicle.get("id"),
                        "trailer_id": trailer.get("id"),
                        "payload": request_payload,
                    }
                )
            responses.append(
                {
                    "vehicle_id": vehicle.get("id"),
                    "trailer_id": trailer.get("id"),
                    "payload": response_payload,
                    "prime_rc_ass": prime_rc_ass,
                }
            )
            items.append(
                {
                    "request_id": trailer.get("id"),
                    "label": trailer.get("registration") or trailer.get("chassis") or "Remorque",
                    "prime_rc_ass": prime_rc_ass,
                    "kind": "TRAILER",
                    "tractor_vehicle_id": vehicle.get("id"),
                }
            )
    return {"items": items, "requests": requests, "responses": responses}


def build_trailer_rc_payload(vehicle, trailer):
    periodicity = vehicle_periodicity(trailer, default=vehicle_periodicity(vehicle))
    return {
        "duree": to_int(trailer.get("duration") or vehicle.get("duration"), default=1),
        "periodicite": periodicity,
        "referenceVehicule": vehicle.get("registration")
        or vehicle.get("chassis")
        or vehicle.get("id")
        or "",
    }


def build_fleet_trailer_issue_payloads(
    *,
    contract,
    reference,
    fleet_request_payload,
    fleet_issue_items,
):
    vehicles = contract.draft_payload.get("fleet", {}).get("vehicles", [])
    trailer_prime_by_id = get_trailer_prime_rc_by_id(contract)
    policyholder = policyholder_payload(contract.draft_payload)
    insured = insured_payload(contract.draft_payload)
    issued_vehicles_by_reference = {
        item.get("referenceExterne"): item for item in fleet_issue_items
    }
    payloads = []

    for vehicle_index, vehicle in enumerate(vehicles, start=1):
        vehicle_request_item = fleet_request_payload["items"][vehicle_index - 1]
        vehicle_issue_data = issued_vehicles_by_reference.get(
            vehicle_request_item["referenceTrxPartner"],
            {},
        )
        reference_vehicule = (
            vehicle_issue_data.get("referenceExterne")
            or vehicle_request_item["referenceTrxPartner"]
        )
        for trailer_index, trailer in enumerate(vehicle.get("trailers", []), start=1):
            duration = to_int(trailer.get("duration") or vehicle.get("duration"), default=1)
            periodicity = vehicle_periodicity(trailer, default=vehicle_periodicity(vehicle))
            payloads.append(
                {
                    "responsabiliteCivile": trailer_prime_by_id.get(trailer.get("id"), 0),
                    "dateEffet": trailer.get("effectDate") or vehicle.get("effectDate") or "",
                    "dateExpiration": calculate_expiration_date(
                        trailer.get("effectDate") or vehicle.get("effectDate"),
                        duration,
                        periodicity,
                    ),
                    "duree": duration,
                    "periodicite": periodicity,
                    "police": f"HORUS-REM-{contract.id}-{vehicle_index}-{trailer_index}",
                    "referenceVehicule": reference_vehicule,
                    "referenceTrxPartner": (
                        f"{reference}-REM-{vehicle_index}-{trailer_index}"
                    ),
                    "typePersonne": vehicle_person_type(
                        trailer,
                        default=vehicle_person_type(vehicle, default="MORALE"),
                    ),
                    "immatriculation": trailer.get("registration") or "",
                    "marque": trailer.get("brand") or "",
                    "modele": trailer.get("model") or "",
                    "energie": vehicle.get("energy") or "",
                    "souscripteur": policyholder,
                    "assure": insured,
                }
            )

    return payloads


def build_bus_rc_payload(vehicle):
    return {
        "puissanceFiscale": to_int(vehicle.get("fiscalPower"), default=1),
        "duree": to_int(vehicle.get("duration"), default=1),
        "periodicite": vehicle_periodicity(vehicle),
        "genre": vehicle.get("subcategory"),
        "energie": vehicle.get("energy"),
        "nombrePlace": to_int(vehicle.get("seats"), default=1),
    }


def build_bus_issue_payload(contract, reference):
    vehicle = contract.draft_payload.get("vehicle", {})
    duration = to_int(vehicle.get("duration"), default=1)
    periodicity = vehicle_periodicity(vehicle)
    policyholder = policyholder_payload(contract.draft_payload)
    insured = insured_payload(contract.draft_payload)
    return {
        "responsabiliteCivile": contract.prime_rc_ass,
        "dateEffet": vehicle.get("effectDate"),
        "dateExpiration": calculate_expiration_date(vehicle.get("effectDate"), duration, periodicity),
        "duree": duration,
        "periodicite": periodicity,
        "police": f"HORUS-BUS-{contract.id}",
        "referenceTrxPartner": reference,
        "souscripteur": policyholder,
        "assure": insured,
        "vehicule": {
            **build_issue_vehicle_payload(vehicle),
            "nombrePlace": to_int(vehicle.get("seats"), default=1),
        },
    }


def build_garage_rc_payload(garage):
    return {
        "duree": to_int(garage.get("duration"), default=1),
        "periodicite": vehicle_periodicity(garage),
        "genre": garage.get("subcategory"),
        "nombreCarte": to_int(garage.get("nombreCarte"), default=1),
    }


def build_garage_issue_payload(contract, reference):
    garage = contract.draft_payload.get("garage", {})
    duration = to_int(garage.get("duration"), default=1)
    periodicity = vehicle_periodicity(garage)
    policyholder = policyholder_payload(contract.draft_payload)
    insured = insured_payload(contract.draft_payload)
    return {
        "responsabiliteCivile": contract.prime_rc_ass,
        "dateEffet": garage.get("effectDate"),
        "dateExpiration": calculate_expiration_date(garage.get("effectDate"), duration, periodicity),
        "duree": duration,
        "periodicite": periodicity,
        "genre": garage.get("subcategory"),
        "nombreCarte": to_int(garage.get("nombreCarte"), default=1),
        "immatriculation": garage.get("registration") or "",
        "police": f"HORUS-GARAGE-{contract.id}",
        "referenceTrxPartner": reference,
        "souscripteur": policyholder,
        "assure": insured,
    }


def extract_prime_rc(ass_response):
    if not is_success_response(ass_response):
        raise QuoteCalculationError(response_message(ass_response, "Calcul ASS echoue."))
    try:
        return int(ass_response["data"])
    except (KeyError, TypeError, ValueError) as exc:
        raise QuoteCalculationError("Reponse ASS invalide pour la Prime RC.") from exc


def extract_fleet_items(ass_response):
    if not is_success_response(ass_response):
        raise QuoteCalculationError(response_message(ass_response, "Calcul ASS echoue."))

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
    if not is_success_response(ass_response):
        raise ContractIssueError(response_message(ass_response, "Emission ASS echouee."))
    data = ass_response.get("data")
    if not isinstance(data, dict):
        raise ContractIssueError("Reponse ASS emission invalide.")
    return data


def extract_fleet_issue_data(ass_response):
    return extract_fleet_issue_items(ass_response)[0]


def extract_fleet_issue_items(ass_response):
    if not is_success_response(ass_response):
        raise ContractIssueError(response_message(ass_response, "Emission ASS echouee."))
    items = ass_response.get("items") or []
    if not items:
        raise ContractIssueError("Reponse ASS emission flotte invalide.")
    return items


def get_fleet_prime_rc_by_request_id(contract):
    fleet_response = get_stored_fleet_response(contract)
    return {
        item["request_id"]: item["prime_rc_ass"]
        for item in extract_fleet_items(fleet_response)
        if item.get("request_id")
    }


def get_trailer_prime_rc_by_id(contract):
    response_payload = contract.ass_response_payload or {}
    trailer_responses = response_payload.get("remorques", [])
    if not isinstance(trailer_responses, list):
        return {}

    primes = {}
    for item in trailer_responses:
        if not isinstance(item, dict):
            continue
        trailer_id = item.get("trailer_id")
        if trailer_id:
            primes[trailer_id] = int(item.get("prime_rc_ass") or 0)
    return primes


def get_stored_fleet_response(contract):
    response_payload = contract.ass_response_payload or {}
    if isinstance(response_payload.get("flotte"), dict):
        return response_payload["flotte"]
    return response_payload


def is_success_response(ass_response):
    return (ass_response.get("operationStatus") or ass_response.get("status")) == ASS_SUCCESS_STATUS


def response_message(ass_response, fallback):
    return (
        ass_response.get("operationMessage")
        or ass_response.get("message")
        or ass_response.get("error_descrip")
        or ass_response.get("error_description")
        or ass_response.get("error")
        or fallback
    )


def build_reference_trx_partner(contract):
    return f"HORUS-{contract.id}-{uuid4().hex[:12].upper()}"


def parse_ass_datetime(value):
    parsed = parse_datetime(value) if value else None
    if parsed and timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def calculate_expiration_date(effect_date, duration, periodicity):
    if not effect_date:
        return ""

    try:
        start_date = date.fromisoformat(effect_date)
    except ValueError as exc:
        raise ValidationError("Date d'effet invalide.") from exc
    if periodicity == "JOUR":
        expiration = start_date + timedelta(days=duration) - timedelta(days=1)
    else:
        expiration = add_months(start_date, duration) - timedelta(days=1)
    return expiration.isoformat()


def add_months(value, months):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def normalize_moto_usage(value):
    mapping = {
        "COMMERCIAL": "commerciale",
        "COMMERCIALE": "commerciale",
        "commerciale": "commerciale",
        "NON_COMMERCIAL": "non_commerciale",
        "NON_COMMERCIALE": "non_commerciale",
        "non_commercial": "non_commerciale",
        "non_commerciale": "non_commerciale",
    }
    return mapping.get(value, value)


def vehicle_periodicity(vehicle, default="MOIS"):
    return normalize_periodicity(
        vehicle.get("periodicity") or vehicle.get("periodicite") or default
    )


def first_vehicle_periodicity(vehicles, default="MOIS"):
    return normalize_periodicity(
        first_value(vehicles, "periodicity") or first_value(vehicles, "periodicite") or default
    )


def normalize_periodicity(value):
    normalized = str(value or "MOIS").upper()
    if normalized not in {"JOUR", "MOIS"}:
        raise ValidationError("Periodicite ASS invalide.")
    return normalized


def vehicle_person_type(vehicle, default):
    return normalize_person_type(
        vehicle.get("personType") or vehicle.get("typePersonne") or default
    )


def first_vehicle_person_type(vehicles, default):
    return normalize_person_type(
        first_value(vehicles, "personType") or first_value(vehicles, "typePersonne") or default
    )


def normalize_person_type(value):
    normalized = str(value or "").upper()
    if normalized not in {"PHYSIQUE", "MORALE"}:
        raise ValidationError("Type personne ASS invalide.")
    return normalized


def selected_guarantees(draft_payload):
    return normalize_guarantees(draft_payload.get("guarantees") or draft_payload.get("garanties"))


def normalize_guarantees(values):
    if not values:
        return []
    if not isinstance(values, list):
        raise ValidationError("Garanties ASS invalides.")

    normalized = []
    allowed = set(range(1, 9))
    for value in values:
        try:
            guarantee = int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError("Garanties ASS invalides.") from exc
        if guarantee not in allowed:
            raise ValidationError("Garantie ASS inconnue.")
        if guarantee not in normalized:
            normalized.append(guarantee)
    return sorted(normalized)


def selected_guarantee_options(draft_payload):
    options = draft_payload.get("guaranteeOptions") or {}
    if not isinstance(options, dict):
        raise ValidationError("Options de garanties ASS invalides.")
    return guarantee_options_for_payload(selected_guarantees(draft_payload), options)


def guarantee_options_for_payload(guarantees, options):
    normalized = normalize_guarantee_options(options)
    validate_guarantee_option_dependencies(guarantees, normalized)
    return normalized


def normalize_guarantee_options(options):
    if not options:
        return {}
    if not isinstance(options, dict):
        raise ValidationError("Options de garanties ASS invalides.")

    allowed_values = {
        "garantiesOptPT": {"OPTION_1"},
        "garantiesOptAR": {"500000", "CAPITAL"},
        "garantiesOptAS": {"OPTION_1"},
    }
    normalized = {}
    unknown_fields = [
        key
        for key, value in options.items()
        if key not in allowed_values and value not in (None, "")
    ]
    if unknown_fields:
        raise ValidationError("Option de garantie ASS inconnue.")

    for key, allowed in allowed_values.items():
        value = options.get(key)
        if value in (None, ""):
            continue
        value = str(value)
        if value not in allowed:
            raise ValidationError("Option de garantie ASS inconnue.")
        normalized[key] = value
    return normalized


def validate_guarantee_option_dependencies(guarantees, options):
    guarantee_values = set(normalize_guarantees(guarantees))
    requirements = {
        "garantiesOptPT": 2,
        "garantiesOptAR": 4,
    }
    for field, required_guarantee in requirements.items():
        if field in options and required_guarantee not in guarantee_values:
            raise ValidationError(
                f"{field} requiert la garantie ASS {required_guarantee}."
            )


def validate_guarantee_configuration(draft_payload):
    if not isinstance(draft_payload, dict):
        raise ValidationError("Brouillon contrat invalide.")
    selected_guarantees(draft_payload)
    selected_guarantee_options(draft_payload)


def policyholder_payload(draft_payload):
    return person_payload(
        draft_payload.get("policyholder") or draft_payload.get("souscripteur"),
        label="Souscripteur",
    )


def insured_payload(draft_payload):
    return person_payload(
        draft_payload.get("insured") or draft_payload.get("assure"),
        label="Assure",
    )


def person_payload(value, label):
    if not isinstance(value, dict):
        raise ValidationError(f"{label} requis avant emission.")

    last_name = first_present(value, ["lastName", "last_name", "nom", "raisonSociale"])
    phone = first_present(value, ["phone", "cellulaire", "telephone"])
    if not last_name or not phone:
        raise ValidationError(f"{label}: nom et telephone requis avant emission.")

    return {
        "nom": last_name,
        "prenom": first_present(value, ["firstName", "first_name", "prenom"]),
        "cellulaire": phone,
        "email": first_present(value, ["email"]),
    }


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


def first_present(payload, keys):
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return str(value)
    return ""
