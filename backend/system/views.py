from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class PlatformConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_admin_general:
            return Response({"detail": "Permission refusée."}, status=403)

        return Response({
            "ass_mock_enabled": settings.ASS_MOCK_ENABLED,
            "ass_real_calls_allowed": settings.ASS_REAL_CALLS_ALLOWED,
            "ass_policy_fee": settings.ASS_POLICY_FEE,
            "ass_partner_segment": settings.ASS_API_PARTNER_SEGMENT,
            "ass_base_url": settings.ASS_BASE_URL,
            "ass_credentials_set": bool(settings.ASS_USERNAME and settings.ASS_PASSWORD),
            "debug": settings.DEBUG,
            "environment": "development" if settings.DEBUG else "production",
            "language_code": settings.LANGUAGE_CODE,
            "time_zone": settings.TIME_ZONE,
        })
