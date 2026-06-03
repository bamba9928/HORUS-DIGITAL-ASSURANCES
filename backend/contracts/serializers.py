from django.conf import settings
from rest_framework import serializers

from accounts.models import User
from contracts.models import Contract
from organizations.models import Organization


class ContractDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contract
        fields = [
            "id",
            "contract_type",
            "internal_status",
            "draft_payload",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "internal_status", "created_at", "updated_at"]

    def validate_contract_type(self, value):
        enabled_types = {
            Contract.ContractType.AUTO_MONO,
            Contract.ContractType.MOTO,
            Contract.ContractType.FLEET,
        }
        if value not in enabled_types:
            raise serializers.ValidationError("Ce type de contrat n'est pas encore actif.")
        return value

    def validate(self, attrs):
        contract_type = attrs.get("contract_type", getattr(self.instance, "contract_type", None))
        draft_payload = attrs.get("draft_payload", getattr(self.instance, "draft_payload", {}))
        if contract_type == Contract.ContractType.FLEET:
            self._validate_fleet_payload(draft_payload)
        return attrs

    def _validate_fleet_payload(self, draft_payload):
        fleet = draft_payload.get("fleet") if isinstance(draft_payload, dict) else None
        vehicles = fleet.get("vehicles") if isinstance(fleet, dict) else None
        if not isinstance(vehicles, list) or not vehicles:
            raise serializers.ValidationError(
                {"draft_payload": "Une flotte doit contenir au moins un vehicule."}
            )

        vehicle_ids = set()
        for vehicle in vehicles:
            vehicle_id = vehicle.get("id") if isinstance(vehicle, dict) else None
            if not vehicle_id:
                raise serializers.ValidationError(
                    {"draft_payload": "Chaque vehicule de flotte doit avoir un identifiant."}
                )
            vehicle_ids.add(vehicle_id)

        for vehicle in vehicles:
            trailers = vehicle.get("trailers", [])
            if not isinstance(trailers, list):
                raise serializers.ValidationError(
                    {"draft_payload": "Les remorques doivent etre une liste."}
                )
            for trailer in trailers:
                tractor_id = trailer.get("tractorVehicleId") if isinstance(trailer, dict) else None
                if tractor_id not in vehicle_ids:
                    raise serializers.ValidationError(
                        {
                            "draft_payload": (
                                "Chaque remorque doit etre rattachee a un vehicule tracteur "
                                "existant dans la flotte."
                            )
                        }
                    )
                if tractor_id != vehicle.get("id"):
                    raise serializers.ValidationError(
                        {"draft_payload": "Une remorque doit rester dans la carte de son tracteur."}
                    )

    def create(self, validated_data):
        request = self.context.get("request")
        organization, contributor = self._resolve_owner(request)
        return Contract.objects.create(
            organization=organization,
            contributor=contributor,
            internal_status=Contract.InternalStatus.DRAFT,
            **validated_data,
        )

    def _resolve_owner(self, request):
        if request and request.user and request.user.is_authenticated:
            if not request.user.organization_id:
                raise serializers.ValidationError("Utilisateur sans groupe rattache.")
            return request.user.organization, request.user

        if not settings.DEBUG:
            raise serializers.ValidationError("Authentification requise.")

        organization, _ = Organization.objects.get_or_create(
            code="DEMO",
            defaults={"name": "Groupe Demo Horus"},
        )
        contributor, _ = User.objects.get_or_create(
            username="demo-apporteur",
            defaults={
                "role": User.Role.CONTRIBUTOR,
                "organization": organization,
                "commission_percent_on_prime_rc": 0,
                "commission_fixed_on_policy_fee": 0,
            },
        )
        if contributor.organization_id != organization.id:
            contributor.organization = organization
            contributor.save(update_fields=["organization"])
        return organization, contributor
