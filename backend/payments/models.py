from django.db import models
from django.db.models import Q


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        CONFIRMED = "CONFIRMED", "Confirme"
        FAILED = "FAILED", "Echoue"
        CANCELLED = "CANCELLED", "Annule"
        REFUNDED = "REFUNDED", "Rembourse"

    contract = models.ForeignKey(
        "contracts.Contract",
        on_delete=models.PROTECT,
        related_name="payments",
    )
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    external_reference = models.CharField(max_length=120, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="created_payments",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["contract"],
                condition=Q(status="CONFIRMED"),
                name="unique_confirmed_payment_per_contract",
            ),
        ]

    def __str__(self):
        return f"Paiement {self.amount} FCFA - {self.status}"
