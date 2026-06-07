import pytest
from rest_framework.test import APIClient

from accounts.models import User
from organizations.models import Organization


@pytest.mark.django_db
def test_general_admin_can_list_active_organizations():
    active = Organization.objects.create(name="Groupe Actif", code="ACTIVE")
    Organization.objects.create(name="Groupe Inactif", code="INACTIVE", is_active=False)
    admin = User.objects.create_user(
        username="organization-general-admin",
        password="test",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.get("/api/organizations/")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [active.id]


@pytest.mark.django_db
def test_group_admin_can_list_only_own_organization():
    own = Organization.objects.create(name="Groupe Propre", code="OWN")
    Organization.objects.create(name="Groupe Autre", code="OTHER")
    admin = User.objects.create_user(
        username="organization-group-admin",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=own,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.get("/api/organizations/")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [own.id]


@pytest.mark.django_db
def test_contributor_cannot_list_organizations():
    organization = Organization.objects.create(name="Groupe Contributeur", code="CONTRIB")
    contributor = User.objects.create_user(
        username="organization-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get("/api/organizations/")

    assert response.status_code == 200
    assert response.data["results"] == []
