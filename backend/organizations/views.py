from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from organizations.models import Organization
from organizations.serializers import OrganizationSerializer


class OrganizationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Organization.objects.filter(is_active=True)
        if user.is_admin_general:
            return queryset
        if user.is_admin_group and user.organization_id:
            return queryset.filter(pk=user.organization_id)
        return queryset.none()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"results": serializer.data})
