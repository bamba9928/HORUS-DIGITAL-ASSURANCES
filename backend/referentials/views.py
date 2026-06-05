from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from integrations.ass.referentials import (
    CONTRACT_TYPES,
    ENERGIES,
    GUARANTEE_OPTION_FIELDS,
    GUARANTEES,
    MOTO_USAGES,
    PERIODICITIES,
    PERSON_TYPES,
    VEHICLE_CATEGORIES,
    filter_subcategories,
)
from integrations.vehicle_data.brands import create_vehicle_brand, search_vehicle_brands


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
        limit = parse_limit(request.query_params.get("limit"), default=2000, maximum=2000)
        return Response(
            {
                "results": search_vehicle_brands(
                    request.query_params.get("search", ""),
                    limit=limit,
                )
            },
        )

    def post(self, request):
        try:
            brand = create_vehicle_brand(request.data.get("label") or request.data.get("value"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(brand, status=status.HTTP_201_CREATED)


def parse_limit(raw_limit, default, maximum):
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(limit, maximum))


class EnergiesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": ENERGIES})


class GuaranteesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": GUARANTEES})


class GuaranteeOptionsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": GUARANTEE_OPTION_FIELDS})


class PeriodicitiesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": PERIODICITIES})


class PersonTypesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": PERSON_TYPES})


class MotoUsagesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"results": MOTO_USAGES})
