
import { useCallback, useEffect, useState } from "react";

// Docker frontend connects to the Django backend through host port 8002.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/+$/, "");

const emptyShift = {
  name: "",
  shift_type: "GENERAL",
  start_time: "09:00",
  end_time: "18:00",
  break_minutes: 60,
  expected_hours: "8.00",
  grace_minutes: 10,
  is_active: true,
};

const emptyAssignment = {
  employee: "",
  shift: "",
  effective_start: "",
  effective_end: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

const buttonClass =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

function getList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatErrorBody(body) {
  if (!body || typeof body !== "object") {
    return typeof body === "string" ? body : "";
  }

  if (typeof body.detail === "string") return body.detail;

  return Object.entries(body)
    .map(([key, value]) => {
      const message = Array.isArray(value)
        ? value.map((item) =>
            typeof item === "string" ? item : JSON.stringify(item)
          ).join(", ")
        : typeof value === "string"
          ? value
          : JSON.stringify(value);

      return `${key}: ${message}`;
    })
    .join("; ");
}

export default function ShiftManagement({ accessToken, role }) {
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [report, setReport] = useState([]);

  const [shiftForm, setShiftForm] = useState(emptyShift);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);

  const [editingShiftId, setEditingShiftId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [reportFilters, setReportFilters] = useState({
    start_date: "",
    end_date: "",
    shift_id: "",
  });

  // Normalize role names in case the backend returns lowercase values.
  const normalizedRole = String(role || "").toUpperCase();
  const canManage = ["ADMIN", "HR"].includes(normalizedRole);

  // Centralized API handling for all shift-related requests.
  const apiRequest = useCallback(
    async (path, options = {}) => {
      if (!accessToken) {
        throw new Error("Your login session is missing. Please sign in again.");
      }

      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      const url = `${API_BASE}${normalizedPath}`;

      let response;

      try {
        response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.body
              ? { "Content-Type": "application/json" }
              : {}),
            ...options.headers,
          },
        });
      } catch {
        throw new Error(
          `Cannot connect to the Django backend at ${url}. ` +
            "Check that Docker is running and the backend is available on port 8002."
        );
      }

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        let detail = "";

        if (contentType.includes("application/json")) {
          const body = await response.json().catch(() => ({}));
          detail = formatErrorBody(body);
        } else {
          detail = await response.text().catch(() => "");
        }

        if (response.status === 401) {
          throw new Error(
            `401 Unauthorized for ${normalizedPath}. Your token may have expired; sign in again.`
          );
        }

        if (response.status === 403) {
          throw new Error(
            `403 Forbidden for ${normalizedPath}. Your account does not have permission to perform this action.`
          );
        }

        if (response.status === 404) {
          throw new Error(
            `404 Not Found: ${normalizedPath}. Check backend/config/urls.py, shifts/urls.py, and the Django API route configuration.`
          );
        }

        throw new Error(
          `${response.status} error for ${normalizedPath}: ${
            detail || response.statusText || "Request failed"
          }`
        );
      }

      if (response.status === 204) return null;

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        return response.json();
      }

      // Return non-JSON responses intact for CSV downloads.
      return response;
    },
    [accessToken]
  );

  // Load shifts and assignments for both Admin/HR and employees.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [shiftData, assignmentData] = await Promise.all([
        apiRequest("/shifts/"),
        apiRequest("/shifts/assignments/"),
      ]);

      setShifts(getList(shiftData));
      setAssignments(getList(assignmentData));

      if (canManage) {
        const employeeData = await apiRequest("/employees/");
        const employeeList = getList(employeeData);

        setEmployees(
          employeeList.filter(
            (employee) => employee.is_active !== false
          )
        );
      } else {
        setEmployees([]);
      }
    } catch (err) {
      setError(err.message || "Unable to load shift information.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, canManage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateShiftField(event) {
    const { name, value, type, checked } = event.target;

    setShiftForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function updateAssignmentField(event) {
    const { name, value } = event.target;

    setAssignmentForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateReportFilter(event) {
    const { name, value } = event.target;

    setReportFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function clearMessages() {
    setError("");
    setMessage("");
  }

  function resetShiftForm() {
    setShiftForm({ ...emptyShift });
    setEditingShiftId(null);
  }

  async function saveShift(event) {
    event.preventDefault();
    clearMessages();

    if (!canManage) {
      setError("Only Admin or HR can create or update shifts.");
      return;
    }

    const start = shiftForm.start_time;
    const end = shiftForm.end_time;
    const breakMinutes = Number(shiftForm.break_minutes);
    const expectedHours = Number(shiftForm.expected_hours);
    const graceMinutes = Number(shiftForm.grace_minutes);

    if (!shiftForm.name.trim()) {
      setError("Please enter a shift name.");
      return;
    }

    if (!start || !end) {
      setError("Please select both the start time and end time.");
      return;
    }

    if (
      !Number.isFinite(breakMinutes) ||
      breakMinutes < 0 ||
      !Number.isFinite(expectedHours) ||
      expectedHours <= 0 ||
      !Number.isFinite(graceMinutes) ||
      graceMinutes < 0
    ) {
      setError("Enter valid break minutes, expected hours, and grace minutes.");
      return;
    }

    setSavingShift(true);

    try {
      const path = editingShiftId
        ? `/shifts/${editingShiftId}/`
        : "/shifts/";

      const payload = {
        ...shiftForm,
        name: shiftForm.name.trim(),
        break_minutes: breakMinutes,
        expected_hours: expectedHours,
        grace_minutes: graceMinutes,
      };

      await apiRequest(path, {
        method: editingShiftId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      setMessage(
        editingShiftId
          ? "Shift updated successfully."
          : "Shift created successfully."
      );

      resetShiftForm();
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to save the shift.");
    } finally {
      setSavingShift(false);
    }
  }

  function editShift(shift) {
    clearMessages();
    setEditingShiftId(shift.id);

    setShiftForm({
      name: shift.name || "",
      shift_type: shift.shift_type || "GENERAL",
      start_time: shift.start_time?.slice(0, 5) || "09:00",
      end_time: shift.end_time?.slice(0, 5) || "18:00",
      break_minutes: shift.break_minutes ?? 60,
      expected_hours: String(shift.expected_hours ?? "8.00"),
      grace_minutes: shift.grace_minutes ?? 10,
      is_active: shift.is_active !== false,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAssignment(event) {
    event.preventDefault();
    clearMessages();

    if (!canManage) {
      setError("Only Admin or HR can assign shifts.");
      return;
    }

    if (!assignmentForm.employee || !assignmentForm.shift) {
      setError("Select both an employee and a shift.");
      return;
    }

    if (!assignmentForm.effective_start) {
      setError("Please select the effective start date.");
      return;
    }

    if (
      assignmentForm.effective_end &&
      assignmentForm.effective_end < assignmentForm.effective_start
    ) {
      setError("The effective end date cannot be earlier than the start date.");
      return;
    }

    setSavingAssignment(true);

    try {
      await apiRequest("/shifts/assignments/", {
        method: "POST",
        body: JSON.stringify({
          employee: Number(assignmentForm.employee),
          shift: Number(assignmentForm.shift),
          effective_start: assignmentForm.effective_start,
          effective_end: assignmentForm.effective_end || null,
        }),
      });

      setMessage("Shift assigned successfully.");
      setAssignmentForm({ ...emptyAssignment });
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to assign the shift.");
    } finally {
      setSavingAssignment(false);
    }
  }

  function buildReportQuery() {
    const query = new URLSearchParams();

    Object.entries(reportFilters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });

    return query.toString();
  }

  function validateReportDates() {
    if (
      reportFilters.start_date &&
      reportFilters.end_date &&
      reportFilters.end_date < reportFilters.start_date
    ) {
      setError("The report end date cannot be earlier than the start date.");
      return false;
    }

    return true;
  }

  async function loadReport(event) {
    event.preventDefault();
    clearMessages();

    if (!canManage) {
      setError("Only Admin or HR can view shift attendance reports.");
      return;
    }

    if (!validateReportDates()) return;

    setLoadingReport(true);

    try {
      const query = buildReportQuery();
      const path = `/shifts/reports/attendance/${
        query ? `?${query}` : ""
      }`;

      const data = await apiRequest(path);

      setReport(getList(data));
      setMessage("Shift attendance report loaded.");
    } catch (err) {
      setError(err.message || "Unable to load the report.");
      setReport([]);
    } finally {
      setLoadingReport(false);
    }
  }

  async function downloadCSV() {
    clearMessages();

    if (!canManage) {
      setError("Only Admin or HR can download shift attendance reports.");
      return;
    }

    if (!validateReportDates()) return;

    setDownloadingCSV(true);

    try {
      const query = buildReportQuery();
      const path = `/shifts/reports/attendance.csv${
        query ? `?${query}` : ""
      }`;

      const response = await apiRequest(path);
      const blob = await response.blob();

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = "shift_attendance_report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(downloadUrl);
      setMessage("CSV report downloaded.");
    } catch (err) {
      setError(err.message || "Unable to download the report.");
    } finally {
      setDownloadingCSV(false);
    }
  }

  async function deactivateShift(shift) {
    clearMessages();

    if (!canManage) {
      setError("Only Admin or HR can deactivate shifts.");
      return;
    }

    const confirmed = window.confirm(
      `Deactivate "${shift.name}"? Existing assignments will be preserved.`
    );

    if (!confirmed) return;

    try {
      await apiRequest(`/shifts/${shift.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });

      setMessage("Shift deactivated successfully.");
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to deactivate the shift.");
    }
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Shift & Work Schedule Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage schedules, employee assignments, and shift attendance.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
        >
          {message}
        </div>
      )}

      {canManage && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              {editingShiftId ? "Edit shift" : "Create a shift"}
            </h2>

            <form
              onSubmit={saveShift}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
            >
              <label className="text-sm font-medium text-slate-700">
                Shift name
                <input
                  className={inputClass}
                  name="name"
                  value={shiftForm.name}
                  onChange={updateShiftField}
                  placeholder="e.g. General Day Shift"
                  maxLength={100}
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Shift type
                <select
                  className={inputClass}
                  name="shift_type"
                  value={shiftForm.shift_type}
                  onChange={updateShiftField}
                >
                  <option value="GENERAL">General</option>
                  <option value="NIGHT">Night</option>
                  <option value="FLEXIBLE">Flexible</option>
                  <option value="REMOTE">Remote</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Start time
                <input
                  className={inputClass}
                  type="time"
                  name="start_time"
                  value={shiftForm.start_time}
                  onChange={updateShiftField}
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                End time
                <input
                  className={inputClass}
                  type="time"
                  name="end_time"
                  value={shiftForm.end_time}
                  onChange={updateShiftField}
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Break (minutes)
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="1439"
                  name="break_minutes"
                  value={shiftForm.break_minutes}
                  onChange={updateShiftField}
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Expected hours
                <input
                  className={inputClass}
                  type="number"
                  min="0.01"
                  max="24"
                  step="0.25"
                  name="expected_hours"
                  value={shiftForm.expected_hours}
                  onChange={updateShiftField}
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Late grace (minutes)
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="1440"
                  name="grace_minutes"
                  value={shiftForm.grace_minutes}
                  onChange={updateShiftField}
                  required
                />
              </label>

              {editingShiftId && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={shiftForm.is_active}
                    onChange={updateShiftField}
                  />
                  Active shift
                </label>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <button
                  className={buttonClass}
                  type="submit"
                  disabled={savingShift}
                >
                  {savingShift
                    ? "Saving..."
                    : editingShiftId
                      ? "Save changes"
                      : "Create shift"}
                </button>

                {editingShiftId && (
                  <button
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                    type="button"
                    onClick={resetShiftForm}
                    disabled={savingShift}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Assign a shift</h2>

            <form
              onSubmit={saveAssignment}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
            >
              <label className="text-sm font-medium text-slate-700">
                Employee
                <select
                  className={inputClass}
                  name="employee"
                  value={assignmentForm.employee}
                  onChange={updateAssignmentField}
                  required
                >
                  <option value="">Select employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_code || employee.id} —{" "}
                      {[
                        employee.first_name,
                        employee.last_name,
                      ].filter(Boolean).join(" ") ||
                        employee.user?.username ||
                        employee.username ||
                        "Employee"}
                    </option>
                  ))}
                </select>
                {employees.length === 0 && (
                  <span className="mt-1 block text-xs text-slate-500">
                    No active employees found. Check the employee API response.
                  </span>
                )}
              </label>

              <label className="text-sm font-medium text-slate-700">
                Shift
                <select
                  className={inputClass}
                  name="shift"
                  value={assignmentForm.shift}
                  onChange={updateAssignmentField}
                  required
                >
                  <option value="">Select shift</option>
                  {shifts
                    .filter((shift) => shift.is_active)
                    .map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} ({shift.shift_type})
                      </option>
                    ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Effective from
                <input
                  className={inputClass}
                  type="date"
                  name="effective_start"
                  value={assignmentForm.effective_start}
                  onChange={updateAssignmentField}
                  required
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Effective until (optional)
                <input
                  className={inputClass}
                  type="date"
                  name="effective_end"
                  min={assignmentForm.effective_start || undefined}
                  value={assignmentForm.effective_end}
                  onChange={updateAssignmentField}
                />
              </label>

              <div>
                <button
                  className={buttonClass}
                  type="submit"
                  disabled={
                    savingAssignment ||
                    employees.length === 0 ||
                    !shifts.some((shift) => shift.is_active)
                  }
                >
                  {savingAssignment ? "Assigning..." : "Assign shift"}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Shift definitions</h2>

        {loading ? (
          <p className="text-sm text-slate-500">Loading shifts...</p>
        ) : shifts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No shifts have been created yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Schedule</th>
                  <th className="p-3">Expected hours</th>
                  <th className="p-3">Status</th>
                  {canManage && <th className="p-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id} className="border-t">
                    <td className="p-3 font-medium">{shift.name}</td>
                    <td className="p-3">{shift.shift_type}</td>
                    <td className="p-3">
                      {shift.start_time?.slice(0, 5)} –{" "}
                      {shift.end_time?.slice(0, 5)}
                    </td>
                    <td className="p-3">{shift.expected_hours}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          shift.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {shift.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {canManage && (
                      <td className="p-3">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="text-blue-700 hover:underline"
                            onClick={() => editShift(shift)}
                          >
                            Edit
                          </button>

                          {shift.is_active && (
                            <button
                              type="button"
                              className="text-red-700 hover:underline"
                              onClick={() => deactivateShift(shift)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Assignment history</h2>

        {loading ? (
          <p className="text-sm text-slate-500">
            Loading assignment history...
          </p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-slate-500">
            No shift assignments found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {canManage && <th className="p-3">Employee</th>}
                  <th className="p-3">Shift</th>
                  <th className="p-3">Effective from</th>
                  <th className="p-3">Effective until</th>
                  {canManage && <th className="p-3">Assigned by</th>}
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id} className="border-t">
                    {canManage && (
                      <td className="p-3">
                        {assignment.employee_code || "—"} —{" "}
                        {assignment.employee_name || "Employee"}
                      </td>
                    )}
                    <td className="p-3">
                      {assignment.shift_name || "Shift"}
                    </td>
                    <td className="p-3">
                      {assignment.effective_start || "—"}
                    </td>
                    <td className="p-3">
                      {assignment.effective_end || "No end date"}
                    </td>
                    {canManage && (
                      <td className="p-3">
                        {assignment.assigned_by_username || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            Shift attendance report
          </h2>

          <form
            onSubmit={loadReport}
            className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4"
          >
            <label className="text-sm font-medium text-slate-700">
              From
              <input
                className={inputClass}
                type="date"
                name="start_date"
                value={reportFilters.start_date}
                onChange={updateReportFilter}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              To
              <input
                className={inputClass}
                type="date"
                name="end_date"
                min={reportFilters.start_date || undefined}
                value={reportFilters.end_date}
                onChange={updateReportFilter}
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Shift
              <select
                className={inputClass}
                name="shift_id"
                value={reportFilters.shift_id}
                onChange={updateReportFilter}
              >
                <option value="">All shifts</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button
                className={buttonClass}
                type="submit"
                disabled={loadingReport}
              >
                {loadingReport ? "Generating..." : "Generate"}
              </button>

              <button
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                type="button"
                onClick={downloadCSV}
                disabled={downloadingCSV}
              >
                {downloadingCSV ? "Downloading..." : "CSV"}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Shift</th>
                  <th className="p-3">Hours</th>
                  <th className="p-3">Late (min)</th>
                  <th className="p-3">Early checkout (min)</th>
                  <th className="p-3">Overtime (hours)</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row, index) => (
                  <tr
                    key={`${row.employee_id}-${row.date}-${index}`}
                    className="border-t"
                  >
                    <td className="p-3">
                      {row.employee_code || "—"} —{" "}
                      {row.employee_name || "Employee"}
                    </td>
                    <td className="p-3">{row.date || "—"}</td>
                    <td className="p-3">{row.shift_name || "Unassigned"}</td>
                    <td className="p-3">{row.working_hours ?? "—"}</td>
                    <td className="p-3">{row.late_minutes ?? "—"}</td>
                    <td className="p-3">
                      {row.early_checkout_minutes ?? "—"}
                    </td>
                    <td className="p-3">{row.overtime_hours ?? "—"}</td>
                  </tr>
                ))}

                {report.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-slate-500"
                    >
                      Generate a report to see attendance metrics.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
