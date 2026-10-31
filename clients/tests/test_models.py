from django.test import TestCase

from clients.models import Client


class ClientModelTests(TestCase):
    def test_default_status_is_prospecto(self):
        client = Client.objects.create(name="Ana Torres", email="ana@example.com")
        self.assertEqual(client.status, Client.Status.PROSPECTO)

    def test_str_returns_name_and_status(self):
        client = Client.objects.create(
            name="Carlos Mendoza",
            email="carlos@example.com",
            status=Client.Status.CLIENTE,
        )
        self.assertEqual(str(client), "Carlos Mendoza (Cliente)")

    def test_initials_with_two_names(self):
        client = Client(name="María Fernanda López", email="maria@example.com")
        self.assertEqual(client.initials, "ML")

    def test_initials_with_single_name(self):
        client = Client(name="Andrés", email="andres@example.com")
        self.assertEqual(client.initials, "AN")

    def test_clients_are_ordered_by_newest_first(self):
        first = Client.objects.create(name="Primero", email="primero@example.com")
        second = Client.objects.create(name="Segundo", email="segundo@example.com")
        self.assertEqual(list(Client.objects.all()), [second, first])

    def test_email_is_required_and_unique(self):
        Client.objects.create(name="Ana", email="ana@example.com")
        with self.assertRaises(Exception):
            Client.objects.create(name="Otra Ana", email="ana@example.com")
