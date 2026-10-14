
from rest_framework import serializers

from .models import Attendance


class AttendanceSerializer(serializers.ModelSerializer):
    employee_code = serializers.CharField(
        source="employee.employee_code",
        read_only=True,
    )
    employee_name = serializers.CharField(
        source="employee.user.get_full_name",#get first and last name combimed version
        read_only=True,
    )

    class Meta:
        model = Attendance
        fields = [
            "id",
            "employee",
            "employee_code",
            "employee_name",
            "date",
            "check_in",
            "check_out",
            "working_hours",
            "notes",
            "corrected_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee",
            "date",
            "check_in",
            "check_out",
            "working_hours",
            "corrected_by",
            "created_at",
            "updated_at",
        ]
