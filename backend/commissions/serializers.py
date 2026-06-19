from django.utils import timezone
from rest_framework import serializers

from commissions.models import CommissionSnapshot


class CommissionSnapshotSerializer(serializers.ModelSerializer):
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    contributor_full_name = serializers.SerializerMethodField()
    organization = serializers.IntegerField(source="contract.organization_id", read_only=True)
    organization_name = serializers.CharField(source="contract.organization.name", read_only=True)
    paid_by_username = serializers.CharField(source="paid_by.username", read_only=True, default=None)

    def get_contributor_full_name(self, obj):
        user = obj.contributor
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username

    class Meta:
        model = CommissionSnapshot
        fields = [
            "id",
            "contract",
            "contributor",
            "contributor_username",
            "contributor_full_name",
            "organization",
            "organization_name",
            "status",
            "prime_rc_ass",
            "cout_police_ass",
            "ttc_ass",
            "commission_percent_used",
            "commission_fixed_policy_fee_used",
            "commission_prime_rc_amount",
            "commission_policy_fee_amount",
            "commission_total",
            "net_to_horus",
            "paid_at",
            "paid_by",
            "paid_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CommissionSnapshotStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionSnapshot
        fields = ["status"]

    def validate_status(self, value):
        current = self.instance.status
        if value == current:
            return value
        if value == CommissionSnapshot.Status.CANCELLED:
            raise serializers.ValidationError(
                "Le statut Annulee est pose automatiquement par l'annulation du contrat."
            )
        allowed = CommissionSnapshot.ALLOWED_STATUS_TRANSITIONS.get(current, frozenset())
        if value not in allowed:
            current_label = CommissionSnapshot.Status(current).label
            value_label = CommissionSnapshot.Status(value).label
            raise serializers.ValidationError(
                f"Transition invalide : {current_label} -> {value_label}."
            )
        return value

    def update(self, instance, validated_data):
        new_status = validated_data["status"]
        update_fields = ["status", "updated_at"]
        if (
            new_status == CommissionSnapshot.Status.PAID
            and instance.status != CommissionSnapshot.Status.PAID
        ):
            instance.paid_at = timezone.now()
            instance.paid_by = self.context["request"].user
            update_fields += ["paid_at", "paid_by"]
        instance.status = new_status
        instance.save(update_fields=update_fields)
        return instance
