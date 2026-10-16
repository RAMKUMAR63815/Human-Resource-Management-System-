from datetime import date

from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from employees.models import Employee

from .models import Holiday, OptionalHolidaySelection
from .serializers import (
    HolidaySerializer,
    OptionalHolidaySelectionSerializer,
)


def get_employee(user):
    return Employee.objects.filter(
        user=user,
        is_active=True,
    ).first()


def applicable_holidays(employee):
    """Return holidays applicable to this employee."""
    today = timezone.localdate()

    holidays = Holiday.objects.filter(
        is_active=True,
        date__gte=date(today.year, 1, 1),
    ).filter(
        date__lte=date(today.year + 5, 12, 31)
    )

    # Include company-wide holidays and holidays for this employee's region.
    holidays = holidays.filter(
        holiday_type=Holiday.HolidayType.COMPANY
    ) | holidays.filter(
        holiday_type=Holiday.HolidayType.REGIONAL,
        region__iexact=employee.region,
    )

    # Optional holidays are visible to employees, but only selected
    # optional holidays count as applicable holidays.
    selected_ids = OptionalHolidaySelection.objects.filter(
        employee=employee,
        holiday__is_active=True,
    ).values_list("holiday_id", flat=True)

    optional = Holiday.objects.filter(
        id__in=selected_ids,
        holiday_type=Holiday.HolidayType.OPTIONAL,
        is_active=True,
    )

    return (holidays | optional).distinct().order_by("date", "name")


class HolidayListCreateView(generics.ListCreateAPIView):
    serializer_class = HolidaySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Admin/HR can see all holidays. Employees see holidays
        # applicable to their region and selected optional holidays.
        if (
            self.request.user.is_superuser
            or IsAdminOrHR().has_permission(self.request, self)
        ):
            queryset = Holiday.objects.all()
        else:
            employee = get_employee(self.request.user)
            if not employee:
                return Holiday.objects.none()

            selected_ids = OptionalHolidaySelection.objects.filter(
                employee=employee,
            ).values_list("holiday_id", flat=True)

            queryset = Holiday.objects.filter(
                is_active=True,
            ).filter(
                holiday_type=Holiday.HolidayType.COMPANY
            ) | Holiday.objects.filter(
                is_active=True,
                holiday_type=Holiday.HolidayType.REGIONAL,
                region__iexact=employee.region,
            ) | Holiday.objects.filter(
                is_active=True,
                holiday_type=Holiday.HolidayType.OPTIONAL,
            )

            queryset = queryset.distinct()

        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")

        if year:
            try:
                year = int(year)
                if not 1900 <= year <= 2200:
                    raise ValueError
            except (TypeError, ValueError):
                return Holiday.objects.none()

            queryset = queryset.filter(date__year=year)

        if month:
            try:
                month = int(month)
                if not 1 <= month <= 12:
                    raise ValueError
            except (TypeError, ValueError):
                return Holiday.objects.none()

            queryset = queryset.filter(date__month=month)

        return queryset.order_by("date", "name")

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminOrHR()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class HolidayDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = HolidaySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if (
            self.request.user.is_superuser
            or IsAdminOrHR().has_permission(self.request, self)
        ):
            return Holiday.objects.all()

        employee = get_employee(self.request.user)
        if not employee:
            return Holiday.objects.none()

        selected_ids = OptionalHolidaySelection.objects.filter(
            employee=employee,
        ).values_list("holiday_id", flat=True)

        return Holiday.objects.filter(
            is_active=True,
        ).filter(
            holiday_type=Holiday.HolidayType.COMPANY
        ) | Holiday.objects.filter(
            is_active=True,
            holiday_type=Holiday.HolidayType.REGIONAL,
            region__iexact=employee.region,
        ) | Holiday.objects.filter(
            is_active=True,
            holiday_type=Holiday.HolidayType.OPTIONAL,
            id__in=selected_ids,
        )

    def get_permissions(self):
        if self.request.method in ["PUT", "PATCH", "DELETE"]:
            return [IsAuthenticated(), IsAdminOrHR()]
        return [IsAuthenticated()]


class HolidayCalendarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = get_employee(request.user)

        year_value = request.query_params.get("year")
        month_value = request.query_params.get("month")

        try:
            year = int(year_value) if year_value else timezone.localdate().year
            if not 1900 <= year <= 2200:
                raise ValueError

            month = int(month_value) if month_value else None
            if month is not None and not 1 <= month <= 12:
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {"detail": "Provide a valid year and optional month (1-12)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            request.user.is_superuser
            or IsAdminOrHR().has_permission(request, self)
        ):
            queryset = Holiday.objects.filter(is_active=True)
        elif employee:
            queryset = Holiday.objects.filter(
                is_active=True,
                holiday_type=Holiday.HolidayType.COMPANY,
            ) | Holiday.objects.filter(
                is_active=True,
                holiday_type=Holiday.HolidayType.REGIONAL,
                region__iexact=employee.region,
            ) | Holiday.objects.filter(
                is_active=True,
                holiday_type=Holiday.HolidayType.OPTIONAL,
                employee_selections__employee=employee,
            )
        else:
            return Response(
                {"detail": "No active employee profile is linked to this account."},
                status=status.HTTP_404_NOT_FOUND,
            )

        queryset = queryset.filter(date__year=year)

        if month:
            queryset = queryset.filter(date__month=month)

        serializer = HolidaySerializer(
            queryset.distinct().order_by("date", "name"),
            many=True,
        )

        return Response({
            "year": year,
            "month": month,
            "count": len(serializer.data),
            "holidays": serializer.data,
        })


class OptionalHolidaySelectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = get_employee(request.user)

        if not employee:
            return Response(
                {"detail": "No active employee profile is linked to this account."},
                status=status.HTTP_404_NOT_FOUND,
            )

        holiday = get_object_or_404(
            Holiday,
            pk=pk,
            is_active=True,
            holiday_type=Holiday.HolidayType.OPTIONAL,
        )

        if holiday.date < timezone.localdate():
            return Response(
                {"detail": "Past optional holidays cannot be selected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selection, created = OptionalHolidaySelection.objects.get_or_create(
            employee=employee,
            holiday=holiday,
        )

        serializer = OptionalHolidaySelectionSerializer(selection)

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, pk):
        employee = get_employee(request.user)

        if not employee:
            return Response(
                {"detail": "No active employee profile is linked to this account."},
                status=status.HTTP_404_NOT_FOUND,
            )

        selection = get_object_or_404(
            OptionalHolidaySelection,
            employee=employee,
            holiday_id=pk,
        )

        if selection.holiday.date < timezone.localdate():
            return Response(
                {"detail": "Past optional holiday selections cannot be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selection.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
