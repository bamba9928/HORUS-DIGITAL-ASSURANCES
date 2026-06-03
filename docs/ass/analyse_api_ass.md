# Analyse initiale de l'API ASS

Date d'analyse : 2026-06-02

## Documents et fichiers etudies

- `Documentation_API_A.S.S.zip`
- `ASS_API_Integration-v1.0.pdf` : guide technique principal, 59 pages.
- `ASS API PARTNER v1.1.postman_collection` : collection Postman avec exemples concrets.
- `CGU API ASS VALIDE.pdf` : conditions d'utilisation, 8 pages.
- `Formulaire demande acces API.pdf` : formulaire d'enrolement.
- `0e476613.png` : carte/contact ASS, non fonctionnel pour l'integration.

## Vue generale

L'API ASS sert principalement a :

- calculer la prime RC ;
- generer des attestations digitales et QR codes ;
- consulter le stock de QR codes ;
- annuler, resilier ou suspendre une attestation ;
- gerer des cas mono, flotte, remorque, moto, bus ecole et garage.

Les flux doivent etre concus comme des workflows en deux temps :

1. Calculer la RC avec l'endpoint de simulation correspondant.
2. Generer l'attestation en reutilisant la RC calculee et une `referenceTrxPartner` unique.

La generation d'une attestation decremente le stock de QR codes virtuels.

## Securite et acces

- Les appels sont en HTTPS uniquement.
- L'authentification est en HTTP Basic.
- Le PDF indique que le `username` par defaut est `token` et que le `password` correspond a l'`access_token` fourni.
- La collection Postman contient des identifiants Basic de test : ils doivent etre traites comme des secrets et ne jamais etre commits.
- Le partenaire est responsable de l'usage du compte, des utilisateurs, de la cle/token et des souscriptions effectuees.

## Environnements

Le PDF indique :

- Sandbox : `https://manager.lasecu-assurances.sn/`
- Production : `https://manager.lasecu-assurances.sn/`

La sandbox officielle confirmee par ASS est :

- `https://kiiraytest.lasecu-assurances.sn`

Le segment `partner` est fixe dans l'URL : `/api/v1/partner/`.
L'identite partenaire est portee par Basic Auth.

## Endpoints observes

| Domaine | Endpoint | Methode PDF | Methode Postman | Role |
| --- | --- | --- | --- | --- |
| Stock QR | `/api/v1/{partner}/stock.qr` | GET | POST | Consulter le solde de QR codes |
| Mono | `/api/v1/{partner}/rc.request` | POST | POST | Calcul RC auto mono |
| Mono | `/api/v1/{partner}/qrcode.request` | POST | POST | Generer attestation mono |
| Annulation | `/api/v1/{partner}/qrcode.mono.cancel` | POST | non present | Annuler/resilier/suspendre une attestation mono |
| Annulation | `/api/v1/{partner}/qrcode.cancel` | non documente PDF | POST | Annulation dans Postman |
| Remorque | `/api/v1/{partner}/remorque.rc.request` | POST | POST | Calcul RC remorque |
| Remorque | `/api/v1/{partner}/remorque.qrcode.request` | POST | POST | Generer attestation remorque |
| Moto | `/api/v1/{partner}/rc.moto` | GET | POST | Calcul RC deux roues |
| Moto | `/api/v1/{partner}/moto.request` | POST | POST | Generer attestation deux roues |
| Flotte | `/api/v1/{partner}/rc.flotte.request` | GET | POST | Calcul RC flotte |
| Flotte | `/api/v1/{partner}/qrcode.flotte.request` | POST | POST | Generer attestations flotte |
| Bus ecole | `/api/v1/{partner}/bus.ecole.rc` | POST | POST | Calcul RC bus ecole |
| Bus ecole | `/api/v1/{partner}/bus.ecole.request` | POST | POST | Generer attestation bus ecole |
| Garage | `/api/v1/{partner}/rc.garage` | POST | POST | Calcul RC garage |
| Garage | `/api/v1/{partner}/garage.request` | POST | POST | Generer attestation garage |
| Verification | `/api/v1/{partner}/verif.immatriculation` | non documente PDF | POST | Verifier une immatriculation |
| Statut QR | `/api/v1/promobile/check.qrcode.status` | non documente PDF | POST | Verifier le statut QR code |

## Metadonnees principales

Garanties :

- `1` Defense et recours
- `2` Personnes transportees
- `3` Bris de glace
- `4` Avance / Recours
- `5` Incendie
- `6` Vol
- `7` Tierce collision
- `8` Tierce complete

Periodicite et duree :

- `JOUR` : 1 a 366
- `MOIS` : 1 a 12

Energie :

- `ESSENCE`
- `DIESEL`

Type personne :

- `PHYSIQUE`
- `MORALE`

Usages deux roues :

- Le PDF indique `commerciale` / `non_commerciale`.
- Postman utilise `NON_COMMERCIAL`.
- Un exemple de generation moto contient aussi `NON_COMMERCIALE`.

Point a confirmer : valeurs exactes attendues par l'API pour `usage`.

## Genres importants

- `VP` : vehicule particulier.
- `TPC`, `TPC3T500`, `TPC3T500P` : utilitaires.
- `TPM3T500`, `TPM3T500P` : transport public marchandises.
- `TPV8`, `TPV9` : transport public de personnes, mais le PDF precise que le pool TPV C4 est exclu temporairement de la digitalisation.
- `2RCYC`, `2RSCO`, `2RMOT`, `2RSID` : deux/trois roues.
- `C6-WG-4R`, `C6-WG-ATELIER-AUTRE` : garage.
- `BE-VTA`, `BE-VTCATP` : bus ecole.
- `REMORQUE` : remorque.

## Reponses et erreurs

Le statut HTTP ne suffit pas. Il faut verifier :

- `operationStatus` ou `status` ;
- `operationMessage` ou `message` ;
- `code`, quand present.

Codes observes :

- `2000 SUCCESS` : operation reussie.
- `4006 ERROR` : responsabilite civile invalide.
- `4007 ERROR` : genre invalide, ou parfois duree invalide selon les sections.
- `4008 ERROR` : energie invalide, ou reference vehicule inconnue pour remorque.
- `4010 ERROR` : stock QR epuise.
- `5006 ERROR` : reference non unique.
- `6000 ERROR` : erreur de traitement.

## Contraintes metier structurantes

- `referenceTrxPartner` doit etre unique pour les generations.
- La generation d'une attestation consomme un QR code.
- Les attestations retournent generalement `referenceExterne`, `attestationNumber`, `linkAttestation`, `dateExpiration`, `linkCarteBrune`, et `secureKey` a ignorer.
- Pour les vehicules neufs, l'immatriculation peut etre optionnelle si le chassis est fourni.
- Pour les remorques, la voiture motrice doit deja avoir une assurance digitale valable dans la meme compagnie.
- La premiere remorque rattachee a un tracteur a une RC a `0`; les remorques supplementaires doivent etre tarifees.
- Pour une flotte, tous les vehicules de la flotte doivent etre inclus dans la liste.
- Rabais flotte RC : 10 a 20 vehicules = 10 %, 21 a 40 = 15 %, 41 a 60 = 20 %, plus de 60 = 25 %.
- Les APIs flotte retournent des listes d'items par `requestId` ou `referenceExterne`.

## Ecarts et points a clarifier

- Base URL sandbox : clarifiee par ASS, utiliser `https://kiiraytest.lasecu-assurances.sn`.
- `{partner}` : clarifie par ASS, utiliser le segment fixe `/api/v1/partner/`.
- Methodes : clarifiees par ASS, `stock.qr`, `rc.moto` et `rc.flotte.request` sont en `POST`.
- Annulation : PDF indique `qrcode.mono.cancel`; Postman indique `qrcode.cancel`.
- `stock.qr` : PDF dit sans body; Postman envoie `{ "code": "1000" }`.
- Reponses : la documentation melange parfois `status/message` et `operationStatus/operationMessage`.
- Champs : `garanties` est decrit comme `Dict`, mais les exemples l'envoient comme tableau d'entiers.
- Valeurs `usage` moto incoherentes entre PDF et Postman.
- `check.qrcode.status` n'a pas de body dans Postman et n'est pas explique dans le PDF.
- `verif.immatriculation` est present dans Postman mais non documente dans le PDF.

## Implications pour notre plate-forme

- Prevoir un client API ASS dedie, avec configuration par environnement et partner.
- Centraliser l'auth Basic dans un coffre de secrets, jamais dans le code.
- Modeliser les workflows par produit : `calculateRc`, puis `issueAttestation`.
- Persister toutes les transactions avec `referenceTrxPartner`, payload envoye, reponse recue, statut metier, liens d'attestation et horodatage.
- Ajouter une couche de validation avant appel API pour limiter les erreurs 4006/4007/4008.
- Gerer l'idempotence et les doublons autour de `referenceTrxPartner`.
- Surveiller le stock QR et bloquer ou alerter avant rupture.
- Ajouter des logs techniques suffisants pour produire un rapport d'anomalie en cas de litige avec ASS : horodatage, configuration, parametres, resultat attendu, resultat obtenu.
- Prevoir un mecanisme d'annulation/resiliation/suspension, mais confirmer l'endpoint exact.
- Prevoir des tests d'integration sandbox avant toute mise en production, en evitant les appels qui generent des attestations reelles hors environnement de test.

## Exigences CGU utiles pour la conception

- Respecter la frequence limite de requetes et informer ASS en cas de surcharge.
- Alerter ASS en cas d'utilisation anormale ou frauduleuse.
- Proteger la confidentialite, l'integrite et le stockage des donnees.
- Tenir a jour la liste des utilisateurs autorises.
- Prevoir une procedure de rotation/revocation des acces.
- ASS peut auditer la securite avec preavis de 48 heures.
- En cas de non-conformite, correction attendue sous 15 jours, sinon suspension possible du service.
- En cas d'anomalie, rapport documente a transmettre sous 5 jours ouvres.

## Recommendation initiale

La solution la plus fiable est de commencer par un module d'integration ASS isole, teste sur sandbox, avec schemas de validation stricts, gestion des secrets, journalisation complete et normalisation des reponses. Cela evitera de disperser les specificites ASS dans toute la plate-forme et facilitera les clarifications avec ASS lorsque les incoherences PDF/Postman seront levees.
