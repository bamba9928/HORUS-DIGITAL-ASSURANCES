# Roadmap Horus ASS

Date : 2026-06-02

Stack retenue :

- Backend : Django + Django REST Framework + Python
- Frontend web : Next.js + TypeScript
- Mobile : Flutter + Dart, apres finalisation du web
- API partenaire : ASS

Identite visuelle initiale :

- Fond principal : blanc
- Texte principal : noir
- Couleur primaire : `#A400D1`
- Police : gras, lisible, sobre. Recommendation web : `Inter`, `Roboto` ou `Manrope`.

Regle directrice :

Le frontend ne doit jamais appeler ASS directement. Tous les appels passent par le backend Horus, puis par un module dedie `integrations/ass/`.

## Phase 0 - Cadrage technique et securite

Objectif : poser les fondations sans bloquer l'avancee produit.

TODO backend :

- Creer la structure Django/DRF.
- Creer les apps minimales :
  - `accounts`
  - `groups`
  - `contracts`
  - `commissions`
  - `payments`
  - `integrations.ass`
- Configurer les environnements :
  - local
  - test
  - staging
  - production
- Utiliser des variables d'environnement pour :
  - `ASS_BASE_URL`
  - `ASS_API_PARTNER_SEGMENT`
  - `ASS_USERNAME`
  - `ASS_PASSWORD`
  - `ASS_POLICY_FEE`
- Definir `ASS_POLICY_FEE = 3000`.
- Interdire les logs contenant credentials, token, Basic Auth ou password.
- Prevoir un mode `ASS_MOCK_ENABLED=true` pour avancer sans appels reels ASS.

TODO frontend :

- Creer le projet Next.js + TypeScript.
- Configurer le theme :
  - blanc
  - noir
  - `#A400D1`
  - boutons primaires nets et lisibles
  - police gras/lisible pour titres et actions importantes
- Creer un layout dashboard simple.
- Ajouter une navigation principale :
  - Dashboard
  - Nouveau contrat
  - Contrats
  - Commissions
  - Utilisateurs
  - Parametres

Tests :

- `python manage.py check`
- `pytest`
- tests frontend unitaires quand le projet web sera initialise.

Suggestion pour avancer vite :

Ne pas chercher a connecter ASS tout de suite. Construire d'abord les workflows avec un adapter mocke qui retourne des reponses realistes.

## Phase 1 - Comptes utilisateurs, groupes et permissions

Objectif : securiser les droits avant de creer les contrats.

Roles :

- Admin general
- Admin groupe
- Apporteur
- Finance/comptabilite

TODO backend :

- Creer le modele utilisateur ou etendre le user model Django.
- Creer le modele groupe/organisation.
- Associer chaque utilisateur a un groupe, sauf admin general si necessaire.
- Ajouter les permissions :
  - admin general : tous les groupes, utilisateurs, commissions, contrats
  - admin groupe : uniquement son groupe
  - apporteur : devis/contrats selon permissions, lecture de ses commissions
  - finance : consultation et traitement paiements/commissions
- Ajouter les tests d'isolation par groupe.

TODO frontend :

- Ecran liste utilisateurs.
- Ecran creation utilisateur.
- Ecran edition utilisateur.
- Filtrage visible selon role.
- Masquer toute action interdite plutot que seulement bloquer au submit.

Tests prioritaires :

- admin general peut gerer tous les groupes.
- admin groupe ne peut gerer que son groupe.
- apporteur ne peut pas modifier son role ni sa commission.
- refus acces cross-groupe.

Suggestion :

Utiliser une permission backend stricte meme si le frontend masque les boutons. Le frontend ne doit jamais etre la seule barriere.

## Phase 2 - Commissions apporteurs

Objectif : calculer et figer les commissions correctement.

Champs de configuration apporteur :

- `commission_percent_on_prime_rc`
- `commission_fixed_on_policy_fee`

Regles :

- A la creation d'un apporteur, les champs commission sont `NULL`.
- `NULL` signifie commission non configuree.
- `0` signifie commission configuree a zero.
- L'apporteur ne peut jamais modifier sa commission.
- La commission fixe sur cout de police ne doit normalement pas depasser `3000`.

Formule :

```text
commission_prime_rc_amount = prime_rc_ass * commission_percent_on_prime_rc / 100
commission_policy_fee_amount = commission_fixed_on_policy_fee
commission_total = commission_prime_rc_amount + commission_policy_fee_amount
net_to_horus = ttc_ass - commission_total
```

Point comptable a confirmer :

Le nom `net_to_horus` doit etre valide avec le flux financier reel. Si Horus encaisse le client puis reverse ASS et l'apporteur, il faudra peut-etre distinguer :

- montant encaisse client
- montant du a ASS
- commission apporteur
- marge Horus

Snapshot a l'emission :

- `prime_rc_ass`
- `cout_police_ass`
- `ttc_ass`
- `commission_percent_used`
- `commission_fixed_policy_fee_used`
- `commission_prime_rc_amount`
- `commission_policy_fee_amount`
- `commission_total`
- `net_to_horus`

Statuts commission :

- `PENDING`
- `PAYABLE`
- `PAID`
- `CANCELLED`
- `DISPUTED`

TODO backend :

- Ajouter champs commission utilisateur/apporteur.
- Ajouter modele snapshot commission lie au contrat emis.
- Ajouter service de calcul commission.
- Ajouter validation :
  - percent non negatif
  - fixed non negatif
  - fixed <= `ASS_POLICY_FEE`
  - blocage si commission `NULL`
- Ajouter audit :
  - configure par
  - configure le
  - ancienne valeur
  - nouvelle valeur

TODO frontend :

- Ecran configuration commission.
- Lecture seule pour apporteur.
- Message clair si commission non configuree :
  - "Commission non configuree pour cet apporteur."

Tests :

- creation apporteur avec commissions `NULL`.
- configuration par admin general.
- configuration par admin groupe sur son groupe.
- refus modification autre groupe.
- calcul 18 % de Prime RC + 2000 FCFA.
- cout de police ASS fixe a 3000 FCFA.
- refus fixe > 3000 FCFA.
- conservation du snapshot apres changement du taux.
- apporteur ne peut pas modifier sa commission.

Suggestion :

Tout montant FCFA doit etre stocke en entier, jamais en float.

## Phase 3 - Integration ASS en mode test/mock

Objectif : preparer l'integration sans consommer de QR code ni declencher d'emission reelle.

TODO backend :

- Creer `integrations/ass/client.py`.
- Creer `integrations/ass/schemas.py`.
- Creer `integrations/ass/services.py`.
- Creer `integrations/ass/mappers.py`.
- Creer `integrations/ass/exceptions.py`.
- Creer un adapter mock :
  - calcul RC mono
  - calcul RC moto
  - calcul RC flotte
  - generation attestation fictive
  - stock QR fictif
- Normaliser les reponses ASS :
  - `operationStatus`
  - `status`
  - `operationMessage`
  - `message`
  - `code`
- Ne pas faire d'appel reel ASS dans cette phase.

TODO environnement de test Postman :

- Importer la collection Postman ASS originale localement.
- Ne pas commit les credentials contenus dans la collection.
- Creer un environnement Postman separe :
  - `base_url = https://kiiraytest.lasecu-assurances.sn`
  - segment API fixe : `/api/v1/partner/`
  - `ass_username`
  - `ass_password`
- Remplacer les credentials en dur par des variables.
- Creer une version nettoyee de la collection pour l'equipe si necessaire.
- Marquer les requetes d'emission comme dangereuses tant qu'elles consomment un QR code.
- Tester uniquement les endpoints non destructifs ou mockes tant que ASS n'a pas confirme l'environnement.

Clarifications ASS recues :

- Sandbox officielle : `https://kiiraytest.lasecu-assurances.sn`
- Le segment `partner` est fixe : `/api/v1/partner/`
- L'identite partenaire passe par Basic Auth, pas par une valeur dynamique dans l'URL.
- `stock.qr`, `rc.moto` et `rc.flotte.request` utilisent `POST`.

Endpoints a mapper :

- `stock.qr`
- `rc.request`
- `qrcode.request`
- `rc.moto`
- `moto.request`
- `rc.flotte.request`
- `qrcode.flotte.request`
- `remorque.rc.request`
- `remorque.qrcode.request`
- `bus.ecole.rc`
- `bus.ecole.request`
- `rc.garage`
- `garage.request`
- `verif.immatriculation`
- `check.qrcode.status`
- annulation : endpoint exact a confirmer

Points ASS a confirmer avant appels reels :

- Endpoint exact d'annulation.
- Valeurs officielles `usage` moto.
- Signification exacte de `linkCarteBrune` vs attestation CEDEAO.

Tests :

- tests unitaires du mapper.
- tests unitaires du client mock.
- tests de normalisation des erreurs.
- tests interdisant les logs de credentials.

Suggestion :

Utiliser un flag strict : en local/staging, `ASS_REAL_CALLS_ALLOWED=false` par defaut. Les appels reels doivent etre actives explicitement.

## Phase 4 - Parcours web Nouveau contrat

Objectif : creer un parcours simple, progressif et fiable.

Point d'entree :

- Dashboard
- Bouton principal : "Nouveau contrat"

Choix du type :

- Auto mono
- Moto
- Flotte
- Bus ecole
- Garage

Regle :

- Ne pas afficher Remorque comme type independant.
- La remorque est ajoutee depuis un vehicule de flotte pour cette phase.
- Techniquement, la remorque doit rester rattachee a un vehicule tracteur, pas directement a la flotte.

Etapes communes :

1. Type de contrat
2. Souscripteur
3. Assure
4. Vehicule ou flotte
5. Garanties et duree
6. Resume avant devis
7. Calcul devis
8. Paiement
9. Resume avant emission
10. Emission
11. Attestation

Regles UX :

- Formulaire progressif.
- Ne jamais afficher tous les champs en une page.
- Categories et sous-categories liees.
- Sous-categorie depend de categorie.
- La categorie/sous-categorie UX doit mapper vers `genre` ASS.
- Textes d'aide simples.
- Resume avant calcul du devis.
- Resume avant emission.
- Bloquer emission si paiement non confirme.
- Bloquer emission si commission non configuree.
- Confirmer explicitement avant emission, car emission consomme un QR code ASS.

TODO backend :

- Modeles brouillon/devis/contrat.
- Endpoints DRF :
  - creer brouillon
  - sauvegarder etape
  - calculer devis
  - initier paiement
  - confirmer paiement
  - emettre contrat
  - recuperer attestation
- Validation par type de contrat.
- Etat interne :
  - `DRAFT`
  - `QUOTE_READY`
  - `PAYMENT_PENDING`
  - `PAID`
  - `ISSUED`
  - `CANCELLED`
- Etat ASS separe :
  - `BROUILLON`
  - `ANNULE`
  - `VALIDE`

TODO frontend :

- Page `/contracts/new`.
- Ecran choix type contrat.
- Wizard auto mono.
- Wizard moto avec `cylindree`.
- Wizard flotte.
- Ajout vehicule dans flotte.
- Carte vehicule flotte avec :
  - Modifier
  - Supprimer
  - Ajouter une remorque
- Ajout remorque rattachee a un vehicule.
- Resume devis.
- Resume emission.
- Ecran attestation emise.

Champs vehicule :

- genre
- categorie
- sous-categorie
- marque
- modele
- immatriculation
- numero chassis
- energie
- puissance fiscale
- nombre de places
- date de mise en circulation
- valeur neuve
- valeur actuelle

Champs moto :

- genre
- categorie
- sous-categorie
- marque
- modele
- cylindree
- immatriculation
- numero chassis
- energie
- usage moto
- date de mise en circulation
- duree
- date d'effet

Champs remorque :

- vehicule tracteur, auto-rempli et non modifiable
- immatriculation remorque
- numero chassis
- marque
- modele
- genre
- categorie
- sous-categorie
- charge utile, a conserver interne tant que ASS ne confirme pas
- date de mise en circulation
- valeur

Apres emission, afficher :

- attestation
- immatriculation
- numero attestation
- cle de securite
- reference externe
- date expiration
- lien attestation digitale
- lien attestation CEDEAO / carte brune

Tests :

- navigation wizard.
- validation champs obligatoires.
- categorie -> sous-categorie -> genre.
- moto exige cylindree.
- usage moto ne declenche pas appel reel ASS avant confirmation.
- remorque rattachee automatiquement au vehicule tracteur.
- vehicule tracteur non modifiable.
- emission bloquee sans paiement.
- emission bloquee si commission non configuree.
- emission impossible en mode mock si real calls interdits.

Suggestion :

Livrer d'abord Auto mono, Moto et Flotte. Bus ecole et Garage peuvent apparaitre comme choix "A venir" si le delai devient serre.

## Phase 5 - Paiements et blocage emission

Objectif : empecher toute emission non payee.

TODO backend :

- Creer modele paiement.
- Statuts paiement :
  - `PENDING`
  - `CONFIRMED`
  - `FAILED`
  - `CANCELLED`
  - `REFUNDED`
- L'emission exige :
  - devis valide
  - paiement confirme
  - commission configuree
  - stock QR suffisant si verification disponible
  - utilisateur autorise
- Ajouter journal d'evenements contrat.

TODO frontend :

- Ecran paiement.
- Badge statut paiement.
- Bouton emission desactive tant que paiement non confirme.
- Message clair en cas de blocage.

Tests :

- refus emission sans paiement.
- refus emission paiement failed.
- emission autorisee paiement confirmed.
- journalisation des transitions.

Suggestion :

Pour avancer, commencer avec un paiement manuel confirme par admin/finance, puis brancher un prestataire de paiement plus tard.

## Phase 6 - Emission ASS reelle en sandbox

Objectif : connecter ASS prudemment.

Preconditions :

- URL sandbox confirmee.
- Credentials officiels de test recus.
- Partner confirme.
- Valeurs `usage` moto confirmees.
- Endpoint annulation confirme.
- Stock QR sandbox disponible.

TODO backend :

- Activer `ASS_REAL_CALLS_ALLOWED=true` uniquement en environnement controle.
- Tester d'abord :
  - stock QR
  - calcul RC
  - verification immatriculation si disponible
- Tester emission avec donnees de test ASS uniquement.
- Sauvegarder payload/reponse.
- Gerer erreurs ASS.
- Ajouter retry uniquement sur erreurs reseau, pas sur emission si risque de doublon.
- Garantir idempotence via `referenceTrxPartner`.

TODO frontend :

- Ajouter messages d'erreur lisibles.
- Ajouter ecran resultat emission.
- Ajouter acces aux liens attestation.

Tests :

- tests integration sandbox marques separement.
- tests non destructifs par defaut.
- tests emission seulement sur commande explicite.

Suggestion :

Ne jamais mettre les tests d'emission reelle dans `pytest` standard. Les executer avec un marqueur dedie, par exemple `pytest -m ass_sandbox`.

## Phase 7 - Contrats, attestations et annulations

Objectif : gerer la vie apres emission.

TODO backend :

- Liste contrats.
- Detail contrat.
- Recherche par immatriculation, apporteur, reference, statut.
- Stockage des liens attestation.
- Telechargement/proxy securise si necessaire.
- Annulation/resiliation/suspension apres confirmation endpoint ASS.
- Snapshot complet emission.

TODO frontend :

- Liste contrats.
- Filtres.
- Detail contrat.
- Boutons :
  - imprimer
  - ouvrir attestation digitale
  - ouvrir attestation CEDEAO
  - annuler/resilier/suspendre selon permissions

Tests :

- apporteur voit ses contrats.
- admin groupe voit contrats du groupe.
- admin general voit tout.
- annulation interdite sans permission.
- snapshot conserve.

Suggestion :

Reporter les actions d'annulation ASS reelle tant que l'endpoint n'est pas confirme.

## Phase 8 - Reporting finance et commissions

Objectif : exploiter les commissions sans recalcul dangereux.

TODO backend :

- Liste commissions.
- Filtres :
  - apporteur
  - groupe
  - statut
  - periode
  - contrat
- Passage `PENDING` -> `PAYABLE`.
- Passage `PAYABLE` -> `PAID`.
- Gestion `DISPUTED`.
- Export CSV/XLSX.

TODO frontend :

- Dashboard finance.
- Liste commissions.
- Detail commission.
- Action payer.
- Export.

Tests :

- ancienne commission conservee apres changement taux.
- paiement commission change statut.
- apporteur lecture seule.
- admin groupe limite a son groupe.

Suggestion :

Ne pas automatiser le paiement des commissions au debut. Faire une validation manuelle finance.

## Phase 9 - Qualite, audit et production web

Objectif : rendre le web exploitable en production.

TODO backend :

- Logs techniques sans secrets.
- Audit actions sensibles.
- Rate limiting.
- Permissions revues.
- Backup DB.
- Monitoring erreurs ASS.
- Alertes stock QR bas.
- Alertes emission echouee.

TODO frontend :

- Responsive desktop/tablette.
- Etats loading/error/empty.
- Accessibilite minimale.
- UI coherente blanc/noir/`#A400D1`.
- Textes metier clairs.

Tests :

- `python manage.py check`
- `pytest`
- tests frontend
- tests e2e parcours contrat

Suggestion :

Avant production, faire une matrice de cas : mono, moto, flotte avec remorque, paiement confirme, emission, erreur stock QR, commission non configuree.

## Phase 10 - Mobile Flutter apres web

Objectif : construire le mobile sans ralentir le web.

Regle :

Le mobile commence seulement apres validation des parcours web principaux.

Portee mobile initiale :

- Connexion
- Dashboard apporteur
- Nouveau devis/contrat simplifie
- Consultation contrats
- Consultation commissions
- Affichage liens attestations

TODO Flutter :

- Creer projet Flutter + Dart.
- Reprendre la charte :
  - blanc
  - noir
  - `#A400D1`
  - police gras/lisible
- Consommer uniquement l'API backend Horus.
- Ne jamais appeler ASS directement.
- Reutiliser les memes statuts et validations que le backend.

Suggestion :

Ne pas refaire toute la logique en Flutter. Le mobile doit etre un client du backend, avec validation UX minimale, mais la validation decisive reste cote Django.

## Ordre d'execution recommande

1. Backend base + comptes + groupes.
2. Commissions et permissions.
3. Integration ASS mockee.
4. Frontend web dashboard + Nouveau contrat.
5. Parcours auto mono.
6. Parcours moto.
7. Parcours flotte + remorques.
8. Paiement manuel/confirme.
9. Emission mockee.
10. Integration sandbox ASS.
11. Contrats/attestations.
12. Reporting commissions.
13. Stabilisation web.
14. Mobile Flutter.

## Commandes a executer apres chaque modification code

Backend :

```bash
python manage.py check
pytest
```

Frontend web :

```bash
npm run lint
npm run test
npm run typecheck
```

Mobile Flutter :

```bash
flutter analyze
flutter test
```

## Decisions a ne pas bloquer

- Tant que ASS n'a pas confirme certaines valeurs, utiliser des enums internes et un mapper.
- Tant que le paiement externe n'est pas choisi, utiliser paiement manuel confirme par finance.
- Tant que les appels reels ASS sont risqués, utiliser le mock.
- Tant que Bus ecole/Garage ne sont pas prioritaires, les afficher en "A venir" ou les livrer apres Auto/Moto/Flotte.
- Tant que `net_to_horus` est comptablement ambigu, stocker les champs separes et garder le nom final a valider.

## Definition de termine pour une phase

Une phase est terminee seulement si :

- les migrations sont creees si necessaire ;
- les permissions sont testees ;
- les tests passent ;
- aucun secret n'est expose ;
- les appels ASS reels sont controles par configuration ;
- le resume des fichiers modifies est fourni ;
- les problemes restants sont explicites.
