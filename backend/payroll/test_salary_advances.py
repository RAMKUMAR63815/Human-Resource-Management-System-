from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import UserProfile
from employees.models import Employee
from payroll.models import SalaryAdvance


User = get_user_model()


class SalaryAdvanceWorkflowTests(APITestCase):
    def setUp(self):
        self.employee_user = User.objects.create_user(
            username="advance_employee",
            password="TestPassword123!",
            first_name="Test",
            last_name="Employee",
        )
        UserProfile.objects.create(
            user=self.employee_user,
            role="EMPLOYEE",
        )

        self.employee = Employee.objects.create(
            user=self.employee_user,
            employee_code="ADV-EMP-001",
            department="Engineering",
            designation="Developer",
            joining_date=date(2024, 1, 1),
            salary=Decimal("50000.00"),
        )

        self.hr_user = User.objects.create_user(
            username="advance_hr",
            password="TestPassword123!",
        )
        UserProfile.objects.create(
            user=self.hr_user,
            role="HR",
        )

        self.list_url = reverse("salary-advance-list-create")

    def test_employee_can_request_advance(self):
        self.client.force_authenticate(user=self.employee_user)

        response = self.client.post(
            self.list_url,
            {
                "requested_amount": "10000.00",
                "reason": "Emergency expense",
                "repayment_installments": 5,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.data["status"],
            SalaryAdvance.Status.PENDING,
        )
        self.assertEqual(SalaryAdvance.objects.count(), 1)

    def test_employee_cannot_request_negative_amount(self):
        self.client.force_authenticate(user=self.employee_user)

        response = self.client.post(
            self.list_url,
            {
                "requested_amount": "-100.00",
                "reason": "Invalid request",
                "repayment_installments": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(SalaryAdvance.objects.count(), 0)

    def test_employee_cannot_review_own_request(self):
        advance = SalaryAdvance.objects.create(
            employee=self.employee,
            requested_amount=Decimal("10000.00"),
            reason="Emergency",
            repayment_installments=5,
        )
        self.client.force_authenticate(user=self.employee_user)

        response = self.client.post(
            reverse(
                "salary-advance-review",
                kwargs={"pk": advance.pk},
            ),
            {
                "status": "APPROVED",
                "approved_amount": "10000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_hr_can_approve_disburse_and_record_repayment(self):
        advance = SalaryAdvance.objects.create(
            employee=self.employee,
            requested_amount=Decimal("10000.00"),
            reason="Emergency",
            repayment_installments=5,
        )
        self.client.force_authenticate(user=self.hr_user)

        review_response = self.client.post(
            reverse(
                "salary-advance-review",
                kwargs={"pk": advance.pk},
            ),
            {
                "status": "APPROVED",
                "approved_amount": "10000.00",
                "review_comment": "Approved",
            },
            format="json",
        )
        self.assertEqual(review_response.status_code, 200)
        self.assertEqual(
            review_response.data["status"],
            SalaryAdvance.Status.APPROVED,
        )

        disburse_response = self.client.post(
            reverse(
                "salary-advance-disburse",
                kwargs={"pk": advance.pk},
            ),
            {},
            format="json",
        )
        self.assertEqual(disburse_response.status_code, 200)
        self.assertEqual(
            disburse_response.data["status"],
            SalaryAdvance.Status.DISBURSED,
        )

        repayment_url = reverse(
            "salary-advance-repayments",
            kwargs={"pk": advance.pk},
        )
        repayment_response = self.client.post(
            repayment_url,
            {
                "amount": "4000.00",
                "repayment_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(repayment_response.status_code, 201)
        self.assertEqual(
            repayment_response.data["outstanding_amount"],
            "6000.00",
        )

        overpayment_response = self.client.post(
            repayment_url,
            {
                "amount": "7000.00",
                "repayment_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(overpayment_response.status_code, 400)

        final_response = self.client.post(
            repayment_url,
            {
                "amount": "6000.00",
                "repayment_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(final_response.status_code, 201)
        self.assertEqual(
            final_response.data["outstanding_amount"],
            "0.00",
        )
        self.assertEqual(
            final_response.data["advance_status"],
            SalaryAdvance.Status.COMPLETED,
        )

    def test_employee_cannot_view_another_employees_advance(self):
        advance = SalaryAdvance.objects.create(
            employee=self.employee,
            requested_amount=Decimal("5000.00"),
            reason="Emergency",
            repayment_installments=2,
        )

        other_user = User.objects.create_user(
            username="another_employee",
            password="TestPassword123!",
        )
        UserProfile.objects.create(user=other_user, role="EMPLOYEE")
        Employee.objects.create(
            user=other_user,
            employee_code="ADV-EMP-002",
            department="Support",
            designation="Analyst",
            joining_date=date(2024, 2, 1),
            salary=Decimal("30000.00"),
        )

        self.client.force_authenticate(user=other_user)

        response = self.client.get(
            reverse(
                "salary-advance-repayments",
                kwargs={"pk": advance.pk},
            )
        )

        self.assertEqual(response.status_code, 403)