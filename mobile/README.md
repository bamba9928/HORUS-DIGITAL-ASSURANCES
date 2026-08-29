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

La première tranche verticale — celle qui traverse toute la chaîne sans
attaquer le morceau le plus lourd (l'assistant de souscription, 3 200 lignes
côté web) :

| Écran | Route | Contenu |
|-------|-------|---------|
| Connexion | `/login` | Identifiant / email / téléphone + mot de passe |
| Contrats | `/contracts` | Liste, tirer pour rafraîchir, statut, montant TTC |
| Fiche | `/contracts/[id]` | Véhicule, montants, couverture, souscription |

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
