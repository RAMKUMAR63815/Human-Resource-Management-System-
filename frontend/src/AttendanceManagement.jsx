
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  Clock,
  Download,
  LogOut,
  RefreshCw,
} from "lucide-react";

// Django backend URL exposed by Docker.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/$/, "");

// Formats a date and time for display.
function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

// Formats working hours.
function formatHours(value) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

// Converts API errors into readable messages.
function getError(data, fallback) {
  if (data?.detail) {
    return typeof data.detail === "string"
      ? data.detail
      : JSON.stringify(data.detail);
  }

  return (
    Object.entries(data || {})
      .map(([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(" ") : value}`
      )
      .join(" ") || fallback
  );
}

export default function AttendanceManagement({
  user,
  role,
  accessToken,
  onBack,
  onLogout,
}) {
  const canViewAll = role === "ADMIN" || role === "HR";

  const today = new Date();

  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Monthly attendance summary state.
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  // Blank date means all dates are included.
  const [filterDate, setFilterDate] = useState("");
  const [department, setDepartment] = useState("");

  // Filters for an employee's own attendance history.
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));

  // Prefer the latest token saved during login.
  function getCurrentToken() {
    return (
      sessionStorage.getItem("hrms_access_token") ||
      accessToken ||
      ""
    );
  }

  // Sends authenticated requests to the Django API.
  const apiRequest = useCallback(
    async (path, options = {}) => {
      const token =
        sessionStorage.getItem("hrms_access_token") || accessToken;

      if (!token) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.body
            ? { "Content-Type": "application/json" }
            : {}),
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType =
        response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            getError(data, "The request failed.")
          );
        }

        return data;
      }

      if (!response.ok) {
        const message = await response.text();

        throw new Error(
          message || `Request failed with status ${response.status}.`
        );
      }

      return response;
    },
    [accessToken]
  );

  // Loads all records for Admin/HR or the logged-in employee's records.
  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      let endpoint;

      if (canViewAll) {
        endpoint = "/attendance/all/";

        // Add the date only if the Admin selected one.
        if (filterDate) {
          params.set("date", filterDate);
        }

        if (department.trim()) {
          params.set("department", department.trim());
        }
      } else {
        endpoint = "/attendance/my/";

        if (month) {
          params.set("month", month);
        }

        if (year) {
          params.set("year", year);
        }
      }

      const query = params.toString();
      const path = `${endpoint}${query ? `?${query}` : ""}`;

      const data = await apiRequest(path);

      setRecords(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : []
      );
    } catch (err) {
      setError(err.message || "Could not load attendance records.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [
    apiRequest,
    canViewAll,
    filterDate,
    department,
    month,
    year,
  ]);

  // Loads the logged-in employee's holiday-aware monthly summary.
  const loadSummary = useCallback(async () => {
    if (canViewAll) return;

    setSummaryLoading(true);
    setSummaryError("");

    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
      });

      const data = await apiRequest(
        `/attendance/my/summary/?${params.toString()}`
      );

      setSummary(data);
    } catch (err) {
      setSummary(null);
      setSummaryError(
        err.message || "Could not load attendance summary."
      );
    } finally {
      setSummaryLoading(false);
    }
  }, [apiRequest, canViewAll, month, year]);

  // Reload attendance when the selected filters or authentication change.
  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Reload the summary when the month/year or authentication changes.
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Records an employee's check-in or check-out.
  async function handleAttendanceAction(action) {
    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest(`/attendance/${action}/`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      setSuccess(
        action === "check-in"
          ? "Check-in recorded successfully."
          : "Check-out recorded successfully."
      );

      // Refresh both the attendance records and summary.
      await Promise.all([
        loadAttendance(),
        loadSummary(),
      ]);
    } catch (err) {
      setError(err.message || "Attendance action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // Downloads the CSV using the current authentication token.
  async function downloadReport() {
    setReportLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = getCurrentToken();

      if (!token) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const params = new URLSearchParams();

      // If a date is selected, export only that date.
      // If blank, export all dates.
      if (filterDate) {
        params.set("start_date", filterDate);
        params.set("end_date", filterDate);
      }

      if (department.trim()) {
        params.set("department", department.trim());
      }

      const query = params.toString();
      const endpoint = `/attendance/report/csv/${
        query ? `?${query}` : ""
      }`;

      // Do not send Accept: text/csv; DRF may reject that media type.
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const responseText = await response.text();
        let message = responseText;

        try {
          const errorData = JSON.parse(responseText);
          message = getError(
            errorData,
            `CSV download failed with status ${response.status}.`
          );
        } catch {
          // Use the plain-text response if it is not JSON.
        }

        throw new Error(
          message || `CSV download failed with status ${response.status}.`
        );
      }

      const contentType =
        response.headers.get("content-type") || "";

      // Never save a JSON error response as a CSV file.
      if (contentType.includes("application/json")) {
        const data = await response.json();

        throw new Error(
          getError(data, "The server did not return a CSV file.")
        );
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("The downloaded CSV file is empty.");
      }

      // Start the browser download.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "attendance_report.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      // Release the temporary URL after the download starts.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setSuccess(
        filterDate
          ? `Attendance CSV downloaded for ${filterDate}.`
          : "Attendance CSV downloaded for all dates."
      );
    } catch (err) {
      setError(
        err.message || "Could not download the attendance report."
      );
    } finally {
      setReportLoading(false);
    }
  }

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "User";

  const checkedInToday = records.some(
    (record) =>
      record.date === todayString && !record.check_out
  );

  // Summary cards display values returned by the backend.
  const summaryCards = [
    {
      label: "Expected Workdays",
      value: summary?.expected_workdays_so_far,
      color: "text-blue-700",
      background: "bg-blue-50",
    },
    {
      label: "Attended Workdays",
      value: summary?.attended_workdays,
      color: "text-green-700",
      background: "bg-green-50",
    },
    {
      label: "Missing Workdays",
      value: summary?.missing_workdays,
      color: "text-amber-700",
      background: "bg-amber-50",
    },
    {
      label: "Applicable Holidays",
      value: summary?.applicable_holidays_so_far,
      color: "text-purple-700",
      background: "bg-purple-50",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back to dashboard"
              className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="rounded-xl bg-emerald-600 p-2.5 text-white">
              <CalendarCheck size={24} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Attendance Management
              </h1>
              <p className="text-xs text-slate-500">
                PeopleDesk · {role}
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={17} />
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-slate-900">
            Attendance
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Welcome, {displayName}. Record working hours and review attendance.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        {/* Check-in and check-out are employee actions, not Admin/HR actions. */}
        {!canViewAll && (
          <section className="mb-6 grid gap-5 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  <Clock size={23} />
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    Check in
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Record the start of your working day.
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleAttendanceAction("check-in")}
                disabled={actionLoading}
                className="mt-5 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {actionLoading ? "Processing..." : "Check in now"}
              </button>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <Clock size={23} />
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    Check out
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Record the end of your working day.
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleAttendanceAction("check-out")}
                disabled={actionLoading}
                className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {actionLoading ? "Processing..." : "Check out now"}
              </button>

              {checkedInToday && (
                <p className="mt-2 text-xs text-emerald-700">
                  Your attendance history shows a check-in without check-out.
                </p>
              )}
            </article>
          </section>
        )}

        {/* Monthly summary for employees. Holidays are excluded by the backend. */}
        {!canViewAll && (
          <section className="mb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Monthly Attendance Summary
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Weekdays and applicable holidays are considered.
                </p>
              </div>

              <button
                type="button"
                onClick={loadSummary}
                disabled={summaryLoading}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={summaryLoading ? "animate-spin" : ""}
                />
                Refresh summary
              </button>
            </div>

            {summaryError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                <p>{summaryError}</p>
                <button
                  type="button"
                  onClick={loadSummary}
                  className="mt-2 font-semibold underline"
                >
                  Try again
                </button>
              </div>
            )}

            {summaryLoading && !summary ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                <RefreshCw
                  size={20}
                  className="mx-auto mb-2 animate-spin"
                />
                Loading monthly summary...
              </div>
            ) : summary ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {summaryCards.map((item) => (
                    <article
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div
                        className={`mb-3 inline-flex rounded-lg p-2 ${item.background} ${item.color}`}
                      >
                        <CalendarCheck size={20} />
                      </div>

                      <p className="text-sm text-slate-500">
                        {item.label}
                      </p>

                      <p className={`mt-1 text-3xl font-bold ${item.color}`}>
                        {item.value ?? 0}
                      </p>
                    </article>
                  ))}
                </div>

                {Array.isArray(summary.holiday_dates) &&
                  summary.holiday_dates.length > 0 && (
                    <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
                      <h4 className="font-semibold text-purple-900">
                        Applicable Holiday Dates
                      </h4>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {summary.holiday_dates.map((holidayDate) => (
                          <span
                            key={holidayDate}
                            className="rounded-full bg-white px-3 py-1.5 text-sm text-purple-800"
                          >
                            {holidayDate}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {Array.isArray(summary.holiday_dates) &&
                  summary.holiday_dates.length === 0 && (
                    <p className="mt-3 text-sm text-slate-500">
                      No applicable holidays found for this period.
                    </p>
                  )}

                <p className="mt-3 text-xs text-slate-500">
                  Missing workdays are expected working days without a
                  completed check-out. This is an attendance indicator
                  and does not automatically determine Leave Without Pay.
                </p>
              </>
            ) : !summaryError ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                No summary data available.
              </div>
            ) : null}
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h3 className="font-bold text-slate-900">
                {canViewAll
                  ? "All employee attendance"
                  : "My attendance history"}
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {records.length} record(s) displayed
              </p>
            </div>

            <button
              onClick={() =>
                Promise.all([
                  loadAttendance(),
                  loadSummary(),
                ])
              }
              disabled={loading || summaryLoading}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  loading || summaryLoading ? "animate-spin" : ""
                }
              />
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 p-5">
            {canViewAll ? (
              <>
                <div>
                  <label
                    htmlFor="attendance-date"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Attendance date
                  </label>

                  <input
                    id="attendance-date"
                    type="date"
                    value={filterDate}
                    onChange={(event) =>
                      setFilterDate(event.target.value)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </div>

                <div>
                  <label
                    htmlFor="attendance-department"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Department
                  </label>

                  <input
                    id="attendance-department"
                    value={department}
                    onChange={(event) =>
                      setDepartment(event.target.value)
                    }
                    placeholder="e.g. Software development"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </div>

                <button
                  onClick={downloadReport}
                  disabled={reportLoading}
                  className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  <Download size={17} />
                  {reportLoading ? "Downloading..." : "Download CSV"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="attendance-month"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Month
                  </label>

                  <select
                    id="attendance-month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option
                        key={index + 1}
                        value={index + 1}
                      >
                        {new Date(2000, index, 1).toLocaleString(
                          "en",
                          { month: "long" }
                        )}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="attendance-year"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Year
                  </label>

                  <input
                    id="attendance-year"
                    type="number"
                    min="2000"
                    max="2100"
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2"
                  />
                </div>
              </>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-slate-500">
              <RefreshCw size={20} className="animate-spin" />
              Loading attendance...
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              No attendance records found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {canViewAll && (
                      <>
                        <th className="px-5 py-4">Employee</th>
                        <th className="px-5 py-4">Code</th>
                      </>
                    )}

                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Check in</th>
                    <th className="px-5 py-4">Check out</th>
                    <th className="px-5 py-4">Working hours</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-slate-50"
                    >
                      {canViewAll && (
                        <>
                          <td className="px-5 py-4 font-medium text-slate-900">
                            {record.employee_name || "—"}
                          </td>

                          <td className="px-5 py-4 text-slate-600">
                            {record.employee_code || "—"}
                          </td>
                        </>
                      )}

                      <td className="px-5 py-4 text-slate-700">
                        {record.date}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(record.check_in)}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDateTime(record.check_out)}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-800">
                        {formatHours(record.working_hours)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            record.check_out
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {record.check_out
                            ? "Completed"
                            : "Checked in"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
