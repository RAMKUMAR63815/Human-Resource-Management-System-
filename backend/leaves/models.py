
from django.conf import settings
from django.db import models


class LeaveRequest(models.Model):
    class LeaveType(models.TextChoices):
        CASUAL = "CASUAL", "Casual Leave"
        SICK = "SICK", "Sick Leave"
        EARNED = "EARNED", "Earned Leave"
        UNPAID = "UNPAID", "Unpaid Leave"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.PROTECT,
        related_name="leave_requests",
    )

    leave_type = models.CharField(
        max_length=20,
        choices=LeaveType.choices,
    )

    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_leave_requests",
    )

    review_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return (
            f"{self.employee.employee_code} - "
            f"{self.start_date} - {self.status}"
        )

class LeaveBalance(models.Model):
    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.PROTECT,
        related_name="leave_balances",
    )

    leave_type = models.CharField(
        max_length=20,
        choices=LeaveRequest.LeaveType.choices,
    )

    year = models.PositiveIntegerField()

    allocated_days = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )

    used_days = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "leave_type", "year"],
                name="unique_employee_leave_balance_per_year",
            ),
        ]

    @property
    def remaining_days(self):
        return self.allocated_days - self.used_days

    def __str__(self):
        return (
            f"{self.employee.employee_code} - "
            f"{self.leave_type} - {self.year}"
        )
