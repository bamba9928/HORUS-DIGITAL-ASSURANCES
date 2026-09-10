from django.db import models


class CommissionSnapshot(models.Model):
    """Photo comptable d'un contrat emis, figee a l'emission.

    Le STATUT suit le seul flux d'argent qui reste a faire apres l'emission :
    le reversement de `montant_reverse_ass` a ASS, hors plateforme.

    Il ne suit PAS `commission_total`. Depuis la regle du 2026-08-28 celle-ci
    vaut le cout de police, que l'apporteur a deja retenu a la source en ne
    versant que le net : rien ne lui sera jamais paye, et un cycle
    « en attente / payable / payee » sur cette ligne decrivait un versement qui
    n'existe pas.
    """

    class Status(models.TextChoices):
        # Etats du reversement du solde a ASS.
        PENDING = "PENDING", "A reverser"
        PAYABLE = "PAYABLE", "Pret a reverser"
        PAID = "PAID", "Reverse a ASS"
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
    # TTC - cout de police - commission d'apport. Calculee AVANT `remise_horus` :
    # la remise sort de la poche de Horus, pas de celle d'ASS.
    montant_reverse_ass = models.PositiveIntegerField(default=0)
    # Remise accordee par Horus au client, deduite du net a verser. Ne concerne
    # que les genres TPC : elle comble les 20 points que l'API d'ASS refuse
    # au-dela de son plafond (voir horus_extra_rebate_rate).
    remise_horus = models.PositiveIntegerField(default=0)
    # Marge nette de Horus. Depuis la regle du 2026-08-28 elle vaut exactement la
    # commission d'apport : le cout de police est retenu par l'apporteur.
    marge_horus = models.IntegerField(default=0)
    # Date et auteur du REVERSEMENT A ASS, pas d'un paiement a l'apporteur :
    # les noms sont historiques, la migration serait sans benefice.
    paid_at = models.DateTimeField(
        null=True, blank=True, help_text="Date du reversement a ASS."
    )
    paid_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        related_name="paid_commission_snapshots",
        null=True,
        blank=True,
        help_text="Utilisateur ayant marque le solde comme reverse a ASS.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def net_a_verser(self):
        """Montant paye par l'apporteur = TTC - cout de police - remise Horus."""
        return self.ttc_ass - self.cout_police_ass - self.remise_horus

    @property
    def retenue_apporteur(self):
        """Ce que l'apporteur garde : le cout de police, retenu a la source.

        Aucun versement ne lui est du — il a deja soustrait ce montant du net
        qu'il a paye. Alias lisible de `commission_total`, dont le nom laissait
        croire a une dette envers lui.
        """
        return self.commission_total

    def __str__(self):
        return f"Commission {self.commission_total} FCFA - {self.status}"
