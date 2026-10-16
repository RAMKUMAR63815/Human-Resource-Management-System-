
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from notifications.models import Notification, NotificationPreference

from .models import SalaryAdvance
from .advance_serializers import (
    SalaryAdvanceCreateSerializer,
    SalaryAdvanceSerializer,
    SalaryAdvanceReviewSerializer,
    SalaryAdvanceRepaymentCreateSerializer,
    SalaryAdvanceRepaymentSerializer,
)


def is_admin_or_hr(user):
    if user.is_superuser:
        return True

    profile = getattr(user, "hrms_profile", None)
    return bool(profile and profile.role in ["ADMIN", "HR"])


def create_payroll_notifications(recipients, title, message):
    """
    Create payroll notifications while respecting recipient preferences.
    Used for salary advance events as well as payroll-related notifications.
    """
    recipients_by_id = {
        recipient.pk: recipient
        for recipient in recipients
        if recipient and recipient.is_active
    }

    if not recipients_by_id:
        return 0

    recipient_ids = list(recipients_by_id.keys())

    opted_out_ids = set(
        NotificationPreference.objects.filter(
            user_id__in=recipient_ids,
            payroll_enabled=False,
        ).values_list("user_id", flat=True)
    )

    notifications = [
        Notification(
            recipient_id=recipient_id,
            notification_type=Notification.NotificationType.PAYROLL,
            title=title,
            message=message,
        )
        for recipient_id in recipient_ids
        if recipient_id not in opted_out_ids
    ]

    if notifications:
        Notification.objects.bulk_create(notifications)

    return len(notifications)


def notify_admin_hr(title, message):
    """
    Notify active superusers and users whose HRMS role is ADMIN or HR.
    """
    User = get_user_model()

    recipients = User.objects.filter(is_active=True).filter(
        Q(is_superuser=True) |
        Q(hrms_profile__role__in=["ADMIN", "HR"])
    ).distinct()

    return create_payroll_notifications(
        recipients,
        title,
        message,
    )


def notify_employee(advance, title, message):
    """
    Notify the employee who owns the salary advance request.
    """
    return create_payroll_notifications(
        [advance.employee.user],
        title,
        message,
    )


def get_advance_or_404(pk, lock=False):
    queryset = SalaryAdvance.objects.select_related(
        "employee",
        "employee__user",
        "reviewed_by",
    ).prefetch_related("repayments")

    if lock:
        queryset = queryset.select_for_update()

    try:
        return queryset.get(pk=pk)
    except SalaryAdvance.DoesNotExist:
        raise NotFound("Salary advance request was not found.")


class SalaryAdvanceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = SalaryAdvance.objects.select_related(
            "employee",
            "employee__user",
            "reviewed_by",
        ).prefetch_related("repayments")

        if not is_admin_or_hr(request.user):
            employee = getattr(request.user, "employee_record", None)
            if employee is None:
                raise PermissionDenied(
                    "Your user account is not linked to an employee record."
                )

            queryset = queryset.filter(employee=employee)

        return Response(
            SalaryAdvanceSerializer(queryset, many=True).data
        )

    @transaction.atomic
    def post(self, request):
        # Employees submit requests for themselves.
        if is_admin_or_hr(request.user):
            raise PermissionDenied(
                "Employees submit their own salary advance requests."
            )

        employee = getattr(request.user, "employee_record", None)

        if employee is None or not employee.is_active:
            raise PermissionDenied(
                "An active employee record is required to request an advance."
            )

        serializer = SalaryAdvanceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        advance = serializer.save(employee=employee)

        create_payroll_notifications(
            recipients=[],
            title="",
            message="",
        ) if False else None

        notify_admin_hr(
            title="New salary advance request",
            message=(
                f"{employee.user.get_full_name() or employee.user.username} "
                f"submitted a salary advance request for "
                f"{advance.requested_amount:.2f}."
            ),
        )

        return Response(
            SalaryAdvanceSerializer(advance).data,
            status=status.HTTP_201_CREATED,
        )


class SalaryAdvanceReviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrHR]

    @transaction.atomic
    def post(self, request, pk):
        advance = get_advance_or_404(pk, lock=True)

        if advance.status != SalaryAdvance.Status.PENDING:
            raise ValidationError(
                "Only pending requests can be reviewed."
            )

        serializer = SalaryAdvanceReviewSerializer(
            data=request.data,
            context={"advance": advance},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        advance.status = data["status"]
        advance.review_comment = data.get("review_comment", "").strip()
        advance.reviewed_by = request.user
        advance.reviewed_at = timezone.now()

        if advance.status == SalaryAdvance.Status.APPROVED:
            advance.approved_amount = data["approved_amount"]
        else:
            advance.approved_amount = None

        advance.save(
            update_fields=[
                "status",
                "approved_amount",
                "review_comment",
                "reviewed_by",
                "reviewed_at",
                "updated_at",
            ]
        )

        decision = (
            "approved"
            if advance.status == SalaryAdvance.Status.APPROVED
            else "rejected"
        )

        amount_message = ""
        if advance.approved_amount is not None:
            amount_message = (
                f" Approved amount: {advance.approved_amount:.2f}."
            )

        comment_message = (
            f" HR/Admin comment: {advance.review_comment}"
            if advance.review_comment
            else ""
        )

        notify_employee(
            advance,
            title=f"Salary advance request {decision}",
            message=(
                f"Your salary advance request for "
                f"{advance.requested_amount:.2f} was {decision}."
                f"{amount_message}{comment_message}"
            ),
        )

        return Response(SalaryAdvanceSerializer(advance).data)


class SalaryAdvanceDisburseView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrHR]

    @transaction.atomic
    def post(self, request, pk):
        advance = get_advance_or_404(pk, lock=True)

        if advance.status != SalaryAdvance.Status.APPROVED:
            raise ValidationError(
                "Only approved requests can be marked as disbursed."
            )

        if not advance.approved_amount or advance.approved_amount <= 0:
            raise ValidationError(
                "A valid approved amount is required before disbursement."
            )

        # This records the workflow only; no money is transferred.
        advance.status = SalaryAdvance.Status.DISBURSED
        advance.disbursed_at = timezone.now()
        advance.save(
            update_fields=["status", "disbursed_at", "updated_at"]
        )

        notify_employee(
            advance,
            title="Salary advance marked as disbursed",
            message=(
                f"Your salary advance of "
                f"{advance.approved_amount:.2f} has been marked as "
                f"disbursed in HRMS."
            ),
        )

        return Response(SalaryAdvanceSerializer(advance).data)


class SalaryAdvanceRepaymentsView(APIView):
    permission_classes = [IsAuthenticated]

    def check_access(self, request, advance):
        if is_admin_or_hr(request.user):
            return

        employee = getattr(request.user, "employee_record", None)
        if employee is None or employee.pk != advance.employee_id:
            raise PermissionDenied(
                "You may only view your own salary advance."
            )

    def get(self, request, pk):
        advance = get_advance_or_404(pk)
        self.check_access(request, advance)

        repayments = advance.repayments.select_related("recorded_by")

        return Response(
            SalaryAdvanceRepaymentSerializer(
                repayments,
                many=True,
            ).data
        )

    @transaction.atomic
    def post(self, request, pk):
        if not is_admin_or_hr(request.user):
            raise PermissionDenied(
                "Only Admin or HR can record repayments."
            )

        advance = get_advance_or_404(pk, lock=True)

        if advance.status != SalaryAdvance.Status.DISBURSED:
            raise ValidationError(
                "Repayments can only be recorded for disbursed advances."
            )

        serializer = SalaryAdvanceRepaymentCreateSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        payroll_record = data.get("payroll_record")

        if payroll_record:
            if payroll_record.employee_id != advance.employee_id:
                raise ValidationError({
                    "payroll_record": (
                        "The payroll record must belong to the same employee."
                    )
                })

            if payroll_record.status == "DRAFT":
                raise ValidationError({
                    "payroll_record": (
                        "A draft payroll record cannot be used for repayment."
                    )
                })

        total_repaid = advance.repayments.aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")

        outstanding = advance.approved_amount - total_repaid

        if data["amount"] > outstanding:
            raise ValidationError({
                "amount": (
                    f"Repayment exceeds the outstanding balance "
                    f"of {outstanding:.2f}."
                )
            })

        repayment = serializer.save(
            advance=advance,
            recorded_by=request.user,
        )

        new_total = total_repaid + repayment.amount

        if new_total == advance.approved_amount:
            advance.status = SalaryAdvance.Status.COMPLETED
            advance.save(update_fields=["status", "updated_at"])

        remaining = max(
            advance.approved_amount - new_total,
            Decimal("0.00"),
        )

        completion_message = (
            " Your salary advance has been fully repaid."
            if advance.status == SalaryAdvance.Status.COMPLETED
            else ""
        )

        notify_employee(
            advance,
            title="Salary advance repayment recorded",
            message=(
                f"A repayment of {repayment.amount:.2f} was recorded "
                f"for your salary advance. Total repaid: {new_total:.2f}. "
                f"Outstanding balance: {remaining:.2f}."
                f"{completion_message}"
            ),
        )

        return Response(
            {
                "repayment": SalaryAdvanceRepaymentSerializer(
                    repayment
                ).data,
                "total_repaid": f"{new_total:.2f}",
                "outstanding_amount": f"{remaining:.2f}",
                "advance_status": advance.status,
            },
            status=status.HTTP_201_CREATED,
        )
