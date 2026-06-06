import requests
from django.conf import settings

from integrations.ass.constants import (
    ASS_ENDPOINT_CANCEL_ATTESTATION,
    ASS_ENDPOINT_ISSUE_AUTO,
    ASS_ENDPOINT_ISSUE_BUS,
    ASS_ENDPOINT_ISSUE_FLEET,
    ASS_ENDPOINT_ISSUE_GARAGE,
    ASS_ENDPOINT_ISSUE_MOTO,
    ASS_ENDPOINT_ISSUE_TRAILER,
    ASS_ENDPOINT_RC_AUTO,
    ASS_ENDPOINT_RC_BUS,
    ASS_ENDPOINT_RC_FLEET,
    ASS_ENDPOINT_RC_GARAGE,
    ASS_ENDPOINT_RC_MOTO,
    ASS_ENDPOINT_RC_TRAILER,
    ASS_ENDPOINT_STOCK_QR,
    ASS_ENDPOINT_VERIFY_REGISTRATION,
    ASS_POLICY_FEE,
    ASS_SUCCESS_STATUS,
)
from integrations.ass.exceptions import AssConfigurationError, AssRealCallsDisabledError


class AssClient:
    def __init__(
        self,
        *,
        base_url=None,
        partner_segment=None,
        username=None,
        password=None,
        session=None,
    ):
        self.base_url = (base_url if base_url is not None else settings.ASS_BASE_URL).rstrip("/")
        self.partner_segment = (
            partner_segment
            if partner_segment is not None
            else settings.ASS_API_PARTNER_SEGMENT
        ).strip("/")
        self.username = username if username is not None else settings.ASS_USERNAME
        self.password = password if password is not None else settings.ASS_PASSWORD
        self.session = session or requests.Session()

    def calculate_auto_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_rc_response(payload)
        return self._post(ASS_ENDPOINT_RC_AUTO, payload)

    def calculate_moto_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_moto_rc_response(payload)
        return self._post(ASS_ENDPOINT_RC_MOTO, payload)

    def calculate_fleet_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_fleet_rc_response(payload)
        return self._post(ASS_ENDPOINT_RC_FLEET, payload)

    def calculate_trailer_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_trailer_rc_response(payload)
        return self._post(ASS_ENDPOINT_RC_TRAILER, payload)

    def calculate_bus_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_bus_rc_response(payload)
        return self._post(ASS_ENDPOINT_RC_BUS, payload)

    def calculate_garage_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_garage_rc_response(payload)
        return self._post(ASS_ENDPOINT_RC_GARAGE, payload)

    def issue_auto_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_issue_response(payload)
        return self._post(ASS_ENDPOINT_ISSUE_AUTO, payload)

    def issue_moto_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_issue_response(payload)
        return self._post(ASS_ENDPOINT_ISSUE_MOTO, payload)

    def issue_fleet_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_fleet_issue_response(payload)
        return self._post(ASS_ENDPOINT_ISSUE_FLEET, payload)

    def issue_trailer_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_trailer_issue_response(payload)
        return self._post(ASS_ENDPOINT_ISSUE_TRAILER, payload)

    def issue_bus_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_issue_response(payload)
        return self._post(ASS_ENDPOINT_ISSUE_BUS, payload)

    def issue_garage_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_garage_issue_response(payload)
        return self._post(ASS_ENDPOINT_ISSUE_GARAGE, payload)

    def cancel_attestation(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_cancel_response(payload)
        return self._post(ASS_ENDPOINT_CANCEL_ATTESTATION, payload)

    def stock_qr(self, payload=None):
        if settings.ASS_MOCK_ENABLED:
            return {
                "operationStatus": ASS_SUCCESS_STATUS,
                "operationMessage": "Stock QR fictif.",
                "data": 80,
            }
        return self._post(ASS_ENDPOINT_STOCK_QR, payload or {})

    def verify_registration(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_verify_registration_response(payload)
        return self._post(ASS_ENDPOINT_VERIFY_REGISTRATION, payload)

    def _post(self, endpoint, payload):
        if not settings.ASS_REAL_CALLS_ALLOWED:
            raise AssRealCallsDisabledError("Les appels reels ASS sont desactives.")
        if not self.base_url:
            raise AssConfigurationError("ASS_BASE_URL est requis pour les appels ASS reels.")
        if not self.username or not self.password:
            raise AssConfigurationError("ASS_USERNAME et ASS_PASSWORD sont requis pour ASS.")

        url = self._build_url(endpoint)
        response = self.session.post(url, json=payload, auth=(self.username, self.password), timeout=30)
        response.raise_for_status()
        return response.json()

    def _build_url(self, endpoint):
        normalized_endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        return f"{self.base_url}/api/v1/{self.partner_segment}{normalized_endpoint}"

    def _mock_rc_response(self, payload):
        puissance = int(payload.get("puissanceFiscale") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(5000, puissance * duree * 1000)
        return {
            "code": 2000,
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            "data": prime,
        }

    def _mock_moto_rc_response(self, payload):
        cylindree = int(payload.get("cylindre") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(4000, int(cylindree / 10) * duree * 250)
        return {
            "code": 2000,
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            "data": prime,
        }

    def _mock_fleet_rc_response(self, payload):
        items = []
        for request in payload.get("requests", []):
            rc_response = self._mock_rc_response(request)
            items.append(
                {
                    "requestId": request.get("requestId"),
                    "responsabiliteCivile": rc_response["data"],
                }
            )
        return {
            "code": 2000,
            "status": ASS_SUCCESS_STATUS,
            "message": "Operation mockee avec succes.",
            "items": items,
        }

    def _mock_trailer_rc_response(self, payload):
        duree = int(payload.get("duree") or 1)
        prime = max(2000, duree * 1000)
        return {
            "code": 2000,
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            "data": prime,
        }

    def _mock_bus_rc_response(self, payload):
        puissance = int(payload.get("puissanceFiscale") or 1)
        places = int(payload.get("nombrePlace") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(50000, puissance * places * duree * 500)
        return {
            "code": 2000,
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            "data": prime,
        }

    def _mock_garage_rc_response(self, payload):
        cartes = int(payload.get("nombreCarte") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(30000, cartes * duree * 20000)
        return {
            "code": 2000,
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            "data": prime,
        }

    def _mock_issue_response(self, payload):
        reference = payload.get("referenceTrxPartner", "MOCK-REFERENCE")
        immatriculation = (payload.get("vehicule") or {}).get("immatriculation", "")
        return {
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Emission mockee avec succes.",
            "data": {
                "referenceExterne": reference,
                "attestationNumber": "SNMOCK0001",
                "secureKey": "MOCK-SECURE-KEY",
                "dateExpiration": "2026-09-01T23:59:59",
                "linkAttestation": "https://example.test/attestation/SNMOCK0001",
                "linkCarteBrune": "https://example.test/cedeao/SNMOCK0001",
                "immatriculation": immatriculation,
                "coutPolice": ASS_POLICY_FEE,
            },
        }

    def _mock_fleet_issue_response(self, payload):
        items = []
        for item in payload.get("items", []):
            vehicle = item.get("vehicule", {})
            reference = item.get("referenceTrxPartner", "MOCK-FLEET-REFERENCE")
            attestation_number = f"SNMOCK-{reference[-8:]}"
            items.append(
                {
                    "referenceExterne": reference,
                    "attestationNumber": attestation_number,
                    "secureKey": "MOCK-SECURE-KEY",
                    "dateExpiration": "2026-09-01T23:59:59",
                    "linkAttestation": f"https://example.test/attestation/{attestation_number}",
                    "linkCarteBrune": f"https://example.test/cedeao/{attestation_number}",
                    "immatriculation": vehicle.get("immatriculation", ""),
                }
            )
        return {
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Emission flotte mockee avec succes.",
            "items": items,
        }

    def _mock_trailer_issue_response(self, payload):
        reference = payload.get("referenceTrxPartner", "MOCK-TRAILER-REFERENCE")
        attestation_number = f"SNREM-{reference[-8:]}"
        return {
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Emission remorque mockee avec succes.",
            "data": {
                "referenceExterne": reference,
                "attestationNumber": attestation_number,
                "secureKey": "MOCK-TRAILER-SECURE-KEY",
                "dateExpiration": "2026-09-01T23:59:59",
                "linkAttestation": f"https://example.test/attestation/{attestation_number}",
                "linkCarteBrune": f"https://example.test/cedeao/{attestation_number}",
                "immatriculation": payload.get("immatriculation", ""),
            },
        }

    def _mock_garage_issue_response(self, payload):
        reference = payload.get("referenceTrxPartner", "MOCK-GARAGE-REFERENCE")
        attestation_number = f"SNGAR-{reference[-8:]}"
        return {
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Emission garage mockee avec succes.",
            "data": {
                "referenceExterne": reference,
                "attestationNumber": attestation_number,
                "secureKey": "MOCK-GARAGE-SECURE-KEY",
                "dateExpiration": "2026-09-01T23:59:59",
                "linkAttestation": f"https://example.test/attestation/{attestation_number}",
                "linkCarteBrune": f"https://example.test/cedeao/{attestation_number}",
                "immatriculation": payload.get("immatriculation", ""),
            },
        }

    def _mock_cancel_response(self, payload):
        return {
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Attestation annulee avec succes (mock).",
        }

    def _mock_verify_registration_response(self, payload):
        immatriculation = (payload.get("immatriculation") or "").strip().upper()
        is_registered = immatriculation.startswith("ASS-") or immatriculation.endswith("-ASS")
        return {
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Verification immatriculation mockee.",
            "data": {
                "immatriculation": immatriculation,
                "isRegistered": is_registered,
            },
        }
