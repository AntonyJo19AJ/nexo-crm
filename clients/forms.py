import re

from django import forms

from .models import Client

PHONE_PATTERN = re.compile(r"^[0-9+\-()\s]{6,25}$")


class ClientForm(forms.ModelForm):
    """Validaciones compartidas por la API y el Django Admin."""

    class Meta:
        model = Client
        fields = ["name", "company", "email", "phone", "status"]
        error_messages = {
            "email": {
                "unique": "Ya existe un cliente registrado con este correo.",
                "invalid": "Ingresa un correo electrónico válido.",
            },
            "name": {"required": "El nombre del cliente es obligatorio."},
        }

    def clean_name(self) -> str:
        name = " ".join(self.cleaned_data["name"].split())
        if len(name) < 2:
            raise forms.ValidationError("El nombre debe tener al menos 2 caracteres.")
        if len(name) > 120:
            raise forms.ValidationError("El nombre no puede superar los 120 caracteres.")
        return name

    def clean_company(self) -> str:
        return self.cleaned_data.get("company", "").strip()

    def clean_phone(self) -> str:
        phone = self.cleaned_data.get("phone", "").strip()
        if phone and not PHONE_PATTERN.match(phone):
            raise forms.ValidationError(
                "El teléfono solo admite números, espacios, paréntesis, guiones y el signo +."
            )
        return phone
