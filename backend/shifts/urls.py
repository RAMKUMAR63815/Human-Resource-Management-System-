
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MyShiftView,
    ShiftAttendanceCSVReportView,
    ShiftAttendanceReportView,
    ShiftAssignmentViewSet,
    ShiftViewSet,
)

router = DefaultRouter()

# IMPORTANT: Register assignments BEFORE the empty-prefix shift route.
# Otherwise, "assignments" may be interpreted as a shift detail URL.
router.register(
    r"assignments",
    ShiftAssignmentViewSet,
    basename="shift-assignment",
)

# Shift definitions: /api/shifts/
router.register(
    r"",
    ShiftViewSet,
    basename="shift",
)

urlpatterns = [
    # Employee's own shift information
    path("my/", MyShiftView.as_view(), name="my-shifts"),

    # Shift attendance reports
    path(
        "reports/attendance/",
        ShiftAttendanceReportView.as_view(),
        name="shift-attendance-report",
    ),
    path(
        "reports/attendance.csv",
        ShiftAttendanceCSVReportView.as_view(),
        name="shift-attendance-csv",
    ),

    # Router-generated shift and assignment endpoints
    path("", include(router.urls)),
]
