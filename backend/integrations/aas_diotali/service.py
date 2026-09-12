"""Verification independante « deja assure » via le registre AAS Diotali.

Porte depuis `askia_insurance/contracts/aas_service.py` (AASVerifier) — meme
regle metier, adaptee au style fonctionnel de ce backend. Voir la memoire
`project-aas-diotali-a-porter` pour le contexte complet.
"""

from __future__ import annotations

import logging
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
) -> tuple[bool, str | None, dict | None]:
    """Verifie si le vehicule est deja assure via le registre AAS Diotali.

    Si une assurance existe mais que son echeance est strictement anterieure a
    `date_effet_prevue`, le vehicule ne sera plus couvert a cette date : on
    laisse passer.

    Retourne (True, message, details) si BLOQUE, (False, None, None) si OK.
    `details` porte les champs structures du contrat trouve (marque, modele,
    numero d'attestation, dates ISO) pour un affichage riche cote appelant,
    en plus du message deja pret a l'emploi.
    """
    client = client or AasDiotaliClient()
    immat_clean = client.normalize_immat(immatriculation)
    if not immat_clean:
        return False, None, None

    try:
        payload = client.verify_vehicle(immat_clean)
        status = str(payload.get("operationStatus", "")).upper()

        if status == "SUCCESS":
            data = payload.get("data") or {}
            dt_fin = _parse_date(data.get("dateEcheance"))
            dt_debut = _parse_date(data.get("dateEffet"))

            # Echeance illisible : impossible de prouver l'expiration, on
            # bloque par securite (fail-closed sur le parsing, different du
            # fail-open sur la panne ci-dessous).
            if date_effet_prevue and dt_fin and date_effet_prevue > dt_fin:
                logger.info(
                    "Vehicule %s : contrat AAS Diotali expire le %s, "
                    "nouvelle date d'effet %s -> OK",
                    immat_clean,
                    dt_fin,
                    date_effet_prevue,
                )
                return False, None, None

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
            return True, " ".join(parts), details

        if status in {"ERROR", "NOT_FOUND", "FAILED"}:
            return False, None, None

        if FAIL_OPEN:
            return False, None, None
        return True, "Reponse inattendue du registre AAS Diotali.", None

    except ValueError:
        logger.error("AAS Diotali : JSON invalide pour %s", immat_clean)
        return (
            (False, None, None)
            if FAIL_OPEN
            else (True, "Erreur technique de verification.", None)
        )
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else "?"
        logger.warning("AAS Diotali : HTTP %s pour %s", status_code, immat_clean)
        return (
            (False, None, None)
            if FAIL_OPEN
            else (True, "Service de verification indisponible.", None)
        )
    except requests.exceptions.Timeout:
        logger.warning("AAS Diotali : timeout pour %s", immat_clean)
        return (
            (False, None, None)
            if FAIL_OPEN
            else (True, "Le service de verification ne repond pas.", None)
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("AAS Diotali : erreur reseau pour %s : %s", immat_clean, exc)
        return (
            (False, None, None)
            if FAIL_OPEN
            else (True, "Impossible de joindre le serveur de verification.", None)
        )
    except Exception:
        logger.exception("AAS Diotali : erreur inattendue pour %s", immat_clean)
        return (
            (False, None, None)
            if FAIL_OPEN
            else (True, "Erreur interne de verification.", None)
        )
