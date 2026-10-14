
from django.conf import settings
from django.db import models


class Employee(models.Model):
    # Connect an employee record to a Django login account.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="employee_record",
    )

    employee_code = models.CharField(max_length=20, unique=True)
    department = models.CharField(max_length=100)
    designation = models.CharField(max_length=100)
    joining_date = models.DateField()
    salary = models.DecimalField(max_digits=12, decimal_places=2)

    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.employee_code} - {self.user.username}"
