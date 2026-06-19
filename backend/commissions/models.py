from django.db import models


class CommissionSnapshot(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        PAYABLE = "PAYABLE", "Payable"
        PAID = "PAID", "Payee"
        CANCELLED = "CANCELLED", "Annulee"
        DISPUTED = "DISPUTED", "Contestee"

    # Transitions autorisees via l'API de changement de statut.
    # CANCELLED n'est jamais accessible par cette API : il est pose uniquement
    # par l'annulation du contrat (cancel_contract).
    ALLOWED_STATUS_TRANSITIONS = {
        Status.PENDING: {Status.PAYABLE, Status.PAID, Status.DISPUTED},
        Status.PAYABLE: {Status.PAID, Status.PENDING, Status.DISPUTED},
        Status.DISPUTED: {Status.PENDING, Status.PAYABLE},
        Status.PAID: {Status.DISPUTED},
        Status.CANCELLED: frozenset(),
    }

    contract = models.OneToOneField(
        "contracts.Contract",
        on_delete=models.PROTECT,
        related_name="commission_snapshot",
    )
    contributor = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="commission_snapshots",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    prime_rc_ass = models.PositiveIntegerField()
    cout_police_ass = models.PositiveIntegerField()
    ttc_ass = models.PositiveIntegerField()
    commission_percent_used = models.DecimalField(max_digits=5, decimal_places=2)
    commission_fixed_policy_fee_used = models.PositiveIntegerField()
    commission_prime_rc_amount = models.PositiveIntegerField()
    commission_policy_fee_amount = models.PositiveIntegerField()
    commission_total = models.PositiveIntegerField()
    net_to_horus = models.PositiveIntegerField()
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        related_name="paid_commission_snapshots",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Commission {self.commission_total} FCFA - {self.status}"
