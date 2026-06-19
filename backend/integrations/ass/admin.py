from django.contrib import admin

from integrations.ass.models import AssApiLog


@admin.register(AssApiLog)
class AssApiLogAdmin(admin.ModelAdmin):
    """Consultation seule : le journal n'est jamais edite a la main."""

    list_display = ["created_at", "endpoint", "success", "status_code", "duration_ms"]
    list_filter = ["success", "endpoint"]
    search_fields = ["endpoint", "error_message"]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
