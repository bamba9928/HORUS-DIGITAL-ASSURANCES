from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from integrations.ass.models import AssApiLog


@admin.register(AssApiLog)
class AssApiLogAdmin(ModelAdmin):
    """Consultation seule : le journal n'est jamais edite a la main."""

    list_display = ["created_at", "endpoint", "display_success", "status_code", "duration_ms"]
    list_filter = ["success", "endpoint"]
    search_fields = ["endpoint", "error_message"]
    date_hierarchy = "created_at"
    readonly_fields = [
        "created_at",
        "endpoint",
        "status_code",
        "success",
        "duration_ms",
        "request_payload",
        "response_payload",
        "error_message",
    ]

    fieldsets = [
        ("Appel", {"fields": ["created_at", "endpoint", "status_code", "success", "duration_ms"]}),
        (
            "Echange",
            {
                "fields": ["request_payload", "response_payload", "error_message"],
                "description": (
                    "ASS place le motif metier dans `error_descrip` de la reponse — "
                    "c'est la qu'il faut regarder quand un contrat bloque."
                ),
            },
        ),
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @display(description="Resultat", label={True: "success", False: "danger"})
    def display_success(self, obj):
        return obj.success
