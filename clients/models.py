from django.db import models


class Client(models.Model):
    """Cliente dentro del mini CRM."""

    class Status(models.TextChoices):
        PROSPECTO = "prospecto", "Prospecto"
        CLIENTE = "cliente", "Cliente"
        INACTIVO = "inactivo", "Inactivo"

    name = models.CharField("nombre", max_length=120)
    company = models.CharField("empresa", max_length=120, blank=True)
    email = models.EmailField("correo electrónico", max_length=180, unique=True)
    phone = models.CharField("teléfono", max_length=25, blank=True)
    status = models.CharField(
        "estado",
        max_length=20,
        choices=Status.choices,
        default=Status.PROSPECTO,
    )
    created_at = models.DateTimeField("creado el", auto_now_add=True)
    updated_at = models.DateTimeField("actualizado el", auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "cliente"
        verbose_name_plural = "clientes"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["name"]),
            models.Index(fields=["company"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_status_display()})"

    @property
    def initials(self) -> str:
        """Iniciales usadas por la interfaz (ej. 'Ana Torres' -> 'AT')."""
        parts = [part for part in self.name.split() if part]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[-1][0]).upper()
