from django.urls import path

from .views import (
    HolidayListCreateView,
    HolidayDetailView,
    HolidayCalendarView,
    OptionalHolidaySelectView,
)

urlpatterns = [
    path("", HolidayListCreateView.as_view(), name="holiday-list-create"),
    path("calendar/", HolidayCalendarView.as_view(), name="holiday-calendar"),
    path(
        "<int:pk>/",
        HolidayDetailView.as_view(),
        name="holiday-detail",
    ),
    path(
        "<int:pk>/select/",
        OptionalHolidaySelectView.as_view(),
        name="optional-holiday-select",
    ),
]