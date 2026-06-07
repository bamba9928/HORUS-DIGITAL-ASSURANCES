from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from organizations.models import Organization


class AuthLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class UserReadSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    has_configured_commission = serializers.BooleanField(read_only=True)
    role = serializers.SerializerMethodField()

    def get_role(self, user):
        if user.is_admin_general:
            return User.Role.ADMIN_GENERAL
        return user.role

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "role",
            "organization",
            "organization_name",
            "commission_percent_on_prime_rc",
            "commission_fixed_on_policy_fee",
            "has_configured_commission",
            "is_active",
            "date_joined",
        ]
        read_only_fields = fields


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "first_name",
            "last_name",
            "email",
            "role",
            "organization",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        actor = self.context["request"].user
        role = attrs.get("role", User.Role.CONTRIBUTOR)
        organization = attrs.get("organization")

        if actor.is_admin_group:
            if role in {User.Role.ADMIN_GENERAL, User.Role.ADMIN_GROUP}:
                raise serializers.ValidationError(
                    {"role": "Un admin groupe ne peut creer que des comptes apporteur ou finance."}
                )
            if not actor.organization_id:
                raise serializers.ValidationError("Admin groupe sans groupe rattache.")
            if organization and organization.id != actor.organization_id:
                raise serializers.ValidationError(
                    {"organization": "Un admin groupe ne peut creer que dans son propre groupe."}
                )
            attrs["organization"] = actor.organization
        elif actor.is_admin_general:
            if role != User.Role.ADMIN_GENERAL and organization is None:
                raise serializers.ValidationError(
                    {"organization": "Le groupe est requis pour ce type de compte."}
                )
        else:
            raise serializers.ValidationError("Permission refusee.")

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.full_clean()
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "email",
            "role",
            "organization",
            "is_active",
        ]

    def validate(self, attrs):
        actor = self.context["request"].user
        target = self.instance
        role = attrs.get("role", target.role)
        organization = attrs.get("organization", target.organization)

        if actor.is_admin_group:
            if role in {User.Role.ADMIN_GENERAL, User.Role.ADMIN_GROUP}:
                raise serializers.ValidationError(
                    {"role": "Un admin groupe ne peut pas definir ce role."}
                )
            if not actor.organization_id:
                raise serializers.ValidationError("Admin groupe sans groupe rattache.")
            if organization is None or organization.id != actor.organization_id:
                raise serializers.ValidationError(
                    {"organization": "Un admin groupe ne peut gerer que son propre groupe."}
                )
        elif actor.is_admin_general:
            if role != User.Role.ADMIN_GENERAL and organization is None:
                raise serializers.ValidationError(
                    {"organization": "Le groupe est requis pour ce type de compte."}
                )
        else:
            raise serializers.ValidationError("Permission refusee.")

        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save()
        return instance


class UserCommissionSerializer(serializers.ModelSerializer):
    has_configured_commission = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "commission_percent_on_prime_rc",
            "commission_fixed_on_policy_fee",
            "has_configured_commission",
            "commission_configured_by",
            "commission_configured_at",
        ]
        read_only_fields = [
            "id",
            "username",
            "has_configured_commission",
            "commission_configured_by",
            "commission_configured_at",
        ]

    def validate_commission_fixed_on_policy_fee(self, value):
        if value is not None and value > settings.ASS_POLICY_FEE:
            raise serializers.ValidationError(
                f"La commission fixe sur cout de police ne peut pas depasser {settings.ASS_POLICY_FEE} FCFA."
            )
        return value

    def update(self, instance, validated_data):
        actor = self.context["request"].user
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.commission_configured_by = actor
        instance.commission_configured_at = timezone.now()
        try:
            instance.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
        instance.save(
            update_fields=[
                "commission_percent_on_prime_rc",
                "commission_fixed_on_policy_fee",
                "commission_configured_by",
                "commission_configured_at",
            ]
        )
        return instance
