from django.db import migrations


IDENTITY_FIELDS = [
    "policyholder_last_name",
    "policyholder_first_name",
    "policyholder_phone",
    "policyholder_email",
    "policyholder_person_type",
]

PERSON_TYPE_VALUES = {"PHYSIQUE", "MORALE"}


def backfill_policyholder_identity(apps, schema_editor):
    Contract = apps.get_model("contracts", "Contract")
    pending = []

    for contract in Contract.objects.all().iterator(chunk_size=500):
        identity = build_identity(contract.draft_payload)
        for field, value in identity.items():
            setattr(contract, field, value)
        pending.append(contract)
        if len(pending) >= 500:
            Contract.objects.bulk_update(pending, IDENTITY_FIELDS)
            pending.clear()

    if pending:
        Contract.objects.bulk_update(pending, IDENTITY_FIELDS)


def build_identity(draft_payload):
    draft_payload = draft_payload if isinstance(draft_payload, dict) else {}
    policyholder = as_dict(
        draft_payload.get("policyholder") or draft_payload.get("souscripteur")
    )

    person_type = ""
    for source_key in ("vehicle", "fleet", "garage"):
        source = as_dict(draft_payload.get(source_key))
        raw = first_text(source, ["personType", "typePersonne"]).upper()
        if raw in PERSON_TYPE_VALUES:
            person_type = raw
            break

    return {
        "policyholder_last_name": first_text(
            policyholder, ["lastName", "last_name", "nom", "raisonSociale"]
        )[:150],
        "policyholder_first_name": first_text(
            policyholder, ["firstName", "first_name", "prenom"]
        )[:150],
        "policyholder_phone": first_text(
            policyholder, ["phone", "cellulaire", "telephone"]
        )[:20],
        "policyholder_email": first_text(policyholder, ["email"])[:254],
        "policyholder_person_type": person_type,
    }


def as_dict(value):
    return value if isinstance(value, dict) else {}


def first_text(payload, keys):
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


class Migration(migrations.Migration):
    dependencies = [
        ("contracts", "0007_contract_policyholder_email_and_more"),
    ]

    operations = [
        migrations.RunPython(
            backfill_policyholder_identity,
            migrations.RunPython.noop,
        ),
    ]
