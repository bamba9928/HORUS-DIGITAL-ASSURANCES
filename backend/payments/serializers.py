from rest_framework import serializers

from payments.models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField()
    organization_name = serializers.CharField(
        source="contract.organization.name", read_only=True
    )
    contract_internal_status = serializers.CharField(
        source="contract.internal_status", read_only=True
    )

    def get_created_by_username(self, obj):
        if not obj.created_by_id:
            return None
        user = obj.created_by
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username

    class Meta:
        model = Payment
        fields = [
            "id",
            "contract",
            "organization_name",
            "contract_internal_status",
            "amount",
            "status",
            "external_reference",
            "confirmed_at",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
