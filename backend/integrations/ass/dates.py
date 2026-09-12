"""Regle d'echeance ASS : date d'effet + duree - 1 jour.

Vit dans la couche integration et non dans `contracts.services` parce que trois
appelants en ont besoin sans pouvoir se voir : les builders de payload
(contracts.services), le mock d'emission (integrations.ass.client) et le front
(web/src/lib/coverage.ts, qui en est la transposition TypeScript). Une copie
locale dans le mock avait deja produit des echeances anterieures a la date
d'effet — une seule definition ici, importee partout.
"""

from calendar import monthrange
from datetime import date, timedelta

from django.core.exceptions import ValidationError


def add_months(value, months):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    # Le 31 janvier + 1 mois donne le 28/29 fevrier, pas le 2 ou 3 mars.
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def calculate_expiration_date(effect_date, duration, periodicity):
    """Echeance au format ISO (AAAA-MM-JJ), ou "" sans date d'effet."""
    if not effect_date:
        return ""

    try:
        start_date = date.fromisoformat(effect_date)
    except ValueError as exc:
        raise ValidationError("Date d'effet invalide.") from exc
    if periodicity == "JOUR":
        expiration = start_date + timedelta(days=duration) - timedelta(days=1)
    else:
        expiration = add_months(start_date, duration) - timedelta(days=1)
    return expiration.isoformat()
