
from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_code",
        "user",
        "department",
        "designation",
        "salary",
        "is_active",
    )
    list_filter = ("department", "is_active")
    search_fields = (
        "employee_code",
        "user__username",
        "user__first_name",
        "user__last_name",
    )
