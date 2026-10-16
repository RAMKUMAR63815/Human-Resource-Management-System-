from rest_framework import serializers

from .models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "is_read",
            "created_at",
            "read_at",
        ]
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "leave_enabled",
            "payroll_enabled",
            "attendance_enabled",
            "announcements_enabled",
            "general_enabled",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]