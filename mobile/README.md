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

## Appareil réel par USB

Le Wi-Fi du téléphone coupé, ou un réseau qui isole les clients les uns des
autres, l'IP LAN ne sert à rien. `adb reverse` remonte alors les deux ports du
poste **dans** le téléphone, et `localhost` y désigne bien le poste :

```bash
adb reverse tcp:8081 tcp:8081   # Metro
adb reverse tcp:8000 tcp:8000   # API Django
```

`mobile/.env` pointe alors sur `http://localhost:8000/api`, et Expo Go s'ouvre
sur le projet par lien profond :

```bash
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent
```

⚠️ **Metro doit écouter sur toutes les interfaces**, pas seulement sur la boucle
locale. `npx expo start --host localhost` le lie à `::1` — IPv6 uniquement — là
où `adb reverse` compose en IPv4 sur `127.0.0.1` : le téléphone reçoit un refus
de connexion et Expo Go n'affiche qu'un « Failed to download remote update »,
sans que Metro ne journalise la moindre requête. La bonne incantation :

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --host lan
```

Metro écoute sur `0.0.0.0` et annonce `127.0.0.1` : le téléphone va chercher le
bundle chez lui, c'est-à-dire au bout du câble. Vérifiable d'un coup d'œil —
`netstat -ano | grep 8081` doit montrer `0.0.0.0`, jamais `[::]` seul.

## Ce qui est implémenté

Le périmètre mobile de la roadmap (`docs/ass/roadmap_horus_ass.md`, phase 10) :
connexion, tableau de bord, contrats, commissions, attestations, et la
souscription mono-véhicule jusqu'au devis.

| Écran | Route | Contenu |
|-------|-------|---------|
| Connexion | `/login` | Identifiant / email / téléphone + mot de passe |
| Tableau de bord | `/dashboard` | Production, échéances, activité financière, derniers mouvements |
| Contrats | `/contracts` | Liste, recherche, filtres statut / échéance, tirer pour rafraîchir |
| Souscription | `/contracts/new` | Véhicule, souscripteur, garanties, devis ASS |
| Fiche | `/contracts/[id]` | Véhicule, montants, couverture, attestations, paiements |
| Commissions | `/commissions` | Total, filtre par statut, commission et net à verser |

### Souscription

Auto et moto, **un seul véhicule**. La flotte, le garage et le bus école
restent sur le web : ils demandent de gérer une liste de véhicules et leurs
remorques, saisie de tableur qu'un écran de téléphone rend pénible et fautive.

Quatre étapes, la même découpe que le web pour qu'un apporteur qui passe d'un
écran à l'autre retrouve ses repères. Le brouillon est créé au premier calcul
puis mis à jour : revenir ajuster une garantie ne sème pas un contrat mort dans
la liste à chaque essai.

Aucune prime n'est calculée sur le téléphone. Le devis vient d'ASS via le
backend — le reproduire ici donnerait un montant qui finirait par diverger de
celui qui engage la compagnie. Même chose pour les bornes de durée : elles
arrivent du référentiel (`min_duration` / `max_duration`), elles ne sont pas
recopiées.

Les listes déroulantes et le champ date sont maison
(`src/components/form.tsx`) : `@react-native-picker/picker` et
`@react-native-community/datetimepicker` ne sont pas embarqués dans Expo Go, et
les ajouter obligerait à passer par un build de développement pour la moindre
vérification sur téléphone.

Le paiement et l'émission restent sur le web.

## ⚠️ Après un `git pull` qui change les routes

`npx tsc --noEmit` peut échouer sur des routes parfaitement valides :

```
src/app/index.tsx(23,20): Type '"/dashboard"' is not assignable to ...
```

Ce n'est PAS une vraie erreur. `.expo/types/router.d.ts` est généré par
`expo start` et **gitignoré** : après un pull qui ajoute ou déplace des écrans,
votre copie locale décrit encore l'ancien arbre de routes, et le typecheck
valide donc contre des données mortes.

```bash
npx expo start     # régénère .expo/types/, quelques secondes suffisent
# puis, dans un autre terminal :
npx tsc --noEmit
```

Le réflexe inverse — « le typecheck échoue, la route doit être fausse » — coûte
une demi-heure à chercher un bug qui n'existe pas. `npx expo export --platform
android`, lui, ne lit pas ce fichier : s'il passe, les imports et les écrans
sont bons.

## Navigation

```
/                     redirection selon la session
/login
(app)/                garde d'authentification — tout ce qui suit exige une session
  (tabs)/             barre d'onglets : Accueil · Contrats · Commissions
  contracts/new       assistant de souscription
  contracts/[id]      poussée PAR-DESSUS les onglets, avec bouton retour
```

`contracts/new` passe avant `contracts/[id]` : un segment fixe l'emporte sur un
segment dynamique, `/contracts/new` n'est donc jamais lu comme un contrat
d'identifiant « new ».

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

## Le texte coupé sans ellipse, sur Android

Vérification sur SM-A156E (Android 16, Expo Go 57, zoom d'affichage à 540 dpi,
soit 320 dp de large) : **Android ampute le dernier fragment d'un `<Text>`
quand la mesure conclut « ça tient sur une ligne » et que le rendu, lui,
déborde de peu.** Pas d'ellipse, pas d'avertissement — le mot disparaît. Vu sur
« Espace apporteur » affiché « Espace », sur « Créée le <date> » sans sa date,
sur « <date> · admin » sans le nom.

Ni `numberOfLines` ni `textBreakStrategy` n'y changent quoi que ce soit. Deux
parades, à appliquer selon le cas :

- **Étirer le texte à une largeur connue** — `alignSelf: "stretch"` dans un
  conteneur centré, `flex: 1` dans une rangée — au lieu de le laisser
  dimensionner par son propre contenu. C'est la mesure au pixel près qui casse ;
  une largeur imposée n'a plus rien à jouer.
- **Ne pas faire dépendre une information d'un repli limite** : deux `<Text>`
  courts valent mieux qu'une ligne dense qui déborde d'un mot.

`joinMeta` (`src/lib/format.ts`) assemble ces lignes en JavaScript plutôt qu'en
enfants JSX multiples, et fait disparaître un segment vide avec son séparateur —
d'où la fin des « 11/08/2026 · » en suspens.

## Reste à faire

- Paiement Orange Money par lien profond (`scheme: horus`)
- Émission de l'attestation depuis le mobile
- Notifications push sur les échéances
- Appareil photo pour la carte grise
- Brouillons hors ligne

Le changement de statut d'une commission n'est volontairement **pas** exposé :
`_can_update_snapshot` le réserve à l'admin et à la finance, qui travaillent sur
le web. Le bouton n'aurait rendu qu'un 403 à l'apporteur, seul utilisateur
mobile.
