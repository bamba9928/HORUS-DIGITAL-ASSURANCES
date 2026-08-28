"""L'admin Django doit s'ouvrir sur chaque modele enregistre.

Un ModelAdmin ne se verifie pas a l'import : une methode `display` mal nommee, un
champ absent d'un fieldset ou un `readonly_fields` incoherent ne se voient qu'au
rendu, et `manage.py check` les laisse passer. Ces tests ouvrent donc reellement
chaque ecran.
"""

import pytest
from django.contrib.admin.sites import site
from django.urls import reverse

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from organizations.models import Organization
from payments.models import Payment


@pytest.fixture(autouse=True)
def _static_storage_without_manifest(settings):
    """Neutralise le stockage a manifeste le temps des tests.

    `STORAGES` pointe en temps normal sur CompressedManifestStaticFilesStorage,
    qui exige un `collectstatic` prealable : sans lui, le moindre `{% static %}`
    des gabarits unfold leve "Missing staticfiles manifest entry". Ces tests
    verifient le rendu des ModelAdmin, pas le hachage des assets — les faire
    dependre d'une etape de build les rendrait verts en local et rouges en CI.
    """
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }


@pytest.fixture
def admin_client(client, db):
    superuser = User.objects.create_superuser(
        username="admin-test",
        password="admin-test-password",
        role=User.Role.ADMIN_GENERAL,
    )
    client.force_login(superuser)
    return client


@pytest.mark.django_db
def test_admin_index_lists_every_registered_model(admin_client):
    response = admin_client.get(reverse("admin:index"))

    assert response.status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("model", list(site._registry))
def test_admin_changelist_opens(admin_client, model):
    url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")

    response = admin_client.get(url)

    assert response.status_code == 200


@pytest.mark.django_db
def test_admin_detail_pages_render_with_real_rows(admin_client):
    """Les colonnes calculees ne s'executent que s'il y a des lignes a afficher."""
    organization = Organization.objects.create(name="Groupe Admin", code="ADM-1")
    contributor = User.objects.create_user(
        username="apporteur-admin",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
        prime_rc_ass=5_069,
        ttc_ass=7_884,
        draft_payload={"policyholder": {"lastName": "FALL", "firstName": "Modou", "phone": "770000001"}},
    )
    payment = Payment.objects.create(
        contract=contract,
        amount=7_884,
        status=Payment.Status.CONFIRMED,
        created_by=contributor,
    )
    snapshot = CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        prime_rc_ass=3_875,
        cout_police_ass=3_000,
        ttc_ass=7_884,
        commission_percent_used=10,
        commission_fixed_policy_fee_used=1_000,
        commission_prime_rc_amount=387,
        commission_policy_fee_amount=1_000,
        commission_total=1_387,
    )

    for obj in [organization, contributor, contract, payment, snapshot]:
        meta = obj._meta
        list_url = reverse(f"admin:{meta.app_label}_{meta.model_name}_changelist")
        detail_url = reverse(f"admin:{meta.app_label}_{meta.model_name}_change", args=[obj.pk])

        assert admin_client.get(list_url).status_code == 200, meta.model_name
        assert admin_client.get(detail_url).status_code == 200, meta.model_name


@pytest.mark.django_db
@pytest.mark.parametrize("model", [Contract, Payment, CommissionSnapshot])
def test_financial_records_are_not_editable_from_admin(admin_client, model):
    """Ces objets sont produits par des services qui portent les invariants
    (paiement confirme avant emission, montants figes) : les editer a la main
    depuis l'admin les contournerait."""
    model_admin = site._registry[model]

    assert model_admin.has_add_permission(None) is False
    assert model_admin.has_change_permission(None) is False
