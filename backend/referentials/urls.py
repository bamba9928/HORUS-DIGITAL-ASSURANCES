from django.urls import path

from referentials.views import (
    ContractTypesView,
    EnergiesView,
    GuaranteesView,
    MotoUsagesView,
    VehicleBrandsView,
    VehicleCategoriesView,
    VehicleSubcategoriesView,
)

urlpatterns = [
    path("contract-types/", ContractTypesView.as_view(), name="contract-types"),
    path("vehicle-categories/", VehicleCategoriesView.as_view(), name="vehicle-categories"),
    path("vehicle-subcategories/", VehicleSubcategoriesView.as_view(), name="vehicle-subcategories"),
    path("vehicle-brands/", VehicleBrandsView.as_view(), name="vehicle-brands"),
    path("energies/", EnergiesView.as_view(), name="energies"),
    path("guarantees/", GuaranteesView.as_view(), name="guarantees"),
    path("moto-usages/", MotoUsagesView.as_view(), name="moto-usages"),
]
