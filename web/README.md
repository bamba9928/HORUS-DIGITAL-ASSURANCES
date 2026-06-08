# Horus — Frontend (Next.js)

Interface web de la plateforme Horus Assurances Digital.

## Stack

- **Next.js 16** (App Router, mode standalone)
- **React 19**
- **TypeScript 5** (strict)
- **Tailwind CSS 4**
- **Lucide React** (icônes)

## Démarrage

```bash
# Copier les variables d'environnement
cp .env.example .env.local

# Installer les dépendances
npm install

# Serveur de développement
npm run dev
# → http://localhost:3000
```

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | URL de base de l'API Django | `http://localhost:8000/api` |

## Scripts

```bash
npm run dev       # Serveur de développement (webpack)
npm run build     # Build de production
npm start         # Serveur de production
npm run lint      # ESLint
npm run typecheck # Vérification TypeScript (sans émission)
```

## Structure

```
src/
├── app/                    # Pages Next.js (App Router)
│   ├── page.tsx            # Tableau de bord
│   ├── login/              # Connexion
│   ├── contracts/          # Liste + détail + création
│   ├── commissions/        # Commissions
│   ├── payments/           # Paiements
│   ├── users/              # Gestion utilisateurs
│   ├── organizations/      # Gestion organisations
│   ├── referentials/       # Référentiels (marques)
│   ├── integrations/ass/   # Supervision intégration ASS
│   └── config/             # Configuration plateforme
├── components/
│   ├── AppShell.tsx        # Layout principal (sidebar + topbar)
│   ├── AuthProvider.tsx    # Contexte d'authentification
│   ├── ui.tsx              # Bibliothèque de composants partagés
│   ├── DashboardContractMetrics.tsx
│   ├── DashboardAssStockCard.tsx
│   ├── DatePicker.tsx
│   └── SelectSearch.tsx
└── lib/
    ├── api.ts              # Client API + types TypeScript
    └── permissions.ts      # Fonctions de contrôle d'accès
```

## Authentification

L'app utilise l'authentification par session Django (cookies `sessionid` + `csrftoken`).
Le contexte `AuthProvider` expose `auth`, `isLoading` et `refreshAuth()` via le hook `useAuth()`.

Toutes les pages protégées doivent utiliser `useAuth()` — ne jamais appeler `fetchCurrentUser()` directement dans un composant de page.

## Composants partagés (`ui.tsx`)

| Composant | Description |
|-----------|-------------|
| `PageAction` | Bouton CTA (lien `href` ou action `onClick`) |
| `MetricCard` | Carte statistique avec tonalité (neutral/primary/success/warning) |
| `StatusBadge` | Badge de statut coloré |
| `ContractTypeBadge` | Badge de type de contrat |
| `AlertMessage` | Message d'alerte (error/warning/info/success) |
| `EmptyState` | État vide avec action optionnelle |
| `LoadingState` | Spinner de chargement |

## Contrôle des accès (`permissions.ts`)

```typescript
canCreateContract(user)         // ADMIN_GENERAL | ADMIN_GROUP | CONTRIBUTOR
canConfirmContractPayment(user) // ADMIN_GENERAL | ADMIN_GROUP | FINANCE
canManageUsers(user)            // ADMIN_GENERAL | ADMIN_GROUP
canViewOrganizations(user)      // ADMIN_GENERAL | ADMIN_GROUP
canViewPayments(user)           // ADMIN_GENERAL | ADMIN_GROUP | FINANCE
canViewConfig(user)             // ADMIN_GENERAL
canManageOrganizations(user)    // ADMIN_GENERAL
canViewAssIntegration(user)     // ADMIN_GENERAL | ADMIN_GROUP | FINANCE
```

## Déploiement

Le build produit un output `standalone` (configuré dans `next.config.ts`).

```bash
npm run build
# Artefacts dans .next/standalone/
```
