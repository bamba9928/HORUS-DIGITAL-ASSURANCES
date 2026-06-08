from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminGeneralOrGroupAdmin
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
from referentials.models import VehicleBrand
from referentials.serializers import VehicleBrandAdminSerializer


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
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return [AllowAny()]

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
            brand = create_vehicle_brand(
                request.data.get("label") or request.data.get("value"),
                created_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(brand, status=status.HTTP_201_CREATED)


def parse_limit(raw_limit, default, maximum):
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(limit, maximum))


class CustomVehicleBrandListView(APIView):
    permission_classes = [IsAdminGeneralOrGroupAdmin]

    def get(self, request):
        queryset = VehicleBrand.objects.select_related("created_by", "updated_by").filter(is_custom=True)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        serializer = VehicleBrandAdminSerializer(queryset, many=True)
        return Response({"results": serializer.data})


class CustomVehicleBrandDetailView(APIView):
    permission_classes = [IsAdminGeneralOrGroupAdmin]

    def patch(self, request, pk):
        brand = self.get_object(pk)
        serializer = VehicleBrandAdminSerializer(
            brand,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        brand = self.get_object(pk)
        brand.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_object(self, pk):
        return get_object_or_404(VehicleBrand, pk=pk, is_custom=True)


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
