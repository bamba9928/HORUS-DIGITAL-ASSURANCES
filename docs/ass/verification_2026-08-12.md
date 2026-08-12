# Vérification de l'intégration ASS — 2026-08-12

Audit du code contre les deux sources faisant autorité (PDF `ASS_API_Integration-v1.0`
et collection Postman `ASS API PARTNER v1.1`) + exécution des tests.

## 1. Sandbox ASS indisponible (blocage externe)

Toutes les routes `/api/v1/partner/*` de `https://kiiraytest.lasecu-assurances.sn`
répondent **404 HTML** (page 404 par défaut de Werkzeug), avec **et sans**
authentification — ce n'est donc pas un problème de jeton.

Diagnostic : leur backend est un **Odoo** et l'instance ne sert **aucune base de
données**.

```bash
curl -s https://kiiraytest.lasecu-assurances.sn/ -o /dev/null -w '%{url_effective}\n' -L
# -> https://kiiraytest.lasecu-assurances.sn/web/database/selector

curl -s -X POST https://kiiraytest.lasecu-assurances.sn/web/database/list \
  -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"call","params":{}}'
# -> {"jsonrpc": "2.0", "id": null, "result": []}
```

`result: []` = zéro base servie. Odoo ne peut rattacher aucune requête à une base,
donc **toutes** les routes des modules métier disparaissent → 404. C'est la même
cause que les régénérations de jeton déjà constatées : ASS restaure son instance.

Conséquences :

- Aucune sonde `ass_sandbox_probe.py` n'est exécutable (vérifié sur `stock`,
  `rc-auto`, `rc-auto-options`).
- Le VPS `horus-assur.digital` (`ASS_MOCK_ENABLED=False`) ne peut plus ni tarifer
  ni émettre tant qu'ASS n'a pas remonté l'instance.
- `https://manager.lasecu-assurances.sn` (URL du PDF §3.2) reste inutilisable :
  certificat TLS invalide pour ce nom d'hôte.

**Action ASS** : leur signaler que l'instance sandbox ne sert plus aucune base, et
redemander le jeton après remontée (il est régénéré à chaque restauration).

## 1 bis. Cause réelle du 404 : régression `dbfilter` chez ASS

Le 404 n'était pas une instance vide — c'est leur Odoo qui **ne résout plus de base
de données** pour une requête en Basic Auth seul. Preuve par les trois appels :

| Requête `stock.qr` | Résultat |
| --- | --- |
| Cookie de session seul | **401** `Your token could not be authenticated` — la route existe, l'auth tourne |
| Cookie **+** Basic Auth | **201 SUCCESS** — `data: "26.0"` |
| Basic Auth seul | **404 HTML** — la route ne se résout pas |

La base servie par la session s'appelle `insurance`
(`/web/session/get_session_info`). Aucun autre moyen de la désigner ne fonctionne :
`?db=insurance`, en-tête `X-Odoo-Db`, cookie `db` → 404 dans tous les cas. Seule
une vraie session Odoo débloque la résolution.

C'est donc une **régression de configuration chez ASS** (leur `dbfilter` ne mappe
plus l'hôte sandbox sur la base `insurance`), apparue depuis la restauration de
leur instance — les mêmes appels passaient en Basic Auth seul les 2026-06-11 et
2026-08-06.

Message à leur transmettre : *« Depuis la restauration de votre instance,
`/api/v1/partner/*` sur kiiraytest renvoie un 404 HTML pour toute requête en Basic
Auth seul : votre Odoo ne résout plus de base (la racine redirige vers
`/web/database/selector`). Les mêmes appels réussissent avec un cookie de session
lié à la base `insurance`. Merci de rétablir le `dbfilter` de la sandbox. »*

En attendant, les sondes peuvent tourner en injectant un cookie de session dans le
`requests.Session` passé à `AssClient(session=...)` — aucun changement de code
nécessaire, le client accepte déjà une session.

## 1 ter. ⚠️ `data` n'est plus l'assiette RC — le champ est devenu incohérent

Sondes réelles du 2026-08-12, toutes en SUCCESS avec nos propres builders :

| Endpoint | `data` | `PrimeRC` | `PrimeTotale` | `data` = PrimeRC + Cedeao ? |
| --- | ---: | ---: | ---: | --- |
| `rc.request` VP sans garanties | 5 069 | 3 575 | 7 884 | ❌ (3 875) |
| `rc.request` VP + garanties [1,2,4] | 14 008 | 10 726 | 22 499 | ❌ (11 026) |
| `rc.moto` 2RMOT | 3 003 | 2 382 | 6 495 | ❌ (2 682) |
| `bus.ecole.rc` BE-VTA | **241 718** | 16 899 | 23 407 | ❌ — 10× la prime totale |
| `rc.garage` C6-WG-4R | **164 183** | 68 831 | 83 908 | ❌ — 2× la prime totale |

La règle « `data` = PrimeRC + CEDEAO », validée en juin, **ne tient plus sur aucun
endpoint**. Pire, le même appel VP sans garanties renvoyait `data: 4769` le
2026-08-06 pour une `PrimeRC` identique (3 575) : leur calcul de `data` a changé
entre-temps.

En revanche la **ventilation reste parfaitement cohérente sur les cinq sondes** :
`PrimeRC + CoutPolice + PrimeAG + Taxe + Fga + Cedeao = PrimeTotale`, au franc près.
`PrimeRC` et `PrimeTotale` sont donc fiables ; `data` ne l'est pas.

Conséquences, car `extract_prime_rc` fait `int(data)` et alimente
`contract.prime_rc_ass`, qui sert **à la fois** d'assiette de commission apporteur
et de `responsabiliteCivile` envoyé à l'émission :

1. **Émission incohérente** : un contrat garage déclarerait une RC de 164 183 F pour
   une prime totale de 83 908 F ; un bus école, 241 718 F pour 23 407 F.
2. **Commission faussée** : la décision métier du 2026-06-11 (« assiette = `data`,
   soit PrimeRC + CEDEAO ») reposait sur une équivalence qui n'existe plus.

### Correctif : séparer les deux usages

Première tentative — remplacer `data` par `PrimeRC + Cedeao` dans
`extract_prime_rc` — **invalidée en production le jour même** : `qrcode.request`
répond alors `4006 "Merci de renseigner une Responsabilité civile valide"`. ASS
**contrôle** le montant reçu contre son propre calcul ; c'est `data` qu'il faut
lui envoyer, aussi surprenante que soit sa valeur. C'est cohérent avec la chaîne
validée le 2026-08-06, qui envoyait déjà `data`.

Les deux usages ont donc été séparés :

| Usage | Valeur | Fonction |
| --- | --- | --- |
| `responsabiliteCivile` envoyé à ASS | `data` | `extract_prime_rc` → `contract.prime_rc_ass` |
| Assiette de commission apporteur | `PrimeRC + Cedeao` | `contract_commission_basis(contract)` |

La décision métier du 2026-06-11 (assiette = RC + CEDEAO, non PrimeRC pure) est
préservée — elle ne porte simplement plus sur le même champ. Le repli sur
`prime_rc_ass` couvre les réponses sans ventilation (flotte, remorque, formats
historiques).

⚠️ Les contrats chiffrés pendant la fenêtre où `prime_rc_ass` valait
`PrimeRC + Cedeao` portent une RC qu'ASS refusera : relancer leur devis.

Question à poser à ASS malgré tout : *« Que recouvre exactement le champ `data` de
vos réponses RC ? Sur `rc.garage` il vaut 164 183 pour une `PrimeTotale` de
83 908, et sur `bus.ecole.rc` 241 718 pour 23 407. »*

## 1 quater. Garanties optionnelles : la dépendance est inverse

Constaté en production, puis cartographié en sandbox le 2026-08-12 :

| Cas | Réponse ASS |
| --- | --- |
| Garantie 2 **sans** `garantiesOptPT` | 400 « Merci de choisir un option pour les personnes transportées » |
| Garantie 4 **sans** `garantiesOptAR` | 400 « Merci de renseigner le capital pour la garantie avance sur recours » |
| Option envoyée **sans** sa garantie | accepté, silencieusement ignoré |
| `garantiesOptAS` | facultatif en toutes circonstances |

`validate_guarantee_option_dependencies` ne vérifiait que le sens toléré (option
sans garantie) et laissait passer les deux qui échouent. Corrigé : cocher la
garantie 2 ou 4 impose désormais son option, avec un message explicite et sans
appel réseau.

## 1 quinquies. Le vrai motif d'erreur était jeté

ASS renvoie ses erreurs métier sous la forme :

```json
{"error": "UserError", "error_descrip": "Erreur : Merci de choisir un option pour les personnes transportées."}
```

`AssClient._parse_error_body` lisait `error_description` (avec « tion ») et
retombait donc sur `error` — l'utilisateur voyait « UserError » et rien d'autre,
pour un contrat bloqué. Corrigé en ajoutant `error_descrip`. À noter que le motif
complet était déjà persisté dans `AssApiLog.response_payload` : seul l'affichage
le masquait.

## 2. Tests automatisés

`234 tests passés` (`pytest backend/tests`, 3 min 51 s). Aucun échec.

## 3. Écarts de payload relevés — et corrigés

Comparaison automatisée des payloads produits par nos builders avec les corps de
la collection Postman, endpoint par endpoint.

Rappel du garde-fou : l'API **rejette les champs inconnus** avec un 400 explicite
(`Invalid field '<champ>' on model '<endpoint>'`, constaté sur `chargeUtile`).
Tout champ « en plus » est donc un risque réel, pas une coquetterie.

| Endpoint | Écart trouvé | Correctif |
| --- | --- | --- |
| `moto.request` | `vehicule` portait en plus `puissanceFiscale`, `valeurNeuve`, `valeurActuelle`, `chassis` — absents du PDF §6.2 **et** de Postman → 400 quasi certain | `build_moto_issue_vehicle_payload` dédié : uniquement les 9 champs documentés |
| `moto.request` | `vehicule.usage` = `NON_COMMERCIAL` alors que le PDF et Postman écrivent `NON_COMMERCIALE` ici (le sans-E n'est prouvé que sur `rc.moto`) | `normalize_moto_usage_for_issue` ; `rc.moto` garde la forme courte prouvée en sandbox |
| `bus.ecole.request` | racine sans `garanties`, `valeurNeuve`, `valeurActuelle` | ajoutés, aux **mêmes valeurs** qu'à l'appel `bus.ecole.rc` |
| `garage.request` | racine sans `garanties`, `valeurNeuve`, `valeurActuelle` | ajoutés, alignés sur `rc.garage` |
| `rc.flotte.request` | chaque `requests[]` portait un `duree` absent de Postman (la durée est déjà à la racine) | retiré ; le mock flotte redescend la durée racine sur chaque véhicule |
| `remorque.qrcode.request` | `energie` en plus par rapport à Postman — mais le PDF §5.5 le liste comme obligatoire | **conservé** : on suit le PDF |
| `qrcode.request` | racine sans `valeurNeuve`/`valeurActuelle`, et `cout_police`/`remise_rc` en plus | **non touché** : chaîne validée SUCCESS de bout en bout le 2026-08-06, on ne casse pas ce qui est prouvé |

Motif des ajouts bus/garage : ces valeurs sont l'assiette de tarification. Les
omettre à l'émission alors qu'on les envoie au devis exposerait à une
retarification par ASS différente du montant déjà encaissé.

Après correctifs, plus aucun écart de clé avec Postman sauf `qrcode.request`
(délibéré, voir ci-dessus). Tests de non-régression ajoutés dans
`backend/tests/test_ass_payload_mapping.py` :
`test_moto_issue_vehicle_carries_only_documented_fields`,
`test_bus_and_garage_issue_repeat_the_rc_tariff_basis_at_root`,
`test_fleet_rc_declares_duration_once_at_root`.

⚠️ **Aucun de ces correctifs n'a pu être confirmé contre la sandbox** (voir §1).
Ils s'appuient sur la concordance PDF + Postman. À valider dès qu'ASS a remonté
son instance : `ass_sandbox_probe.py` couvre déjà `rc-moto`, `rc-bus`,
`rc-garage` et `rc-fleet`, mais **il n'existe pas encore de sonde d'émission pour
moto / bus / garage** (seul `issue-mono` existe) — à écrire sur le modèle de
`probe_issue_mono`, sachant que chaque exécution consomme un QR de test.

## 4. Conformité vérifiée par ailleurs

- **Endpoints** : les 14 routes utilisées correspondent au PDF/Postman. Annulation
  = `qrcode.mono.cancel` (PDF) avec repli `qrcode.cancel` (Postman) **uniquement
  sur 404**, jamais sur une erreur métier — pas de risque de double annulation.
- **Méthodes HTTP** : le PDF annonce GET pour `stock.qr`, `rc.moto` et
  `rc.flotte.request` ; nous envoyons du POST, conformément à Postman et validé en
  sandbox. Le PDF est faux sur ce point.
- **Référentiels** : genres, catégories C1→C10 + `BUS_ECOLE`/`REMORQUE`, garanties
  1→8, énergies, types de personne, périodicités — tous conformes au PDF §3.3.
  C4 (Pool TPV) correctement désactivé.
- **Première remorque à RC = 0** (PDF §5.4) : appliqué dans
  `calculate_trailer_quote_items`.
- **Barème de rabais flotte** (PDF §7.1, 10 % à 25 % selon le nombre de véhicules) :
  appliqué par ASS côté serveur. Nous envoyons en plus `remise_rc` à 20 % — à
  confirmer avec eux qu'il n'y a pas de cumul non voulu.

## 5. Bug de supervision corrigé — la page ASS mentait en prod

Constaté **en production** : `/integrations/ass` affichait « Environnement : Mock
(test) », « Appels réels : Désactivés » avec pastille verte, « Stock QR :
Indisponible », statut et message vides.

Or le VPS tourne en `ASS_MOCK_ENABLED=False` / `ASS_REAL_CALLS_ALLOWED=True`. Les
quatre valeurs viennent du même appel `/stock-qr/` ; quand il échoue (ici : 503,
ASS injoignable), `stock` reste `null` et **tous** les affichages retombaient sur
la branche « mock » — `stock?.mode === "real" ? … : …` ne distingue pas « je sais
que c'est du mock » de « je ne sais rien ».

Un mode mock réel aurait affiché `80 attestation(s)` / `SUCCESS` / « Stock QR
fictif. ». Trois champs vides = l'appel n'a jamais abouti.

Gravité : l'erreur va dans le mauvais sens. Un exploitant lisant cet écran conclut
« rien de réel ne peut partir » alors que le backend émettra de vraies attestations
et consommera de vrais QR dès qu'ASS remontera.

Correctif : troisième état explicite `unknown` dans
`web/src/app/integrations/ass/page.tsx` (« Indéterminé — contrôle en échec »,
« Inconnu », pastille rouge). La pastille verte n'apparaît plus que si le mode mock
est **confirmé** par une réponse backend.

À noter : **`/config` reste la source fiable** du mode — elle lit les settings
Django (`ass_mock_enabled`, `ass_real_calls_allowed`) et ne dépend pas de la
joignabilité d'ASS.

## 6. Écarts mineurs hors payload

- La durée n'est bornée (1–12 MOIS / 1–366 JOUR, PDF §3.3.2) que pour la **flotte**
  (`FleetCoverageSerializer`). Mono, moto, bus et garage passent sans borne côté
  backend ; seul le front limite à 12. Un appel API direct laisserait passer
  `duree=99`.
- `check.qrcode.status` (Postman) n'est pas implémenté. Attention : il vit sur le
  segment **`promobile`**, pas `partner` — or `AssClient._build_url` applique un
  segment unique à tous les appels. L'implémenter demanderait de rendre le segment
  paramétrable par endpoint.
- `incorpore.flotte.request` (ajout de véhicules à une flotte existante) et
  `subtract.flotte.request` (retrait) sont **nommés** dans le tableau du PDF §7
  mais n'ont aucune section de spécification : ni méthode, ni URL, ni payload. Non
  implémentés — il n'y a donc pas d'avenant de flotte. À demander à ASS si le
  besoin se confirme.
- Le segment `{partner}` vaut littéralement `partner` en sandbox, mais le PDF §3.2
  le décrit comme « votre nom de partenaire communiqué lors de la création de vos
  accès » : il peut différer en production. Aucun changement de code à prévoir,
  c'est déjà la variable d'env `ASS_API_PARTNER_SEGMENT`.
