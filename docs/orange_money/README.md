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

## 2026-09-07 : application APPROUVÉE en production

Mail de **Seyni Ndiaye NIASSE** (SNT DIP-X / ID Tech Lab, seynindiaye.niasse@orange-sonatel.com)
le 2026-09-07 à 14:34, dans le fil : « L'application a été approuvée. » Il fait
suite au routage de Mme Diop le même jour à 09:41 (« @Seyni Ndiaye NIASSE pour
approbation »).

Fiche de production :
`/dashboard/applications/show/horus-assur-digital-c20704a5-9e6b-4a11-9242-c5687bc02cc4-prod`

| Élément | État au 2026-09-08 |
| ------- | ------------------ |
| Application | **Approuvée**, interrupteur sur **Production** |
| Bloc de clés | **Clé API de production** |
| `oauth` | approuvée |
| `QR CODE - OM` | approuvée |
| `NOTIFICATION` | approuvée |
| `Orange-Money-Distributeur` | approuvée |
| **`PAYMENT - OM`** | **En attente** |

⚠️ Les clés du bloc « Clé API de production » sont **exactement les mêmes valeurs**
que celles du bloc « Clé API de test » déjà collées dans `backend/.env` : le
portail n'émet qu'un seul couple par application, c'est la passerelle qui décide
de l'environnement. Il n'y a donc rien de nouveau à copier.

## 2026-09-08 : validation contre l'API réelle de production

Sondes lancées avec `OM_BASE_URL=https://api.orange-sonatel.com OM_PROBE_ALLOW_PROD=1`.

| Appel | Résultat |
| ----- | -------- |
| `POST /oauth/v1/token` | **200** — `expires_in=299`, réponse `{access_token, token_type, expires_in, scope, refresh_token, refresh_expires_in}` |
| `POST /api/eWallet/v4/qrcode` (1 XOF) | **200** — `{deepLink, deepLinks{OM,MAXIT}, qrCode, validity, metadata, shortLink, qrId, validFor{startDateTime,endDateTime}}` |
| `GET /api/eWallet/v1/transactions?reference=…` | **200 `[]`** (liste JSON nue) |
| `GET /api/notification/v1/merchantcallback` | **200 `[]`** puis, après enregistrement, notre callback |
| `POST /api/notification/v1/merchantcallback` | **succès, corps vide** |
| **Sandbox** `POST /oauth/v1/token` | **401 `unauthorized_client`** — toujours non provisionnée |

Conséquences pratiques :

1. **La sandbox est morte.** Les mêmes clés y sont refusées ; seule la production
   répond. Toute validation doit donc se faire **en production avec 1 XOF**.
2. **`PAYMENT - OM` « En attente » ne bloque pas** : la génération de QR et la
   recherche de transactions fonctionnent (elles relèvent de `QR CODE - OM` et de
   la recherche de transactions).
3. `qrCode` est bien un **PNG base64 nu** (577 octets décodés, magic `PNG`) :
   la conversion en data-URI de `_normalize_qrcode` est correcte.
4. Une demande de QR **non payée n'apparaît pas** dans `/transactions` : la
   recherche renvoie `[]` et `check_om_payment` laisse donc le paiement en
   `PENDING`, ce qui est le comportement voulu.

### Deux bugs du client corrigés le 2026-09-08

- **415 sur les GET.** La passerelle exige `Content-Type: application/json`
  **même sur une requête sans corps**. `requests` ne le pose que lorsqu'un corps
  `json=` est fourni : `GET /api/notification/v1/merchantcallback` répondait
  `415 Unsupported Media Type`. `_request` envoie désormais `Accept` et
  `Content-Type: application/json` sur **tous** les appels.
- **Corps vide pris pour une erreur.** `POST /api/notification/v1/merchantcallback`
  répond avec un corps vide en cas de succès ; `response.json()` levait
  « Réponse Orange Money non JSON » et l'enregistrement — pourtant effectué —
  était rapporté en échec. `_request` renvoie maintenant `{}` sur un 2xx sans corps.

Au passage, `_token_cache` est désormais indexé par `(base_url, client_id)` :
un cache unique aurait servi un jeton de production à un appel sandbox.

## Webhook enregistré en production le 2026-09-08

```
POST /api/notification/v1/merchantcallback
{"code":"621513","name":"HORUS GLOBAL SERVICE",
 "callbackUrl":"https://horus-assur.digital/api/payments/om/callback/",
 "apiKey":"<OM_CALLBACK_API_KEY>"}
```

Relecture (`GET …/merchantcallback?code=621513`) :

```json
[{"code":"621513","msisdn":null,"name":"HORUS GLOBAL SERVICE",
  "callbackUrl":"https://horus-assur.digital/api/payments/om/callback/",
  "apiKey":"50bb79dd…de99d","createdAt":"08-09-2026 18:30:42"}]
```

⚠️ **La spec ment sur deux points** : l'`apiKey` est annoncée `writeOnly` et
« jamais renvoyée » — elle l'est en clair par le GET. Et le POST est documenté
`201` avec un corps `MerchantCallBack` — il renvoie un corps vide.

### ⚠️ `OM_CALLBACK_SIGNING_SECRET` doit rester VIDE en production

La spec est explicite : le secret de signature est *« your **endpoint secret**,
which is issued to you when your callback endpoint is provisioned »* — il est
**délivré par Sonatel**, ce n'est pas une valeur que le partenaire choisit.
L'enregistrement du callback n'en a renvoyé aucun.

La valeur actuellement dans `backend/.env` a été **générée localement** et n'a
jamais été transmise à Sonatel : si elle était posée en production,
`verify_signature` rejetterait **toutes** les notifications en 400 et le
rapprochement ne tiendrait plus que sur le sondage navigateur.

Configuration retenue au go-live : `OM_CALLBACK_SIGNING_SECRET` **vide**, et
`OM_CALLBACK_API_KEY` renseignée — le contrôle `Authorization: Basic <apiKey>`
suffit à passer le garde-fou « échec fermé » de `OmCallbackView`, et le corps du
callback n'est de toute façon jamais cru sur parole (`check_om_payment`
réinterroge l'API). **À demander à Sonatel** : le secret d'endpoint, pour
réactiver la vérification de signature.

## Audit du 2026-09-09 — ce qui a été corrigé

Un audit multi-agents a produit 66 constats ; son étage de vérification est mort
sur une limite de session, ils sont donc arrivés **non confrontés au code**. Ils
ont été triés à la main. Beaucoup étaient déjà obsolètes (en-tête `Content-Type`,
cache de jeton) ou faux — ainsi *« le bundle Android pointe sur localhost »* :
`mobile/.env` est un fichier de développement, et `mobile/src/lib/config.ts`
retombe sur `https://horus-assur.digital/api` en son absence.

Les corrections retenues portent toutes sur un scénario où de l'argent est
encaissé sans que le contrat passe en PAYÉ.

### Réconciliation — `manage.py om_reconcile`

**Le trou principal.** Le rapprochement reposait sur deux chemins faillibles : la
notification d'Orange (un 4xx de notre côté vaut rejet **définitif**, aucune
réémission) et le sondage du navigateur (mort dès que l'onglet se ferme). Aucun
filet en dessous : encaissement réel, contrat en `PAYMENT_PENDING`, silence.

La commande rejoue `GET /transactions` sur toutes les demandes non conclues des
dernières 48 h et confirme celles qui ont été réglées. Elle reprend aussi les
paiements passés en `CANCELLED` par une ré-initiation (`revive_cancelled`) : le
QR précédent restait payable chez Orange jusqu'à expiration, un client scannant
l'ancien code payait donc sans jamais faire basculer son contrat.

À planifier : `*/10 * * * * cd ~/apps/horus/backend && .venv/bin/python manage.py om_reconcile`

### Appel réseau sorti de la transaction

`initiate_om_payment` appelait Orange **dans** son bloc atomique : un dépassement
de délai annulait la ligne `Payment` alors qu'Orange avait pu créer le QR — une
référence payable sans aucune trace locale. La ligne est désormais committée
d'abord ; si l'appel échoue, elle reste `PENDING` et la réconciliation la
rattrape.

### Montant manquant : échec fermé

`if txn_amount and txn_amount != payment.amount` sautait la comparaison dès qu'un
montant valait 0 ou manquait : le paiement était confirmé **à l'aveugle** et une
police émise sans qu'on sache ce qui avait été encaissé. Un `SUCCESS` sans
montant exploitable laisse maintenant le paiement en attente.

### Sondage tolérant aux coupures (web + mobile)

Une seule requête ratée — coupure réseau d'une seconde, 502 passager, redémarrage
de gunicorn — affichait « paiement échoué » et **arrêtait la vérification**
pendant que le client réglait. Il faut désormais 3 échecs consécutifs (≈ 12 s) ;
une réponse valide remet le compteur à zéro. Le défaut était plus grave sur
mobile, où la coupure est la règle.

### Divers

- `find_transaction` : un `SUCCESS` prime sur une tentative échouée portant la
  même référence, et `fromDateTime` reçoit une marge arrière de 120 s (nos
  horloges ne sont pas synchronisées avec celles d'Orange, la borne est stricte).
- Rejeu unique sur `401` : `expires_in` vaut 299 s, une rotation en vol ne doit
  pas faire échouer un encaissement.
- Le corps d'erreur d'Orange est journalisé (diagnostic d'incident).
- Réponse OAuth non-JSON → `OmApiError` (502) au lieu d'un `ValueError` nu (500).
- Débit borné : `om_initiate` 12/min, `om_status` 60/min.

### Constats réels laissés ouverts

- Pas de déduplication sur `X-Sonatel-Idempotency-Key` — sans effet de bord
  aujourd'hui (`check_om_payment` court-circuite sur `CONFIRMED` sous verrou de
  ligne), mais chaque réémission coûte un appel Orange.
- `validFor` / `shortLink` ne sont toujours pas persistés. En revanche `qrId`
  l'est désormais (`Payment.om_qr_id`, migration `0004`) : un support Orange qui
  ne connaît qu'un QR peut être relié à un contrat.
- Le webhook public n'est pas limité en débit.
- Pas de dédoublonnage sur `X-Sonatel-Idempotency-Key`.

## Recette réelle du 2026-09-09 — un paiement de 10 XOF en production

Aucun contrat, aucune ligne `Payment` : QR marchand créé directement par sonde,
référence `PROBE-10XOF-RECETTE`, payé depuis MaxIt (MSISDN `772490530`).

### ⚠️ Plancher de 10 XOF non documenté

Le premier QR avait été émis à **1 XOF** : MaxIt refuse de le régler. Le montant
minimum d'un paiement marchand est **10 XOF**, alors que la spec annonce
`minimum: 1` sur `MoneyReq`. D'où `OM_MIN_AMOUNT = 10` et un refus explicite à
l'initiation, plutôt qu'un 502 opaque venu de la passerelle.

### 🔴 Le filtre `type` casse la recherche de transactions

**C'était bloquant** : aucun encaissement n'aurait jamais été confirmé.

Sur la transaction réellement payée, dont la charge utile porte pourtant
`"type": "MERCHANT_PAYMENT"` :

| Requête | Résultat |
| ------- | -------- |
| `?reference=PROBE-10XOF-RECETTE` | **1 résultat** |
| `?status=SUCCESS` | **1 résultat** |
| `?type=MERCHANT_PAYMENT` | **`[]`** |
| `?reference=…&type=MERCHANT_PAYMENT` | **`[]`** |

`find_transaction` envoyait systématiquement `type=MERCHANT_PAYMENT` : la
recherche renvoyait donc toujours `[]`, et **ni le sondage ni la réconciliation
n'auraient jamais confirmé un paiement**. Le paramètre n'est plus envoyé ; le tri
par type est refait localement, sur le champ que la réponse contient bel et bien.

### La charge utile authentique

```json
{
  "amount": {"value": 10.0, "unit": "XOF"},
  "requestDate": "2026-09-09T10:02:59.379Z",
  "reference": "PROBE-10XOF-RECETTE",
  "metadata": {"idClient": "recette-1xof",
               "idempotencyKey": "e8a43c9b-6bfb-4573-ae2b-c4564707bb4c",
               "notification.dispatched": "true"},
  "receiveNotification": true,
  "partner":  {"id": "621513",    "idType": "CODE",   "walletType": "PRINCIPAL"},
  "customer": {"id": "772490530", "idType": "MSISDN", "walletType": "PRINCIPAL"},
  "type": "MERCHANT_PAYMENT",
  "transactionId": "MP260909.1002.A34169",
  "createdAt": "2026-09-09T10:02:59.379Z",
  "updatedAt": "2026-09-09T10:03:01.210Z",
  "channel": "MAXIT",
  "status": "SUCCESS"
}
```

À retenir : **`amount.value` est un flottant** (`10.0`), pas un entier comme
annoncé — `_parse_amount` le ramène bien à `10`. Le `transactionId` suit le
format `MP<AAMMJJ>.<HHMM>.<suffixe>`. `metadata` est enrichie par Orange
(`idempotencyKey`, `notification.dispatched`) en plus de notre `idClient`.
`GET /transactions/{transactionId}/status` répond `{"status": "SUCCESS"}`.

Cette charge utile est figée dans `backend/tests/test_om_payments.py`
(`REAL_PAID_TRANSACTION`) : c'est le seul échantillon authentique dont nous
disposons, il sert de référence aux tests de non-régression.

### Le webhook fonctionne réellement

Journal de production, **2 secondes après le paiement** :

```
10:03:01 views Callback OM sans paiement correspondant
         (reference=PROBE-10XOF-RECETTE, transactionId=MP260909.1002.A34169)
```

Cette ligne n'est atteignable qu'**après** le contrôle `Authorization: Basic` :
la clé enregistrée chez Sonatel correspond à celle qu'Orange renvoie. Le 202 sur
référence inconnue est le comportement voulu — un 4xx aurait valu rejet définitif.

## Ce qu'il reste à faire

1. ~~Coller les clés du bloc « Clé API de test » dans `backend/.env`~~ — fait le
   2026-09-02.
2. **Demander l'activation à Ndèye Fakhane DIOP** (cc Fatoumata SENE, Alioune
   SECK) en donnant le nom de l'application et le code marchand. Sans cela le
   `/oauth/v1/token` sandbox reste en `unauthorized_client`.
3. Une fois activée, valider la sandbox sans toucher à la config de l'app :
   ```
   uv run python backend/scripts/om_sandbox_probe.py token
   uv run python backend/scripts/om_sandbox_probe.py qr
   ```
3. Enregistrer le webhook (une fois par environnement) :
   `uv run python backend/scripts/om_sandbox_probe.py register-callback`
   (utilise `OM_CALLBACK_URL` et `OM_CALLBACK_API_KEY`).
4. Basculer l'app en **Production** via l'interrupteur de sa fiche. Le profil
   doit d'abord être complété dans *Gestion comptes › Mon entreprise* :
   informations entreprise puis documents (CNI du gérant, NINEA, RCCM, RIB,
   contrat signé) — les mêmes pièces que celles déjà envoyées par mail.
5. **Revenir vers Ndèye Fakhane DIOP pour l'activation en production**, en
   copiant Fatoumata SENE et Alioune SECK.
6. Basculer `backend/.env` : `OM_BASE_URL=https://api.orange-sonatel.com`,
   `OM_MOCK_ENABLED=False`, `OM_REAL_CALLS_ALLOWED=True`, et les clés du bloc
   « Clé API de production ». Ne jamais laisser `OM_MOCK_ENABLED=True` en prod
   (`OM_ALLOW_MOCK_IN_PRODUCTION` reste à `False`).
