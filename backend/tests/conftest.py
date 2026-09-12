import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    """Isole le cache entre les tests (compteurs de throttling DRF notamment)."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _allow_om_mock(settings):
    """Autorise le mock Orange Money pendant les tests.

    La suite tourne avec DEBUG=False, ou `assert_om_mock_allowed` refuse les
    parcours OM simules — c'est precisement le garde-fou qui protege la
    production. Les tests l'assument explicitement ; ceux qui verifient le
    refus reposent ce drapeau a False eux-memes.
    """
    settings.OM_ALLOW_MOCK_IN_PRODUCTION = True


@pytest.fixture(autouse=True)
def _mock_aas_diotali(settings):
    """Coupe le registre AAS Diotali pendant les tests.

    Le reglage par defaut est le VRAI registre public (une prod entiere a
    tourne sur le mock parce que le defaut etait inverse). La suite, elle, ne
    doit pas dependre d'un service tiers ni faire d'appel sortant : le mock est
    donc force ici. Les tests qui veulent le vrai chemin reposent le drapeau
    eux-memes avec `override_settings(AAS_DIOTALI_MOCK_ENABLED=False)`.

    Sentinelle du mock : une plaque contenant "AAS" est « deja assuree ».
    """
    settings.AAS_DIOTALI_MOCK_ENABLED = True
