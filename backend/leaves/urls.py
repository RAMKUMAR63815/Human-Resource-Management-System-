
from django.urls import path

from .views import (
    MyLeaveRequestsView,
    AllLeaveRequestsView,
    LeaveReviewView,
    LeaveCSVReportView,
)

urlpatterns = [
    path("my/", MyLeaveRequestsView.as_view(), name="my-leaves"),
    path("all/", AllLeaveRequestsView.as_view(), name="all-leaves"),
    path("<int:pk>/review/", LeaveReviewView.as_view(), name="review-leave"),
    path("report/csv/", LeaveCSVReportView.as_view(), name="leave-csv-report"),
]
