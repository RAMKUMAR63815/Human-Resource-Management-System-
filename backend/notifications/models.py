from django.conf import settings
from django.db import models


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        LEAVE = "LEAVE", "Leave"
        PAYROLL = "PAYROLL", "Payroll"
        ATTENDANCE = "ATTENDANCE", "Attendance"
        ANNOUNCEMENT = "ANNOUNCEMENT", "Announcement"
        GENERAL = "GENERAL", "General"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hrms_notifications",
    )

    notification_type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.GENERAL,
    )

    title = models.CharField(max_length=200)
    message = models.TextField()

    is_read = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["recipient", "is_read", "-created_at"],
                name="notif_recipient_read_idx",
            ),
        ]

    def __str__(self):
        return f"{self.recipient.username}: {self.title}"


class NotificationPreference(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )

    leave_enabled = models.BooleanField(default=True)
    payroll_enabled = models.BooleanField(default=True)
    attendance_enabled = models.BooleanField(default=True)
    announcements_enabled = models.BooleanField(default=True)
    general_enabled = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Notification preferences - {self.user.username}"
