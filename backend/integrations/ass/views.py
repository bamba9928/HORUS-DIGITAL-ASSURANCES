from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from integrations.aas_diotali.service import check_vehicule
from integrations.ass.client import AssClient, extract_available_qr
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
        # Reserve a l'admin general : ASS est un fournisseur technique, pas une
        # information a exposer aux admins de groupe ou a finance (cf. le meme
        # cloisonnement cote front, canViewAssIntegration).
        return user.is_admin_general


class AssVerifyRegistrationView(APIView):
    """Verifie si un vehicule est deja assure — via le registre AAS Diotali.

    N'appelle plus ASS : ASS ne bloque une immatriculation deja assuree qu'a
    l'emission (apres consommation d'un QR reel, sans repli possible). AAS
    Diotali est un registre public independant qui permet de detecter le
    doublon en amont, pendant la saisie du formulaire. Voir la memoire
    project-aas-diotali-a-porter pour le contexte complet du portage.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ass_verify"

    def post(self, request):
        serializer = AssVerifyRegistrationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        immatriculation = serializer.validated_data["immatriculation"]
        date_effet_prevue = serializer.validated_data.get("date_effet")

        bloque, message, details = check_vehicule(immatriculation, date_effet_prevue)

        payload = {
            "mode": "mock" if settings.AAS_DIOTALI_MOCK_ENABLED else "real",
            "operation_status": "SUCCESS" if bloque else "NOT_FOUND",
            "operation_message": message or "",
            "immatriculation": immatriculation,
            "is_registered": bloque,
            # Le registre AAS Diotali ne fournit pas les caracteristiques du
            # vehicule (marque/genre/etc.) au sens du formulaire (categorie,
            # energie...) : `vehicle` reste None. `details` porte ce que le
            # contrat existant fournit reellement, pour l'alerte de blocage.
            "vehicle": None,
            "details": details,
            "raw_response": {},
        }
        response_serializer = AssVerifyRegistrationSerializer(payload)
        return Response(response_serializer.data)
