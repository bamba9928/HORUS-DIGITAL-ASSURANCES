import requests
from django.conf import settings

from integrations.ass.constants import ASS_POLICY_FEE, ASS_SUCCESS_STATUS
from integrations.ass.exceptions import AssRealCallsDisabledError


class AssClient:
    def __init__(self, *, base_url=None, partner=None, username=None, password=None):
        self.base_url = (base_url if base_url is not None else settings.ASS_BASE_URL).rstrip("/")
        self.partner = partner if partner is not None else settings.ASS_PARTNER
        self.username = username if username is not None else settings.ASS_USERNAME
        self.password = password if password is not None else settings.ASS_PASSWORD
        self.session = requests.Session()

    def calculate_auto_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_rc_response(payload)
        return self._post("/rc.request", payload)

    def calculate_moto_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_moto_rc_response(payload)
        return self._post("/rc.moto", payload)

    def calculate_fleet_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_fleet_rc_response(payload)
        return self._post("/rc.flotte.request", payload)

    def calculate_trailer_rc(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_trailer_rc_response(payload)
        return self._post("/remorque.rc.request", payload)

    def issue_auto_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_issue_response(payload)
        return self._post("/qrcode.request", payload)

    def issue_moto_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_issue_response(payload)
        return self._post("/moto.request", payload)

    def issue_fleet_contract(self, payload):
        if settings.ASS_MOCK_ENABLED:
            return self._mock_fleet_issue_response(payload)
        return self._post("/qrcode.flotte.request", payload)

    def stock_qr(self):
        if settings.ASS_MOCK_ENABLED:
            return {
                "operationStatus": ASS_SUCCESS_STATUS,
                "operationMessage": "Stock QR fictif.",
                "data": 80,
            }
        return self._post("/stock.qr", {})

    def _post(self, endpoint, payload):
        if not settings.ASS_REAL_CALLS_ALLOWED:
            raise AssRealCallsDisabledError("Les appels reels ASS sont desactives.")
        url = f"{self.base_url}/api/v1/{self.partner}{endpoint}"
        response = self.session.post(url, json=payload, auth=(self.username, self.password), timeout=30)
        response.raise_for_status()
        return response.json()

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
        reference = payload.get("referenceVehicule", "")
        prime = 0 if reference else max(2000, duree * 1000)
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
