// C:\HRMS-project\frontend\src\Dashboard.jsx

import { useState } from "react";
import {
  Users,
  CalendarCheck,
  CalendarDays,
  Wallet,
  LogOut,
  LayoutDashboard,
  UserCircle,
  ShieldCheck,
} from "lucide-react";

import EmployeeManagement from "./EmployeeManagement";
import AttendanceManagement from "./AttendanceManagement";
import LeaveManagement from "./LeaveManagement";
import PayrollManagement from "./PayrollManagement";

const modules = [
  {
    title: "Employees",
    description: "Add, search, edit, and deactivate employee records.",
    icon: Users,
  },
  {
    title: "Attendance",
    description: "Review attendance and working hours.",
    icon: CalendarCheck,
  },
  {
    title: "Leave Management",
    description: "Apply for leave and review requests.",
    icon: CalendarDays,
  },
  {
    title: "Payroll",
    description: "Review salary records and salary slips.",
    icon: Wallet,
  },
];

export default function Dashboard({ user, onLogout, accessToken }) {
  const [activeModule, setActiveModule] = useState("Dashboard");

  const role = (
    user?.role ||
    user?.profile?.role ||
    (user?.is_superuser ? "ADMIN" : "EMPLOYEE")
  )
    .toString()
    .toUpperCase();

  const name =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.username ||
    "User";

  const moduleProps = {
    user,
    role,
    accessToken,
    onBack: () => setActiveModule("Dashboard"),
    onLogout,
  };

  if (activeModule === "Employees") {
    return <EmployeeManagement {...moduleProps} />;
  }

  if (activeModule === "Attendance") {
    return <AttendanceManagement {...moduleProps} />;
  }

  if (activeModule === "Leave Management") {
    return <LeaveManagement {...moduleProps} />;
  }

  if (activeModule === "Payroll") {
    return <PayrollManagement {...moduleProps} />;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-700 p-2.5 text-white">
              <ShieldCheck size={25} />
            </div>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                PeopleDesk
              </h1>
              <p className="text-xs text-slate-500">
                Human Resource Management
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
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-700">
              <LayoutDashboard className="mr-1 inline" size={16} />
              Dashboard
            </p>

            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              Welcome, {name}
            </h2>

            <p className="mt-2 text-slate-500">
              Manage your HR activities from one workspace.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <UserCircle className="text-blue-700" size={28} />
            <div>
              <p className="font-semibold text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">{role}</p>
            </div>
          </div>
        </div>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <button
                key={module.title}
                type="button"
                onClick={() => setActiveModule(module.title)}
                className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-3 text-slate-800">
                  <Icon size={25} />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  {module.title}
                </h3>

                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                  {module.description}
                </p>

                <p className="mt-4 text-sm font-semibold text-blue-700">
                  Open {module.title} →
                </p>
              </button>
            );
          })}
        </section>

        <section className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Getting started
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Choose Employees to manage employee records, Attendance to review
            working hours, Leave Management to submit or review leave requests,
            and Payroll to generate payroll or view salary slips.
          </p>
        </section>
      </div>
    </main>
  );
}