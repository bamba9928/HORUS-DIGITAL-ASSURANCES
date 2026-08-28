import base64
import logging
import time

import requests
from django.conf import settings

from integrations.orange_money.constants import (
    OM_CURRENCY,
    OM_ENDPOINT_MERCHANT_CALLBACK,
    OM_ENDPOINT_OAUTH_TOKEN,
    OM_ENDPOINT_QRCODE,
    OM_ENDPOINT_TRANSACTION_STATUS,
    OM_ENDPOINT_TRANSACTIONS,
    OM_STATUS_PENDING,
    OM_STATUS_SUCCESS,
    OM_TRANSACTION_TYPE_MERCHANT_PAYMENT,
)
from integrations.orange_money.exceptions import (
    OmApiError,
    OmConfigurationError,
    OmRealCallsDisabledError,
)

logger = logging.getLogger("integrations.orange_money")

# Cache de token OAuth partagé par processus (gunicorn = 1 cache par worker).
# Durée pilotée par expires_in renvoyé par l'API (jamais hardcodée).
_token_cache = {"access_token": None, "expires_at": 0.0}


class OmClient:
    """Client API Paiement Marchand Orange Money (Sonatel).

    En mode mock (OM_MOCK_ENABLED=True), aucune requête réseau n'est émise :
    le QR est un visuel de démonstration et la transaction passe à SUCCESS
    après OM_MOCK_CONFIRM_DELAY_SECONDS (simule le paiement du client).
    """

    def __init__(self, *, base_url=None, client_id=None, client_secret=None, session=None):
        self.base_url = (base_url if base_url is not None else settings.OM_BASE_URL).rstrip("/")
        self.client_id = client_id if client_id is not None else settings.OM_CLIENT_ID
        self.client_secret = (
            client_secret if client_secret is not None else settings.OM_CLIENT_SECRET
        )
        self.session = session or requests.Session()

    # ── Paiement par QR code / deeplink ──────────────────────────────────

    def create_payment_qrcode(self, *, amount, reference, client_label=""):
        """Crée une demande de paiement marchand (QR + deeplinks MAXIT/OM)."""
        if settings.OM_MOCK_ENABLED:
            return self._mock_qrcode_response(amount=amount, reference=reference)

        if not settings.OM_MERCHANT_CODE:
            raise OmConfigurationError("OM_MERCHANT_CODE manquant (voir .env).")

        payload = {
            "code": settings.OM_MERCHANT_CODE,
            "name": settings.OM_MERCHANT_NAME,
            "amount": {"unit": OM_CURRENCY, "value": int(amount)},
            "reference": reference,
            "validity": settings.OM_QR_VALIDITY_SECONDS,
            # Une prime ne se règle qu'une fois : un QR rejouable exposerait le
            # client à un second débit sur le même contrat.
            "restrictions": {"isSingleUse": True},
        }
        # metadata n'accepte que des valeurs chaînes (10 clés au maximum).
        if client_label:
            payload["metadata"] = {"idClient": str(client_label)}
        if settings.OM_CALLBACK_SUCCESS_URL:
            payload["callbackSuccessUrl"] = settings.OM_CALLBACK_SUCCESS_URL
        if settings.OM_CALLBACK_CANCEL_URL:
            payload["callbackCancelUrl"] = settings.OM_CALLBACK_CANCEL_URL

        headers = {}
        # Sans X-Callback-Url, OM utilise le callback enregistré pour le code
        # marchand (POST /api/notification/v1/merchantcallback).
        if settings.OM_CALLBACK_URL:
            headers["X-Callback-Url"] = settings.OM_CALLBACK_URL

        data = self._request("POST", OM_ENDPOINT_QRCODE, json=payload, headers=headers)
        return self._normalize_qrcode(data)

    @staticmethod
    def _normalize_qrcode(data):
        """Uniformise la réponse QR pour le front (data-URI + deepLinks).

        L'API renvoie `qrCode` en base64 nu (PNG) et peut ne fournir que le
        deeplink singulier `deepLink` : le front attend une source d'image
        directement affichable et un dictionnaire de liens.
        """
        if not isinstance(data, dict):
            return data
        qr_code = data.get("qrCode") or ""
        if qr_code and not qr_code.startswith("data:"):
            data["qrCode"] = f"data:image/png;base64,{qr_code}"
        if not data.get("deepLinks") and data.get("deepLink"):
            data["deepLinks"] = {"MAXIT": data["deepLink"]}
        return data

    # ── Statut de transaction (source de vérité, art. 4.1 du contrat) ────

    def find_transaction(self, *, reference, since=None):
        """Cherche la transaction correspondant à notre référence marchande.

        Retourne un dict {status, transactionId, amount} ou None si introuvable.
        `reference` est filtrée côté serveur (paramètre supporté par l'API).
        """
        if settings.OM_MOCK_ENABLED:
            return self._mock_transaction_response(reference=reference)

        params = {
            "reference": reference,
            "type": OM_TRANSACTION_TYPE_MERCHANT_PAYMENT,
            "size": 20,
        }
        if since is not None:
            params["fromDateTime"] = since.strftime("%Y-%m-%dT%H:%M:%S")
        data = self._request("GET", OM_ENDPOINT_TRANSACTIONS, params=params)
        transactions = data if isinstance(data, list) else data.get("transactions", [])
        for txn in transactions:
            if not isinstance(txn, dict):
                continue
            # Le filtre serveur est refait ici : une API qui élargirait la
            # recherche ne doit jamais nous faire confirmer le mauvais contrat.
            if txn.get("reference") == reference:
                return self._normalize_transaction(txn)
        return None

    def get_transaction_status(self, *, transaction_id):
        """Statut courant d'une transaction connue (endpoint dédié, plus direct).

        Retourne le statut brut OM (chaîne) ou None si indisponible.
        """
        if settings.OM_MOCK_ENABLED:
            return OM_STATUS_SUCCESS if transaction_id else None
        endpoint = OM_ENDPOINT_TRANSACTION_STATUS.format(transaction_id=transaction_id)
        data = self._request("GET", endpoint)
        if isinstance(data, dict):
            return data.get("status")
        return None

    @staticmethod
    def _normalize_transaction(txn):
        amount = txn.get("amount")
        if isinstance(amount, dict):
            amount = amount.get("value")
        return {
            "status": txn.get("status"),
            "transactionId": txn.get("transactionId") or txn.get("id") or "",
            "amount": amount,
        }

    # ── Enregistrement du webhook marchand ───────────────────────────────

    def register_merchant_callback(self, *, callback_url, api_key="", name=""):
        """Enregistre l'URL de notification pour notre code marchand.

        À lancer une fois par environnement (sandbox puis prod). L'apiKey fournie
        nous est renvoyée en `Authorization: Basic` sur chaque callback.
        """
        if not settings.OM_MERCHANT_CODE:
            raise OmConfigurationError("OM_MERCHANT_CODE manquant (voir .env).")
        payload = {
            "code": settings.OM_MERCHANT_CODE,
            "name": name or settings.OM_MERCHANT_NAME,
            "callbackUrl": callback_url,
        }
        if api_key:
            payload["apiKey"] = api_key
        return self._request("POST", OM_ENDPOINT_MERCHANT_CALLBACK, json=payload)

    def list_merchant_callbacks(self):
        """Callbacks enregistrés pour notre code marchand (l'apiKey n'est jamais relue)."""
        return self._request(
            "GET",
            OM_ENDPOINT_MERCHANT_CALLBACK,
            params={"code": settings.OM_MERCHANT_CODE},
        )

    # ── Mock ──────────────────────────────────────────────────────────────

    def _mock_qrcode_response(self, *, amount, reference):
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>"
            "<rect width='240' height='240' fill='#ffffff'/>"
            "<rect x='20' y='20' width='56' height='56' fill='#0d0f17'/>"
            "<rect x='164' y='20' width='56' height='56' fill='#0d0f17'/>"
            "<rect x='20' y='164' width='56' height='56' fill='#0d0f17'/>"
            "<rect x='104' y='104' width='32' height='32' fill='#ff7900'/>"
            "<text x='120' y='150' font-family='Arial' font-size='13' font-weight='bold'"
            " fill='#0d0f17' text-anchor='middle'>QR MOCK</text>"
            f"<text x='120' y='230' font-family='Arial' font-size='10' fill='#666'"
            f" text-anchor='middle'>{amount} FCFA</text>"
            "</svg>"
        )
        encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
        return {
            "qrCode": f"data:image/svg+xml;base64,{encoded}",
            "deepLinks": {
                "MAXIT": f"https://sugu.orange-sonatel.com/mp/mock/{reference}",
                "OM": f"https://qrcode.orange-sonatel.com/mock/{reference}",
            },
            "validity": settings.OM_QR_VALIDITY_SECONDS,
            "mock": True,
        }

    def _mock_transaction_response(self, *, reference):
        # Import paresseux : le mock simule le paiement du client en basculant
        # la transaction à SUCCESS N secondes après l'initiation du Payment.
        from django.utils import timezone

        from payments.models import Payment

        payment = (
            Payment.objects.filter(external_reference=reference)
            .order_by("-created_at")
            .first()
        )
        if payment is None:
            return None
        elapsed = (timezone.now() - payment.created_at).total_seconds()
        if elapsed >= settings.OM_MOCK_CONFIRM_DELAY_SECONDS:
            status = OM_STATUS_SUCCESS
        else:
            status = OM_STATUS_PENDING
        return {
            "status": status,
            "transactionId": f"MOCK-OM-{payment.pk}",
            "amount": payment.amount,
        }

    # ── HTTP ──────────────────────────────────────────────────────────────

    def _get_token(self):
        if not self.client_id or not self.client_secret:
            raise OmConfigurationError(
                "OM_CLIENT_ID / OM_CLIENT_SECRET manquants (voir .env)."
            )
        now = time.monotonic()
        if _token_cache["access_token"] and now < _token_cache["expires_at"]:
            return _token_cache["access_token"]

        try:
            response = self.session.post(
                f"{self.base_url}{OM_ENDPOINT_OAUTH_TOKEN}",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30,
            )
        except requests.RequestException as exc:
            raise OmApiError(f"Échec réseau OAuth Orange Money : {exc}") from exc
        if response.status_code != 200:
            raise OmApiError(
                "Échec d'authentification Orange Money.",
                status_code=response.status_code,
                response_body=_safe_body(response),
            )
        data = response.json()
        token = data.get("access_token")
        expires_in = int(data.get("expires_in") or 300)
        if not token:
            raise OmApiError("Réponse OAuth Orange Money sans access_token.")
        # Marge de 30 s pour éviter d'utiliser un token expirant en vol.
        _token_cache["access_token"] = token
        _token_cache["expires_at"] = now + max(expires_in - 30, 30)
        return token

    def _request(self, method, endpoint, *, json=None, params=None, headers=None):
        if not settings.OM_REAL_CALLS_ALLOWED:
            raise OmRealCallsDisabledError(
                "Appels réels Orange Money désactivés (OM_REAL_CALLS_ALLOWED=False)."
            )
        token = self._get_token()
        url = f"{self.base_url}{endpoint}"
        request_headers = {"Authorization": f"Bearer {token}"}
        if settings.OM_API_KEY:
            request_headers["X-Api-Key"] = settings.OM_API_KEY
        if headers:
            request_headers.update(headers)
        try:
            response = self.session.request(
                method,
                url,
                json=json,
                params=params,
                headers=request_headers,
                timeout=30,
            )
        except requests.RequestException as exc:
            raise OmApiError(f"Échec réseau Orange Money ({endpoint}) : {exc}") from exc

        if response.status_code == 401:
            # Token révoqué côté OM : on invalide le cache pour le prochain appel.
            _token_cache["access_token"] = None
        if response.status_code >= 400:
            logger.warning(
                "Erreur API OM %s %s -> %s", method, endpoint, response.status_code
            )
            raise OmApiError(
                f"Erreur API Orange Money ({response.status_code}).",
                status_code=response.status_code,
                response_body=_safe_body(response),
            )
        try:
            return response.json()
        except ValueError as exc:
            raise OmApiError("Réponse Orange Money non JSON.") from exc


def _safe_body(response):
    try:
        return response.json()
    except ValueError:
        return response.text[:500]
