
from django.utils import timezone
from rest_framework import serializers
from django.db.models import Q
from employees.models import Employee
from .models import LeaveRequest


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.CharField(
        source="employee.user.get_full_name",
        read_only=True,
    )

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "leave_type",
            "start_date",
            "end_date",
            "reason",
            "status",
            "reviewed_by",
            "review_comment",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee",
            "status",
            "reviewed_by",
            "review_comment",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        start_date = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )
        end_date = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({
                "end_date": "End date cannot be before start date."
            })

        if start_date and start_date < timezone.localdate():
            raise serializers.ValidationError({
                "start_date": "Leave cannot start in the past."
            })

        if self.instance and self.instance.status != LeaveRequest.Status.PENDING:
            raise serializers.ValidationError(
                "Only pending leave requests can be edited."
            )
        
        request = self.context.get("request")

        if request and start_date and end_date:
            employee = (
                self.instance.employee
                if self.instance
                else Employee.objects.filter(
                    user=request.user,
                    is_active=True,
                ).first()
            )

            if employee:
                overlapping = LeaveRequest.objects.filter(
                    employee=employee,
                    start_date__lte=end_date,
                    end_date__gte=start_date,
                    status__in=[
                        LeaveRequest.Status.PENDING,
                        LeaveRequest.Status.APPROVED,
                    ],
                )

                if self.instance:
                    overlapping = overlapping.exclude(
                        pk=self.instance.pk
                    )

                if overlapping.exists():
                    raise serializers.ValidationError({
                        "start_date": (
                            "These dates overlap with an existing "
                            "pending or approved leave request."
                        )
                    })

        return attrs
