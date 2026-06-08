from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from payments.models import Payment
from payments.serializers import PaymentSerializer


class PaymentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Payment.objects.select_related(
            "contract", "contract__organization", "created_by"
        )
        if user.is_admin_general:
            pass
        elif user.organization_id and (user.is_admin_group or user.is_finance):
            qs = qs.filter(contract__organization_id=user.organization_id)
        else:
            return qs.none()

        status_filter = self.request.query_params.get("status")
        if status_filter and status_filter in Payment.Status.values:
            qs = qs.filter(status=status_filter)

        return qs

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"results": serializer.data})
