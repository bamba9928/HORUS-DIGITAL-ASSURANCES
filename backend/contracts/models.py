from django.db import models

from integrations.ass.constants import ASS_POLICY_FEE


class Contract(models.Model):
    class ContractType(models.TextChoices):
        AUTO_MONO = "AUTO_MONO", "Auto mono"
        MOTO = "MOTO", "Moto"
        FLEET = "FLEET", "Flotte"
        BUS_SCHOOL = "BUS_SCHOOL", "Bus ecole"
        GARAGE = "GARAGE", "Garage"

    class InternalStatus(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        QUOTE_READY = "QUOTE_READY", "Devis pret"
        PAYMENT_PENDING = "PAYMENT_PENDING", "Paiement en attente"
        PAID = "PAID", "Paye"
        ISSUING = "ISSUING", "Emission en cours"
        ISSUED = "ISSUED", "Emis"
        CANCELLED = "CANCELLED", "Annule"

    class AssStatus(models.TextChoices):
        DRAFT = "BROUILLON", "Brouillon"
        CANCELLED = "ANNULE", "Annule"
        VALIDATED = "VALIDE", "Valide"

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="contracts",
    )
    contributor = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="contracts",
    )
    contract_type = models.CharField(max_length=30, choices=ContractType.choices)
    internal_status = models.CharField(
        max_length=30,
        choices=InternalStatus.choices,
        default=InternalStatus.DRAFT,
    )
    ass_status = models.CharField(
        max_length=30,
        choices=AssStatus.choices,
        null=True,
        blank=True,
    )
    reference_trx_partner = models.CharField(max_length=120, unique=True, null=True, blank=True)
    prime_rc_ass = models.PositiveIntegerField(null=True, blank=True)
    cout_police_ass = models.PositiveIntegerField(default=ASS_POLICY_FEE)
    ttc_ass = models.PositiveIntegerField(null=True, blank=True)
    draft_payload = models.JSONField(default=dict, blank=True)
    immatriculation = models.CharField(max_length=50, blank=True)
    attestation_number = models.CharField(max_length=120, blank=True)
    secure_key = models.CharField(max_length=255, blank=True)
    reference_externe = models.CharField(max_length=120, blank=True)
    date_expiration = models.DateTimeField(null=True, blank=True)
    link_attestation_digitale = models.URLField(max_length=500, blank=True)
    link_attestation_cedeao = models.URLField(max_length=500, blank=True)
    ass_request_payload = models.JSONField(default=dict, blank=True)
    ass_response_payload = models.JSONField(default=dict, blank=True)
    ass_issue_request_payload = models.JSONField(default=dict, blank=True)
    ass_issue_response_payload = models.JSONField(default=dict, blank=True)
    issuance_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.contract_type} #{self.pk}"
