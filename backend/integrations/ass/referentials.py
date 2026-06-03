CONTRACT_TYPES = [
    {"value": "AUTO_MONO", "label": "Auto mono", "enabled": True},
    {"value": "MOTO", "label": "Moto", "enabled": True},
    {"value": "FLEET", "label": "Flotte", "enabled": True},
    {"value": "BUS_SCHOOL", "label": "Bus ecole", "enabled": False},
    {"value": "GARAGE", "label": "Garage", "enabled": False},
]

GUARANTEES = [
    {"value": 1, "label": "Defense et recours"},
    {"value": 2, "label": "Personnes transportees"},
    {"value": 3, "label": "Bris de glace"},
    {"value": 4, "label": "Avance / Recours"},
    {"value": 5, "label": "Incendie"},
    {"value": 6, "label": "Vol"},
    {"value": 7, "label": "Tierce collision"},
    {"value": 8, "label": "Tierce complete"},
]

ENERGIES = [
    {"value": "ESSENCE", "label": "Essence"},
    {"value": "DIESEL", "label": "Diesel"},
]

MOTO_USAGES = [
    {
        "value": "NON_COMMERCIAL",
        "label": "Non commercial",
        "needs_confirmation": True,
    },
    {
        "value": "COMMERCIAL",
        "label": "Commercial",
        "needs_confirmation": True,
    },
]

VEHICLE_CATEGORIES = [
    {"value": "C1", "label": "C1 - Vehicule particulier", "contract_types": ["AUTO_MONO", "FLEET"]},
    {"value": "C2", "label": "C2 - Vehicules utilitaires", "contract_types": ["AUTO_MONO", "FLEET"]},
    {"value": "C3", "label": "C3 - Transport public marchandises", "contract_types": ["AUTO_MONO", "FLEET"]},
    {"value": "C5", "label": "C5 - Deux roues", "contract_types": ["MOTO"]},
    {"value": "BUS_ECOLE", "label": "Bus ecole", "contract_types": ["BUS_SCHOOL"]},
    {"value": "C6", "label": "C6 - Garage", "contract_types": ["GARAGE"]},
    {"value": "REMORQUE", "label": "Remorque", "contract_types": ["FLEET_TRAILER"]},
]

VEHICLE_SUBCATEGORIES = [
    {"category": "C1", "value": "VP", "label": "Vehicule Particulier"},
    {"category": "C2", "value": "TPC", "label": "Utilitaire carrosserie tourisme"},
    {"category": "C2", "value": "TPC3T500", "label": "Utilitaire autre carrosserie jusqu'a 3T500"},
    {"category": "C2", "value": "TPC3T500P", "label": "Utilitaire autre carrosserie au-dela de 3T500"},
    {"category": "C3", "value": "TPM3T500", "label": "Transport marchandises jusqu'a 3T500"},
    {"category": "C3", "value": "TPM3T500P", "label": "Transport marchandises au-dela de 3T500"},
    {"category": "C5", "value": "2RCYC", "label": "Cyclomoteurs"},
    {"category": "C5", "value": "2RSCO", "label": "Scooters et velomoteurs jusqu'a 125 cm3"},
    {"category": "C5", "value": "2RMOT", "label": "Motocyclettes et scooters de plus de 125 cm3"},
    {"category": "C5", "value": "2RSID", "label": "Side-cars toutes cylindrees"},
    {"category": "BUS_ECOLE", "value": "BE-VTA", "label": "Vehicule de transport dans des autocars"},
    {"category": "BUS_ECOLE", "value": "BE-VTCATP", "label": "Camions amenages transport de personnes"},
    {"category": "C6", "value": "C6-WG-4R", "label": "Garage vehicule a 04 roues"},
    {"category": "C6", "value": "C6-WG-ATELIER-AUTRE", "label": "Garage atelier autre 02 ou 03 roues"},
    {"category": "REMORQUE", "value": "REMORQUE", "label": "Remorque"},
]


def filter_subcategories(category=None, contract_type=None):
    results = VEHICLE_SUBCATEGORIES
    if category:
        results = [item for item in results if item["category"] == category]
    if contract_type:
        allowed_categories = {
            item["value"]
            for item in VEHICLE_CATEGORIES
            if contract_type in item["contract_types"]
        }
        results = [item for item in results if item["category"] in allowed_categories]
    return results
