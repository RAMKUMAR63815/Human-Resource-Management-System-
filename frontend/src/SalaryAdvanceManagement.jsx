
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  Receipt,
} from "lucide-react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/+$/, "");

async function apiRequest(path, accessToken, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = Object.entries(data)
      .map(([field, value]) => {
        const detail = Array.isArray(value)
          ? value.join(" ")
          : typeof value === "string"
            ? value
            : JSON.stringify(value);

        return `${field}: ${detail}`;
      })
      .join(" ");

    throw new Error(
      data.detail || message || `Request failed (${response.status})`,
    );
  }

  return data;
}

function getRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function money(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function StatusBadge({ status }) {
  const styles = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-blue-100 text-blue-800",
    REJECTED: "bg-red-100 text-red-800",
    DISBURSED: "bg-green-100 text-green-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
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

export default function SalaryAdvanceManagement({
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

  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [requestedAmount, setRequestedAmount] = useState("");
  const [reason, setReason] = useState("");
  const [installments, setInstallments] = useState("3");

  const loadAdvances = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/payroll/advances/", accessToken);
      setAdvances(getRows(data));
    } catch (err) {
      setError(err.message || "Unable to load salary advances.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadAdvances();
  }, [loadAdvances]);

  async function submitRequest(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const amount = Number(requestedAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    if (!reason.trim()) {
      setError("Please provide a reason for the advance.");
      return;
    }

    const numberOfInstallments = Number(installments);

    if (
      !Number.isInteger(numberOfInstallments) ||
      numberOfInstallments < 1 ||
      numberOfInstallments > 36
    ) {
      setError("Choose between 1 and 36 repayment installments.");
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest("/payroll/advances/", accessToken, {
        method: "POST",
        body: JSON.stringify({
          requested_amount: amount.toFixed(2),
          reason: reason.trim(),
          repayment_installments: numberOfInstallments,
        }),
      });

      setRequestedAmount("");
      setReason("");
      setInstallments("3");
      setSuccess("Salary advance request submitted successfully.");
      await loadAdvances();
    } catch (err) {
      setError(err.message || "Unable to submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewAdvance(advance, decision) {
    let approvedAmount;
    let reviewComment = "";

    if (decision === "APPROVED") {
      const entered = window.prompt(
        `Enter the approved amount (requested: ${money(
          advance.requested_amount,
        )}):`,
        String(advance.requested_amount),
      );

      if (entered === null) return;

      approvedAmount = entered.trim();

      if (
        !approvedAmount ||
        !Number.isFinite(Number(approvedAmount)) ||
        Number(approvedAmount) <= 0 ||
        Number(approvedAmount) > Number(advance.requested_amount)
      ) {
        setError("Enter a valid amount not exceeding the requested amount.");
        return;
      }
    }

    const comment = window.prompt(
      decision === "APPROVED"
        ? "Optional approval comment:"
        : "Reason for rejection:",
      "",
    );

    if (comment === null) return;
    reviewComment = comment.trim();

    setWorkingId(advance.id);
    setError("");
    setSuccess("");

    try {
      const body = {
        status: decision,
        review_comment: reviewComment,
      };

      if (decision === "APPROVED") {
        body.approved_amount = approvedAmount;
      }

      await apiRequest(
        `/payroll/advances/${advance.id}/review/`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );

      setSuccess(
        decision === "APPROVED"
          ? "Salary advance approved."
          : "Salary advance rejected.",
      );

      await loadAdvances();
    } catch (err) {
      setError(err.message || "Unable to review the request.");
    } finally {
      setWorkingId(null);
    }
  }

  async function disburseAdvance(advance) {
    const confirmed = window.confirm(
      `Record simulated disbursement of ${money(
        advance.approved_amount,
      )} for this request? This does not transfer real money.`,
    );

    if (!confirmed) return;

    setWorkingId(advance.id);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `/payroll/advances/${advance.id}/disburse/`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      setSuccess("Simulated disbursement recorded. No real money was transferred.");
      await loadAdvances();
    } catch (err) {
      setError(err.message || "Unable to record disbursement.");
    } finally {
      setWorkingId(null);
    }
  }

  async function recordRepayment(advance) {
    const outstanding = Number(advance.outstanding_amount);

    if (!Number.isFinite(outstanding) || outstanding <= 0) {
      setError("There is no outstanding balance to repay.");
      return;
    }

    const entered = window.prompt(
      `Outstanding balance: ${money(outstanding)}\nEnter repayment amount:`,
      outstanding.toFixed(2),
    );

    if (entered === null) return;

    const amount = Number(entered);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > outstanding
    ) {
      setError("Repayment must be greater than zero and no more than the outstanding balance.");
      return;
    }

    const repaymentDate = window.prompt(
      "Repayment date (YYYY-MM-DD):",
      new Date().toLocaleDateString("en-CA"),
    );

    if (repaymentDate === null) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(repaymentDate)) {
      setError("Enter the repayment date in YYYY-MM-DD format.");
      return;
    }

    setWorkingId(advance.id);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `/payroll/advances/${advance.id}/repayments/`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            amount: amount.toFixed(2),
            repayment_date: repaymentDate,
          }),
        },
      );

      setSuccess("Repayment recorded successfully.");
      await loadAdvances();
    } catch (err) {
      setError(err.message || "Unable to record repayment.");
    } finally {
      setWorkingId(null);
    }
  }

  const summary = {
    total: advances.length,
    pending: advances.filter((item) => item.status === "PENDING").length,
    approved: advances.filter((item) => item.status === "APPROVED").length,
    outstanding: advances.reduce(
      (total, item) => total + Math.max(Number(item.outstanding_amount) || 0, 0),
      0,
    ),
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to dashboard"
              className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Salary Advance
              </h1>
              <p className="text-sm text-slate-500">
                {isAdminHR
                  ? "Review requests and manage repayments"
                  : "Request an advance and track its progress"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadAdvances}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {success}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Requests shown", value: summary.total, icon: Receipt },
            { label: "Pending review", value: summary.pending, icon: Clock },
            { label: "Approved", value: summary.approved, icon: CheckCircle },
            { label: "Outstanding total", value: money(summary.outstanding), icon: Wallet },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <Icon size={20} className="text-blue-700" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900">{item.value}</p>
              </div>
            );
          })}
        </section>

        {!isAdminHR && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <Wallet size={23} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Request a salary advance
                </h2>
                <p className="text-sm text-slate-500">
                  Your request will be reviewed by HR/Admin.
                </p>
              </div>
            </div>

            <form onSubmit={submitRequest} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="advance-amount" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Requested amount (INR)
                </label>
                <input
                  id="advance-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="9999999999.99"
                  value={requestedAmount}
                  onChange={(event) => setRequestedAmount(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                  placeholder="e.g. 10000"
                />
              </div>

              <div>
                <label htmlFor="advance-installments" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Repayment installments
                </label>
                <select
                  id="advance-installments"
                  value={installments}
                  onChange={(event) => setInstallments(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                >
                  {Array.from({ length: 36 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value} {value === 1 ? "installment" : "installments"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="advance-reason" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Reason for request
                </label>
                <textarea
                  id="advance-reason"
                  rows={3}
                  maxLength={3000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                  placeholder="Explain why you need the salary advance"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit advance request"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900">
              {isAdminHR ? "Employee advance requests" : "My advance requests"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Amounts are in Indian rupees.
            </p>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-500">Loading salary advances...</p>
          ) : advances.length === 0 ? (
            <p className="p-8 text-center text-slate-500">
              No salary advance requests found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {isAdminHR && <th className="px-4 py-3">Employee</th>}
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3">Approved</th>
                    <th className="px-4 py-3">Installments</th>
                    <th className="px-4 py-3">Repaid</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reason / review</th>
                    <th className="px-4 py-3">Repayment history</th>
                    {isAdminHR && <th className="px-4 py-3">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {advances.map((advance) => (
                    <tr key={advance.id} className="align-top hover:bg-slate-50">
                      {isAdminHR && (
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-semibold text-slate-900">{advance.employee_name || "Employee"}</p>
                          <p className="text-xs text-slate-500">{advance.employee_code || ""}</p>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-4">{money(advance.requested_amount)}</td>
                      <td className="whitespace-nowrap px-4 py-4">{money(advance.approved_amount)}</td>
                      <td className="px-4 py-4">{advance.repayment_installments}</td>
                      <td className="whitespace-nowrap px-4 py-4">{money(advance.total_repaid)}</td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold">{money(advance.outstanding_amount)}</td>
                      <td className="px-4 py-4"><StatusBadge status={advance.status} /></td>
                      <td className="min-w-48 px-4 py-4">
                        <p className="max-w-xs whitespace-pre-wrap text-slate-800">{advance.reason}</p>
                        {advance.review_comment && (
                          <p className="mt-2 max-w-xs whitespace-pre-wrap text-xs text-slate-500">
                            Review: {advance.review_comment}
                          </p>
                        )}
                      </td>
                      <td className="min-w-48 px-4 py-4">
                        {!advance.repayments?.length ? (
                          <span className="text-slate-400">No repayments</span>
                        ) : (
                          <ul className="space-y-2">
                            {advance.repayments.map((repayment) => (
                              <li key={repayment.id} className="border-b border-slate-100 pb-2 last:border-0">
                                <p className="font-semibold">{money(repayment.amount)}</p>
                                <p className="text-xs text-slate-500">{repayment.repayment_date}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {isAdminHR && (
                        <td className="min-w-56 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {advance.status === "PENDING" && (
                              <>
                                <button
                                  type="button"
                                  disabled={workingId === advance.id}
                                  onClick={() => reviewAdvance(advance, "APPROVED")}
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                                >
                                  <CheckCircle size={14} /> Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={workingId === advance.id}
                                  onClick={() => reviewAdvance(advance, "REJECTED")}
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                                >
                                  <XCircle size={14} /> Reject
                                </button>
                              </>
                            )}

                            {advance.status === "APPROVED" && (
                              <button
                                type="button"
                                disabled={workingId === advance.id}
                                onClick={() => disburseAdvance(advance)}
                                className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                              >
                                Record disbursement
                              </button>
                            )}

                            {["DISBURSED", "COMPLETED"].includes(advance.status) &&
                              Number(advance.outstanding_amount) > 0 && (
                                <button
                                  type="button"
                                  disabled={workingId === advance.id}
                                  onClick={() => recordRepayment(advance)}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Record repayment
                                </button>
                              )}

                            {workingId === advance.id && (
                              <span className="w-full text-xs text-slate-500">Processing...</span>
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

        <p className="text-xs leading-5 text-slate-500">
          Disbursement in this project is simulated. It does not transfer money
          or automatically deduct repayments from payroll. Repayments entered
          here are records that HR/Admin must verify against actual payments.
        </p>
      </div>
    </main>
  );
}
