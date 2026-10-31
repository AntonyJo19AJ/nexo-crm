import json

from django.db.models import Count, Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from .forms import ClientForm
from .models import Client


def dashboard(request):
    """Página principal: el frontend consume la API con JavaScript."""
    return render(
        request,
        "clients/dashboard.html",
        {"status_choices": Client.Status.choices},
    )


def _serialize(client: Client) -> dict:
    return {
        "id": client.id,
        "name": client.name,
        "company": client.company,
        "email": client.email,
        "phone": client.phone,
        "status": client.status,
        "status_label": client.get_status_display(),
        "initials": client.initials,
        "created_at": client.created_at.isoformat(),
        "updated_at": client.updated_at.isoformat(),
    }


def _form_errors(form: ClientForm) -> dict:
    """Devuelve {campo: [mensajes]} para que el frontend lo muestre inline."""
    return {
        field: [entry["message"] for entry in entries]
        for field, entries in form.errors.get_json_data().items()
    }


def _parse_body(request):
    """Acepta JSON (frontend) o formularios tradicionales."""
    content_type = request.content_type or ""
    if content_type.startswith("application/json"):
        try:
            payload = json.loads(request.body or b"{}")
        except json.JSONDecodeError as exc:
            raise ValueError("El cuerpo de la solicitud no es un JSON válido.") from exc
        if not isinstance(payload, dict):
            raise ValueError("El cuerpo de la solicitud debe ser un objeto JSON.")
        return payload
    return request.POST


@require_http_methods(["GET", "POST"])
def client_list(request):
    if request.method == "GET":
        clients = Client.objects.all()

        query = request.GET.get("q", "").strip()
        if query:
            clients = clients.filter(
                Q(name__icontains=query)
                | Q(company__icontains=query)
                | Q(email__icontains=query)
            )

        status = request.GET.get("status", "").strip().lower()
        if status in Client.Status.values:
            clients = clients.filter(status=status)

        serialized = [_serialize(client) for client in clients]
        return JsonResponse({"clients": serialized, "count": len(serialized)})

    try:
        payload = _parse_body(request)
    except ValueError as exc:
        return JsonResponse({"message": str(exc)}, status=400)

    form = ClientForm(data=payload)
    if form.is_valid():
        client = form.save()
        return JsonResponse({"client": _serialize(client)}, status=201)

    return JsonResponse(
        {
            "message": "Revisa los datos del formulario.",
            "errors": _form_errors(form),
        },
        status=400,
    )


@require_http_methods(["GET", "PUT", "PATCH", "DELETE"])
def client_detail(request, pk: int):
    try:
        client = Client.objects.get(pk=pk)
    except Client.DoesNotExist:
        return JsonResponse({"message": "El cliente no existe o fue eliminado."}, status=404)

    if request.method == "GET":
        return JsonResponse({"client": _serialize(client)})

    if request.method == "DELETE":
        client.delete()
        return HttpResponse(status=204)

    try:
        payload = _parse_body(request)
    except ValueError as exc:
        return JsonResponse({"message": str(exc)}, status=400)

    if request.method == "PATCH":
        # Un PATCH solo envía los campos modificados: completamos el resto
        # con los valores actuales antes de validar el formulario.
        current_data = {
            "name": client.name,
            "company": client.company,
            "email": client.email,
            "phone": client.phone,
            "status": client.status,
        }
        current_data.update(payload)
        payload = current_data

    form = ClientForm(data=payload, instance=client)
    if form.is_valid():
        client = form.save()
        return JsonResponse({"client": _serialize(client)})

    return JsonResponse(
        {
            "message": "Revisa los datos del formulario.",
            "errors": _form_errors(form),
        },
        status=400,
    )


@require_http_methods(["GET"])
def client_stats(request):
    counts = Client.objects.aggregate(
        total=Count("id"),
        prospecto=Count("id", filter=Q(status=Client.Status.PROSPECTO)),
        cliente=Count("id", filter=Q(status=Client.Status.CLIENTE)),
        inactivo=Count("id", filter=Q(status=Client.Status.INACTIVO)),
    )
    total = counts["total"] or 0
    conversion = round((counts["cliente"] / total) * 100) if total else 0
    return JsonResponse(
        {
            "total": total,
            "prospecto": counts["prospecto"],
            "cliente": counts["cliente"],
            "inactivo": counts["inactivo"],
            "conversion": conversion,
        }
    )
