
from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import UserProfile

User = get_user_model()


class CurrentUserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role"]

    def get_role(self, user):
        # Superusers are administrators in this HRMS.
        if user.is_superuser:
            return "ADMIN"

        profile = getattr(user, "hrms_profile", None)
        return profile.role if profile else "EMPLOYEE"

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "password",
        ]

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                "This username is already registered."
            )
        if not value:
            raise serializers.ValidationError(
                "Username is required."
            )
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError(
                "Email is required."
            )
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "This email is already registered."
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")

        user = User.objects.create_user(
            password=password,
            **validated_data,
        )

        # Every public registration starts with the Employee role.
        UserProfile.objects.get_or_create(
            user=user,
            defaults={"role": UserProfile.Role.EMPLOYEE},
        )

        return user