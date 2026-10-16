
from django.urls import path

from .views import (
    CheckInView,
    CheckOutView,
    MyAttendanceView,
    AllAttendanceView,
    AttendanceCSVReportView,
    MyAttendanceSummaryView,
)

urlpatterns = [
    path("check-in/", CheckInView.as_view(), name="check-in"),
    path("check-out/", CheckOutView.as_view(), name="check-out"),
    path("my/", MyAttendanceView.as_view(), name="my-attendance"),
    path("all/", AllAttendanceView.as_view(), name="all-attendance"),
    path("report/csv/", AttendanceCSVReportView.as_view(), name="attendance-csv-report"),
    path(
    "my/summary/",
    MyAttendanceSummaryView.as_view(),
    name="my-attendance-summary",
),
    
]
