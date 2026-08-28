from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from uuid import uuid4


def generate_user_matricule():
    return f"HOR-{uuid4().hex[:12].upper()}"


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN_GENERAL = "ADMIN_GENERAL", "Admin general"
        ADMIN_GROUP = "ADMIN_GROUP", "Admin groupe"
        CONTRIBUTOR = "CONTRIBUTOR", "Apporteur"
        FINANCE = "FINANCE", "Finance / comptabilite"

    role = models.CharField(max_length=30, choices=Role.choices, default=Role.CONTRIBUTOR)
    matricule = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        default=generate_user_matricule,
    )
    phone = models.CharField(
        max_length=9,
        blank=True,
        validators=[
            RegexValidator(
                regex=r"^7\d{8}$",
                message="Le téléphone doit contenir exactement 9 chiffres et commencer par 7.",
            )
        ],
    )
    address = models.TextField(blank=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )
    @property
    def is_admin_general(self):
        return self.is_superuser or self.role == self.Role.ADMIN_GENERAL

    @property
    def is_admin_group(self):
        return self.role == self.Role.ADMIN_GROUP

    @property
    def is_contributor(self):
        return self.role == self.Role.CONTRIBUTOR

    @property
    def is_finance(self):
        return self.role == self.Role.FINANCE

    def can_manage_user(self, target_user):
        if self.is_admin_general:
            return True
        if self.is_admin_group:
            # Un admin groupe ne peut pas modifier (rétrograder, désactiver…)
            # un admin général ni un autre admin groupe, même dans son organisation.
            if target_user.is_admin_general or target_user.is_admin_group:
                return False
            return bool(self.organization_id and self.organization_id == target_user.organization_id)
        return False

    def can_view_user(self, target_user):
        if self.id == target_user.id:
            return True
        if self.is_admin_general:
            return True
        if self.is_admin_group:
            return bool(self.organization_id and self.organization_id == target_user.organization_id)
        return False

