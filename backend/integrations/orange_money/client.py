import base64
import logging
import time
from datetime import timedelta

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
    OM_TRANSACTION_SEARCH_MARGIN_SECONDS,
    OM_TRANSACTION_TYPE_MERCHANT_PAYMENT,
)
from integrations.orange_money.exceptions import (
    OmApiError,
    OmConfigurationError,
    OmRealCallsDisabledError,
)

logger = logging.getLogger("integrations.orange_money")


class _OmTokenExpired(Exception):
    """Signal interne : la passerelle a refusé le jeton, un rejeu est légitime."""

# Cache de token OAuth partagé par processus (gunicorn = 1 cache par worker),
# indexé par (base_url, client_id) : sandbox et production ne partagent pas la
# même passerelle, un cache unique servirait un jeton de prod à un appel sandbox.
# Durée pilotée par expires_in renvoyé par l'API (jamais hardcodée).
_token_cache = {}


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
            # Meme normalisation que la reponse reelle : sans quoi le mock
            # exposerait une forme differente et le front divergerait entre
            # developpement et production.
            return self._normalize_qrcode(
                self._mock_qrcode_response(amount=amount, reference=reference)
            )

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
        # Lien partageable : ce qu'on envoie au payeur quand il n'est pas devant
        # l'ecran. Orange documente `shortLink` pour cet usage, mais le renvoie
        # VIDE en production (constate le 2026-09-09 sur deux demandes reelles).
        # On retombe donc sur le deeplink, qui est une URL https ordinaire
        # pointant la meme page de paiement — le front n'a pas a connaitre ce
        # detail, il affiche `shareLink` quand il est non vide.
        data["shareLink"] = (
            data.get("shortLink")
            or data.get("deepLink")
            or next(iter((data.get("deepLinks") or {}).values()), "")
        )
        return data

    # ── Statut de transaction (source de vérité, art. 4.1 du contrat) ────

    def find_transaction(self, *, reference, since=None):
        """Cherche la transaction correspondant à notre référence marchande.

        Retourne un dict {status, transactionId, amount} ou None si introuvable.
        `reference` est filtrée côté serveur (paramètre supporté par l'API).
        """
        if settings.OM_MOCK_ENABLED:
            return self._mock_transaction_response(reference=reference)

        # `type` n'est DELIBEREMENT pas envoye : le filtre serveur est casse.
        # Constate en production le 2026-09-09 sur un vrai paiement de 10 XOF —
        # la transaction porte pourtant bien "type": "MERCHANT_PAYMENT" :
        #   ?reference=PROBE-10XOF-RECETTE          -> 1 resultat
        #   ?status=SUCCESS                         -> 1 resultat
        #   ?type=MERCHANT_PAYMENT                  -> [] (!)
        #   ?reference=...&type=MERCHANT_PAYMENT    -> []
        # L'envoyer rendait TOUT encaissement introuvable : ni le sondage ni la
        # reconciliation n'auraient jamais confirme un paiement. Le tri par type
        # est donc fait ici, sur le champ que la reponse contient bel et bien.
        params = {
            "reference": reference,
            "size": 20,
        }
        if since is not None:
            # Marge arriere : `fromDateTime` est une borne stricte cote OM et nos
            # deux horloges ne sont pas synchronisees a la seconde. Sans elle,
            # une transaction horodatee juste avant la creation du Payment
            # devient introuvable — donc un encaissement jamais confirme.
            params["fromDateTime"] = (
                since - timedelta(seconds=OM_TRANSACTION_SEARCH_MARGIN_SECONDS)
            ).strftime("%Y-%m-%dT%H:%M:%S")
        data = self._request("GET", OM_ENDPOINT_TRANSACTIONS, params=params)
        transactions = data if isinstance(data, list) else data.get("transactions", [])
        matches = [
            txn
            for txn in transactions
            # Le filtre serveur est refait ici : une API qui élargirait la
            # recherche ne doit jamais nous faire confirmer le mauvais contrat.
            if isinstance(txn, dict)
            and txn.get("reference") == reference
            and txn.get("type", OM_TRANSACTION_TYPE_MERCHANT_PAYMENT)
            == OM_TRANSACTION_TYPE_MERCHANT_PAYMENT
        ]
        if not matches:
            return None
        # Plusieurs transactions peuvent porter la meme reference (tentative
        # rejetee puis reussie). Un SUCCESS prime : retenir la premiere venue
        # ferait passer pour echoue un paiement bel et bien encaisse.
        for txn in matches:
            if (txn.get("status") or "").upper() == OM_STATUS_SUCCESS:
                return self._normalize_transaction(txn)
        return self._normalize_transaction(matches[0])

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
        cache_key = (self.base_url, self.client_id)
        cached = _token_cache.get(cache_key)
        if cached and now < cached["expires_at"]:
            return cached["access_token"]

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
        try:
            data = response.json()
        except ValueError as exc:
            # Une passerelle en panne renvoie parfois du HTML : sans ce garde-fou
            # le ValueError remonte tel quel et devient un 500 au lieu d'un 502.
            raise OmApiError("Réponse OAuth Orange Money non JSON.") from exc
        token = data.get("access_token")
        expires_in = int(data.get("expires_in") or 300)
        if not token:
            raise OmApiError("Réponse OAuth Orange Money sans access_token.")
        # Marge de 30 s pour éviter d'utiliser un token expirant en vol.
        # expires_in vaut 299 s en production : le cache evite un aller-retour
        # OAuth par appel sans jamais depasser la duree annoncee par l'API.
        _token_cache[cache_key] = {
            "access_token": token,
            "expires_at": now + max(expires_in - 30, 30),
        }
        return token

    def _request(self, method, endpoint, *, json=None, params=None, headers=None):
        if not settings.OM_REAL_CALLS_ALLOWED:
            raise OmRealCallsDisabledError(
                "Appels réels Orange Money désactivés (OM_REAL_CALLS_ALLOWED=False)."
            )
        try:
            return self._send(method, endpoint, json=json, params=params, headers=headers)
        except _OmTokenExpired:
            # Le jeton a expiré entre notre cache et la passerelle (expires_in
            # vaut 299 s en production) : on rejoue une fois avec un jeton neuf
            # plutôt que de faire échouer un encaissement sur une rotation.
            logger.info("Jeton OM refusé (401) : nouvelle tentative avec un jeton neuf.")
            return self._send(
                method, endpoint, json=json, params=params, headers=headers, _retry=False
            )

    def _send(self, method, endpoint, *, json=None, params=None, headers=None, _retry=True):
        token = self._get_token()
        url = f"{self.base_url}{endpoint}"
        # Content-Type est exige meme sur les GET sans corps : sans lui,
        # GET /api/notification/v1/merchantcallback repond 415 « Unsupported
        # media type, it should be 'application/json' » (constate en production
        # le 2026-09-08). requests ne le pose que lorsqu'un corps json est fourni.
        request_headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
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

        if response.status_code == 401 and _retry:
            # Token révoqué ou expiré côté OM : on vide le cache et on signale à
            # _request qu'un seul rejeu est légitime.
            _token_cache.pop((self.base_url, self.client_id), None)
            raise _OmTokenExpired
        if response.status_code >= 400:
            logger.warning(
                "Erreur API OM %s %s -> %s : %s",
                method,
                endpoint,
                response.status_code,
                _safe_body(response),
            )
            raise OmApiError(
                f"Erreur API Orange Money ({response.status_code}).",
                status_code=response.status_code,
                response_body=_safe_body(response),
            )
        # 201/204 sans corps : POST /api/notification/v1/merchantcallback renvoie
        # un corps vide en cas de succes (constate en production le 2026-09-08).
        # Lever ici ferait passer un enregistrement reussi pour un echec.
        if not response.content or not response.content.strip():
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise OmApiError("Réponse Orange Money non JSON.") from exc


def _safe_body(response):
    try:
        return response.json()
    except ValueError:
        return response.text[:500]
