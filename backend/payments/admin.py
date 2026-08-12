from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from payments.models import Payment


@admin.register(Payment)
class PaymentAdmin(ModelAdmin):
    """Consultation seule.

    Confirmer un paiement n'est pas un simple changement de statut : le service
    `confirm_manual_payment` controle le montant attendu, fige `ttc_ass` et fait
    basculer le contrat en PAID, seul etat qui autorise l'emission. Poser
    CONFIRMED a la main produirait un contrat payable mais incoherent.
    """

    list_display = ["id", "contract", "amount", "display_status", "method", "confirmed_at", "created_at"]
    list_filter = ["status", "method", "created_at"]
    search_fields = ["contract__id", "external_reference", "om_transaction_id"]
    date_hierarchy = "created_at"
    list_select_related = ["contract", "created_by"]

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields if field.name != "id"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @display(
        description="Statut",
        label={
            Payment.Status.PENDING: "warning",
            Payment.Status.CONFIRMED: "success",
            Payment.Status.FAILED: "danger",
            Payment.Status.CANCELLED: "danger",
            Payment.Status.REFUNDED: "info",
        },
    )
    def display_status(self, obj):
        return obj.status
