from django.db import migrations, models


def migrate_status(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Organization.objects.filter(is_active=False).update(status="INACTIVE")


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="address",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="city",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_access_mode",
            field=models.CharField(
                choices=[
                    ("NONE", "Aucun accès"),
                    ("TEMPORARY_PASSWORD", "Mot de passe temporaire"),
                    ("EMAIL_INVITATION", "Invitation email"),
                ],
                default="NONE",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_first_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_last_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_phone",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_role",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_username",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="organization",
            name="country",
            field=models.CharField(default="Sénégal", max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="currency",
            field=models.CharField(default="FCFA", max_length=10),
        ),
        migrations.AddField(
            model_name="organization",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="insurance_license_number",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="legal_form",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="legal_person_type",
            field=models.CharField(
                choices=[
                    ("MORALE", "Personne morale"),
                    ("PHYSIQUE", "Personne physique"),
                ],
                default="MORALE",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="ninea_rccm",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="organization_type",
            field=models.CharField(
                choices=[
                    ("AGENCY", "Agence"),
                    ("BROKER", "Courtier"),
                    ("CONTRIBUTOR", "Apporteur"),
                    ("PARTNER", "Partenaire"),
                ],
                default="PARTNER",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="phone",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="organization",
            name="professional_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="organization",
            name="region",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Actif"),
                    ("INACTIVE", "Inactif"),
                    ("SUSPENDED", "Suspendu"),
                ],
                default="ACTIVE",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="website",
            field=models.URLField(blank=True),
        ),
        migrations.RunPython(migrate_status, migrations.RunPython.noop),
    ]
