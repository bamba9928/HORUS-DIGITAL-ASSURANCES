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

Le périmètre mobile de la roadmap (`docs/ass/roadmap_horus_ass.md`, phase 10),
et depuis le 02/09/2026 le tunnel complet : un apporteur ouvre un dossier, le
règle et sort l'attestation sans repasser par un ordinateur.

| Écran | Route | Contenu |
|-------|-------|---------|
| Connexion | `/login` | Identifiant / email / téléphone + mot de passe |
| Tableau de bord | `/dashboard` | Production, échéances, activité financière, derniers mouvements |
| Contrats | `/contracts` | Liste, recherche, filtres statut / échéance, tirer pour rafraîchir |
| Souscription | `/contracts/new` | Véhicule, souscripteur, garanties, devis ASS |
| Fiche | `/contracts/[id]` | Actions, véhicule, montants, couverture, attestations, paiements |
| Commissions | `/commissions` | Total, filtre par statut, commission et net à verser |

### Souscription

Trois des quatre types du web : **Auto mono**, **Flotte** et **Bus école**.
Seul le garage reste sur le web — il a des champs qui lui sont propres (nombre
de cartes) et aucun véhicule à saisir.

⚠️ **La moto n'est PAS un type de contrat.** Côté ASS, un deux-roues est un
contrat auto mono-véhicule dont la catégorie est C5 ; c'est le modèle du web, et
le type réellement envoyé s'en déduit (`effectiveContractType`).

Le mobile en faisait un type à part, et sa liste « Auto » — filtrée par le
serveur sur le tag `AUTO_MONO` — n'offrait alors **aucun moyen d'atteindre C5**,
qui porte le tag `MOTO`. Il fallait deviner qu'il existait un autre type. D'où
le tri repris du web : les catégories descendent une fois, sans filtre, et le
menu retient celles dont un tag figure dans `CATEGORY_TAGS` — `["AUTO_MONO",
"MOTO"]` pour l'auto mono. Choisir C5 bascule le formulaire (cylindrée et usage
au lieu de puissance fiscale et places), exactement comme le web.

Les brouillons créés avant ce regroupement portent encore le type `MOTO` : ils
se rouvrent sous « Auto mono », leur catégorie C5 les redésignant d'elle-même.

Quatre étapes, la même découpe que le web pour qu'un apporteur qui passe d'un
écran à l'autre retrouve ses repères. Le brouillon est créé au premier calcul
puis mis à jour : revenir ajuster une garantie ne sème pas un contrat mort dans
la liste à chaque essai.

Aucune prime n'est calculée sur le téléphone. Le devis vient d'ASS via le
backend — le reproduire ici donnerait un montant qui finirait par diverger de
celui qui engage la compagnie. Même chose pour les bornes de durée : elles
arrivent du référentiel (`min_duration` / `max_duration`), elles ne sont pas
recopiées.

Les listes déroulantes et le calendrier sont maison
(`src/components/form.tsx`) : `@react-native-picker/picker` et
`@react-native-community/datetimepicker` ne sont pas embarqués dans Expo Go, et
les ajouter obligerait à passer par un build de développement pour la moindre
vérification sur téléphone.

### L'habillage suit le web

Libellé violet en capitales avec astérisque rouge, champ à choix teinté de
violet — face au champ de saisie libre, resté neutre — et liste déroulante en
aplat violet, texte blanc. C'est la grammaire de `SelectSearch.tsx` et
`DatePicker.tsx` côté web : un apporteur qui passe d'un écran à l'autre doit
reconnaître du premier coup d'œil ce sur quoi il peut appuyer.

Une option que le référentiel donne pour `enabled: false` reste **affichée**,
suffixée « À venir » et non sélectionnable. Le mobile la masquait : un apporteur
à qui un client demandait une catégorie absente de la liste en concluait que
l'application était en retard sur le catalogue.

### Couverture : rien n'est prérempli

- **Date d'effet** : un calendrier, pas une saisie « JJ/MM/AAAA ». Les jours
  antérieurs à aujourd'hui sont barrés — une couverture ne commence pas hier.
  Aucune date par défaut : posée d'office, elle serait signée sans avoir été
  choisie.
- **Durée** : une liste, sans valeur par défaut. Les bornes viennent du
  référentiel (`min_duration` / `max_duration`), là où le web écrit son menu de
  1 à 12 mois en dur : ce sont des règles ASS, elles bougeront sans nous
  prévenir.
- **Périodicité** : plus de champ. Le web la fixe à `MOIS` et ne l'affiche pas ;
  elle reste dans la charge utile pour ne pas diverger du format partagé.

⚠️ **La fin de couverture, c'est effet + durée MOINS UN JOUR.** Douze mois pris
le 1er octobre 2026 couvrent jusqu'au 30 septembre 2027, pas jusqu'au 1er
octobre. `coverageEndIso` (`src/lib/format.ts`) est le miroir exact de
`calculate_expiration_date` (`backend/contracts/services.py`), y compris le
report du 31 sur le dernier jour du mois d'arrivée — un mois après le 31 janvier
tombe le 27 février. Les deux implémentations ont été comparées sur les cas
limites (fin de mois, année bissextile, périodicité `JOUR`) et rendent la même
date.

Elle s'affiche sous la durée pendant la saisie, et dans le récapitulatif du
devis. Ni le web ni le mobile ne le faisaient : « 12 mois » n'aide pas un
apporteur qui doit annoncer une date de fin à son client, et un jour d'écart ne
se découvre qu'au sinistre.

C'est une PRÉVISION. Après émission, la date qui fait foi est celle qu'ASS
renvoie et que le contrat stocke (`date_expiration`) : c'est elle qu'affiche la
fiche. Les deux coïncident normalement ; si elles divergent, ASS a raison.

Le calendrier n'utilise pas `Intl` pour ses noms de mois : les données de locale
embarquées dans le moteur JS varient d'un appareil à l'autre, et un mois affiché
en anglais sur un téléphone et en français sur un autre serait un défaut pénible
à reproduire. Les dates ISO sont analysées composante par composante —
`new Date("2026-06-05")` serait lu en UTC et rendrait le 4 juin à l'ouest de
Greenwich.

L'assistant s'arrête au devis. Le paiement et l'émission vivent sur la fiche du
contrat, seul endroit où l'on agit sur un dossier — qu'il vienne d'être créé ou
qu'il ait été ouvert la semaine dernière depuis le web.

### Flotte

Le web aligne les véhicules dans un tableau. Un téléphone ne peut pas, et n'a
pas à essayer : chaque véhicule est une **carte**, on l'ouvre pour le modifier,
et la saisie se fait dans une feuille plein écran — le même formulaire qu'en
mono-véhicule, ni plus court ni différent (`VehicleFields`, partagé par les
deux). Une carte incomplète porte un signe d'alerte : un seul véhicule mal
renseigné fait refuser tout le devis, et l'apporteur doit pouvoir repérer lequel
sans attendre le calcul.

Les remorques se rattachent depuis la carte de leur tracteur. ASS ne leur
demande que marque, modèle et immatriculation : elle les tarife à part, liées
par `tractorVehicleId`.

⚠️ **La couverture appartient au CONTRAT, pas aux véhicules.** Date d'effet et
durée sont saisies une fois, sous la liste. Le backend les valide à cet endroit
précis (`FLEET_COVERAGE_FIELDS`, `validate_fleet_coverage_for_quote`) et refuse
le devis si elles manquent — les champs de couverture restent néanmoins présents
et vides dans chaque véhicule, parce que c'est la forme que le web produit et
que ce n'est pas au mobile de l'alléger unilatéralement.

Le devis d'une flotte revient **ventilé** : une prime par véhicule et par
remorque (`items`). L'écran les affiche ligne par ligne — un total unique sur
douze véhicules n'apprendrait rien et masquerait la ligne aberrante. Les
libellés viennent de la saisie, pas de la réponse : ASS renvoie souvent
l'identifiant technique (« veh-local-1 »), là où l'apporteur reconnaît
« TOYOTA DK-0001-FL ».

### Reprendre un brouillon

`/contracts/new?draftId=42` rouvre un dossier existant : la fiche y renvoie par
« Reprendre le brouillon » (statut `DRAFT`) ou « Modifier le brouillon »
(`QUOTE_READY`). Le devis se recalcule sur le MÊME contrat — pas de doublon
semé dans la liste.

Deux points de conception :

**Les étapes ne sont pas montées tant que le brouillon n'est pas chargé.** Tous
les champs sont pilotés par leur valeur, calendrier compris : rien ne se fige au
montage. Mais un formulaire vide affiché une seconde avant de se remplir tout
seul se lit comme une saisie perdue — on attend d'avoir de quoi le montrer.

**Le brouillon est lu champ par champ** (`readVehicle`, `readPerson`…), jamais
par décalage d'objet. C'est du JSON libre écrit ailleurs — par le web, ou par
une version antérieure de cette application : un nombre là où le formulaire
attend une chaîne traverserait sans bruit jusqu'à `TextInput`. Les noms de
champs (`vehicle.fiscalPower`, `sameAsPolicyholder`…) sont ceux du web, c'est
un format partagé et non une invention du mobile.

Le garage ne se rouvre pas ici : sa saisie n'a pas d'équivalent sur cet écran.
Le bouton n'apparaît pas, et l'écran refuse explicitement si on l'atteint
autrement — rouvrir un garage dans un formulaire véhicule écraserait sa saisie
au premier enregistrement.

Une flotte se rouvre AVEC ses remorques : elles sont relues sous leur véhicule,
et les identifiants du brouillon (`veh-local-1`, `rem-local-1`) sont conservés
tels quels. En fabriquer de nouveaux à la relecture perdrait l'attelage — c'est
`tractorVehicleId` qui dit à ASS quelle remorque suit quel tracteur.

Un `SelectField` affiche la valeur BRUTE tant que son libellé n'est pas connu.
Le référentiel arrive du réseau et les marques ne descendent qu'à la recherche :
sans ce repli, la reprise affichait « Choisir… » sur un véhicule dont la marque
et le genre étaient pourtant renseignés.

## Paiement et émission

Le panneau « Actions » de la fiche reprend le tunnel du web et n'apparaît pas
pour la finance (`src/lib/permissions.ts` : miroir de
`can_manage_contract_workflow`).

Les boutons suivent le STATUT, au lieu de rester tous affichés et aux trois
quarts éteints comme sur le web : brouillon → reprendre / calculer, devis prêt →
payer / modifier, payé → émettre. Sur un écran de téléphone, une pile de
commandes grises n'apprend rien que la phrase du bas ne dise mieux, et elle
éloigne du pouce la seule qui compte.

Rien n'est vérifié côté client avant de demander un devis : c'est ASS, via le
backend, qui dit si le dossier est tarifable, et son refus porte la raison. Le
web, lui, recopie un contrôle de complétude — plus strict que le backend, il
bloquerait ici des brouillons parfaitement calculables.

**Orange Money est meilleur ici que sur le web**, et pas d'un cheveu : c'est
l'APPORTEUR qui règle le net à verser, sur son propre compte. Le navigateur ne
peut donc qu'afficher un code à faire scanner par un téléphone ; l'application,
elle, ouvre MaxIt directement sur le montant (`Linking.openURL`, liens fournis
par l'API). Le QR reste proposé en dessous pour le cas où le compte payeur est
sur un autre appareil.

Trois points à ne pas défaire :

**Le montant n'est ni calculé ni transmis par le client.** L'initiation ne prend
qu'un identifiant de contrat, le backend fixe la somme
(`payments.services.expected_payment_amount`). `payableAmount` (`src/lib/api.ts`)
ne sert qu'à AFFICHER et à savoir si le bouton a un sens — les deux formules
doivent rester identiques, sinon l'apporteur lit un montant et en paie un autre.

**Orange Money reste seule source de vérité.** L'application sonde le statut
toutes les quatre secondes ; elle ne décrète jamais elle-même qu'un paiement est
passé.

**Le QR arrive en data-URI, dans un format qui change selon l'environnement** :
PNG depuis l'API réelle, SVG depuis le mock. Le `Image` de React Native laisse
le SVG en blanc, sans erreur ni trace dans les journaux — d'où `expo-image`, qui
décode les deux, et un repli explicite si le décodage échoue quand même.

L'émission demande confirmation : elle consomme une attestation du stock ASS et
ne se rejoue pas. Le web s'en dispense, la souris se trompe moins qu'un doigt.

### Une attestation PAR véhicule et par remorque

C'est l'usage terrain le plus concret de l'application : l'apporteur sort le
papier du client depuis son téléphone. Chaque ligne assurée a le sien — numéro,
date d'expiration, **attestation digitale** et **carte brune CEDEAO**, le
document exigé au passage des frontières. Une flotte de douze camions et trois
remorques en produit quinze.

La liste vient de `ass_attestations`, que le backend recompose depuis les
échanges d'émission avec ASS. ⚠️ **Ne pas revenir aux champs plats du contrat**
(`link_attestation_digitale`, `link_attestation_cedeao`) : ils ne portent que la
PREMIÈRE attestation. La fiche s'y fiait, et n'affichait donc qu'un document sur
quinze — onze chauffeurs sans papier, et rien à l'écran pour le laisser
soupçonner. Ils ne servent plus que de repli, pour les dossiers émis avant que
ces échanges ne soient conservés.

Les deux boutons portent des libellés courts (« Attestation », « CEDEAO »), leur
nom complet passant par l'accessibilité : côte à côte en toutes lettres ils
débordent de la largeur et se replient l'un sous l'autre, ce qui doublait la
hauteur de la section sur une flotte.

### Essayer le paiement en local

Le mock Orange Money est refusé hors développement — un porteur de compte
pouvait sinon marquer son contrat payé sans qu'un franc ne bouge, puis
déclencher une émission ASS réelle (garde-fou `assert_om_mock_allowed`, ajouté
le 28/08/2026). Il exige donc `DEBUG` :

```bash
DJANGO_DEBUG=True uv run python backend/manage.py runserver 0.0.0.0:8000
```

Sans cette variable, le bouton rend « Paiement Orange Money indisponible » et
rien dans l'application ne dit que c'est la configuration du serveur qui parle.
Une variable d'environnement suffit : inutile de la poser dans `backend/.env`,
où elle survivrait à la session.

## Les onglets se rechargent au retour

Un onglet reste monté une fois visité. Payer puis émettre depuis une fiche
laissait donc la liste sur « Devis prêt » et le tableau de bord sur ses anciens
compteurs, jusqu'à ce que l'apporteur pense à tirer pour rafraîchir.

Les trois onglets passent par `useFocusEffect` : rechargement au retour au
premier plan, et pas au seul montage. Les commissions aussi — une commission
naît à l'émission, c'est-à-dire pendant que l'onglet est en arrière-plan.

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

- Tarification détaillée, attestations multiples et commission sur la fiche —
  le backend les sert déjà (`quote_breakdown`, `ass_attestations`,
  `commission_snapshot`), le mobile n'en lit qu'une partie
- Garage : le seul type de contrat qui reste exclusivement sur le web
- Pagination : la liste s'arrête à 25 contrats, les commissions à 50
- Écran profil (mot de passe, déconnexion, version)
- Hors ligne : une panne réseau au démarrage renvoie au login
- Notifications push sur les échéances — impossible dans Expo Go depuis le
  SDK 53 sur Android, demande un build de développement
- Appareil photo pour la carte grise
- Brouillons hors ligne

Le changement de statut d'une commission n'est volontairement **pas** exposé :
`_can_update_snapshot` le réserve à l'admin et à la finance, qui travaillent sur
le web. Le bouton n'aurait rendu qu'un 403 à l'apporteur, seul utilisateur
mobile.
