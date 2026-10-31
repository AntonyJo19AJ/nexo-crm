import json

from django.test import TestCase
from django.urls import reverse

from clients.models import Client


class ClientApiBase(TestCase):
    def setUp(self):
        self.ana = Client.objects.create(
            name="Ana Torres",
            company="Nube Creativa",
            email="ana@nube.com",
            phone="0999999999",
            status=Client.Status.CLIENTE,
        )
        self.carlos = Client.objects.create(
            name="Carlos Mendoza",
            company="Tecnologías Cóndor",
            email="carlos@condor.ec",
            status=Client.Status.PROSPECTO,
        )
        self.jorge = Client.objects.create(
            name="Jorge Andrade",
            company="Constructora Pacífico",
            email="jorge@pacifico.ec",
            status=Client.Status.INACTIVO,
        )

    def post_json(self, url, payload, method="post"):
        return getattr(self.client, method)(
            url,
            data=json.dumps(payload),
            content_type="application/json",
        )


class DashboardTests(ClientApiBase):
    def test_dashboard_renders(self):
        response = self.client.get(reverse("clients:dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Nexo")
        self.assertContains(response, "Nuevo cliente")


class ClientListTests(ClientApiBase):
    def test_list_returns_all_clients(self):
        response = self.client.get(reverse("clients:client-list"))
        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["count"], 3)
        self.assertEqual(len(payload["clients"]), 3)

    def test_search_by_name(self):
        response = self.client.get(reverse("clients:client-list"), {"q": "ana"})
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["clients"][0]["name"], "Ana Torres")

    def test_search_by_company(self):
        response = self.client.get(reverse("clients:client-list"), {"q": "cóndor"})
        self.assertEqual(response.json()["count"], 1)

    def test_search_by_email(self):
        response = self.client.get(reverse("clients:client-list"), {"q": "pacifico.ec"})
        self.assertEqual(response.json()["count"], 1)

    def test_filter_by_status(self):
        response = self.client.get(reverse("clients:client-list"), {"status": "cliente"})
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["clients"][0]["status"], "cliente")

    def test_search_and_filter_combined(self):
        response = self.client.get(
            reverse("clients:client-list"), {"q": "ana", "status": "prospecto"}
        )
        self.assertEqual(response.json()["count"], 0)

    def test_unknown_status_is_ignored(self):
        response = self.client.get(reverse("clients:client-list"), {"status": "inventado"})
        self.assertEqual(response.json()["count"], 3)


class ClientCreateTests(ClientApiBase):
    def test_create_client(self):
        response = self.post_json(
            reverse("clients:client-list"),
            {
                "name": "  Daniela Ortiz  ",
                "company": "Clínica Vida Sana",
                "email": "daniela@vidasana.com",
                "phone": "+593 98 123 4567",
                "status": "prospecto",
            },
        )
        payload = response.json()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(payload["client"]["name"], "Daniela Ortiz")
        self.assertTrue(Client.objects.filter(email="daniela@vidasana.com").exists())

    def test_create_requires_name(self):
        response = self.post_json(
            reverse("clients:client-list"), {"name": "", "email": "nuevo@example.com"}
        )
        payload = response.json()
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", payload["errors"])

    def test_create_requires_valid_email(self):
        response = self.post_json(
            reverse("clients:client-list"), {"name": "Nuevo", "email": "no-es-correo"}
        )
        payload = response.json()
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", payload["errors"])

    def test_create_rejects_duplicate_email(self):
        response = self.post_json(
            reverse("clients:client-list"),
            {"name": "Duplicado", "email": "ana@nube.com"},
        )
        payload = response.json()
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", payload["errors"])

    def test_create_rejects_invalid_phone(self):
        response = self.post_json(
            reverse("clients:client-list"),
            {"name": "Teléfono raro", "email": "raro@example.com", "phone": "abc"},
        )
        payload = response.json()
        self.assertEqual(response.status_code, 400)
        self.assertIn("phone", payload["errors"])

    def test_create_rejects_invalid_json(self):
        response = self.client.post(
            reverse("clients:client-list"),
            data="{no-json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("JSON", response.json()["message"])


class ClientDetailTests(ClientApiBase):
    def test_get_detail(self):
        response = self.client.get(reverse("clients:client-detail", args=[self.ana.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["client"]["email"], "ana@nube.com")

    def test_patch_updates_only_sent_fields(self):
        response = self.post_json(
            reverse("clients:client-detail", args=[self.ana.pk]),
            {"status": "inactivo"},
            method="patch",
        )
        self.assertEqual(response.status_code, 200)
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.status, Client.Status.INACTIVO)
        self.assertEqual(self.ana.name, "Ana Torres")

    def test_put_updates_client(self):
        response = self.post_json(
            reverse("clients:client-detail", args=[self.carlos.pk]),
            {
                "name": "Carlos Mendoza R.",
                "company": "Cóndor Labs",
                "email": "carlos@condor.ec",
                "phone": "0988888888",
                "status": "cliente",
            },
            method="put",
        )
        self.assertEqual(response.status_code, 200)
        self.carlos.refresh_from_db()
        self.assertEqual(self.carlos.company, "Cóndor Labs")
        self.assertEqual(self.carlos.status, Client.Status.CLIENTE)

    def test_delete_client(self):
        response = self.client.delete(
            reverse("clients:client-detail", args=[self.jorge.pk])
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Client.objects.filter(pk=self.jorge.pk).exists())

    def test_missing_client_returns_json_404(self):
        response = self.client.get(reverse("clients:client-detail", args=[9999]))
        self.assertEqual(response.status_code, 404)
        self.assertIn("message", response.json())


class ClientStatsTests(ClientApiBase):
    def test_stats_counts_and_conversion(self):
        response = self.client.get(reverse("clients:client-stats"))
        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["total"], 3)
        self.assertEqual(payload["prospecto"], 1)
        self.assertEqual(payload["cliente"], 1)
        self.assertEqual(payload["inactivo"], 1)
        self.assertEqual(payload["conversion"], 33)

    def test_stats_with_no_clients(self):
        Client.objects.all().delete()
        payload = self.client.get(reverse("clients:client-stats")).json()
        self.assertEqual(payload["total"], 0)
        self.assertEqual(payload["conversion"], 0)
