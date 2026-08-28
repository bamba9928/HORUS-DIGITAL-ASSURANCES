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
