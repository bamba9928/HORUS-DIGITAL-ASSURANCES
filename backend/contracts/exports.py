"""Exports contrats : bordereau CSV (compta) et récapitulatif PDF par contrat."""

import csv
import io
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from contracts.models import Contract

# ─── CSV ───────────────────────────────────────────────────────────────────────

# Point-virgule + BOM UTF-8 : ouverture directe dans Excel (locale FR).
CSV_DELIMITER = ";"

CSV_HEADERS = [
    "numero",
    "date_creation",
    "statut",
    "type",
    "immatriculation",
    "preneur_nom",
    "preneur_prenom",
    "preneur_telephone",
    "organisation",
    "apporteur",
    "prime_rc_fcfa",
    "cout_police_fcfa",
    "ttc_encaisse_fcfa",
    "commission_apporteur_fcfa",
    "date_emission",
    "date_expiration",
    "numero_attestation",
    "reference_externe",
]


class ExportPeriodError(ValueError):
    pass


def parse_period_bounds(params):
    """Bornes de période (sur la date de création) depuis ?from=&to= (YYYY-MM-DD)."""

    def _parse(name):
        raw = (params.get(name) or "").strip()
        if not raw:
            return None
        try:
            return date.fromisoformat(raw)
        except ValueError as exc:
            raise ExportPeriodError(
                f"Parametre '{name}' invalide (format attendu : AAAA-MM-JJ)."
            ) from exc

    date_from = _parse("from")
    date_to = _parse("to")
    if date_from and date_to and date_from > date_to:
        raise ExportPeriodError("La date 'from' doit preceder la date 'to'.")

    tz = timezone.get_current_timezone()
    start = (
        timezone.make_aware(datetime.combine(date_from, time.min), tz)
        if date_from
        else None
    )
    end = (
        timezone.make_aware(datetime.combine(date_to + timedelta(days=1), time.min), tz)
        if date_to
        else None
    )
    return start, end


def apply_period(queryset, params):
    start, end = parse_period_bounds(params)
    if start:
        queryset = queryset.filter(created_at__gte=start)
    if end:
        queryset = queryset.filter(created_at__lt=end)
    return queryset


def _format_dt(value):
    if not value:
        return ""
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")


def _contract_csv_row(contract):
    snapshot = getattr(contract, "commission_snapshot", None)
    return [
        contract.pk,
        _format_dt(contract.created_at),
        contract.get_internal_status_display(),
        contract.get_contract_type_display(),
        contract.immatriculation,
        contract.policyholder_last_name,
        contract.policyholder_first_name,
        contract.policyholder_phone,
        contract.organization.name if contract.organization_id else "",
        contract.contributor.get_full_name() or contract.contributor.username
        if contract.contributor_id
        else "",
        contract.prime_rc_ass if contract.prime_rc_ass is not None else "",
        contract.cout_police_ass,
        contract.ttc_ass if contract.ttc_ass is not None else "",
        snapshot.commission_total if snapshot else "",
        _format_dt(snapshot.created_at) if snapshot else "",
        _format_dt(contract.date_expiration),
        contract.attestation_number,
        contract.reference_externe,
    ]


def stream_contracts_csv(queryset):
    """Générateur de lignes CSV (streaming, rien n'est construit en mémoire)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=CSV_DELIMITER)

    def _emit():
        value = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        return value

    # BOM pour qu'Excel détecte l'UTF-8 (accents des noms/labels).
    yield "﻿"
    writer.writerow(CSV_HEADERS)
    yield _emit()

    for contract in queryset.iterator(chunk_size=200):
        writer.writerow(_contract_csv_row(contract))
        yield _emit()


def csv_export_filename():
    return f"contrats_horus_{timezone.localdate().strftime('%Y%m%d')}.csv"


# ─── PDF (récapitulatif par contrat) ──────────────────────────────────────────

PRIMARY_COLOR = (0.588, 0.0, 0.753)  # #9600c0
DARK_COLOR = (0.05, 0.06, 0.09)
MUTED_COLOR = (0.45, 0.47, 0.52)
BORDER_COLOR = (0.89, 0.90, 0.93)


def _fmt_money(value):
    if value in (None, ""):
        return "—"
    return f"{value:,}".replace(",", " ") + " FCFA"


def build_contract_pdf(contract):
    """Fiche récapitulative A4 d'un contrat, aux couleurs Horus. Retourne les bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    buffer = io.BytesIO()
    page = pdf_canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 18 * mm
    y = height - margin

    # ── Bandeau d'en-tête ──
    page.setFillColorRGB(*PRIMARY_COLOR)
    page.roundRect(margin, y - 22 * mm, width - 2 * margin, 22 * mm, 3 * mm, stroke=0, fill=1)
    page.setFillColorRGB(1, 1, 1)
    page.setFont("Helvetica-Bold", 16)
    page.drawString(margin + 8 * mm, y - 9 * mm, "HORUS ASSURANCES DIGITAL")
    page.setFont("Helvetica", 10)
    page.drawString(margin + 8 * mm, y - 15 * mm, "Récapitulatif de contrat")
    page.setFont("Helvetica-Bold", 13)
    page.drawRightString(width - margin - 8 * mm, y - 9 * mm, f"Contrat n° {contract.pk}")
    page.setFont("Helvetica", 9)
    page.drawRightString(
        width - margin - 8 * mm,
        y - 15 * mm,
        f"Édité le {timezone.localtime().strftime('%d/%m/%Y à %H:%M')}",
    )
    y -= 32 * mm

    def section(title, rows):
        nonlocal y
        row_h = 6.4 * mm
        block_h = 9 * mm + row_h * len(rows)
        if y - block_h < margin + 14 * mm:
            page.showPage()
            y = height - margin
        page.setFillColorRGB(*PRIMARY_COLOR)
        page.setFont("Helvetica-Bold", 11)
        page.drawString(margin, y, title.upper())
        y -= 2.4 * mm
        page.setStrokeColorRGB(*BORDER_COLOR)
        page.setLineWidth(0.8)
        page.line(margin, y, width - margin, y)
        y -= 6 * mm
        for label, value in rows:
            page.setFillColorRGB(*MUTED_COLOR)
            page.setFont("Helvetica", 9)
            page.drawString(margin, y, label)
            page.setFillColorRGB(*DARK_COLOR)
            page.setFont("Helvetica-Bold", 10)
            page.drawString(margin + 55 * mm, y, str(value) if value else "—")
            y -= row_h
        y -= 5 * mm

    policyholder_name = " ".join(
        part
        for part in [contract.policyholder_first_name, contract.policyholder_last_name]
        if part
    )
    snapshot = getattr(contract, "commission_snapshot", None)
    confirmed_payment = contract.payments.filter(status="CONFIRMED").first()

    section(
        "Contrat",
        [
            ("Type", contract.get_contract_type_display()),
            ("Statut", contract.get_internal_status_display()),
            ("Immatriculation", contract.immatriculation),
            ("Créé le", _format_dt(contract.created_at)),
            ("Expire le", _format_dt(contract.date_expiration)),
        ],
    )
    section(
        "Preneur d'assurance",
        [
            ("Nom", policyholder_name),
            ("Téléphone", contract.policyholder_phone),
            ("Email", contract.policyholder_email),
        ],
    )
    section(
        "Distribution",
        [
            ("Organisation", contract.organization.name if contract.organization_id else ""),
            (
                "Apporteur",
                (contract.contributor.get_full_name() or contract.contributor.username)
                if contract.contributor_id
                else "",
            ),
        ],
    )
    montant_rows = [
        ("Prime RC", _fmt_money(contract.prime_rc_ass)),
        ("Coût de police", _fmt_money(contract.cout_police_ass)),
        ("TTC encaissé", _fmt_money(contract.ttc_ass)),
    ]
    if confirmed_payment:
        method_label = confirmed_payment.get_method_display()
        montant_rows.append(
            (
                "Paiement",
                f"{_fmt_money(confirmed_payment.amount)} ({method_label}, "
                f"{_format_dt(confirmed_payment.confirmed_at)})",
            )
        )
    if snapshot:
        montant_rows.append(("Commission apporteur", _fmt_money(snapshot.commission_total)))
    section("Montants", montant_rows)

    if contract.attestation_number or contract.reference_externe:
        section(
            "Attestation ASS",
            [
                ("N° attestation", contract.attestation_number),
                ("Référence externe", contract.reference_externe),
                ("Réf. transaction", contract.reference_trx_partner or ""),
            ],
        )

    # ── Pied de page ──
    page.setFillColorRGB(*MUTED_COLOR)
    page.setFont("Helvetica", 8)
    page.drawCentredString(
        width / 2,
        margin - 4 * mm,
        "Horus Assurances Digital — https://horus-assur.digital — document interne, ne vaut pas attestation d'assurance",
    )

    page.showPage()
    page.save()
    return buffer.getvalue()


def pdf_export_filename(contract):
    return f"contrat_{contract.pk}_horus.pdf"
