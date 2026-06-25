from decimal import Decimal
from pathlib import Path

import dj_database_url
from decouple import config
from django.core.exceptions import ImproperlyConfigured

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

DATABASES = {
    'default': dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
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


# ─── Intégration ASS ──────────────────────────────────────────────────────────

ASS_BASE_URL = config("ASS_BASE_URL", default=ASS_SANDBOX_BASE_URL)
ASS_API_PARTNER_SEGMENT = config(
    "ASS_API_PARTNER_SEGMENT",
    default=DEFAULT_ASS_API_PARTNER_SEGMENT,
)
ASS_USERNAME = config("ASS_USERNAME", default="")
ASS_PASSWORD = config("ASS_PASSWORD", default="")
ASS_POLICY_FEE = config("ASS_POLICY_FEE", default=3000, cast=int)
# Commission d'apport reversee par ASS a Horus sur la PrimeRC (en %). Constitue,
# avec les frais de police, le revenu de Horus servant a payer la commission
# apporteur. Defaut 0 tant que le taux du contrat ASS n'est pas confirme :
# la marge Horus se reduit alors aux frais de police moins la commission apporteur.
ASS_PARTNER_COMMISSION_RATE = config("ASS_PARTNER_COMMISSION_RATE", default="0", cast=Decimal)
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
