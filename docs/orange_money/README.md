# Orange Money — dossier d'intégration (Paiement Marchand)

Source : fil de mail « Demande d'intégration API Internet Orange Money — Horus
Assurances Digital » avec Ndèye Fakhane DIOP (OFMS/DBV/DB2B/GCA,
ndeyefakhane.diop@orange-sonatel.com), du 2026-05-24 au 2026-08-31.
Copie : Fatoumata SENE et Alioune SECK (OFMS/DPPE/SEIO).

## Compte marchand livré (mail du 2026-08-20, renvoyé le 2026-08-31)

| Paramètre        | Valeur                        |
| ---------------- | ----------------------------- |
| Raison sociale   | HORUS GLOBAL SERVICE API      |
| Mercode          | `621513`                      |
| Numéro OM        | `770930656`                   |
| Code secret      | fourni par mail — **à changer**, ne jamais committer |

Offre retenue : **API Marchand en mode QR code / deeplink** (prélèvement sur le
compte du client). L'API Cash In (dépôt vers un compte client) n'est pas
souscrite à ce stade.

## Documentation de référence

- API Marchand : https://developer.orange-sonatel.com/dev/docs/orange-money#tag/Merchant-Payment
- API Cash In : https://developer.orange-sonatel.com/dev/docs/orange-money#tag/Cash-In
- Spécification OpenAPI v1.1.0 (révision 2026-08-18) : `openapi_orange_money_v1.1.0.json`
  (miroir local de https://developer.orange-sonatel.com/b2cb53a029/uploads/2026_08_18_api_documentation_6bcff89aa3.json)
- Procédures de passage en production jointes au mail du 2026-08-20 :
  `Passage prod new portal pdf.pdf` (FR) et
  `Procedure prod new portal - EN version.pdf` (EN).

La spec confirme les chemins déjà codés dans
`backend/integrations/orange_money/constants.py` : `/oauth/v1/token`,
`/api/eWallet/v4/qrcode`, `/api/eWallet/v1/transactions`,
`/api/eWallet/v1/transactions/{transactionId}/status`,
`/api/notification/v1/merchantcallback`. Serveurs :
`https://api.sandbox.orange-sonatel.com` et `https://api.orange-sonatel.com`.

## Application portail — créée le 2026-09-02

Compte portail : `bigrip2016_1788338171721` (developer.orange-sonatel.com).

| Champ | Valeur |
| ----- | ------ |
| Nom | Horus Assur Digital |
| Environnement | Sandbox (interrupteur Sandbox / Production sur la fiche) |
| Statut | Approuvée |
| Fiche | `/dashboard/applications/show/horus-assur-digital-fc34260d-8f08-4101-8111-badc0f0b1797-sandbox` |

APIs souscrites, toutes **approuvées** en sandbox : `oauth`, `PAYMENT - OM`,
`QR CODE - OM`, `NOTIFICATION`, `Orange-Money-Distributeur` (Cash In, gardée pour
le reversement des commissions apporteurs).

Il n'y a **qu'une seule application** : elle naît en sandbox et bascule en
production par l'interrupteur de sa fiche — il ne faut pas en créer une seconde.

## La procédure Sonatel en 6 étapes (« Passage prod new portal », FR + EN)

Le mode opératoire joint au mail du 2026-08-20 décrit **un seul parcours**, qui va
jusqu'à la production. Les captures d'écran portent l'essentiel ; le texte est
maigre.

1. Se connecter au portail et ouvrir le menu **Applications**. ✅ fait
2. **Créer une application** : nom, description, logo, liste des APIs. ✅ fait
3. Sur la fiche, actionner l'**interrupteur Sandbox → Production**. ⬜
4. La modale « Votre profil actuel ne peut créer que des applications tests »
   apparaît → **Charger les documents** → *Gestion comptes › Mon entreprise* : ⬜
   - **1. Informations Entreprises** : nom, secteur d'activité, type
     d'entreprise, adresse du siège, numéro de contact, description de
     l'activité (« Marchand uniquement ») ;
   - **2. Documents Entreprise** : **CNI/Passeport DG, NINEA, RCCM, RIB,
     Contrat Signé** — les cinq pièces déjà envoyées par mail les 23 juin et
     11 juillet.
5. Retourner à **Applications** et **confirmer** le passage en production. ⬜
6. « Suite réception, vérification et approbation de votre dossier, vous pourrez
   disposer de vos identifiants de PRODUCTION. » ⬜

⚠️ La capture de l'étape 6 montre qu'une fois l'application basculée, le bloc
devient **« Clé API de production »** et les APIs repassent au statut
**« En attente »** : l'approbation de Sonatel est le véritable verrou, le
« approuvée » de la sandbox ne vaut rien.

Nous nous sommes arrêtés à l'étape 2. Les étapes 3 à 5 déclenchent la
vérification par Sonatel — c'est le « nous revenir pour activation » du mail.

## Demande d'activation envoyée le 2026-09-02

**Réponse de Mme Diop le 2026-09-02 à 10:50** (message `1a061bdaba1d352a`, soit
17 min plus tard) : « Bien reçu. J'ajoute les collègues pour l'activation. »
La demande est prise en charge et routée en interne — en attente.

Notre message : réponse dans le fil (message `1a061ae00fd61df2`), à Ndèye Fakhane DIOP, avec
Fatoumata SENE et Alioune SECK en copie. Le mail ne demande qu'une chose :
l'activation de l'application `Horus Assur Digital` (code marchand 621513). Il ne
parle ni des pièces du dossier — déjà transmises par mail les 23 juin et
11 juillet — ni du RIB.

## Réponse du 2026-09-03 : c'est à nous de basculer en production

**Message `1a067d4b85b4e1a4`, 2026-09-03 15:13**, cc Fatoumata SENE, Alioune SECK
et désormais aussi **Seyni Ndiaye NIASSE** (SNT DIP-X/ID Tech Lab/UX-BSC/ACS,
`seynindiaye.niasse@orange-sonatel.com`) :

> « Merci de passer en production pour l'activation de votre application. »

Confirme la lecture de l'étape 6 de la procédure « Passage prod new portal » :
Sonatel n'active pas le sandbox en amont d'un geste séparé — c'est le fait
d'actionner l'interrupteur **Sandbox → Production** sur la fiche applicative qui
déclenche leur vérification et l'activation. Il n'y a donc rien à obtenir avant
de basculer : c'est la prochaine action, et elle ne peut être faite que depuis le
compte portail `bigrip2016_1788338171721` (identifiants personnels, aucun agent
ne peut s'y substituer).

Marche à suivre inchangée par rapport à la section précédente (étapes 3 à 6) :
interrupteur Sandbox → Production sur la fiche `Horus Assur Digital` → confirmer
→ attendre vérification/approbation Sonatel → récupérer les identifiants de
production (bloc « Clé API de production ») → les reporter dans `backend/.env`
(`OM_BASE_URL=https://api.orange-sonatel.com`, `OM_CLIENT_ID`, `OM_CLIENT_SECRET`,
`OM_MOCK_ENABLED=False`, `OM_REAL_CALLS_ALLOWED=True`) sans jamais les committer.

## Prérequis découvert : profil personnel incomplet

`/dashboard/gestion-comptes/entreprise` **redirige** vers
`/dashboard/gestion-comptes/account` tant que le profil est incomplet :

> Informations personnelles incomplètes — Veuillez renseigner votre nom avant de
> mettre à jour les informations de l'entreprise.

Seul le champ `lastName` est vide (prénom et e-mail sont renseignés, l'e-mail est
en lecture seule). Il faut le remplir et valider avant d'atteindre l'étape 4.

## Étape 4 — état au 2026-09-02

### 1. Informations Entreprises — ENREGISTRÉ

| Champ | Valeur |
| ----- | ------ |
| Nom de l'entreprise | HORUS GLOBAL SERVICE |
| Type d'entreprise | Individuelle |
| Secteur d'activité | **laissé vide** (voir ci-dessous) |
| Siège social | Quartier Escale, Commune de Diourbel |
| Numéro de contact | 772490530 |
| Description | Courtage et distribution de contrats d'assurance automobile en ligne… |

Contraintes découvertes : `Siège social` est limité à **50 caractères**
(« Quartier Escale, Commune de Diourbel, Région de Diourbel » était refusé), et
le profil personnel doit porter un nom avant que la page ne s'ouvre.

⚠️ **Le sélecteur « Secteur d'activité » du portail ne propose que trois
options** — Agriculture et Pêche, Hébergement et Restauration, ONG — alors que le
formulaire papier en compte quatorze dont « Activités Financières et
d'Assurance ». La liste du portail est incomplète. Champ laissé vide plutôt que
de déclarer un secteur faux sur un dossier de conformité ; il n'est pas
obligatoire, l'étape 1 s'enregistre sans lui.

### 2. Documents Entreprise — 5 sur 6, BLOQUÉ sur le RIB

Le portail demande **six** pièces, pas cinq : la procédure PDF omet la *Fiche de
due diligence*.

| Emplacement portail | Fichier attaché |
| ------------------- | --------------- |
| CNI/Passeport DG | `CNI-BAMBA.pdf` |
| NINEA | `ninea.pdf` |
| RCCM | `RCCM.pdf` |
| **RIB** | **aucun** |
| Contrat Signé | `CONTRAT API 2026 - HORUS GLOBAL SERVICE (rempli).pdf` |
| Fiche de due diligence | `FICHE IDENTIFICATION 2026 - HORUS GLOBAL SERVICE (remplie).pdf` |

Premier essai sans RIB : *Ajouter* → **« Le RIB est obligatoire »**, soumission
refusée. Le RIB n'est pas contournable.

**Dossier soumis le 2026-09-02** avec les six pièces (RIB fourni par
l'utilisateur : `RIB.pdf`, ⚠️ le fichier ne contient qu'une ligne de titre
« RIB : Compte Orange Bank », sans numéro de compte ni identifiants bancaires —
risque de rejet à la vérification humaine, envoyé sur décision de l'utilisateur).
Réponse du portail : **« Modification réussie / Mis à jour effectuer avec succès »**.

Effet constaté : la modale bloquante « Votre profil actuel ne peut créer que des
applications tests » **n'apparaît plus** sur l'interrupteur de l'application — le
profil est donc accepté côté portail. En revanche l'interrupteur
**Sandbox → Production refuse toujours de basculer**, désormais silencieusement
(la case n'est ni `disabled` ni `readOnly`, le handler refuse). C'est cohérent
avec l'étape 6 : le dossier est en attente de *réception, vérification et
approbation* par Sonatel.

⚠️ Le portail **ne réaffiche pas** les fichiers déjà stockés : l'étape 2 revient
vide après rechargement. Impossible de vérifier visuellement chaque pièce ; seuls
le message de succès et la disparition de la modale attestent l'enregistrement.

Le compte de reversement étant un **compte Orange Bank (n° 772490530)**, il faut
produire une attestation de compte / RIB Orange Bank au format PDF ou image
(le champ accepte `application/pdf`, `.jpeg`, `.jpg`, `.png`), puis rejouer
l'étape 2 — les fichiers attachés ne survivent pas à un rechargement de page.

## Blocage constaté le 2026-09-02 : clés sandbox refusées par la passerelle

Les clés du bloc « Clé API de test » sont bien renseignées dans `backend/.env`
(vérifié par comparaison de hash avec la fiche du portail : identiques, dans le
bon ordre). Pourtant :

```
POST https://api.sandbox.orange-sonatel.com/oauth/v1/token
-> 401 {"error":"unauthorized_client",
        "error_description":"INVALID_CREDENTIALS: Invalid client credentials"}
```

Ce n'est **pas** un problème d'intégration :

- même erreur que les identifiants soient passés dans le corps
  `x-www-form-urlencoded` (ce qu'exige la spec) ou en `Authorization: Basic` ;
- avec un `client_id` volontairement faux, la passerelle répond `invalid_client`
  (« client inconnu »), alors qu'avec le vrai elle répond `unauthorized_client`.
  Le client_id est donc **reconnu mais pas autorisé** : l'application existe côté
  portail sans être provisionnée côté passerelle.

Cela correspond à la consigne de Sonatel dans le mail du 2026-08-20 : « créer une
application de production **et nous revenir pour activation** ». Le statut
« approuvée » affiché sur la fiche ne vaut donc **pas** activation sur la
passerelle — il faut la demander à Ndèye Fakhane DIOP.

## Ce qu'il reste à faire

1. ~~Coller les clés du bloc « Clé API de test » dans `backend/.env`~~ — fait le
   2026-09-02.
2. ~~Demander l'activation du sandbox à Ndèye Fakhane DIOP~~ — **superseded par
   sa réponse du 2026-09-03** : Sonatel n'active rien en amont, c'est le
   basculement de l'interrupteur qui déclenche leur vérification (voir section
   ci-dessus). Étape sans objet désormais.
3. **Basculer l'application en Production** — action manuelle sur le portail,
   à faire depuis le compte `bigrip2016_1788338171721` (identifiants
   personnels, aucun agent ne peut le faire) :
   - `https://developer.orange-sonatel.com/dashboard/applications` → fiche
     `Horus Assur Digital` → interrupteur Sandbox → Production → confirmer.
   - Le dossier entreprise (infos + 6 pièces dont le RIB) a été soumis le
     2026-09-02 ; si le portail redemande quelque chose, le compléter avant de
     confirmer.
4. **Attendre la vérification/approbation Sonatel**, puis récupérer les
   identifiants du bloc « Clé API de production » sur la fiche de l'app.
5. Reporter dans `backend/.env` : `OM_BASE_URL=https://api.orange-sonatel.com`,
   le nouveau `OM_CLIENT_ID`/`OM_CLIENT_SECRET`, `OM_MOCK_ENABLED=False`,
   `OM_REAL_CALLS_ALLOWED=True`. Ne jamais laisser `OM_MOCK_ENABLED=True` en
   prod (`OM_ALLOW_MOCK_IN_PRODUCTION` reste à `False`).
6. Valider sans toucher à la config de l'app :
   ```
   uv run python backend/scripts/om_sandbox_probe.py token
   uv run python backend/scripts/om_sandbox_probe.py qr
   ```
7. Enregistrer le webhook de production (une fois) :
   `uv run python backend/scripts/om_sandbox_probe.py register-callback`
   (utilise `OM_CALLBACK_URL` et `OM_CALLBACK_API_KEY`, cette fois en prod).
