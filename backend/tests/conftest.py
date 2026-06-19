import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    """Isole le cache entre les tests (compteurs de throttling DRF notamment)."""
    cache.clear()
    yield
    cache.clear()
