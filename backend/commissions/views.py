from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from commissions.models import CommissionSnapshot
from commissions.serializers import CommissionSnapshotSerializer, CommissionSnapshotStatusSerializer


class CommissionSnapshotListView(generics.ListAPIView):
    serializer_class = CommissionSnapshotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = CommissionSnapshot.objects.select_related(
            "contract",
            "contract__organization",
            "contributor",
        )
        if user.is_admin_general:
            return queryset
        if (user.is_admin_group or user.is_finance) and user.organization_id:
            return queryset.filter(contract__organization_id=user.organization_id)
        if user.is_contributor:
            return queryset.filter(contributor=user)
        return queryset.none()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"results": serializer.data})


class CommissionSnapshotStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        snapshot = get_object_or_404(
            CommissionSnapshot.objects.select_related("contract", "contract__organization"),
            pk=pk,
        )
        if not self._can_update_snapshot(request.user, snapshot):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

        serializer = CommissionSnapshotStatusSerializer(snapshot, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        snapshot = serializer.save()
        return Response(CommissionSnapshotSerializer(snapshot).data)

    def _can_update_snapshot(self, user, snapshot):
        if user.is_admin_general:
            return True
        if (user.is_admin_group or user.is_finance) and user.organization_id:
            return snapshot.contract.organization_id == user.organization_id
        return False
