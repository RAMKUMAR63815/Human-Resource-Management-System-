import { useEffect, useState } from "react";
import {
  Users,
  ArrowLeft,
  Plus,
  Search,
  Pencil,
  UserX,
  LogOut,
  X,
  RefreshCw,
} from "lucide-react";

// Uses the host port mapped to the Django backend by Docker.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/$/, "");

// Provides empty values for a new employee form.
const EMPTY_FORM = {
  employee_code: "",
  username: "",
  password: "",
  email: "",
  first_name: "",
  last_name: "",
  department: "",
  designation: "",
  joining_date: "",
  salary: "",
  phone: "",
  address: "",
};

// Converts API errors into readable messages.
function readError(data, fallback) {
  if (data?.detail) {
    return typeof data.detail === "string"
      ? data.detail
      : JSON.stringify(data.detail);
  }

  return (
    Object.entries(data || {})
      .map(([field, value]) => {
        const message = Array.isArray(value)
          ? value.join(" ")
          : typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value);

        return `${field}: ${message}`;
      })
      .join(" ") || fallback
  );
}

// Reusable input styling keeps the form consistent.
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

// Creates a form field with a label.
function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  step,
  children,
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1.5 block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>

      {children || (
        <input
          id={name}
          name={name}
          type={type}
          value={value ?? ""}
          onChange={onChange}
          required={required}
          min={min}
          step={step}
          className={inputClass}
        />
      )}
    </div>
  );
}

export default function EmployeeManagement({
  user,
  role,
  accessToken,
  onBack,
  onLogout,
}) {
  // Stores the employee records returned by Django.
  const [employees, setEmployees] = useState([]);

  // Stores the search text.
  const [search, setSearch] = useState("");

  // Tracks employee-list loading.
  const [loading, setLoading] = useState(true);

  // Tracks form submission.
  const [saving, setSaving] = useState(false);

  // Stores API errors and success messages.
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Controls whether the add/edit form is visible.
  const [formOpen, setFormOpen] = useState(false);

  // Stores the employee currently being edited.
  const [editingEmployee, setEditingEmployee] = useState(null);

  // Stores the current form field values.
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Stores which employee is being deactivated.
  const [deactivatingId, setDeactivatingId] = useState(null);

  // Checks whether the current user can manage employees.
  const canManage = role === "ADMIN" || role === "HR";

  // Sends authenticated requests to the Django API.
  async function apiRequest(path, options = {}) {
    // Get the latest token from the current browser session.
    const token =
      sessionStorage.getItem("hrms_access_token") || accessToken;

    // Stop if the user is not logged in.
    if (!token) {
      throw new Error(
        "Your login session is missing. Please sign in again."
      );
    }

    // Send the request with the current access token.
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });

    // Read the API response, including error messages.
    const data = await response.json().catch(() => ({}));

    // Display the error returned by Django if the request fails.
    if (!response.ok) {
      throw new Error(
        readError(
          data,
          `Request failed with status ${response.status}.`
        )
      );
    }

    return data;
  }

  // Loads employees whenever the search text changes.
  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      setLoading(true);
      setError("");

      try {
        const query = new URLSearchParams();

        if (search.trim()) {
          query.set("search", search.trim());
        }

        const suffix = query.toString()
          ? `?${query.toString()}`
          : "";

        const data = await apiRequest(`/employees/${suffix}`);

        if (!cancelled) {
          // Supports either a plain list or DRF paginated responses.
          setEmployees(
            Array.isArray(data) ? data : data.results || []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load employees.");
          setEmployees([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // Debounces searches to avoid sending a request for every keystroke.
    const timer = setTimeout(loadEmployees, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, accessToken]);

  // Updates the selected form field.
  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  // Opens an empty form for creating a new employee.
  function openCreateForm() {
    setEditingEmployee(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  // Opens the form with the selected employee's current details.
  function openEditForm(employee) {
    setEditingEmployee(employee);

    setForm({
      ...EMPTY_FORM,
      ...employee,
      password: "",
      salary: String(employee.salary ?? ""),
      joining_date: employee.joining_date || "",
    });

    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  // Saves a new employee or updates an existing employee.
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!editingEmployee && form.password.length < 12) {
      setError(
        "The employee's initial password must contain at least 12 characters."
      );
      return;
    }

    setSaving(true);

    try {
      let path = "/employees/";
      let method = "POST";
      let payload;

      if (editingEmployee) {
        // PATCH updates only editable employee fields.
        path = `/employees/${editingEmployee.id}/`;
        method = "PATCH";

        payload = {
          employee_code: form.employee_code,
          department: form.department,
          designation: form.designation,
          joining_date: form.joining_date,
          salary: form.salary,
          phone: form.phone,
          address: form.address,
        };
      } else {
        // Creation includes the new employee's login details.
        payload = {
          ...form,
          employee_code: form.employee_code.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
        };
      }

      await apiRequest(path, {
        method,
        body: JSON.stringify(payload),
      });

      setSuccess(
        editingEmployee
          ? "Employee updated successfully."
          : "Employee and login account created successfully."
      );

      setFormOpen(false);
      setEditingEmployee(null);
      setForm({ ...EMPTY_FORM });

      // Refresh the table after a successful save.
      const query = new URLSearchParams();

      if (search.trim()) {
        query.set("search", search.trim());
      }

      const suffix = query.toString()
        ? `?${query.toString()}`
        : "";

      const data = await apiRequest(`/employees/${suffix}`);

      setEmployees(
        Array.isArray(data) ? data : data.results || []
      );
    } catch (err) {
      setError(err.message || "Unable to save the employee.");
    } finally {
      setSaving(false);
    }
  }

  // Deactivates an employee without deleting their historical records.
  async function handleDeactivate(employee) {
    const confirmed = window.confirm(
      `Deactivate employee ${employee.employee_code} (${employee.username})?`
    );

    if (!confirmed) return;

    setDeactivatingId(employee.id);
    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `/employees/${employee.id}/deactivate/`,
        { method: "POST" }
      );

      setSuccess(
        `Employee ${employee.employee_code} was deactivated.`
      );

      // Updates the table after deactivation.
      setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? { ...item, is_active: false }
            : item
        )
      );
    } catch (err) {
      setError(err.message || "Unable to deactivate the employee.");
    } finally {
      setDeactivatingId(null);
    }
  }

  // Prevents non-privileged users from accessing employee-management UI.
  if (!canManage) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Employee Management
          </h1>

          <p className="mt-3 text-slate-600">
            Your current role is {role}. Only Admin and HR accounts can
            manage employee records. Ask an administrator to assign the
            appropriate role.
          </p>

          <button
            onClick={onBack}
            className="mt-6 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white"
          >
            Back to dashboard
          </button>
        </section>
      </main>
    );
  }

  // Displays the employee-management page.
  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              title="Back to dashboard"
              className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="rounded-xl bg-blue-700 p-2.5 text-white">
              <Users size={24} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Employee Management
              </h1>
              <p className="text-xs text-slate-500">
                PeopleDesk · HRMS
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
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">
              Employees
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              View and manage employee records and account details.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800"
          >
            <Plus size={19} />
            Add employee
          </button>
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

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h3 className="font-bold text-slate-900">
                Employee directory
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? "Loading employee records..."
                  : `${employees.length} record(s) displayed`}
              </p>
            </div>

            <div className="relative w-full sm:max-w-sm">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, username, or code"
                aria-label="Search employees"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-slate-500">
              <RefreshCw className="animate-spin" size={20} />
              Loading employees...
            </div>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="mx-auto text-slate-300" size={40} />

              <p className="mt-3 font-semibold text-slate-700">
                No employees found
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Add an employee or try a different search.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Employee</th>
                    <th className="px-5 py-4">Code</th>
                    <th className="px-5 py-4">Department</th>
                    <th className="px-5 py-4">Designation</th>
                    <th className="px-5 py-4">Joining date</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {employees.map((employee) => {
                    const fullName =
                      [employee.first_name, employee.last_name]
                        .filter(Boolean)
                        .join(" ") || employee.username;

                    return (
                      <tr key={employee.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">
                            {fullName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {employee.email}
                          </p>
                        </td>

                        <td className="px-5 py-4 font-medium text-slate-700">
                          {employee.employee_code}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {employee.department}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {employee.designation}
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {employee.joining_date}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              employee.is_active
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {employee.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditForm(employee)}
                              title="Edit employee"
                              className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100"
                            >
                              <Pencil size={16} />
                            </button>

                            <button
                              onClick={() => handleDeactivate(employee)}
                              disabled={
                                !employee.is_active ||
                                deactivatingId === employee.id
                              }
                              title="Deactivate employee"
                              className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <UserX size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8">
            <section className="my-auto w-full max-w-3xl rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-5">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {editingEmployee ? "Edit employee" : "Add employee"}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {editingEmployee
                      ? "Update employee information."
                      : "Create an employee record and login account."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  aria-label="Close form"
                  className="rounded-lg p-2 hover:bg-slate-100"
                >
                  <X size={21} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 p-5">
                {!editingEmployee && (
                  <div>
                    <h4 className="mb-3 font-bold text-slate-800">
                      Login account
                    </h4>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label="Username"
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        required
                      />

                      <FormField
                        label="Email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                      />

                      <FormField
                        label="First name"
                        name="first_name"
                        value={form.first_name}
                        onChange={handleChange}
                        required
                      />

                      <FormField
                        label="Last name"
                        name="last_name"
                        value={form.last_name}
                        onChange={handleChange}
                      />

                      <FormField
                        label="Initial password (minimum 12 characters)"
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="mb-3 font-bold text-slate-800">
                    Employee information
                  </h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Employee code"
                      name="employee_code"
                      value={form.employee_code}
                      onChange={handleChange}
                      required
                    />

                    <FormField
                      label="Department"
                      name="department"
                      value={form.department}
                      onChange={handleChange}
                      required
                    />

                    <FormField
                      label="Designation"
                      name="designation"
                      value={form.designation}
                      onChange={handleChange}
                      required
                    />

                    <FormField
                      label="Joining date"
                      name="joining_date"
                      type="date"
                      value={form.joining_date}
                      onChange={handleChange}
                      required
                    />

                    <FormField
                      label="Salary"
                      name="salary"
                      type="number"
                      value={form.salary}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      required
                    />

                    <FormField
                      label="Phone"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="mt-4">
                    <FormField
                      label="Address"
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                    >
                      <textarea
                        id="address"
                        name="address"
                        value={form.address}
                        onChange={handleChange}
                        rows={3}
                        className={inputClass}
                      />
                    </FormField>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {saving
                      ? "Saving..."
                      : editingEmployee
                        ? "Save changes"
                        : "Create employee"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}