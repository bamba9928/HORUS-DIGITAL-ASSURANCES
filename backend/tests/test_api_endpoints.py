import pytest
from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from organizations.models import Organization
from payments.models import Payment
from referentials.models import VehicleBrand


TEST_POLICYHOLDER = {
    "lastName": "DIOP",
    "firstName": "Awa",
    "phone": "771112233",
    "email": "awa.diop@example.test",
}


def make_authenticated_contract_client(
    *,
    role=User.Role.CONTRIBUTOR,
    username="contract-test-user",
):
    organization = Organization.objects.create(
        name="Groupe Contract Test",
        code="CONTRACT-TEST",
    )
    user = User.objects.create_user(
        username=username,
        password="test",
        role=role,
        organization=organization,
        commission_percent_on_prime_rc=0,
        commission_fixed_on_policy_fee=0,
    )
    client = APIClient()
    client.force_authenticate(user)
    return client, user


def create_quote_ready_contract(contributor):
    return Contract.objects.create(
        organization=contributor.organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.QUOTE_READY,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
    )


@pytest.mark.django_db
def test_vehicle_subcategories_are_filtered_by_category():
    client = APIClient()

    response = client.get("/api/referentials/vehicle-subcategories/", {"category": "C5"})

    assert response.status_code == 200
    values = {item["value"] for item in response.data["results"]}
    assert values == {"2RCYC", "2RSCO", "2RMOT", "2RSID"}


def test_vehicle_categories_follow_ass_metadata_and_exclude_c4_from_auto():
    client = APIClient()

    response = client.get("/api/referentials/vehicle-categories/", {"contract_type": "AUTO_MONO"})

    assert response.status_code == 200
    values = {item["value"] for item in response.data["results"]}
    assert "C4" not in values
    assert {"C1", "C2", "C3", "C7", "C8", "C9", "C10"}.issubset(values)


def test_special_vehicle_subcategories_include_pdf_c10_values():
    client = APIClient()

    response = client.get("/api/referentials/vehicle-subcategories/", {"category": "C10"})

    assert response.status_code == 200
    values = {item["value"] for item in response.data["results"]}
    assert {
        "C10-VS-EMC",
        "C10-VS-TAR",
        "C10-VS-VACFF",
        "C10-VS-VAME",
        "C10-VS-VCP",
    }.issubset(values)


def test_ass_periodicities_and_person_types_are_exposed():
    client = APIClient()

    periodicities_response = client.get("/api/referentials/periodicities/")
    person_types_response = client.get("/api/referentials/person-types/")

    assert periodicities_response.status_code == 200
    assert periodicities_response.data["results"] == [
        {"value": "JOUR", "label": "Jour", "min_duration": 1, "max_duration": 366},
        {"value": "MOIS", "label": "Mois", "min_duration": 1, "max_duration": 12},
    ]
    assert person_types_response.status_code == 200
    assert {item["value"] for item in person_types_response.data["results"]} == {
        "PHYSIQUE",
        "MORALE",
    }


def test_ass_guarantee_options_are_exposed():
    client = APIClient()

    response = client.get("/api/referentials/guarantee-options/")

    assert response.status_code == 200
    fields = {item["field"] for item in response.data["results"]}
    assert {"garantiesOptPT", "garantiesOptAR", "garantiesOptAS"}.issubset(fields)
    option_as = next(item for item in response.data["results"] if item["field"] == "garantiesOptAS")
    assert option_as["enabled"] is True
    assert option_as["needs_confirmation"] is False


@pytest.mark.django_db
def test_vehicle_brand_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/referentials/vehicle-brands/")

    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_vehicle_brand_search_returns_select_options():
    client, _ = make_authenticated_contract_client(username="brand-search-user")

    response = client.get("/api/referentials/vehicle-brands/", {"search": "toy"})

    assert response.status_code == 200
    assert response.data["results"] == [{"value": "TOYOTA", "label": "TOYOTA"}]


@pytest.mark.django_db
def test_vehicle_brand_default_list_returns_imported_referential():
    client, _ = make_authenticated_contract_client(username="brand-list-user")

    response = client.get("/api/referentials/vehicle-brands/")

    assert response.status_code == 200
    values = {item["value"] for item in response.data["results"]}
    assert len(response.data["results"]) > 1000
    assert {"TOYOTA", "ZONGSHEN"}.issubset(values)


@pytest.mark.django_db
def test_vehicle_brand_search_uses_imported_referential():
    client, _ = make_authenticated_contract_client(username="brand-zong-user")

    response = client.get("/api/referentials/vehicle-brands/", {"search": "zong"})

    assert response.status_code == 200
    values = {item["value"] for item in response.data["results"]}
    assert "ZONGSHEN" in values


@pytest.mark.django_db
def test_authenticated_contributor_can_add_vehicle_brand_when_missing():
    contributor = User.objects.create_user(
        username="brand-contributor-create",
        password="test",
        role=User.Role.CONTRIBUTOR,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    create_response = client.post(
        "/api/referentials/vehicle-brands/",
        {"label": "Marque Test Horus"},
        format="json",
    )
    search_response = client.get(
        "/api/referentials/vehicle-brands/",
        {"search": "marque test"},
    )

    assert create_response.status_code == 201
    assert create_response.data == {
        "value": "MARQUE TEST HORUS",
        "label": "MARQUE TEST HORUS",
    }
    assert search_response.status_code == 200
    assert search_response.data["results"] == [create_response.data]


@pytest.mark.django_db
def test_anonymous_user_cannot_add_vehicle_brand():
    client = APIClient()

    response = client.post(
        "/api/referentials/vehicle-brands/",
        {"label": "Marque Anonyme Interdite"},
        format="json",
    )

    assert response.status_code in {401, 403}
    assert not VehicleBrand.objects.filter(value="MARQUE ANONYME INTERDITE").exists()


@pytest.mark.django_db
def test_vehicle_brand_creation_records_authenticated_author():
    admin = User.objects.create_user(
        username="brand-author-admin",
        password="test",
        role=User.Role.ADMIN_GENERAL,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.post(
        "/api/referentials/vehicle-brands/",
        {"label": "Auteur Horus Test"},
        format="json",
    )

    brand = VehicleBrand.objects.get(value="AUTEUR HORUS TEST")
    assert response.status_code == 201
    assert brand.created_by == admin


@pytest.mark.django_db
def test_custom_vehicle_brand_admin_list_requires_admin():
    contributor = User.objects.create_user(
        username="brand-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
    )
    VehicleBrand.objects.create(value="BRAND FORBIDDEN TEST", name="BRAND FORBIDDEN TEST")
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get("/api/referentials/custom-vehicle-brands/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_custom_vehicle_brand_admin_list_exposes_author_and_dates():
    admin = User.objects.create_user(
        username="brand-list-admin",
        password="test",
        role=User.Role.ADMIN_GROUP,
    )
    VehicleBrand.objects.create(
        value="MARQUE LISTE TEST",
        name="MARQUE LISTE TEST",
        created_by=admin,
        updated_by=admin,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.get("/api/referentials/custom-vehicle-brands/", {"search": "liste"})

    assert response.status_code == 200
    assert response.data["results"][0]["name"] == "MARQUE LISTE TEST"
    assert response.data["results"][0]["created_by_username"] == "brand-list-admin"
    assert response.data["results"][0]["updated_by_username"] == "brand-list-admin"
    assert response.data["results"][0]["created_at"]
    assert response.data["results"][0]["updated_at"]


@pytest.mark.django_db
def test_custom_vehicle_brand_admin_can_correct_typo():
    admin = User.objects.create_user(
        username="brand-update-admin",
        password="test",
        role=User.Role.ADMIN_GENERAL,
    )
    brand = VehicleBrand.objects.create(value="RENALT HORUS TEST", name="RENALT HORUS TEST")
    client = APIClient()
    client.force_authenticate(admin)

    response = client.patch(
        f"/api/referentials/custom-vehicle-brands/{brand.id}/",
        {"name": "Renault Horus Test"},
        format="json",
    )

    brand.refresh_from_db()
    assert response.status_code == 200
    assert response.data["name"] == "RENAULT HORUS TEST"
    assert brand.value == "RENAULT HORUS TEST"
    assert brand.updated_by == admin


@pytest.mark.django_db
def test_custom_vehicle_brand_admin_cannot_rename_to_base_duplicate():
    admin = User.objects.create_user(
        username="brand-duplicate-admin",
        password="test",
        role=User.Role.ADMIN_GENERAL,
    )
    brand = VehicleBrand.objects.create(value="TOYOTTA HORUS TEST", name="TOYOTTA HORUS TEST")
    client = APIClient()
    client.force_authenticate(admin)

    response = client.patch(
        f"/api/referentials/custom-vehicle-brands/{brand.id}/",
        {"name": "Toyota"},
        format="json",
    )

    assert response.status_code == 400
    assert "name" in response.data


@pytest.mark.django_db
def test_custom_vehicle_brand_admin_can_remove_custom_brand():
    admin = User.objects.create_user(
        username="brand-delete-admin",
        password="test",
        role=User.Role.ADMIN_GENERAL,
    )
    brand = VehicleBrand.objects.create(value="DELETE HORUS TEST", name="DELETE HORUS TEST")
    client = APIClient()
    client.force_authenticate(admin)

    response = client.delete(f"/api/referentials/custom-vehicle-brands/{brand.id}/")

    assert response.status_code == 204
    assert not VehicleBrand.objects.filter(id=brand.id).exists()


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_summary_counts_statuses_for_authenticated_user_in_debug_mode():
    organization = Organization.objects.create(name="Groupe Summary", code="SUMMARY")
    contributor = User.objects.create_user(
        username="summary-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.QUOTE_READY,
    )
    Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.PAYMENT_PENDING,
    )
    Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get("/api/contracts/summary/")

    assert response.status_code == 200
    assert response.data == {
        "drafts": 1,
        "quotes_ready": 1,
        "payment_pending": 1,
        "issued": 1,
        "total": 4,
    }


@pytest.mark.django_db
@override_settings(DEBUG=False)
def test_contract_summary_is_filtered_by_authenticated_user_group():
    own_group = Organization.objects.create(name="Groupe Own Summary", code="OWN-SUM")
    other_group = Organization.objects.create(name="Groupe Other Summary", code="OTHER-SUM")
    admin_group = User.objects.create_user(
        username="summary-admin-group",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    own_contributor = User.objects.create_user(
        username="summary-own-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="summary-other-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    Contract.objects.create(
        organization=own_group,
        contributor=own_contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    Contract.objects.create(
        organization=other_group,
        contributor=other_contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.get("/api/contracts/summary/")

    assert response.status_code == 200
    assert response.data["drafts"] == 1
    assert response.data["issued"] == 0
    assert response.data["total"] == 1


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_list_can_filter_by_status_and_contract_type_when_authenticated():
    organization = Organization.objects.create(name="Groupe List", code="LIST")
    contributor = User.objects.create_user(
        username="list-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    issued = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
        immatriculation="AA-917-XQ",
        attestation_number="SN-LIST-001",
        link_attestation_digitale="https://example.test/attestation/SN-LIST-001",
        link_attestation_cedeao="https://example.test/cedeao/SN-LIST-001",
        draft_payload={
            "vehicle": {
                "brand": "TOYOTA",
                "model": "YARIS",
                "registration": "AA-917-XQ",
                "effectDate": "2026-06-01",
            },
            "policyholder": {
                "firstName": "Awa",
                "lastName": "DIOP",
                "phone": "771112233",
            },
        },
        ass_issue_request_payload={"police": "HORUS-POL-LIST-001"},
    )
    Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.MOTO,
        internal_status=Contract.InternalStatus.DRAFT,
        draft_payload={"vehicle": {"brand": "YAMAHA", "registration": "DK-001-AA"}},
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get(
        "/api/contracts/",
        {"status": Contract.InternalStatus.ISSUED, "contract_type": Contract.ContractType.AUTO_MONO},
    )

    assert response.status_code == 200
    assert len(response.data["results"]) == 1
    assert response.data["results"][0]["id"] == issued.id
    assert response.data["results"][0]["vehicle_label"] == "TOYOTA YARIS AA-917-XQ"
    assert response.data["results"][0]["attestation_number"] == "SN-LIST-001"
    assert response.data["results"][0]["policy_number"] == "HORUS-POL-LIST-001"
    assert response.data["results"][0]["client_name"] == "Awa DIOP"
    assert response.data["results"][0]["client_phone"] == "771112233"
    assert response.data["results"][0]["effect_date"] == "2026-06-01"
    assert response.data["results"][0]["link_attestation_digitale"].endswith(
        "/SN-LIST-001"
    )

    policy_response = client.get("/api/contracts/", {"search": "POL-LIST"})

    assert policy_response.status_code == 200
    assert [item["id"] for item in policy_response.data["results"]] == [issued.id]


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_list_supports_search_and_pagination():
    client, contributor = make_authenticated_contract_client()
    matching_contract = Contract.objects.create(
        organization=contributor.organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
        draft_payload={
            "policyholder": {
                "firstName": "Fatou",
                "lastName": "NDIAYE",
            },
            "vehicle": {"registration": "DK-2026-AA"},
        },
    )
    Contract.objects.create(
        organization=contributor.organization,
        contributor=contributor,
        contract_type=Contract.ContractType.MOTO,
        internal_status=Contract.InternalStatus.DRAFT,
        draft_payload={"policyholder": {"firstName": "Moussa", "lastName": "FALL"}},
    )

    response = client.get(
        "/api/contracts/",
        {"search": "Fatou", "page": 1, "page_size": 1},
    )

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["page"] == 1
    assert response.data["page_size"] == 1
    assert response.data["total_pages"] == 1
    assert [item["id"] for item in response.data["results"]] == [
        matching_contract.id
    ]
    matching_contract.refresh_from_db()
    assert "FATOU" in matching_contract.search_text
    assert "DK-2026-AA" in matching_contract.search_text


@pytest.mark.django_db
def test_contract_search_text_refreshes_when_draft_payload_changes():
    _, contributor = make_authenticated_contract_client()
    contract = Contract.objects.create(
        organization=contributor.organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        draft_payload={
            "policyholder": {"firstName": "Awa", "lastName": "DIOP"},
        },
    )

    contract.draft_payload = {
        "policyholder": {"firstName": "Mariama", "lastName": "BA"},
    }
    contract.save(update_fields=["draft_payload"])
    contract.refresh_from_db()

    assert "MARIAMA" in contract.search_text
    assert "AWA" not in contract.search_text


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_list_rejects_invalid_status_filter():
    client, _ = make_authenticated_contract_client()

    response = client.get("/api/contracts/", {"status": "UNKNOWN"})

    assert response.status_code == 400
    assert response.data["detail"] == "Statut contrat invalide."


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_endpoints_require_authentication_even_in_debug_mode():
    client = APIClient()

    response = client.get("/api/contracts/")

    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_contributor_cannot_confirm_manual_payment():
    client, contributor = make_authenticated_contract_client()
    contract = create_quote_ready_contract(contributor)

    response = client.post(
        f"/api/contracts/{contract.id}/payments/confirm/",
        {"amount": 27_000, "external_reference": "PAY-CONTRIBUTOR"},
        format="json",
    )

    assert response.status_code == 403
    assert Payment.objects.filter(contract=contract).exists() is False


@pytest.mark.django_db
def test_finance_cannot_confirm_incorrect_payment_amount():
    client, contributor = make_authenticated_contract_client()
    contract = create_quote_ready_contract(contributor)
    finance = User.objects.create_user(
        username="finance-wrong-amount",
        password="test",
        role=User.Role.FINANCE,
        organization=contributor.organization,
    )
    client.force_authenticate(finance)

    response = client.post(
        f"/api/contracts/{contract.id}/payments/confirm/",
        {"amount": 26_999, "external_reference": "PAY-WRONG-AMOUNT"},
        format="json",
    )

    contract.refresh_from_db()
    assert response.status_code == 400
    assert "exactement de 27000 FCFA" in response.data["detail"]
    assert contract.internal_status == Contract.InternalStatus.QUOTE_READY
    assert Payment.objects.filter(contract=contract).exists() is False


@pytest.mark.django_db
def test_finance_payment_uses_ass_prime_totale_when_available():
    client, contributor = make_authenticated_contract_client()
    contract = create_quote_ready_contract(contributor)
    contract.ass_response_payload = {"data": {"primeTotale": 31_980}}
    contract.save(update_fields=["ass_response_payload"])
    finance = User.objects.create_user(
        username="finance-ass-total",
        password="test",
        role=User.Role.FINANCE,
        organization=contributor.organization,
    )
    client.force_authenticate(finance)

    incorrect_response = client.post(
        f"/api/contracts/{contract.id}/payments/confirm/",
        {"amount": 27_000, "external_reference": "PAY-WITHOUT-TAXES"},
        format="json",
    )
    correct_response = client.post(
        f"/api/contracts/{contract.id}/payments/confirm/",
        {"amount": 31_980, "external_reference": "PAY-WITH-TAXES"},
        format="json",
    )

    assert incorrect_response.status_code == 400
    assert "exactement de 31980 FCFA" in incorrect_response.data["detail"]
    assert correct_response.status_code == 200
    contract.refresh_from_db()
    assert contract.ttc_ass == 31_980


@pytest.mark.django_db
def test_manual_payment_confirmation_cannot_be_duplicated():
    client, contributor = make_authenticated_contract_client()
    contract = create_quote_ready_contract(contributor)
    finance = User.objects.create_user(
        username="finance-duplicate-payment",
        password="test",
        role=User.Role.FINANCE,
        organization=contributor.organization,
    )
    client.force_authenticate(finance)
    url = f"/api/contracts/{contract.id}/payments/confirm/"
    payload = {"amount": 27_000, "external_reference": "PAY-ONCE"}

    first_response = client.post(url, payload, format="json")
    second_response = client.post(url, payload, format="json")

    assert first_response.status_code == 200
    assert second_response.status_code == 400
    assert Payment.objects.filter(contract=contract, status=Payment.Status.CONFIRMED).count() == 1


@pytest.mark.django_db
def test_database_rejects_two_confirmed_payments_for_same_contract():
    _, contributor = make_authenticated_contract_client()
    contract = create_quote_ready_contract(contributor)
    Payment.objects.create(
        contract=contract,
        amount=27_000,
        status=Payment.Status.CONFIRMED,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Payment.objects.create(
            contract=contract,
            amount=27_000,
            status=Payment.Status.CONFIRMED,
        )


@pytest.mark.django_db
@override_settings(DEBUG=False)
def test_contract_list_is_filtered_by_authenticated_user_group():
    own_group = Organization.objects.create(name="Groupe Own List", code="OWN-LIST")
    other_group = Organization.objects.create(name="Groupe Other List", code="OTHER-LIST")
    admin_group = User.objects.create_user(
        username="list-admin-group",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    own_contributor = User.objects.create_user(
        username="list-own-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="list-other-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    own_contract = Contract.objects.create(
        organization=own_group,
        contributor=own_contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    Contract.objects.create(
        organization=other_group,
        contributor=other_contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.get("/api/contracts/")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [own_contract.id]


@pytest.mark.django_db
def test_contributor_contract_list_is_limited_to_own_contracts():
    organization = Organization.objects.create(name="Groupe Own Contributor", code="OWN-CONTRIB")
    contributor = User.objects.create_user(
        username="own-contract-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    colleague = User.objects.create_user(
        username="colleague-contract-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    own_contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
    )
    Contract.objects.create(
        organization=organization,
        contributor=colleague,
        contract_type=Contract.ContractType.AUTO_MONO,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get("/api/contracts/")

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [own_contract.id]


@pytest.mark.django_db
def test_contributor_cannot_access_colleague_contract_in_same_group():
    organization = Organization.objects.create(name="Groupe Colleagues", code="COLLEAGUES")
    contributor = User.objects.create_user(
        username="restricted-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    colleague = User.objects.create_user(
        username="contract-owner-colleague",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=colleague,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    detail_response = client.get(f"/api/contracts/{contract.id}/")
    quote_response = client.post(f"/api/contracts/{contract.id}/quote/")

    assert detail_response.status_code == 404
    assert quote_response.status_code == 404


@pytest.mark.django_db
def test_finance_can_read_group_contract_but_cannot_change_workflow():
    organization = Organization.objects.create(name="Groupe Finance Workflow", code="FIN-WORK")
    contributor = User.objects.create_user(
        username="finance-workflow-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    finance = User.objects.create_user(
        username="finance-workflow",
        password="test",
        role=User.Role.FINANCE,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    client = APIClient()
    client.force_authenticate(finance)

    detail_response = client.get(f"/api/contracts/{contract.id}/")
    update_response = client.patch(
        f"/api/contracts/drafts/{contract.id}/",
        {"draft_payload": {"vehicle": {"brand": "INTERDIT"}}},
        format="json",
    )
    quote_response = client.post(f"/api/contracts/{contract.id}/quote/")

    assert detail_response.status_code == 200
    assert update_response.status_code == 403
    assert quote_response.status_code == 403


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_detail_returns_payments_and_commission_snapshot():
    organization = Organization.objects.create(name="Groupe Detail", code="DETAIL")
    contributor = User.objects.create_user(
        username="detail-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
        prime_rc_ass=50_000,
        cout_police_ass=3_000,
        ttc_ass=65_000,
        attestation_number="SN-DETAIL-001",
        draft_payload={
            "vehicle": {
                "brand": "TOYOTA",
                "model": "YARIS",
                "registration": "AA-917-XQ",
            }
        },
    )
    Payment.objects.create(
        contract=contract,
        amount=65_000,
        status=Payment.Status.CONFIRMED,
        external_reference="PAY-DETAIL",
    )
    CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        prime_rc_ass=50_000,
        cout_police_ass=3_000,
        ttc_ass=65_000,
        commission_percent_used="18.00",
        commission_fixed_policy_fee_used=2_000,
        commission_prime_rc_amount=9_000,
        commission_policy_fee_amount=2_000,
        commission_total=11_000,
        net_to_horus=54_000,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get(f"/api/contracts/{contract.id}/")

    assert response.status_code == 200
    assert response.data["id"] == contract.id
    assert response.data["attestation_number"] == "SN-DETAIL-001"
    assert response.data["payments"][0]["external_reference"] == "PAY-DETAIL"
    assert response.data["commission_snapshot"]["commission_total"] == 11_000
    assert response.data["vehicle_label"] == "TOYOTA YARIS AA-917-XQ"
    assert response.data["ass_attestations"][0]["attestation_number"] == "SN-DETAIL-001"


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_contract_detail_returns_fleet_and_trailer_attestations():
    organization = Organization.objects.create(name="Groupe Detail Fleet", code="DETAIL-FLEET")
    contributor = User.objects.create_user(
        username="detail-fleet-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.FLEET,
        internal_status=Contract.InternalStatus.ISSUED,
        prime_rc_ass=27_000,
        cout_police_ass=3_000,
        ttc_ass=30_000,
        ass_issue_request_payload={
            "flotte": {
                "items": [
                    {
                        "referenceTrxPartner": "REF-FLEET-1",
                        "vehicule": {
                            "marque": "TOYOTA",
                            "modele": "YARIS",
                            "immatriculation": "AA-917-XQ",
                        },
                    }
                ]
            },
            "remorques": [
                {
                    "referenceTrxPartner": "REF-FLEET-REM-1-1",
                    "immatriculation": "REM-001",
                    "marque": "TRAIL",
                    "modele": "T1",
                }
            ],
        },
        ass_issue_response_payload={
            "flotte": {
                "operationStatus": "SUCCESS",
                "items": [
                    {
                        "referenceExterne": "REF-FLEET-1",
                        "attestationNumber": "SN-FLEET-001",
                        "secureKey": "SEC-FLEET",
                        "dateExpiration": "2026-09-01T23:59:59",
                        "linkAttestation": "https://example.test/attestation/SN-FLEET-001",
                        "linkCarteBrune": "https://example.test/cedeao/SN-FLEET-001",
                    }
                ],
            },
            "remorques": [
                {
                    "operationStatus": "SUCCESS",
                    "data": {
                        "referenceExterne": "REF-FLEET-REM-1-1",
                        "attestationNumber": "SN-REM-001",
                        "secureKey": "SEC-REM",
                        "dateExpiration": "2026-09-01T23:59:59",
                        "linkAttestation": "https://example.test/attestation/SN-REM-001",
                        "linkCarteBrune": "https://example.test/cedeao/SN-REM-001",
                    },
                }
            ],
        },
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.get(f"/api/contracts/{contract.id}/")

    assert response.status_code == 200
    assert [item["kind"] for item in response.data["ass_attestations"]] == [
        "VEHICLE",
        "TRAILER",
    ]
    assert response.data["ass_attestations"][0]["attestation_number"] == "SN-FLEET-001"
    assert response.data["ass_attestations"][0]["label"] == "TOYOTA YARIS AA-917-XQ"
    assert response.data["ass_attestations"][1]["attestation_number"] == "SN-REM-001"
    assert response.data["ass_attestations"][1]["immatriculation"] == "REM-001"


@pytest.mark.django_db
@override_settings(DEBUG=False)
def test_contract_detail_is_filtered_by_authenticated_user_group():
    own_group = Organization.objects.create(name="Groupe Own Detail", code="OWN-DETAIL")
    other_group = Organization.objects.create(name="Groupe Other Detail", code="OTHER-DETAIL")
    admin_group = User.objects.create_user(
        username="detail-admin-group",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="detail-other-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    other_contract = Contract.objects.create(
        organization=other_group,
        contributor=other_contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.get(f"/api/contracts/{other_contract.id}/")

    assert response.status_code == 404


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_authenticated_user_can_create_contract_draft_in_debug_mode():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "MOTO",
            "draft_payload": {
                "vehicle": {
                    "brand": "YAMAHA",
                    "cylindree": 126,
                }
            },
        },
        format="json",
    )

    assert response.status_code == 201
    draft = Contract.objects.get(id=response.data["id"])
    assert draft.internal_status == Contract.InternalStatus.DRAFT
    assert draft.contract_type == Contract.ContractType.MOTO
    assert draft.draft_payload["vehicle"]["cylindree"] == 126


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_authenticated_user_can_update_contract_draft_in_debug_mode():
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )

    response = client.patch(
        f"/api/contracts/drafts/{draft_response.data['id']}/",
        {
            "contract_type": "MOTO",
            "draft_payload": {
                "vehicle": {
                    "brand": "YAMAHA",
                    "cylindree": 126,
                    "registration": "DK-1234-AB",
                }
            },
        },
        format="json",
    )

    assert response.status_code == 200
    draft = Contract.objects.get(id=draft_response.data["id"])
    assert draft.contract_type == Contract.ContractType.MOTO
    assert draft.draft_payload["vehicle"]["brand"] == "YAMAHA"
    assert draft.draft_payload["vehicle"]["cylindree"] == 126


@pytest.mark.django_db
def test_contract_draft_normalizes_registration_and_accepts_partial_valid_phone():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "policyholder": {"phone": "77"},
                "vehicle": {"registration": "dk-1234-ab"},
            },
        },
        format="json",
    )

    assert response.status_code == 201
    draft = Contract.objects.get(id=response.data["id"])
    assert draft.draft_payload["policyholder"]["phone"] == "77"
    assert draft.draft_payload["vehicle"]["registration"] == "DK-1234-AB"


@pytest.mark.django_db
@pytest.mark.parametrize("phone", ["612345678", "77 123456", "7712345678"])
def test_contract_draft_rejects_invalid_phone(phone):
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {"policyholder": {"phone": phone}},
        },
        format="json",
    )

    assert response.status_code == 400
    assert "draft_payload" in response.data


@pytest.mark.django_db
@pytest.mark.parametrize("registration", ["DK 1234 AB", "DK_1234_AB", "DK/1234/AB"])
def test_contract_draft_rejects_invalid_registration(registration):
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {"vehicle": {"registration": registration}},
        },
        format="json",
    )

    assert response.status_code == 400
    assert "draft_payload" in response.data


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_can_create_garage_contract_draft():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {"contract_type": "GARAGE", "draft_payload": {}},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["contract_type"] == Contract.ContractType.GARAGE


@pytest.mark.django_db
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
@pytest.mark.parametrize(
    ("contract_type", "draft_payload", "expected_prime"),
    [
        (
            Contract.ContractType.BUS_SCHOOL,
            {
                "vehicle": {
                    "fiscalPower": "8",
                    "seats": "30",
                    "duration": "3",
                    "periodicity": "MOIS",
                    "subcategory": "BUS",
                    "energy": "DIESEL",
                }
            },
            360_000,
        ),
        (
            Contract.ContractType.GARAGE,
            {
                "garage": {
                    "duration": "3",
                    "periodicity": "MOIS",
                    "subcategory": "GARAGE",
                    "nombreCarte": "2",
                }
            },
            120_000,
        ),
    ],
)
def test_can_calculate_bus_and_garage_quotes(
    contract_type,
    draft_payload,
    expected_prime,
):
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {"contract_type": contract_type, "draft_payload": draft_payload},
        format="json",
    )
    assert draft_response.status_code == 201

    response = client.post(f"/api/contracts/{draft_response.data['id']}/quote/")

    assert response.status_code == 200
    assert response.data["quote"]["prime_rc_ass"] == expected_prime


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_rejects_guarantee_option_without_required_guarantee():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "guarantees": [1],
                "guaranteeOptions": {"garantiesOptPT": "OPTION_1"},
                "vehicle": {"brand": "TOYOTA"},
            },
        },
        format="json",
    )

    assert response.status_code == 400
    assert "garantiesOptPT" in str(response.data["draft_payload"])


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_accepts_confirmed_guarantee_as_option_in_draft():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "guarantees": [1],
                "guaranteeOptions": {"garantiesOptAS": "OPTION_1"},
                "vehicle": {"brand": "TOYOTA"},
            },
        },
        format="json",
    )

    assert response.status_code == 201
    draft = Contract.objects.get(id=response.data["id"])
    assert draft.draft_payload["guaranteeOptions"]["garantiesOptAS"] == "OPTION_1"


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_can_create_fleet_draft_with_trailer_attached_to_vehicle():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "effectDate": "",
                    "duration": "",
                    "periodicity": "MOIS",
                    "personType": "MORALE",
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "registration": "AA-917-XQ",
                            "trailers": [
                                {
                                    "id": "rem-1",
                                    "tractorVehicleId": "veh-1",
                                    "registration": "REM-001",
                                    "subcategory": "REMORQUE",
                                }
                            ],
                        }
                    ]
                }
            },
        },
        format="json",
    )

    assert response.status_code == 201
    draft = Contract.objects.get(id=response.data["id"])
    trailer = draft.draft_payload["fleet"]["vehicles"][0]["trailers"][0]
    assert trailer["tractorVehicleId"] == "veh-1"


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_rejects_invalid_fleet_coverage_values_in_draft():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "effectDate": "",
                    "duration": "13",
                    "periodicity": "MOIS",
                    "personType": "MORALE",
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                        }
                    ],
                }
            },
        },
        format="json",
    )

    assert response.status_code == 400
    assert "ne peut pas dépasser 12 mois" in response.data["draft_payload"][0]


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_rejects_fleet_trailer_with_unknown_tractor():
    client, _ = make_authenticated_contract_client()

    response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "trailers": [
                                {
                                    "id": "rem-1",
                                    "tractorVehicleId": "missing-vehicle",
                                }
                            ],
                        }
                    ]
                }
            },
        },
        format="json",
    )

    assert response.status_code == 400
    assert "draft_payload" in response.data


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_calculate_auto_quote_from_ass_mock():
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )

    response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    assert response.status_code == 200
    assert response.data["internal_status"] == Contract.InternalStatus.QUOTE_READY
    # Le devis affiche la PrimeRC pure (ventilation coherente)...
    assert response.data["quote"]["prime_rc_ass"] == 24_000
    assert response.data["quote"]["policy_fee_ass"] == 3_000
    draft = Contract.objects.get(id=draft_response.data["id"])
    # ... mais l'assiette du contrat (commission/emission) est `data` ASS
    # = PrimeRC + CEDEAO (decision actee le 2026-06-11).
    assert draft.prime_rc_ass == 24_300
    assert draft.ttc_ass is None
    assert draft.ass_request_payload["puissanceFiscale"] == 8


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_calculate_quote_from_contract_detail_route():
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )

    response = client.post(f"/api/contracts/{draft_response.data['id']}/quote/")

    assert response.status_code == 200
    assert response.data["internal_status"] == Contract.InternalStatus.QUOTE_READY
    assert response.data["quote"]["prime_rc_ass"] == 24_000


@pytest.mark.django_db
@override_settings(DEBUG=False, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_contract_quote_route_is_filtered_by_authenticated_user_group():
    own_group = Organization.objects.create(name="Groupe Quote Own", code="QUOTE-OWN")
    other_group = Organization.objects.create(name="Groupe Quote Other", code="QUOTE-OTHER")
    admin_group = User.objects.create_user(
        username="quote-admin-group",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=own_group,
    )
    other_contributor = User.objects.create_user(
        username="quote-other-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=other_group,
    )
    other_contract = Contract.objects.create(
        organization=other_group,
        contributor=other_contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.DRAFT,
        draft_payload={
            "vehicle": {
                "brand": "TOYOTA",
                "subcategory": "VP",
                "energy": "ESSENCE",
                "fiscalPower": "8",
                "duration": "3",
                "registration": "AA-917-XQ",
            }
        },
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.post(f"/api/contracts/{other_contract.id}/quote/")

    assert response.status_code == 404


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_calculate_fleet_quote_with_trailer_from_ass_mock():
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "effectDate": "2026-07-01",
                    "duration": "3",
                    "periodicity": "MOIS",
                    "personType": "MORALE",
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "registration": "AA-917-XQ",
                            "energy": "ESSENCE",
                            "fiscalPower": "8",
                            "duration": "3",
                            "trailers": [
                                {
                                    "id": "rem-1",
                                    "tractorVehicleId": "veh-1",
                                    "registration": "REM-001",
                                    "subcategory": "REMORQUE",
                                }
                            ],
                        }
                    ]
                }
            },
        },
        format="json",
    )

    response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    assert response.status_code == 200
    # Par vehicule, l'assiette est `data` ASS = PrimeRC (24 000) + CEDEAO (300).
    assert response.data["quote"]["prime_rc_ass"] == 24_300
    assert response.data["quote"]["items"][0]["kind"] == "VEHICLE"
    assert response.data["quote"]["items"][1]["kind"] == "TRAILER"
    assert response.data["quote"]["items"][1]["prime_rc_ass"] == 0
    assert response.data["quote"]["warnings"] == []


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_rejects_fleet_quote_when_coverage_is_incomplete():
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "FLEET",
            "draft_payload": {
                "fleet": {
                    "vehicles": [
                        {
                            "id": "veh-1",
                            "brand": "TOYOTA",
                            "subcategory": "VP",
                            "registration": "AA-917-XQ",
                            "energy": "ESSENCE",
                            "fiscalPower": "8",
                        }
                    ]
                }
            },
        },
        format="json",
    )

    assert draft_response.status_code == 201

    response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    assert response.status_code == 400
    assert "date d'effet de la flotte est obligatoire" in response.data["detail"]
    assert "durée de la flotte est obligatoire" in response.data["detail"]
    assert "périodicité de la flotte est obligatoire" in response.data["detail"]
    assert "type de personne de la flotte est obligatoire" in response.data["detail"]


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_issue_is_blocked_without_confirmed_payment():
    client, _ = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )
    quote_response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")

    response = client.post(f"/api/contracts/{quote_response.data['contract_id']}/issue/")

    assert response.status_code == 400
    assert "paiement" in response.data["detail"].lower()


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_issue_is_blocked_without_policyholder_and_insured():
    client, contributor = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )
    quote_response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")
    contract_id = quote_response.data["contract_id"]
    finance = User.objects.create_user(
        username="finance-no-person",
        password="test",
        role=User.Role.FINANCE,
        organization=contributor.organization,
    )
    client.force_authenticate(finance)
    client.post(
        f"/api/contracts/{contract_id}/payments/confirm/",
        {"amount": 31_980, "external_reference": "PAY-NO-PERSON"},
        format="json",
    )
    client.force_authenticate(contributor)

    response = client.post(f"/api/contracts/{contract_id}/issue/")

    assert response.status_code == 400
    assert "Souscripteur" in response.data["detail"]


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_can_confirm_payment_then_issue_mock_contract():
    client, contributor = make_authenticated_contract_client()
    draft_response = client.post(
        "/api/contracts/drafts/",
        {
            "contract_type": "AUTO_MONO",
            "draft_payload": {
                "guarantees": [1],
                "policyholder": TEST_POLICYHOLDER,
                "insured": TEST_POLICYHOLDER,
                "vehicle": {
                    "brand": "TOYOTA",
                    "subcategory": "VP",
                    "energy": "ESSENCE",
                    "fiscalPower": "8",
                    "duration": "3",
                    "registration": "AA-917-XQ",
                }
            },
        },
        format="json",
    )
    quote_response = client.post(f"/api/contracts/drafts/{draft_response.data['id']}/quote/")
    contract_id = quote_response.data["contract_id"]
    finance = User.objects.create_user(
        username="finance-payment",
        password="test",
        role=User.Role.FINANCE,
        organization=contributor.organization,
    )
    client.force_authenticate(finance)

    payment_response = client.post(
        f"/api/contracts/{contract_id}/payments/confirm/",
        {"amount": 31_980, "external_reference": "PAY-TEST"},
        format="json",
    )
    client.force_authenticate(contributor)
    issue_response = client.post(f"/api/contracts/{contract_id}/issue/")

    assert payment_response.status_code == 200
    assert payment_response.data["payment"]["status"] == Payment.Status.CONFIRMED
    assert issue_response.status_code == 200
    assert issue_response.data["internal_status"] == Contract.InternalStatus.ISSUED
    assert issue_response.data["ass_status"] == Contract.AssStatus.VALIDATED
    assert issue_response.data["attestation_number"] == "SNMOCK0001"

    contract = Contract.objects.get(id=contract_id)
    assert contract.internal_status == Contract.InternalStatus.ISSUED
    assert contract.reference_trx_partner.startswith("HORUS-")
    assert contract.ttc_ass == 31_980
    assert contract.ass_issue_request_payload["garanties"] == [1]
    assert contract.ass_issue_request_payload["souscripteur"]["nom"] == "DIOP"
    assert CommissionSnapshot.objects.filter(contract=contract).exists()


@pytest.mark.django_db
@override_settings(DEBUG=True, ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_issue_is_blocked_when_contributor_commission_is_not_configured():
    organization = Organization.objects.create(name="Groupe Test", code="TEST-COM")
    contributor = User.objects.create_user(
        username="apporteur-no-commission",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.PAID,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
        ttc_ass=27_000,
        draft_payload={
            "vehicle": {
                "brand": "TOYOTA",
                "subcategory": "VP",
                "energy": "ESSENCE",
                "fiscalPower": "8",
                "duration": "3",
                "registration": "AA-917-XQ",
            }
        },
    )
    Payment.objects.create(
        contract=contract,
        amount=27_000,
        status=Payment.Status.CONFIRMED,
    )
    client = APIClient()
    client.force_authenticate(contributor)

    response = client.post(f"/api/contracts/{contract.id}/issue/")

    assert response.status_code == 400
    assert "Commission non configuree" in response.data["detail"]


@pytest.mark.django_db
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_contributor_cannot_cancel_own_issued_contract():
    client, contributor = make_authenticated_contract_client()
    contract = Contract.objects.create(
        organization=contributor.organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
        reference_trx_partner="HORUS-CANCEL-DENIED",
    )

    response = client.post(
        f"/api/contracts/{contract.id}/cancel/",
        {"methode": "ANNULER", "motif": "Test permission"},
        format="json",
    )

    assert response.status_code == 403
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.ISSUED


@pytest.mark.django_db
@override_settings(ASS_MOCK_ENABLED=True, ASS_REAL_CALLS_ALLOWED=False)
def test_group_admin_can_cancel_issued_contract_in_own_group():
    organization = Organization.objects.create(name="Groupe Cancel Admin", code="CANCEL-ADMIN")
    contributor = User.objects.create_user(
        username="cancel-admin-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    admin_group = User.objects.create_user(
        username="cancel-group-admin",
        password="test",
        role=User.Role.ADMIN_GROUP,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.ISSUED,
        reference_trx_partner="HORUS-CANCEL-ALLOWED",
    )
    client = APIClient()
    client.force_authenticate(admin_group)

    response = client.post(
        f"/api/contracts/{contract.id}/cancel/",
        {"methode": "ANNULER", "motif": "Correction admin"},
        format="json",
    )

    assert response.status_code == 200
    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.CANCELLED


@pytest.mark.django_db
def test_group_admin_cannot_rename_or_delete_custom_brands():
    # Decision actee 2026-06-12 : referentiel global, seul l'admin general
    # peut renommer/supprimer ; l'admin groupe garde la consultation.
    group_admin = User.objects.create_user(
        username="brand-group-admin-readonly",
        password="test",
        role=User.Role.ADMIN_GROUP,
    )
    brand = VehicleBrand.objects.create(
        value="SCOPING HORUS TEST", name="SCOPING HORUS TEST"
    )
    client = APIClient()
    client.force_authenticate(group_admin)

    list_response = client.get("/api/referentials/custom-vehicle-brands/")
    rename_response = client.patch(
        f"/api/referentials/custom-vehicle-brands/{brand.id}/",
        {"name": "Scoping Renomme"},
        format="json",
    )
    delete_response = client.delete(
        f"/api/referentials/custom-vehicle-brands/{brand.id}/"
    )

    assert list_response.status_code == 200
    assert rename_response.status_code == 403
    assert delete_response.status_code == 403
    brand.refresh_from_db()
    assert brand.name == "SCOPING HORUS TEST"
