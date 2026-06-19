import re

from rest_framework import serializers


REGISTRATION_PATTERN = re.compile(r"^[A-Z0-9-]+$")


class AssStockQrSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["mock", "real"])
    operation_status = serializers.CharField(allow_blank=True)
    operation_message = serializers.CharField(allow_blank=True)
    # La sandbox peut renvoyer -1 (aucun stock alloue) : pas de min_value.
    available_qr = serializers.IntegerField(allow_null=True)
    alert_threshold = serializers.IntegerField()
    low_stock = serializers.BooleanField()
    raw_response = serializers.DictField()


class AssVerifyRegistrationRequestSerializer(serializers.Serializer):
    immatriculation = serializers.CharField(max_length=50, trim_whitespace=True)

    def validate_immatriculation(self, value):
        if not value:
            raise serializers.ValidationError("Immatriculation requise.")
        normalized = value.upper()
        if not REGISTRATION_PATTERN.fullmatch(normalized):
            raise serializers.ValidationError(
                "L'immatriculation accepte uniquement les lettres, les chiffres et les tirets."
            )
        return normalized


class AssVehicleDataSerializer(serializers.Serializer):
    brand = serializers.CharField(allow_blank=True)
    model = serializers.CharField(allow_blank=True)
    category = serializers.CharField(allow_blank=True)
    subcategory = serializers.CharField(allow_blank=True)
    registration = serializers.CharField(allow_blank=True)
    chassis = serializers.CharField(allow_blank=True)
    energy = serializers.CharField(allow_blank=True)
    fiscalPower = serializers.CharField(allow_blank=True)
    seats = serializers.CharField(allow_blank=True)
    firstCirculationDate = serializers.CharField(allow_blank=True)
    newValue = serializers.CharField(allow_blank=True)
    currentValue = serializers.CharField(allow_blank=True)
    cylindree = serializers.CharField(allow_blank=True)
    motoUsage = serializers.CharField(allow_blank=True)


class AssVerifyRegistrationSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["mock", "real"])
    operation_status = serializers.CharField(allow_blank=True)
    operation_message = serializers.CharField(allow_blank=True)
    immatriculation = serializers.CharField(allow_blank=True)
    is_registered = serializers.BooleanField(allow_null=True)
    vehicle = AssVehicleDataSerializer(allow_null=True)
    raw_response = serializers.DictField()
