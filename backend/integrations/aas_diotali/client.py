"""Client HTTP pour le registre public AAS Diotali (`apiaas.diotali.com`).

Registre national independant d'ASS : sert a detecter AVANT d'appeler ASS
qu'un vehicule est deja assure ailleurs, pour ne jamais consommer un QR reel
sur un doublon. Porte depuis `askia_insurance/contracts/applicationtiers_client.py`
(meme auteur, projet frere) — voir memoire `project-aas-diotali-a-porter`.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

import requests
from django.conf import settings

logger = logging.getLogger("integrations.aas_diotali")

REGISTRATION_STRIP_PATTERN = re.compile(r"[\s\-–—]+")

# Session partagee : le formulaire interroge le registre a chaque saisie de
# plaque et a chaque changement de date d'effet. Une Session par appel
# repayait un handshake TLS a chaque fois. Le client reste instancie par appel
# (il lit les settings, que les tests surchargent) mais reutilise ce pool.
_SHARED_SESSION = requests.Session()
_SHARED_SESSION.headers.update(
    {"Accept": "application/json", "User-Agent": "horus-assurances/1.0"}
)


class AasDiotaliClient:
    DEFAULT_BASE_URL = "https://apiaas.diotali.com/applicationtiers"
    DEFAULT_TIMEOUT = (5, 15)

    def __init__(self, *, base_url=None, session=None, timeout=None):
        self.base_url = (
            base_url or getattr(settings, "AAS_PUBLIC_BASE_URL", self.DEFAULT_BASE_URL)
        ).rstrip("/")
        self.timeout = timeout or self.DEFAULT_TIMEOUT
        self.session = session or _SHARED_SESSION

    @staticmethod
    def normalize_immat(value: str) -> str:
        if not value:
            return ""
        return REGISTRATION_STRIP_PATTERN.sub("", value.strip().upper())

    def verify_vehicle(self, immatriculation: str) -> dict[str, Any]:
        immat_clean = self.normalize_immat(immatriculation)
        if not immat_clean:
            raise ValueError("immatriculation requise")

        if getattr(settings, "AAS_DIOTALI_MOCK_ENABLED", True):
            return self._mock_verify_vehicle(immat_clean)

        url = f"{self.base_url}/verify/{quote(immat_clean, safe='')}"
        response = self.session.get(url, timeout=self.timeout)

        if response.status_code == 404:
            return {
                "operationStatus": "NOT_FOUND",
                "operationMessage": "Aucune attestation trouvee pour cette immatriculation.",
                "data": {},
            }

        response.raise_for_status()

        try:
            payload = response.json()
        except ValueError as exc:
            logger.error("AAS Diotali verify a renvoye un JSON invalide pour %s", immat_clean)
            raise ValueError("Reponse invalide de l'API AAS Diotali") from exc

        if not isinstance(payload, dict):
            raise ValueError("Reponse inattendue de l'API AAS Diotali")
        return payload

    def _mock_verify_vehicle(self, immat_clean: str) -> dict[str, Any]:
        # Sentinelle de test : une plaque contenant "AAS" simule un vehicule
        # deja assure, avec une echeance fixe pour exercer la comparaison de
        # dates cote appelant (voir aas_diotali/service.py).
        if "AAS" not in immat_clean:
            return {
                "operationStatus": "NOT_FOUND",
                "operationMessage": "Aucune attestation trouvee pour cette immatriculation.",
                "data": {},
            }
        return {
            "operationStatus": "SUCCESS",
            "operationMessage": "Vehicule deja assure (mock).",
            "data": {
                "immatriculation": immat_clean,
                "marque": "MOCK",
                "modele": "ASSURANCES",
                "attestationNumber": "MOCKAAS0001",
                "dateEffet": "2026-01-01",
                "dateEcheance": "2026-12-31",
            },
        }
