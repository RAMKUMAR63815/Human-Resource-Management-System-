
from django.contrib import admin

from .models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "date",
        "check_in",
        "check_out",
        "working_hours",
    )
    list_filter = ("date", "employee__department")
    search_fields = (
        "employee__employee_code",
        "employee__user__username",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )
