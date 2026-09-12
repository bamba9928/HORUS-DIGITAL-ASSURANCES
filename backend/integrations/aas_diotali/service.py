"""Verification independante « deja assure » via le registre AAS Diotali.

Porte depuis `askia_insurance/contracts/aas_service.py` (AASVerifier) — meme
regle metier, adaptee au style fonctionnel de ce backend. Voir la memoire
`project-aas-diotali-a-porter` pour le contexte complet.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from email.utils import parsedate_to_datetime

import requests

from integrations.aas_diotali.client import AasDiotaliClient

logger = logging.getLogger("integrations.aas_diotali")

# Choix assume, ne pas "corriger" sans discussion : une panne du tiers AAS
# Diotali ne bloque jamais une vente. Mieux vaut vendre quitte a ce qu'ASS
# retoque ensuite, que perdre la vente sur une panne d'un service tiers.
FAIL_OPEN = True

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d")


@dataclass(frozen=True)
class VerificationResult:
    """Verdict du registre AAS Diotali.

    `available` distingue « verifie, vehicule libre » de « pas pu verifier ».
    Les deux laissent passer la vente (FAIL_OPEN), mais annoncer
    « immatriculation libre » alors que le registre etait injoignable
    trompe l'apporteur : l'appelant doit pouvoir dire « verification
    indisponible » a la place.
    """

    blocked: bool
    message: str | None = None
    details: dict | None = None
    available: bool = True

    @classmethod
    def unavailable(cls) -> VerificationResult:
        return cls(blocked=False, available=False)


def _parse_date(value) -> date | None:
    """Date AAS -> `date`, ou None si le format est inconnu.

    None plutot que la valeur brute : une chaine non reconnue ne doit pas finir
    dans un message utilisateur, et la traiter comme une date fausserait la
    comparaison d'echeance.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    raw = str(value).strip()
    if not raw:
        return None

    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        pass

    try:
        return parsedate_to_datetime(raw).date()
    except (TypeError, ValueError):
        pass

    first_field = raw.split(" ")[0]
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(first_field, fmt).date()
        except ValueError:
            continue

    logger.warning("Format de date AAS Diotali non reconnu : %r", raw)
    return None


def _to_fr_date(value: date | None) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def check_vehicule(
    immatriculation: str,
    date_effet_prevue: date | None = None,
    *,
    client: AasDiotaliClient | None = None,
) -> VerificationResult:
    """Verifie si le vehicule est deja assure via le registre AAS Diotali.

    Si une assurance existe mais que son echeance est strictement anterieure a
    `date_effet_prevue`, le vehicule ne sera plus couvert a cette date : on
    laisse passer.

    `details` porte les champs structures du contrat trouve (marque, modele,
    numero d'attestation, dates ISO) pour un affichage riche cote appelant,
    en plus du message deja pret a l'emploi. `available=False` signale une
    panne du tiers : la vente passe quand meme, mais l'appelant ne doit pas
    annoncer que l'immatriculation est libre.
    """
    client = client or AasDiotaliClient()
    immat_clean = client.normalize_immat(immatriculation)
    if not immat_clean:
        return VerificationResult(blocked=False)

    try:
        payload = client.verify_vehicle(immat_clean)
        status = str(payload.get("operationStatus", "")).upper()

        if status == "SUCCESS":
            data = payload.get("data") or {}
            dt_fin = _parse_date(data.get("dateEcheance"))
            dt_debut = _parse_date(data.get("dateEffet"))

            # Nouvelle date d'effet strictement apres l'echeance existante :
            # le vehicule ne sera plus couvert a cette date, on laisse passer.
            # Si `dt_fin` est illisible on tombe volontairement dans le cas
            # bloquant plus bas : impossible de prouver l'expiration
            # (fail-closed sur le parsing, a l'inverse du fail-open sur la
            # panne du tiers).
            if date_effet_prevue and dt_fin and date_effet_prevue > dt_fin:
                logger.info(
                    "Vehicule %s : contrat AAS Diotali expire le %s, "
                    "nouvelle date d'effet %s -> OK",
                    immat_clean,
                    dt_fin,
                    date_effet_prevue,
                )
                return VerificationResult(blocked=False)

            immat_display = data.get("immatriculation") or immatriculation.upper()
            marque = (data.get("marque") or "").strip()
            modele = (data.get("modele") or "").strip()
            attestation_num = data.get("attestationNumber", "")
            date_debut = _to_fr_date(dt_debut)
            date_fin = _to_fr_date(dt_fin)

            vehicule_info = f"{marque} {modele}".strip() if marque or modele else "Vehicule"
            parts = [f"{vehicule_info} immatricule {immat_display} deja assure."]
            if attestation_num:
                parts.append(f"Attestation N° {attestation_num}.")
            if date_debut and date_fin:
                parts.append(f"Contrat valide du {date_debut} au {date_fin}.")
            elif date_fin:
                parts.append(f"Contrat valide jusqu'au {date_fin}.")

            details = {
                "immatriculation": immat_display,
                "brand": marque,
                "model": modele,
                "attestation_number": attestation_num,
                "date_effet": dt_debut.isoformat() if dt_debut else "",
                "date_echeance": dt_fin.isoformat() if dt_fin else "",
            }
            return VerificationResult(blocked=True, message=" ".join(parts), details=details)

        # Le registre a repondu : rien trouve, le vehicule est bien libre.
        if status in {"ERROR", "NOT_FOUND", "FAILED"}:
            return VerificationResult(blocked=False)

        logger.warning("AAS Diotali : statut inconnu %r pour %s", status, immat_clean)
        if FAIL_OPEN:
            return VerificationResult.unavailable()
        return VerificationResult(
            blocked=True, message="Reponse inattendue du registre AAS Diotali."
        )

    except ValueError:
        logger.error("AAS Diotali : JSON invalide pour %s", immat_clean)
        return _on_outage("Erreur technique de verification.")
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else "?"
        logger.warning("AAS Diotali : HTTP %s pour %s", status_code, immat_clean)
        return _on_outage("Service de verification indisponible.")
    except requests.exceptions.Timeout:
        logger.warning("AAS Diotali : timeout pour %s", immat_clean)
        return _on_outage("Le service de verification ne repond pas.")
    except requests.exceptions.RequestException as exc:
        logger.warning("AAS Diotali : erreur reseau pour %s : %s", immat_clean, exc)
        return _on_outage("Impossible de joindre le serveur de verification.")
    except Exception:
        logger.exception("AAS Diotali : erreur inattendue pour %s", immat_clean)
        return _on_outage("Erreur interne de verification.")


def _on_outage(blocking_message: str) -> VerificationResult:
    """Panne du tiers : laisse passer (FAIL_OPEN) mais sans pretendre avoir verifie."""
    if FAIL_OPEN:
        return VerificationResult.unavailable()
    return VerificationResult(blocked=True, message=blocking_message)
