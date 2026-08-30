# Horus — Mobile (Expo)

Client iOS / Android de la plateforme Horus Assurances Digital. Consomme la
**même API Django** que le front web (`web/`), avec une authentification par
jeton au lieu de la session par cookie.

> Le navigateur a déjà son client : le front Next.js. Cette application ne cible
> pas le web — `expo-secure-store` n'y existe pas, et `src/lib/tokens.ts` lève
> une erreur explicite plutôt que de laisser passer un stockage en clair.

## Démarrage

```bash
# Depuis mobile/
npm install

# Pointer vers le backend local (sinon l'application vise la production)
cp .env.example .env

# Lancer
npx expo start
```

Le backend doit tourner en parallèle : `uv run python backend/manage.py runserver`.

⚠️ **`localhost` depuis un téléphone physique désigne le téléphone, pas le
poste.** Utiliser `10.0.2.2` sur émulateur Android, l'IP LAN du poste sur
appareil réel. C'est la première cause de « API injoignable » au démarrage.

## Ce qui est implémenté

Tout le périmètre de **consultation** défini par la roadmap (`docs/ass/roadmap_horus_ass.md`,
phase 10) : connexion, tableau de bord, contrats, commissions, attestations.
Reste l'assistant de souscription — 3 200 lignes côté web, le gros morceau.

| Écran | Route | Contenu |
|-------|-------|---------|
| Connexion | `/login` | Identifiant / email / téléphone + mot de passe |
| Tableau de bord | `/dashboard` | Production, échéances, activité financière, derniers mouvements |
| Contrats | `/contracts` | Liste, recherche, filtres statut / échéance, tirer pour rafraîchir |
| Fiche | `/contracts/[id]` | Véhicule, montants, couverture, attestations, paiements |
| Commissions | `/commissions` | Total, filtre par statut, commission et net à verser |

## Navigation

```
/                     redirection selon la session
/login
(app)/                garde d'authentification — tout ce qui suit exige une session
  (tabs)/             barre d'onglets : Accueil · Contrats · Commissions
  contracts/[id]      poussée PAR-DESSUS les onglets, avec bouton retour
```

Les groupes `(app)` et `(tabs)` n'apparaissent pas dans les URL. La garde vit
dans `(app)/_layout.tsx` : un écran ajouté dessous hérite de la protection sans
rien faire.

`Tabs` vient de `expo-router/js-tabs` — depuis le SDK 57, l'export `Tabs` de
`expo-router` est déprécié et redirige vers ce module.

⚠️ Les icônes s'importent **une par une** (`@expo/vector-icons/Feather`), jamais
depuis le baril `@expo/vector-icons` : celui-ci embarque les polices des douze
jeux d'icônes, soit 3 Mo de TTF dans le bundle contre 56 Ko pour Feather seul.
Feather est le choix cohérent avec le web, qui utilise `lucide-react` — un fork
de Feather.

## Authentification

```
POST /accounts/auth/token/          → { access, refresh, user }
POST /accounts/auth/token/refresh/  → rotation
POST /accounts/auth/token/revoke/   → déconnexion
```

Trois points de conception à ne pas défaire :

**Le rafraîchissement est sérialisé** (`refreshInFlight` dans `src/lib/api.ts`).
Le backend fait tourner les refresh et met l'ancien en liste noire. Si plusieurs
requêtes prennent un 401 simultanément et rafraîchissent chacune de leur côté,
la première consomme le jeton et les autres présentent un refresh blacklisté :
l'utilisateur est déconnecté sans raison visible. Le symptôme n'apparaît que
sous mauvais réseau — typiquement en démonstration.

**Une panne réseau n'efface jamais les jetons.** Seul un 401 sur le
rafraîchissement, qui signe un refresh mort, déclenche le nettoyage. Une
coupure de tunnel ne doit pas coûter sa session à l'apporteur.

**Les jetons vivent dans `expo-secure-store`** (Keychain / Keystore). Jamais
dans `AsyncStorage`, qui écrit en clair : un refresh vaut 30 jours d'accès au
portefeuille de contrats.

## Cloisonnement

Aucun filtrage de données n'est fait côté client, et il ne faut pas en ajouter.
Le backend restreint déjà chaque liste au périmètre du rôle
(`get_contract_queryset_for_user`) : un apporteur ne reçoit que ses contrats.
Un filtre côté mobile donnerait l'illusion d'une protection qui n'existerait
pas.

## Reste à faire

- Souscription (assistant en 4 étapes) — le gros morceau
- Paiement Orange Money par lien profond (`scheme: horus`)
- Notifications push sur les échéances
- Appareil photo pour la carte grise
- Brouillons hors ligne

Le changement de statut d'une commission n'est volontairement **pas** exposé :
`_can_update_snapshot` le réserve à l'admin et à la finance, qui travaillent sur
le web. Le bouton n'aurait rendu qu'un 403 à l'apporteur, seul utilisateur
mobile.
