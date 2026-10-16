
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  RefreshCw,
  ArrowLeft,
  Settings,
  Send,
} from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api";

// These values match the department names currently stored in your database.
const DEPARTMENTS = [
  "Software development",
  "Software testing",
];

export default function NotificationCenter({
  accessToken,
  role,
  onBack,
}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState(null);
  const [showPreferences, setShowPreferences] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementDepartment, setAnnouncementDepartment] = useState("");

  const normalizedRole = String(role || "").toUpperCase();
  const canSendAnnouncement = ["ADMIN", "HR"].includes(normalizedRole);

  // Common API helper: sends the JWT and handles backend errors.
  const apiRequest = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...options.headers,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail =
          data.detail ||
          Object.entries(data)
            .map(([field, value]) => {
              const message = Array.isArray(value)
                ? value.join(" ")
                : typeof value === "string"
                  ? value
                  : "";

              return message ? `${field}: ${message}` : "";
            })
            .filter(Boolean)
            .join(" ");

        throw new Error(detail || `Request failed (${response.status}).`);
      }

      return data;
    },
    [accessToken]
  );

  // Load only the signed-in user's notifications.
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/notifications/");
      const results = Array.isArray(data.results) ? data.results : [];

      setNotifications(results);
      setUnreadCount(
        data.unread_count ??
          results.filter((item) => !item.is_read).length
      );
    } catch (err) {
      setError(err.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Load notification preferences.
  const loadPreferences = useCallback(async () => {
    try {
      const data = await apiRequest("/notifications/preferences/");
      setPreferences(data);
    } catch (err) {
      setError(err.message || "Could not load notification preferences.");
    }
  }, [apiRequest]);

  useEffect(() => {
    loadNotifications();
    loadPreferences();
  }, [loadNotifications, loadPreferences]);

  async function refreshAll() {
    setSuccess("");
    await Promise.all([loadNotifications(), loadPreferences()]);
  }

  // Mark one notification as read.
  async function markAsRead(id) {
    setError("");
    setSuccess("");

    try {
      await apiRequest(`/notifications/${id}/read/`, {
        method: "POST",
      });

      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );

      setUnreadCount((count) => Math.max(0, count - 1));
      setSuccess("Notification marked as read.");
    } catch (err) {
      setError(err.message || "Could not mark notification as read.");
    }
  }

  // Mark all unread notifications as read.
  async function markAllAsRead() {
    const unread = notifications.filter((item) => !item.is_read);

    if (unread.length === 0) return;

    setError("");
    setSuccess("");

    for (const item of unread) {
      try {
        await apiRequest(`/notifications/${item.id}/read/`, {
          method: "POST",
        });
      } catch (err) {
        setError(err.message || "Some notifications could not be updated.");
        await loadNotifications();
        return;
      }
    }

    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );
    setUnreadCount(0);
    setSuccess("All notifications marked as read.");
  }

  // Save the user's notification preferences.
  async function savePreferences(event) {
    event.preventDefault();

    if (!preferences) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest("/notifications/preferences/", {
        method: "PATCH",
        body: JSON.stringify({
          leave_enabled: preferences.leave_enabled,
          payroll_enabled: preferences.payroll_enabled,
          attendance_enabled: preferences.attendance_enabled,
          announcements_enabled: preferences.announcements_enabled,
          general_enabled: preferences.general_enabled,
        }),
      });

      setPreferences(data);
      setSuccess("Notification preferences saved.");
      setShowPreferences(false);
    } catch (err) {
      setError(err.message || "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(field, value) {
    setPreferences((current) => ({
      ...current,
      [field]: value,
    }));
  }

  // Send an announcement to all employees or one selected department.
  async function sendAnnouncement(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!announcementTitle.trim() || !announcementMessage.trim()) {
      setError("Please enter both an announcement title and message.");
      return;
    }

    setSendingAnnouncement(true);

    try {
      const data = await apiRequest("/notifications/announcements/", {
        method: "POST",
        body: JSON.stringify({
          title: announcementTitle.trim(),
          message: announcementMessage.trim(),

          // An empty department means all departments.
          department: announcementDepartment,
        }),
      });

      setAnnouncementTitle("");
      setAnnouncementMessage("");
      setAnnouncementDepartment("");

      setSuccess(
        `${data.detail || "Announcement processed."} ` +
          `Employees notified: ${data.recipients_notified ?? 0}.`
      );

      // Refresh this signed-in user's notification list.
      await loadNotifications();
    } catch (err) {
      setError(err.message || "Could not send announcement.");
    } finally {
      setSendingAnnouncement(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-slate-300 bg-white p-2 hover:bg-slate-50"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="rounded-xl bg-blue-700 p-3 text-white">
              <Bell size={25} />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Notification Center
              </h1>
              <p className="text-sm text-slate-500">
                Signed in as {normalizedRole || "USER"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshAll}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>

            <button
              type="button"
              onClick={() => setShowPreferences((value) => !value)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Settings size={16} />
              Preferences
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total loaded</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {notifications.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Unread notifications</p>
            <p className="mt-1 text-3xl font-bold text-blue-700">
              {unreadCount}
            </p>
          </div>
        </section>

        {canSendAnnouncement && (
          <form
            onSubmit={sendAnnouncement}
            className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
                <Send size={22} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Send an announcement
                </h2>
                <p className="text-sm text-slate-500">
                  Send an update to employees in your organization.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="announcement-title"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Announcement title
                </label>

                <input
                  id="announcement-title"
                  type="text"
                  value={announcementTitle}
                  onChange={(event) =>
                    setAnnouncementTitle(event.target.value)
                  }
                  maxLength={200}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-600"
                  placeholder="Example: Office holiday announcement"
                />
              </div>

              <div>
                <label
                  htmlFor="announcement-message"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Message
                </label>

                <textarea
                  id="announcement-message"
                  value={announcementMessage}
                  onChange={(event) =>
                    setAnnouncementMessage(event.target.value)
                  }
                  required
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-600"
                  placeholder="Enter announcement details..."
                />
              </div>

              <div>
                <label
                  htmlFor="announcement-department"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Department (optional)
                </label>

                <select
                  id="announcement-department"
                  value={announcementDepartment}
                  onChange={(event) =>
                    setAnnouncementDepartment(event.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-600"
                >
                  <option value="">All departments</option>

                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>

                <p className="mt-1 text-xs text-slate-500">
                  Select a department to target its employees, or choose All
                  departments to notify everyone.
                </p>
              </div>

              <button
                type="submit"
                disabled={sendingAnnouncement}
                className="flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={16} />
                {sendingAnnouncement ? "Sending..." : "Send announcement"}
              </button>
            </div>
          </form>
        )}

        {showPreferences && (
          <form
            onSubmit={savePreferences}
            className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Notification preferences
            </h2>

            {!preferences ? (
              <p className="text-sm text-slate-500">
                Loading preferences or preferences could not be loaded. Try
                Refresh.
              </p>
            ) : (
              <>
                {[
                  ["leave_enabled", "Leave updates"],
                  ["payroll_enabled", "Payroll updates"],
                  ["attendance_enabled", "Attendance alerts"],
                  ["announcements_enabled", "Announcements"],
                  ["general_enabled", "General notifications"],
                ].map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-center justify-between border-b border-slate-100 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {label}
                    </span>

                    <input
                      type="checkbox"
                      checked={Boolean(preferences[field])}
                      onChange={(event) =>
                        updatePreference(field, event.target.checked)
                      }
                      className="h-4 w-4 accent-blue-700"
                    />
                  </label>
                ))}

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save preferences"}
                </button>
              </>
            )}
          </form>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-900">
              Recent notifications
            </h2>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-500">
              Loading notifications...
            </p>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center">
              <Bell
                className="mx-auto mb-3 text-slate-300"
                size={38}
              />

              <p className="font-semibold text-slate-700">
                No notifications yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Leave updates and announcements will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((item) => (
                <article
                  key={item.id}
                  className={`flex flex-wrap items-start justify-between gap-4 p-5 ${
                    item.is_read ? "bg-white" : "bg-blue-50/60"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-600">
                      <Bell size={18} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">
                          {item.title}
                        </h3>

                        {!item.is_read && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            Unread
                          </span>
                        )}
                      </div>

                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {item.message}
                      </p>

                      <p className="mt-2 text-xs text-slate-400">
                        {item.notification_type} ·{" "}
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString()
                          : ""}
                      </p>
                    </div>
                  </div>

                  {!item.is_read && (
                    <button
                      type="button"
                      onClick={() => markAsRead(item.id)}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Mark as read
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
