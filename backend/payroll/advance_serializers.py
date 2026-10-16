
from decimal import Decimal

from rest_framework import serializers

from .models import SalaryAdvance, SalaryAdvanceRepayment


class SalaryAdvanceRepaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalaryAdvanceRepayment
        fields = [
            "id",
            "amount",
            "repayment_date",
            "payroll_record",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "recorded_by",
            "created_at",
        ]

    def get_recorded_by_name(self, obj):
        if not obj.recorded_by:
            return None
        return obj.recorded_by.get_full_name() or obj.recorded_by.username


class SalaryAdvanceSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.SerializerMethodField()
    repayments = SalaryAdvanceRepaymentSerializer(
        many=True,
        read_only=True,
    )
    total_repaid = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalaryAdvance
        fields = [
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "requested_amount",
            "approved_amount",
            "reason",
            "repayment_installments",
            "status",
            "review_comment",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "disbursed_at",
            "repayments",
            "total_repaid",
            "outstanding_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee",
            "approved_amount",
            "status",
            "reviewed_by",
            "reviewed_at",
            "disbursed_at",
            "created_at",
            "updated_at",
        ]

    def get_employee_name(self, obj):
        user = obj.employee.user
        return user.get_full_name() or user.username

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return (
            obj.reviewed_by.get_full_name()
            or obj.reviewed_by.username
        )

    def get_total_repaid(self, obj):
        total = sum(
            (repayment.amount for repayment in obj.repayments.all()),
            Decimal("0.00"),
        )
        return f"{total:.2f}"

    def get_outstanding_amount(self, obj):
        if obj.approved_amount is None:
            return None

        total_repaid = sum(
            (repayment.amount for repayment in obj.repayments.all()),
            Decimal("0.00"),
        )
        outstanding = max(
            obj.approved_amount - total_repaid,
            Decimal("0.00"),
        )
        return f"{outstanding:.2f}"


class SalaryAdvanceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryAdvance
        fields = [
            "requested_amount",
            "reason",
            "repayment_installments",
        ]

    def validate_requested_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Requested amount must be greater than zero."
            )
        return value

    def validate_reason(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError(
                "Please provide a reason."
            )
        return value.strip()

    def validate_repayment_installments(self, value):
        if value < 1 or value > 36:
            raise serializers.ValidationError(
                "Repayment installments must be between 1 and 36."
            )
        return value


class SalaryAdvanceReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=["APPROVED", "REJECTED"],
    )
    approved_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        min_value=Decimal("0.01"),
    )
    review_comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=3000,
    )

    def validate(self, attrs):
        advance = self.context["advance"]

        if attrs["status"] == "APPROVED":
            if "approved_amount" not in attrs:
                attrs["approved_amount"] = advance.requested_amount

            if attrs["approved_amount"] > advance.requested_amount:
                raise serializers.ValidationError({
                    "approved_amount": (
                        "Approved amount cannot exceed the requested amount."
                    )
                })

        elif attrs["status"] == "REJECTED":
            attrs.pop("approved_amount", None)

        return attrs


class SalaryAdvanceRepaymentCreateSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = SalaryAdvanceRepayment
        fields = [
            "amount",
            "repayment_date",
            "payroll_record",
        ]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Repayment amount must be greater than zero."
            )
        return value
