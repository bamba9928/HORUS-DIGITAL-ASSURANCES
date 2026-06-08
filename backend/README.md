# Horus — Backend (Django)

API REST de la plateforme Horus Assurances Digital.

## Stack

- **Django 6.0.5**
- **Django REST Framework 3.17**
- **Python 3.14+**
- **SQLite** (développement) / **PostgreSQL** (production)
- **Gunicorn** + **WhiteNoise** (production)

## Démarrage

```bash
# Depuis la racine du projet

# Copier les variables d'environnement
cp backend/.env.example backend/.env

# Installer les dépendances (avec uv)
uv sync --group dev
# ou avec pip :
pip install -r backend/requirements.txt

# Appliquer les migrations
uv run python backend/manage.py migrate

# Créer un superutilisateur (rôle ADMIN_GENERAL)
uv run python backend/manage.py createsuperuser

# Lancer le serveur de développement
uv run python backend/manage.py runserver
# → http://localhost:8000
```

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DJANGO_SECRET_KEY` | Clé secrète Django | `dev-only-change-me` |
| `DJANGO_DEBUG` | Mode debug | `False` |
| `DATABASE_URL` | URL de connexion base de données | SQLite local |
| `CORS_ALLOWED_ORIGINS` | Origines CORS autorisées | `http://localhost:3000` |
| `ASS_BASE_URL` | URL de base de l'API A.A.S | Sandbox A.A.S |
| `ASS_API_PARTNER_SEGMENT` | Segment partenaire A.A.S | `partner` |
| `ASS_USERNAME` | Identifiant API A.A.S | — |
| `ASS_PASSWORD` | Mot de passe API A.A.S | — |
| `ASS_POLICY_FEE` | Frais de police fixes (FCFA) | `3000` |
| `ASS_MOCK_ENABLED` | Mode simulation A.A.S | `True` |
| `ASS_REAL_CALLS_ALLOWED` | Autoriser les appels réels | `False` |

## Endpoints API

| Préfixe | App | Description |
|---------|-----|-------------|
| `/api/accounts/` | accounts | Auth, utilisateurs, sessions |
| `/api/organizations/` | organizations | Groupes d'apporteurs |
| `/api/contracts/` | contracts | CRUD contrats, devis, émission |
| `/api/commissions/` | commissions | Snapshots de commissions |
| `/api/payments/` | payments | Confirmation des paiements |
| `/api/referentials/` | referentials | Marques, garanties, catégories |
| `/api/integrations/ass/` | integrations.ass | Stock QR, vérification immatriculation |
| `/api/config/` | system | Configuration plateforme (admin_general) |

## Applications Django

### `accounts`
Modèle `User` étendu (`AbstractUser`) avec :
- Rôles : `ADMIN_GENERAL`, `ADMIN_GROUP`, `CONTRIBUTOR`, `FINANCE`
- FK vers `Organization` (nullable)
- Champs de commission : `commission_percent_on_prime_rc`, `commission_fixed_on_policy_fee`
- Auth par session Django + CSRF

### `organizations`
Groupes d'apporteurs. Champs : `name`, `code` (unique), `is_active`.
CRUD complet accessible aux `ADMIN_GENERAL`.

### `contracts`
Cycle de vie complet des contrats d'assurance :
- Types : `AUTO_MONO`, `MOTO`, `FLEET`, `BUS_SCHOOL`, `GARAGE`
- Statuts internes : `DRAFT → QUOTE_READY → PAYMENT_PENDING → PAID → ISSUING → ISSUED / CANCELLED`
- Payload JSON `draft_payload` stockant les données de souscription
- Intégration A.A.S pour le calcul (quote) et l'émission (issue)

### `commissions`
Snapshots de commission créés lors de l'émission d'un contrat.
Statuts : `PENDING → PAYABLE → PAID / CANCELLED / DISPUTED`.
Calcul : `prime_rc × commission_percent + policy_fee × commission_fixed`.

### `payments`
Enregistrement des paiements confirmés.
Un seul paiement `CONFIRMED` par contrat (contrainte DB).
Service `confirm_manual_payment()` avec transaction atomique et verrouillage de ligne.

### `referentials`
Données de référence en lecture seule (catégories, sous-catégories, énergies, garanties,
types de personnes) + gestion des marques de véhicules personnalisées.

### `integrations.ass`
Connecteur vers l'API partenaire A.A.S avec :
- Mode **mock complet** pour le développement (pas d'appels réseau)
- Endpoints : RC auto/moto/flotte/bus/garage, émission, annulation, stock QR, vérification immatriculation
- Client `AssClient` avec gestion d'erreurs et parsing de réponses

### `system`
Vue de configuration plateforme (`GET /api/config/`) — retourne les paramètres non-sensibles
de `settings.py`. Accessible aux `ADMIN_GENERAL` uniquement.

## Tests

```bash
# Lancer tous les tests
uv run pytest

```

## Production

```bash
# Variables obligatoires en production
export DJANGO_DEBUG=False
export DJANGO_SECRET_KEY="votre-clé-secrète"
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
export SECURE_SSL_REDIRECT=True

# Collecter les fichiers statiques
python manage.py collectstatic --no-input

# Lancer avec Gunicorn
uv run gunicorn config.wsgi:application --chdir backend --bind 0.0.0.0:8000
```
