from django.urls import path

from .views import (
    MyNotificationsView,
    MarkNotificationReadView,
    NotificationPreferencesView,
    AnnouncementCreateView,
)

urlpatterns = [
    path("", MyNotificationsView.as_view(), name="my-notifications"),
    path(
        "preferences/",
        NotificationPreferencesView.as_view(),
        name="notification-preferences",
    ),
    path(
        "<int:pk>/read/",
        MarkNotificationReadView.as_view(),
        name="mark-notification-read",
    ),
    path(
        "announcements/",
        AnnouncementCreateView.as_view(),
        name="create-announcement",
    ),
]
