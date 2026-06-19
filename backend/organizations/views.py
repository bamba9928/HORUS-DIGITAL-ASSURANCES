from django.db.models import Count
from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.permissions import IsAdminGeneral
from organizations.models import Organization
from organizations.serializers import OrganizationSerializer


def _base_queryset():
    return Organization.objects.annotate(user_count=Count("users", distinct=True))


class OrganizationListCreateView(generics.ListCreateAPIView):
    serializer_class = OrganizationSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminGeneral()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = _base_queryset()
        if user.is_admin_general:
            return qs
        if user.is_admin_group and user.organization_id:
            return qs.filter(pk=user.organization_id)
        return qs.none()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"results": serializer.data})

    def perform_create(self, serializer):
        if not self.request.user.is_admin_general:
            raise PermissionDenied("Seul un administrateur général peut créer une organisation.")
        serializer.save()


class OrganizationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = OrganizationSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsAdminGeneral()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = _base_queryset()
        if user.is_admin_general:
            return qs
        if user.is_admin_group and user.organization_id:
            return qs.filter(pk=user.organization_id)
        return qs.none()

    def perform_update(self, serializer):
        if not self.request.user.is_admin_general:
            raise PermissionDenied("Seul un administrateur général peut modifier une organisation.")
        serializer.save()
