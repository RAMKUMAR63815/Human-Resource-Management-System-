
from django.contrib import admin

from .models import PayrollRecord
from .models import SalaryPayment


@admin.register(PayrollRecord)
class PayrollRecordAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "year",
        "month",
        "base_salary",
        "lop_days",
        "lop_deduction",
        "net_salary",
        "status",
    )

    list_filter = ("year", "month", "status")

    search_fields = (
        "employee__employee_code",
        "employee__user__username",
    )

    readonly_fields = (
        "base_salary",
        "lop_days",
        "lop_deduction",
        "net_salary",
        "generated_by",
        "created_at",
        "updated_at",
    )
@admin.register(SalaryPayment)
class SalaryPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "payroll_record",
        "amount",
        "status",
        "paid_at",
        "processed_by",
    )
    list_filter = ("status", "paid_at")
    search_fields = (
        "reference",
        "payroll_record__employee__employee_code",
    )
    readonly_fields = (
        "reference",
        "payroll_record",
        "amount",
        "status",
        "paid_at",
        "processed_by",
    )

