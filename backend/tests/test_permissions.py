import pytest

from accounts.models import User
from accounts.permissions import can_manage_commission, can_manage_user
from organizations.models import Organization


@pytest.mark.django_db
def test_general_admin_can_manage_all_users_and_commissions():
    organization = Organization.objects.create(name="Groupe Dakar", code="DKR")
    admin = User.objects.create_user(
        username="admin-general",
        password="test",
        role=User.Role.ADMIN_GENERAL,
    )
    contributor = User.objects.create_user(
        username="apporteur",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )

    assert can_manage_user(admin, contributor) is True
    assert can_manage_commission(admin, contributor) is True


@pytest.mark.django_db
def test_group_admin_can_manage_only_own_group():
    own_group = Organization.objects.create(name="Groupe Dakar", code="DKR")
    other_group = Organization.objects.create(name="Groupe Saint-Louis", code="STL")
    admin_group = User.objects.create_user(
        username="admin-dakar",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    own_contributor = User.objects.create_user(
        username="apporteur-dakar",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="apporteur-saint-louis",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )

    assert can_manage_user(admin_group, own_contributor) is True
    assert can_manage_commission(admin_group, own_contributor) is True
    assert can_manage_user(admin_group, other_contributor) is False
    assert can_manage_commission(admin_group, other_contributor) is False


@pytest.mark.django_db
def test_contributor_cannot_modify_own_commission():
    organization = Organization.objects.create(name="Groupe Kaolack", code="KLK")
    contributor = User.objects.create_user(
        username="apporteur-kaolack",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )

    assert can_manage_commission(contributor, contributor) is False
