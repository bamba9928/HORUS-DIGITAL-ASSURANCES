import re
from uuid import uuid4

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import URLValidator
from django.db import transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import serializers

from accounts.models import User
from organizations.models import Organization


SENEGAL_PHONE_PATTERN = re.compile(r"^7\d{8}$")
ORGANIZATION_CODE_PATTERN = re.compile(r"^[A-Z0-9-]+$")
CONTACT_ROLES = [
    User.Role.ADMIN_GROUP,
    User.Role.CONTRIBUTOR,
    User.Role.FINANCE,
]


def normalize_senegal_phone(value):
    compact = re.sub(r"[\s().-]", "", str(value or "").strip())
    if compact.startswith("+221"):
        compact = compact[4:]
    elif compact.startswith("00221"):
        compact = compact[5:]
    elif compact.startswith("221") and len(compact) == 12:
        compact = compact[3:]
    if not SENEGAL_PHONE_PATTERN.fullmatch(compact):
        raise serializers.ValidationError(
            "Le téléphone doit correspondre au format sénégalais +221 7X XXX XX XX."
        )
    return f"+221{compact}"


def local_phone(value):
    normalized = normalize_senegal_phone(value)
    return normalized.removeprefix("+221")


class OrganizationSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(read_only=True, default=0)
    legal_person_type = serializers.ChoiceField(
        choices=Organization.LegalPersonType.choices,
        required=True,
    )
    organization_type = serializers.ChoiceField(
        choices=Organization.OrganizationType.choices,
        required=True,
    )
    status = serializers.ChoiceField(
        choices=Organization.Status.choices,
        required=True,
    )
    country = serializers.CharField(required=True, allow_blank=False)
    currency = serializers.ChoiceField(choices=["FCFA"], required=True)
    address = serializers.CharField(required=True, allow_blank=False)
    city = serializers.CharField(required=True, allow_blank=False)
    phone = serializers.CharField(required=True, allow_blank=False, max_length=30)
    professional_email = serializers.EmailField(required=True, allow_blank=False)
    website = serializers.CharField(required=False, allow_blank=True, max_length=200)
    contact_phone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    contact_role = serializers.ChoiceField(
        choices=CONTACT_ROLES,
        required=False,
        allow_blank=True,
    )
    contact_temporary_password = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "code",
            "legal_person_type",
            "organization_type",
            "status",
            "is_active",
            "description",
            "legal_form",
            "ninea_rccm",
            "insurance_license_number",
            "country",
            "currency",
            "address",
            "city",
            "region",
            "phone",
            "professional_email",
            "website",
            "contact_first_name",
            "contact_last_name",
            "contact_email",
            "contact_phone",
            "contact_role",
            "contact_username",
            "contact_access_mode",
            "contact_temporary_password",
            "user_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_active",
            "contact_username",
            "user_count",
            "created_at",
            "updated_at",
        ]

    def validate_code(self, value):
        normalized = value.strip().upper()
        if not ORGANIZATION_CODE_PATTERN.fullmatch(normalized):
            raise serializers.ValidationError(
                "Le code accepte uniquement les lettres, chiffres et tirets."
            )
        return normalized

    def validate_phone(self, value):
        return normalize_senegal_phone(value)

    def validate_contact_phone(self, value):
        return normalize_senegal_phone(value) if value else ""

    def validate_professional_email(self, value):
        return value.strip().lower()

    def validate_contact_email(self, value):
        return value.strip().lower()

    def validate_website(self, value):
        if not value:
            return ""
        normalized = value.strip()
        if not re.match(r"^https?://", normalized, flags=re.IGNORECASE):
            normalized = f"https://{normalized}"
        try:
            URLValidator()(normalized)
        except DjangoValidationError as exc:
            raise serializers.ValidationError("Le site web est invalide.") from exc
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)
        mode = attrs.get(
            "contact_access_mode",
            getattr(self.instance, "contact_access_mode", Organization.ContactAccessMode.NONE),
        )
        previous_mode = (
            self.instance.contact_access_mode
            if self.instance
            else Organization.ContactAccessMode.NONE
        )
        should_provision = (
            mode != Organization.ContactAccessMode.NONE
            and (not self.instance or previous_mode == Organization.ContactAccessMode.NONE)
        )
        temporary_password = attrs.pop("contact_temporary_password", "")

        if mode != Organization.ContactAccessMode.NONE:
            required_contact_fields = [
                "contact_first_name",
                "contact_last_name",
                "contact_email",
                "contact_phone",
                "contact_role",
            ]
            missing = [
                field
                for field in required_contact_fields
                if not attrs.get(field, getattr(self.instance, field, "") if self.instance else "")
            ]
            if missing:
                raise serializers.ValidationError(
                    {
                        field: "Ce champ est obligatoire pour créer l'accès du contact."
                        for field in missing
                    }
                )

        if mode == Organization.ContactAccessMode.TEMPORARY_PASSWORD:
            if not should_provision:
                attrs["_skip_contact_provisioning"] = True
            elif not temporary_password:
                raise serializers.ValidationError(
                    {"contact_temporary_password": "Le mot de passe temporaire est obligatoire."}
                )
            else:
                reference_user = User(
                    email=attrs.get("contact_email", ""),
                    first_name=attrs.get("contact_first_name", ""),
                    last_name=attrs.get("contact_last_name", ""),
                )
                try:
                    validate_password(temporary_password, user=reference_user)
                except DjangoValidationError as exc:
                    raise serializers.ValidationError(
                        {"contact_temporary_password": list(exc.messages)}
                    ) from exc
                attrs["_contact_temporary_password"] = temporary_password

        if should_provision and not attrs.get("_skip_contact_provisioning"):
            email = attrs.get(
                "contact_email",
                getattr(self.instance, "contact_email", "") if self.instance else "",
            )
            phone = attrs.get(
                "contact_phone",
                getattr(self.instance, "contact_phone", "") if self.instance else "",
            )
            if User.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError(
                    {"contact_email": "Un compte utilise déjà cet email."}
                )
            if User.objects.filter(phone=local_phone(phone)).exists():
                raise serializers.ValidationError(
                    {"contact_phone": "Un compte utilise déjà ce téléphone."}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("_contact_temporary_password", "")
        validated_data.pop("_skip_contact_provisioning", None)
        organization = super().create(validated_data)
        self._provision_contact_account(organization, password)
        return organization

    @transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop("_contact_temporary_password", "")
        skip_provisioning = validated_data.pop("_skip_contact_provisioning", False)
        previous_mode = instance.contact_access_mode
        organization = super().update(instance, validated_data)
        if (
            not skip_provisioning
            and previous_mode == Organization.ContactAccessMode.NONE
            and organization.contact_access_mode != Organization.ContactAccessMode.NONE
        ):
            self._provision_contact_account(organization, password)
        return organization

    def _provision_contact_account(self, organization, temporary_password):
        if organization.contact_access_mode == Organization.ContactAccessMode.NONE:
            return

        username = self._generate_contact_username(organization)
        user = User(
            username=username,
            first_name=organization.contact_first_name,
            last_name=organization.contact_last_name,
            email=organization.contact_email,
            phone=local_phone(organization.contact_phone),
            role=organization.contact_role,
            organization=organization,
        )
        if organization.contact_access_mode == Organization.ContactAccessMode.TEMPORARY_PASSWORD:
            user.set_password(temporary_password)
        else:
            user.set_unusable_password()
        user.full_clean()
        user.save()
        organization.contact_username = username
        organization.save(update_fields=["contact_username"])
        organization.user_count = organization.users.count()

        if organization.contact_access_mode == Organization.ContactAccessMode.EMAIL_INVITATION:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            invitation_url = (
                f"{settings.FRONTEND_BASE_URL.rstrip('/')}"
                f"/invite?uid={uid}&token={token}"
            )
            send_mail(
                subject="Invitation Horus Assurances Digital",
                message=(
                    f"Bonjour {user.first_name or user.last_name},\n\n"
                    "Votre compte Horus Assurances Digital a été créé. "
                    f"Votre identifiant est {user.username}. "
                    f"Définissez votre mot de passe ici : {invitation_url}\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

    def _generate_contact_username(self, organization):
        base = f"contact-{organization.code.lower()}"
        if not User.objects.filter(username__iexact=base).exists():
            return base
        return f"{base}-{uuid4().hex[:8]}"
