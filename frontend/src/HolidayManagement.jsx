import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  RefreshCw,
  Plus,
  LogOut,
  CheckCircle2,
  Circle,
} from "lucide-react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/$/, "");

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

function formatHolidayType(type) {
  const labels = {
    COMPANY: "Company-wide",
    REGIONAL: "Regional",
    OPTIONAL: "Optional",
  };

  return labels[type] || type || "—";
}

export default function HolidayManagement({
  user,
  role,
  accessToken,
  onBack,
  onLogout,
}) {
  const canManage = role === "ADMIN" || role === "HR";
  const currentDate = new Date();

  const [year, setYear] = useState(String(currentDate.getFullYear()));
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1));

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectingId, setSelectingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    date: "",
    holiday_type: "COMPANY",
    region: "",
    description: "",
  });

  function getCurrentToken() {
    return (
      sessionStorage.getItem("hrms_access_token") ||
      accessToken ||
      ""
    );
  }

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const token =
        sessionStorage.getItem("hrms_access_token") ||
        accessToken ||
        "";

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

      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          typeof data === "string"
            ? data || `Request failed (${response.status}).`
            : getError(data, `Request failed (${response.status}).`)
        );
      }

      return data;
    },
    [accessToken]
  );

  // Load the selected month's holidays.
  const loadHolidays = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });

      const data = await apiRequest(
        `/holidays/calendar/?${params.toString()}`
      );

      // Support either a list response or a calendar object.
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.holidays)
          ? data.holidays
          : Array.isArray(data?.results)
            ? data.results
            : [];

      setHolidays(items);
    } catch (err) {
      setHolidays([]);
      setError(err.message || "Could not load holidays.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, year, month]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  function updateForm(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "holiday_type" && value !== "REGIONAL"
        ? { region: "" }
        : {}),
    }));
  }

  // Admin/HR creates a holiday.
  async function handleCreateHoliday(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim() || !form.date) {
      setError("Holiday name and date are required.");
      return;
    }

    if (
      form.holiday_type === "REGIONAL" &&
      !form.region.trim()
    ) {
      setError("Enter a region for a regional holiday.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest("/holidays/", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          region:
            form.holiday_type === "REGIONAL"
              ? form.region.trim()
              : "",
          description: form.description.trim(),
        }),
      });

      setSuccess("Holiday created successfully.");

      setForm({
        name: "",
        date: "",
        holiday_type: "COMPANY",
        region: "",
        description: "",
      });

      // Show the newly created holiday's month.
      const createdDate = new Date(`${form.date}T00:00:00`);
      setYear(String(createdDate.getFullYear()));
      setMonth(String(createdDate.getMonth() + 1));

      // The filter change triggers a reload. Also reload immediately
      // when the selected month is already the same.
      await loadHolidays();
    } catch (err) {
      setError(err.message || "Could not create the holiday.");
    } finally {
      setSaving(false);
    }
  }

  // Employee selects or deselects an optional holiday.
  async function handleOptionalSelection(holiday) {
    setError("");
    setSuccess("");
    setSelectingId(holiday.id);

    const alreadySelected = Boolean(
      holiday.is_selected ||
      holiday.selected ||
      holiday.is_selected_by_employee
    );

    try {
      await apiRequest(`/holidays/${holiday.id}/select/`, {
        method: alreadySelected ? "DELETE" : "POST",
      });

      setSuccess(
        alreadySelected
          ? "Optional holiday selection removed."
          : "Optional holiday selected successfully."
      );

      await loadHolidays();
    } catch (err) {
      setError(
        err.message || "Could not update optional holiday selection."
      );
    } finally {
      setSelectingId(null);
    }
  }

  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: new Date(2000, index, 1).toLocaleString("en", {
      month: "long",
    }),
  }));

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "User";

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to dashboard"
              className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="rounded-xl bg-purple-600 p-2.5 text-white">
              <CalendarDays size={24} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Holiday Management
              </h1>
              <p className="text-xs text-slate-500">
                PeopleDesk · {role}
              </p>
            </div>
          </div>

          <button
            type="button"
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
            Holiday Calendar
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Welcome, {displayName}. View holidays applicable to your account.
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

        {canManage && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Plus size={20} />
              Add Holiday
            </h3>

            <form
              onSubmit={handleCreateHoliday}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <label
                  htmlFor="holiday-name"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Holiday name *
                </label>
                <input
                  id="holiday-name"
                  name="name"
                  value={form.name}
                  onChange={updateForm}
                  required
                  maxLength={150}
                  placeholder="e.g. Company Foundation Day"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div>
                <label
                  htmlFor="holiday-date"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Date *
                </label>
                <input
                  id="holiday-date"
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={updateForm}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div>
                <label
                  htmlFor="holiday-type"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Holiday type *
                </label>
                <select
                  id="holiday-type"
                  name="holiday_type"
                  value={form.holiday_type}
                  onChange={updateForm}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="COMPANY">Company-wide</option>
                  <option value="REGIONAL">Regional</option>
                  <option value="OPTIONAL">Optional</option>
                </select>
              </div>

              {form.holiday_type === "REGIONAL" && (
                <div>
                  <label
                    htmlFor="holiday-region"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Region *
                  </label>
                  <input
                    id="holiday-region"
                    name="region"
                    value={form.region}
                    onChange={updateForm}
                    required
                    maxLength={100}
                    placeholder="e.g. Tamil Nadu"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label
                  htmlFor="holiday-description"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Description
                </label>
                <textarea
                  id="holiday-description"
                  name="description"
                  value={form.description}
                  onChange={updateForm}
                  rows={3}
                  placeholder="Additional details (optional)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-lg bg-purple-700 px-5 py-3 font-semibold text-white hover:bg-purple-800 disabled:opacity-60"
                >
                  <Plus size={18} />
                  {saving ? "Creating..." : "Create Holiday"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h3 className="font-bold text-slate-900">
                Holidays
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {holidays.length} holiday(s) displayed
              </p>
            </div>

            <button
              type="button"
              onClick={loadHolidays}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 p-5">
            <div>
              <label
                htmlFor="holiday-month"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Month
              </label>
              <select
                id="holiday-month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="holiday-year"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Year
              </label>
              <input
                id="holiday-year"
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-slate-500">
              <RefreshCw size={20} className="animate-spin" />
              Loading holidays...
            </div>
          ) : holidays.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarDays
                size={36}
                className="mx-auto mb-3 text-slate-300"
              />
              <p className="font-semibold text-slate-700">
                No holidays found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try another month or year.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Holiday</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Region</th>
                    <th className="px-5 py-4">Description</th>
                    {!canManage && (
                      <th className="px-5 py-4">Optional selection</th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {holidays.map((holiday) => {
                    const isOptional =
                      holiday.holiday_type === "OPTIONAL";

                    const isSelected = Boolean(
                      holiday.is_selected ||
                      holiday.selected ||
                      holiday.is_selected_by_employee
                    );

                    return (
                      <tr
                        key={holiday.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {holiday.name}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {holiday.date}
                        </td>

                        <td className="px-5 py-4">
                          <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-800">
                            {formatHolidayType(holiday.holiday_type)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {holiday.region || "All regions"}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {holiday.description || "—"}
                        </td>

                        {!canManage && (
                          <td className="px-5 py-4">
                            {isOptional ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOptionalSelection(holiday)
                                }
                                disabled={selectingId === holiday.id}
                                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                                  isSelected
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                {isSelected ? (
                                  <CheckCircle2 size={16} />
                                ) : (
                                  <Circle size={16} />
                                )}
                                {selectingId === holiday.id
                                  ? "Updating..."
                                  : isSelected
                                    ? "Selected"
                                    : "Select"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Not required
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
