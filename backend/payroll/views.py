
import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import generics

from accounts.permissions import IsAdminOrHR
from attendance.models import Attendance
from employees.models import Employee
from leaves.models import LeaveRequest
from .models import PayrollRecord
from .serializers import PayrollRecordSerializer
from django.shortcuts import get_object_or_404
from .models import PayrollRecord, SalaryPayment
from .serializers import PayrollRecordSerializer, SalaryPaymentSerializer
from io import BytesIO
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
import csv
from django.http import HttpResponse
from django.utils.dateparse import parse_date

CENT = Decimal("0.01")


def weekdays_in_range(start_date, end_date):
    """Return dates from Monday to Friday, inclusive."""
    current = start_date

    while current <= end_date:
        if current.weekday() < 5:
            yield current

        current += timedelta(days=1)


def calculate_payroll(employee, year, month, generated_by):
    today = timezone.localdate()

    if not 1 <= month <= 12:
        raise ValueError("Month must be between 1 and 12.")

    if (year, month) >= (today.year, today.month):
        raise ValueError(
            "Payroll can only be generated for a completed month."
        )

    last_day = calendar.monthrange(year, month)[1]#howmmany days in montgs
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    work_dates = list(weekdays_in_range(start_date, end_date))
    total_workdays = len(work_dates)

    attendance_dates = set(
        Attendance.objects.filter(
            employee=employee,
            date__range=(start_date, end_date),
            check_out__isnull=False,
        ).values_list("date", flat=True)#full attendance objects-ku badhila dates mattum edukkum.
    )

    approved_leaves = LeaveRequest.objects.filter(
        employee=employee,
        status=LeaveRequest.Status.APPROVED,
        start_date__lte=end_date,
        end_date__gte=start_date,
    )

    paid_leave_dates = set()
    unpaid_leave_dates = set()

    for leave in approved_leaves:
        leave_start = max(leave.start_date, start_date)
        leave_end = min(leave.end_date, end_date)

        target_dates = weekdays_in_range(leave_start, leave_end)

        if leave.leave_type == LeaveRequest.LeaveType.UNPAID:
            unpaid_leave_dates.update(target_dates)
        else:
            paid_leave_dates.update(target_dates)

    # Attendance takes priority over leave on the same date to avoid
    # deducting salary for a day the employee actually worked.
    paid_leave_dates -= attendance_dates
    unpaid_leave_dates -= attendance_dates

    # Approved paid leave is paid; approved unpaid leave is LOP.
    # Other scheduled weekdays without attendance or paid leave are LOP.
    lop_dates = (
        set(work_dates)
        - attendance_dates
        - paid_leave_dates
    )

    lop_days = Decimal(len(lop_dates))

    base_salary = employee.salary or Decimal("0.00")

    if total_workdays:
        per_day_salary = base_salary / Decimal(total_workdays)
        lop_deduction = (per_day_salary * lop_days).quantize(
            CENT,
            rounding=ROUND_HALF_UP,
        )
    else:
        lop_deduction = Decimal("0.00")

    net_salary = max(
        base_salary - lop_deduction,
        Decimal("0.00"),
    ).quantize(CENT, rounding=ROUND_HALF_UP)

    with transaction.atomic():
        record, created = PayrollRecord.objects.get_or_create(
            employee=employee,
            year=year,
            month=month,
            defaults={
                "base_salary": base_salary,
                "lop_days": lop_days,
                "lop_deduction": lop_deduction,
                "net_salary": net_salary,
                "status": PayrollRecord.Status.DRAFT,
                "generated_by": generated_by,
            },
        )

        if not created:
            if record.status != PayrollRecord.Status.DRAFT:
                raise ValueError(
                    "Only draft payroll can be recalculated."
                )

            record.base_salary = base_salary
            record.lop_days = lop_days
            record.lop_deduction = lop_deduction
            record.net_salary = net_salary
            record.generated_by = generated_by
            record.save()

    return record


class GeneratePayrollView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request):
        employee_id = request.data.get("employee_id")
        year = request.data.get("year")
        month = request.data.get("month")

        try:
            employee_id = int(employee_id)
            year = int(year)
            month = int(month)

            employee = Employee.objects.get(
                pk=employee_id,
                is_active=True,
            )

            record = calculate_payroll(
                employee=employee,
                year=year,
                month=month,
                generated_by=request.user,
            )

        except (TypeError, ValueError):
            return Response(
                {"detail": "Provide a valid employee_id, year and month. The month must be completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Employee.DoesNotExist:
            return Response(
                {"detail": "Active employee not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            PayrollRecordSerializer(record).data,
            status=status.HTTP_201_CREATED,
        )

class MyPayrollHistoryView(generics.ListAPIView):
    serializer_class = PayrollRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Find the employee record connected to the logged-in user.
        employee = get_object_or_404(
            Employee,
            user=self.request.user,
        )

        # Return only this employee's payroll history.
        queryset = PayrollRecord.objects.filter(
            employee=employee
        ).select_related(
            "employee",
            "employee__user",
            "generated_by",
        ).order_by("-year", "-month")

        # Optional filters, such as ?year=2026&month=9.
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")

        if year:
            queryset = queryset.filter(year=year)

        if month:
            queryset = queryset.filter(month=month)

        return queryset


class PayrollListView(generics.ListAPIView):
    serializer_class = PayrollRecordSerializer
    permission_classes = [IsAdminOrHR]

    def get_queryset(self):
        queryset = PayrollRecord.objects.select_related(
            "employee",
            "employee__user",
            "generated_by",
        )

        employee_id = self.request.query_params.get("employee_id")
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")

        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if year:
            queryset = queryset.filter(year=year)
        if month:
            queryset = queryset.filter(month=month)

        return queryset

class LockPayrollView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request, pk):
        with transaction.atomic():
            # Lock this database row while we change its status.
            record = get_object_or_404(
                PayrollRecord.objects.select_for_update(),
                pk=pk,
            )

            if record.status != PayrollRecord.Status.DRAFT:
                return Response(
                    {"detail": "Only draft payroll can be locked."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            record.status = PayrollRecord.Status.LOCKED
            record.save(update_fields=["status", "updated_at"])

        return Response(PayrollRecordSerializer(record).data)


class SimulateSalaryPaymentView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request, pk):
        with transaction.atomic():
            # Prevent concurrent requests from paying the same payroll twice.
            record = get_object_or_404(
                PayrollRecord.objects.select_for_update(),
                pk=pk,
            )

            if record.status != PayrollRecord.Status.LOCKED:
                return Response(
                    {"detail": "Only locked payroll can be paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Never accept the salary amount from the client.
            payment = SalaryPayment.objects.create(
                payroll_record=record,
                amount=record.net_salary,
                processed_by=request.user,
                status="SIMULATED_SUCCESS",
            )

            record.status = PayrollRecord.Status.PAID
            record.save(update_fields=["status", "updated_at"])

        return Response(
            {
                "message": "Simulated salary credit recorded. No real bank transfer was made.",
                "payment": SalaryPaymentSerializer(payment).data,
                "payroll": PayrollRecordSerializer(record).data,
            },
            status=status.HTTP_201_CREATED,
        )


class SalarySlipPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        # Find the payroll record and related employee/user efficiently.
        record = get_object_or_404(
            PayrollRecord.objects.select_related(
                "employee",
                "employee__user",
                "generated_by",
            ),
            pk=pk,
        )

        # Employees may download only their own salary slips.
        is_owner = record.employee.user_id == request.user.id

        # Admin/HR users may download slips for any employee.
        profile = getattr(request.user, "hrms_profile", None)
        is_admin_or_hr = (
            request.user.is_superuser
            or bool(
                profile
                and profile.role in ["ADMIN", "HR"]
            )
        )

        if not (is_owner or is_admin_or_hr):
            return Response(
                {"detail": "You do not have permission to download this salary slip."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Keep the salary slip limited to finalized payroll records.
        if record.status not in [
            PayrollRecord.Status.LOCKED,
            PayrollRecord.Status.PAID,
        ]:
            return Response(
                {"detail": "Salary slips are available after payroll is locked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee = record.employee
        user = employee.user

        # Payment reference exists only after simulated payment.
        try:
            payment = record.salary_payment
            payment_reference = str(payment.reference)
            payment_status = payment.status
        except SalaryPayment.DoesNotExist:
            payment_reference = "Not paid"
            payment_status = "Not paid"

        # Build the PDF in memory; no temporary file is required.
        buffer = BytesIO()
        document = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "SalarySlipTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#17365D"),
            spaceAfter=8,
        )

        story = [
            Paragraph("HRMS - SALARY SLIP", title_style),
            Paragraph(
                f"Salary Period: {calendar.month_name[record.month]} {record.year}",
                styles["Heading2"],
            ),
            Spacer(1, 8),
        ]

        employee_name = user.get_full_name() or user.username

        rows = [
            ["Employee Details", "Value"],
            ["Employee Code", employee.employee_code],
            ["Employee Name", employee_name],
            ["Department", employee.department],
            ["Designation", employee.designation],
            ["Joining Date", employee.joining_date.strftime("%d-%m-%Y")],
            ["Payroll Status", record.status],
            ["Base Salary", f"Rs. {record.base_salary:,.2f}"],
            ["LOP Days", str(record.lop_days)],
            ["LOP Deduction", f"Rs. {record.lop_deduction:,.2f}"],
            ["Net Salary", f"Rs. {record.net_salary:,.2f}"],
            ["Payment Status", payment_status],
            ["Payment Reference", payment_reference],
        ]

        table = Table(rows, colWidths=[55 * mm, 105 * mm], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("BACKGROUND", (0, 10), (-1, 10), colors.HexColor("#E8F0FE")),
                    ("FONTNAME", (0, 10), (-1, 10), "Helvetica-Bold"),
                ]
            )
        )

        story.extend(
            [
                table,
                Spacer(1, 16),
                Paragraph(
                    "This is a system-generated salary slip. "
                    "A simulated payment reference does not confirm a real bank transfer.",
                    styles["Normal"],
                ),
            ]
        )

       # Generate PDF into the buffer
        document.build(story)

       # Get the PDF file content
        pdf_bytes = buffer.getvalue()
        buffer.close()

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="salary_slip_{employee.employee_code}_'
            f'{record.year}_{record.month:02d}.pdf"'
        )
        return response


