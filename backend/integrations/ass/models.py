from django.db import models


class AssApiLog(models.Model):
    """Trace de chaque appel HTTP reel vers l'API ASS.

    Sert de base aux rapports d'anomalie exiges par les CGU ASS (a transmettre
    sous 5 jours ouvres) : horodatage, endpoint, payloads, resultat, duree.
    Les appels mock ne sont pas journalises.
    """

    endpoint = models.CharField(max_length=120)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    success = models.BooleanField(default=False)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["endpoint", "created_at"])]
        verbose_name = "journal appel ASS"
        verbose_name_plural = "journal appels ASS"

    def __str__(self):
        statut = "OK" if self.success else f"KO ({self.status_code or 'reseau'})"
        return f"{self.endpoint} {statut}"
