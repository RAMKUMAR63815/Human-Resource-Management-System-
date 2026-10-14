from rest_framework import viewsets
from rest_framework.decorators import action#@action use panni normal CRUD operations-ku extra-va custom API endpoint create pannalaam.
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import IsAdminOrHR
from .models import Employee
from .serializers import EmployeeSerializer#employee model data-va API response-ku suitable-aana format-la convert pannum.


class EmployeeViewSet(viewsets.ModelViewSet):#- viewsets use panni ore class-la multiple CRUD operations handle pannalaam.
    queryset = Employee.objects.select_related("user").all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdminOrHR]

    def get_queryset(self):
        queryset = super().get_queryset().order_by("employee_code")

        # Optional department filter:
        department = self.request.query_params.get("department")
        if department:
            queryset = queryset.filter(
                department__iexact=department
            )

        # Optional name/username search:
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(user__username__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(employee_code__icontains=search)
            )

        return queryset

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        employee = self.get_object()

        if not employee.is_active:
            return Response(
                {"detail": "Employee is already inactive."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee.is_active = False
        employee.save(update_fields=["is_active", "updated_at"])

        return Response({
            "detail": "Employee deactivated successfully."
        })
