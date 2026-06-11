from django.db import migrations


INDEX_NAME = "contracts_contract_search_text_trgm"


def create_postgres_search_index(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    schema_editor.execute(
        f"""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_NAME}
        ON contracts_contract
        USING GIN (search_text gin_trgm_ops)
        """
    )


def drop_postgres_search_index(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX_NAME}")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("contracts", "0005_contract_search_text"),
    ]

    operations = [
        migrations.RunPython(
            create_postgres_search_index,
            drop_postgres_search_index,
        ),
    ]
