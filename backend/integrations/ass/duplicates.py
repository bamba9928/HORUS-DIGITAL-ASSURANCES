"""Interrogation de la base ASS : « ce vehicule est-il deja couvert ? ».

Complement du registre public AAS Diotali, pas un remplacant : un vehicule
assure chez ASKIA peut manquer au registre public, et on ne l'apprenait alors
qu'a l'emission — apres avoir encaisse le client, et au moment precis ou ASS
consomme un QR. Les deux sources sont donc interrogees, cote formulaire comme
avant l'emission.

Endpoint `verif.immatriculation`. **La production ne repond pas comme la
sandbox** (releve du 2026-09-12 sur manager.ass-assurances.sn) :

- sandbox (2026-06-11) : `code` 5006 « deja assure » / 4000 « libre », `status`
  ERREUR ou ERROR dans les DEUX cas, `data` toujours vide ;
- production : un vehicule couvert renvoie `code` 2000, `status` SUCCESS et
  TOUT le contrat dans `data` — police, numero d'attestation, souscripteur,
  dateEffet, expireAt, caracteristiques du vehicule.

Les deux formes sont donc reconnues. Piege supplementaire : en production
`data` n'est pas du JSON mais le `repr` Python d'un dictionnaire (guillemets
simples, `None`), d'ou le double essai json/literal_eval.

Bonne nouvelle de ce format riche : `expireAt` permet d'appliquer ici la meme
tolerance que sur AAS Diotali — une couverture qui expire avant la date
d'effet demandee ne bloque pas un renouvellement anticipe.
"""

from __future__ import annotations

import ast
import json
import logging
from dataclasses import dataclass
from datetime import date

from integrations.aas_diotali.service import parse_registry_date
from integrations.ass.constants import ASS_ALREADY_INSURED_CODE, ASS_SUCCESS_STATUS
from integrations.ass.exceptions import AssIntegrationError
from integrations.ass.registrations import format_registration

logger = logging.getLogger("integrations.ass")


@dataclass(frozen=True)
class AssCoverage:
    """Couverture existante trouvee dans la base ASS."""

    message: str
    details: dict


def already_insured_at_ass(
    ass_client,
    immatriculation,
    date_effet_prevue: date | None = None,
) -> AssCoverage | None:
    """Couverture ASS en cours pour cette plaque, ou `None`.

    `None` signifie « rien qui bloque » : vehicule libre, couverture expirant
    avant `date_effet_prevue`, ou incident technique. Best effort de bout en
    bout — un client sans `verify_registration` (stubs de test), des appels
    reels desactives, une panne ou un format inattendu ne bloquent jamais une
    vente.
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
    except Exception:
        logger.exception("verif.immatriculation : erreur inattendue pour %s", immat)
        return None

    if not isinstance(response, dict):
        return None

    code = str(response.get("code") or "").strip()
    data = _parse_data(response.get("data"))
    status = str(response.get("status") or response.get("operationStatus") or "").upper()

    # Forme sandbox : le code seul porte l'information, `data` est vide.
    if code == ASS_ALREADY_INSURED_CODE:
        return AssCoverage(message=_sandbox_message(response, immat), details={})

    # Forme production : succes + contrat complet. Sans contrat exploitable,
    # on ne conclut rien (un SUCCESS a `data` vide n'est pas une couverture).
    if status != ASS_SUCCESS_STATUS or not data:
        return None

    dt_fin = parse_registry_date(data.get("expireAt") or data.get("dateExpiration"))
    dt_debut = parse_registry_date(data.get("dateEffet") or data.get("createAt"))

    # Couverture terminee avant la nouvelle date d'effet : renouvellement
    # anticipe legitime, on laisse passer (meme regle que AAS Diotali). Une
    # date illisible reste bloquante : on ne peut pas prouver l'expiration.
    if date_effet_prevue and dt_fin and date_effet_prevue > dt_fin:
        logger.info(
            "Vehicule %s : couverture ASS expiree le %s, nouvelle date d'effet %s -> OK",
            immat,
            dt_fin,
            date_effet_prevue,
        )
        return None

    return AssCoverage(
        message=_coverage_message(data, immat, dt_debut, dt_fin),
        details=_coverage_details(data, immat, dt_debut, dt_fin),
    )


def _parse_data(raw):
    """`data` -> dict. JSON, `repr` Python (le cas en production), ou rien."""
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    for loader in (json.loads, ast.literal_eval):
        try:
            value = loader(raw)
        except (ValueError, SyntaxError):
            continue
        if isinstance(value, dict):
            return value
    logger.warning("verif.immatriculation : `data` illisible (%.80s)", raw)
    return {}


def _sandbox_message(response, immat):
    return (
        response.get("message")
        or response.get("operationMessage")
        or f"Ce vehicule {immat} dispose deja d'une police d'assurance chez ASS."
    )


def _to_fr_date(value: date | None) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def _coverage_message(data, immat, dt_debut, dt_fin):
    vehicule = data.get("vehicule") if isinstance(data.get("vehicule"), dict) else {}
    marque = str(vehicule.get("marque") or "").strip()
    modele = str(vehicule.get("modele") or "").strip()
    libelle = f"{marque} {modele}".strip() or "Vehicule"

    parts = [f"{libelle} immatricule {immat} deja assure chez ASS."]
    if data.get("attestationNumber"):
        parts.append(f"Attestation N° {data['attestationNumber']}.")
    debut, fin = _to_fr_date(dt_debut), _to_fr_date(dt_fin)
    if debut and fin:
        parts.append(f"Contrat valide du {debut} au {fin}.")
    elif fin:
        parts.append(f"Contrat valide jusqu'au {fin}.")
    return " ".join(parts)


def _coverage_details(data, immat, dt_debut, dt_fin):
    """Memes cles que les details AAS Diotali : le front n'a qu'un affichage."""
    vehicule = data.get("vehicule") if isinstance(data.get("vehicule"), dict) else {}
    return {
        "immatriculation": str(vehicule.get("immatriculation") or immat),
        "brand": str(vehicule.get("marque") or ""),
        "model": str(vehicule.get("modele") or ""),
        "attestation_number": str(data.get("attestationNumber") or ""),
        "date_effet": dt_debut.isoformat() if dt_debut else "",
        "date_echeance": dt_fin.isoformat() if dt_fin else "",
    }
