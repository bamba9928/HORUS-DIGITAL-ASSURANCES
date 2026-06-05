from django.db.utils import OperationalError, ProgrammingError

from integrations.vehicle_data.brand_referential import BASE_VEHICLE_BRANDS
from referentials.models import VehicleBrand


def normalize_brand_label(label):
    return " ".join(str(label or "").strip().upper().split())


def brand_value(label):
    return normalize_brand_label(label)


def brand_option(label):
    normalized = normalize_brand_label(label)
    return {"value": brand_value(normalized), "label": normalized}


def base_brand_by_value():
    return {brand_value(label): normalize_brand_label(label) for label in BASE_VEHICLE_BRANDS}


def custom_brand_labels():
    try:
        return list(VehicleBrand.objects.values_list("name", flat=True))
    except (OperationalError, ProgrammingError):
        return []


def all_vehicle_brand_labels():
    brands_by_value = base_brand_by_value()
    for label in custom_brand_labels():
        normalized = normalize_brand_label(label)
        if normalized:
            brands_by_value.setdefault(brand_value(normalized), normalized)
    return sorted(brands_by_value.values())


def search_vehicle_brands(search="", limit=50):
    normalized_search = normalize_brand_label(search)
    brands = all_vehicle_brand_labels()
    if normalized_search:
        brands = [brand for brand in brands if normalized_search in brand_value(brand)]
    return [brand_option(brand) for brand in brands[:limit]]


def create_vehicle_brand(label, created_by=None):
    normalized = normalize_brand_label(label)
    if not normalized:
        raise ValueError("Marque requise.")

    existing_base = base_brand_by_value().get(brand_value(normalized))
    if existing_base:
        return brand_option(existing_base)

    creator = created_by if getattr(created_by, "is_authenticated", False) else None
    brand, _created = VehicleBrand.objects.get_or_create(
        value=brand_value(normalized),
        defaults={
            "name": normalized,
            "is_custom": True,
            "created_by": creator,
        },
    )
    return brand_option(brand.name)
