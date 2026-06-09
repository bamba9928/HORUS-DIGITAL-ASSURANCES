from django.db import models

from integrations.ass.constants import ASS_POLICY_FEE


def build_contract_search_text(contract):
    draft_payload = contract.draft_payload if isinstance(contract.draft_payload, dict) else {}
    issue_payload = (
        contract.ass_issue_request_payload
        if isinstance(contract.ass_issue_request_payload, dict)
        else {}
    )
    policyholder = _as_dict(
        draft_payload.get("policyholder") or draft_payload.get("souscripteur")
    )
    vehicle = _as_dict(draft_payload.get("vehicle"))
    garage = _as_dict(draft_payload.get("garage"))
    fleet = _as_dict(draft_payload.get("fleet"))
    fleet_issue = _as_dict(issue_payload.get("flotte"))

    values = [
        contract.immatriculation,
        contract.attestation_number,
        contract.reference_externe,
        issue_payload.get("police"),
        fleet_issue.get("police"),
        policyholder.get("firstName"),
        policyholder.get("first_name"),
        policyholder.get("prenom"),
        policyholder.get("lastName"),
        policyholder.get("last_name"),
        policyholder.get("nom"),
        policyholder.get("raisonSociale"),
        policyholder.get("phone"),
        policyholder.get("cellulaire"),
        policyholder.get("telephone"),
        vehicle.get("brand"),
        vehicle.get("marque"),
        vehicle.get("model"),
        vehicle.get("modele"),
        vehicle.get("registration"),
        vehicle.get("immatriculation"),
        vehicle.get("chassis"),
        garage.get("registration"),
        garage.get("immatriculation"),
    ]

    for fleet_vehicle in fleet.get("vehicles", []):
        if not isinstance(fleet_vehicle, dict):
            continue
        values.extend(
            [
                fleet_vehicle.get("brand"),
                fleet_vehicle.get("marque"),
                fleet_vehicle.get("model"),
                fleet_vehicle.get("modele"),
                fleet_vehicle.get("registration"),
                fleet_vehicle.get("immatriculation"),
                fleet_vehicle.get("chassis"),
            ]
        )
        for trailer in fleet_vehicle.get("trailers", []):
            if isinstance(trailer, dict):
                values.extend(
                    [
                        trailer.get("brand"),
                        trailer.get("marque"),
                        trailer.get("model"),
                        trailer.get("modele"),
                        trailer.get("registration"),
                        trailer.get("immatriculation"),
                    ]
                )

    if contract.organization_id:
        values.append(contract.organization.name)
    if contract.contributor_id:
        values.extend(
            [
                contract.contributor.username,
                contract.contributor.first_name,
                contract.contributor.last_name,
            ]
        )

    return " ".join(
        str(value).strip()
        for value in values
        if value is not None and str(value).strip()
    ).upper()


def _as_dict(value):
    return value if isinstance(value, dict) else {}


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
    search_text = models.TextField(blank=True, editable=False)
    issuance_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.contract_type} #{self.pk}"

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        search_sources = {
            "organization",
            "organization_id",
            "contributor",
            "contributor_id",
            "draft_payload",
            "immatriculation",
            "attestation_number",
            "reference_externe",
            "ass_issue_request_payload",
        }
        should_refresh_search = (
            self._state.adding
            or update_fields is None
            or bool(search_sources.intersection(update_fields))
        )
        if should_refresh_search:
            self.search_text = build_contract_search_text(self)
            if update_fields is not None:
                kwargs["update_fields"] = [*set(update_fields), "search_text"]
        return super().save(*args, **kwargs)
