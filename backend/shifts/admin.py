
from django.contrib import admin

from .models import Shift, ShiftAssignment


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "shift_type",
        "start_time",
        "end_time",
        "expected_hours",
        "is_active",
    )
    list_filter = ("shift_type", "is_active")
    search_fields = ("name",)


@admin.register(ShiftAssignment)
class ShiftAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "shift",
        "effective_start",
        "effective_end",
        "assigned_by",
    )
    list_filter = ("shift",)
    search_fields = (
        "employee__employee_code",
        "employee__user__username",
        "employee__user__first_name",
        "employee__user__last_name",
    )
    autocomplete_fields = ("employee", "shift")
