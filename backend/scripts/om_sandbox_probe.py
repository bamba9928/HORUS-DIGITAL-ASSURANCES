"""Sondes de validation Orange Money (Paiement Marchand Sonatel).

Valide les accès et les payloads du client OM contre l'API réelle, sans toucher
à la configuration de l'app (le .env reste en mock : ce script force le mode réel
uniquement pour son propre process).

Usage :
    uv run python backend/scripts/om_sandbox_probe.py token
    uv run python backend/scripts/om_sandbox_probe.py qr
    uv run python backend/scripts/om_sandbox_probe.py find <reference>
    uv run python backend/scripts/om_sandbox_probe.py status <transactionId>
    uv run python backend/scripts/om_sandbox_probe.py callbacks
    uv run python backend/scripts/om_sandbox_probe.py register-callback

La sonde "qr" crée une vraie demande de paiement (aucun débit tant que personne
ne scanne le QR). "register-callback" écrit côté Sonatel : elle exige
OM_CALLBACK_URL et n'est à lancer qu'une fois par environnement.

Prérequis : OM_CLIENT_ID / OM_CLIENT_SECRET / OM_MERCHANT_CODE renseignés dans
backend/.env. Par défaut la sonde vise la sandbox ; viser la production demande
un OM_BASE_URL explicite ET la variable OM_PROBE_ALLOW_PROD=1.
"""

import json
import os
import sys
from uuid import uuid4

os.environ["OM_MOCK_ENABLED"] = "False"
os.environ["OM_REAL_CALLS_ALLOWED"] = "True"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402

from integrations.orange_money.client import OmClient  # noqa: E402
from integrations.orange_money.constants import OM_PROD_BASE_URL  # noqa: E402
from integrations.orange_money.exceptions import OmIntegrationError  # noqa: E402


# Montant de test volontairement minimal : la sandbox accepte >= 1 XOF, et une
# sonde ne doit jamais engager un montant significatif si elle vise la prod.
PROBE_AMOUNT = int(os.environ.get("OM_PROBE_AMOUNT", "1"))


def show(title, call):
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")
    try:
        result = call()
    except OmIntegrationError as exc:
        print(f"ECHEC : {exc}")
        body = getattr(exc, "response_body", None)
        if body:
            print(json.dumps(body, indent=2, ensure_ascii=False)[:2000])
        return None
    printable = result
    if isinstance(result, dict) and isinstance(result.get("qrCode"), str):
        # Le PNG base64 fait plusieurs Ko : inutile de noyer la sortie.
        printable = dict(result)
        printable["qrCode"] = f"<{len(result['qrCode'])} caracteres>"
    print(json.dumps(printable, indent=2, ensure_ascii=False)[:4000])
    return result


def probe_token(client):
    return show("OAuth client_credentials", lambda: {"access_token_len": len(client._get_token())})


def probe_qr(client):
    reference = f"PROBE-{uuid4().hex[:10].upper()}"
    print(f"reference marchande : {reference}")
    return show(
        f"Demande de paiement QR ({PROBE_AMOUNT} XOF)",
        lambda: client.create_payment_qrcode(
            amount=PROBE_AMOUNT, reference=reference, client_label="probe"
        ),
    )


def probe_find(client, reference):
    return show(
        f"Recherche de transaction reference={reference}",
        lambda: client.find_transaction(reference=reference),
    )


def probe_status(client, transaction_id):
    return show(
        f"Statut de la transaction {transaction_id}",
        lambda: {"status": client.get_transaction_status(transaction_id=transaction_id)},
    )


def probe_callbacks(client):
    return show("Callbacks enregistres", client.list_merchant_callbacks)


def probe_register_callback(client):
    if not settings.OM_CALLBACK_URL:
        sys.exit("OM_CALLBACK_URL non renseigne dans backend/.env — rien a enregistrer.")
    if not settings.OM_CALLBACK_URL.startswith("https://"):
        sys.exit("OM_CALLBACK_URL doit etre une URL HTTPS publiquement joignable.")
    return show(
        f"Enregistrement du callback {settings.OM_CALLBACK_URL}",
        lambda: client.register_merchant_callback(
            callback_url=settings.OM_CALLBACK_URL,
            api_key=settings.OM_CALLBACK_API_KEY,
        ),
    )


def _assert_environment():
    missing = [
        name
        for name in ("OM_CLIENT_ID", "OM_CLIENT_SECRET", "OM_MERCHANT_CODE")
        if not getattr(settings, name)
    ]
    if missing:
        sys.exit(
            "Configuration incomplete dans backend/.env : "
            + ", ".join(missing)
            + "\nLes identifiants s'obtiennent en creant une application sur "
            "developer.orange-sonatel.com."
        )
    if settings.OM_BASE_URL.rstrip("/") == OM_PROD_BASE_URL and os.environ.get(
        "OM_PROBE_ALLOW_PROD"
    ) != "1":
        sys.exit(
            "OM_BASE_URL vise la PRODUCTION (argent reel). Relancer avec "
            "OM_PROBE_ALLOW_PROD=1 si c'est intentionnel."
        )


PROBES_WITH_ARG = {"find": probe_find, "status": probe_status}
PROBES = {
    "token": probe_token,
    "qr": probe_qr,
    "callbacks": probe_callbacks,
    "register-callback": probe_register_callback,
}


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(
            "Sondes disponibles : "
            + ", ".join(list(PROBES) + list(PROBES_WITH_ARG))
            + "\n(voir la docstring du fichier pour les exemples)"
        )

    _assert_environment()
    print(f"Base URL : {settings.OM_BASE_URL}")
    print(f"Code marchand : {settings.OM_MERCHANT_CODE}")
    client = OmClient()

    name = args[0]
    if name in PROBES_WITH_ARG:
        if len(args) < 2:
            sys.exit(f"La sonde '{name}' attend un argument.")
        PROBES_WITH_ARG[name](client, args[1])
        return
    if name not in PROBES:
        sys.exit(f"Sonde inconnue : {name}")
    PROBES[name](client)


if __name__ == "__main__":
    main()
