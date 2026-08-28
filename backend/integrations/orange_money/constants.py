"""Constantes API Orange Money (Paiement Marchand Sonatel).

Source faisant autorité : spécification OpenAPI « Orange Money API v1.1.0 »
publiée sur le nouveau portail developer.orange-sonatel.com (révision du
2026-08-18, relevée le 2026-08-25). L'ancien portail — et la collection Postman
qui en dérivait — exposait /oauth/token : ce chemin n'existe plus.
"""

OM_SANDBOX_BASE_URL = "https://api.sandbox.orange-sonatel.com"
OM_PROD_BASE_URL = "https://api.orange-sonatel.com"

# Auth OAuth2 client_credentials (Content-Type: application/x-www-form-urlencoded).
OM_ENDPOINT_OAUTH_TOKEN = "/oauth/v1/token"

# Paiement Marchand par QR code / deeplink (MAXIT, OM).
OM_ENDPOINT_QRCODE = "/api/eWallet/v4/qrcode"

# Recherche de transactions : filtrable côté serveur par reference/type/status.
OM_ENDPOINT_TRANSACTIONS = "/api/eWallet/v1/transactions"

# Statut d'une transaction — « authoritative source of truth » selon la doc,
# à utiliser dès qu'on connaît le transactionId Orange Money.
OM_ENDPOINT_TRANSACTION_STATUS = "/api/eWallet/v1/transactions/{transaction_id}/status"

# Enregistrement du callback marchand (une fois par environnement).
OM_ENDPOINT_MERCHANT_CALLBACK = "/api/notification/v1/merchantcallback"

# Statuts de transaction (enum complète de la spec v1.1.0).
OM_STATUS_ACCEPTED = "ACCEPTED"
OM_STATUS_CANCELLED = "CANCELLED"
OM_STATUS_FAILED = "FAILED"
OM_STATUS_INITIATED = "INITIATED"
OM_STATUS_PENDING = "PENDING"
OM_STATUS_PRE_INITIATED = "PRE_INITIATED"
OM_STATUS_REJECTED = "REJECTED"
OM_STATUS_SUCCESS = "SUCCESS"

# Seul SUCCESS encaisse. CANCELLED/FAILED/REJECTED sont définitifs : on marque le
# paiement en échec. Tout le reste (ACCEPTED, INITIATED, PENDING, PRE_INITIATED)
# est transitoire — on continue à sonder (statut final garanti sous 24 h).
OM_TERMINAL_FAILURE_STATUSES = frozenset(
    {OM_STATUS_CANCELLED, OM_STATUS_FAILED, OM_STATUS_REJECTED}
)

# Type de transaction : restreint la recherche à nos encaissements marchands.
OM_TRANSACTION_TYPE_MERCHANT_PAYMENT = "MERCHANT_PAYMENT"

# Code d'erreur métier renvoyé quand le QR est expiré (corps application/problem+json).
OM_ERROR_CODE_QR_EXPIRED = "4004"

OM_CURRENCY = "XOF"

# Tolérance sur l'horodatage `t` de X-Sonatel-Signature (anti-rejeu).
OM_CALLBACK_SIGNATURE_TOLERANCE_SECONDS = 300
