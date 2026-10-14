
from django.conf import settings
from django.db import models
import uuid



class PayrollRecord(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        LOCKED = "LOCKED", "Locked"
        PAID = "PAID", "Paid"

    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.PROTECT,
        related_name="payroll_records",
    )

    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()

    base_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )
    lop_days = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )
    lop_deduction = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    net_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "year", "month"],
                name="unique_employee_payroll_per_month",
            ),
        ]
        ordering = ["-year", "-month"]

    def __str__(self):
        return (
            f"{self.employee.employee_code} - "
            f"{self.month}/{self.year} - {self.status}"
        )

class SalaryPayment(models.Model):
    # A simulated payment is recorded for one payroll record only.
    payroll_record = models.OneToOneField(
        "payroll.PayrollRecord",
        on_delete=models.PROTECT,
        related_name="salary_payment",
    )

    # Backend generates a unique reference for the simulated payment.
    reference = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # Amount comes from payroll, not from the API request.
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    # This confirms the payment was recorded by our application.
    status = models.CharField(max_length=20, default="SIMULATED_SUCCESS")

    paid_at = models.DateTimeField(auto_now_add=True)

    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_salary_payments",
    )

    def __str__(self):
        return f"{self.reference} - {self.amount}"
