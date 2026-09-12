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


class FleetPartialFailureAssClient:
    """Flotte emise avec succes, puis echec HTTP sur l'emission de la remorque."""

    def issue_fleet_contract(self, payload):
        return {
            "operationStatus": "SUCCESS",
            "operationMessage": "Emission flotte test reussie.",
            "items": [
                {
                    "referenceExterne": item["referenceTrxPartner"],
                    "attestationNumber": f"SN-FLEET-{index}",
                    "dateExpiration": "2026-09-09T23:59:59",
                    "linkAttestation": "https://example.test/attestation/fleet",
                    "linkCarteBrune": "https://example.test/cedeao/fleet",
                    "immatriculation": item["vehicule"]["immatriculation"],
                }
                for index, item in enumerate(payload["items"], start=1)
            ],
        }

    def issue_trailer_contract(self, payload):
        from integrations.ass.exceptions import AssApiError

        raise AssApiError(
            "Echec appel ASS /remorque.qrcode.request (HTTP 400)",
            status_code=400,
            response_body={"error": "UserError", "error_descrip": "Echec remorque simule"},
        )


def create_paid_fleet_contract():
    organization = Organization.objects.create(name="Groupe Flotte", code="FLOTTE")
    contributor = User.objects.create_user(
        username="fleet-contributor",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    return Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.FLEET,
        internal_status=Contract.InternalStatus.PAID,
        prime_rc_ass=12_000,
        cout_police_ass=3_000,
        ttc_ass=15_000,
        draft_payload={
            "guarantees": [],
            "policyholder": POLICYHOLDER,
            "insured": POLICYHOLDER,
            "fleet": {
                "effectDate": "2026-06-12",
                "duration": "12",
                "periodicity": "MOIS",
                "personType": "MORALE",
                "vehicles": [
                    {
                        "id": "veh-1",
                        "brand": "RENAULT",
                        "model": "LOGAN",
                        "subcategory": "VP",
                        "energy": "ESSENCE",
                        "fiscalPower": "8",
                        "seats": "5",
                        "duration": "12",
                        "periodicity": "MOIS",
                        "effectDate": "2026-06-12",
                        "registration": "DK-1111-AA",
                        "trailers": [
                            {
                                "id": "rem-1",
                                "tractorVehicleId": "veh-1",
                                "registration": "DK-2222-RR",
                                "brand": "TITAN",
                                "model": "R20",
                            }
                        ],
                    }
                ],
            },
        },
        ass_response_payload={
            "flotte": {
                "status": "SUCCESS",
                "items": [{"requestId": "veh-1", "responsabiliteCivile": 12_000}],
            },
            "remorques": [{"trailer_id": "rem-1", "prime_rc_ass": 0}],
        },
    )


@pytest.mark.django_db
def test_fleet_partial_failure_persists_partial_ass_exchanges():
    from integrations.ass.exceptions import AssApiError

    contract = create_paid_fleet_contract()
    Payment.objects.create(
        contract=contract,
        amount=contract.ttc_ass,
        status=Payment.Status.CONFIRMED,
    )

    with pytest.raises(AssApiError, match="remorque"):
        issue_contract(contract, ass_client=FleetPartialFailureAssClient())

    contract.refresh_from_db()
    # Liberation : retour a PAID, pret pour reprise avec la meme reference.
    assert contract.internal_status == Contract.InternalStatus.PAID
    assert contract.issuance_started_at is None
    # Les echanges deja effectues sont persistes : la flotte a ete emise
    # (QR consommes cote ASS), la remorque tentee, l'erreur conservee.
    assert contract.ass_issue_request_payload["flotte"]["items"]
    assert len(contract.ass_issue_request_payload["remorques"]) == 1
    fleet_items = contract.ass_issue_response_payload["flotte"]["items"]
    assert fleet_items[0]["attestationNumber"] == "SN-FLEET-1"
    assert contract.ass_issue_response_payload["erreur_emission"] == {
        "error": "UserError",
        "error_descrip": "Echec remorque simule",
    }


@pytest.mark.django_db
def test_cancel_fleet_contract_is_blocked_with_clear_message():
    from contracts.services import ContractCancelError, cancel_contract

    contract = create_paid_fleet_contract()
    contract.internal_status = Contract.InternalStatus.ISSUED
    contract.reference_trx_partner = "HORUS-FLEET-CANCEL-TEST"
    contract.save(update_fields=["internal_status", "reference_trx_partner", "updated_at"])

    with pytest.raises(ContractCancelError, match="flotte"):
        cancel_contract(contract, method="ANNULER")

    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.ISSUED


class OutOfStockAssClient:
    """Stock QR a zero : l'emission doit etre bloquee avant tout appel d'emission."""

    def stock_qr(self, payload=None):
        return {
            "operationStatus": "SUCCESS",
            "operationMessage": "Stock QR.",
            "data": "0.0",
        }

    def issue_auto_contract(self, payload):
        raise AssertionError("L'emission ne doit pas etre tentee sans stock QR.")


@pytest.mark.django_db
def test_issue_is_blocked_with_clear_message_when_qr_stock_is_empty():
    contract = create_paid_contract()

    with pytest.raises(ContractIssueError, match="epuise"):
        issue_contract(contract, ass_client=OutOfStockAssClient())

    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAID
    assert contract.issuance_started_at is None


class NeverCalledAssClient:
    """Aucun appel ASS ne doit partir quand le doublon est detecte en amont."""

    def stock_qr(self, payload=None):
        raise AssertionError("Le stock QR ne doit pas etre interroge sur un doublon.")

    def issue_auto_contract(self, payload):
        raise AssertionError("L'emission ne doit pas etre tentee sur un doublon.")


def _already_insured_contract(effect_date="2026-06-10"):
    # "AAS" dans la plaque = sentinelle du mock AAS Diotali : vehicule deja
    # assure, contrat existant du 01/01/2026 au 31/12/2026.
    contract = create_paid_contract()
    contract.draft_payload["vehicle"]["registration"] = "AAS-001-XQ"
    contract.draft_payload["vehicle"]["effectDate"] = effect_date
    contract.save(update_fields=["draft_payload"])
    return contract


@pytest.mark.django_db
def test_issue_is_blocked_when_aas_diotali_reports_vehicle_already_insured():
    """Le blocage ne vit pas qu'en React : un appel direct a l'API bute ici.

    Sans ce filet, un brouillon repris ou un client API contournait la
    verification du formulaire et brulait un QR reel sur un doublon — qu'ASS
    ne refuse qu'APRES l'avoir consomme.
    """
    contract = _already_insured_contract()

    with pytest.raises(ContractIssueError, match="deja assure"):
        issue_contract(contract, ass_client=NeverCalledAssClient())

    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAID
    assert contract.issuance_started_at is None


@pytest.mark.django_db
def test_issue_passes_when_existing_insurance_expires_before_new_effect_date():
    """Echeance existante depassee : le vehicule n'est plus couvert, on emet."""
    contract = _already_insured_contract(effect_date="2027-03-01")

    result = issue_contract(contract, ass_client=SuccessfulAssClient(contract.id))

    assert result["internal_status"] == Contract.InternalStatus.ISSUED


@pytest.mark.django_db
def test_issue_verifies_every_fleet_registration_including_trailers():
    contract = create_paid_contract()
    contract.contract_type = Contract.ContractType.FLEET
    contract.draft_payload = {
        "guarantees": [1],
        "policyholder": POLICYHOLDER,
        "insured": POLICYHOLDER,
        "fleet": {
            "effectDate": "2026-06-10",
            "vehicles": [
                {"registration": "BB-123-CC", "trailers": [{"registration": "AAS-777-RR"}]},
            ],
        },
    }
    contract.save(update_fields=["contract_type", "draft_payload"])

    with pytest.raises(ContractIssueError, match="deja assure"):
        issue_contract(contract, ass_client=NeverCalledAssClient())


class AlreadyInsuredAtAssClient:
    """La base ASS declare le vehicule couvert ; le registre public l'ignore."""

    def verify_registration(self, payload):
        # `status` ERREUR dans les deux cas : seul le code 5006 distingue.
        self.seen = payload["immatriculation"]
        return {
            "code": "5006",
            "message": (
                "Ce vehicule AA-917-XQ dispose deja d'une police "
                "d'assurance chez: ASKIA"
            ),
            "status": "ERREUR",
            "data": "",
        }

    def stock_qr(self, payload=None):
        raise AssertionError("Le stock QR ne doit pas etre interroge sur un doublon.")

    def issue_auto_contract(self, payload):
        raise AssertionError("L'emission ne doit pas etre tentee sur un doublon.")


class FreeAtAssClient(SuccessfulAssClient):
    """Base ASS interrogee, vehicule libre (code 4000) : l'emission continue."""

    def verify_registration(self, payload):
        self.verified = payload["immatriculation"]
        return {
            "code": "4000",
            "message": "L'attestation d'assurance n'est pas valide.",
            "status": "ERROR",
            "data": "",
        }


@pytest.mark.django_db
def test_issue_is_blocked_when_ass_knows_the_vehicle_is_already_insured():
    """Doublon connu d'ASS mais absent du registre public : bloque avant le QR.

    C'est le trou que le registre Diotali seul laissait : on ne l'apprenait
    qu'au retour de `qrcode.request`, en pleine emission.
    """
    contract = create_paid_contract()

    with pytest.raises(ContractIssueError, match="ASKIA"):
        issue_contract(contract, ass_client=AlreadyInsuredAtAssClient())

    contract.refresh_from_db()
    assert contract.internal_status == Contract.InternalStatus.PAID


@pytest.mark.django_db
def test_issue_asks_ass_with_the_canonical_registration():
    """La plaque part chez ASS sous la forme tiretee de leurs propres exemples."""
    contract = create_paid_contract()
    contract.draft_payload["vehicle"]["registration"] = "aa917vl"
    contract.save(update_fields=["draft_payload"])
    client = FreeAtAssClient(contract.id)

    issue_contract(contract, ass_client=client)

    assert client.verified == "AA-917-VL"


class AssProductionCoverageClient(SuccessfulAssClient):
    """Reponse REELLE de la production ASS (2026-09-12) : code 2000 + contrat.

    Rien ne ressemble a la sandbox : `status` SUCCESS, et `data` est le `repr`
    Python d'un dictionnaire, pas du JSON.
    """

    expire_at = "2026-10-11 23:59:59"

    def verify_registration(self, payload):
        self.verified = payload["immatriculation"]
        return {
            "code": "2000",
            "message": "Opération effectuée avec succès.",
            "status": "SUCCESS",
            "data": (
                "{'police': '26422026500570635', "
                "'attestationNumber': 'SN004EQE79H', "
                "'dateEffet': '2026-09-12', "
                f"'expireAt': '{self.expire_at}', "
                "'vehicule': {'immatriculation': 'AA917VL', "
                "'marque': 'RENAULT', 'modele': '770KB'}}"
            ),
        }


@pytest.mark.django_db
def test_issue_is_blocked_on_the_production_shape_of_verif_immatriculation():
    """La prod repond 2000/SUCCESS avec le contrat, pas 5006 comme la sandbox."""
    contract = create_paid_contract()
    contract.draft_payload["vehicle"]["effectDate"] = "2026-09-20"
    contract.save(update_fields=["draft_payload"])

    with pytest.raises(ContractIssueError, match="RENAULT 770KB"):
        issue_contract(contract, ass_client=AssProductionCoverageClient(contract.id))


@pytest.mark.django_db
def test_issue_passes_when_the_ass_coverage_expires_before_the_new_effect_date():
    """Renouvellement anticipe : la couverture ASS s'arrete avant la date d'effet."""
    contract = create_paid_contract()
    contract.draft_payload["vehicle"]["effectDate"] = "2026-12-01"
    contract.save(update_fields=["draft_payload"])

    result = issue_contract(contract, ass_client=AssProductionCoverageClient(contract.id))

    assert result["internal_status"] == Contract.InternalStatus.ISSUED
