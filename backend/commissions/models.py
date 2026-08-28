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
    # Taux de commission d'apport applique (20 %, 40 % sur les genres TPC), fige
    # a l'emission : le bareme peut changer, le contrat emis reste auditable.
    ass_partner_commission_rate_used = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )
    # Commission d'apport reversee par ASS a Horus sur la prime nette (revenu Horus).
    ass_partner_commission = models.PositiveIntegerField(default=0)
    # Part du net a verser reversee a ASS, hors plateforme :
    # TTC - cout de police - commission d'apport.
    montant_reverse_ass = models.PositiveIntegerField(default=0)
    # Marge nette de Horus. Depuis la regle du 2026-08-28 elle vaut exactement la
    # commission d'apport : le cout de police est retenu par l'apporteur.
    marge_horus = models.IntegerField(default=0)
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

    @property
    def net_a_verser(self):
        """Montant paye par l'apporteur via Orange Money = TTC - cout de police."""
        return self.ttc_ass - self.cout_police_ass

    def __str__(self):
        return f"Commission {self.commission_total} FCFA - {self.status}"
