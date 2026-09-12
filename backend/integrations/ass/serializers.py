import re

from rest_framework import serializers

from integrations.ass.registrations import format_registration, normalize_registration


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
    # Date d'effet du contrat en cours de saisie : permet au controle AAS
    # Diotali de laisser passer un vehicule dont l'assurance existante aura
    # expire avant cette date. Absente tant que le formulaire n'est pas encore
    # arrive a la couverture -> bloque par defaut dans ce cas (voir
    # integrations/aas_diotali/service.check_vehicule).
    date_effet = serializers.DateField(required=False, allow_null=True)

    def validate_immatriculation(self, value):
        if not value:
            raise serializers.ValidationError("Immatriculation requise.")
        if not REGISTRATION_PATTERN.fullmatch(value.upper()):
            raise serializers.ValidationError(
                "L'immatriculation accepte uniquement les lettres, les chiffres et les tirets."
            )
        if not normalize_registration(value):
            raise serializers.ValidationError("Immatriculation requise.")
        # Forme canonique des ici : « AA-917-VL » et « AA917VL » designent le
        # meme vehicule et doivent donner la MEME reponse, echo compris.
        return format_registration(value)


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


class AasDiotaliDetailsSerializer(serializers.Serializer):
    immatriculation = serializers.CharField(allow_blank=True)
    brand = serializers.CharField(allow_blank=True)
    model = serializers.CharField(allow_blank=True)
    attestation_number = serializers.CharField(allow_blank=True)
    date_effet = serializers.CharField(allow_blank=True)
    date_echeance = serializers.CharField(allow_blank=True)


class AssVerifyRegistrationSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["mock", "real"])
    operation_status = serializers.CharField(allow_blank=True)
    operation_message = serializers.CharField(allow_blank=True)
    immatriculation = serializers.CharField(allow_blank=True)
    is_registered = serializers.BooleanField(allow_null=True)
    vehicle = AssVehicleDataSerializer(allow_null=True)
    # Contrat existant trouve par AAS Diotali (marque/modele/attestation/dates) :
    # None quand le vehicule est libre. Sert a l'alerte de blocage cote front.
    details = AasDiotaliDetailsSerializer(allow_null=True, required=False)
    raw_response = serializers.DictField()
