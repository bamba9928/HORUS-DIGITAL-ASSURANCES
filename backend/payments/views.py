import logging

from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import PaginationError, paginate_queryset
from integrations.orange_money.exceptions import OmIntegrationError
from payments.models import Payment
from payments.serializers import PaymentSerializer
from payments.services import (
    PaymentConfirmationError,
    check_om_payment,
    initiate_om_payment,
)

logger = logging.getLogger("payments.orange_money")


class PaymentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Payment.objects.select_related(
            "contract", "contract__organization", "created_by"
        )
        # Isolation alignee sur celle des contrats (get_contract_queryset_for_user) :
        # admin general = tout ; admin groupe / finance = leur organisation ;
        # apporteur = uniquement les paiements de ses propres contrats.
        if user.is_admin_general:
            pass
        elif not user.organization_id:
            return qs.none()
        elif user.is_admin_group or user.is_finance:
            qs = qs.filter(contract__organization_id=user.organization_id)
        elif user.is_contributor:
            qs = qs.filter(
                contract__organization_id=user.organization_id,
                contract__contributor_id=user.id,
            )
        else:
            return qs.none()

        status_filter = self.request.query_params.get("status")
        if status_filter and status_filter in Payment.Status.values:
            qs = qs.filter(status=status_filter)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        try:
            items, meta = paginate_queryset(request, queryset)
        except PaginationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(items, many=True)
        response_data = {"results": serializer.data}
        if meta:
            response_data.update(meta)
        return Response(response_data)


# ─── Orange Money ──────────────────────────────────────────────────────────────


def _om_payment_response(payment, qr_data=None):
    data = {
        "payment": {
            "id": payment.id,
            "contract_id": payment.contract_id,
            "amount": payment.amount,
            "status": payment.status,
            "method": payment.method,
            "external_reference": payment.external_reference,
            "om_transaction_id": payment.om_transaction_id,
            "confirmed_at": payment.confirmed_at.isoformat() if payment.confirmed_at else None,
        },
        "contract_internal_status": payment.contract.internal_status,
    }
    if qr_data is not None:
        data["qr"] = {
            "qr_code": qr_data.get("qrCode", ""),
            "deep_links": qr_data.get("deepLinks", {}),
            "validity_seconds": qr_data.get("validity"),
            "mock": bool(qr_data.get("mock")),
        }
    return data


class OmInitiateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Import local : évite un cycle d'import (contracts.views importe
        # payments.services au chargement).
        from contracts.views import can_manage_contract_workflow, get_contract_queryset_for_user

        contract = get_object_or_404(
            get_contract_queryset_for_user(request.user),
            pk=request.data.get("contract_id"),
        )
        if not can_manage_contract_workflow(request.user, contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

        try:
            payment, qr_data = initiate_om_payment(
                contract=contract, created_by=request.user
            )
        except PaymentConfirmationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except OmIntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(_om_payment_response(payment, qr_data))


class OmStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from contracts.views import can_manage_contract_workflow, get_contract_queryset_for_user

        payment = get_object_or_404(
            Payment.objects.select_related("contract"),
            pk=pk,
            method=Payment.Method.ORANGE_MONEY,
        )
        if not get_contract_queryset_for_user(request.user).filter(
            pk=payment.contract_id
        ).exists():
            return Response({"detail": "Introuvable."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_contract_workflow(request.user, payment.contract):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)

        try:
            payment = check_om_payment(payment=payment)
        except PaymentConfirmationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except OmIntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(_om_payment_response(payment))


class OmCallbackView(APIView):
    """Webhook de notification Orange Money.

    Public (pas de session), mais le corps n'est JAMAIS cru sur parole :
    la référence sert uniquement à retrouver le paiement, le statut est
    revalidé via l'API transactions (source de vérité contractuelle).
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        nested = body.get("transaction")
        reference = (
            body.get("reference")
            or body.get("merchantReference")
            or (nested.get("reference") if isinstance(nested, dict) else None)
        )
        if not reference:
            logger.warning("Callback OM sans reference: %s", str(body)[:300])
            return Response({"detail": "reference manquante"}, status=status.HTTP_200_OK)

        payment = (
            Payment.objects.select_related("contract")
            .filter(
                external_reference=reference,
                method=Payment.Method.ORANGE_MONEY,
            )
            .order_by("-created_at")
            .first()
        )
        if payment is None:
            logger.warning("Callback OM reference inconnue: %s", reference)
            return Response({"detail": "ok"}, status=status.HTTP_200_OK)

        try:
            check_om_payment(payment=payment)
        except (PaymentConfirmationError, OmIntegrationError) as exc:
            # 200 quand même : OM n'a pas à rejouer indéfiniment, le polling
            # côté app et la page de statut rattraperont.
            logger.error("Callback OM erreur pour %s: %s", reference, exc)

        return Response({"detail": "ok"}, status=status.HTTP_200_OK)
