
from .models import Holiday, OptionalHolidaySelection


def get_holiday_dates(employee, start_date, end_date):
    """
    Return the dates of holidays applicable to an employee.

    Rules:
    1. Company holidays apply to every employee.
    2. Regional holidays apply when the employee's region matches.
    3. Optional holidays apply only when the employee selected them.
    4. Inactive holidays are ignored.
    """

    if not employee or start_date > end_date:
        return set()

    # Fetch active holidays within the requested date range.
    holidays = Holiday.objects.filter(
        is_active=True,
        date__range=(start_date, end_date),
    )

    # Company-wide holidays apply to everyone.
    applicable_dates = set(
        holidays.filter(
            holiday_type=Holiday.HolidayType.COMPANY,
        ).values_list("date", flat=True)
    )

    # Regional holidays apply only to employees in that region.
    employee_region = (employee.region or "").strip()

    if employee_region:
        regional_dates = holidays.filter(
            holiday_type=Holiday.HolidayType.REGIONAL,
            region__iexact=employee_region,
        ).values_list("date", flat=True)

        applicable_dates.update(regional_dates)

    # Optional holidays count only when this employee selected them.
    selected_optional_dates = OptionalHolidaySelection.objects.filter(
        employee=employee,
        holiday__is_active=True,
        holiday__holiday_type=Holiday.HolidayType.OPTIONAL,
        holiday__date__range=(start_date, end_date),
    ).values_list("holiday__date", flat=True)

    applicable_dates.update(selected_optional_dates)

    return applicable_dates
