
from rest_framework import serializers
from .models import SalaryPayment
from .models import PayrollRecord


class PayrollRecordSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.CharField(
        source="employee.user.get_full_name",
        read_only=True,
    )

    class Meta:
        model = PayrollRecord
        fields = [
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "year",
            "month",
            "base_salary",
            "lop_days",
            "lop_deduction",
            "net_salary",
            "status",
            "generated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="payroll_record.employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.CharField(
        source="payroll_record.employee.user.get_full_name",
        read_only=True,
    )

    class Meta:
        model = SalaryPayment
        fields = [
            "id",
            "payroll_record",
            "employee_code",
            "employee_name",
            "reference",
            "amount",
            "status",
            "paid_at",
            "processed_by",
        ]
        read_only_fields = fields
