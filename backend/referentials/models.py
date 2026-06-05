from django.db import models


class VehicleBrand(models.Model):
    value = models.CharField(max_length=120, unique=True)
    name = models.CharField(max_length=120)
    is_custom = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
