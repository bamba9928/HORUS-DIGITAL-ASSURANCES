from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from contracts.models import Contract
from contracts.serializers import ContractDetailSerializer, ContractDraftSerializer, ContractListSerializer
from commissions.services import CommissionNotConfiguredError
from contracts.services import (
    ContractCancelError,
    ContractIssueError,
    QuoteCalculationError,
    calculate_contract_quote,
    cancel_contract,
    issue_contract,
)
from payments.services import PaymentConfirmationError, confirm_manual_payment


def get_contract_queryset_for_user(user):
    if not user.is_authenticated:
        return Contract.objects.none()

    queryset = Contract.objects.all()
    if user.is_admin_general:
        return queryset
    if not user.organization_id:
        return queryset.none()
    if user.is_contributor:
        return queryset.filter(
            organization_id=user.organization_id,
            contributor_id=user.id,
        )
    if user.is_admin_group or user.is_finance:
        return queryset.filter(organization_id=user.organization_id)
    return queryset.none()


def can_manage_contract_workflow(user, contract):
    if user.is_admin_general:
        return True
    if not user.organization_id or user.organization_id != contract.organization_id:
        return False
    return user.is_admin_group or (
        user.is_contributor and contract.contributor_id == user.id
    )


def can_cancel_contract(user, contract):
    if user.is_admin_general:
        return True
    return bool(
        user.is_admin_group
        and user.organization_id
        and user.organization_id == contract.organization_id
    )


def can_confirm_contract_payment(user, contract):
    if user.is_admin_general:
        return True
    return bool(
        user.organization_id
        and user.organization_id == contract.organization_id
        and (user.is_admin_group or user.is_finance)
    )


class AuthenticatedContractMixin:
    permission_classes = [IsAuthenticated]


class ContractDraftListCreateView(AuthenticatedContractMixin, generics.ListCreateAPIView):
    serializer_class = ContractDraftSerializer

    def get_queryset(self):
        return get_contract_queryset_for_user(self.request.user).filter(
            internal_status=Contract.InternalStatus.DRAFT
        )

    def create(self, request, *args, **kwargs):
        if request.user.is_finance:
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)


class ContractListView(AuthenticatedContractMixin, APIView):
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


class ContractDetailView(AuthenticatedContractMixin, APIView):
    def get(self, request, pk):
        contract = get_object_or_404(
            get_contract_queryset_for_user(request.user)
            .select_related("organization", "contributor")
            .prefetch_related("payments", "payments__created_by"),
            pk=pk,
        )
        serializer = ContractDetailSerializer(contract)
        return Response(serializer.data)


class ContractSummaryView(AuthenticatedContractMixin, APIView):
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


class ContractDraftDetailView(AuthenticatedContractMixin, generics.RetrieveUpdateAPIView):
    serializer_class = ContractDraftSerializer

    def get_queryset(self):
        # Autorise DRAFT et QUOTE_READY : l'utilisateur peut revenir modifier
        # un contrat déjà devisé (le statut sera remis à DRAFT après mise à jour).
        return get_contract_queryset_for_user(self.request.user).filter(
            internal_status__in=[
                Contract.InternalStatus.DRAFT,
                Contract.InternalStatus.QUOTE_READY,
            ]
        )

    def update(self, request, *args, **kwargs):
        contract = self.get_object()
        if not can_manage_contract_workflow(request.user, contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        was_quoted = contract.internal_status == Contract.InternalStatus.QUOTE_READY
        response = super().update(request, *args, **kwargs)
        # L'utilisateur a modifié le brouillon : on remet à DRAFT pour invalider le devis précédent.
        if was_quoted and response.status_code in (200, 201):
            contract.refresh_from_db(fields=["internal_status"])
            if contract.internal_status == Contract.InternalStatus.QUOTE_READY:
                contract.internal_status = Contract.InternalStatus.DRAFT
                contract.save(update_fields=["internal_status", "updated_at"])
        return response


class ContractDraftQuoteView(AuthenticatedContractMixin, APIView):
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
        if not can_manage_contract_workflow(request.user, contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

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


class ContractConfirmPaymentView(AuthenticatedContractMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(get_contract_queryset_for_user(request.user), pk=pk)
        if not can_confirm_contract_payment(request.user, contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

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
                "internal_status": payment.contract.internal_status,
                "payment": {
                    "id": payment.id,
                    "amount": payment.amount,
                    "status": payment.status,
                    "confirmed_at": payment.confirmed_at.isoformat() if payment.confirmed_at else None,
                },
            }
        )


class ContractIssueView(AuthenticatedContractMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(get_contract_queryset_for_user(request.user), pk=pk)
        if not can_manage_contract_workflow(request.user, contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

        try:
            result = issue_contract(contract)
        except (ContractIssueError, CommissionNotConfiguredError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(result)


class ContractCancelView(AuthenticatedContractMixin, APIView):
    def post(self, request, pk):
        contract = get_object_or_404(get_contract_queryset_for_user(request.user), pk=pk)
        if not can_cancel_contract(request.user, contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

        method = request.data.get("methode", "")
        motif = request.data.get("motif", "")

        try:
            result = cancel_contract(contract, method=method, motif=motif)
        except (ContractCancelError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=400)

        return Response(result)
