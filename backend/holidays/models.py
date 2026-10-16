from django.conf import settings
from django.db import models


class Holiday(models.Model):
    class HolidayType(models.TextChoices):
        COMPANY = "COMPANY", "Company-wide"
        REGIONAL = "REGIONAL", "Regional"
        OPTIONAL = "OPTIONAL", "Optional"

    name = models.CharField(max_length=150)
    date = models.DateField(db_index=True)
    holiday_type = models.CharField(
        max_length=10,
        choices=HolidayType.choices,
        default=HolidayType.COMPANY,
    )
    region = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_holidays",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "date", "region"],
                name="unique_holiday_name_date_region",
            )
        ]

    def __str__(self):
        return f"{self.name} - {self.date}"


class OptionalHolidaySelection(models.Model):
    # Records which optional holiday an employee chooses.
    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.CASCADE,
        related_name="optional_holiday_selections",
    )
    holiday = models.ForeignKey(
        Holiday,
        on_delete=models.CASCADE,
        related_name="employee_selections",
    )
    selected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "holiday"],
                name="unique_employee_optional_holiday",
            )
        ]

    def __str__(self):
        return f"{self.employee.employee_code} - {self.holiday.name}"
