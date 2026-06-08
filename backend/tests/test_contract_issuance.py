import pytest

from accounts.models import User
from commissions.models import CommissionSnapshot
from contracts.models import Contract
from contracts.services import ContractIssueError, issue_contract
from organizations.models import Organization
from payments.models import Payment


POLICYHOLDER = {
    "lastName": "DIOP",
    "firstName": "Awa",
    "phone": "771112233",
    "email": "awa.diop@example.test",
}


def create_paid_contract():
    organization = Organization.objects.create(
        name="Groupe Emission",
        code="EMISSION",
    )
    contributor = User.objects.create_user(
        username="issuance-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
        commission_percent_on_prime_rc=0,
        commission_fixed_on_policy_fee=0,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        internal_status=Contract.InternalStatus.PAID,
        prime_rc_ass=24_000,
        cout_police_ass=3_000,
        ttc_ass=31_980,
        draft_payload={
            "guarantees": [1],
            "policyholder": POLICYHOLDER,
            "insured": POLICYHOLDER,
            "vehicle": {
                "brand": "TOYOTA",
                "model": "YARIS",
                "subcategory": "VP",
                "energy": "ESSENCE",
                "fiscalPower": "8",
                "duration": "3",
                "periodicity": "MOIS",
                "effectDate": "2026-06-10",
                "registration": "AA-917-XQ",
            },
        },
    )
    Payment.objects.create(
        contract=contract,
        amount=contract.ttc_ass,
        status=Payment.Status.CONFIRMED,
    )
    return contract


class SuccessfulAssClient:
    def __init__(self, contract_id):
        self.contract_id = contract_id
        self.references = []

    def issue_auto_contract(self, payload):
        contract = Contract.objects.get(pk=self.contract_id)
        assert contract.internal_status == Contract.InternalStatus.ISSUING
        assert contract.issuance_started_at is not None
        assert contract.reference_trx_partner == payload["referenceTrxPartner"]
        self.references.append(payload["referenceTrxPartner"])
        return {
            "operationStatus": "SUCCESS",
            "operationMessage": "Emission test reussie.",
            "data": {
                "referenceExterne": payload["referenceTrxPartner"],
                "attestationNumber": "SN-IDEMPOTENT-1",
                "secureKey": "SECURE-IDEMPOTENT-1",
                "dateExpiration": "2026-09-09T23:59:59",
                "linkAttestation": "https://example.test/attestation/idempotent",
                "linkCarteBrune": "https://example.test/cedeao/idempotent",
                "immatriculation": "AA-917-XQ",
            },
        }


class FailingAssClient:
    def __init__(self):
        self.references = []

    def issue_auto_contract(self, payload):
        self.references.append(payload["referenceTrxPartner"])
        raise ContractIssueError("Echec ASS simule.")


class UnexpectedAssClient:
    def issue_auto_contract(self, payload):
        raise AssertionError(f"Appel ASS inattendu pour {payload}")


@pytest.mark.django_db
def test_issue_reserves_reference_before_ass_call_and_finalizes_once():
    contract = create_paid_contract()
    client = SuccessfulAssClient(contract.id)

    result = issue_contract(contract, ass_client=client)

    contract.refresh_from_db()
    assert result["internal_status"] == Contract.InternalStatus.ISSUED
    assert contract.internal_status == Contract.InternalStatus.ISSUED
    assert contract.issuance_started_at is None
    assert client.references == [contract.reference_trx_partner]
    assert CommissionSnapshot.objects.filter(contract=contract).count() == 1


@pytest.mark.django_db
def test_issue_returns_existing_result_without_calling_ass_again():
    contract = create_paid_contract()
    first_client = SuccessfulAssClient(contract.id)
    first_result = issue_contract(contract, ass_client=first_client)

    second_result = issue_contract(
        Contract.objects.get(pk=contract.id),
        ass_client=UnexpectedAssClient(),
    )

    assert second_result == first_result
    assert CommissionSnapshot.objects.filter(contract=contract).count() == 1


@pytest.mark.django_db
def test_issue_rejects_second_request_while_first_is_reserved():
    contract = create_paid_contract()
    contract.internal_status = Contract.InternalStatus.ISSUING
    contract.reference_trx_partner = "HORUS-EMISSION-EN-COURS"
    contract.save(update_fields=["internal_status", "reference_trx_partner", "updated_at"])

    with pytest.raises(ContractIssueError, match="deja en cours"):
        issue_contract(contract, ass_client=UnexpectedAssClient())


@pytest.mark.django_db
def test_failed_issue_releases_reservation_and_retry_reuses_reference():
    contract = create_paid_contract()
    failing_client = FailingAssClient()

    with pytest.raises(ContractIssueError, match="Echec ASS simule"):
        issue_contract(contract, ass_client=failing_client)

    contract.refresh_from_db()
    reserved_reference = contract.reference_trx_partner
    assert contract.internal_status == Contract.InternalStatus.PAID
    assert contract.issuance_started_at is None
    assert failing_client.references == [reserved_reference]

    successful_client = SuccessfulAssClient(contract.id)
    issue_contract(contract, ass_client=successful_client)

    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.ISSUED
    assert contract.reference_trx_partner == reserved_reference
    assert successful_client.references == [reserved_reference]
