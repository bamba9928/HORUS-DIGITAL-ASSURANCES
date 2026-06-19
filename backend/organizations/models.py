from django.db import models


class Organization(models.Model):
    class LegalPersonType(models.TextChoices):
        MORALE = "MORALE", "Personne morale"
        PHYSIQUE = "PHYSIQUE", "Personne physique"

    class OrganizationType(models.TextChoices):
        AGENCY = "AGENCY", "Agence"
        BROKER = "BROKER", "Courtier"
        CONTRIBUTOR = "CONTRIBUTOR", "Apporteur"
        PARTNER = "PARTNER", "Partenaire"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Actif"
        INACTIVE = "INACTIVE", "Inactif"
        SUSPENDED = "SUSPENDED", "Suspendu"

    class ContactAccessMode(models.TextChoices):
        NONE = "NONE", "Aucun accès"
        TEMPORARY_PASSWORD = "TEMPORARY_PASSWORD", "Mot de passe temporaire"
        EMAIL_INVITATION = "EMAIL_INVITATION", "Invitation email"

    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, unique=True)
    legal_person_type = models.CharField(
        max_length=20,
        choices=LegalPersonType.choices,
        default=LegalPersonType.MORALE,
    )
    organization_type = models.CharField(
        max_length=20,
        choices=OrganizationType.choices,
        default=OrganizationType.PARTNER,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    legal_form = models.CharField(max_length=100, blank=True)
    ninea_rccm = models.CharField(max_length=100, blank=True)
    insurance_license_number = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default="Sénégal")
    currency = models.CharField(max_length=10, default="FCFA")
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    professional_email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    contact_first_name = models.CharField(max_length=150, blank=True)
    contact_last_name = models.CharField(max_length=150, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_role = models.CharField(max_length=30, blank=True)
    contact_username = models.CharField(max_length=150, blank=True)
    contact_access_mode = models.CharField(
        max_length=30,
        choices=ContactAccessMode.choices,
        default=ContactAccessMode.NONE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self._state.adding and self.status == self.Status.ACTIVE and not self.is_active:
            self.status = self.Status.INACTIVE
        self.is_active = self.status == self.Status.ACTIVE
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "status" in update_fields:
            kwargs["update_fields"] = set(update_fields) | {"is_active"}
        super().save(*args, **kwargs)
