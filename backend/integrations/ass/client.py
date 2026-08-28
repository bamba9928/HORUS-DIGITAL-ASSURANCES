import logging
import time
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.parse import urlsplit

import requests
from django.conf import settings

from integrations.ass.constants import (
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
from integrations.ass.exceptions import (
    AssApiError,
    AssConfigurationError,
    AssRealCallsDisabledError,
)

logger = logging.getLogger("integrations.ass")


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
        self._apply_session_cookie()

    def _apply_session_cookie(self):
        """Pose le cookie de session Odoo si ASS_SESSION_ID est configure.

        Contournement temporaire de la regression `dbfilter` d'ASS (voir le
        commentaire de ASS_SESSION_ID dans settings.py). Le cookie ne sert qu'a
        designer la base : c'est toujours le Basic Auth qui authentifie.

        Porte sur le seul hote d'ASS — un cookie sans domaine partirait vers
        n'importe quelle URL appelee avec cette session.
        """
        session_id = getattr(settings, "ASS_SESSION_ID", "")
        if not session_id or not self.base_url:
            return
        host = urlsplit(self.base_url).hostname
        if not host:
            return
        self.session.cookies.set("session_id", session_id, domain=host, path="/")

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
        # Endpoint primaire = qrcode.mono.cancel (PDF officiel ASS). La collection
        # Postman expose qrcode.cancel : on bascule sur ce repli UNIQUEMENT si le
        # primaire repond 404 (route inexistante) — jamais sur une erreur metier,
        # pour ecarter tout risque de double annulation.
        primary = settings.ASS_CANCEL_ENDPOINT
        fallback = settings.ASS_CANCEL_ENDPOINT_FALLBACK
        try:
            return self._post(primary, payload)
        except AssApiError as exc:
            if exc.status_code == 404 and fallback and fallback != primary:
                logger.warning(
                    "Annulation ASS : %s introuvable (404), repli sur %s.",
                    primary,
                    fallback,
                )
                return self._post(fallback, payload)
            raise

    def stock_qr(self, payload=None):
        if settings.ASS_MOCK_ENABLED:
            # Format reel : data est une chaine flottante ("-1.0" = aucun stock alloue).
            return {
                "operationStatus": ASS_SUCCESS_STATUS,
                "operationMessage": "Stock QR fictif.",
                "data": "80.0",
            }
        # ASS exige {"code": "1000"} : un corps vide part en 400 KeyError. Tous
        # les appelants le passent deja, ce defaut evite le piege au suivant.
        return self._post(ASS_ENDPOINT_STOCK_QR, payload or {"code": "1000"})

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
        started = time.monotonic()
        try:
            response = self.session.post(
                url,
                json=payload,
                auth=(self.username, self.password),
                timeout=30,
            )
        except requests.RequestException as exc:
            logger.error("Appel ASS impossible (%s): %s", endpoint, exc)
            self._log_call(
                endpoint,
                payload,
                started=started,
                success=False,
                error=f"Service injoignable : {exc}",
            )
            raise AssApiError(
                f"Appel ASS impossible ({endpoint}) : service injoignable."
            ) from exc

        if response.status_code >= 400:
            body, detail = self._parse_error_body(response)
            logger.error(
                "Erreur HTTP ASS %s sur %s — reponse: %s",
                response.status_code,
                endpoint,
                body,
            )
            message = f"Echec appel ASS {endpoint} (HTTP {response.status_code})"
            if detail:
                message = f"{message} : {detail}"
            self._log_call(
                endpoint,
                payload,
                started=started,
                success=False,
                status_code=response.status_code,
                response_payload=body,
                error=message,
            )
            raise AssApiError(
                message,
                status_code=response.status_code,
                response_body=body,
            )

        try:
            data = response.json()
        except ValueError as exc:
            logger.error("Reponse ASS non JSON sur %s: %s", endpoint, response.text[:500])
            self._log_call(
                endpoint,
                payload,
                started=started,
                success=False,
                status_code=response.status_code,
                response_payload=response.text[:2000],
                error="Reponse non JSON.",
            )
            raise AssApiError(
                f"Reponse ASS invalide ({endpoint}) : JSON attendu.",
                status_code=response.status_code,
                response_body=response.text[:2000],
            ) from exc

        self._log_call(
            endpoint,
            payload,
            started=started,
            success=True,
            status_code=response.status_code,
            response_payload=data,
        )
        return data

    @staticmethod
    def _log_call(
        endpoint,
        request_payload,
        *,
        started,
        success,
        status_code=None,
        response_payload=None,
        error="",
    ):
        """Journalise l'appel reel en base (best effort : ne casse jamais l'appel)."""
        try:
            from integrations.ass.models import AssApiLog

            if not isinstance(request_payload, (dict, list)):
                request_payload = {"raw": str(request_payload)[:2000]} if request_payload else {}
            if response_payload is None:
                response_payload = {}
            elif not isinstance(response_payload, (dict, list)):
                response_payload = {"raw": str(response_payload)[:2000]}

            AssApiLog.objects.create(
                endpoint=endpoint,
                status_code=status_code,
                success=success,
                duration_ms=int((time.monotonic() - started) * 1000),
                request_payload=request_payload,
                response_payload=response_payload,
                error_message=str(error or "")[:2000],
            )
        except Exception:
            logger.warning("Journalisation AssApiLog impossible pour %s", endpoint, exc_info=True)

    @staticmethod
    def _parse_error_body(response):
        """Retourne (corps, message metier) d'une reponse d'erreur ASS."""
        try:
            body = response.json()
        except ValueError:
            return response.text[:2000], None
        detail = None
        if isinstance(body, dict):
            detail = (
                body.get("operationMessage")
                or body.get("message")
                # ASS ecrit "error_descrip", sans le "tion" final : c'est la cle
                # qui porte le message exploitable. L'oublier faisait remonter le
                # seul "error", soit "UserError" — un contrat bloque sans dire
                # pourquoi (constate en production le 2026-08-12 sur un 400 dont
                # le vrai motif etait "Merci de choisir un option pour les
                # personnes transportees").
                or body.get("error_descrip")
                or body.get("error_description")
                or body.get("error")
            )
        return body, detail

    def _build_url(self, endpoint):
        normalized_endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        return f"{self.base_url}/api/v1/{self.partner_segment}{normalized_endpoint}"

    def _mock_rc_response(self, payload):
        puissance = int(payload.get("puissanceFiscale") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(5000, puissance * duree * 1000)
        return {
            "code": "2000",
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            **_build_rc_breakdown(prime),
        }

    def _mock_moto_rc_response(self, payload):
        cylindree = int(payload.get("cylindre") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(4000, int(cylindree / 10) * duree * 250)
        return {
            "code": "2000",
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            **_build_rc_breakdown(prime),
        }

    def _mock_fleet_rc_response(self, payload):
        # Format non valide en sandbox (bug serveur ASS sur rc.flotte.request) :
        # on conserve la structure documentee dans la collection Postman.
        items = []
        # La duree flotte n'existe qu'a la racine (comme chez ASS) : on la
        # redescend sur chaque vehicule pour tarifer, sinon le mock facturerait
        # tout le monde sur 1 mois.
        duree = payload.get("duree")
        for request in payload.get("requests", []):
            rc_response = self._mock_rc_response({"duree": duree, **request})
            items.append(
                {
                    "requestId": request.get("requestId"),
                    "responsabiliteCivile": int(rc_response["data"]),
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
            "code": "2000",
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            **_build_rc_breakdown(prime),
        }

    def _mock_bus_rc_response(self, payload):
        puissance = int(payload.get("puissanceFiscale") or 1)
        places = int(payload.get("nombrePlace") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(50000, puissance * places * duree * 500)
        return {
            "code": "2000",
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            **_build_rc_breakdown(prime),
        }

    def _mock_garage_rc_response(self, payload):
        cartes = int(payload.get("nombreCarte") or 1)
        duree = int(payload.get("duree") or 1)
        prime = max(30000, cartes * duree * 20000)
        return {
            "code": "2000",
            "operationStatus": ASS_SUCCESS_STATUS,
            "operationMessage": "Operation mockee avec succes.",
            **_build_rc_breakdown(prime),
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
        # Format reel valide en sandbox (2026-06-11) : l'API ne renvoie JAMAIS
        # les donnees du vehicule — uniquement un code statut.
        #   5006 -> vehicule deja assure ("... dispose deja d'une police chez: X")
        #   4000 -> aucune assurance digitale valide
        immatriculation = (payload.get("immatriculation") or "").strip().upper()
        compact = immatriculation.replace("-", "")
        already_insured = compact.startswith("ASS") or compact.endswith("ASS")
        if already_insured:
            return {
                "code": "5006",
                "message": (
                    f"Ce vehicule {compact} dispose deja d'une police "
                    "d'assurance chez: MOCK ASSURANCES"
                ),
                "status": "ERREUR",
                "data": "",
            }
        return {
            "code": "4000",
            "message": f"L'attestation d'assurance ({compact}) n'est pas valide.",
            "status": "ERROR",
            "data": "",
        }


def extract_available_qr(ass_response):
    """Extrait le stock QR d'une reponse stock.qr.

    La sandbox renvoie le stock en chaine flottante ("80.0", "-1.0" = aucun
    stock alloue) ; certains formats historiques utilisent un entier ou un dict.
    Retourne None si la valeur est introuvable.
    """
    data = ass_response.get("data") if isinstance(ass_response, dict) else None
    value = _coerce_stock_int(data)
    if value is not None:
        return value
    if isinstance(data, dict):
        for key in ["stock", "available", "availableQr", "qrDisponible", "nombreQr"]:
            value = _coerce_stock_int(data.get(key))
            if value is not None:
                return value
    return None


def parse_ass_amount(value, default=None):
    """Convertit un montant ASS en entier de francs, quel que soit son formatage.

    ASS formate ses montants de facon INCONSTANTE, y compris au sein d'une meme
    reponse. Releve en production le 2026-08-28 sur `rc.request` (VP) :
        "data": "51378.0", "PrimeRC": "51078.0", "PrimeTotale": "63226.0"
        "Taxe": "7571", "Fga": "1277", "Reduction": "0"
    — flottants et entiers melanges. `rc.moto`, `bus.ecole.rc` et `rc.garage`
    renvoient tout en entiers, `stock.qr` renvoie "113.0".

    `int("51378.0")` leve : tout parseur naif casse le devis, ou pire retombe
    silencieusement sur 0 et fausse l'assiette de commission. Ce formatage ne
    depend PAS de `remise_rc` (verifie avec 0 et 20 sur la meme requete).
    """
    if value is None or isinstance(value, bool) or value == "":
        return default
    if isinstance(value, int):
        return value
    try:
        return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ArithmeticError, TypeError, ValueError):
        return default


def _coerce_stock_int(value):
    return parse_ass_amount(value)


def _build_rc_breakdown(prime_rc):
    """
    Construit la ventilation au format REEL de l'API ASS (valide en sandbox le
    2026-06-11) : champs a la racine, PascalCase, montants en chaines, et `data`
    qui vaut PrimeRC + Cedeao.
    """
    taxe = round(prime_rc * 0.17)
    cedeao = 300
    fonds_garantie = round(prime_rc * 0.025)
    prime_ag = 0
    prime_totale = prime_rc + ASS_POLICY_FEE + prime_ag + taxe + fonds_garantie + cedeao
    return {
        "data": str(prime_rc + cedeao),
        "PrimeRC": str(prime_rc),
        "Reduction": "0",
        "CoutPolice": str(ASS_POLICY_FEE),
        "PrimeAG": str(prime_ag),
        "Taxe": str(taxe),
        "Fga": str(fonds_garantie),
        "Cedeao": str(cedeao),
        "PrimeTotale": str(prime_totale),
    }
