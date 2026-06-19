import django.core.validators
from django.db import migrations, models
import re


def normalize_existing_phones(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    invalid_users = []

    for user in User.objects.exclude(phone="").iterator():
        phone = re.sub(r"[\s().-]", "", user.phone or "")
        if phone.startswith("+221"):
            phone = phone[4:]
        elif phone.startswith("00221"):
            phone = phone[5:]
        elif phone.startswith("221") and len(phone) == 12:
            phone = phone[3:]

        if not re.fullmatch(r"7\d{8}", phone):
            invalid_users.append(f"{user.pk}:{user.phone}")
            continue

        if phone != user.phone:
            user.phone = phone
            user.save(update_fields=["phone"])

    if invalid_users:
        sample = ", ".join(invalid_users[:10])
        raise RuntimeError(
            "Des téléphones utilisateurs ne peuvent pas être convertis au format "
            f"sénégalais 7XXXXXXXX : {sample}"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_user_address_phone_matricule"),
    ]

    operations = [
        migrations.RunPython(normalize_existing_phones, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="phone",
            field=models.CharField(
                blank=True,
                max_length=9,
                validators=[
                    django.core.validators.RegexValidator(
                        message=(
                            "Le téléphone doit contenir exactement 9 chiffres "
                            "et commencer par 7."
                        ),
                        regex="^7\\d{8}$",
                    )
                ],
            ),
        ),
    ]
