
from datetime import date

from django.db.models import Q
from rest_framework import serializers

from employees.models import Employee
from .models import Shift, ShiftAssignment


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = [
            "id",
            "name",
            "shift_type",
            "start_time",
            "end_time",
            "break_minutes",
            "expected_hours",
            "grace_minutes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        start_time = attrs.get(
            "start_time",
            getattr(self.instance, "start_time", None),
        )
        end_time = attrs.get(
            "end_time",
            getattr(self.instance, "end_time", None),
        )
        expected_hours = attrs.get(
            "expected_hours",
            getattr(self.instance, "expected_hours", None),
        )

        if start_time == end_time:
            raise serializers.ValidationError({
                "end_time": "Start and end times must differ."
            })

        if (
            expected_hours is not None
            and (expected_hours <= 0 or expected_hours > 24)
        ):
            raise serializers.ValidationError({
                "expected_hours": "Enter a value greater than 0 and at most 24."
            })

        return attrs


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.SerializerMethodField()
    shift_name = serializers.CharField(
        source="shift.name",
        read_only=True,
    )
    shift_type = serializers.CharField(
        source="shift.shift_type",
        read_only=True,
    )
    assigned_by_username = serializers.CharField(
        source="assigned_by.username",
        read_only=True,
        default=None,
    )

    class Meta:
        model = ShiftAssignment
        fields = [
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "shift",
            "shift_name",
            "shift_type",
            "effective_start",
            "effective_end",
            "assigned_by",
            "assigned_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "assigned_by",
            "created_at",
            "updated_at",
        ]

    def get_employee_name(self, obj):
        user = obj.employee.user
        return user.get_full_name() or user.username

    def validate(self, attrs):
        employee = attrs.get(
            "employee",
            getattr(self.instance, "employee", None),
        )
        shift = attrs.get(
            "shift",
            getattr(self.instance, "shift", None),
        )
        start_date = attrs.get(
            "effective_start",
            getattr(self.instance, "effective_start", None),
        )
        end_date = attrs.get(
            "effective_end",
            getattr(self.instance, "effective_end", None),
        )

        if employee and not employee.is_active:
            raise serializers.ValidationError({
                "employee": "Cannot assign a shift to an inactive employee."
            })

        if shift and not shift.is_active:
            raise serializers.ValidationError({
                "shift": "Cannot assign an inactive shift."
            })

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({
                "effective_end": "End date cannot be before start date."
            })

        if employee and start_date:
            # Prevent overlapping assignments for the same employee.
            # An empty end date means the assignment has no scheduled end.
            latest_date = end_date or date.max

            conflicts = ShiftAssignment.objects.filter(
                employee=employee,
                effective_start__lte=latest_date,
            ).filter(
                Q(effective_end__isnull=True)
                | Q(effective_end__gte=start_date)
            )

            if self.instance:
                conflicts = conflicts.exclude(pk=self.instance.pk)

            if conflicts.exists():
                raise serializers.ValidationError({
                    "effective_start": (
                        "This employee already has an assignment "
                        "covering part of these dates. End the previous "
                        "assignment before assigning another shift."
                    )
                })

        return attrs
