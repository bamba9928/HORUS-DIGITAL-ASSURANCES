from django.core.exceptions import ValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import PaginationError, paginate_queryset
from contracts.models import Contract
from contracts.serializers import (
    ContractDetailSerializer,
    ContractDraftSerializer,
    ContractListSerializer,
    validate_fleet_coverage_for_quote,
)
from commissions.services import CommissionNotConfiguredError
from integrations.ass.exceptions import AssIntegrationError
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

        contributor_param = request.query_params.get("contributor")
        if contributor_param:
            if not str(contributor_param).isdigit():
                return Response({"detail": "Contributeur invalide."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(contributor_id=int(contributor_param))

        organization_param = request.query_params.get("organization")
        if organization_param:
            if not str(organization_param).isdigit():
                return Response({"detail": "Organisation invalide."}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(organization_id=int(organization_param))

        search = request.query_params.get("search", "").strip()
        if search:
            normalized_search = " ".join(search.upper().split())
            search_query = Q(search_text__contains=normalized_search)
            if normalized_search.isdigit():
                search_query |= Q(pk=int(normalized_search))
            queryset = queryset.filter(search_query)

        queryset = queryset.order_by("-updated_at")
        try:
            items, meta = paginate_queryset(request, queryset)
        except PaginationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ContractListSerializer(items, many=True)
        response_data = {
            "results": serializer.data,
            "count": meta["count"] if meta else queryset.count(),
        }
        if meta:
            response_data.update(meta)
        return Response(response_data)


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

        contributor_param = request.query_params.get("contributor")
        if contributor_param and str(contributor_param).isdigit():
            queryset = queryset.filter(contributor_id=int(contributor_param))

        organization_param = request.query_params.get("organization")
        if organization_param and str(organization_param).isdigit():
            queryset = queryset.filter(organization_id=int(organization_param))

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
        # L'utilisateur a modifié le brouillon : on remet à DRAFT pour invalider
        # le devis précédent. UPDATE conditionnel atomique : si un paiement vient
        # d'être confirmé en parallèle (statut passé à PAID), on ne touche à rien.
        if was_quoted and response.status_code in (200, 201):
            Contract.objects.filter(
                pk=contract.pk,
                internal_status=Contract.InternalStatus.QUOTE_READY,
            ).update(
                internal_status=Contract.InternalStatus.DRAFT,
                updated_at=timezone.now(),
            )
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
            if contract.contract_type == Contract.ContractType.FLEET:
                validate_fleet_coverage_for_quote(contract.draft_payload)
            quote = calculate_contract_quote(contract)
        except (QuoteCalculationError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=400)
        except AssIntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

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
                external_reference=request.data.get("external_reference", ""),
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
        except AssIntegrationError as exc:
            # La reservation d'emission a deja ete liberee par issue_contract.
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

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
        except AssIntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(result)


class ClientListView(AuthenticatedContractMixin, APIView):
    def get(self, request):
        # Agregation sur les champs denormalises (policyholder_*) : aucun
        # chargement ni parsing des payloads JSON.
        rows = (
            get_contract_queryset_for_user(request.user)
            .exclude(policyholder_phone="")
            .exclude(policyholder_last_name="")
            .order_by("-updated_at")
            .values(
                "id",
                "contract_type",
                "updated_at",
                "policyholder_phone",
                "policyholder_last_name",
                "policyholder_first_name",
                "policyholder_email",
                "policyholder_person_type",
                "organization__name",
            )
        )

        clients = {}
        for row in rows:
            phone = row["policyholder_phone"]
            client = clients.get(phone)
            if client is None:
                # Les lignes arrivent triees par -updated_at : la premiere vue
                # porte donc le dernier contrat du client.
                client = clients[phone] = {
                    "phone": phone,
                    "nom": row["policyholder_last_name"],
                    "prenom": row["policyholder_first_name"],
                    "email": row["policyholder_email"],
                    "person_type": row["policyholder_person_type"] or "PHYSIQUE",
                    "contract_count": 0,
                    "contract_types": [],
                    "organizations": [],
                    "last_contract_id": row["id"],
                    "last_contract_date": row["updated_at"],
                }

            client["contract_count"] += 1
            if row["contract_type"] not in client["contract_types"]:
                client["contract_types"].append(row["contract_type"])
            org_name = row["organization__name"]
            if org_name and org_name not in client["organizations"]:
                client["organizations"].append(org_name)

        result = sorted(
            [
                {**c, "last_contract_date": c["last_contract_date"].isoformat()}
                for c in clients.values()
            ],
            key=lambda c: (-c["contract_count"], c["nom"]),
        )

        return Response({"results": result, "count": len(result)})
