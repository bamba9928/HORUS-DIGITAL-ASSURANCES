from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from integrations.ass.client import AssClient, extract_available_qr
from integrations.ass.exceptions import AssConfigurationError, AssIntegrationError
from integrations.ass.referentials import VEHICLE_SUBCATEGORIES
from integrations.ass.serializers import (
    AssStockQrSerializer,
    AssVerifyRegistrationRequestSerializer,
    AssVerifyRegistrationSerializer,
)


class AssStockQrView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not self._can_view_stock(request.user):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

        try:
            ass_response = AssClient().stock_qr({"code": "1000"})
        except AssConfigurationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except AssIntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        available_qr = extract_available_qr(ass_response)
        threshold = settings.ASS_QR_STOCK_ALERT_THRESHOLD
        payload = {
            "mode": "mock" if settings.ASS_MOCK_ENABLED else "real",
            "operation_status": ass_response.get("operationStatus") or ass_response.get("status") or "",
            "operation_message": ass_response.get("operationMessage") or ass_response.get("message") or "",
            "available_qr": available_qr,
            "alert_threshold": threshold,
            "low_stock": available_qr is not None and available_qr <= threshold,
            "raw_response": ass_response,
        }
        serializer = AssStockQrSerializer(payload)
        return Response(serializer.data)

    def _can_view_stock(self, user):
        return user.is_admin_general or user.is_admin_group or user.is_finance


class AssVerifyRegistrationView(APIView):
    permission_classes = [IsAuthenticated]
    # Chaque appel part vers l'API ASS reelle : borne par utilisateur (CGU ASS).
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ass_verify"

    def post(self, request):
        serializer = AssVerifyRegistrationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        immatriculation = serializer.validated_data["immatriculation"]

        try:
            ass_response = AssClient().verify_registration(
                {"immatriculation": immatriculation}
            )
        except AssConfigurationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except AssIntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        payload = {
            "mode": "mock" if settings.ASS_MOCK_ENABLED else "real",
            "operation_status": ass_response.get("operationStatus") or ass_response.get("status") or "",
            "operation_message": ass_response.get("operationMessage") or ass_response.get("message") or "",
            "immatriculation": self._extract_registration(ass_response, immatriculation),
            "is_registered": self._extract_is_registered(ass_response),
            "vehicle": self._extract_vehicle(ass_response),
            "raw_response": ass_response,
        }
        response_serializer = AssVerifyRegistrationSerializer(payload)
        return Response(response_serializer.data)

    def _extract_registration(self, ass_response, fallback):
        data = ass_response.get("data")
        if isinstance(data, dict):
            value = data.get("immatriculation") or data.get("registration")
            if isinstance(value, str):
                return value
        return fallback

    def _extract_is_registered(self, ass_response):
        # Format API reelle (valide en sandbox 2026-06-11) : pas de donnees
        # vehicule, uniquement un code statut :
        #   5006 -> vehicule deja assure ("... dispose deja d'une police chez: X")
        #   4000 -> aucune assurance digitale valide pour cette immatriculation
        code = str(ass_response.get("code") or "")
        if code == "5006":
            return True
        if code == "4000":
            return False

        data = ass_response.get("data")
        if isinstance(data, bool):
            return data
        if not isinstance(data, dict):
            return None

        for key in [
            "isRegistered",
            "registered",
            "exists",
            "found",
            "alreadyExists",
            "dejaAssure",
        ]:
            value = data.get(key)
            if isinstance(value, bool):
                return value
        return True if self._extract_vehicle(ass_response) else None

    def _extract_vehicle(self, ass_response):
        data = ass_response.get("data")
        if isinstance(data, list):
            data = next((item for item in data if isinstance(item, dict)), None)
        if not isinstance(data, dict):
            return None

        vehicle = next(
            (
                data.get(key)
                for key in ["vehicule", "vehicle", "automobile"]
                if isinstance(data.get(key), dict)
            ),
            data,
        )
        if not isinstance(vehicle, dict):
            return None

        subcategory = self._text(
            vehicle,
            "subcategory",
            "subCategory",
            "sousCategorie",
            "sous_categorie",
            "genre",
        )
        category = self._text(vehicle, "category", "categorie")
        if not category and subcategory:
            category = next(
                (
                    item["category"]
                    for item in VEHICLE_SUBCATEGORIES
                    if item["value"] == subcategory
                ),
                "",
            )

        normalized = {
            "brand": self._text(vehicle, "brand", "marque"),
            "model": self._text(vehicle, "model", "modele"),
            "category": category,
            "subcategory": subcategory,
            "registration": self._text(vehicle, "registration", "immatriculation"),
            "chassis": self._text(
                vehicle,
                "chassis",
                "numeroChassis",
                "numero_chassis",
            ),
            "energy": self._text(vehicle, "energy", "energie"),
            "fiscalPower": self._text(
                vehicle,
                "fiscalPower",
                "puissanceFiscale",
                "puissance_fiscale",
            ),
            "seats": self._text(
                vehicle,
                "seats",
                "nombrePlace",
                "nombrePlaces",
                "nombre_places",
            ),
            "firstCirculationDate": self._date_text(
                vehicle,
                "firstCirculationDate",
                "dateMiseCirculation",
                "dateMiseEnCirculation",
            ),
            "newValue": self._text(vehicle, "newValue", "valeurNeuve"),
            "currentValue": self._text(vehicle, "currentValue", "valeurActuelle"),
            "cylindree": self._text(
                vehicle,
                "cylindree",
                "cylindre",
                "cylindreeCc",
            ),
            "motoUsage": self._text(vehicle, "motoUsage", "usageMoto", "usage"),
        }
        meaningful_fields = [
            value
            for key, value in normalized.items()
            if key not in {"registration"} and value
        ]
        return normalized if meaningful_fields else None

    def _text(self, payload, *keys):
        for key in keys:
            value = payload.get(key)
            if value is not None and value != "":
                return str(value).strip()
        return ""

    def _date_text(self, payload, *keys):
        value = self._text(payload, *keys)
        return value[:10] if value else ""
