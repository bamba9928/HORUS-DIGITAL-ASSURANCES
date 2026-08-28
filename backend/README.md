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

# Collecter les fichiers statiques — obligatoire même en dev
# (STORAGES utilise un stockage à manifeste : sans cette étape,
#  l'admin répond 500 « Missing staticfiles manifest entry »)
uv run python backend/manage.py collectstatic --noinput

# Lancer le serveur de développement
uv run python backend/manage.py runserver
# → http://localhost:8000  —  admin : http://localhost:8000/admin/
```

### Admin Django

L'admin est habillé par [django-unfold](https://unfoldadmin.com/) et sert
l'exploitation interne : support, finance, correction ponctuelle. Le parcours
métier passe par l'API et le front Next.js, jamais par l'admin.

| Modèle | Droits |
| --- | --- |
| Utilisateurs, Groupes, Marques véhicules | création / modification / suppression |
| Contrats | consultation + suppression (purge des tests) |
| Paiements, Commissions | consultation seule |
| Journal des appels ASS | consultation seule |

Les objets financiers sont volontairement non modifiables : ils sont produits par
des services qui portent les invariants — paiement confirmé avant émission,
montants figés à l'émission, machine à états des commissions. Les éditer depuis
l'admin les contournerait sans filet.

Après ajout ou modification d'une classe admin, `pytest backend/tests/test_admin.py`
vérifie que chaque écran s'ouvre encore (`manage.py check` ne le détecte pas).

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DJANGO_SECRET_KEY` | Clé secrète Django | `dev-only-change-me` |
| `DJANGO_DEBUG` | Mode debug | `False` |
| `DATABASE_URL` | URL de connexion base de données | SQLite local |
| `CORS_ALLOWED_ORIGINS` | Origines CORS autorisées | `http://localhost:3000` |
| `ASS_BASE_URL` | URL de base A.A.S — sandbox `kiiraytest.lasecu-assurances.sn`, prod `manager.ass-assurances.sn` | Sandbox A.A.S |
| `ASS_API_PARTNER_SEGMENT` | Nom de partenaire A.A.S injecté dans `/api/v1/{partner}/…` — **pas** le mot `partner` sur un compte nominatif | `partner` |
| `ASS_USERNAME` | Identifiant Basic Auth A.A.S (indifférent en sandbox) | — |
| `ASS_PASSWORD` | Access token A.A.S (régénéré à chaque restauration de leur instance) | — |
| `ASS_POLICY_FEE` | Frais de police fixes (FCFA) | `3000` |
| `ASS_MOCK_ENABLED` | Mode simulation A.A.S | `True` |
| `ASS_REAL_CALLS_ALLOWED` | Autoriser les appels réels | `False` |
| `OM_BASE_URL` | URL de base Orange Money — sandbox `api.sandbox.orange-sonatel.com`, prod `api.orange-sonatel.com` | Sandbox OM |
| `OM_CLIENT_ID` / `OM_CLIENT_SECRET` | Identifiants OAuth de l'application créée sur developer.orange-sonatel.com | — |
| `OM_MERCHANT_CODE` | Code marchand à 6 chiffres attribué par Sonatel | — |
| `OM_MERCHANT_NAME` | Nom marchand affiché au client lors du paiement | `HORUS ASSUR` |
| `OM_API_KEY` | Clé marchande optionnelle (en-tête `X-Api-Key`) | — |
| `OM_QR_VALIDITY_SECONDS` | Validité du QR de paiement (86400 max) | `300` |
| `OM_CALLBACK_URL` | Webhook HTTPS public ; vide = callback enregistré côté Sonatel | — |
| `OM_CALLBACK_SIGNING_SECRET` | Secret vérifiant `X-Sonatel-Signature` | — |
| `OM_CALLBACK_API_KEY` | Clé renvoyée par OM en `Authorization: Basic` | — |
| `OM_MOCK_ENABLED` | Mode simulation Orange Money | `True` |
| `OM_REAL_CALLS_ALLOWED` | Autoriser les appels réels | `False` |

## Endpoints API

| Préfixe | App | Description |
|---------|-----|-------------|
| `/api/accounts/` | accounts | Auth, utilisateurs, sessions |
| `/api/organizations/` | organizations | Groupes d'apporteurs |
| `/api/contracts/` | contracts | CRUD contrats, devis, émission |
| `/api/commissions/` | commissions | Snapshots de commissions |
| `/api/payments/` | payments | Confirmation des paiements, paiement Orange Money (`om/initiate/`, `om/<id>/status/`, `om/callback/`) |
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
Paiement Orange Money : `initiate_om_payment()` / `check_om_payment()` — voir
`integrations.orange_money` ci-dessous.

### `referentials`
Données de référence en lecture seule (catégories, sous-catégories, énergies, garanties,
types de personnes) + gestion des marques de véhicules personnalisées.

### `integrations.ass`
Connecteur vers l'API partenaire A.A.S avec :
- Mode **mock complet** pour le développement (pas d'appels réseau)
- Endpoints : RC auto/moto/flotte/bus/garage, émission, annulation, stock QR, vérification immatriculation
- Client `AssClient` avec gestion d'erreurs et parsing de réponses

### `integrations.orange_money`
Connecteur **API Paiement Marchand** Orange Money (Sonatel) — encaissement des primes.

- Mode **mock** par défaut (`OM_MOCK_ENABLED=True`) : aucun appel réseau, QR de
  démonstration, confirmation simulée après `OM_MOCK_CONFIRM_DELAY_SECONDS`.
- Double verrou avant tout appel réel : `OM_MOCK_ENABLED=False` **et**
  `OM_REAL_CALLS_ALLOWED=True`.
- Référence faisant autorité : spécification OpenAPI « Orange Money API v1.1.0 »
  publiée sur <https://developer.orange-sonatel.com/dev/docs/orange-money>
  (révision 2026-08-18). L'ancien portail exposait `/oauth/token` : ce chemin
  n'existe plus, c'est désormais **`/oauth/v1/token`**.

**Flux d'un encaissement**

1. `POST /api/payments/om/initiate/` → crée un `Payment` PENDING, passe le contrat
   en `PAYMENT_PENDING`, appelle `POST /api/eWallet/v4/qrcode` et renvoie le QR
   (data-URI) + les deeplinks MAXIT / OM. Le QR est `isSingleUse` : une prime ne
   se règle qu'une fois.
2. Le client paie depuis MAX IT / Orange Money.
3. Confirmation par **deux chemins redondants**, tous deux idempotents :
   - webhook `POST /api/payments/om/callback/` (notification Sonatel) ;
   - sondage `GET /api/payments/om/<id>/status/` (le front interroge toutes les 4 s).
   Dans les deux cas le statut est **revalidé via l'API OM** : le corps du callback
   n'est jamais cru sur parole.
4. `SUCCESS` + montant identique au devis → paiement `CONFIRMED`, contrat `PAID`.
   Montant différent → `FAILED` et vérification manuelle (jamais d'auto-confirmation
   sur un paiement partiel).

**Statuts OM** — seul `SUCCESS` encaisse. `CANCELLED` / `FAILED` / `REJECTED` sont
définitifs. `ACCEPTED` / `INITIATED` / `PENDING` / `PRE_INITIATED` sont transitoires :
on continue à sonder (statut final garanti sous 24 h côté Sonatel).

**Sécurité du webhook** — quand `OM_CALLBACK_SIGNING_SECRET` est renseigné, l'en-tête
`X-Sonatel-Signature` est vérifié (HMAC-SHA256 du corps **brut**, comparaison à temps
constant, fenêtre anti-rejeu de 300 s) ; `OM_CALLBACK_API_KEY` vérifie en plus
l'`Authorization: Basic`. Un rejet renvoie `400` — traité comme définitif par Sonatel,
donc sans réémission. Pas de déduplication sur `X-Sonatel-Idempotency-Key` : la
confirmation relit OM sous verrou de ligne et court-circuite sur `CONFIRMED`, un
rejeu est donc déjà sans effet.

**Sondes** (forcent le mode réel pour leur seul process, le `.env` reste en mock) :

```bash
uv run python backend/scripts/om_sandbox_probe.py token          # valide client_id/secret
uv run python backend/scripts/om_sandbox_probe.py qr             # cree une vraie demande de paiement
uv run python backend/scripts/om_sandbox_probe.py find <reference>
uv run python backend/scripts/om_sandbox_probe.py status <transactionId>
uv run python backend/scripts/om_sandbox_probe.py callbacks      # webhooks enregistres
uv run python backend/scripts/om_sandbox_probe.py register-callback
```

**Mise en service** — dossier Sonatel validé, compte marchand créé le 2026-08-20.
Procédure conforme au mode opératoire Sonatel « Passage prod new portal » (FR/EN,
reçu le 2026-08-20). Une **seule** application est créée : elle naît en sandbox
puis bascule en production par un interrupteur, il n'y a pas de seconde app à créer.

1. Sur <https://developer.orange-sonatel.com> → menu **Applications** → *Créer une
   application* : nom, description, logo, et cocher dans **Liste des APIs disponibles**
   (`Oauth` est coché d'office) :
   - **Qr Code - Om** → `POST /api/eWallet/v4/qrcode` ;
   - **Payment - Om** → recherche et statut des transactions ;
   - **Notification** → `POST /api/notification/v1/merchantcallback`.
   Ne PAS cocher *Orange money distributeur* : c'est le Cash In, hors périmètre.
   Chaque API demandée porte son propre statut (`En attente` → `approuvée`) : tant
   qu'elle n'est pas approuvée par Sonatel, l'endpoint correspondant répond 403.
2. Sur la fiche de l'application, section **Clé API de test** : `Clé ID` et
   `Clé secret` sont les `OM_CLIENT_ID` / `OM_CLIENT_SECRET` de sandbox, lisibles
   immédiatement (icône œil). Les reporter dans `backend/.env`.
3. `om_sandbox_probe.py token` puis `qr` pour valider les accès.
4. `om_sandbox_probe.py register-callback` (exige `OM_CALLBACK_URL` en HTTPS public).
5. Basculer l'app : `OM_MOCK_ENABLED=False`, `OM_REAL_CALLS_ALLOWED=True`, et
   dérouler un paiement de bout en bout en sandbox.
6. Passage en production : interrupteur **Sandbox → Production** sur la fiche de
   l'application. Un dialogue réclame le dossier entreprise s'il n'est pas déjà
   déposé — *Gestion comptes › Mon entreprise* :
   - **Informations** : nom, secteur d'activité, type d'entreprise, siège social,
     numéro de contact, description de l'activité (marchands seulement) ;
   - **Documents** : CNI/Passeport du DG, NINEA, RCCM, RIB, contrat signé — les
     mêmes pièces que celles déjà transmises par mail à Sonatel.
   Revenir ensuite sur **Applications** et *Confirmer* le passage en production.
7. Après vérification et approbation du dossier, la section **Clé API de production**
   expose les identifiants de prod. Renseigner `OM_BASE_URL=https://api.orange-sonatel.com`
   avec ces clés. Les sondes refusent la prod sans `OM_PROBE_ALLOW_PROD=1`.

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
