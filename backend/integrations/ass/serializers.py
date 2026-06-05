from rest_framework import serializers


class AssStockQrSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["mock", "real"])
    operation_status = serializers.CharField(allow_blank=True)
    operation_message = serializers.CharField(allow_blank=True)
    available_qr = serializers.IntegerField(min_value=0, allow_null=True)
    raw_response = serializers.DictField()


class AssVerifyRegistrationRequestSerializer(serializers.Serializer):
    immatriculation = serializers.CharField(max_length=50, trim_whitespace=True)

    def validate_immatriculation(self, value):
        if not value:
            raise serializers.ValidationError("Immatriculation requise.")
        return value.upper()


class AssVerifyRegistrationSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["mock", "real"])
    operation_status = serializers.CharField(allow_blank=True)
    operation_message = serializers.CharField(allow_blank=True)
    immatriculation = serializers.CharField(allow_blank=True)
    is_registered = serializers.BooleanField(allow_null=True)
    raw_response = serializers.DictField()
