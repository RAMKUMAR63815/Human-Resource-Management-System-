
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Wallet,
  LockKeyhole,
  CircleDollarSign,
  FileText,
  Search,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/$/, "");

function getErrorMessage(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;

  if (data && typeof data === "object") {
    const messages = Object.entries(data).map(([field, value]) => {
      const message = Array.isArray(value)
        ? value.map(String).join(" ")
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
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

function money(value) {
  const amount = Number(value ?? 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getMonthName(month) {
  const value = Number(month);
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    return "Unknown month";
  }

  return new Date(2000, value - 1, 1).toLocaleString("en-IN", {
    month: "long",
  });
}

function PayrollStatus({ status }) {
  const styles = {
    DRAFT: "bg-amber-100 text-amber-800",
    LOCKED: "bg-blue-100 text-blue-800",
    PAID: "bg-green-100 text-green-800",
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

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon size={20} className="text-blue-700" />
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function PayrollManagement({
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
    user?.hrms_profile?.role ||
    (user?.is_superuser ? "ADMIN" : "EMPLOYEE")
  )
    .toString()
    .toUpperCase();

  const isAdminHR = ["ADMIN", "HR", "SUPERUSER"].includes(currentRole);

  const today = new Date();
  const previousMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
  );

  const [year, setYear] = useState(String(previousMonth.getFullYear()));
  const [month, setMonth] = useState(String(previousMonth.getMonth() + 1));
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [periodFilter, setPeriodFilter] = useState("ALL");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const path = isAdminHR ? "/payroll/" : "/payroll/my/";
      const data = await apiRequest(path, accessToken);
      setRecords(getRows(data));
    } catch (err) {
      setError(err.message || "Unable to load payroll records.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdminHR]);

  const loadEmployees = useCallback(async () => {
    if (!isAdminHR) return;

    try {
      const data = await apiRequest("/employees/", accessToken);
      const activeEmployees = getRows(data).filter(
        (employee) => employee.is_active !== false,
      );

      setEmployees(activeEmployees);

      setEmployeeId((current) => {
        if (
          current &&
          activeEmployees.some(
            (employee) => String(employee.id) === String(current),
          )
        ) {
          return current;
        }

        return activeEmployees.length
          ? String(activeEmployees[0].id)
          : "";
      });
    } catch (err) {
      setError(
        `Could not load employees: ${err.message || "Request failed"}`,
      );
    }
  }, [accessToken, isAdminHR]);

  useEffect(() => {
    loadRecords();
    loadEmployees();
  }, [loadRecords, loadEmployees]);

  async function refreshAll() {
    setSuccess("");
    await Promise.all([loadRecords(), loadEmployees()]);
  }

  async function generatePayroll(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!accessToken) {
      setError("Your session is missing. Please log in again.");
      return;
    }

    if (!employeeId) {
      setError("Select an employee before generating payroll.");
      return;
    }

    const selectedYear = Number(year);
    const selectedMonth = Number(month);

    if (
      !Number.isInteger(selectedYear) ||
      selectedYear < 1 ||
      !Number.isInteger(selectedMonth) ||
      selectedMonth < 1 ||
      selectedMonth > 12
    ) {
      setError("Enter a valid payroll year and month.");
      return;
    }

    if (
      selectedYear > today.getFullYear() ||
      (selectedYear === today.getFullYear() &&
        selectedMonth >= today.getMonth() + 1)
    ) {
      setError("Select a completed month for payroll generation.");
      return;
    }

    setGenerating(true);

    try {
      await apiRequest("/payroll/generate/", accessToken, {
        method: "POST",
        body: JSON.stringify({
          employee_id: Number(employeeId),
          year: selectedYear,
          month: selectedMonth,
        }),
      });

      setSuccess(
        `Payroll generated or recalculated for ${getMonthName(selectedMonth)} ${selectedYear}.`,
      );

      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to generate payroll.");
    } finally {
      setGenerating(false);
    }
  }

  async function changePayrollStatus(record, action) {
    const actions = {
      lock: {
        prompt:
          "Lock this draft payroll? A locked record cannot be recalculated.",
        path: `/payroll/${record.id}/lock/`,
        successMessage: "Payroll locked successfully.",
      },
      pay: {
        prompt:
          "Record a simulated salary payment? This will not transfer real money.",
        path: `/payroll/${record.id}/pay/`,
        successMessage:
          "Simulated salary payment recorded. No real bank transfer occurred.",
      },
    };

    const details = actions[action];
    if (!details || workingId !== null) return;

    if (!window.confirm(details.prompt)) return;

    setWorkingId(record.id);
    setError("");
    setSuccess("");

    try {
      await apiRequest(details.path, accessToken, {
        method: "POST",
        body: JSON.stringify({}),
      });

      setSuccess(details.successMessage);
      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to update payroll status.");
    } finally {
      setWorkingId(null);
    }
  }

  async function downloadSalarySlip(record) {
    setError("");
    setSuccess("");
    setDownloadingId(record.id);

    try {
      const response = await fetch(
        `${API_BASE}/payroll/${record.id}/salary-slip/`,
        {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          getErrorMessage(data, `Download failed (${response.status})`),
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        `salary-slip-${record.employee_code || record.id}-` +
        `${record.year}-${String(record.month).padStart(2, "0")}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      // Revoke after the browser has had an opportunity to start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setSuccess("Salary slip download started.");
    } catch (err) {
      setError(err.message || "Unable to download the salary slip.");
    } finally {
      setDownloadingId(null);
    }
  }

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const matchesSearch =
        !query ||
        String(record.employee_name || "")
          .toLowerCase()
          .includes(query) ||
        String(record.employee_code || "")
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        statusFilter === "ALL" || record.status === statusFilter;

      const matchesPeriod =
        periodFilter === "ALL" ||
        `${record.year}-${String(record.month).padStart(2, "0")}` ===
          periodFilter;

      return matchesSearch && matchesStatus && matchesPeriod;
    });
  }, [records, search, statusFilter, periodFilter]);

  const periods = useMemo(() => {
    const unique = new Set(
      records.map(
        (record) =>
          `${record.year}-${String(record.month).padStart(2, "0")}`,
      ),
    );

    return [...unique].sort((a, b) => b.localeCompare(a));
  }, [records]);

  const summary = useMemo(
    () => ({
      count: visibleRecords.length,
      draft: visibleRecords.filter((r) => r.status === "DRAFT").length,
      locked: visibleRecords.filter((r) => r.status === "LOCKED").length,
      paid: visibleRecords.filter((r) => r.status === "PAID").length,
      net: visibleRecords.reduce(
        (sum, record) => sum + Number(record.net_salary || 0),
        0,
      ),
    }),
    [visibleRecords],
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
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
              <h1 className="text-xl font-bold">Payroll Management</h1>
              <p className="text-sm text-slate-500">
                Salary calculation, payroll approvals, and salary slips
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
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {isAdminHR && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <Wallet size={23} />
              </div>
              <div>
                <h2 className="text-lg font-bold">Generate payroll</h2>
                <p className="text-sm text-slate-500">
                  Generate or recalculate payroll for a completed month.
                </p>
              </div>
            </div>

            <form
              onSubmit={generatePayroll}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="sm:col-span-2">
                <label
                  htmlFor="payroll_employee"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Employee
                </label>
                <select
                  id="payroll_employee"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="">Select employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_code} —{" "}
                      {employee.full_name ||
                        employee.employee_name ||
                        employee.username ||
                        employee.user?.username ||
                        `Employee ${employee.id}`}
                    </option>
                  ))}
                </select>

                {employees.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    No employees found. Check your employee API and active
                    employee records.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="payroll_year"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Year
                </label>
                <input
                  id="payroll_year"
                  type="number"
                  min="2000"
                  max={today.getFullYear()}
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div>
                <label
                  htmlFor="payroll_month"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Month
                </label>
                <select
                  id="payroll_month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (value) => {
                      const future =
                        Number(year) > today.getFullYear() ||
                        (Number(year) === today.getFullYear() &&
                          value >= today.getMonth() + 1);

                      return (
                        <option key={value} value={value} disabled={future}>
                          {getMonthName(value)}
                        </option>
                      );
                    },
                  )}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={generating || !employeeId}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? "Generating..." : "Generate payroll"}
                </button>
              </div>
            </form>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              The backend calculates salary, configured holiday exclusions,
              attendance, approved leave, loss of pay, and active salary
              components. Only draft payroll should be recalculated.
            </p>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Records shown"
            value={summary.count}
            icon={FileText}
          />
          <SummaryCard label="Draft" value={summary.draft} icon={Wallet} />
          <SummaryCard
            label="Locked"
            value={summary.locked}
            icon={LockKeyhole}
          />
          <SummaryCard
            label="Paid / simulated"
            value={summary.paid}
            icon={CircleDollarSign}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-slate-500">Net salary total</p>
              <p className="mt-1 text-xl font-bold">{money(summary.net)}</p>
              <p className="text-xs text-slate-500">
                Sum of records currently shown
              </p>
            </div>

            <div>
              <label
                htmlFor="payroll_search"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Search employee
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3">
                <Search size={16} className="text-slate-400" />
                <input
                  id="payroll_search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or employee code"
                  className="min-w-0 flex-1 py-2.5 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="payroll_status"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Filter by status
              </label>
              <select
                id="payroll_status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="LOCKED">Locked</option>
                <option value="PAID">Paid</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="payroll_period"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Filter by period
              </label>
              <select
                id="payroll_period"
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="ALL">All periods</option>
                {periods.map((period) => {
                  const [periodYear, periodMonth] = period.split("-");
                  return (
                    <option key={period} value={period}>
                      {getMonthName(periodMonth)} {periodYear}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-lg font-bold">
                {isAdminHR ? "Payroll records" : "My payroll history"}
              </h2>
              <p className="text-sm text-slate-500">
                {visibleRecords.length} record(s) shown
              </p>
            </div>

            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-500">
              Loading payroll records...
            </p>
          ) : visibleRecords.length === 0 ? (
            <p className="p-8 text-center text-slate-500">
              No payroll records match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {isAdminHR && (
                      <th className="px-4 py-3">Employee</th>
                    )}
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Base salary</th>
                    <th className="px-4 py-3">Gross salary</th>
                    <th className="px-4 py-3">LOP days</th>
                    <th className="px-4 py-3">LOP deduction</th>
                    <th className="px-4 py-3">Total deductions</th>
                    <th className="px-4 py-3">Net salary</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {visibleRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="align-middle hover:bg-slate-50"
                    >
                      {isAdminHR && (
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">
                            {record.employee_name || "Employee"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {record.employee_code || ""}
                          </p>
                        </td>
                      )}

                      <td className="whitespace-nowrap px-4 py-4 font-medium">
                        {getMonthName(record.month)} {record.year}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {money(record.base_salary)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {money(record.gross_salary)}
                      </td>
                      <td className="px-4 py-4">{record.lop_days ?? 0}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-red-700">
                        {money(record.lop_deduction)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-red-700">
                        {money(record.total_deductions)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-bold">
                        {money(record.net_salary)}
                      </td>
                      <td className="px-4 py-4">
                        <PayrollStatus status={record.status} />
                      </td>

                      <td className="min-w-64 px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {isAdminHR && record.status === "DRAFT" && (
                            <button
                              type="button"
                              disabled={workingId !== null}
                              onClick={() =>
                                changePayrollStatus(record, "lock")
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              <LockKeyhole size={14} />
                              {workingId === record.id
                                ? "Processing..."
                                : "Lock"}
                            </button>
                          )}

                          {isAdminHR && record.status === "LOCKED" && (
                            <button
                              type="button"
                              disabled={workingId !== null}
                              onClick={() =>
                                changePayrollStatus(record, "pay")
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              <CircleDollarSign size={14} />
                              {workingId === record.id
                                ? "Processing..."
                                : "Simulate pay"}
                            </button>
                          )}

                          {["LOCKED", "PAID"].includes(record.status) && (
                            <button
                              type="button"
                              disabled={downloadingId === record.id}
                              onClick={() => downloadSalarySlip(record)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Download size={14} />
                              {downloadingId === record.id
                                ? "Downloading..."
                                : "Salary slip"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-slate-500">
          Simulated payments only record a payment event in this application.
          They do not transfer money through a bank or payment gateway.
          Payroll totals are based on the values returned by the backend.
        </p>
      </div>
    </main>
  );
}
