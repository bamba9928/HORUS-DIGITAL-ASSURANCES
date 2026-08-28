"""Vérification des notifications (webhooks) Orange Money.

Sonatel signe chaque callback avec l'en-tête ::

    X-Sonatel-Signature: t=<timestamp unix>,v1=<hmac_sha256_hex>

où v1 = HMAC-SHA256(clé = secret de l'endpoint partenaire, message = "{t},{corps brut}")
en hexadécimal minuscule. Plusieurs `v1=` peuvent coexister pendant une rotation
de secret : la requête est acceptée si l'une d'elles correspond.
"""

import hashlib
import hmac
import re
import time

from integrations.orange_money.constants import OM_CALLBACK_SIGNATURE_TOLERANCE_SECONDS


class OmSignatureError(Exception):
    """Signature de callback absente, malformée, périmée ou invalide."""


_SIGNATURE_PART = re.compile(r"(?P<key>[a-z0-9]+)=(?P<value>[^,]+)")


def parse_signature_header(header):
    """Découpe l'en-tête en (timestamp, [digests v1]). Lève OmSignatureError."""
    if not header:
        raise OmSignatureError("En-tête X-Sonatel-Signature absent.")

    timestamp = None
    digests = []
    for match in _SIGNATURE_PART.finditer(header):
        key, value = match.group("key"), match.group("value")
        if key == "t" and timestamp is None:
            timestamp = value
        elif key == "v1":
            digests.append(value)

    if timestamp is None or not digests:
        raise OmSignatureError("En-tête X-Sonatel-Signature malformé.")
    try:
        timestamp = int(timestamp)
    except ValueError as exc:
        raise OmSignatureError("Horodatage de signature invalide.") from exc
    return timestamp, digests


def verify_signature(
    *,
    header,
    raw_body,
    secret,
    tolerance_seconds=OM_CALLBACK_SIGNATURE_TOLERANCE_SECONDS,
    now=None,
):
    """Valide la signature d'un callback OM. Lève OmSignatureError si invalide.

    `raw_body` doit être le corps binaire EXACT reçu : la signature porte sur les
    octets, pas sur un JSON re-sérialisé.
    """
    if not secret:
        raise OmSignatureError("Secret de signature Orange Money non configuré.")

    timestamp, digests = parse_signature_header(header)

    current = int(time.time()) if now is None else int(now)
    if tolerance_seconds and abs(current - timestamp) > tolerance_seconds:
        raise OmSignatureError("Signature Orange Money périmée (rejeu probable).")

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    signed_payload = str(timestamp).encode("ascii") + b"," + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), signed_payload, hashlib.sha256
    ).hexdigest().encode("ascii")

    # compare_digest : comparaison à temps constant (pas de fuite par timing).
    # Sur des octets : la variante str lève TypeError dès qu'un caractère sort de
    # l'ASCII, ce qu'un en-tête hostile suffirait à provoquer.
    if not any(
        hmac.compare_digest(expected, digest.encode("utf-8")) for digest in digests
    ):
        raise OmSignatureError("Signature Orange Money invalide.")
    return True
