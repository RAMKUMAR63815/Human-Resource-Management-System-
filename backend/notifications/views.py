from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from employees.models import Employee

from .models import Notification, NotificationPreference
from .serializers import (
    NotificationSerializer,
    NotificationPreferenceSerializer,
)


class MyNotificationsView(APIView):
    """
    Return notifications belonging only to the logged-in user.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(
            recipient=request.user
        )

        unread_only = (
            request.query_params.get("unread_only", "").lower() == "true"
        )

        if unread_only:
            notifications = notifications.filter(is_read=False)

        serializer = NotificationSerializer(
            notifications[:200],
            many=True,
        )

        return Response(
            {
                "count": notifications.count(),
                "unread_count": notifications.filter(is_read=False).count(),
                "results": serializer.data,
            }
        )


class MarkNotificationReadView(APIView):
    """
    Mark one of the current user's notifications as read.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = Notification.objects.filter(
            pk=pk,
            recipient=request.user,
        ).first()

        if notification is None:
            return Response(
                {"detail": "Notification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at"])

        return Response(NotificationSerializer(notification).data)


class NotificationPreferencesView(APIView):
    """
    Read or update notification preferences for the logged-in user.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(
            user=request.user
        )

        return Response(
            NotificationPreferenceSerializer(preferences).data
        )

    def patch(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(
            user=request.user
        )

        serializer = NotificationPreferenceSerializer(
            preferences,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)


class AnnouncementCreateView(APIView):
    """
    Admin/HR can broadcast an announcement to all active employees
    or to employees in one department.

    Request JSON:
    {
        "title": "Office announcement",
        "message": "The office will be closed tomorrow.",
        "department": "Engineering"
    }

    Omit department to target all active employees.
    """

    permission_classes = [IsAuthenticated, IsAdminOrHR]

    def post(self, request):
        title = str(request.data.get("title", "")).strip()
        message = str(request.data.get("message", "")).strip()
        department = str(request.data.get("department", "")).strip()

        if not title or not message:
            return Response(
                {"detail": "Both title and message are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(title) > 200:
            return Response(
                {"detail": "Title must be 200 characters or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employees = Employee.objects.filter(is_active=True)

        if department:
            employees = employees.filter(
                department__iexact=department
            )

        recipient_ids = list(
            employees.values_list("user_id", flat=True).distinct()
        )

        if not recipient_ids:
            return Response(
                {"detail": "No active employees matched the target."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Respect each user's announcement preference.
        opted_out_ids = NotificationPreference.objects.filter(
            user_id__in=recipient_ids,
            announcements_enabled=False,
        ).values_list("user_id", flat=True)

        opted_out_ids = set(opted_out_ids)
        recipient_ids = [
            user_id
            for user_id in recipient_ids
            if user_id not in opted_out_ids
        ]

        notifications = [
            Notification(
                recipient_id=user_id,
                notification_type=Notification.NotificationType.ANNOUNCEMENT,
                title=title,
                message=message,
            )
            for user_id in recipient_ids
        ]

        if notifications:
            Notification.objects.bulk_create(notifications)

        return Response(
            {
                "detail": "Announcement processed.",
                "recipients_notified": len(notifications),
                "department": department or None,
            },
            status=status.HTTP_201_CREATED,
        )
