# Horus Assurances Digital

Plateforme B2B de gestion de contrats d'assurance automobile pour le marché sénégalais, intégrée avec l'API partenaire **A.A.S** (African Assurance Services).

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Backend | Django 6 · Django REST Framework 3.17 · Python 3.14 |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 |
| Base de données | SQLite (développement) · PostgreSQL (production) |
| Auth | Session Django + CSRF · CORS configuré |
| Déploiement | Gunicorn · WhiteNoise · Docker (standalone Next.js) |

## Structure du projet

```
HorusAssurancesDigital/
├── backend/          # API Django REST
│   ├── accounts/     # Utilisateurs, rôles, auth
│   ├── organizations/# Groupes d'apporteurs
│   ├── contracts/    # Cycle de vie des contrats
│   ├── commissions/  # Calcul et suivi des commissions
│   ├── payments/     # Confirmation des paiements
│   ├── referentials/ # Données de référence (marques, garanties…)
│   ├── integrations/ # Connecteur API A.A.S
│   └── system/       # Configuration plateforme
├── web/              # Application Next.js
│   └── src/
│       ├── app/      # Pages (App Router)
│       ├── components/
│       └── lib/      # API client, permissions
└── docs/             # Documentation API A.A.S et roadmap
```

## Démarrage rapide

### Prérequis

- Python 3.14+ avec [uv](https://docs.astral.sh/uv/)
- Node.js 20+

### Backend

```bash
cd backend

# Copier et configurer les variables d'environnement
cp .env.example .env

# Installer les dépendances
uv sync   # ou : pip install -r requirements.txt

# Appliquer les migrations
python manage.py migrate

# Créer un superutilisateur
python manage.py createsuperuser

# Lancer le serveur de développement
python manage.py runserver
# → API disponible sur http://localhost:8000
```

### Frontend

```bash
cd web

# Copier et configurer les variables d'environnement
cp .env.example .env.local

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
# → Application disponible sur http://localhost:3000
```

## Rôles utilisateurs

| Rôle | Description | Accès |
|------|-------------|-------|
| `ADMIN_GENERAL` | Administrateur de la plateforme | Accès complet, configuration système |
| `ADMIN_GROUP` | Administrateur d'un groupe | Gestion de son organisation et de ses apporteurs |
| `CONTRIBUTOR` | Apporteur d'affaires | Création et suivi de ses contrats |
| `FINANCE` | Équipe finance/comptabilité | Confirmation des paiements, consultation commissions |

## Workflow contrat

```
DRAFT → QUOTE_READY → PAYMENT_PENDING → PAID → ISSUED
                                                   ↓
                                               CANCELLED (depuis tout statut)
```

1. **DRAFT** — Brouillon en cours de saisie
2. **QUOTE_READY** — Devis calculé (appel API A.A.S)
3. **PAYMENT_PENDING** — En attente de paiement
4. **PAID** — Paiement confirmé
5. **ISSUED** — Attestation émise (appel API A.A.S)
6. **CANCELLED** — Annulé

## Types de contrats

- `AUTO_MONO` — Automobile / Moto individuel
- `FLEET` — Flotte de véhicules (avec remorques)
- `BUS_SCHOOL` — Bus scolaire
- `GARAGE` — Responsabilité civile garage

## Intégration A.A.S

L'intégration avec le partenaire assureur se fait via une API REST.
Un **mode mock** est disponible (`ASS_MOCK_ENABLED=True`) pour le développement et les tests
sans appels réseau réels.

Endpoints couverts : calcul RC auto/moto/flotte/bus/garage, émission d'attestations,
annulation, vérification d'immatriculation, stock QR codes.

## Variables d'environnement clés

Voir `backend/.env.example` et `web/.env.example` pour la liste complète.

| Variable | Description | Défaut |
|----------|-------------|--------|
| `ASS_MOCK_ENABLED` | Activer le mode simulation | `True` |
| `ASS_REAL_CALLS_ALLOWED` | Autoriser les appels API réels | `False` |
| `ASS_POLICY_FEE` | Frais de police fixes (FCFA) | `3000` |
| `NEXT_PUBLIC_API_BASE_URL` | URL de l'API backend | `http://localhost:8000/api` |

## Documentation

Le dossier `docs/` contient :
- `docs/ass/analyse_api_ass.md` — Analyse détaillée de l'API A.A.S
- `docs/ass/roadmap_horus_ass.md` — Roadmap d'implémentation
- `docs/ass/*.postman_*.json` — Collections Postman pour les tests
