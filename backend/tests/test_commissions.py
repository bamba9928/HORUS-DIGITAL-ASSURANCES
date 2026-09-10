from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from accounts.models import User
from commissions.models import CommissionSnapshot
from commissions.services import (
    build_commission_snapshot_values,
    calculate_commission_amounts,
    net_a_verser,
)
from contracts.models import Contract
from integrations.ass.constants import ASS_POLICY_FEE
from organizations.models import Organization


def test_net_a_verser_is_ttc_minus_policy_fee():
    """Ce que l'apporteur paie via Orange Money avant emission."""
    assert ASS_POLICY_FEE == 3_000
    assert net_a_verser(ttc_ass=65_000) == 62_000


def test_default_rate_splits_between_contributor_horus_and_ass():
    result = calculate_commission_amounts(
        prime_nette=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )

    # L'apporteur retient le cout de police a la source.
    assert result["commission_total"] == 3_000
    assert result["commission_policy_fee_amount"] == 3_000
    assert result["commission_prime_rc_amount"] == 0
    assert result["commission_percent_used"] == Decimal("0")
    # Horus garde 20 % de la prime nette.
    assert result["ass_partner_commission_rate_used"] == Decimal("20")
    assert result["ass_partner_commission"] == 10_000
    assert result["marge_horus"] == 10_000
    # ASS recoit le solde du net a verser (62 000 - 10 000).
    assert result["montant_reverse_ass"] == 52_000
    # Le compte est juste : apporteur + Horus + ASS = TTC.
    assert 3_000 + 10_000 + 52_000 == 65_000


def test_tpc_rate_is_forty_percent():
    result = calculate_commission_amounts(
        prime_nette=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
        ass_partner_commission_rate=40,
    )

    assert result["ass_partner_commission"] == 20_000
    assert result["marge_horus"] == 20_000
    assert result["montant_reverse_ass"] == 42_000


def test_commission_is_rounded_half_up():
    result = calculate_commission_amounts(
        prime_nette=2_377,  # 20 % = 475,4
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=10_000,
    )
    assert result["ass_partner_commission"] == 475


def test_rejects_policy_fee_above_ttc():
    with pytest.raises(ValidationError, match="net a verser serait negatif"):
        calculate_commission_amounts(
            prime_nette=1_000,
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=2_000,
        )


def test_rejects_commission_above_collected_amount():
    """Garde-fou : une prime nette incoherente avec le TTC ne doit pas passer."""
    with pytest.raises(ValidationError, match="depasse le montant encaisse"):
        calculate_commission_amounts(
            prime_nette=200_000,  # 20 % = 40 000, pour un net a verser de 2 000
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=5_000,
        )


def test_rejects_negative_rate():
    with pytest.raises(ValidationError, match="ne peut pas etre negatif"):
        calculate_commission_amounts(
            prime_nette=50_000,
            ttc_ass=65_000,
            ass_partner_commission_rate=-1,
        )


@pytest.mark.django_db
def test_snapshot_does_not_depend_on_contributor_commission_fields():
    """La regle est uniforme : aucun bareme par compte n'existe plus."""
    organization = Organization.objects.create(name="Groupe Thies", code="THS")
    contributor = User.objects.create_user(
        username="apporteur-thies",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )
    values = build_commission_snapshot_values(
        prime_nette=contract.prime_rc_ass,
        cout_police_ass=contract.cout_police_ass,
        ttc_ass=contract.ttc_ass,
        ass_partner_commission_rate=20,
    )
    snapshot = CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        **values,
    )

    snapshot.refresh_from_db()
    assert snapshot.commission_total == 3_000
    assert snapshot.ass_partner_commission == 10_000
    assert snapshot.montant_reverse_ass == 52_000
    assert snapshot.marge_horus == 10_000
    assert snapshot.net_a_verser == 62_000


@pytest.mark.django_db
def test_snapshot_freezes_the_rate_used():
    """Le bareme peut changer : le contrat emis reste auditable."""
    organization = Organization.objects.create(name="Groupe Louga", code="LGA")
    contributor = User.objects.create_user(
        username="apporteur-louga",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )
    contract = Contract.objects.create(
        organization=organization,
        contributor=contributor,
        contract_type=Contract.ContractType.AUTO_MONO,
        prime_rc_ass=50_000,
        cout_police_ass=ASS_POLICY_FEE,
        ttc_ass=65_000,
    )
    snapshot = CommissionSnapshot.objects.create(
        contract=contract,
        contributor=contributor,
        **build_commission_snapshot_values(
            prime_nette=50_000,
            cout_police_ass=ASS_POLICY_FEE,
            ttc_ass=65_000,
            ass_partner_commission_rate=40,
        ),
    )

    snapshot.refresh_from_db()
    assert snapshot.ass_partner_commission_rate_used == Decimal("40.00")
    assert snapshot.ass_partner_commission == 20_000


# ─── Filtre serveur et semantique du statut (2026-09-09) ─────────────────────


@pytest.mark.django_db
def test_commission_list_filters_by_status_on_the_server():
    """Le front filtrait la liste complete en memoire : il telechargeait tout."""
    from accounts.models import User
    from commissions.models import CommissionSnapshot
    from contracts.models import Contract
    from organizations.models import Organization
    from rest_framework.test import APIClient

    organization = Organization.objects.create(name="Groupe Filtre", code="FILTRE")
    admin = User.objects.create_user(
        username="admin-filtre",
        password="test",
        role=User.Role.ADMIN_GENERAL,
        organization=organization,
    )
    contributor = User.objects.create_user(
        username="apporteur-filtre",
        password="test",
        role=User.Role.CONTRIBUTOR,
        organization=organization,
    )

    def make_snapshot(status):
        contract = Contract.objects.create(
            organization=organization,
            contributor=contributor,
            contract_type=Contract.ContractType.AUTO_MONO,
            internal_status=Contract.InternalStatus.ISSUED,
            prime_rc_ass=24_000,
            cout_police_ass=3_000,
            ttc_ass=27_000,
        )
        return CommissionSnapshot.objects.create(
            contract=contract,
            contributor=contributor,
            status=status,
            prime_rc_ass=24_000,
            cout_police_ass=3_000,
            ttc_ass=27_000,
            commission_percent_used=0,
            commission_fixed_policy_fee_used=3_000,
            commission_prime_rc_amount=0,
            commission_policy_fee_amount=3_000,
            commission_total=3_000,
            ass_partner_commission=4_800,
            montant_reverse_ass=19_200,
            marge_horus=4_800,
        )

    make_snapshot(CommissionSnapshot.Status.PENDING)
    paid = make_snapshot(CommissionSnapshot.Status.PAID)

    client = APIClient()
    client.force_authenticate(admin)

    assert len(client.get("/api/commissions/snapshots/").data["results"]) == 2

    filtered = client.get("/api/commissions/snapshots/?status=PAID").data["results"]
    assert [item["id"] for item in filtered] == [paid.id]

    # Un statut inconnu est ignore plutot que de renvoyer une liste vide.
    assert len(client.get("/api/commissions/snapshots/?status=NIMPORTE").data["results"]) == 2


def test_commission_status_labels_describe_the_ass_reversal():
    """Le statut suit le reversement a ASS, pas un versement a l'apporteur.

    L'apporteur a deja retenu le cout de police a la source : « Payable » puis
    « Payee » decrivaient un paiement qui n'existe pas.
    """
    from commissions.models import CommissionSnapshot

    assert CommissionSnapshot.Status.PENDING.label == "A reverser"
    assert CommissionSnapshot.Status.PAYABLE.label == "Pret a reverser"
    assert CommissionSnapshot.Status.PAID.label == "Reverse a ASS"


# ─── Remise Horus sur les genres TPC (2026-09-10) ────────────────────────────


def test_horus_rebate_completes_the_ass_remise_on_tpc():
    """ASS plafonne sa remise a 20 %, Horus complete les 20 points manquants.

    Le bareme TPC est passe a 40 % sur les comptes classiques d'ASS, mais leur
    API refuse toujours `remise_rc > 20` (HTTP 400 verifie en production le
    2026-09-10). Un client TPC souscrivant par la plateforme paierait donc
    20 points de plus qu'au guichet : Horus comble l'ecart sur sa commission.
    """
    from contracts.models import Contract
    from contracts.services import contract_horus_rebate

    reponse_ass = {
        "operationStatus": "SUCCESS",
        "PrimeRC": "3162",      # nette des 20 % appliques par ASS
        "Reduction": "791",     # ... soit 20 % de la brute 3953
        "CoutPolice": "3000",
        "Taxe": "863",
        "Cedeao": "300",
        "Fga": "79",
        "PrimeTotale": "7404",
    }
    tpc = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        draft_payload={"vehicle": {"subcategory": "TPC"}},
        ass_response_payload=reponse_ass,
    )
    vp = Contract(
        contract_type=Contract.ContractType.AUTO_MONO,
        draft_payload={"vehicle": {"subcategory": "VP"}},
        ass_response_payload=reponse_ass,
    )

    # 20 % de la prime RC BRUTE (3162 + 791), la meme assiette qu'ASS.
    assert contract_horus_rebate(tpc) == 791
    # Hors TPC, ASS applique deja la totalite du bareme : rien a completer.
    assert contract_horus_rebate(vp) == 0


def test_horus_rebate_comes_out_of_the_margin_never_out_of_the_ass_share():
    """La remise est un geste de Horus : ASS touche la meme chose qu'ailleurs."""
    from commissions.services import calculate_commission_amounts

    sans = calculate_commission_amounts(
        prime_nette=4_253, ttc_ass=7_404, cout_police_ass=3_000,
        ass_partner_commission_rate=40,
    )
    avec = calculate_commission_amounts(
        prime_nette=4_253, ttc_ass=7_404, cout_police_ass=3_000,
        ass_partner_commission_rate=40, remise_horus=791,
    )

    # Ce que Horus doit a ASS ne bouge pas d'un franc.
    assert avec["montant_reverse_ass"] == sans["montant_reverse_ass"] == 4_404 - 1_701
    # La remise sort integralement de la marge de Horus.
    assert sans["marge_horus"] == 1_701
    assert avec["marge_horus"] == 1_701 - 791
    assert avec["remise_horus"] == 791


def test_the_books_balance_with_a_horus_rebate():
    """Encaisse - reverse a ASS = marge. L'invariant doit tenir avec la remise."""
    from commissions.services import calculate_commission_amounts, net_a_verser

    values = calculate_commission_amounts(
        prime_nette=4_253, ttc_ass=7_404, cout_police_ass=3_000,
        ass_partner_commission_rate=40, remise_horus=791,
    )
    encaisse = net_a_verser(ttc_ass=7_404, cout_police_ass=3_000, remise_horus=791)

    assert encaisse == 3_613
    assert encaisse - values["montant_reverse_ass"] == values["marge_horus"]


def test_a_rebate_larger_than_the_commission_is_refused():
    """Garde-fou : Horus ne doit jamais payer pour vendre."""
    import pytest as _pytest
    from django.core.exceptions import ValidationError

    from commissions.services import calculate_commission_amounts

    with _pytest.raises(ValidationError, match="paierait pour vendre"):
        calculate_commission_amounts(
            prime_nette=1_000, ttc_ass=7_404, cout_police_ass=3_000,
            ass_partner_commission_rate=20, remise_horus=5_000,
        )
