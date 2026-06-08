from rest_framework import serializers

from organizations.models import Organization


class OrganizationSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Organization
        fields = ["id", "name", "code", "is_active", "user_count", "created_at", "updated_at"]
        read_only_fields = ["id", "user_count", "created_at", "updated_at"]
