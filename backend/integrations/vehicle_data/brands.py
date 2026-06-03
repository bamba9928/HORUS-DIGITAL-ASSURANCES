FALLBACK_BRANDS = [
    "Audi",
    "BMW",
    "Citroen",
    "Ford",
    "Hyundai",
    "Kia",
    "Mercedes-Benz",
    "Mitsubishi",
    "Nissan",
    "Peugeot",
    "Renault",
    "Remorque",
    "Suzuki",
    "Toyota",
    "Volkswagen",
    "Yamaha",
]


def search_vehicle_brands(search=""):
    normalized = search.strip().lower()
    brands = FALLBACK_BRANDS
    if normalized:
        brands = [brand for brand in brands if normalized in brand.lower()]
    return [{"value": brand.upper().replace(" ", "_"), "label": brand} for brand in brands[:20]]
