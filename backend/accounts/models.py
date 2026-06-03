from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN_GENERAL = "ADMIN_GENERAL", "Admin general"
        ADMIN_GROUP = "ADMIN_GROUP", "Admin groupe"
        CONTRIBUTOR = "CONTRIBUTOR", "Apporteur"
        FINANCE = "FINANCE", "Finance / comptabilite"

    role = models.CharField(max_length=30, choices=Role.choices, default=Role.CONTRIBUTOR)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )
    commission_percent_on_prime_rc = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    commission_fixed_on_policy_fee = models.PositiveIntegerField(null=True, blank=True)
    commission_configured_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="configured_commission_users",
        null=True,
        blank=True,
    )
    commission_configured_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(commission_fixed_on_policy_fee__isnull=True)
                | Q(commission_fixed_on_policy_fee__lte=settings.ASS_POLICY_FEE),
                name="commission_fixed_on_policy_fee_lte_ass_policy_fee",
            ),
        ]

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

    @property
    def has_configured_commission(self):
        return (
            self.commission_percent_on_prime_rc is not None
            and self.commission_fixed_on_policy_fee is not None
        )

    def can_manage_user(self, target_user):
        if self.is_admin_general:
            return True
        if self.is_admin_group:
            return self.organization_id and self.organization_id == target_user.organization_id
        return False

    def can_manage_commission(self, target_user):
        return target_user.is_contributor and self.can_manage_user(target_user)

    def clean(self):
        super().clean()
        if self.commission_fixed_on_policy_fee is not None:
            if self.commission_fixed_on_policy_fee > settings.ASS_POLICY_FEE:
                raise ValidationError(
                    {
                        "commission_fixed_on_policy_fee": (
                            "La commission fixe sur cout de police ne peut pas depasser "
                            f"{settings.ASS_POLICY_FEE} FCFA."
                        )
                    }
                )
