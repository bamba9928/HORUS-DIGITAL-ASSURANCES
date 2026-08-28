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
        "is_active",
    ]
    list_filter = ["role", "is_active", "organization"]
    search_fields = ["username", "matricule", "first_name", "last_name", "email", "phone"]
    ordering = ["username"]
    autocomplete_fields = ["organization"]
    readonly_fields = ["matricule", "last_login", "date_joined"]

    fieldsets = [
        (None, {"fields": ["username", "password"]}),
        ("Identite", {"fields": ["matricule", "first_name", "last_name", "email", "phone", "address"]}),
        ("Role et rattachement", {"fields": ["role", "organization"]}),
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

