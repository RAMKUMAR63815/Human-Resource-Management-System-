
from rest_framework import serializers

from employees.models import Employee
from .models import (
    EmployeeSalaryComponent,
    PayrollRecord,
    SalaryPayment,
)


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
            "gross_salary",
            "lop_days",
            "lop_deduction",
            "total_deductions",
            "salary_components",
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


class EmployeeSalaryComponentSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.CharField(
        source="employee.user.get_full_name",
        read_only=True,
    )

    class Meta:
        model = EmployeeSalaryComponent
        fields = [
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "name",
            "component_type",
            "amount",
            "is_active",
            "effective_from",
            "effective_to",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_code",
            "employee_name",
            "created_at",
            "updated_at",
        ]

    def validate_employee(self, employee):
        if not employee.is_active:
            raise serializers.ValidationError(
                "Salary components cannot be assigned to an inactive employee."
            )
        return employee

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Component name cannot be empty."
            )
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Component amount must be greater than zero."
            )
        return value

    def validate(self, attrs):
        effective_from = attrs.get(
            "effective_from",
            getattr(self.instance, "effective_from", None),
        )
        effective_to = attrs.get(
            "effective_to",
            getattr(self.instance, "effective_to", None),
        )

        if (
            effective_from
            and effective_to
            and effective_to < effective_from
        ):
            raise serializers.ValidationError(
                {
                    "effective_to": (
                        "End date cannot be earlier than start date."
                    )
                }
            )

        return attrs
