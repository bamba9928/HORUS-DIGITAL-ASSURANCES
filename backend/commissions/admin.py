from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from commissions.models import CommissionSnapshot


@admin.register(CommissionSnapshot)
class CommissionSnapshotAdmin(ModelAdmin):
    """Consultation seule : un snapshot est une piece comptable figee.

    Les montants sont calcules a l'emission avec le taux de l'apporteur du
    moment ; les recalculer ou les retoucher a posteriori ferait diverger la
    remuneration de ce qui a ete facture au client. Le changement de statut
    (PENDING -> PAYABLE -> PAID) suit une machine a etats declaree dans le
    modele : il doit passer par l'application, qui la fait respecter.
    """

    list_display = [
        "id",
        "contract",
        "contributor",
        "display_status",
        "prime_rc_ass",
        "commission_total",
        "marge_horus",
        "created_at",
    ]
    list_filter = ["status", "created_at"]
    search_fields = ["contract__id", "contributor__username", "contributor__matricule"]
    date_hierarchy = "created_at"
    list_select_related = ["contract", "contributor"]

    fieldsets = [
        ("Rattachement", {"fields": ["contract", "contributor", "status"]}),
        (
            "Assiette",
            {
                "fields": ["prime_rc_ass", "cout_police_ass", "ttc_ass"],
                "description": (
                    "prime_rc_ass = PrimeRC + CEDEAO calcules depuis la ventilation ASS, "
                    "et non le champ `data` de leur reponse (qui a derive)."
                ),
            },
        ),
        (
            "Commission apporteur",
            {
                "fields": [
                    "commission_percent_used",
                    "commission_fixed_policy_fee_used",
                    "commission_prime_rc_amount",
                    "commission_policy_fee_amount",
                    "commission_total",
                ]
            },
        ),
        ("Reversement et marge", {"fields": ["ass_partner_commission", "montant_reverse_ass", "marge_horus"]}),
        ("Reglement", {"fields": ["paid_at", "paid_by"]}),
        ("Dates", {"fields": ["created_at", "updated_at"]}),
    ]

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields if field.name != "id"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @display(
        description="Statut",
        label={
            CommissionSnapshot.Status.PENDING: "warning",
            CommissionSnapshot.Status.PAYABLE: "info",
            CommissionSnapshot.Status.PAID: "success",
            CommissionSnapshot.Status.CANCELLED: "danger",
            CommissionSnapshot.Status.DISPUTED: "danger",
        },
    )
    def display_status(self, obj):
        return obj.status
