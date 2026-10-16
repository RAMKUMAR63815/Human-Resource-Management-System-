
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.utils import timezone

from .models import ShiftAssignment


def get_shift_assignment(employee, attendance_date):
    """Return the shift assignment effective on the attendance date."""
    return (
        ShiftAssignment.objects.filter(
            employee=employee,
            effective_start__lte=attendance_date,
        )
        .filter(
            Q(effective_end__isnull=True)
            | Q(effective_end__gte=attendance_date)
        )
        .select_related("shift")
        .order_by("-effective_start")
        .first()
    )


def make_shift_datetime(day, shift_time):
    """Build a datetime using Django's configured timezone."""
    value = datetime.combine(day, shift_time)

    if timezone.is_aware(timezone.now()):
        return timezone.make_aware(
            value,
            timezone.get_current_timezone(),
        )

    return value


def get_shift_metrics(attendance):
    """Calculate late arrival, early checkout, and estimated overtime."""
    assignment = get_shift_assignment(
        attendance.employee,
        attendance.date,
    )

    if assignment is None:
        return {
            "shift_assignment_id": None,
            "shift_name": None,
            "late_minutes": 0,
            "early_checkout_minutes": 0,
            "overtime_hours": "0.00",
        }

    shift = assignment.shift

    start_datetime = make_shift_datetime(
        attendance.date,
        shift.start_time,
    )

    end_date = attendance.date
    if shift.end_time <= shift.start_time:
        end_date += timedelta(days=1)

    end_datetime = make_shift_datetime(
        end_date,
        shift.end_time,
    )

    check_in = attendance.check_in
    if timezone.is_aware(check_in):
        check_in = timezone.localtime(check_in)

    late_minutes = 0
    early_checkout_minutes = 0

    if shift.shift_type != "FLEXIBLE":
        allowed_start = start_datetime + timedelta(
            minutes=shift.grace_minutes
        )

        if check_in > allowed_start:
            late_minutes = int(
                (check_in - allowed_start).total_seconds() // 60
            )

        if attendance.check_out is not None:
            check_out = attendance.check_out
            if timezone.is_aware(check_out):
                check_out = timezone.localtime(check_out)

            if check_out < end_datetime:
                early_checkout_minutes = int(
                    (end_datetime - check_out).total_seconds() // 60
                )

    elapsed_hours = Decimal(str(attendance.working_hours or 0))
    break_hours = Decimal(str(shift.break_minutes)) / Decimal("60")

    productive_hours = max(
        elapsed_hours - break_hours,
        Decimal("0"),
    )

    if attendance.check_out is None:
        overtime_hours = Decimal("0")
    else:
        overtime_hours = max(
            productive_hours - Decimal(str(shift.expected_hours)),
            Decimal("0"),
        )

    overtime_hours = overtime_hours.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    return {
        "shift_assignment_id": assignment.id,
        "shift_name": shift.name,
        "late_minutes": late_minutes,
        "early_checkout_minutes": early_checkout_minutes,
        "overtime_hours": f"{overtime_hours:.2f}",
    }
