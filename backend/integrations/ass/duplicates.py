"""Interrogation de la base ASS : « ce vehicule est-il deja couvert ? ».

Complement du registre public AAS Diotali, pas un remplacant : un vehicule
assure chez ASKIA peut manquer au registre public, et on ne l'apprenait alors
qu'a l'emission — apres avoir encaisse le client, et au moment precis ou ASS
consomme un QR. Les deux sources sont donc interrogees, cote formulaire comme
avant l'emission.

Endpoint `verif.immatriculation`. Deux pieges releves en sandbox
(2026-06-11, voir docs/ass/validation_sandbox_2026-06-11.md) :
- le `status` de la reponse vaut ERREUR/ERROR dans les DEUX cas, « deja
  assure » comme « libre » : seul le `code` distingue ;
- `data` est toujours vide — aucune date d'echeance, donc aucune tolerance
  « la couverture existante expire avant ma date d'effet » possible ici,
  contrairement a AAS Diotali.
"""

from __future__ import annotations

import logging

from integrations.ass.constants import ASS_ALREADY_INSURED_CODE
from integrations.ass.exceptions import AssIntegrationError
from integrations.ass.registrations import format_registration

logger = logging.getLogger("integrations.ass")


def already_insured_at_ass(ass_client, immatriculation) -> str | None:
    """Message d'ASS si le vehicule y est deja couvert, `None` sinon.

    Best effort de bout en bout : un client sans `verify_registration` (stubs
    de test), des appels reels desactives, une panne ou un format inattendu
    renvoient `None` — ne jamais bloquer une vente sur un incident technique.
    """
    verify = getattr(ass_client, "verify_registration", None)
    if verify is None:
        return None

    immat = format_registration(immatriculation)
    if not immat:
        return None

    try:
        response = verify({"immatriculation": immat})
    except AssIntegrationError as exc:
        logger.info("verif.immatriculation indisponible pour %s : %s", immat, exc)
        return None

    if not isinstance(response, dict):
        return None
    if str(response.get("code") or "").strip() != ASS_ALREADY_INSURED_CODE:
        return None

    return (
        response.get("message")
        or response.get("operationMessage")
        or f"Ce vehicule {immat} dispose deja d'une police d'assurance chez ASS."
    )
