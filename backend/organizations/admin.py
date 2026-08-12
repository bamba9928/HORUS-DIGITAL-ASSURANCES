from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from organizations.models import Organization


@admin.register(Organization)
class OrganizationAdmin(ModelAdmin):
    list_display = ["name", "code", "organization_type", "display_status", "city", "phone"]
    list_filter = ["organization_type", "status", "legal_person_type", "is_active"]
    search_fields = ["name", "code", "ninea_rccm", "professional_email", "contact_email", "phone"]
    # Requis par l'autocomplete de UserAdmin.organization.
    ordering = ["name"]

    fieldsets = [
        ("Identification", {"fields": ["name", "code", "legal_person_type", "organization_type"]}),
        ("Statut", {"fields": ["status", "is_active", "description"]}),
        (
            "Informations legales",
            {"fields": ["legal_form", "ninea_rccm", "insurance_license_number", "country", "currency"]},
        ),
        ("Coordonnees", {"fields": ["address", "city", "region", "phone", "professional_email", "website"]}),
        (
            "Contact principal",
            {
                "fields": [
                    "contact_first_name",
                    "contact_last_name",
                    "contact_email",
                    "contact_phone",
                    "contact_role",
                    "contact_username",
                    "contact_access_mode",
                ]
            },
        ),
    ]

    @display(
        description="Statut",
        label={
            Organization.Status.ACTIVE: "success",
            Organization.Status.INACTIVE: "warning",
            Organization.Status.SUSPENDED: "danger",
        },
    )
    def display_status(self, obj):
        return obj.status
