"use client";

import AttendanceAlerts from "../../components/notifications/AttendanceAlerts";
import AttendanceCalendarView from "../../components/attendance/AttendanceCalendarView";
import DepartmentManagerMyDay from "../../components/dm/DepartmentManagerMyDay";
import DepartmentManagerSelfAttendance from "../../components/dm/DepartmentManagerSelfAttendance";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BellRing,
  ChevronDown,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileClock,
  RefreshCw,
  ShieldCheck,
  Timer,
  Users,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

type DepartmentRecord = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  employeeCount: number;
  activeEmployeeCount: number;
  inactiveEmployeeCount: number;
  formerEmployeeCount: number;
};

type EmployeeRecord = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  designation?: string | null;
  employment_status?: string | null;
  department_name?: string | null;
  joining_date?: string | null;
};

type OverviewData = {
  status?: string;
  message?: string;
  workDate: string;
  timeZone: string;
  departments: DepartmentRecord[];
  team: {
    total: number;
    active: number;
    inactive: number;
    former: number;
  };
  reviewCounts: {
    corrections: number;
    overtime: number;
    total: number;
  };
  generatedAt: string;
};

type ApiCollection<T> = {
  message?: string;
  employees?: T[];
  pagination?: { total?: number };
};

type CalendarEvent = {
  id: string;
  eventType: "CLOCK_IN" | "CLOCK_OUT";
  recordedAt: string;
  timeZone: string;
  source?: string;
};

type CalendarEntry = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  workDate: string;
  scheduleName: string | null;
  timeZone: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  scheduledBreakMinutes: number | null;
  firstClockIn: string | null;
  lastClockOut: string | null;
  eventCount: number;
  events: CalendarEvent[];
};

type CalendarResponse = {
  message?: string;
  entries?: CalendarEntry[];
  hasMore?: boolean;
};

type StatTone = "sky" | "emerald" | "amber" | "indigo";

const PANEL = "min-w-0 rounded-2xl border border-slate-800/90 bg-[#131a24] shadow-lg shadow-black/10";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message = data && typeof data === "object" && "message" in data && typeof data.message === "string"
      ? data.message
      : `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (data === null) throw new Error("The server returned an unreadable response.");
  return data;
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function numberLabel(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat().format(value);
}

function employeeName(employee: Pick<EmployeeRecord, "first_name" | "last_name" | "employee_code">): string {
  return `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || employee.employee_code || "Unnamed employee";
}

function calendarName(entry: CalendarEntry): string {
  return `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() || entry.employeeCode || "Employee";
}

function initials(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "E";
}

function statusLabel(value: string | null | undefined): string {
  switch ((value ?? "").toUpperCase()) {
    case "ACTIVE": return "Active";
    case "INACTIVE": return "Inactive";
    case "FORMER": return "Former";
    default: return value || "Unknown";
  }
}

function statusClasses(value: string | null | undefined): string {
  switch ((value ?? "").toUpperCase()) {
    case "ACTIVE": return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "INACTIVE": return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "FORMER": return "border-slate-700 bg-slate-800/70 text-slate-300";
    default: return "border-slate-700 bg-slate-800/70 text-slate-400";
  }
}

function safeTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...(timeZone ? { timeZone } : {}) }).format(date);
  } catch {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
}

function safeDate(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString("en-US", { hour12: true });
  }
}

function dateTitle(value: string, _timeZone: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return value;
  }
}

function latestEvent(entry: CalendarEntry): CalendarEvent | null {
  if (!Array.isArray(entry.events) || entry.events.length === 0) return null;
  const sorted = [...entry.events].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function currentStatus(entry: CalendarEntry): { label: string; tone: string; detail: string } {
  const latest = latestEvent(entry);
  if (latest?.eventType === "CLOCK_IN") {
    return { label: "Clock-in recorded", tone: "border-sky-400/20 bg-sky-400/10 text-sky-200", detail: `Latest event for this work date: clock-in at ${safeDate(latest.recordedAt, entry.timeZone ?? undefined)}` };
  }
  if (latest?.eventType === "CLOCK_OUT") {
    return { label: "Clock-out recorded", tone: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200", detail: `Last event: clock-out at ${safeDate(latest.recordedAt, entry.timeZone ?? undefined)}` };
  }
  if (entry.expectedStart) {
    return { label: "Scheduled", tone: "border-slate-600 bg-slate-800/60 text-slate-300", detail: "No attendance punch is recorded in this day's entries." };
  }
  return { label: "Recorded activity", tone: "border-slate-600 bg-slate-800/60 text-slate-300", detail: "Attendance activity is available for this date." };
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: StatTone;
  href?: string;
}) {
  const tones: Record<StatTone, string> = {
    sky: "border-sky-500/20 bg-sky-500/[0.07] text-sky-300",
    emerald: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
    indigo: "border-indigo-500/20 bg-indigo-500/[0.07] text-indigo-300",
  };
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-white">{value}</p>
        </div>
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl border ${tones[tone]}`}><Icon size={20} /></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs leading-5 text-slate-500">{detail}</p>
        {href && <ArrowRight size={14} className="shrink-0 text-slate-500" />}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={`${PANEL} block p-5 transition hover:border-slate-700 hover:bg-[#161e29] focus:outline-none focus:ring-2 focus:ring-sky-400/50`}>
      {content}
    </Link>
  ) : <section className={`${PANEL} p-5`}>{content}</section>;
}

function ReviewTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Link href="/dm/reviews" className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-800 bg-[#0e141c]/80 p-3.5 transition hover:border-slate-700 hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-sky-400/50">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-white/[0.025] text-sky-200"><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-200">{label}</span>
        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-lg font-bold tabular-nums text-white">{value === undefined ? "—" : numberLabel(value)}</span>
        <ChevronRight size={14} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-sky-300" />
      </span>
    </Link>
  );
}

export default function DepartmentManagerDashboardPage() {
  const auth = useDepartmentManagerSession();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [calendarHasMore, setCalendarHasMore] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [employeeError, setEmployeeError] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!auth.user) return;
    setLoading(true);
    setOverviewError("");
    setEmployeeError("");
    setCalendarError("");

    let currentOverview: OverviewData | null = null;
    try {
      currentOverview = await getJson<OverviewData>("/department-manager/overview");
      setOverview(currentOverview);
    } catch (error) {
      setOverview(null);
      setOverviewError(error instanceof Error ? error.message : "Unable to load the team command center.");
    }

    const workDate = currentOverview?.workDate || localDateString(new Date());
    const toDate = addDays(workDate, 6);
    const params = new URLSearchParams({ fromDate: workDate, toDate });
    const [employeeResult, calendarResult] = await Promise.allSettled([
      getJson<ApiCollection<EmployeeRecord>>("/employees?page=1&limit=8&sortBy=created_at&sortOrder=desc"),
      getJson<CalendarResponse>(`/attendance/calendar?${params.toString()}`),
    ]);

    if (employeeResult.status === "fulfilled") {
      setEmployees(Array.isArray(employeeResult.value.employees) ? employeeResult.value.employees : []);
    } else {
      setEmployees([]);
      setEmployeeError(employeeResult.reason instanceof Error ? employeeResult.reason.message : "Unable to load recent team members.");
    }

    if (calendarResult.status === "fulfilled") {
      setCalendarEntries(Array.isArray(calendarResult.value.entries) ? calendarResult.value.entries : []);
      setCalendarHasMore(Boolean(calendarResult.value.hasMore));
    } else {
      setCalendarEntries([]);
      setCalendarHasMore(false);
      setCalendarError(calendarResult.reason instanceof Error ? calendarResult.reason.message : "Unable to load team attendance and schedule records.");
    }

    setLoading(false);
  }, [auth.user, refreshKey]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const workDate = overview?.workDate || localDateString(new Date());
  const timeZone = overview?.timeZone || "Africa/Kigali";
  const todayEntries = useMemo(
    () => calendarEntries.filter((entry) => entry.workDate === workDate),
    [calendarEntries, workDate],
  );
  const scheduledToday = todayEntries.filter((entry) => Boolean(entry.expectedStart && entry.scheduleName)).length;
  const recordedToday = todayEntries.filter((entry) => entry.eventCount > 0).length;
  const upcomingEntries = useMemo(() => calendarEntries
    .filter((entry) => entry.workDate >= workDate && Boolean(entry.scheduleName && entry.expectedStart))
    .sort((a, b) => (a.workDate.localeCompare(b.workDate) || Date.parse(a.expectedStart ?? "") - Date.parse(b.expectedStart ?? ""))), [calendarEntries, workDate]);

  if (auth.checking) return <DepartmentManagerLoading message="Preparing your team command center…" />;
  if (!auth.user) {
    return <DepartmentManagerUnavailable message={auth.error || "Your Department Manager session could not be verified."} onRetry={() => void auth.reload()} />;
  }

  const currentEmployeeId = auth.user.employeeId;
  const noAssignedDepartments = Boolean(overview && overview.departments.length === 0);
  const countsAvailable = Boolean(overview);

  return (
    <DepartmentManagerShell
      user={auth.user}
      title="Team Command Center"
      description="Understand today's team operations, resolve pending decisions, and plan ahead—within your assigned department scope."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      actions={
        <button type="button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-[#151b24] px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      {(auth.error || overviewError) && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-4 sm:flex-row sm:items-start">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-300" />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-rose-200">Command center summary unavailable</p><p className="mt-1 text-sm leading-6 text-rose-200/80">{overviewError || auth.error}</p></div>
        <button type="button" onClick={() => setRefreshKey((n) => n + 1)} disabled={loading} className="self-start rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/10 disabled:opacity-50">Retry</button>
      </div>}

      <section className={`${PANEL} mb-5 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-200"><BellRing size={17} /></span><div><h2 className="text-sm font-bold text-white">Attendance alerts</h2><p className="text-xs text-slate-400">Expand only when you need to review alerts.</p></div></div>
          <button type="button" aria-expanded={alertsExpanded} onClick={() => setAlertsExpanded((expanded) => !expanded)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">{alertsExpanded ? "Hide alerts" : "Show alerts"}<ChevronDown size={14} className={`transition-transform ${alertsExpanded ? "rotate-180" : ""}`} /></button>
        </div>
        <div className={alertsExpanded ? "mt-4 block" : "hidden"}><AttendanceAlerts /></div>
      </section>
      <section className={`${PANEL} mb-5 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-800/80 bg-gradient-to-r from-sky-500/[0.08] via-[#131a24] to-indigo-500/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dm/profile" title="Open your Department Manager profile" className="shrink-0 rounded-2xl outline-none ring-offset-2 ring-offset-[#131a24] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sky-400">
              <EmployeeProfilePhoto name="Department Manager" className="size-14 rounded-2xl border border-sky-400/25 bg-sky-500/10 shadow-lg shadow-sky-950/20" textClassName="text-base font-extrabold text-sky-200" />
            </Link>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.17em] text-sky-300">Your workday</p><h2 className="mt-1 text-lg font-semibold text-white">Personal attendance & shift</h2><p className="mt-1 text-sm leading-5 text-slate-400">Clock in and out for your own employee record, check today's shift, and plan around upcoming holidays.</p></div>
          </div>
          <Link href="/dm/attendance" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]">Attendance details <ArrowRight size={14}/></Link>
        </div>
        <div className="p-4 sm:p-5"><DepartmentManagerSelfAttendance employeeId={auth.user.employeeId} organizationTimeZone={timeZone} /><DepartmentManagerMyDay employeeId={auth.user.employeeId} organizationTimeZone={timeZone} /></div>
      </section>
      <section className={`${PANEL} mb-5 overflow-hidden`}>
        <div className="border-b border-slate-800/80 px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[.17em] text-sky-300">Personal workspace</p><h2 className="mt-1 text-lg font-semibold text-white">Your records and requests</h2><p className="mt-1 text-sm leading-5 text-slate-400">Keep your own attendance, requests and earnings separate from team supervision.</p></div>
        <div className="grid gap-px bg-slate-800/80 sm:grid-cols-3">
          <Link href="/dm/attendance" className="group bg-[#111821] p-4 transition hover:bg-[#172231] sm:p-5"><span className="flex size-9 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-200"><Clock3 size={17}/></span><h3 className="mt-3 text-sm font-semibold text-white">My attendance</h3><p className="mt-1 text-xs leading-5 text-slate-400">Work sessions, daily hours, corrections and overtime requests.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">Open attendance <ArrowRight size={13}/></span></Link>
          <Link href="/dm/leave" className="group bg-[#111821] p-4 transition hover:bg-[#172231] sm:p-5"><span className="flex size-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-200"><CalendarDays size={17}/></span><h3 className="mt-3 text-sm font-semibold text-white">My leave & requests</h3><p className="mt-1 text-xs leading-5 text-slate-400">Submit leave and review personal request statuses alongside team review access.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">Open leave <ArrowRight size={13}/></span></Link>
          <Link href="/dm/payroll" className="group bg-[#111821] p-4 transition hover:bg-[#172231] sm:p-5"><span className="flex size-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"><Timer size={17}/></span><h3 className="mt-3 text-sm font-semibold text-white">My earnings & payments</h3><p className="mt-1 text-xs leading-5 text-slate-400">Your calculated earnings and payment history, separate from team payroll visibility.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">Open earnings <ArrowRight size={13}/></span></Link>
        </div>
      </section>

      <section className={`${PANEL} mb-5 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-sky-300">Team operations</p><h2 className="mt-1 text-lg font-semibold text-white">Team attendance calendar</h2><p className="mt-1 text-sm leading-5 text-slate-400">Review recorded attendance and scheduled shifts across your assigned departments.</p></div><Link href="/dm/attendance" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-700 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]">Open full attendance <ArrowRight size={14}/></Link></div>
        <div className="p-3 sm:p-5"><AttendanceCalendarView audience="department-manager" actorEmployeeId={auth.user.employeeId} /></div>
      </section>
      <section className={`${PANEL} mb-5 overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-slate-800/80 bg-gradient-to-r from-sky-500/[0.07] via-[#131a24] to-indigo-500/[0.045] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-sky-200"><Workflow size={22} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-sky-300">Your operational focus</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{overview ? dateTitle(workDate, timeZone) : "Your team's day"}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">{overview?.departments.length ? `${overview.departments.length} assigned department${overview.departments.length === 1 ? "" : "s"} · Organization time zone: ${timeZone}` : "Data and decisions within your permitted team scope."}</p>
            </div>
          </div>
          <Link href="/dm/reviews" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60">
            Open review queue <ArrowRight size={15} />
          </Link>
        </div>
        <div className="grid gap-px bg-slate-800/80 sm:grid-cols-2">
          <div className="bg-[#111821] p-4 sm:p-5"><p className="text-xs text-slate-500">Scheduled today</p><p className="mt-2 text-2xl font-bold tabular-nums text-white">{calendarError ? "—" : loading ? "…" : numberLabel(scheduledToday)}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Calendar records with an assigned shift</p></div>
          <div className="bg-[#111821] p-4 sm:p-5"><p className="text-xs text-slate-500">Attendance recorded</p><p className="mt-2 text-2xl font-bold tabular-nums text-white">{calendarError ? "—" : loading ? "…" : numberLabel(recordedToday)}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Employees with one or more recorded events today</p></div>
        </div>
        {calendarError && <div role="alert" className="border-t border-rose-500/20 bg-rose-500/[0.05] px-5 py-3 text-sm text-rose-200">Team activity could not be loaded: {calendarError}</div>}
        {calendarHasMore && <div className="border-t border-amber-500/20 bg-amber-500/[0.04] px-5 py-3 text-xs leading-5 text-amber-100">The calendar response is capped by the server. The activity preview may not include every team record; open Team Schedule for a date-scoped review.</div>}
      </section>

      {noAssignedDepartments && <section className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300"><AlertCircle size={19} /></span><div><h2 className="text-base font-semibold text-amber-100">No department assigned yet</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/75">Your session is verified, but no departments are assigned to your account. Ask your HR Manager or Organization Admin to establish the assignment. The command center will show your authorized team once it exists.</p></div></div>
      </section>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard label="Team members" value={countsAvailable ? numberLabel(overview?.team.total) : loading ? "…" : "—"} detail="Records in assigned department scope" icon={Users} tone="sky" href="/dm/team" />
        <StatCard label="Active employees" value={countsAvailable ? numberLabel(overview?.team.active) : "—"} detail="Employment status, not live attendance" icon={CheckCircle2} tone="emerald" href="/dm/team" />
        <StatCard label="Inactive employees" value={countsAvailable ? numberLabel(overview?.team.inactive) : "—"} detail="Inactive employment records" icon={Activity} tone="amber" href="/dm/team" />
        <StatCard label="Assigned departments" value={countsAvailable ? numberLabel(overview?.departments.length) : "—"} detail="Scope currently linked to your manager account" icon={Building2} tone="indigo" href="/dm/dashboard#assigned-departments" />
      </div>

      <section className={`${PANEL} mb-6 p-5 sm:p-6`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">Decision queue</p><h2 className="mt-1 text-lg font-semibold text-white">Needs your attention</h2><p className="mt-1 text-sm leading-6 text-slate-500">Pending actions exclude your own items, which you cannot review yourself.</p></div>
          <Link href="/dm/reviews" className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-sky-300 transition hover:text-sky-200">View queue <ArrowRight size={15} /></Link>
        </div>
        {overviewError ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-4 text-sm text-rose-200">Review counts are unavailable because the command-center summary failed to load.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <ReviewTile label="Attendance corrections" value={overview?.reviewCounts.corrections} detail="Waiting for a decision" icon={FileClock} />
          <ReviewTile label="Overtime requests" value={overview?.reviewCounts.overtime} detail="Pending decision" icon={Timer} />
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-[#0e141c]/70 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2"><BellRing size={15} className="shrink-0 text-slate-500" /><p className="text-xs text-slate-400">{overview ? `${numberLabel(overview.reviewCounts.corrections + overview.reviewCounts.overtime)} actionable item count${(overview.reviewCounts.corrections + overview.reviewCounts.overtime) === 1 ? "" : "s"} across the review categories` : "Review totals unavailable until the summary loads."}</p></div>
          <span className="text-[10px] text-slate-600">A record may relate to more than one operational concern.</span>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[1.3fr_0.7fr]">
        <section className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-col justify-between gap-3 border-b border-slate-800/80 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div><h2 className="text-base font-semibold text-white">Today's recorded activity</h2><p className="mt-1 text-xs leading-5 text-slate-500">Only dates with a schedule or event appear. No activity record does not prove absence.</p></div>
            <Link href="/dm/attendance" className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:text-white">Open attendance <ArrowRight size={13} /></Link>
          </div>
          {loading && !overview && !calendarEntries.length ? <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-800/60 p-3"><div className="size-10 rounded-xl bg-slate-800" /><div className="flex-1 space-y-2"><div className="h-3 w-40 rounded bg-slate-800" /><div className="h-2.5 w-56 max-w-full rounded bg-slate-800/70" /></div></div>)}</div>
            : calendarError ? <div className="px-6 py-12 text-center"><AlertCircle size={23} className="mx-auto text-rose-300" /><p className="mt-3 text-sm font-semibold text-slate-200">Activity records unavailable</p><p className="mt-1 text-xs leading-5 text-slate-500">Refresh the command center to try again.</p></div>
            : todayEntries.length === 0 ? <div className="px-6 py-12 text-center"><CalendarDays size={24} className="mx-auto text-slate-500" /><p className="mt-3 text-sm font-semibold text-slate-200">No activity entries returned for today</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">This calendar endpoint returns days with a schedule or attendance event. Check Team Schedule and your review queue for other context.</p></div>
            : <div className="divide-y divide-slate-800/70">
              {todayEntries.slice(0, 7).map((entry) => {
                const name = calendarName(entry);
                const current = currentStatus(entry);
                return <article key={`${entry.employeeId}-${entry.workDate}`} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex min-w-0 items-start gap-3"><EmployeeProfilePhoto employeeId={entry.employeeId === currentEmployeeId ? undefined : entry.employeeId} name={name} className="size-10 rounded-xl border border-slate-700 bg-slate-800/80" textClassName="text-xs font-bold text-slate-300" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{entry.employeeCode || "No employee code"}{entry.departmentName ? ` · ${entry.departmentName}` : ""}</p><p className="mt-1.5 text-xs text-slate-400">{entry.scheduleName ? `${entry.scheduleName} · ${safeDate(entry.expectedStart, entry.timeZone ?? undefined)}–${safeDate(entry.expectedEnd, entry.timeZone ?? undefined)}` : "No schedule associated with this entry"}</p><p className="mt-1 text-[11px] text-slate-500">{current.detail}</p></div></div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${current.tone}`}>{current.label}</span></div>
                </article>;
              })}
              {todayEntries.length > 7 && <div className="border-t border-slate-800/70 p-4 text-center"><Link href="/dm/schedule" className="text-xs font-semibold text-sky-300 hover:text-sky-200">View all {todayEntries.length} returned activity entries <ArrowRight size={13} className="inline" /></Link></div>}
            </div>}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section className={`${PANEL} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4"><div><h2 className="text-base font-semibold text-white">Upcoming team schedule</h2><p className="mt-1 text-xs text-slate-500">The next scheduled employee-days returned for the next seven days</p></div><CalendarDays size={18} className="text-sky-300" /></div>
            {calendarError ? <div role="alert" className="p-4 text-xs leading-5 text-rose-200">Upcoming assignments could not be loaded.</div> : upcomingEntries.length === 0 ? <div className="p-5"><p className="text-sm text-slate-300">No upcoming shift records returned</p><p className="mt-1 text-xs leading-5 text-slate-500">The calendar may not include every date without a schedule or attendance event. Open Team Schedule to review a wider range.</p></div> : <div className="divide-y divide-slate-800/70">{upcomingEntries.slice(0, 5).map((entry) => { const name = calendarName(entry); return <div key={`${entry.employeeId}-${entry.workDate}`} className="flex items-start gap-3 px-5 py-3.5"><EmployeeProfilePhoto employeeId={entry.employeeId === currentEmployeeId ? undefined : entry.employeeId} name={name} className="size-9 rounded-xl border border-slate-700 bg-slate-800/80" textClassName="text-[10px] font-bold text-slate-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-200">{name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{entry.scheduleName}{entry.departmentName ? ` · ${entry.departmentName}` : ""}</p><p className="mt-1 text-xs text-slate-400">{dateTitle(entry.workDate, entry.timeZone || timeZone)} · {safeTime(entry.expectedStart, entry.timeZone || undefined)}</p></div><ChevronRight size={15} className="mt-1 shrink-0 text-slate-600" /></div>; })}</div>}
            <Link href="/dm/schedule" className="flex items-center justify-between gap-2 border-t border-slate-800/80 px-5 py-3.5 text-xs font-semibold text-sky-300 transition hover:bg-white/[0.025] hover:text-sky-200"><span>Open Team Schedule</span><ArrowRight size={14} /></Link>
          </section>

          <section id="assigned-departments" className={`${PANEL} scroll-mt-28 p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-white">My departments</h2><p className="mt-1 text-xs leading-5 text-slate-500">Department assignments and scoped workforce counts.</p></div><Building2 size={19} className="shrink-0 text-indigo-300" /></div>
            {overviewError ? <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs leading-5 text-rose-200">Department data unavailable.</p> : !overview ? <p className="mt-4 text-sm text-slate-500">Loading department assignments…</p> : overview.departments.length === 0 ? <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs leading-5 text-slate-500">No assigned departments were returned for this account.</p> : <div className="mt-4 space-y-3">
              {overview.departments.map((department) => <Link key={department.id} href="/dm/team" className="block rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 transition hover:border-slate-700 hover:bg-white/[0.025] focus:outline-none focus:ring-2 focus:ring-sky-400/50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{department.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{department.description || "Department workspace"}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${(department.status ?? "").toUpperCase() === "ACTIVE" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-400"}`}>{department.status || "Unknown"}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-lg bg-black/15 p-2.5"><p className="text-[10px] text-slate-500">Team</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-200">{numberLabel(department.employeeCount)}</p></div><div className="rounded-lg bg-black/15 p-2.5"><p className="text-[10px] text-slate-500">Active</p><p className="mt-1 text-sm font-semibold tabular-nums text-emerald-200">{numberLabel(department.activeEmployeeCount)}</p></div><div className="rounded-lg bg-black/15 p-2.5"><p className="text-[10px] text-slate-500">Inactive</p><p className="mt-1 text-sm font-semibold tabular-nums text-amber-200">{numberLabel(department.inactiveEmployeeCount)}</p></div></div></Link>)}
            </div>}
          </section>

          <section className={`${PANEL} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4"><div><h2 className="text-base font-semibold text-white">Recent team members</h2><p className="mt-1 text-xs text-slate-500">Latest created employee records</p></div><Users size={18} className="text-sky-300" /></div>
            {employeeError ? <p role="alert" className="p-4 text-xs leading-5 text-rose-200">{employeeError}</p> : employees.length === 0 ? <p className="p-5 text-sm text-slate-500">{loading ? "Loading team members…" : "No recent team records were returned."}</p> : <div className="divide-y divide-slate-800/70">{employees.slice(0, 5).map((employee) => { const name = employeeName(employee); return <Link href="/dm/team" key={employee.id} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.025]"><EmployeeProfilePhoto employeeId={employee.id === currentEmployeeId ? undefined : employee.id} name={name} className="size-9 rounded-xl border border-slate-700 bg-slate-800/80" textClassName="text-[11px] font-bold text-slate-300" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-200">{name}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{employee.designation || employee.department_name || employee.employee_code}</span></span><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClasses(employee.employment_status)}`}>{statusLabel(employee.employment_status)}</span></Link>; })}</div>}
            <Link href="/dm/team" className="flex items-center justify-between gap-2 border-t border-slate-800/80 px-5 py-3.5 text-xs font-semibold text-sky-300 transition hover:bg-white/[0.025] hover:text-sky-200"><span>Open full team directory</span><ArrowRight size={14} /></Link>
          </section>

          <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-[#151e2b] to-[#121821] p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-300"><ShieldCheck size={18} /></span><div><h2 className="text-sm font-semibold text-slate-200">Scope and data confidence</h2><p className="mt-1 text-xs leading-5 text-slate-500">The backend derives your department scope from your authenticated account. Scheduled work, recorded attendance and review decisions remain separate sources of truth.</p><Link href="/dm/schedule" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200">Review team schedule <ArrowRight size={13} /></Link></div></div></section>
        </div>
      </div>

    </DepartmentManagerShell>
  );
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}
