
import csv

from django.db.models import Q
from django.http import HttpResponse
from django.utils.dateparse import parse_date

from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from attendance.models import Attendance
from employees.models import Employee
from notifications.models import Notification, NotificationPreference

from .models import Shift, ShiftAssignment
from .serializers import ShiftSerializer, ShiftAssignmentSerializer
from .utils import get_shift_metrics


def is_admin_or_hr(user):
    if user.is_superuser:
        return True

    profile = getattr(user, "hrms_profile", None)
    return bool(profile and profile.role in ["ADMIN", "HR"])


def notify_employee(employee, title, message):
    """Respect the employee's notification preferences."""
    user = employee.user

    preferences, _ = NotificationPreference.objects.get_or_create(
        user=user
    )

    if not preferences.attendance_enabled:
        return

    exists = Notification.objects.filter(
        recipient=user,
        notification_type="ATTENDANCE",
        title=title,
        message=message,
    ).exists()

    if not exists:
        Notification.objects.create(
            recipient=user,
            notification_type="ATTENDANCE",
            title=title,
            message=message,
        )


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]

        return [IsAdminOrHR()]

    def get_queryset(self):
        queryset = Shift.objects.all()

        if not is_admin_or_hr(self.request.user):
            queryset = queryset.filter(is_active=True)

        return queryset

    def perform_destroy(self, instance):
        # Keep historical assignments and their shift definitions intact.
        if instance.assignments.exists():
            instance.is_active = False
            instance.save(update_fields=["is_active", "updated_at"])
        else:
            instance.delete()


class ShiftAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftAssignmentSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]

        return [IsAdminOrHR()]

    def get_queryset(self):
        queryset = ShiftAssignment.objects.select_related(
            "employee",
            "employee__user",
            "shift",
            "assigned_by",
        )

        if not is_admin_or_hr(self.request.user):
            queryset = queryset.filter(
                employee__user=self.request.user
            )

        employee_id = self.request.query_params.get("employee_id")
        shift_id = self.request.query_params.get("shift_id")

        if employee_id and is_admin_or_hr(self.request.user):
            queryset = queryset.filter(employee_id=employee_id)

        if shift_id:
            queryset = queryset.filter(shift_id=shift_id)

        return queryset

    def perform_create(self, serializer):
        assignment = serializer.save(assigned_by=self.request.user)

        notify_employee(
            assignment.employee,
            "Shift assigned",
            (
                f"You have been assigned to "
                f"{assignment.shift.name} from "
                f"{assignment.effective_start}."
            ),
        )

    def perform_update(self, serializer):
        assignment = serializer.save()

        notify_employee(
            assignment.employee,
            "Shift assignment updated",
            (
                f"Your shift assignment is now "
                f"{assignment.shift.name}, effective "
                f"{assignment.effective_start}."
            ),
        )


class MyShiftView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            employee = Employee.objects.get(user=request.user)
        except Employee.DoesNotExist:
            return Response(
                {"detail": "No employee profile is linked to this account."},
                status=status.HTTP_404_NOT_FOUND,
            )

        assignments = ShiftAssignment.objects.filter(
            employee=employee
        ).select_related("shift").order_by("-effective_start")

        return Response(
            ShiftAssignmentSerializer(assignments, many=True).data
        )


class ShiftAttendanceReportView(APIView):
    permission_classes = [IsAdminOrHR]

    def get(self, request):
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        shift_id = request.query_params.get("shift_id")
        department = request.query_params.get("department")

        parsed_start = parse_date(start_date) if start_date else None
        parsed_end = parse_date(end_date) if end_date else None

        if start_date and not parsed_start:
            return Response(
                {"detail": "start_date must use YYYY-MM-DD format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if end_date and not parsed_end:
            return Response(
                {"detail": "end_date must use YYYY-MM-DD format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if parsed_start and parsed_end and parsed_start > parsed_end:
            return Response(
                {"detail": "start_date cannot be after end_date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = Attendance.objects.select_related(
            "employee",
            "employee__user",
        ).order_by("-date", "employee__employee_code")

        if parsed_start:
            queryset = queryset.filter(date__gte=parsed_start)

        if parsed_end:
            queryset = queryset.filter(date__lte=parsed_end)

        if department:
            queryset = queryset.filter(
                employee__department__iexact=department
            )

        rows = []

        for attendance in queryset.iterator():
            metrics = get_shift_metrics(attendance)

            if shift_id and str(metrics["shift_assignment_id"]) == "None":
                continue

            if shift_id and str(
                ShiftAssignment.objects.filter(
                    employee=attendance.employee,
                    effective_start__lte=attendance.date,
                ).filter(
                    Q(effective_end__isnull=True)
                    | Q(effective_end__gte=attendance.date)
                ).values_list("shift_id", flat=True).first()
            ) != str(shift_id):
                continue

            user = attendance.employee.user

            rows.append({
                "employee_id": attendance.employee_id,
                "employee_code": attendance.employee.employee_code,
                "employee_name": (
                    user.get_full_name() or user.username
                ),
                "department": attendance.employee.department,
                "date": attendance.date,
                "check_in": attendance.check_in,
                "check_out": attendance.check_out,
                "working_hours": attendance.working_hours,
                **metrics,
            })

        return Response(rows)


class ShiftAttendanceCSVReportView(APIView):
    permission_classes = [IsAdminOrHR]

    def get(self, request):
        report = ShiftAttendanceReportView().get(request)

        if report.status_code != 200:
            return report

        response = HttpResponse(
            content_type="text/csv; charset=utf-8"
        )
        response["Content-Disposition"] = (
            'attachment; filename="shift_attendance_report.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([
            "Employee Code",
            "Employee Name",
            "Department",
            "Date",
            "Shift",
            "Check In",
            "Check Out",
            "Working Hours",
            "Late Minutes",
            "Early Checkout Minutes",
            "Overtime Hours",
        ])

        for row in report.data:
            writer.writerow([
                row["employee_code"],
                row["employee_name"],
                row["department"],
                row["date"],
                row["shift_name"] or "Unassigned",
                row["check_in"],
                row["check_out"] or "",
                row["working_hours"],
                row["late_minutes"],
                row["early_checkout_minutes"],
                row["overtime_hours"],
            ])

        return response
