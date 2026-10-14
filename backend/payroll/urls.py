
from django.urls import path

from .views import (
    GeneratePayrollView,
    PayrollListView,
    LockPayrollView,
    SimulateSalaryPaymentView,
    MyPayrollHistoryView,
    SalarySlipPDFView,
)

urlpatterns = [
    # Admin/HR: generate payroll for an employee.
    path("generate/", GeneratePayrollView.as_view(), name="generate-payroll"),

    # Employee: view their own payroll history.
    path("my/", MyPayrollHistoryView.as_view(), name="my-payroll-history"),

    # Admin/HR: view and filter payroll records.
    path("", PayrollListView.as_view(), name="payroll-list"),

    # Admin/HR: lock a draft payroll record.
    path("<int:pk>/lock/", LockPayrollView.as_view(), name="lock-payroll"),

    # Admin/HR: record a simulated salary payment.
    path("<int:pk>/pay/", SimulateSalaryPaymentView.as_view(), name="simulate-salary-payment"),

    # Employee: download their own finalized salary slip.
    # Admin/HR: download a finalized salary slip for any employee.
    path("<int:pk>/salary-slip/", SalarySlipPDFView.as_view(), name="salary-slip-pdf"),
]
