from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "email", "phone", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "company", "email", "phone")
    list_editable = ("status",)
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "updated_at")
    list_per_page = 25
