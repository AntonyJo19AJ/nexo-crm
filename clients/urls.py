from django.urls import path

from . import views

app_name = "clients"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("api/clients/", views.client_list, name="client-list"),
    path("api/clients/<int:pk>/", views.client_detail, name="client-detail"),
    path("api/stats/", views.client_stats, name="client-stats"),
]
