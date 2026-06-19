from copy import deepcopy
import re

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from contracts.models import Contract
from contracts.services import extract_rc_breakdown, validate_guarantee_configuration


PHONE_PATTERN = re.compile(r"^7\d{0,8}$")
REGISTRATION_PATTERN = re.compile(r"^[A-Z0-9-]+$")
PHONE_FIELDS = {"phone", "cellulaire", "telephone"}
REGISTRATION_FIELDS = {"registration", "immatriculation"}
FLEET_COVERAGE_FIELDS = {"effectDate", "duration", "periodicity", "personType"}


class FleetCoverageSerializer(serializers.Serializer):
    effectDate = serializers.DateField(
        error_messages={
            "invalid": "La date d'effet de la flotte est invalide.",
            "required": "La date d'effet de la flotte est obligatoire.",
        }
    )
    duration = serializers.IntegerField(
        min_value=1,
        error_messages={
            "invalid": "La durée de la flotte doit être un nombre entier.",
            "min_value": "La durée de la flotte doit être supérieure à zéro.",
            "required": "La durée de la flotte est obligatoire.",
        },
    )
    periodicity = serializers.ChoiceField(
        choices=["JOUR", "MOIS"],
        error_messages={
            "invalid_choice": "La périodicité de la flotte doit être JOUR ou MOIS.",
            "required": "La périodicité de la flotte est obligatoire.",
        },
    )
    personType = serializers.ChoiceField(
        choices=["PHYSIQUE", "MORALE"],
        error_messages={
            "invalid_choice": "Le type de personne doit être PHYSIQUE ou MORALE.",
            "required": "Le type de personne de la flotte est obligatoire.",
        },
    )

    def validate(self, attrs):
        duration = attrs.get("duration")
        periodicity = attrs.get("periodicity")
        if duration is None or periodicity is None:
            return attrs
        if periodicity == "MOIS" and duration > 12:
            raise serializers.ValidationError(
                {"duration": "La durée mensuelle de la flotte ne peut pas dépasser 12 mois."}
            )
        if periodicity == "JOUR" and duration > 366:
            raise serializers.ValidationError(
                {"duration": "La durée journalière de la flotte ne peut pas dépasser 366 jours."}
            )
        return attrs


def validate_fleet_coverage_for_quote(draft_payload):
    fleet = draft_payload.get("fleet") if isinstance(draft_payload, dict) else None
    coverage_data = _fleet_coverage_data(fleet)
    serializer = FleetCoverageSerializer(data=coverage_data)
    if serializer.is_valid():
        return serializer.validated_data

    messages = [
        str(message)
        for field_messages in serializer.errors.values()
        for message in field_messages
    ]
    raise DjangoValidationError("Couverture flotte invalide : " + " ".join(messages))


def _fleet_coverage_data(fleet):
    if not isinstance(fleet, dict):
        return {}
    return {
        field: fleet[field]
        for field in FLEET_COVERAGE_FIELDS
        if fleet.get(field) not in (None, "")
    }


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
            Contract.ContractType.BUS_SCHOOL,
            Contract.ContractType.GARAGE,
        }
        if value not in enabled_types:
            raise serializers.ValidationError("Ce type de contrat n'est pas encore actif.")
        return value

    def validate(self, attrs):
        contract_type = attrs.get("contract_type", getattr(self.instance, "contract_type", None))
        if "draft_payload" in attrs:
            draft_payload = self._normalize_identity_fields(deepcopy(attrs["draft_payload"]))
            attrs["draft_payload"] = draft_payload
        else:
            draft_payload = getattr(self.instance, "draft_payload", {})
        self._validate_guarantee_payload(draft_payload)
        if contract_type == Contract.ContractType.FLEET:
            self._validate_fleet_payload(draft_payload)
        return attrs

    def _normalize_identity_fields(self, value):
        if isinstance(value, list):
            return [self._normalize_identity_fields(item) for item in value]
        if not isinstance(value, dict):
            return value

        normalized = {}
        for field, item in value.items():
            if field in PHONE_FIELDS and item not in (None, ""):
                if not isinstance(item, str):
                    raise serializers.ValidationError(
                        {"draft_payload": "Le téléphone doit contenir uniquement des chiffres."}
                    )
                item = item.strip()
                if not PHONE_PATTERN.fullmatch(item):
                    raise serializers.ValidationError(
                        {
                            "draft_payload": (
                                "Le téléphone doit commencer par 7 et contenir au maximum "
                                "9 chiffres."
                            )
                        }
                    )
            elif field in REGISTRATION_FIELDS and item not in (None, ""):
                if not isinstance(item, str):
                    raise serializers.ValidationError(
                        {
                            "draft_payload": (
                                "L'immatriculation accepte uniquement les lettres, "
                                "les chiffres et les tirets."
                            )
                        }
                    )
                item = item.strip().upper()
                if not REGISTRATION_PATTERN.fullmatch(item):
                    raise serializers.ValidationError(
                        {
                            "draft_payload": (
                                "L'immatriculation accepte uniquement les lettres, "
                                "les chiffres et les tirets."
                            )
                        }
                    )
            normalized[field] = self._normalize_identity_fields(item)
        return normalized

    def _validate_guarantee_payload(self, draft_payload):
        try:
            validate_guarantee_configuration(draft_payload)
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            raise serializers.ValidationError({"draft_payload": message}) from exc

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

        coverage = FleetCoverageSerializer(
            data=_fleet_coverage_data(fleet),
            partial=True,
        )
        if not coverage.is_valid():
            messages = [
                str(message)
                for field_messages in coverage.errors.values()
                for message in field_messages
            ]
            raise serializers.ValidationError(
                {"draft_payload": "Couverture flotte invalide : " + " ".join(messages)}
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
        if not request or not request.user or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentification requise.")

        if not request.user.organization_id:
            raise serializers.ValidationError("Utilisateur sans groupe rattache.")
        return request.user.organization, request.user


class ContractListSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    contributor_username = serializers.CharField(source="contributor.username", read_only=True)
    contributor_full_name = serializers.SerializerMethodField()
    vehicle_label = serializers.SerializerMethodField()
    policy_number = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client_phone = serializers.SerializerMethodField()
    effect_date = serializers.SerializerMethodField()

    def get_contributor_full_name(self, obj):
        user = obj.contributor
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username

    class Meta:
        model = Contract
        fields = [
            "id",
            "contract_type",
            "internal_status",
            "ass_status",
            "organization",
            "organization_name",
            "contributor",
            "contributor_username",
            "contributor_full_name",
            "vehicle_label",
            "policy_number",
            "client_name",
            "client_phone",
            "effect_date",
            "prime_rc_ass",
            "cout_police_ass",
            "ttc_ass",
            "immatriculation",
            "attestation_number",
            "reference_externe",
            "date_expiration",
            "link_attestation_digitale",
            "link_attestation_cedeao",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_vehicle_label(self, contract):
        if contract.contract_type == Contract.ContractType.FLEET:
            vehicles = (
                contract.draft_payload.get("fleet", {}).get("vehicles", [])
                if isinstance(contract.draft_payload, dict)
                else []
            )
            count = len(vehicles) if isinstance(vehicles, list) else 0
            return f"{count} vehicule(s)"

        vehicle = (
            contract.draft_payload.get("vehicle", {})
            if isinstance(contract.draft_payload, dict)
            else {}
        )
        if not isinstance(vehicle, dict):
            return ""
        label_parts = [
            vehicle.get("brand"),
            vehicle.get("model"),
            vehicle.get("registration") or contract.immatriculation,
        ]
        return " ".join(str(part) for part in label_parts if part)

    def get_policy_number(self, contract):
        issue_payload = self._as_dict(contract.ass_issue_request_payload)
        fleet_payload = self._as_dict(issue_payload.get("flotte"))
        return self._first_text(
            issue_payload.get("police"),
            fleet_payload.get("police"),
        )

    def get_client_name(self, contract):
        draft_payload = self._as_dict(contract.draft_payload)
        client = self._as_dict(
            draft_payload.get("policyholder") or draft_payload.get("souscripteur")
        )
        first_name = self._first_text(
            client.get("firstName"),
            client.get("first_name"),
            client.get("prenom"),
        )
        last_name = self._first_text(
            client.get("lastName"),
            client.get("last_name"),
            client.get("nom"),
            client.get("raisonSociale"),
        )
        return " ".join(part for part in [first_name, last_name] if part)

    def get_client_phone(self, contract):
        draft_payload = self._as_dict(contract.draft_payload)
        client = self._as_dict(
            draft_payload.get("policyholder") or draft_payload.get("souscripteur")
        )
        return self._first_text(
            client.get("phone"),
            client.get("cellulaire"),
            client.get("telephone"),
        )

    def get_effect_date(self, contract):
        draft_payload = self._as_dict(contract.draft_payload)
        if contract.contract_type == Contract.ContractType.FLEET:
            fleet = self._as_dict(draft_payload.get("fleet"))
            vehicles = fleet.get("vehicles")
            first_vehicle = (
                self._as_dict(vehicles[0])
                if isinstance(vehicles, list) and vehicles
                else {}
            )
            effect_date = self._first_text(
                fleet.get("effectDate"),
                fleet.get("dateEffet"),
                first_vehicle.get("effectDate"),
                first_vehicle.get("dateEffet"),
            )
        elif contract.contract_type == Contract.ContractType.GARAGE:
            garage = self._as_dict(draft_payload.get("garage"))
            effect_date = self._first_text(
                garage.get("effectDate"),
                garage.get("dateEffet"),
            )
        else:
            vehicle = self._as_dict(draft_payload.get("vehicle"))
            effect_date = self._first_text(
                vehicle.get("effectDate"),
                vehicle.get("dateEffet"),
            )

        if effect_date:
            return effect_date

        issue_payload = self._as_dict(contract.ass_issue_request_payload)
        fleet_payload = self._as_dict(issue_payload.get("flotte"))
        return self._first_text(
            issue_payload.get("dateEffet"),
            fleet_payload.get("dateEffet"),
        )

    @staticmethod
    def _as_dict(value):
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _first_text(*values):
        for value in values:
            if value is not None and str(value).strip():
                return str(value).strip()
        return ""


class ContractDetailSerializer(ContractListSerializer):
    payments = serializers.SerializerMethodField()
    commission_snapshot = serializers.SerializerMethodField()
    ass_attestations = serializers.SerializerMethodField()
    quote_breakdown = serializers.SerializerMethodField()

    class Meta(ContractListSerializer.Meta):
        fields = ContractListSerializer.Meta.fields + [
            "draft_payload",
            "payments",
            "commission_snapshot",
            "ass_attestations",
            "quote_breakdown",
        ]

    def get_payments(self, contract):
        return [
            {
                "id": payment.id,
                "amount": payment.amount,
                "status": payment.status,
                "external_reference": payment.external_reference,
                "confirmed_at": payment.confirmed_at,
                "created_at": payment.created_at,
                "created_by_username": payment.created_by.username if payment.created_by_id else None,
            }
            for payment in contract.payments.all()
        ]

    def get_commission_snapshot(self, contract):
        snapshot = getattr(contract, "commission_snapshot", None)
        if snapshot is None:
            return None
        return {
            "id": snapshot.id,
            "status": snapshot.status,
            "prime_rc_ass": snapshot.prime_rc_ass,
            "cout_police_ass": snapshot.cout_police_ass,
            "ttc_ass": snapshot.ttc_ass,
            "commission_percent_used": snapshot.commission_percent_used,
            "commission_fixed_policy_fee_used": snapshot.commission_fixed_policy_fee_used,
            "commission_prime_rc_amount": snapshot.commission_prime_rc_amount,
            "commission_policy_fee_amount": snapshot.commission_policy_fee_amount,
            "commission_total": snapshot.commission_total,
            "net_to_horus": snapshot.net_to_horus,
            "created_at": snapshot.created_at,
        }

    def get_ass_attestations(self, contract):
        if contract.contract_type == Contract.ContractType.FLEET:
            return self._get_fleet_attestations(contract)

        if not contract.attestation_number and not contract.reference_externe:
            return []

        return [
            self._build_attestation_item(
                kind="VEHICLE",
                label=self.get_vehicle_label(contract) or "Vehicule",
                immatriculation=contract.immatriculation,
                data={
                    "referenceExterne": contract.reference_externe,
                    "attestationNumber": contract.attestation_number,
                    "dateExpiration": contract.date_expiration.isoformat()
                    if contract.date_expiration
                    else None,
                    "linkAttestation": contract.link_attestation_digitale,
                    "linkCarteBrune": contract.link_attestation_cedeao,
                },
            )
        ]

    def _get_fleet_attestations(self, contract):
        issue_payload = contract.ass_issue_request_payload or {}
        response_payload = contract.ass_issue_response_payload or {}
        fleet_request_items = (
            issue_payload.get("flotte", {}).get("items", [])
            if isinstance(issue_payload.get("flotte"), dict)
            else issue_payload.get("items", [])
        )
        fleet_response_items = (
            response_payload.get("flotte", {}).get("items", [])
            if isinstance(response_payload.get("flotte"), dict)
            else response_payload.get("items", [])
        )
        trailer_requests = issue_payload.get("remorques", [])
        trailer_responses = response_payload.get("remorques", [])

        attestations = []
        request_by_reference = self._index_request_items_by_reference(fleet_request_items)
        for item in fleet_response_items if isinstance(fleet_response_items, list) else []:
            if not isinstance(item, dict):
                continue
            request_item = request_by_reference.get(item.get("referenceExterne"), {})
            vehicle = request_item.get("vehicule", {}) if isinstance(request_item, dict) else {}
            attestations.append(
                self._build_attestation_item(
                    kind="VEHICLE",
                    label=self._vehicle_label(vehicle),
                    immatriculation=item.get("immatriculation")
                    or vehicle.get("immatriculation", ""),
                    data=item,
                )
            )

        trailer_request_by_reference = self._index_request_items_by_reference(trailer_requests)
        for response in trailer_responses if isinstance(trailer_responses, list) else []:
            data = response.get("data") if isinstance(response, dict) else None
            if not isinstance(data, dict):
                continue
            request_item = trailer_request_by_reference.get(data.get("referenceExterne"), {})
            label = "Remorque"
            immatriculation = data.get("immatriculation", "")
            if isinstance(request_item, dict):
                label = self._trailer_label(request_item)
                immatriculation = immatriculation or request_item.get("immatriculation", "")
            attestations.append(
                self._build_attestation_item(
                    kind="TRAILER",
                    label=label,
                    immatriculation=immatriculation,
                    data=data,
                )
            )

        return attestations

    def _index_request_items_by_reference(self, request_items):
        if not isinstance(request_items, list):
            return {}
        return {
            item.get("referenceTrxPartner"): item
            for item in request_items
            if isinstance(item, dict) and item.get("referenceTrxPartner")
        }

    def _build_attestation_item(self, *, kind, label, immatriculation, data):
        # secureKey n'est jamais exposee ("a ignorer" selon la doc ASS).
        return {
            "kind": kind,
            "label": label,
            "immatriculation": immatriculation or "",
            "reference_externe": data.get("referenceExterne", "") or "",
            "attestation_number": data.get("attestationNumber", "") or "",
            "date_expiration": data.get("dateExpiration"),
            "link_attestation_digitale": data.get("linkAttestation", "") or "",
            "link_attestation_cedeao": data.get("linkCarteBrune", "") or "",
        }

    def _vehicle_label(self, vehicle):
        if not isinstance(vehicle, dict):
            return "Vehicule"
        parts = [
            vehicle.get("marque"),
            vehicle.get("modele"),
            vehicle.get("immatriculation") or vehicle.get("chassis"),
        ]
        return " ".join(str(part) for part in parts if part) or "Vehicule"

    def _trailer_label(self, trailer):
        parts = [
            "Remorque",
            trailer.get("marque"),
            trailer.get("modele"),
            trailer.get("immatriculation"),
        ]
        return " ".join(str(part) for part in parts if part)

    def get_quote_breakdown(self, contract):
        """
        Re-extrait le detail du tarif ASS depuis ass_response_payload (stocke lors
        du calcul de devis). Permet d'afficher la ventilation de facon persistante.
        Retourne None si aucun devis n'a encore ete calcule.
        """
        if not contract.prime_rc_ass:
            return None
        resp = contract.ass_response_payload
        if not isinstance(resp, dict) or not resp:
            return None

        # Flotte : pas de breakdown unique — on retourne uniquement les totaux
        if contract.contract_type == Contract.ContractType.FLEET:
            return {
                "prime_rc_ass": contract.prime_rc_ass,
                "cout_police": contract.cout_police_ass,
            }

        breakdown = extract_rc_breakdown(resp)
        base = {"prime_rc_ass": contract.prime_rc_ass, "cout_police": contract.cout_police_ass}
        if not breakdown:
            return base
        return {**base, **breakdown}
