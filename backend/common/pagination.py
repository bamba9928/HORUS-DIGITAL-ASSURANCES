"""Pagination optionnelle par query params, partagee entre les vues listes.

Contrat de reponse identique a celui historique de /contracts/ :
- sans `page_size` : la liste complete est renvoyee (compatibilite frontend) ;
- avec `page_size` (1..100) et `page` (defaut 1) : tranche + metadonnees
  (count, page, page_size, total_pages).
"""

MAX_PAGE_SIZE = 100


class PaginationError(ValueError):
    pass


def paginate_queryset(request, queryset):
    """Retourne (items, meta). meta est None si aucune pagination demandee.

    Leve PaginationError("Pagination invalide.") si les parametres sont hors
    bornes ou non numeriques.
    """
    page_size_param = request.query_params.get("page_size")
    if page_size_param is None:
        return queryset, None

    try:
        page_size = int(page_size_param)
        page_number = int(request.query_params.get("page", "1"))
    except ValueError as exc:
        raise PaginationError("Pagination invalide.") from exc
    if page_size < 1 or page_size > MAX_PAGE_SIZE or page_number < 1:
        raise PaginationError("Pagination invalide.")

    count = queryset.count()
    start = (page_number - 1) * page_size
    meta = {
        "count": count,
        "page": page_number,
        "page_size": page_size,
        "total_pages": max(1, (count + page_size - 1) // page_size),
    }
    return queryset[start : start + page_size], meta
