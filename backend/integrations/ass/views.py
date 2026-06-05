from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from integrations.ass.client import AssClient
from integrations.ass.exceptions import AssConfigurationError, AssIntegrationError
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

        payload = {
            "mode": "mock" if settings.ASS_MOCK_ENABLED else "real",
            "operation_status": ass_response.get("operationStatus") or ass_response.get("status") or "",
            "operation_message": ass_response.get("operationMessage") or ass_response.get("message") or "",
            "available_qr": self._extract_available_qr(ass_response),
            "raw_response": ass_response,
        }
        serializer = AssStockQrSerializer(payload)
        return Response(serializer.data)

    def _can_view_stock(self, user):
        return user.is_admin_general or user.is_admin_group or user.is_finance

    def _extract_available_qr(self, ass_response):
        data = ass_response.get("data")
        if isinstance(data, int):
            return data
        if isinstance(data, dict):
            for key in ["stock", "available", "availableQr", "qrDisponible", "nombreQr"]:
                value = data.get(key)
                if isinstance(value, int):
                    return value
        return None


class AssVerifyRegistrationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.DEBUG and not request.user.is_authenticated:
            return Response({"detail": "Authentification requise."}, status=status.HTTP_403_FORBIDDEN)

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
        return None
