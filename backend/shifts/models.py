
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Shift(models.Model):
    class ShiftType(models.TextChoices):
        GENERAL = "GENERAL", "General"
        NIGHT = "NIGHT", "Night"
        FLEXIBLE = "FLEXIBLE", "Flexible"
        REMOTE = "REMOTE", "Remote"

    name = models.CharField(max_length=100, unique=True)

    shift_type = models.CharField(
        max_length=20,
        choices=ShiftType.choices,
        default=ShiftType.GENERAL,
    )

    start_time = models.TimeField()
    end_time = models.TimeField()

    break_minutes = models.PositiveSmallIntegerField(default=60)

    expected_hours = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=8,
    )

    grace_minutes = models.PositiveSmallIntegerField(default=10)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def clean(self):
        if self.start_time == self.end_time:
            raise ValidationError({
                "end_time": "Shift end time must differ from start time."
            })

        if self.expected_hours <= 0 or self.expected_hours > 24:
            raise ValidationError({
                "expected_hours": "Expected hours must be greater than 0 and at most 24."
            })

        if self.break_minutes >= 1440:
            raise ValidationError({
                "break_minutes": "Break duration must be less than 24 hours."
            })

    def __str__(self):
        return f"{self.name} ({self.get_shift_type_display()})"


class ShiftAssignment(models.Model):
    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.PROTECT,
        related_name="shift_assignments",
    )

    shift = models.ForeignKey(
        Shift,
        on_delete=models.PROTECT,
        related_name="assignments",
    )

    effective_start = models.DateField()
    effective_end = models.DateField(
        null=True,
        blank=True,
    )

    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shift_assignments_created",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-effective_start", "-created_at"]
        indexes = [
            models.Index(
                fields=["employee", "effective_start", "effective_end"],
                name="shift_emp_effective_idx",
            ),
        ]

    def clean(self):
        if (
            self.effective_end
            and self.effective_end < self.effective_start
        ):
            raise ValidationError({
                "effective_end": "End date cannot be before start date."
            })

    def __str__(self):
        return (
            f"{self.employee.employee_code} - "
            f"{self.shift.name} - {self.effective_start}"
        )
