
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from accounts.models import UserProfile
from attendance.models import Attendance
from employees.models import Employee
from shifts.models import Shift, ShiftAssignment
from shifts.utils import get_shift_assignment, get_shift_metrics


class ShiftMetricsTests(TestCase):
    def setUp(self):
        User = get_user_model()

        self.user = User.objects.create_user(
            username="shift_test_employee",
            password="TestPassword123!",
            first_name="Test",
            last_name="Employee",
        )

        UserProfile.objects.create(
            user=self.user,
            role=UserProfile.Role.EMPLOYEE,
        )

        self.employee = Employee.objects.create(
            user=self.user,
            employee_code="TEST-SHIFT-001",
            department="Software development",
            designation="Developer",
            joining_date=date(2025, 1, 1),
            salary=Decimal("50000.00"),
        )

        self.work_date = date(2026, 10, 15)

        self.shift = Shift.objects.create(
            name="Test General Shift",
            shift_type=Shift.ShiftType.GENERAL,
            start_time=time(9, 0),
            end_time=time(18, 0),
            break_minutes=60,
            expected_hours=Decimal("8.00"),
            grace_minutes=10,
        )

        self.assignment = ShiftAssignment.objects.create(
            employee=self.employee,
            shift=self.shift,
            effective_start=self.work_date,
        )

    def make_attendance(
        self,
        check_in,
        check_out=None,
        working_hours=Decimal("0.00"),
        attendance_date=None,
    ):
        attendance_date = attendance_date or self.work_date

        check_in_datetime = datetime.combine(
            attendance_date,
            check_in,
        )

        check_out_datetime = None

        if check_out is not None:
            checkout_date = attendance_date

            if check_out < check_in:
                checkout_date += timedelta(days=1)

            check_out_datetime = datetime.combine(
                checkout_date,
                check_out,
            )

        current_tz = timezone.get_current_timezone()

        return Attendance.objects.create(
            employee=self.employee,
            date=attendance_date,
            check_in=timezone.make_aware(
                check_in_datetime,
                current_tz,
            ),
            check_out=(
                timezone.make_aware(
                    check_out_datetime,
                    current_tz,
                )
                if check_out_datetime is not None
                else None
            ),
            working_hours=working_hours,
        )

    def test_assignment_is_found_on_effective_date(self):
        assignment = get_shift_assignment(
            self.employee,
            self.work_date,
        )

        self.assertEqual(assignment, self.assignment)

    def test_assignment_is_not_found_before_start_date(self):
        assignment = get_shift_assignment(
            self.employee,
            date(2026, 10, 14),
        )

        self.assertIsNone(assignment)

    def test_assignment_is_not_found_after_end_date(self):
        self.assignment.effective_end = self.work_date
        self.assignment.save()

        assignment = get_shift_assignment(
            self.employee,
            date(2026, 10, 16),
        )

        self.assertIsNone(assignment)

    def test_check_in_at_grace_limit_is_not_late(self):
        attendance = self.make_attendance(
            check_in=time(9, 10),
        )

        metrics = get_shift_metrics(attendance)

        self.assertEqual(metrics["late_minutes"], 0)

    def test_late_minutes_are_measured_after_grace(self):
        attendance = self.make_attendance(
            check_in=time(9, 25),
        )

        metrics = get_shift_metrics(attendance)

        self.assertEqual(metrics["late_minutes"], 15)

    def test_early_checkout_is_calculated(self):
        attendance = self.make_attendance(
            check_in=time(9, 0),
            check_out=time(17, 30),
            working_hours=Decimal("8.50"),
        )

        metrics = get_shift_metrics(attendance)

        self.assertEqual(
            metrics["early_checkout_minutes"],
            30,
        )

    def test_overtime_deducts_scheduled_break(self):
        attendance = self.make_attendance(
            check_in=time(9, 0),
            check_out=time(19, 0),
            working_hours=Decimal("10.00"),
        )

        metrics = get_shift_metrics(attendance)

        # 10 elapsed hours - 1 hour break - 8 expected hours.
        self.assertEqual(metrics["overtime_hours"], "1.00")

    def test_open_attendance_has_no_overtime(self):
        attendance = self.make_attendance(
            check_in=time(9, 0),
            working_hours=Decimal("9.00"),
        )

        metrics = get_shift_metrics(attendance)

        self.assertEqual(metrics["overtime_hours"], "0.00")

    def test_flexible_shift_does_not_enforce_fixed_times(self):
        self.shift.shift_type = Shift.ShiftType.FLEXIBLE
        self.shift.save()

        attendance = self.make_attendance(
            check_in=time(10, 30),
            check_out=time(17, 0),
            working_hours=Decimal("6.50"),
        )

        metrics = get_shift_metrics(attendance)

        self.assertEqual(metrics["late_minutes"], 0)
        self.assertEqual(metrics["early_checkout_minutes"], 0)

    def test_overnight_shift_uses_next_day_as_end_date(self):
        self.shift.start_time = time(22, 0)
        self.shift.end_time = time(6, 0)
        self.shift.shift_type = Shift.ShiftType.NIGHT
        self.shift.expected_hours = Decimal("7.00")
        self.shift.break_minutes = 60
        self.shift.save()

        attendance = self.make_attendance(
            check_in=time(22, 0),
            check_out=time(5, 30),
            working_hours=Decimal("7.50"),
        )

        metrics = get_shift_metrics(attendance)

        self.assertEqual(metrics["early_checkout_minutes"], 30)
        self.assertEqual(metrics["overtime_hours"], "0.00")
