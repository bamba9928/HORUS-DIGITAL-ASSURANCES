from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from unfold.admin import ModelAdmin
from unfold.decorators import display
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    """Comptes internes. L'ordre des bases compte : BaseUserAdmin apporte la
    gestion du mot de passe, ModelAdmin l'habillage unfold."""

    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm

    list_display = [
        "username",
        "matricule",
        "display_role",
        "organization",
        "display_commission",
        "is_active",
    ]
    list_filter = ["role", "is_active", "organization"]
    search_fields = ["username", "matricule", "first_name", "last_name", "email", "phone"]
    ordering = ["username"]
    autocomplete_fields = ["organization"]
    readonly_fields = ["matricule", "commission_configured_by", "commission_configured_at", "last_login", "date_joined"]

    fieldsets = [
        (None, {"fields": ["username", "password"]}),
        ("Identite", {"fields": ["matricule", "first_name", "last_name", "email", "phone", "address"]}),
        ("Role et rattachement", {"fields": ["role", "organization"]}),
        (
            "Commission apporteur",
            {
                "fields": [
                    "commission_percent_on_prime_rc",
                    "commission_fixed_on_policy_fee",
                    "commission_configured_by",
                    "commission_configured_at",
                ],
                "description": (
                    "Sans ces deux valeurs, l'emission est refusee pour cet apporteur "
                    "(CommissionNotConfiguredError)."
                ),
            },
        ),
        ("Permissions", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
        ("Dates", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [
        (
            None,
            {
                "classes": ["wide"],
                "fields": ["username", "password1", "password2", "role", "organization"],
            },
        ),
    ]

    @display(
        description="Role",
        label={
            User.Role.ADMIN_GENERAL: "danger",
            User.Role.ADMIN_GROUP: "warning",
            User.Role.FINANCE: "info",
            User.Role.CONTRIBUTOR: "success",
        },
    )
    def display_role(self, obj):
        return obj.role

    @display(description="Commission")
    def display_commission(self, obj):
        if obj.commission_percent_on_prime_rc is None or obj.commission_fixed_on_policy_fee is None:
            return "— non configuree"
        return f"{obj.commission_percent_on_prime_rc} % + {obj.commission_fixed_on_policy_fee} FCFA"
