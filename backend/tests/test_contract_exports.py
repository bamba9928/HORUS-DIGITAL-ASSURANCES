"""Tests des exports contrats : bordereau CSV et récapitulatif PDF."""

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from organizations.models import Organization


pytestmark = pytest.mark.django_db


def make_contributor(username="export-user", org_code="EXPORT-TEST"):
    organization = Organization.objects.create(
        name=f"Groupe {org_code}",
        code=org_code,
    )
    user = User.objects.create_user(
        username=username,
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
        commission_percent_on_prime_rc=0,
        commission_fixed_on_policy_fee=0,
    )
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def create_contract(contributor, *, status=Contract.InternalStatus.ISSUED, **kwargs):
    defaults = {
        "organization": contributor.organization,
        "contributor": contributor,
        "contract_type": Contract.ContractType.AUTO_MONO,
        "internal_status": status,
        "prime_rc_ass": 24_000,
        "cout_police_ass": 3_000,
        "ttc_ass": 27_000,
        "immatriculation": "DK-1234-AB",
        "attestation_number": "ATT-0001",
        "draft_payload": {
            "policyholder": {
                "firstName": "Awa",
                "lastName": "Ndiaye",
                "phone": "771234567",
                "email": "awa@test.sn",
            }
        },
    }
    defaults.update(kwargs)
    return Contract.objects.create(**defaults)


def read_streaming_text(response):
    return b"".join(response.streaming_content).decode("utf-8")


def test_csv_export_requires_authentication():
    response = APIClient().get("/api/contracts/export/")
    assert response.status_code in (401, 403)


def test_csv_export_contains_contract_row_and_bom():
    client, contributor = make_contributor()
    contract = create_contract(contributor)
    CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
        ttc_ass=27_000,
        commission_percent_used=5,
        commission_fixed_policy_fee_used=500,
        commission_prime_rc_amount=1_200,
        commission_policy_fee_amount=500,
        commission_total=1_700,
    )

    response = client.get("/api/contracts/export/")

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert "attachment; filename=" in response["Content-Disposition"]
    content = read_streaming_text(response)
    assert content.startswith("﻿")
    lines = content.lstrip("﻿").strip().splitlines()
    assert lines[0].startswith("numero;date_creation;statut;type;immatriculation")
    row = lines[1]
    assert f"{contract.pk};" in row
    assert "DK-1234-AB" in row
    assert "NDIAYE" in row.upper()
    assert ";24000;" in row
    assert ";27000;" in row
    assert ";1700;" in row
    assert "ATT-0001" in row


def test_csv_export_is_isolated_per_contributor():
    client, contributor = make_contributor()
    mine = create_contract(contributor)
    other_client, other = make_contributor(
        username="export-other", org_code="EXPORT-OTHER"
    )
    theirs = create_contract(other, immatriculation="TH-9999-ZZ")

    content = read_streaming_text(client.get("/api/contracts/export/"))

    assert "DK-1234-AB" in content
    assert "TH-9999-ZZ" not in content
    assert str(theirs.pk) != str(mine.pk)


def test_csv_export_filters_by_status():
    client, contributor = make_contributor()
    create_contract(contributor, status=Contract.InternalStatus.ISSUED)
    create_contract(
        contributor,
        status=Contract.InternalStatus.DRAFT,
        immatriculation="DR-0000-AA",
        attestation_number="",
        ttc_ass=None,
    )

    content = read_streaming_text(client.get("/api/contracts/export/?status=ISSUED"))

    assert "DK-1234-AB" in content
    assert "DR-0000-AA" not in content


def test_csv_export_period_bounds():
    client, contributor = make_contributor()
    contract = create_contract(contributor)
    created = contract.created_at.date().isoformat()

    inside = read_streaming_text(
        client.get(f"/api/contracts/export/?from={created}&to={created}")
    )
    outside = read_streaming_text(
        client.get("/api/contracts/export/?from=2000-01-01&to=2000-12-31")
    )

    assert "DK-1234-AB" in inside
    assert "DK-1234-AB" not in outside


def test_csv_export_rejects_invalid_period():
    client, contributor = make_contributor()

    response = client.get("/api/contracts/export/?from=2026-13-45")

    assert response.status_code == 400
    assert "from" in response.data["detail"]


def test_pdf_export_returns_valid_pdf():
    client, contributor = make_contributor()
    contract = create_contract(contributor)

    response = client.get(f"/api/contracts/{contract.pk}/export-pdf/")

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert f"contrat_{contract.pk}_horus.pdf" in response["Content-Disposition"]
    assert response.content[:5] == b"%PDF-"
    assert len(response.content) > 1_000


def test_pdf_export_is_isolated_per_contributor():
    client, contributor = make_contributor()
    other_client, other = make_contributor(
        username="export-pdf-other", org_code="EXPORT-PDF-OTHER"
    )
    theirs = create_contract(other)

    response = client.get(f"/api/contracts/{theirs.pk}/export-pdf/")

    assert response.status_code == 404
