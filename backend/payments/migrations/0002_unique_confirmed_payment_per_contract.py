from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                condition=models.Q(status="CONFIRMED"),
                fields=("contract",),
                name="unique_confirmed_payment_per_contract",
            ),
        ),
    ]
