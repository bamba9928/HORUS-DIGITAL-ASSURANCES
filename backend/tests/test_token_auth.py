"""Authentification par jeton — le parcours des clients sans cookie (mobile).

Chaque test correspond a une propriete qu'un client mobile ou un attaquant
exercerait reellement, pas a une ligne de code a couvrir. Le plus important est
`test_token_obtain_partage_le_compteur_anti_force_brute` : sans lui, rien
n'empeche un futur refactor de donner a ce point d'entree son propre compteur,
ce qui rouvrirait la porte fermee par le durcissement du 2026-08-28.
"""

import pytest
from rest_framework.test import APIClient

from accounts.models import User


@pytest.fixture
def mobile_user(db):
    return User.objects.create_user(
        username="mobile-user",
        password="test-pass-123456",
        email="mobile.user@example.test",
        phone="775554433",
        role=User.Role.CONTRIBUTOR,
    )


def obtain(client, identifier="mobile-user", password="test-pass-123456"):
    return client.post(
        "/api/accounts/auth/token/",
        {"identifier": identifier, "password": password},
        format="json",
    )


@pytest.mark.django_db
def test_token_obtain_renvoie_access_refresh_et_utilisateur(mobile_user):
    response = obtain(APIClient())

    assert response.status_code == 200
    assert response.data["access"]
    assert response.data["refresh"]
    assert response.data["user"]["username"] == "mobile-user"


@pytest.mark.django_db
def test_token_obtain_met_a_jour_last_login(mobile_user):
    assert mobile_user.last_login is None

    obtain(APIClient())

    mobile_user.refresh_from_db()
    assert mobile_user.last_login is not None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "identifier",
    ["mobile-user", "mobile.user@example.test", "775554433", "77 555-44-33"],
)
def test_token_obtain_accepte_les_memes_identifiants_que_la_session(
    mobile_user,
    identifier,
):
    """Le jeton et la session partagent `authenticate_by_identifier` : username,
    email et telephone (meme mis en forme) doivent ouvrir les deux parcours."""
    response = obtain(APIClient(), identifier=identifier)

    assert response.status_code == 200
    assert response.data["user"]["username"] == "mobile-user"


@pytest.mark.django_db
def test_token_obtain_refuse_un_mot_de_passe_invalide(mobile_user):
    response = obtain(APIClient(), password="mauvais-mot-de-passe")

    assert response.status_code == 400
    assert response.data["detail"] == "Identifiants invalides."


@pytest.mark.django_db
def test_token_obtain_refuse_un_compte_desactive():
    User.objects.create_user(
        username="compte-inactif",
        password="test-pass-123456",
        role=User.Role.CONTRIBUTOR,
        is_active=False,
    )

    response = obtain(APIClient(), identifier="compte-inactif")

    assert response.status_code == 400
    assert response.data["detail"] == "Identifiants invalides."


@pytest.mark.django_db
def test_token_obtain_refuse_un_identifiant_ambigu():
    """Le meme garde-fou que la session : si l'identifiant designe deux comptes,
    on refuse plutot que de laisser Django trancher lequel ouvrir."""
    User.objects.create_user(
        username="ambigu-premier",
        password="test-pass-123456",
        email="ambigu@example.test",
        role=User.Role.CONTRIBUTOR,
    )
    User.objects.create_user(
        username="ambigu@example.test",
        password="test-pass-123456",
        role=User.Role.CONTRIBUTOR,
    )

    response = obtain(APIClient(), identifier="ambigu@example.test")

    assert response.status_code == 400


@pytest.mark.django_db
def test_le_bearer_ouvre_un_endpoint_protege(mobile_user):
    access = obtain(APIClient()).data["access"]
    client = APIClient()

    response = client.get(
        "/api/accounts/profile/",
        HTTP_AUTHORIZATION=f"Bearer {access}",
    )

    assert response.status_code == 200
    assert response.data["username"] == "mobile-user"


@pytest.mark.django_db
def test_sans_jeton_l_endpoint_protege_reste_ferme(mobile_user):
    response = APIClient().get("/api/accounts/profile/")

    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_un_bearer_invente_est_refuse(mobile_user):
    response = APIClient().get(
        "/api/accounts/profile/",
        HTTP_AUTHORIZATION="Bearer pas-un-jeton",
    )

    assert response.status_code == 401


@pytest.mark.django_db
def test_le_refresh_tourne_et_invalide_l_ancien(mobile_user):
    """Rotation + liste noire : rejouer un refresh deja consomme est refuse.

    C'est ce qui transforme un vol de refresh en incident detectable au lieu
    d'un acces silencieux de 30 jours."""
    client = APIClient()
    first_refresh = obtain(client).data["refresh"]

    rotated = client.post(
        "/api/accounts/auth/token/refresh/",
        {"refresh": first_refresh},
        format="json",
    )
    replayed = client.post(
        "/api/accounts/auth/token/refresh/",
        {"refresh": first_refresh},
        format="json",
    )

    assert rotated.status_code == 200
    assert rotated.data["access"]
    assert rotated.data["refresh"] != first_refresh
    assert replayed.status_code == 401


@pytest.mark.django_db
def test_la_revocation_tue_le_refresh(mobile_user):
    client = APIClient()
    refresh = obtain(client).data["refresh"]

    revoked = client.post(
        "/api/accounts/auth/token/revoke/",
        {"refresh": refresh},
        format="json",
    )
    reused = client.post(
        "/api/accounts/auth/token/refresh/",
        {"refresh": refresh},
        format="json",
    )

    assert revoked.status_code == 200
    assert reused.status_code == 401


@pytest.mark.django_db
def test_token_obtain_partage_le_compteur_anti_force_brute(mobile_user):
    """Le point d'entree jeton NE DOIT PAS offrir un compteur neuf.

    Dix echecs sur /auth/login/ epuisent le quota `auth_login` ; la onzieme
    tentative, faite sur /auth/token/, doit deja etre refusee en 429. Un scope
    de throttling distinct ferait de cette vue un contournement pur et simple
    de la limitation ajoutee lors du durcissement du 2026-08-28.
    """
    client = APIClient()
    for _ in range(10):
        client.post(
            "/api/accounts/auth/login/",
            {"username": "mobile-user", "password": "mauvais-mot-de-passe"},
            format="json",
        )

    response = obtain(client, password="mauvais-mot-de-passe")

    assert response.status_code == 429
