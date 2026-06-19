from django.conf import settings
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.utils import timezone
from rest_framework import serializers
import re

from accounts.models import User
from organizations.models import Organization


ACCOUNT_PHONE_PATTERN = re.compile(r"^7\d{8}$")


def normalize_account_phone(value):
    normalized = re.sub(r"[\s().-]", "", str(value or "").strip())
    if normalized and not ACCOUNT_PHONE_PATTERN.fullmatch(normalized):
        raise serializers.ValidationError(
            "Le téléphone doit contenir exactement 9 chiffres et commencer par 7."
        )
    return normalized


class AuthLoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=False, allow_blank=False)
    username = serializers.CharField(
        required=False,
        allow_blank=False,
        write_only=True,
    )
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs.get("identifier") or attrs.get("username")
        if not identifier:
            raise serializers.ValidationError(
                {"identifier": "L'identifiant, l'email ou le téléphone est obligatoire."}
            )
        identifier = identifier.strip()
        compact_phone = re.sub(r"[\s().-]", "", identifier)
        if ACCOUNT_PHONE_PATTERN.fullmatch(compact_phone):
            identifier = compact_phone
        attrs["identifier"] = identifier
        return attrs


class AccountIdentityValidationMixin:
    def validate_email(self, value):
        normalized = str(value or "").strip().lower()
        if not normalized:
            return ""
        queryset = User.objects.filter(email__iexact=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Cette adresse email est déjà utilisée.")
        return normalized

    def validate_phone(self, value):
        normalized = normalize_account_phone(value)
        if not normalized:
            return ""
        queryset = User.objects.filter(phone=normalized)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ce numéro de téléphone est déjà utilisé.")
        return normalized


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
            "phone",
            "address",
            "matricule",
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


class UserCreateSerializer(AccountIdentityValidationMixin, serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
    )
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
            "phone",
            "address",
            "matricule",
            "role",
            "organization",
        ]
        read_only_fields = ["id", "matricule"]

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

        self._validate_password_strength(attrs)
        return attrs

    def _validate_password_strength(self, attrs):
        # Applique AUTH_PASSWORD_VALIDATORS (mots de passe communs, similarite
        # avec l'identifiant, etc.) — le hash n'etant pas encore pose,
        # full_clean() ne les verifie pas.
        password = attrs.get("password")
        if not password:
            return
        reference_user = User(
            username=attrs.get("username", ""),
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        try:
            django_validate_password(password, user=reference_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.full_clean()
        user.save()
        return user


class UserUpdateSerializer(AccountIdentityValidationMixin, serializers.ModelSerializer):
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
    )
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
            "phone",
            "address",
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
            if (
                "role" in attrs
                and role != target.role
                and role in {User.Role.ADMIN_GENERAL, User.Role.ADMIN_GROUP}
            ):
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
        # Exclure password : il n'est jamais modifié ici et sa validation
        # ferait échouer full_clean si le hash est vide (compte de test, etc.)
        instance.full_clean(exclude=["password"])
        instance.save(update_fields=list(validated_data.keys()))
        return instance


class ProfileUpdateSerializer(AccountIdentityValidationMixin, serializers.ModelSerializer):
    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
    )

    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "phone", "address"]

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean(exclude=["password"])
        instance.save(update_fields=list(validated_data.keys()))
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate_new_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError(
                "Le nouveau mot de passe doit contenir au moins 8 caractères."
            )
        try:
            django_validate_password(value, user=self.context["request"].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class AcceptInvitationSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist) as exc:
            raise serializers.ValidationError("Invitation invalide ou expirée.") from exc

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError("Invitation invalide ou expirée.")
        try:
            django_validate_password(attrs["password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        attrs["user"] = user
        return attrs


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
            instance.full_clean(exclude=["password"])
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
