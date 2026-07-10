"""Constantes API Orange Money (Paiement Marchand Sonatel).

Endpoints confirmés le 2026-06-20 via la collection Postman officielle Sonatel
(le PDF public est parfois obsolète — se référer à la collection en cas de doute).
"""

OM_SANDBOX_BASE_URL = "https://api.sandbox.orange-sonatel.com"
OM_PROD_BASE_URL = "https://api.orange-sonatel.com"

# Auth OAuth2 client_credentials (Content-Type: application/x-www-form-urlencoded).
OM_ENDPOINT_OAUTH_TOKEN = "/oauth/token"

# Paiement Marchand par QR code / deeplink (MAXIT, OM).
OM_ENDPOINT_QRCODE = "/api/eWallet/v4/qrcode"

# Statut / recherche de transactions (source de vérité contractuelle, art. 4.1).
OM_ENDPOINT_TRANSACTIONS = "/api/eWallet/v1/transactions"

# Enregistrement du callback marchand (une fois par environnement).
OM_ENDPOINT_MERCHANT_CALLBACK = "/api/notification/v1/merchantcallback"

# Statuts de transaction observés côté OM.
OM_STATUS_SUCCESS = "SUCCESS"
OM_STATUS_PENDING = "PENDING"
OM_STATUS_FAILED = "FAILED"
OM_STATUS_EXPIRED = "EXPIRED"

OM_CURRENCY = "XOF"
