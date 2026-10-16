
from django.urls import path

from .views import (
    GeneratePayrollView,
    PayrollListView,
    LockPayrollView,
    SimulateSalaryPaymentView,
    MyPayrollHistoryView,
    SalarySlipPDFView,
    SalaryComponentListCreateView,
    SalaryComponentDetailView,
)

from .advance_views import (
    SalaryAdvanceListCreateView,
    SalaryAdvanceReviewView,
    SalaryAdvanceDisburseView,
    SalaryAdvanceRepaymentsView,
)

urlpatterns = [
    path(
        "generate/",
        GeneratePayrollView.as_view(),
        name="generate-payroll",
    ),
    path(
        "my/",
        MyPayrollHistoryView.as_view(),
        name="my-payroll-history",
    ),
    path(
        "salary-components/",
        SalaryComponentListCreateView.as_view(),
        name="salary-component-list-create",
    ),
    path(
        "salary-components/<int:pk>/",
        SalaryComponentDetailView.as_view(),
        name="salary-component-detail",
    ),
    path(
        "",
        PayrollListView.as_view(),
        name="payroll-list",
    ),
    path(
        "<int:pk>/lock/",
        LockPayrollView.as_view(),
        name="lock-payroll",
    ),
    path(
        "<int:pk>/pay/",
        SimulateSalaryPaymentView.as_view(),
        name="simulate-salary-payment",
    ),
    path(
        "<int:pk>/salary-slip/",
        SalarySlipPDFView.as_view(),
        name="salary-slip-pdf",
    ),
    path(
        "advances/",
        SalaryAdvanceListCreateView.as_view(),
        name="salary-advance-list-create",
    ),
    path(
        "advances/<int:pk>/review/",
        SalaryAdvanceReviewView.as_view(),
        name="salary-advance-review",
    ),
    path(
        "advances/<int:pk>/disburse/",
        SalaryAdvanceDisburseView.as_view(),
        name="salary-advance-disburse",
    ),
    path(
        "advances/<int:pk>/repayments/",
        SalaryAdvanceRepaymentsView.as_view(),
        name="salary-advance-repayments",
    ),
]
