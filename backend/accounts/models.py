
from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    # Each profile belongs to one Django user.
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        HR = "HR", "HR"
        EMPLOYEE = "EMPLOYEE", "Employee"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hrms_profile",
    )

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.EMPLOYEE,
    )

    def __str__(self):
        return f"{self.user.username} - {self.role}"
