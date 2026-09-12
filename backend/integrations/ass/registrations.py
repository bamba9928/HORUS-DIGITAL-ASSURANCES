"""Forme canonique d'une immatriculation — point unique.

Une meme plaque se saisit de plusieurs facons (« AA-917-VL », « AA917VL »,
« aa 917 vl ») et chaque variante partait jusqu'ici telle quelle vers ASS,
vers le registre AAS Diotali et dans la base : les deux services n'en pensent
pas la meme chose. Diotali normalise de son cote (donc repond pareil), mais
ASS garde ce qu'on lui envoie — ses propres exemples utilisent la forme
tiretee « AA-111-KL » (collection Postman, voir [[ref-ass-api-docs]]) — et
l'echo de notre API renvoyait la saisie brute. Resultat : meme vehicule, deux
reponses et deux plaques stockees.

Deux fonctions, deux usages distincts :
- `normalize_registration` : la CLE de comparaison (majuscules, sans aucun
  separateur). C'est elle qui sert a interroger un registre et a comparer
  deux plaques entre elles.
- `format_registration` : la forme AFFICHEE et ENVOYEE a ASS. Rend la forme
  tiretee quand la plaque suit le schema senegalais standard, et se rabat sur
  la forme compacte sinon — jamais d'invention de tirets sur une plaque dont
  on ne reconnait pas la structure (W garage, remorques, plaques anciennes).
"""

from __future__ import annotations

import re

SEPARATORS_PATTERN = re.compile(r"[^A-Z0-9]+")

# Schema standard senegalais : 2 lettres, 3 ou 4 chiffres, 2 lettres.
STANDARD_PATTERN = re.compile(r"^([A-Z]{2})(\d{3,4})([A-Z]{2})$")


def normalize_registration(value) -> str:
    """Cle de comparaison : majuscules, sans espace ni tiret (ni tiret long)."""
    if not value:
        return ""
    return SEPARATORS_PATTERN.sub("", str(value).strip().upper())


def format_registration(value) -> str:
    """Forme canonique : « AA-917-VL » si la plaque est standard, sinon compacte."""
    compact = normalize_registration(value)
    match = STANDARD_PATTERN.fullmatch(compact)
    if not match:
        return compact
    return "-".join(match.groups())
