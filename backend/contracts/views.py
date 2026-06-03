from django.conf import settings
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated

from contracts.models import Contract
from contracts.serializers import ContractDraftSerializer
from commissions.services import CommissionNotConfiguredError
from contracts.services import (
    ContractIssueError,
    QuoteCalculationError,
    calculate_contract_quote,
    issue_contract,
)
from payments.services import PaymentConfirmationError, confirm_manual_payment


class DraftPermissionMixin:
    def get_permissions(self):
        if settings.DEBUG:
            return [AllowAny()]
        return [IsAuthenticated()]


class ContractDraftListCreateView(DraftPermissionMixin, generics.ListCreateAPIView):
    serializer_class = ContractDraftSerializer

    def get_queryset(self):
        queryset = Contract.objects.filter(internal_status=Contract.InternalStatus.DRAFT)
        if self.request.user.is_authenticated and not self.request.user.is_admin_general:
            queryset = queryset.filter(organization_id=self.request.user.organization_id)
        return queryset


class ContractDraftDetailView(DraftPermissionMixin, generics.RetrieveUpdateAPIView):
    serializer_class = ContractDraftSerializer
    queryset = Contract.objects.filter(internal_status=Contract.InternalStatus.DRAFT)


class ContractDraftQuoteView(DraftPermissionMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(
            Contract.objects.filter(
                internal_status__in=[
                    Contract.InternalStatus.DRAFT,
                    Contract.InternalStatus.QUOTE_READY,
                ]
            ),
            pk=pk,
        )
        if request.user.is_authenticated and not request.user.is_admin_general:
            if contract.organization_id != request.user.organization_id:
                return Response({"detail": "Acces interdit."}, status=403)

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
