"""Regles d'authentification partagees entre la session web et les jetons mobiles.

La resolution des identifiants vit ICI et nulle part ailleurs : la connexion par
session (AuthLoginView) et la delivrance de jeton (AuthTokenObtainView) doivent
appliquer exactement les memes controles. Deux implementations d'une regle
d'authentification finissent toujours par diverger, et une divergence sur ce
chemin est une faille, pas une incoherence cosmetique.
"""

from django.contrib.auth import authenticate
from django.db.models import Q

from accounts.models import User


def authenticate_by_identifier(request, identifier, password):
    """Authentifie sur username, email ou telephone. Renvoie None si refuse.

    Deux garde-fous a ne pas retirer :

    1. L'identifiant qui designe PLUSIEURS comptes est refuse. Sans cela, un
       email en doublon avec le username d'un autre compte laisserait le backend
       Django choisir a notre place lequel des deux ouvrir.
    2. `authenticate()` est appele MEME quand on sait deja qu'on refusera. C'est
       volontaire : ModelBackend hache le mot de passe fourni meme pour un
       compte inexistant, ce qui egalise le temps de reponse. Court-circuiter
       ici rendrait les identifiants inconnus mesurablement plus rapides que les
       identifiants valides — un oracle d'enumeration de comptes.
    """
    candidates = list(
        User.objects.filter(
            Q(username__iexact=identifier)
            | Q(email__iexact=identifier)
            | Q(phone=identifier)
        )[:2]
    )
    resolved = candidates[0].username if len(candidates) == 1 else identifier
    user = authenticate(request, username=resolved, password=password)
    if len(candidates) != 1:
        user = None
    if user is None or not user.is_active:
        return None
    return user
