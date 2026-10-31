from django.core.management.base import BaseCommand

from clients.models import Client

SEED_CLIENTS = [
    ("María Fernanda López", "Andina Studio", "maria.lopez@andinastudio.com", "+593 99 812 4471", "cliente"),
    ("Carlos Mendoza", "Tecnologías Cóndor", "carlos.mendoza@condor.ec", "0998877665", "prospecto"),
    ("Ana Paula Torres", "Nube Creativa", "ana.torres@nubecreativa.com", "0987654321", "cliente"),
    ("Jorge Andrade", "Constructora Pacífico", "jorge.andrade@pacifico.ec", "+593 98 334 1200", "inactivo"),
    ("Daniela Ortiz", "Clínica Vida Sana", "daniela.ortiz@vidasana.com", "0991234567", "cliente"),
    ("Luis Alberto Paredes", "Paredes & Asociados", "luis.paredes@paredeslegal.ec", "022345678", "prospecto"),
    ("Sofía Herrera", "Café del Valle", "sofia.herrera@cafedelvalle.com", "+593 96 778 9034", "cliente"),
    ("Mateo Cárdenas", "Logística Rápida", "mateo.cardenas@lograpida.ec", "0960011223", "prospecto"),
    ("Valentina Ruiz", "Estudio Ámbar", "valentina.ruiz@estudioambar.com", "0974455667", "inactivo"),
    ("Andrés Villacís", "Fintech Andina", "andres.villacis@fintechandina.com", "+593 99 550 1188", "cliente"),
    ("Camila Salazar", "Mercado Verde", "camila.salazar@mercadoverde.ec", "0981122334", "prospecto"),
    ("Diego Ramos", "Agencia Horizonte", "diego.ramos@horizonte.com", "0994433221", "inactivo"),
]


class Command(BaseCommand):
    help = "Carga clientes de demostración para revisar la interfaz."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Elimina los clientes existentes antes de cargar la muestra.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            deleted, _ = Client.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Clientes eliminados: {deleted}"))

        created = 0
        for name, company, email, phone, status in SEED_CLIENTS:
            _, was_created = Client.objects.update_or_create(
                email=email,
                defaults={
                    "name": name,
                    "company": company,
                    "phone": phone,
                    "status": status,
                },
            )
            created += int(was_created)

        self.stdout.write(
            self.style.SUCCESS(
                f"Listo: {created} clientes nuevos, {Client.objects.count()} en total."
            )
        )
