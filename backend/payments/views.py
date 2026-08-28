import hmac
import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.pagination import PaginationError, paginate_queryset
from integrations.orange_money.callbacks import OmSignatureError, verify_signature
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

    Public (pas de session), mais le corps n'est JAMAIS cru sur parole : la
    référence sert uniquement à retrouver le paiement, le statut est revalidé
    via l'API transactions (source de vérité contractuelle).

    Deux garde-fous en amont quand ils sont configurés :
      - `X-Sonatel-Signature` (HMAC-SHA256 du corps brut) ;
      - `Authorization: Basic <apiKey>` renvoyée par OM depuis l'enregistrement
        du callback marchand.
    Un rejet renvoie 400 : la spec traite tout 4xx comme définitif (pas de
    réémission), ce qui est le comportement voulu pour une requête non authentique.

    Pas de déduplication sur `X-Sonatel-Idempotency-Key` : les notifications
    sont livrées « au moins une fois », mais `check_om_payment` re-interroge OM
    sous verrou de ligne et court-circuite sur CONFIRMED — un rejeu est donc
    déjà sans effet de bord.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        # Le corps BRUT doit être lu avant tout parsing : la signature porte sur
        # les octets reçus, pas sur un JSON re-sérialisé.
        raw_body = request.body

        if settings.OM_CALLBACK_SIGNING_SECRET:
            try:
                verify_signature(
                    header=request.headers.get("X-Sonatel-Signature", ""),
                    raw_body=raw_body,
                    secret=settings.OM_CALLBACK_SIGNING_SECRET,
                )
            except OmSignatureError as exc:
                logger.warning("Callback OM refuse (signature): %s", exc)
                return Response(
                    {"detail": "signature invalide"}, status=status.HTTP_400_BAD_REQUEST
                )

        if settings.OM_CALLBACK_API_KEY:
            # Comparaison sur des octets : compare_digest lève TypeError sur une
            # chaîne non-ASCII, ce qu'un en-tête hostile suffirait à provoquer.
            expected = f"Basic {settings.OM_CALLBACK_API_KEY}".encode("utf-8")
            provided = request.headers.get("Authorization", "").encode("utf-8")
            if not hmac.compare_digest(provided, expected):
                logger.warning("Callback OM refuse (Authorization).")
                return Response(
                    {"detail": "authentification invalide"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        body = request.data if isinstance(request.data, dict) else {}
        nested = body.get("transaction")
        reference = (
            body.get("reference")
            or body.get("merchantReference")
            or (nested.get("reference") if isinstance(nested, dict) else None)
        )
        transaction_id = body.get("transactionId") or (
            nested.get("transactionId") if isinstance(nested, dict) else None
        )

        payment = None
        if reference:
            payment = (
                Payment.objects.select_related("contract")
                .filter(
                    external_reference=reference,
                    method=Payment.Method.ORANGE_MONEY,
                )
                .order_by("-created_at")
                .first()
            )
        # Repli sur le transactionId OM : utile si un paiement a déjà été
        # rapproché par le sondage et que la notification arrive après coup.
        if payment is None and transaction_id:
            payment = (
                Payment.objects.select_related("contract")
                .filter(
                    om_transaction_id=transaction_id,
                    method=Payment.Method.ORANGE_MONEY,
                )
                .order_by("-created_at")
                .first()
            )

        if payment is None:
            logger.warning(
                "Callback OM sans paiement correspondant (reference=%s, transactionId=%s)",
                reference,
                transaction_id,
            )
            return Response(status=status.HTTP_202_ACCEPTED)

        try:
            check_om_payment(payment=payment)
        except (PaymentConfirmationError, OmIntegrationError) as exc:
            # 2xx quand même : OM n'a pas à rejouer indéfiniment, le polling
            # côté app et la page de statut rattraperont.
            logger.error("Callback OM erreur pour %s: %s", reference, exc)

        return Response(status=status.HTTP_202_ACCEPTED)
