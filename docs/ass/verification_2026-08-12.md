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

## 5. Écarts mineurs hors payload

- La durée n'est bornée (1–12 MOIS / 1–366 JOUR, PDF §3.3.2) que pour la **flotte**
  (`FleetCoverageSerializer`). Mono, moto, bus et garage passent sans borne côté
  backend ; seul le front limite à 12. Un appel API direct laisserait passer
  `duree=99`.
- `check.qrcode.status` (Postman, segment `promobile` et non `partner`) n'est pas
  implémenté.
