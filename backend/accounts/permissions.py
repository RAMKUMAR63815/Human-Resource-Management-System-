
from rest_framework.permissions import BasePermission


class IsAdminOrHR(BasePermission):
    # Only Admin and HR users can manage employee records.
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "hrms_profile", None)

        return bool(
            profile
            and profile.role in ["ADMIN", "HR"]
        )
