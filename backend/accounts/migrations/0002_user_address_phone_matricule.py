from uuid import uuid4

from django.db import migrations, models

import accounts.models


def populate_matricules(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.filter(matricule__isnull=True).iterator():
        user.matricule = f"HOR-{uuid4().hex[:12].upper()}"
        user.save(update_fields=["matricule"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="address",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="user",
            name="phone",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="user",
            name="matricule",
            field=models.CharField(
                editable=False,
                max_length=20,
                null=True,
                unique=True,
            ),
        ),
        migrations.RunPython(populate_matricules, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="matricule",
            field=models.CharField(
                default=accounts.models.generate_user_matricule,
                editable=False,
                max_length=20,
                unique=True,
            ),
        ),
    ]
