from django.contrib import admin

from referentials.models import VehicleBrand


@admin.register(VehicleBrand)
class VehicleBrandAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "value",
        "is_custom",
        "created_by",
        "created_at",
        "updated_by",
        "updated_at",
    ]
    list_filter = ["is_custom", "created_at", "updated_at"]
    search_fields = ["name", "value", "created_by__username", "updated_by__username"]
    readonly_fields = ["created_at", "updated_at"]
