
from django.contrib import admin
from .models import LeaveRequest
from .models import LeaveBalance


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "leave_type",
        "start_date",
        "end_date",
        "status",
        "reviewed_by",
    )

    list_filter = (
        "status",
        "leave_type",
        "start_date",
    )

    search_fields = (
        "employee__employee_code",
        "employee__user__username",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "leave_type",
        "year",
        "allocated_days",
        "used_days",
    )
    list_filter = ("year", "leave_type")
    search_fields = (
        "employee__employee_code",
        "employee__user__username",
    )

