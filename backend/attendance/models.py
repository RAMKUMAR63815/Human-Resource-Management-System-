
from django.conf import settings
from django.db import models


class Attendance(models.Model):
    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.PROTECT,#n_delete=models.PROTECT option prevents deleting an employee while related records still reference that employee
        related_name="attendance_records",
    )

    date = models.DateField()
    check_in = models.DateTimeField()
    check_out = models.DateTimeField(null=True, blank=True)

    working_hours = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
    )

    notes = models.CharField(max_length=255, blank=True)

    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,#Employee delete  foreign key NULL; field-ல null=True .
        null=True,
        blank=True,
        related_name="attendance_corrections",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "date"],
                name="unique_employee_attendance_per_day",
            ),
        ]
        ordering = ["-date", "-check_in"]

    def __str__(self):
        return f"{self.employee.employee_code} - {self.date}"
