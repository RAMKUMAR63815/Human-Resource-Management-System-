
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction #Database-la follow panna vendiya rule-ah break pannina, database IntegrityError raise pannalaam.
from django.utils import timezone

from rest_framework import generics, status #API views create panna use pannuvom
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from employees.models import Employee
from .models import Attendance
from .serializers import AttendanceSerializer
import csv
from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsAdminOrHR
import calendar
from datetime import date, timedelta
from holidays.utils import get_holiday_dates

def get_active_employee(user):
    # Find the employee profile linked to the logged-in user.
    return Employee.objects.filter(
        user=user,
        is_active=True,
    ).first()


class CheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        employee = get_active_employee(request.user)

        if employee is None:
            return Response(
                {"detail": "No active employee profile found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        today = timezone.localdate()
        now = timezone.now()

        try:
            # The unique database constraint protects against
            # duplicate requests, including simultaneous requests.
            with transaction.atomic(): #ensures database operations within a block are treated as a single transaction. If an error occurs and the transaction rolls back, all changes made within that transaction are undone, maintaining database consistency."
                attendance = Attendance.objects.create(
                    employee=employee,
                    date=today,
                    check_in=now,
                )
        except IntegrityError:
            return Response(
                {"detail": "You have already checked in today."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            AttendanceSerializer(attendance).data,
            status=status.HTTP_201_CREATED,
        )


class CheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        employee = get_active_employee(request.user)

        if employee is None:
            return Response(
                {"detail": "No active employee profile found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        today = timezone.localdate()

        try:
            with transaction.atomic():
                attendance = Attendance.objects.select_for_update().get(#select_for_update() locks the attendance row while processing check-out.
                    employee=employee,
                    date=today,
                )

                if attendance.check_out is not None:
                    return Response(
                        {"detail": "You have already checked out."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                now = timezone.now()

                if now <= attendance.check_in:
                    return Response(
                        {"detail": "Check-out must be after check-in."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                total_seconds = (
                    now - attendance.check_in
                ).total_seconds()

                hours = Decimal(str(total_seconds)) / Decimal("3600")

                attendance.check_out = now
                attendance.working_hours = hours.quantize(#Decimal value-la decimal places-ai specify panna use pannuvom.
                    Decimal("0.01"), #2 decimal places
                    rounding=ROUND_HALF_UP,#rounding off rule
                )

                attendance.save(
                    update_fields=[
                        "check_out",
                        "working_hours",
                        "updated_at",
                    ]
                )

        except Attendance.DoesNotExist:
            return Response(
                {"detail": "Please check in before checking out."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AttendanceSerializer(attendance).data)


class MyAttendanceView(generics.ListAPIView):
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        employee = get_active_employee(self.request.user)

        if employee is None:
            return Attendance.objects.none()

        queryset = Attendance.objects.filter(employee=employee)

        # Optional filters: ?month=10&year=2026
        month = self.request.query_params.get("month")
        year = self.request.query_params.get("year")

        if month:
            try:
                month = int(month)
                if not 1 <= month <= 12:
                    raise ValueError
                queryset = queryset.filter(date__month=month) #__month enbadhu date field-oda month portion-ai filter pannum.
            except ValueError:
                return Attendance.objects.none()

        if year:
            try:
                year = int(year)
                if not 2000 <= year <= 2100:
                    raise ValueError
                queryset = queryset.filter(date__year=year)
            except ValueError:
                return Attendance.objects.none()

        return queryset.select_related("employee", "employee__user")#attance employee relation
        #employee user relation


class AllAttendanceView(generics.ListAPIView):
    serializer_class = AttendanceSerializer
    permission_classes = [IsAdminOrHR]

    def get_queryset(self):
        queryset = Attendance.objects.select_related(
            "employee",
            "employee__user",
        )

        department = self.request.query_params.get("department")
        date_value = self.request.query_params.get("date")

        if department:
            queryset = queryset.filter(
                employee__department__iexact=department
            )

        if date_value:
            queryset = queryset.filter(date=date_value)

        return queryset

class AttendanceCSVReportView(APIView):
    permission_classes = [IsAdminOrHR]

    def get(self, request):
        # Read optional filters from the query string.
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        department = request.query_params.get("department")

        # Validate dates before querying the database.
        if start_date and not parse_date(start_date):
            return Response(
                {"detail": "start_date must use YYYY-MM-DD format."},
                status=400,
            )

        if end_date and not parse_date(end_date):
            return Response(
                {"detail": "end_date must use YYYY-MM-DD format."},
                status=400,
            )

        if start_date and end_date and start_date > end_date:
            return Response(
                {"detail": "start_date must not be after end_date."},
                status=400,
            )

        queryset = Attendance.objects.select_related(
            "employee",
            "employee__user",
        ).order_by("date", "employee__employee_code")

        if start_date:
            queryset = queryset.filter(date__gte=start_date)

        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        if department:
            queryset = queryset.filter(
                employee__department__iexact=department
            )

        # Build a CSV response without creating a temporary file.
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            'attachment; filename="attendance_report.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([
            "Employee Code",
            "Employee Name",
            "Department",
            "Date",
            "Check In",
            "Check Out",
            "Working Hours",
        ])

        for item in queryset.iterator():
            writer.writerow([
                item.employee.employee_code,
                item.employee.user.get_full_name()
                or item.employee.user.username,
                item.employee.department,
                item.date,
                item.check_in,
                item.check_out or "",
                item.working_hours,
            ])

        return response

class MyAttendanceSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = get_active_employee(request.user)

        if employee is None:
            return Response(
                {"detail": "No active employee profile found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.localdate()

        try:
            year = int(request.query_params.get("year", today.year))
            month = int(request.query_params.get("month", today.month))

            if not 2000 <= year <= 2100:
                raise ValueError

            if not 1 <= month <= 12:
                raise ValueError

        except (TypeError, ValueError):
            return Response(
                {"detail": "Provide a valid year and month (1-12)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date = date(year, month, 1)
        end_date = date(
            year,
            month,
            calendar.monthrange(year, month)[1],
        )

        # Do not count future dates as expected working days.
        effective_end = min(end_date, today)

        if effective_end < start_date:
            effective_end = start_date - timedelta(days=1)

        if effective_end >= start_date:
            weekdays = {
                day
                for day in (
                    start_date + timedelta(days=offset)
                    for offset in range((effective_end - start_date).days + 1)
                )
                if day.weekday() < 5
            }

            holiday_dates = get_holiday_dates(
                employee,
                start_date,
                effective_end,
            )

            # Holidays are removed from the expected working days.
            working_dates = weekdays - holiday_dates

            attendance_dates = set(
                Attendance.objects.filter(
                    employee=employee,
                    date__range=(start_date, effective_end),
                    check_out__isnull=False,
                ).values_list("date", flat=True)
            )

            attended_workdays = attendance_dates & working_dates
            missing_workdays = working_dates - attendance_dates

        else:
            holiday_dates = set()
            working_dates = set()
            attended_workdays = set()
            missing_workdays = set()

        return Response({
            "year": year,
            "month": month,
            "as_of_date": today.isoformat(),
            "total_weekdays_so_far": len(
                weekdays if effective_end >= start_date else set()
            ),
            "applicable_holidays_so_far": len(holiday_dates),
            "expected_workdays_so_far": len(working_dates),
            "attended_workdays": len(attended_workdays),
            "missing_workdays": len(missing_workdays),
            "holiday_dates": sorted(
                day.isoformat() for day in holiday_dates
            ),
        })