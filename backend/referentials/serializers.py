from rest_framework import serializers

from integrations.vehicle_data.brands import base_brand_by_value, brand_value, normalize_brand_label
from referentials.models import VehicleBrand


class VehicleBrandAdminSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)
    duplicate_of_base = serializers.SerializerMethodField()

    class Meta:
        model = VehicleBrand
        fields = [
            "id",
            "value",
            "name",
            "is_custom",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_by",
            "updated_by_username",
            "updated_at",
            "duplicate_of_base",
        ]
        read_only_fields = [
            "id",
            "value",
            "is_custom",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_by",
            "updated_by_username",
            "updated_at",
            "duplicate_of_base",
        ]

    def get_duplicate_of_base(self, obj):
        return brand_value(obj.name) in base_brand_by_value()

    def validate_name(self, value):
        normalized = normalize_brand_label(value)
        if not normalized:
            raise serializers.ValidationError("Marque requise.")

        normalized_value = brand_value(normalized)
        if normalized_value in base_brand_by_value():
            raise serializers.ValidationError("Cette marque existe deja dans le referentiel de base.")
        if VehicleBrand.objects.exclude(pk=self.instance.pk).filter(value=normalized_value).exists():
            raise serializers.ValidationError("Cette marque personnalisee existe deja.")
        return normalized

    def update(self, instance, validated_data):
        actor = self.context["request"].user
        name = validated_data.get("name", instance.name)
        instance.name = name
        instance.value = brand_value(name)
        instance.updated_by = actor
        instance.save(update_fields=["name", "value", "updated_by", "updated_at"])
        return instance
