from rest_framework import serializers

from commissions.models import CommissionSnapshot


class CommissionSnapshotSerializer(serializers.ModelSerializer):
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    contributor_full_name = serializers.SerializerMethodField()
    organization = serializers.IntegerField(source="contract.organization_id", read_only=True)
    organization_name = serializers.CharField(source="contract.organization.name", read_only=True)

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CommissionSnapshotStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionSnapshot
        fields = ["status"]

    def update(self, instance, validated_data):
        instance.status = validated_data["status"]
        instance.save(update_fields=["status", "updated_at"])
        return instance
