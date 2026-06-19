# Validation sandbox ASS — 2026-06-11

Sondes exécutées contre `https://kiiraytest.lasecu-assurances.sn` (Basic Auth
sandbox, credentials dans `backend/.env`, non commités) avec le script
réutilisable `backend/scripts/ass_sandbox_probe.py`, qui passe par nos vrais
builders (`contracts/services.py`) et notre vrai client (`integrations/ass/client.py`).

Rappel des choix produit assumés (confirmés par la sandbox) : `chassis` vide
(facultatif côté ASS), `dateMiseCirculation` par défaut `2000-01-01`,
`valeurNeuve`/`valeurActuelle` à 0 par défaut — tous acceptés par l'API.

## Résultats des sondes

| Sonde | Endpoint | Résultat |
| --- | --- | --- |
| Auth + stock | `stock.qr` | ✅ SUCCESS — `data: "-1.0"` (chaîne ; -1 = aucun stock alloué au compte sandbox) |
| RC auto VP (garanties []) | `rc.request` | ✅ SUCCESS — RC 4769, ventilation racine (voir format ci-dessous) |
| RC auto VP + garanties [1,2,4] + options PT/AR/AS | `rc.request` | ✅ SUCCESS — PrimeAG 1838 (garanties annexes), PrimeTotale 11022 |
| RC utilitaire TPC3T500 sans `chargeUtile` | `rc.request` | ✅ SUCCESS — le champ n'est pas nécessaire |
| RC utilitaire TPC3T500 avec `chargeUtile` | `rc.request` | ❌ 400 `Invalid field 'chargeUtile' on model 'rc.request'` — **ne jamais envoyer ce champ** |
| RC moto usage `NON_COMMERCIALE` | `rc.moto` | ❌ 400 `Wrong value for rc.moto.usage` |
| RC moto usage `NON_COMMERCIAL` | `rc.moto` | ✅ SUCCESS — valeurs acceptées : `COMMERCIAL` / `NON_COMMERCIAL` (sans E, le PDF est faux) |
| RC bus école BE-VTA | `bus.ecole.rc` | ✅ SUCCESS — mais `data` (205803) ≠ PrimeRC (17982) : voir questions ASS |
| RC garage C6-WG-4R | `rc.garage` | ✅ SUCCESS — `data` = PrimeRC + Cedeao, cohérent |
| RC flotte (payload conforme Postman, avec/sans garanties) | `rc.flotte.request` | ❌ 400 `NameError: name 'ga_def_recours' is not defined` — **bug serveur sandbox ASS** |
| Vérif immat déjà assurée | `verif.immatriculation` | code `5006`, `status: "ERREUR"`, message « dispose déjà d'une police chez: X », `data: ""` |
| Vérif immat libre | `verif.immatriculation` | code `4000`, `status: "ERROR"`, « L'attestation d'assurance (…) n'est pas valide », `data: ""` |
| Émission mono | `qrcode.request` | ⚠️ Schéma du payload **accepté intégralement** (cout_police/remise_rc racine, chassis vide, date 2000-01-01, valeurs 0, personnes, garanties) mais échec final `Erreur (73O) : Votre stock est insuffisant` — stock sandbox à créditer |

## Format réel des réponses RC (différent du PDF et de notre mock)

```json
{
  "code": "2000",
  "operationStatus": "SUCCESS",
  "operationMessage": "Opération effectuée avec succès.",
  "data": "4769",
  "PrimeRC": "4469",
  "Reduction": "0",
  "CoutPolice": "3000",
  "PrimeAG": "0",
  "Taxe": "1046",
  "Fga": "112",
  "Cedeao": "300",
  "PrimeTotale": "8927"
}
```

- Ventilation **à la racine**, clés **PascalCase**, montants en **chaînes**.
- `data` = PrimeRC + Cedeao (vérifié sur VP, moto, garage ; exception bus à clarifier).
- Cohérence : PrimeRC + CoutPolice + PrimeAG + Taxe + Fga + Cedeao = PrimeTotale.
- L'API **rejette les champs inconnus** (400 explicite `Invalid field '<champ>' on model '<endpoint>'`).

## Correctifs appliqués dans le code suite à cette validation

1. `normalize_moto_usage` → cible `COMMERCIAL` / `NON_COMMERCIAL` (sans E).
2. `extract_rc_breakdown` → supporte le format réel racine PascalCase/chaînes
   (en plus du format mock), expose `prime_rc_ass` = PrimeRC pour une
   ventilation affichée cohérente.
3. `expected_payment_amount` → lit `PrimeTotale` racine (le montant encaissé
   aurait été faux : 7 769 au lieu de 8 927 FCFA sur l'exemple VP).
4. `AssStockQrView` → parse le stock en chaîne/float (`"-1.0"` → -1) ;
   serializer sans `min_value`.
5. `AssVerifyRegistrationView` → mappe les codes réels `5006` (déjà assuré) /
   `4000` (libre) ; en réel cet endpoint **ne renvoie jamais les données du
   véhicule** (le pré-remplissage simulé par le mock n'existe pas).
6. Tests : `backend/tests/test_ass_real_responses.py` (fixtures = réponses
   sandbox exactes).

## Questions / demandes à transmettre à ASS

1. **Créditer du stock QR de test** sur le compte sandbox (`stock.qr` renvoie
   -1 ; `qrcode.request` répond « Erreur (73O) : stock insuffisant ») — bloque la
   validation de l'émission et de l'annulation.
2. **Bug serveur `rc.flotte.request`** : `NameError: name 'ga_def_recours' is not
   defined` même avec le payload exact de leur collection Postman (avec ou sans
   garanties). Bloque toute la tarification flotte.
3. **Sémantique de `data` pour `bus.ecole.rc`** : data = 205803 alors que
   PrimeRC = 17982 (PrimeTotale = 24669 cohérente avec PrimeRC). Quelle valeur
   faut-il passer comme `responsabiliteCivile` à `bus.ecole.request` ?
4. **Confirmer l'assiette `responsabiliteCivile` à l'émission** : `data`
   (PrimeRC + Cedeao, ex. 4769) ou `PrimeRC` pure (4469) ? À trancher dès que le
   stock de test est crédité (sonde `issue-mono` prête).
5. **Endpoint d'annulation** : `qrcode.mono.cancel` (PDF) vs `qrcode.cancel`
   (Postman) — non testable sans émission préalable.

## Reste à valider quand le stock sandbox sera crédité

- `issue-mono` de bout en bout (sonde prête : `uv run python backend/scripts/ass_sandbox_probe.py issue-mono`),
  qui tranche l'assiette RC et teste l'annulation dans la foulée.
- Émissions moto / bus / garage / flotte (cette dernière après correction du bug ASS).
## Décision métier actée (2026-06-11)

- Assiette de la **commission apporteur** = `prime_rc_ass` = `data` ASS
  (PrimeRC + CEDEAO, ex. 4769 — et non PrimeRC pure 4469). **Confirmé.**
