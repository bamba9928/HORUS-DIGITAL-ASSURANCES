from django.conf import settings
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated

from contracts.models import Contract
from contracts.serializers import ContractDetailSerializer, ContractDraftSerializer, ContractListSerializer
from commissions.services import CommissionNotConfiguredError
from contracts.services import (
    ContractIssueError,
    QuoteCalculationError,
    calculate_contract_quote,
    issue_contract,
)
from payments.services import PaymentConfirmationError, confirm_manual_payment


def get_contract_queryset_for_user(user):
    queryset = Contract.objects.all()
    if user.is_authenticated and not user.is_admin_general:
        queryset = queryset.filter(organization_id=user.organization_id)
    return queryset


class DraftPermissionMixin:
    def get_permissions(self):
        if settings.DEBUG:
            return [AllowAny()]
        return [IsAuthenticated()]


class ContractDraftListCreateView(DraftPermissionMixin, generics.ListCreateAPIView):
    serializer_class = ContractDraftSerializer

    def get_queryset(self):
        return get_contract_queryset_for_user(self.request.user).filter(
            internal_status=Contract.InternalStatus.DRAFT
        )


class ContractListView(DraftPermissionMixin, APIView):
    def get(self, request):
        queryset = get_contract_queryset_for_user(request.user).select_related(
            "organization",
            "contributor",
        )

        internal_status = request.query_params.get("status")
        if internal_status:
            if internal_status not in Contract.InternalStatus.values:
                return Response({"detail": "Statut contrat invalide."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(internal_status=internal_status)

        contract_type = request.query_params.get("contract_type")
        if contract_type:
            if contract_type not in Contract.ContractType.values:
                return Response({"detail": "Type contrat invalide."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(contract_type=contract_type)

        serializer = ContractListSerializer(queryset.order_by("-updated_at"), many=True)
        return Response({"results": serializer.data})


class ContractDetailView(DraftPermissionMixin, APIView):
    def get(self, request, pk):
        contract = get_object_or_404(
            get_contract_queryset_for_user(request.user)
            .select_related("organization", "contributor")
            .prefetch_related("payments"),
            pk=pk,
        )
        serializer = ContractDetailSerializer(contract)
        return Response(serializer.data)


class ContractSummaryView(DraftPermissionMixin, APIView):
    def get(self, request):
        queryset = get_contract_queryset_for_user(request.user)
        return Response(
            {
                "drafts": queryset.filter(internal_status=Contract.InternalStatus.DRAFT).count(),
                "quotes_ready": queryset.filter(
                    internal_status=Contract.InternalStatus.QUOTE_READY
                ).count(),
                "payment_pending": queryset.filter(
                    internal_status=Contract.InternalStatus.PAYMENT_PENDING
                ).count(),
                "issued": queryset.filter(internal_status=Contract.InternalStatus.ISSUED).count(),
                "total": queryset.count(),
            }
        )


class ContractDraftDetailView(DraftPermissionMixin, generics.RetrieveUpdateAPIView):
    serializer_class = ContractDraftSerializer

    def get_queryset(self):
        return get_contract_queryset_for_user(self.request.user).filter(
            internal_status=Contract.InternalStatus.DRAFT
        )


class ContractDraftQuoteView(DraftPermissionMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(
            get_contract_queryset_for_user(request.user).filter(
                internal_status__in=[
                    Contract.InternalStatus.DRAFT,
                    Contract.InternalStatus.QUOTE_READY,
                ]
            ),
            pk=pk,
        )

        try:
            quote = calculate_contract_quote(contract)
        except (QuoteCalculationError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(
            {
                "contract_id": contract.id,
                "internal_status": contract.internal_status,
                "quote": quote,
            }
        )


class ContractConfirmPaymentView(DraftPermissionMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(Contract, pk=pk)
        if request.user.is_authenticated and not request.user.is_admin_general:
            if contract.organization_id != request.user.organization_id:
                return Response({"detail": "Acces interdit."}, status=403)

        try:
            payment = confirm_manual_payment(
                contract=contract,
                amount=request.data.get("amount"),
                external_reference=request.data.get("external_reference", "MANUAL-TEST"),
                created_by=request.user,
            )
        except (PaymentConfirmationError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(
            {
                "contract_id": contract.id,
                "internal_status": contract.internal_status,
                "payment": {
                    "id": payment.id,
                    "amount": payment.amount,
                    "status": payment.status,
                    "confirmed_at": payment.confirmed_at.isoformat() if payment.confirmed_at else None,
                },
            }
        )


class ContractIssueView(DraftPermissionMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(Contract, pk=pk)
        if request.user.is_authenticated and not request.user.is_admin_general:
            if contract.organization_id != request.user.organization_id:
                return Response({"detail": "Acces interdit."}, status=403)

        try:
            result = issue_contract(contract)
        except (ContractIssueError, CommissionNotConfiguredError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(result)
