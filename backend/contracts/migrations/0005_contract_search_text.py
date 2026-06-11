from django.db import migrations, models


def backfill_contract_search_text(apps, schema_editor):
    Contract = apps.get_model("contracts", "Contract")
    pending = []

    for contract in (
        Contract.objects.select_related("organization", "contributor")
        .all()
        .iterator(chunk_size=500)
    ):
        contract.search_text = build_search_text(contract)
        pending.append(contract)
        if len(pending) >= 500:
            Contract.objects.bulk_update(pending, ["search_text"])
            pending.clear()

    if pending:
        Contract.objects.bulk_update(pending, ["search_text"])


def build_search_text(contract):
    draft_payload = contract.draft_payload if isinstance(contract.draft_payload, dict) else {}
    issue_payload = (
        contract.ass_issue_request_payload
        if isinstance(contract.ass_issue_request_payload, dict)
        else {}
    )
    policyholder = as_dict(
        draft_payload.get("policyholder") or draft_payload.get("souscripteur")
    )
    vehicle = as_dict(draft_payload.get("vehicle"))
    garage = as_dict(draft_payload.get("garage"))
    fleet = as_dict(draft_payload.get("fleet"))
    fleet_issue = as_dict(issue_payload.get("flotte"))

    values = [
        contract.immatriculation,
        contract.attestation_number,
        contract.reference_externe,
        issue_payload.get("police"),
        fleet_issue.get("police"),
        policyholder.get("firstName"),
        policyholder.get("first_name"),
        policyholder.get("prenom"),
        policyholder.get("lastName"),
        policyholder.get("last_name"),
        policyholder.get("nom"),
        policyholder.get("raisonSociale"),
        policyholder.get("phone"),
        policyholder.get("cellulaire"),
        policyholder.get("telephone"),
        vehicle.get("brand"),
        vehicle.get("marque"),
        vehicle.get("model"),
        vehicle.get("modele"),
        vehicle.get("registration"),
        vehicle.get("immatriculation"),
        vehicle.get("chassis"),
        garage.get("registration"),
        garage.get("immatriculation"),
    ]

    for fleet_vehicle in fleet.get("vehicles", []):
        if not isinstance(fleet_vehicle, dict):
            continue
        values.extend(
            [
                fleet_vehicle.get("brand"),
                fleet_vehicle.get("marque"),
                fleet_vehicle.get("model"),
                fleet_vehicle.get("modele"),
                fleet_vehicle.get("registration"),
                fleet_vehicle.get("immatriculation"),
                fleet_vehicle.get("chassis"),
            ]
        )
        for trailer in fleet_vehicle.get("trailers", []):
            if isinstance(trailer, dict):
                values.extend(
                    [
                        trailer.get("brand"),
                        trailer.get("marque"),
                        trailer.get("model"),
                        trailer.get("modele"),
                        trailer.get("registration"),
                        trailer.get("immatriculation"),
                    ]
                )

    if contract.organization_id:
        values.append(contract.organization.name)
    if contract.contributor_id:
        values.extend(
            [
                contract.contributor.username,
                contract.contributor.first_name,
                contract.contributor.last_name,
            ]
        )

    return " ".join(
        str(value).strip()
        for value in values
        if value is not None and str(value).strip()
    ).upper()


def as_dict(value):
    return value if isinstance(value, dict) else {}


class Migration(migrations.Migration):
    dependencies = [
        ("contracts", "0004_contract_issuance_started_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="contract",
            name="search_text",
            field=models.TextField(blank=True, editable=False),
        ),
        migrations.RunPython(
            backfill_contract_search_text,
            migrations.RunPython.noop,
        ),
    ]
