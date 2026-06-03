from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from integrations.ass.referentials import (
    CONTRACT_TYPES,
    ENERGIES,
    GUARANTEES,
    MOTO_USAGES,
    VEHICLE_CATEGORIES,
    filter_subcategories,
)
from integrations.vehicle_data.brands import search_vehicle_brands


class ContractTypesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": CONTRACT_TYPES})


class VehicleCategoriesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        contract_type = request.query_params.get("contract_type")
        context = request.query_params.get("context")
        results = VEHICLE_CATEGORIES
        if context == "trailer":
            results = [item for item in results if "FLEET_TRAILER" in item["contract_types"]]
            return Response({"results": results})
        if contract_type:
            results = [item for item in results if contract_type in item["contract_types"]]
        return Response({"results": results})


class VehicleSubcategoriesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        results = filter_subcategories(
            category=request.query_params.get("category"),
            contract_type=request.query_params.get("contract_type"),
        )
        return Response({"results": results})


class VehicleBrandsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": search_vehicle_brands(request.query_params.get("search", ""))})


class EnergiesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": ENERGIES})


class GuaranteesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": GUARANTEES})


class MotoUsagesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "results": MOTO_USAGES,
                "warning": "Valeurs usage moto a confirmer avec ASS avant appels reels.",
            }
        )
