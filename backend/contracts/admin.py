from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from contracts.models import Contract


@admin.register(Contract)
class ContractAdmin(ModelAdmin):
    """Consultation et purge, pas d'edition.

    Un contrat est le resultat d'une chaine verrouillee (devis -> paiement
    confirme -> emission ASS) : `reserve_contract_issue` refuse d'emettre sans
    paiement, la reference de transaction est unique cote ASS, et un montant
    retouche a la main desynchroniserait l'attestation deja emise. Modifier ces
    champs depuis l'admin court-circuiterait tout cela sans filet.

    La suppression reste ouverte : elle sert a purger les contrats de test.
    Les FK PROTECT (paiement, commission) la bloqueront d'elles-memes si le
    contrat a des ecritures rattachees.
    """

    list_display = [
        "id",
        "contract_type",
        "display_internal_status",
        "display_client",
        "immatriculation",
        "attestation_number",
        "ttc_ass",
        "created_at",
    ]
    list_filter = ["contract_type", "internal_status", "ass_status", "organization", "created_at"]
    search_fields = ["search_text", "immatriculation", "attestation_number", "reference_trx_partner"]
    date_hierarchy = "created_at"
    list_select_related = ["organization", "contributor"]

    fieldsets = [
        ("Rattachement", {"fields": ["organization", "contributor", "contract_type"]}),
        ("Statuts", {"fields": ["internal_status", "ass_status", "issuance_started_at"]}),
        ("Montants", {"fields": ["prime_rc_ass", "cout_police_ass", "ttc_ass"]}),
        (
            "Attestation ASS",
            {
                "fields": [
                    "reference_trx_partner",
                    "reference_externe",
                    "attestation_number",
                    "immatriculation",
                    "date_expiration",
                    "link_attestation_digitale",
                    "link_attestation_cedeao",
                ]
            },
        ),
        (
            "Echanges ASS",
            {
                "classes": ["collapse"],
                "fields": [
                    "ass_request_payload",
                    "ass_response_payload",
                    "ass_issue_request_payload",
                    "ass_issue_response_payload",
                ],
                "description": "Payloads bruts : c'est ici que se lit le motif exact d'un echec.",
            },
        ),
        ("Brouillon", {"classes": ["collapse"], "fields": ["draft_payload"]}),
        ("Dates", {"fields": ["created_at", "updated_at"]}),
    ]

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields if field.name != "id"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @display(
        description="Statut interne",
        label={
            Contract.InternalStatus.DRAFT: "info",
            Contract.InternalStatus.QUOTE_READY: "info",
            Contract.InternalStatus.PAID: "warning",
            Contract.InternalStatus.ISSUING: "warning",
            Contract.InternalStatus.ISSUED: "success",
            Contract.InternalStatus.CANCELLED: "danger",
        },
    )
    def display_internal_status(self, obj):
        return obj.internal_status

    @display(description="Client")
    def display_client(self, obj):
        name = f"{obj.policyholder_first_name} {obj.policyholder_last_name}".strip()
        return name or obj.policyholder_phone or "—"
