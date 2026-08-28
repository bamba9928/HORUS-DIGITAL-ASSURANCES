from pathlib import Path

import dj_database_url
from decouple import config
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse_lazy

from integrations.ass.constants import (
    ASS_API_PARTNER_SEGMENT as DEFAULT_ASS_API_PARTNER_SEGMENT,
    ASS_ENDPOINT_CANCEL_ATTESTATION,
    ASS_ENDPOINT_CANCEL_ATTESTATION_FALLBACK,
    ASS_SANDBOX_BASE_URL,
)

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


SECRET_KEY = config("DJANGO_SECRET_KEY", default="dev-only-change-me")

DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = config(
    "DJANGO_ALLOWED_HOSTS",
    default="localhost,127.0.0.1,testserver",
    cast=lambda value: [item.strip() for item in value.split(",") if item.strip()],
)

# Refuse de demarrer avec la cle de dev des qu'un host non local est configure
# (signal de deploiement) : empeche une mise en production avec une SECRET_KEY connue.
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "testserver", "[::1]"}
if SECRET_KEY == "dev-only-change-me" and any(host not in _LOCAL_HOSTS for host in ALLOWED_HOSTS):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY doit etre defini (cle de dev detectee avec des hosts non locaux)."
    )


INSTALLED_APPS = [
    # unfold habille l'admin Django : doit preceder django.contrib.admin pour
    # que ses gabarits prennent le pas sur ceux du contrib.
    'unfold',
    'unfold.contrib.filters',
    'unfold.contrib.forms',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'accounts',
    'organizations',
    'contracts',
    'commissions',
    'payments',
    'referentials',
    'integrations.ass',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ─── Base de données ──────────────────────────────────────────────────────────
# En développement : SQLite par défaut
# En production    : définir DATABASE_URL=postgres://user:pass@host:5432/dbname
# DATABASE_URL est lu via decouple (fichier .env inclus) car dj_database_url.config()
# ne regarde que os.environ et ignorerait un .env non exporté.

DATABASES = {
    'default': dj_database_url.parse(
        config("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
        conn_max_age=600,
    )
}

AUTH_USER_MODEL = 'accounts.User'

FRONTEND_BASE_URL = config("FRONTEND_BASE_URL", default="http://localhost:3000")
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="no-reply@horus-assurances.sn")
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)


AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'auth_login': config('AUTH_LOGIN_THROTTLE_RATE', default='10/min'),
        # Les CGU ASS imposent une frequence limite : borne les appels sandbox/prod par utilisateur.
        'ass_verify': config('ASS_VERIFY_THROTTLE_RATE', default='30/min'),
    },
}

# Sessions : 12 h par defaut (application financiere), ajustable par env.
SESSION_COOKIE_AGE = config('SESSION_COOKIE_AGE', default=60 * 60 * 12, cast=int)

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000,http://127.0.0.1:3000",
    cast=lambda value: [item.strip() for item in value.split(",") if item.strip()],
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://localhost:3000,http://127.0.0.1:3000",
    cast=lambda value: [item.strip() for item in value.split(",") if item.strip()],
)


LANGUAGE_CODE = 'fr-fr'

TIME_ZONE = 'Africa/Dakar'

USE_I18N = True

USE_TZ = True


# ─── Fichiers statiques ───────────────────────────────────────────────────────

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Django 5.1+ : STATICFILES_STORAGE n'existe plus, la configuration passe par STORAGES.
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ─── HTTPS / Sécurité ─────────────────────────────────────────────────────────
# Activé automatiquement quand HTTPS est configuré

SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=False, cast=bool)
SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=False, cast=bool)
CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=False, cast=bool)

# Derriere un reverse proxy (nginx, traefik...) qui termine le TLS : a activer
# pour que Django reconnaisse les requetes HTTPS (sinon boucle de redirection
# avec SECURE_SSL_REDIRECT=True).
if config("USE_X_FORWARDED_PROTO", default=False, cast=bool):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

if SESSION_COOKIE_SECURE:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True


# ─── Logging ──────────────────────────────────────────────────────────────────

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': config('DJANGO_LOG_LEVEL', default='WARNING'),
            'propagate': False,
        },
    },
}


# ─── Sentry (suivi des erreurs) ───────────────────────────────────────────────
# Activé uniquement si SENTRY_DSN est défini (production).

SENTRY_DSN = config("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=config("SENTRY_ENVIRONMENT", default="production"),
        # Pas de données personnelles dans les rapports (application financière).
        send_default_pii=False,
        traces_sample_rate=config("SENTRY_TRACES_SAMPLE_RATE", default=0.1, cast=float),
    )


# ─── Intégration Orange Money (Paiement Marchand) ─────────────────────────────
# Mock activé par défaut : aucun appel réseau tant que les accès Sonatel
# ne sont pas fournis. Voir integrations/orange_money/.

OM_BASE_URL = config("OM_BASE_URL", default="https://api.sandbox.orange-sonatel.com")
OM_CLIENT_ID = config("OM_CLIENT_ID", default="")
OM_CLIENT_SECRET = config("OM_CLIENT_SECRET", default="")
# Code marchand a 6 chiffres attribue par Sonatel (HORUS GLOBAL SERVICE API).
OM_MERCHANT_CODE = config("OM_MERCHANT_CODE", default="")
OM_MERCHANT_NAME = config("OM_MERCHANT_NAME", default="HORUS ASSUR")
# Cle marchande optionnelle (en-tete X-Api-Key), uniquement si le contrat en fournit une.
OM_API_KEY = config("OM_API_KEY", default="")
OM_QR_VALIDITY_SECONDS = config("OM_QR_VALIDITY_SECONDS", default=300, cast=int)
OM_MOCK_ENABLED = config("OM_MOCK_ENABLED", default=True, cast=bool)
OM_REAL_CALLS_ALLOWED = config("OM_REAL_CALLS_ALLOWED", default=False, cast=bool)

# Webhook OM. OM_CALLBACK_URL est envoye en X-Callback-Url a chaque QR ; laisse
# vide, OM utilise le callback enregistre pour le code marchand. HTTPS obligatoire.
OM_CALLBACK_URL = config("OM_CALLBACK_URL", default="")
# Secret de l'endpoint partenaire : sert a verifier X-Sonatel-Signature (HMAC-SHA256).
# Tant qu'il est vide, la signature n'est pas exigee (mode mock / sandbox initiale) —
# le callback ne confirme de toute facon jamais sans revalidation via l'API OM.
OM_CALLBACK_SIGNING_SECRET = config("OM_CALLBACK_SIGNING_SECRET", default="")
# apiKey declaree a l'enregistrement du callback : OM nous la renvoie en
# "Authorization: Basic <apiKey>" sur chaque notification.
OM_CALLBACK_API_KEY = config("OM_CALLBACK_API_KEY", default="")
# Pages de retour du parcours MAX IT / Orange Money (facultatives).
OM_CALLBACK_SUCCESS_URL = config("OM_CALLBACK_SUCCESS_URL", default="")
OM_CALLBACK_CANCEL_URL = config("OM_CALLBACK_CANCEL_URL", default="")
# Mock uniquement : délai avant que le paiement simulé passe à SUCCESS.
OM_MOCK_CONFIRM_DELAY_SECONDS = config("OM_MOCK_CONFIRM_DELAY_SECONDS", default=15, cast=int)


# ─── Intégration ASS ──────────────────────────────────────────────────────────

# Sandbox : ASS_SANDBOX_BASE_URL. Production : ASS_PRODUCTION_BASE_URL
# (https://manager.ass-assurances.sn). Le defaut reste la sandbox : basculer en
# prod est une decision de deploiement, jamais un effet de bord du code.
ASS_BASE_URL = config("ASS_BASE_URL", default=ASS_SANDBOX_BASE_URL)
# Nom de partenaire attribue par ASS, injecte dans /api/v1/{partner}/... — voir
# le commentaire de ASS_API_PARTNER_SEGMENT dans integrations/ass/constants.py.
# Le compte nominatif Horus est "bambadieng" ; le laisser au defaut "partner"
# fait repondre 404 a toutes les routes.
ASS_API_PARTNER_SEGMENT = config(
    "ASS_API_PARTNER_SEGMENT",
    default=DEFAULT_ASS_API_PARTNER_SEGMENT,
)
ASS_USERNAME = config("ASS_USERNAME", default="")
ASS_PASSWORD = config("ASS_PASSWORD", default="")
# CONTOURNEMENT TEMPORAIRE, SANDBOX UNIQUEMENT — laisser VIDE en production.
# Depuis la restauration de leur instance (constate le 2026-08-12), leur Odoo ne
# resout plus de base de donnees pour une requete en Basic Auth seul : toutes les
# routes /api/v1/partner/* repondent 404. Verifie sur stock.qr :
#     cookie seul          -> 401 (la route existe, l'auth tourne)
#     cookie + Basic Auth  -> 201 SUCCESS
#     Basic Auth seul      -> 404
# Aucun autre moyen de designer la base ne fonctionne (?db=, X-Odoo-Db, cookie db).
# Renseigner ce cookie de session Odoo debloque les appels en attendant leur
# correctif. Il EXPIRE (celui du 2026-08-12 court jusqu'au 18/08) : si les appels
# se remettent a repondre 401, c'est qu'il est perime.
ASS_SESSION_ID = config("ASS_SESSION_ID", default="")
ASS_POLICY_FEE = config("ASS_POLICY_FEE", default=3000, cast=int)
# Le taux de commission d'apport n'est PAS un reglage d'environnement : il depend
# du genre du vehicule (20 %, 40 % sur les genres TPC). Voir
# integrations/ass/referentials.commission_rate_for_genre.
ASS_MOCK_ENABLED = config("ASS_MOCK_ENABLED", default=True, cast=bool)
ASS_REAL_CALLS_ALLOWED = config("ASS_REAL_CALLS_ALLOWED", default=False, cast=bool)
# Annulation : endpoint primaire = /qrcode.mono.cancel (PDF officiel). La collection
# Postman expose /qrcode.cancel : le client bascule dessus UNIQUEMENT si le primaire
# repond 404. Les deux restent configurables pour trancher sans redeploiement.
ASS_CANCEL_ENDPOINT = config("ASS_CANCEL_ENDPOINT", default=ASS_ENDPOINT_CANCEL_ATTESTATION)
ASS_CANCEL_ENDPOINT_FALLBACK = config(
    "ASS_CANCEL_ENDPOINT_FALLBACK", default=ASS_ENDPOINT_CANCEL_ATTESTATION_FALLBACK
)
# Seuil d'alerte stock QR sur le dashboard (et statut low_stock de l'API).
ASS_QR_STOCK_ALERT_THRESHOLD = config("ASS_QR_STOCK_ALERT_THRESHOLD", default=10, cast=int)


# ─── Admin Django (unfold) ────────────────────────────────────────────────────
# L'admin sert l'exploitation interne : support, finance, correction ponctuelle.
# Le parcours metier passe par l'API + le front Next.js, jamais par l'admin.
UNFOLD = {
    "SITE_TITLE": "Horus Assurances",
    "SITE_HEADER": "Horus Assurances",
    "SITE_SUBHEADER": "Administration",
    "SITE_SYMBOL": "shield_person",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "COLORS": {
        "primary": {
            "50": "238 242 255",
            "100": "224 231 255",
            "200": "199 210 254",
            "300": "165 180 252",
            "400": "129 140 248",
            "500": "99 102 241",
            "600": "79 70 229",
            "700": "67 56 202",
            "800": "55 48 163",
            "900": "49 46 129",
            "950": "30 27 75",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": True,
        "navigation": [
            {
                "title": "Production",
                "separator": True,
                "items": [
                    {
                        "title": "Contrats",
                        "icon": "description",
                        "link": reverse_lazy("admin:contracts_contract_changelist"),
                    },
                    {
                        "title": "Paiements",
                        "icon": "payments",
                        "link": reverse_lazy("admin:payments_payment_changelist"),
                    },
                    {
                        "title": "Commissions",
                        "icon": "savings",
                        "link": reverse_lazy("admin:commissions_commissionsnapshot_changelist"),
                    },
                ],
            },
            {
                "title": "Organisation",
                "separator": True,
                "items": [
                    {
                        "title": "Utilisateurs",
                        "icon": "person",
                        "link": reverse_lazy("admin:accounts_user_changelist"),
                    },
                    {
                        "title": "Groupes",
                        "icon": "corporate_fare",
                        "link": reverse_lazy("admin:organizations_organization_changelist"),
                    },
                ],
            },
            {
                "title": "Integration ASS",
                "separator": True,
                "items": [
                    {
                        "title": "Journal des appels",
                        "icon": "receipt_long",
                        "link": reverse_lazy("admin:ass_assapilog_changelist"),
                    },
                    {
                        "title": "Marques vehicules",
                        "icon": "directions_car",
                        "link": reverse_lazy("admin:referentials_vehiclebrand_changelist"),
                    },
                ],
            },
        ],
    },
}
