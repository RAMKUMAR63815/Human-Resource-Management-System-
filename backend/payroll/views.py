
import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from django.db import models, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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

from accounts.permissions import IsAdminOrHR
from attendance.models import Attendance
from employees.models import Employee
from holidays.utils import get_holiday_dates
from leaves.models import LeaveRequest
from notifications.models import Notification, NotificationPreference
from shifts.models import ShiftAssignment

from .models import (
    EmployeeSalaryComponent,
    PayrollRecord,
    SalaryPayment,
)
from .serializers import (
    EmployeeSalaryComponentSerializer,
    PayrollRecordSerializer,
    SalaryPaymentSerializer,
)


CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value):
    """Convert a numeric value to a two-decimal Decimal."""
    return Decimal(
        str(value if value is not None else 0)
    ).quantize(CENT, rounding=ROUND_HALF_UP)


def send_payroll_notification(user, title, message):
    """Create a notification only when the user's preference permits it."""
    if user is None:
        return

    preferences, _ = NotificationPreference.objects.get_or_create(
        user=user
    )

    if not preferences.payroll_enabled:
        return

    if Notification.objects.filter(
        recipient=user,
        notification_type="PAYROLL",
        title=title,
        message=message,
    ).exists():
        return

    Notification.objects.create(
        recipient=user,
        notification_type="PAYROLL",
        title=title,
        message=message,
    )


def weekdays_in_range(start_date, end_date):
    """Yield weekdays from Monday to Friday, inclusive."""
    current = start_date

    while current <= end_date:
        if current.weekday() < 5:
            yield current

        current += timedelta(days=1)


def get_overtime_summary(employee, start_date, end_date):
    """
    Summarize recorded overtime using assigned shift expected hours.

    Overtime is informational and is not added to salary because
    no overtime payment rate is configured.
    """
    assignments = list(
        ShiftAssignment.objects.filter(
            employee=employee,
            effective_start__lte=end_date,
        )
        .filter(
            models.Q(effective_end__isnull=True)
            | models.Q(effective_end__gte=start_date)
        )
        .select_related("shift")
        .order_by("-effective_start", "-created_at")
    )

    attendance_records = Attendance.objects.filter(
        employee=employee,
        date__range=(start_date, end_date),
        check_out__isnull=False,
    ).order_by("date", "-check_in")

    total_overtime = ZERO
    overtime_days = 0
    daily_details = []

    for attendance in attendance_records:
        assignment = next(
            (
                item
                for item in assignments
                if item.effective_start <= attendance.date
                and (
                    item.effective_end is None
                    or item.effective_end >= attendance.date
                )
            ),
            None,
        )

        if assignment is None:
            continue

        expected_hours = Decimal(
            str(assignment.shift.expected_hours)
        )
        actual_hours = Decimal(
            str(attendance.working_hours or 0)
        )

        overtime_hours = max(
            actual_hours - expected_hours,
            ZERO,
        ).quantize(CENT, rounding=ROUND_HALF_UP)

        if overtime_hours <= ZERO:
            continue

        total_overtime += overtime_hours
        overtime_days += 1

        daily_details.append(
            {
                "date": attendance.date.isoformat(),
                "shift": assignment.shift.name,
                "expected_hours": str(expected_hours),
                "actual_hours": str(actual_hours),
                "overtime_hours": str(overtime_hours),
            }
        )

    return {
        "total_hours": total_overtime.quantize(
            CENT,
            rounding=ROUND_HALF_UP,
        ),
        "days": overtime_days,
        "details": daily_details,
    }


def get_effective_salary_components(employee, start_date, end_date):
    """
    Return active recurring salary components that overlap a payroll month.

    Components effective for only part of the month are prorated by
    calendar days. Full-month components receive their full monthly amount.

    Example:
    A component effective from 12 February is prorated for February,
    then receives its full monthly amount in March if still active.

    The component's effective_to date is inclusive.
    """
    components = (
        EmployeeSalaryComponent.objects.filter(
            employee=employee,
            is_active=True,
            effective_from__lte=end_date,
        )
        .filter(
            models.Q(effective_to__isnull=True)
            | models.Q(effective_to__gte=start_date)
        )
        .order_by("component_type", "name", "id")
    )

    days_in_month = Decimal((end_date - start_date).days + 1)
    results = []

    for component in components:
        active_start = max(
            start_date,
            component.effective_from,
        )

        active_end = min(
            end_date,
            component.effective_to or end_date,
        )

        active_days = Decimal(
            (active_end - active_start).days + 1
        )

        if active_days <= 0:
            continue

        monthly_amount = money(component.amount)

        prorated_amount = money(
            monthly_amount * active_days / days_in_month
        )

        # Skip a component that is not active during this month.
        if prorated_amount <= ZERO:
            continue

        results.append(
            {
                "component": component,
                "monthly_amount": monthly_amount,
                "amount": prorated_amount,
                "active_days": int(active_days),
                "days_in_month": int(days_in_month),
                "prorated": active_days < days_in_month,
            }
        )

    return results


def calculate_payroll(employee, year, month, generated_by):
    """
    Calculate payroll for a completed month.

    Rules:
    - Current and future months cannot be generated.
    - Employees who joined after the month ended cannot have payroll.
    - Weekends and configured holidays are excluded from LOP workdays.
    - Completed attendance and approved paid leave prevent LOP.
    - Unpaid leave and unexplained absences count as LOP.
    - Active recurring components are included when their effective
      dates overlap the payroll month.
    - Partial-month salary components are prorated by calendar days.
    - Salary components are saved as a historical payroll snapshot.
    - Overtime is informational until a payment rate is configured.
    - Only DRAFT payroll without a payment can be recalculated.
    - LOCKED and PAID payroll records are never silently recalculated.
    """
    today = timezone.localdate()

    if year < 1:
        raise ValueError("Year must be valid.")

    if not 1 <= month <= 12:
        raise ValueError("Month must be between 1 and 12.")

    if (year, month) >= (today.year, today.month):
        raise ValueError(
            "Payroll can only be generated for a completed month."
        )

    last_day = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    joining_date = employee.joining_date

    if joining_date and joining_date > end_date:
        raise ValueError(
            "Payroll cannot be generated before the employee's joining date."
        )

    effective_start_date = max(
        start_date,
        joining_date or start_date,
    )

    holiday_dates = set(
        get_holiday_dates(
            employee,
            effective_start_date,
            end_date,
        )
    )

    work_dates = {
        day
        for day in weekdays_in_range(
            effective_start_date,
            end_date,
        )
        if day not in holiday_dates
    }

    attendance_dates = set(
        Attendance.objects.filter(
            employee=employee,
            date__range=(effective_start_date, end_date),
            check_out__isnull=False,
        ).values_list("date", flat=True)
    )

    approved_leaves = LeaveRequest.objects.filter(
        employee=employee,
        status=LeaveRequest.Status.APPROVED,
        start_date__lte=end_date,
        end_date__gte=effective_start_date,
    )

    paid_leave_dates = set()

    for leave in approved_leaves:
        if leave.leave_type == LeaveRequest.LeaveType.UNPAID:
            continue

        leave_start = max(
            leave.start_date,
            effective_start_date,
        )
        leave_end = min(
            leave.end_date,
            end_date,
        )

        paid_leave_dates.update(
            day
            for day in weekdays_in_range(
                leave_start,
                leave_end,
            )
            if day not in holiday_dates
        )

    # Completed attendance takes precedence over paid leave.
    paid_leave_dates -= attendance_dates

    # Only actual attendance and approved paid leave prevent LOP.
    lop_dates = work_dates - attendance_dates - paid_leave_dates
    lop_days = Decimal(len(lop_dates))

    base_salary = money(employee.salary)

    if base_salary < ZERO:
        raise ValueError("Base salary cannot be negative.")

    total_workdays = len(work_dates)

    if total_workdays:
        per_day_salary = base_salary / Decimal(total_workdays)
        lop_deduction = money(per_day_salary * lop_days)
    else:
        lop_deduction = ZERO

    # Get recurring components active at any point during the month.
    effective_components = get_effective_salary_components(
        employee,
        start_date,
        end_date,
    )

    component_snapshot = []
    total_earnings = ZERO
    other_deductions = ZERO

    for item in effective_components:
        component = item["component"]
        component_amount = item["amount"]

        component_snapshot.append(
            {
                "id": component.pk,
                "name": component.name,
                "component_type": component.component_type,
                "amount": str(component_amount),
                "monthly_amount": str(item["monthly_amount"]),
                "effective_from": component.effective_from.isoformat(),
                "effective_to": (
                    component.effective_to.isoformat()
                    if component.effective_to
                    else None
                ),
                "active_days": item["active_days"],
                "days_in_month": item["days_in_month"],
                "prorated": item["prorated"],
            }
        )

        if (
            component.component_type
            == EmployeeSalaryComponent.ComponentType.EARNING
        ):
            total_earnings += component_amount

        elif (
            component.component_type
            == EmployeeSalaryComponent.ComponentType.DEDUCTION
        ):
            other_deductions += component_amount

    total_earnings = money(total_earnings)
    other_deductions = money(other_deductions)

    overtime = get_overtime_summary(
        employee,
        effective_start_date,
        end_date,
    )

    if overtime["total_hours"] > ZERO:
        component_snapshot.append(
            {
                "name": "Overtime Hours",
                "component_type": "INFO",
                "amount": str(overtime["total_hours"]),
                "unit": "hours",
                "overtime_days": overtime["days"],
                "details": overtime["details"],
            }
        )

    gross_salary = money(base_salary + total_earnings)
    total_deductions = money(
        lop_deduction + other_deductions
    )
    net_salary = money(
        max(gross_salary - total_deductions, ZERO)
    )

    with transaction.atomic():
        record, created = PayrollRecord.objects.get_or_create(
            employee=employee,
            year=year,
            month=month,
            defaults={
                "base_salary": base_salary,
                "lop_days": lop_days,
                "lop_deduction": lop_deduction,
                "gross_salary": gross_salary,
                "total_deductions": total_deductions,
                "salary_components": component_snapshot,
                "net_salary": net_salary,
                "status": PayrollRecord.Status.DRAFT,
                "generated_by": generated_by,
            },
        )

        if not created:
            record = (
                PayrollRecord.objects.select_for_update()
                .get(pk=record.pk)
            )

            if record.status != PayrollRecord.Status.DRAFT:
                raise ValueError(
                    "Only draft payroll can be recalculated."
                )

            if SalaryPayment.objects.filter(
                payroll_record=record
            ).exists():
                raise ValueError(
                    "Payroll with a payment record cannot be recalculated."
                )

            record.base_salary = base_salary
            record.lop_days = lop_days
            record.lop_deduction = lop_deduction
            record.gross_salary = gross_salary
            record.total_deductions = total_deductions
            record.salary_components = component_snapshot
            record.net_salary = net_salary
            record.generated_by = generated_by

            record.save(
                update_fields=[
                    "base_salary",
                    "lop_days",
                    "lop_deduction",
                    "gross_salary",
                    "total_deductions",
                    "salary_components",
                    "net_salary",
                    "generated_by",
                    "updated_at",
                ]
            )

    return record


class GeneratePayrollView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request):
        try:
            employee_id = int(request.data.get("employee_id"))
            year = int(request.data.get("year"))
            month = int(request.data.get("month"))

            if employee_id <= 0:
                raise ValueError("Employee ID must be positive.")

        except (TypeError, ValueError):
            return Response(
                {
                    "detail": (
                        "Provide a valid employee_id, year and month."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            employee = Employee.objects.select_related("user").get(
                pk=employee_id,
                is_active=True,
            )
        except Employee.DoesNotExist:
            return Response(
                {"detail": "Active employee not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            record = calculate_payroll(
                employee=employee,
                year=year,
                month=month,
                generated_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        send_payroll_notification(
            user=employee.user,
            title="Payroll generated",
            message=(
                f"Your payroll for {calendar.month_name[record.month]} "
                f"{record.year} has been generated. "
                f"Net salary: Rs. {record.net_salary:,.2f}."
            ),
        )

        return Response(
            PayrollRecordSerializer(record).data,
            status=(
                status.HTTP_200_OK
                if record.status == PayrollRecord.Status.DRAFT
                else status.HTTP_201_CREATED
            ),
        )


class MyPayrollHistoryView(generics.ListAPIView):
    serializer_class = PayrollRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        employee = get_object_or_404(
            Employee,
            user=self.request.user,
        )

        queryset = (
            PayrollRecord.objects.filter(employee=employee)
            .select_related(
                "employee",
                "employee__user",
                "generated_by",
            )
            .order_by("-year", "-month")
        )

        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")

        if year:
            if not year.isdigit():
                return queryset.none()
            queryset = queryset.filter(year=int(year))

        if month:
            if not month.isdigit() or not 1 <= int(month) <= 12:
                return queryset.none()
            queryset = queryset.filter(month=int(month))

        return queryset


class PayrollListView(generics.ListAPIView):
    serializer_class = PayrollRecordSerializer
    permission_classes = [IsAdminOrHR]

    def get_queryset(self):
        queryset = PayrollRecord.objects.select_related(
            "employee",
            "employee__user",
            "generated_by",
        ).order_by("-year", "-month")

        employee_id = self.request.query_params.get("employee_id")
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")

        if employee_id:
            if not employee_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(employee_id=int(employee_id))

        if year:
            if not year.isdigit():
                return queryset.none()
            queryset = queryset.filter(year=int(year))

        if month:
            if not month.isdigit() or not 1 <= int(month) <= 12:
                return queryset.none()
            queryset = queryset.filter(month=int(month))

        return queryset


class SalaryComponentListCreateView(generics.ListCreateAPIView):
    serializer_class = EmployeeSalaryComponentSerializer
    permission_classes = [IsAdminOrHR]

    def get_queryset(self):
        queryset = EmployeeSalaryComponent.objects.select_related(
            "employee",
            "employee__user",
        ).order_by("employee_id", "component_type", "name")

        employee_id = self.request.query_params.get("employee_id")

        if employee_id:
            if not employee_id.isdigit():
                return queryset.none()
            queryset = queryset.filter(employee_id=int(employee_id))

        return queryset


class SalaryComponentDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = EmployeeSalaryComponentSerializer
    permission_classes = [IsAdminOrHR]

    queryset = EmployeeSalaryComponent.objects.select_related(
        "employee",
        "employee__user",
    )


class LockPayrollView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request, pk):
        with transaction.atomic():
            record = get_object_or_404(
                PayrollRecord.objects.select_for_update().select_related(
                    "employee",
                    "employee__user",
                ),
                pk=pk,
            )

            if record.status != PayrollRecord.Status.DRAFT:
                return Response(
                    {"detail": "Only draft payroll can be locked."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if SalaryPayment.objects.filter(
                payroll_record=record
            ).exists():
                return Response(
                    {
                        "detail": (
                            "Payroll already has a payment record "
                            "and cannot be locked again."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            record.status = PayrollRecord.Status.LOCKED
            record.save(update_fields=["status", "updated_at"])

        send_payroll_notification(
            user=record.employee.user,
            title="Payroll finalized",
            message=(
                f"Your payroll for {calendar.month_name[record.month]} "
                f"{record.year} has been locked and finalized. "
                f"Net salary: Rs. {record.net_salary:,.2f}."
            ),
        )

        return Response(PayrollRecordSerializer(record).data)


class SimulateSalaryPaymentView(APIView):
    permission_classes = [IsAdminOrHR]

    def post(self, request, pk):
        with transaction.atomic():
            record = get_object_or_404(
                PayrollRecord.objects.select_for_update().select_related(
                    "employee",
                    "employee__user",
                ),
                pk=pk,
            )

            if record.status != PayrollRecord.Status.LOCKED:
                return Response(
                    {"detail": "Only locked payroll can be paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if SalaryPayment.objects.filter(
                payroll_record=record
            ).exists():
                return Response(
                    {
                        "detail": (
                            "A payment record already exists for this payroll."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            payment = SalaryPayment.objects.create(
                payroll_record=record,
                amount=record.net_salary,
                processed_by=request.user,
                status="SIMULATED_SUCCESS",
            )

            record.status = PayrollRecord.Status.PAID
            record.save(update_fields=["status", "updated_at"])

        send_payroll_notification(
            user=record.employee.user,
            title="Salary payment simulated",
            message=(
                f"The simulated salary payment for "
                f"{calendar.month_name[record.month]} {record.year} "
                f"has been recorded. Amount: Rs. "
                f"{record.net_salary:,.2f}. No real bank transfer was made."
            ),
        )

        return Response(
            {
                "message": (
                    "Simulated salary credit recorded. "
                    "No real bank transfer was made."
                ),
                "payment": SalaryPaymentSerializer(payment).data,
                "payroll": PayrollRecordSerializer(record).data,
            },
            status=status.HTTP_201_CREATED,
        )


class SalarySlipPDFView(APIView):
    """
    Generate a salary slip using the saved payroll record.

    PDF downloads never recalculate payroll or modify its snapshot.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        record = get_object_or_404(
            PayrollRecord.objects.select_related(
                "employee",
                "employee__user",
                "generated_by",
            ),
            pk=pk,
        )

        employee = record.employee
        user = employee.user

        is_owner = employee.user_id == request.user.id
        profile = getattr(request.user, "hrms_profile", None)

        is_admin_or_hr = (
            request.user.is_superuser
            or bool(profile and profile.role in ["ADMIN", "HR"])
        )

        if not (is_owner or is_admin_or_hr):
            return Response(
                {
                    "detail": (
                        "You do not have permission to download "
                        "this salary slip."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payment = record.salary_payment
            payment_reference = str(payment.reference)
            payment_status = payment.status
        except SalaryPayment.DoesNotExist:
            payment_reference = "Not paid"
            payment_status = "Not paid"

        employee_name = (
            user.get_full_name().strip() or user.username
        )

        buffer = BytesIO()

        document = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=18 * mm,
            leftMargin=18 * mm,
            topMargin=16 * mm,
            bottomMargin=16 * mm,
            title=(
                f"Salary Slip - {employee.employee_code} - "
                f"{record.year}-{record.month:02d}"
            ),
            author="HRMS",
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "HRMSSalarySlipTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#17365D"),
            fontSize=18,
            leading=22,
            spaceAfter=8,
        )

        period_style = ParagraphStyle(
            "HRMSSalaryPeriod",
            parent=styles["Heading2"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#334155"),
            fontSize=11,
            spaceAfter=14,
        )

        section_style = ParagraphStyle(
            "HRMSSalarySection",
            parent=styles["Heading3"],
            textColor=colors.HexColor("#17365D"),
            fontSize=10,
            spaceBefore=10,
            spaceAfter=6,
        )

        note_style = ParagraphStyle(
            "HRMSSalaryNote",
            parent=styles["Normal"],
            fontSize=8,
            leading=12,
            textColor=colors.HexColor("#475569"),
        )

        def amount(value):
            """Format a saved monetary value."""
            return f"Rs. {money(value):,.2f}"

        def make_table(rows, col_widths):
            """Build a consistently formatted PDF table."""
            table = Table(
                rows,
                colWidths=col_widths,
                repeatRows=1,
                hAlign="LEFT",
            )

            table.setStyle(
                TableStyle(
                    [
                        (
                            "BACKGROUND", (0, 0), (-1, 0),
                            colors.HexColor("#17365D"),
                        ),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                        (
                            "GRID", (0, 0), (-1, -1),
                            0.4, colors.HexColor("#CBD5E1"),
                        ),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 7),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )

            return table

        employee_rows = [
            ["Employee Details", "Value"],
            ["Employee Code", str(employee.employee_code)],
            ["Employee Name", employee_name],
            ["Department", str(employee.department or "-")],
            ["Designation", str(employee.designation or "-")],
            [
                "Joining Date",
                (
                    employee.joining_date.strftime("%d-%m-%Y")
                    if employee.joining_date
                    else "-"
                ),
            ],
            [
                "Payroll Period",
                f"{calendar.month_name[record.month]} {record.year}",
            ],
            ["Payroll Status", str(record.status)],
        ]

        # Always use the saved snapshot for historical consistency.
        saved_components = record.salary_components or []

        earnings = []
        component_deductions = []
        informational_items = []

        for component in saved_components:
            name = str(component.get("name", "Component"))
            component_type = component.get("component_type", "")
            component_amount = money(
                component.get("amount", "0.00")
            )

            if (
                component_type
                == EmployeeSalaryComponent.ComponentType.EARNING
            ):
                earnings.append((name, component_amount))

            elif (
                component_type
                == EmployeeSalaryComponent.ComponentType.DEDUCTION
            ):
                component_deductions.append(
                    (name, component_amount)
                )

            elif component_type == "INFO":
                unit = str(component.get("unit", ""))

                informational_items.append(
                    (
                        name,
                        f"{component_amount:,.2f}"
                        + (f" {unit}" if unit else ""),
                    )
                )

        salary_rows = [
            ["Earnings", "Amount"],
            ["Base Salary", amount(record.base_salary)],
        ]

        for name, component_amount in earnings:
            salary_rows.append(
                [name, amount(component_amount)]
            )

        salary_rows.append(
            ["Gross Salary", amount(record.gross_salary)]
        )

        salary_table = make_table(
            salary_rows,
            [105 * mm, 55 * mm],
        )

        salary_table.setStyle(
            TableStyle(
                [
                    (
                        "BACKGROUND", (0, -1), (-1, -1),
                        colors.HexColor("#E8F0FE"),
                    ),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ]
            )
        )

        deduction_rows = [
            ["Deductions", "Amount"],
            [
                "Loss of Pay (LOP) Days",
                f"{money(record.lop_days):,.2f} days",
            ],
            [
                "Loss of Pay Deduction",
                amount(record.lop_deduction),
            ],
        ]

        for name, component_amount in component_deductions:
            deduction_rows.append(
                [name, amount(component_amount)]
            )

        displayed_deductions = money(
            record.lop_deduction
            + sum(
                (value for _, value in component_deductions),
                ZERO,
            )
        )

        additional_deductions = money(
            record.total_deductions - displayed_deductions
        )

        if additional_deductions > ZERO:
            deduction_rows.append(
                [
                    "Other Deductions",
                    amount(additional_deductions),
                ]
            )

        deduction_rows.append(
            [
                "Total Deductions",
                amount(record.total_deductions),
            ]
        )

        deduction_table = make_table(
            deduction_rows,
            [105 * mm, 55 * mm],
        )

        deduction_table.setStyle(
            TableStyle(
                [
                    (
                        "BACKGROUND", (0, -1), (-1, -1),
                        colors.HexColor("#FEE2E2"),
                    ),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ]
            )
        )

        net_table = Table(
            [
                [
                    "NET SALARY PAYABLE",
                    amount(record.net_salary),
                ]
            ],
            colWidths=[105 * mm, 55 * mm],
            hAlign="LEFT",
        )

        net_table.setStyle(
            TableStyle(
                [
                    (
                        "BACKGROUND", (0, 0), (-1, -1),
                        colors.HexColor("#DCFCE7"),
                    ),
                    (
                        "TEXTCOLOR", (0, 0), (-1, -1),
                        colors.HexColor("#166534"),
                    ),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 11),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ]
            )
        )

        payment_rows = [
            ["Payment Details", "Value"],
            ["Payment Status", str(payment_status)],
            ["Payment Reference", payment_reference],
        ]

        overtime_rows = None

        if informational_items:
            overtime_rows = [
                ["Informational Item", "Recorded Value"]
            ]
            overtime_rows.extend(informational_items)

        story = [
            Paragraph("HRMS - SALARY SLIP", title_style),
            Paragraph(
                (
                    f"Salary Period: {calendar.month_name[record.month]} "
                    f"{record.year}"
                ),
                period_style,
            ),
            Paragraph("Employee Information", section_style),
            make_table(employee_rows, [55 * mm, 105 * mm]),
            Spacer(1, 8),
            Paragraph("Earnings Breakdown", section_style),
            salary_table,
            Spacer(1, 8),
            Paragraph("Deductions Breakdown", section_style),
            deduction_table,
            Spacer(1, 10),
            net_table,
            Spacer(1, 10),
            Paragraph("Payment Information", section_style),
            make_table(payment_rows, [55 * mm, 105 * mm]),
        ]

        if overtime_rows:
            story.extend(
                [
                    Spacer(1, 8),
                    Paragraph(
                        "Additional Information",
                        section_style,
                    ),
                    make_table(
                        overtime_rows,
                        [105 * mm, 55 * mm],
                    ),
                ]
            )

        story.extend(
            [
                Spacer(1, 16),
                Paragraph(
                    (
                        "This is a system-generated salary slip based "
                        "on the saved payroll record. A simulated payment "
                        "reference does not confirm a real bank transfer. "
                        "Overtime hours are informational unless an "
                        "overtime pay rate has been configured. Partial-"
                        "month salary components are prorated by calendar "
                        "days according to their effective dates."
                    ),
                    note_style,
                ),
            ]
        )

        document.build(story)

        pdf_bytes = buffer.getvalue()
        buffer.close()

        response = HttpResponse(
            pdf_bytes,
            content_type="application/pdf",
        )

        response["Content-Disposition"] = (
            f'attachment; filename="salary_slip_'
            f'{employee.employee_code}_'
            f'{record.year}_{record.month:02d}.pdf"'
        )

        return response
