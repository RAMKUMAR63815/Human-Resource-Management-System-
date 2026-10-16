from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Notification, NotificationPreference


User = get_user_model()


PREFERENCE_FIELDS = {
    Notification.NotificationType.LEAVE: "leave_enabled",
    Notification.NotificationType.PAYROLL: "payroll_enabled",
    Notification.NotificationType.ATTENDANCE: "attendance_enabled",
    Notification.NotificationType.ANNOUNCEMENT: "announcements_enabled",
    Notification.NotificationType.GENERAL: "general_enabled",
}


def create_notification(
    recipient,
    title,
    message,
    notification_type=Notification.NotificationType.GENERAL,
):
    """
    Create a notification for one user.

    Returns the Notification instance if delivered.
    Returns None if the category is disabled.
    """

    if not recipient or not recipient.is_active:
        return None

    preference_field = PREFERENCE_FIELDS.get(
        notification_type,
        "general_enabled",
    )

    preferences, _ = NotificationPreference.objects.get_or_create(
        user=recipient
    )

    if not getattr(preferences, preference_field, True):
        return None

    return Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=title.strip(),
        message=message.strip(),
    )


def notify_employee(
    employee,
    title,
    message,
    notification_type=Notification.NotificationType.GENERAL,
):
    """
    Create a notification using an Employee model instance.
    """

    if not employee or not employee.is_active:
        return None

    return create_notification(
        recipient=employee.user,
        title=title,
        message=message,
        notification_type=notification_type,
    )


def notify_users(
    users,
    title,
    message,
    notification_type=Notification.NotificationType.GENERAL,
):
    """
    Notify multiple users while respecting their preferences.

    Returns the number of notifications created.
    """

    preference_field = PREFERENCE_FIELDS.get(
        notification_type,
        "general_enabled",
    )

    user_ids = {
        user.pk
        for user in users
        if user and user.pk and user.is_active
    }

    if not user_ids:
        return 0

    existing_preferences = {
        preference.user_id: preference
        for preference in NotificationPreference.objects.filter(
            user_id__in=user_ids
        )
    }

    missing_ids = user_ids - set(existing_preferences.keys())

    if missing_ids:
        NotificationPreference.objects.bulk_create(
            [
                NotificationPreference(user_id=user_id)
                for user_id in missing_ids
            ],
            ignore_conflicts=True,
        )

        # Re-read preferences in case another request created them.
        existing_preferences = {
            preference.user_id: preference
            for preference in NotificationPreference.objects.filter(
                user_id__in=user_ids
            )
        }

    notifications = []

    for user_id in user_ids:
        preferences = existing_preferences.get(user_id)

        # Default preferences enable every category.
        if preferences and getattr(preferences, preference_field, True):
            notifications.append(
                Notification(
                    recipient_id=user_id,
                    notification_type=notification_type,
                    title=title.strip(),
                    message=message.strip(),
                )
            )

    if notifications:
        Notification.objects.bulk_create(notifications)

    return len(notifications)
