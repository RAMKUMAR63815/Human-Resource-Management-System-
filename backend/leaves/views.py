
from django.db import transaction
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from employees.models import Employee
from .models import LeaveRequest
from .serializers import LeaveRequestSerializer
from datetime import timedelta
from decimal import Decimal
from .models import LeaveBalance
import csv

from django.http import HttpResponse
from django.utils.dateparse import parse_date


class MyLeaveRequestsView(generics.ListCreateAPIView):
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return LeaveRequest.objects.filter(
            employee__user=self.request.user
        ).select_related(
            "employee",
            "employee__user",
            "reviewed_by",
        )

    def perform_create(self, serializer):
        employee = Employee.objects.filter(
            user=self.request.user,
            is_active=True,
        ).first()

        if employee is None:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "No active employee profile found."
            )

        serializer.save(employee=employee)


class AllLeaveRequestsView(generics.ListAPIView):
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAdminOrHR]

    def get_queryset(self):
        queryset = LeaveRequest.objects.select_related(
            "employee",
            "employee__user",
            "reviewed_by",
        ).all()

        leave_status = self.request.query_params.get("status")
        if leave_status:
            valid_statuses = LeaveRequest.Status.values
            if leave_status not in valid_statuses:
                return queryset.none()
            queryset = queryset.filter(status=leave_status)

        department = self.request.query_params.get("department")
        if department:
            queryset = queryset.filter(
                employee__department__iexact=department
            )

        return queryset


def count_working_days(start_date, end_date):
    """Count weekdays inclusively, excluding Saturday and Sunday."""
    total = 0
    current = start_date

    while current <= end_date:
        # Monday = 0, Tuesday = 1, ..., Sunday = 6.
        if current.weekday() < 5:
            total += 1

        # Move to the next calendar day.
        current += timedelta(days=1)

    return total


class LeaveReviewView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request, pk):
        decision = request.data.get("decision")
        comment = request.data.get("comment", "")

        # Step 1: Validate the review decision.
        if decision not in [
            LeaveRequest.Status.APPROVED,
            LeaveRequest.Status.REJECTED,
        ]:
            return Response(
                {"detail": "Decision must be APPROVED or REJECTED."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():

                # Step 2: Lock the leave request to prevent
                # simultaneous reviews of the same request.
                leave = (
                    LeaveRequest.objects
                    .select_for_update()
                    .select_related("employee", "employee__user")
                    .get(pk=pk)
                )

                # Step 3: Only pending requests can be reviewed.
                if leave.status != LeaveRequest.Status.PENDING:
                    return Response(
                        {
                            "detail": (
                                "This leave request has already been reviewed."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Step 4: An employee cannot review their own leave.
                if leave.employee.user_id == request.user.id:
                    return Response(
                        {
                            "detail": (
                                "You cannot review your own leave request."
                            )
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                balance = None
                days = Decimal("0")

                # Step 5: Validate approved leave before changing
                # the leave status or leave balance.
                if decision == LeaveRequest.Status.APPROVED:

                    # Keep each leave request within one calendar year.
                    if leave.start_date.year != leave.end_date.year:
                        return Response(
                            {
                                "detail": (
                                    "Leave spanning multiple calendar "
                                    "years must be submitted separately."
                                )
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    # Unpaid leave does not consume a paid leave balance.
                    if (
                        leave.leave_type
                        != LeaveRequest.LeaveType.UNPAID
                    ):
                        days = Decimal(
                            count_working_days(
                                leave.start_date,
                                leave.end_date,
                            )
                        )

                        # Lock the balance so concurrent approvals
                        # cannot spend the same available balance.
                        balance = (
                            LeaveBalance.objects
                            .select_for_update()
                            .filter(
                                employee=leave.employee,
                                leave_type=leave.leave_type,
                                year=leave.start_date.year,
                            )
                            .first()
                        )

                        if balance is None:
                            return Response(
                                {
                                    "detail": (
                                        "No leave balance configured for "
                                        "this employee, leave type and year."
                                    )
                                },
                                status=status.HTTP_400_BAD_REQUEST,
                            )

                        available_days = (
                            balance.allocated_days - balance.used_days
                        )

                        if available_days < days:
                            return Response(
                                {"detail": "Insufficient leave balance."},
                                status=status.HTTP_400_BAD_REQUEST,
                            )

                # Step 6: All validations passed.
                # Update the balance only for approved paid leave.
                if (
                    decision == LeaveRequest.Status.APPROVED
                    and balance is not None
                ):
                    balance.used_days += days
                    balance.save(update_fields=["used_days"])

                # Step 7: Update the leave request only after
                # the required validations have passed.
                leave.status = decision
                leave.reviewed_by = request.user
                leave.review_comment = comment

                leave.save(
                    update_fields=[
                        "status",
                        "reviewed_by",
                        "review_comment",
                        "updated_at",
                    ]
                )

        except LeaveRequest.DoesNotExist:
            return Response(
                {"detail": "Leave request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Step 8: Return the updated leave request.
        return Response(
            LeaveRequestSerializer(leave).data,
            status=status.HTTP_200_OK,
        )
class LeaveCSVReportView(APIView):
    permission_classes = [IsAdminOrHR]

    def get(self, request):
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        leave_status = request.query_params.get("status")
        department = request.query_params.get("department")

        if start_date and not parse_date(start_date):
            return Response(
                {"detail": "start_date must use YYYY-MM-DD format."},
                status=400,
            )

        if end_date and not parse_date(end_date):
            return Response(
                {"detail": "end_date must use YYYY-MM-DD format."},
                status=400,
            )

        if start_date and end_date and start_date > end_date:
            return Response(
                {"detail": "start_date must not be after end_date."},
                status=400,
            )

        queryset = LeaveRequest.objects.select_related(
            "employee",
            "employee__user",
            "reviewed_by",
        ).order_by("-created_at")

        # Include requests whose leave period overlaps the chosen range.
        if start_date:
            queryset = queryset.filter(end_date__gte=start_date)

        if end_date:
            queryset = queryset.filter(start_date__lte=end_date)

        if leave_status:
            allowed_statuses = [
                choice[0] for choice in LeaveRequest.Status.choices
            ]
            if leave_status not in allowed_statuses:
                return Response(
                    {"detail": "Invalid leave status."},
                    status=400,
                )
            queryset = queryset.filter(status=leave_status)

        if department:
            queryset = queryset.filter(
                employee__department__iexact=department
            )

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            'attachment; filename="leave_report.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([
            "Employee Code",
            "Employee Name",
            "Department",
            "Leave Type",
            "Start Date",
            "End Date",
            "Status",
            "Reason",
            "Reviewed By",
        ])

        for leave in queryset.iterator():
            reviewer = ""
            if leave.reviewed_by:
                reviewer = (
                    leave.reviewed_by.get_full_name()
                    or leave.reviewed_by.username
                )

            writer.writerow([
                leave.employee.employee_code,
                leave.employee.user.get_full_name()
                or leave.employee.user.username,
                leave.employee.department,
                leave.leave_type,
                leave.start_date,
                leave.end_date,
                leave.status,
                leave.reason,
                reviewer,
            ])

        return response
