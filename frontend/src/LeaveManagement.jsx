// C:\HRMS-project\frontend\src\LeaveManagement.jsx

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  X,
  RefreshCw,
  Download,
  Send,
} from "lucide-react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/$/, "");

const EMPTY_FORM = {
  leave_type: "CASUAL",
  start_date: "",
  end_date: "",
  reason: "",
};

function getErrorMessage(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;

  if (data && typeof data === "object") {
    const messages = Object.entries(data).map(([field, value]) => {
      const message = Array.isArray(value)
        ? value.join(" ")
        : typeof value === "string"
          ? value
          : JSON.stringify(value);

      return `${field}: ${message}`;
    });

    if (messages.length) return messages.join(" ");
  }

  return fallback;
}

async function apiRequest(path, accessToken, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      getErrorMessage(data, `Request failed (${response.status})`),
    );
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response;
}

function getRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN");
}

function StatusBadge({ status }) {
  const styles = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
        styles[status] || "bg-slate-100 text-slate-700"
      }`}
    >
      {status || "UNKNOWN"}
    </span>
  );
}

export default function LeaveManagement({
  user,
  role,
  accessToken,
  onBack,
  onLogout,
}) {
  const currentRole = (
    role ||
    user?.role ||
    user?.profile?.role ||
    (user?.is_superuser ? "ADMIN" : "EMPLOYEE")
  )
    .toString()
    .toUpperCase();

  const isAdminHR = ["ADMIN", "HR", "SUPERUSER"].includes(currentRole);

  const [leaves, setLeaves] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [reviewComments, setReviewComments] = useState({});

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const path = isAdminHR
        ? "/leaves/all/"
        : "/leaves/my/";

      const data = await apiRequest(path, accessToken);
      setLeaves(getRows(data));
    } catch (err) {
      setError(err.message || "Unable to load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdminHR]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function submitLeave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await apiRequest("/leaves/my/", accessToken, {
        method: "POST",
        body: JSON.stringify(form),
      });

      setForm(EMPTY_FORM);
      setSuccess("Leave request submitted successfully.");
      await loadLeaves();
    } catch (err) {
      setError(err.message || "Unable to submit leave request.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewLeave(leaveId, decision) {
    const message =
      decision === "APPROVED"
        ? "Approve this leave request?"
        : "Reject this leave request?";

    if (!window.confirm(message)) return;

    setReviewingId(leaveId);
    setError("");
    setSuccess("");

    try {
      await apiRequest(`/leaves/${leaveId}/review/`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          decision,
          comment: reviewComments[leaveId] || "",
        }),
      });

      setSuccess(`Leave request ${decision.toLowerCase()} successfully.`);
      await loadLeaves();
    } catch (err) {
      setError(err.message || "Unable to review leave request.");
    } finally {
      setReviewingId(null);
    }
  }

  async function downloadReport() {
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE}/leaves/report/csv/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          getErrorMessage(data, `Report download failed (${response.status})`),
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "leave_report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setSuccess("Leave report downloaded.");
    } catch (err) {
      setError(err.message || "Unable to download the leave report.");
    }
  }

  const visibleLeaves = leaves.filter(
    (leave) =>
      statusFilter === "ALL" || leave.status === statusFilter,
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Leave Management
              </h1>
              <p className="text-sm text-slate-500">
                Apply for leave and track requests
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {success}
          </div>
        )}

        {!isAdminHR && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <CalendarDays size={23} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Apply for leave
                </h2>
                <p className="text-sm text-slate-500">
                  Submit your dates and reason for review.
                </p>
              </div>
            </div>

            <form onSubmit={submitLeave} className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="leave_type"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Leave type
                </label>
                <select
                  id="leave_type"
                  name="leave_type"
                  value={form.leave_type}
                  onChange={updateForm}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                >
                  <option value="CASUAL">Casual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="EARNED">Earned Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="start_date"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Start date
                </label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  min={new Date().toLocaleDateString("en-CA")}
                  value={form.start_date}
                  onChange={updateForm}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div>
                <label
                  htmlFor="end_date"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  End date
                </label>
                <input
                  id="end_date"
                  name="end_date"
                  type="date"
                  min={form.start_date || new Date().toLocaleDateString("en-CA")}
                  value={form.end_date}
                  onChange={updateForm}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div>
                <label
                  htmlFor="reason"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Reason
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  value={form.reason}
                  onChange={updateForm}
                  required
                  rows={3}
                  maxLength={2000}
                  placeholder="Enter the reason for your leave"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  <Send size={17} />
                  {saving ? "Submitting..." : "Submit leave request"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isAdminHR ? "All leave requests" : "My leave requests"}
              </h2>
              <p className="text-sm text-slate-500">
                {visibleLeaves.length} request(s) shown
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Filter leave requests by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {isAdminHR && (
                <button
                  type="button"
                  onClick={downloadReport}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  <Download size={16} />
                  CSV report
                </button>
              )}

              <button
                type="button"
                onClick={loadLeaves}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-500">
              Loading leave requests...
            </p>
          ) : visibleLeaves.length === 0 ? (
            <p className="p-8 text-center text-slate-500">
              No leave requests found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {isAdminHR && (
                      <th className="px-4 py-3">Employee</th>
                    )}
                    <th className="px-4 py-3">Leave type</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Review comment</th>
                    {isAdminHR && (
                      <th className="px-4 py-3">Actions</th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {visibleLeaves.map((leave) => (
                    <tr key={leave.id} className="align-top hover:bg-slate-50">
                      {isAdminHR && (
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {leave.employee_name || "Employee"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {leave.employee_code || ""}
                          </p>
                        </td>
                      )}

                      <td className="px-4 py-4 font-medium text-slate-800">
                        {leave.leave_type}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {formatDate(leave.start_date)}
                        <span className="mx-1">–</span>
                        {formatDate(leave.end_date)}
                      </td>

                      <td className="max-w-xs whitespace-pre-wrap px-4 py-4 text-slate-600">
                        {leave.reason}
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge status={leave.status} />
                      </td>

                      <td className="max-w-xs whitespace-pre-wrap px-4 py-4 text-slate-600">
                        {leave.review_comment || "—"}
                      </td>

                      {isAdminHR && (
                        <td className="min-w-56 px-4 py-4">
                          {leave.status === "PENDING" ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={reviewComments[leave.id] || ""}
                                onChange={(event) =>
                                  setReviewComments((previous) => ({
                                    ...previous,
                                    [leave.id]: event.target.value,
                                  }))
                                }
                                placeholder="Optional review comment"
                                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                              />

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={reviewingId === leave.id}
                                  onClick={() =>
                                    reviewLeave(leave.id, "APPROVED")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                                >
                                  <Check size={14} />
                                  Approve
                                </button>

                                <button
                                  type="button"
                                  disabled={reviewingId === leave.id}
                                  onClick={() =>
                                    reviewLeave(leave.id, "REJECTED")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                                >
                                  <X size={14} />
                                  Reject
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">Reviewed</span>
                          )}
                        </td>
                      )}
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