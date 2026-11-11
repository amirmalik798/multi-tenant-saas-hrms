"use client";

import AttendanceAlerts from "../../components/notifications/AttendanceAlerts";
import AttendanceCalendarView from "../../components/attendance/AttendanceCalendarView";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileBarChart,
  FileClock,
  Mail,
  ShieldCheck,
  Users,
  UserRoundPlus,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
  useHRManagerAutoRefresh,
} from "../../components/hr/HRManagerChrome";

type HRStats = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  formerEmployees: number;
  unassignedEmployees: number;
  activeUnassignedEmployees: number;
  hrManagerProfiles: number;
  departmentManagerProfiles: number;
  totalDepartments: number;
  activeDepartments: number;
  inactiveDepartments: number;
  departmentsWithoutManager: number;
  pendingInvitations: number;
  expiredInvitations: number;
  acceptedInvitations: number;
  revokedInvitations: number;
  pendingCorrections: number;
  pendingOvertime: number;
  clockInsRecordedToday: number;
  clockOutsRecordedToday: number;
};

type HRDepartment = {
  id: string;
  name: string;
  status: string;
  manager_id: string | null;
  manager_name: string | null;
  total_employee_count: number;
  active_employee_count: number;
  inactive_employee_count: number;
  former_employee_count: number;
  manager_needs_attention: boolean;
};

type HREmployee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  designation: string | null;
  employment_status: string;
  created_at: string;
  department_id: string | null;
  department_name: string | null;
  workforce_role: string | null;
};

type HRActivity = {
  id: string;
  eventType: string;
  effectiveAt: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string | null;
  departmentName: string | null;
};

type HROverview = {
  status: string;
  generatedAt: string;
  organization: {
    id: string;
    name: string;
    status: string;
    timeZone: string;
    weekStartsOn: number;
  };
  stats: HRStats;
  workDate: string | null;
  recentEmployees: HREmployee[];
  departments: HRDepartment[];
  recentActivity: HRActivity[];
};

type OverviewResponse = { status?: string; message?: string } & Partial<HROverview>;
type LeaveRequest = { id: string; status: string; startDate: string; endDate: string; leaveType: string; firstName?: string | null; lastName?: string | null; employeeCode?: string | null; departmentName?: string | null };
type PublicHoliday = { id: string; holidayDate: string; name: string; isPaid: boolean };
type SalaryPayment = { employeeId: string; status: "PAID" | "UNPAID" | "NO_RECORDED_HOURS" | "RATE_REQUIRED" | "CURRENCY_MISMATCH"; calculatedAmount?: string | number | null; currencyCode?: string | null };

type AuxiliaryState = {
  leaveRequests: LeaveRequest[] | null;
  holidays: PublicHoliday[] | null;
  payments: SalaryPayment[] | null;
};

const numberFormat = new Intl.NumberFormat();
const PANEL = "rounded-2xl border border-[#344357]/80 bg-[#192333] shadow-lg shadow-black/10";
const SUBTLE = "text-xs font-medium text-[#9AA8BA]";

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

async function fetchPayload<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store" });
  const payload = await readJson<T & { message?: string }>(response);
  if (!response.ok || payload === null) {
    throw new Error((payload as { message?: string } | null)?.message || `Request failed (${response.status})`);
  }
  return payload as T;
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? numberFormat.format(value) : "—";
}

function employeeName(employee: Pick<HREmployee, "first_name" | "last_name" | "employee_code">): string {
  return `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || employee.employee_code || "Unnamed employee";
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "HR";
}

function currentDateInTimeZone(timeZone?: string): string {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(now);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to the browser's local date if organization timezone data is invalid.
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDateOnly ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric", month: "short", year: "numeric",
      ...(isDateOnly ? { timeZone: "UTC" } : timeZone ? { timeZone } : {}),
    }).format(date);
  } catch { return date.toLocaleDateString("en-US"); }
}

function formatDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch { return date.toLocaleString("en-US", { hour12: true }); }
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventSummary(value: string): string {
  const labels: Record<string, string> = {
    PROFILE_CREATED: "Employee profile created", PROFILE_UPDATED: "Employee profile updated",
    DEPARTMENT_CHANGED: "Department assignment changed", MANAGER_CHANGED: "Reporting manager changed",
    DEACTIVATED: "Employee deactivated", REACTIVATED: "Employee reactivated", REHIRED: "Employee rehired",
    INVITATION_CREATED: "Invitation created", INVITATION_ACCEPTED: "Invitation accepted", INVITATION_REVOKED: "Invitation revoked",
  };
  return labels[value] || humanize(value);
}

function SectionHeading({ eyebrow, title, description, href, linkLabel }: { eyebrow?: string; title: string; description?: string; href?: string; linkLabel?: string }) {
  return <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div>{eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">{eyebrow}</p>}<h2 className="mt-1 text-lg font-bold tracking-tight text-white">{title}</h2>{description && <p className="mt-1 text-sm leading-5 text-[#9AA8BA]">{description}</p>}</div>{href && <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-blue-300 hover:text-blue-200">{linkLabel || "View all"}<ArrowRight size={14} /></Link>}</div>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = "blue", href }: { label: string; value: number | undefined; detail: string; icon: typeof Users; tone?: "blue" | "green" | "amber" | "violet"; href?: string }) {
  const tones = {
    blue: "border-blue-400/15 bg-blue-400/[0.07] text-blue-200",
    green: "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-200",
    amber: "border-amber-400/15 bg-amber-400/[0.07] text-amber-200",
    violet: "border-violet-400/15 bg-violet-400/[0.07] text-violet-200",
  };
  const content = <><div className="flex items-start justify-between gap-3"><span className={`flex size-10 items-center justify-center rounded-xl border ${tones[tone]}`}><Icon size={18} /></span>{href && <ArrowRight size={15} className="mt-1 text-[#71839A] transition group-hover:translate-x-0.5 group-hover:text-blue-300" />}</div><p className="mt-4 text-xs font-medium text-[#9AA8BA]">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{formatNumber(value)}</p><p className="mt-2 text-xs leading-5 text-[#9AA8BA]">{detail}</p></>;
  return href ? <Link href={href} className={`${PANEL} group block min-w-0 p-4 transition hover:-translate-y-0.5 hover:border-[#53647A] sm:p-5`}>{content}</Link> : <div className={`${PANEL} min-w-0 p-4 sm:p-5`}>{content}</div>;
}

function WorkflowCard({ title, description, detail, href, icon: Icon, tone = "blue" }: { title: string; description: string; detail: string; href: string; icon: typeof Users; tone?: "blue" | "green" | "amber" | "violet" }) {
  const tones = { blue: "bg-blue-400/10 text-blue-200 ring-blue-400/15", green: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/15", amber: "bg-amber-400/10 text-amber-200 ring-amber-400/15", violet: "bg-violet-400/10 text-violet-200 ring-violet-400/15" };
  return <Link href={href} className="group flex min-h-[138px] flex-col rounded-2xl border border-[#344357]/80 bg-[#151C28]/90 p-4 transition hover:-translate-y-0.5 hover:border-[#53647A] hover:bg-[#192333] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><div className="flex items-start justify-between gap-3"><span className={`flex size-10 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}><Icon size={19} /></span><ArrowRight size={16} className="mt-1 text-[#71839A] transition group-hover:translate-x-0.5 group-hover:text-blue-300" /></div><p className="mt-4 text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-[#9AA8BA]">{description}</p><p className="mt-3 text-[11px] font-semibold text-[#C5D0DE]">{detail}</p></Link>;
}

function AttentionCard({ title, count, detail, href, icon: Icon, tone = "amber", unavailable = false }: { title: string; count: number | null; detail: string; href: string; icon: typeof Clock3; tone?: "amber" | "rose" | "blue" | "green"; unavailable?: boolean }) {
  const tones = { amber: "text-amber-200 bg-amber-400/10", rose: "text-rose-200 bg-rose-400/10", blue: "text-blue-200 bg-blue-400/10", green: "text-emerald-200 bg-emerald-400/10" };
  return <Link href={href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#344357]/70 bg-[#111827]/60 p-3.5 transition hover:border-[#53647A] hover:bg-[#151C28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{title}</span><span className="mt-1 block text-xs leading-5 text-[#9AA8BA]">{detail}</span></span><span className="shrink-0 text-xl font-bold tabular-nums text-white">{unavailable ? "—" : formatNumber(count ?? undefined)}</span><ChevronRight size={14} className="shrink-0 text-[#71839A] transition group-hover:translate-x-0.5" /></Link>;
}

export default function HRManagerDashboardPage() {
  const auth = useHRManagerSession();
  const [overview, setOverview] = useState<HROverview | null>(null);
  const [auxiliary, setAuxiliary] = useState<AuxiliaryState>({ leaveRequests: null, holidays: null, payments: null });
  const [loading, setLoading] = useState(false);
  const [auxiliaryLoading, setAuxiliaryLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [auxiliaryError, setAuxiliaryError] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const loadRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    if (!auth.user) return;
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setAuxiliaryLoading(true);
    setLoadError("");
    setAuxiliaryError(false);
    try {
      const data = await fetchPayload<OverviewResponse>("/api/backend/hr-manager/overview");
      if (requestId !== loadRequestId.current) return;
      if (data.status !== "ok" || !data.stats || !data.organization) throw new Error(data.message || "Unable to load the HR overview.");
      const snapshot = data as HROverview;
      setOverview(snapshot);
      setLoading(false);

      const month = (snapshot.workDate || currentDateInTimeZone(snapshot.organization.timeZone)).slice(0, 7);
      const results = await Promise.allSettled([
        fetchPayload<{ requests?: LeaveRequest[] }>("/api/backend/leave/requests"),
        fetchPayload<{ holidays?: PublicHoliday[] }>("/api/backend/leave/holidays"),
        fetchPayload<{ payments?: SalaryPayment[] }>(`/api/backend/payroll/payments?month=${encodeURIComponent(month)}`),
      ]);
      if (requestId !== loadRequestId.current) return;
      const next: AuxiliaryState = { leaveRequests: null, holidays: null, payments: null };
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const payload = result.value as { requests?: LeaveRequest[]; holidays?: PublicHoliday[]; payments?: SalaryPayment[] };
        if (index === 0) next.leaveRequests = Array.isArray(payload.requests) ? payload.requests : [];
        if (index === 1) next.holidays = Array.isArray(payload.holidays) ? payload.holidays : [];
        if (index === 2) next.payments = Array.isArray(payload.payments) ? payload.payments : [];
      });
      setAuxiliary(next);
      setAuxiliaryError(results.some((result) => result.status === "rejected"));
    } catch (error) {
      if (requestId === loadRequestId.current) {
        setLoadError(error instanceof Error ? error.message : "Unable to load the HR overview.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
        setAuxiliaryLoading(false);
      }
    }
  }, [auth.user]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  useHRManagerAutoRefresh(loadOverview, {
    enabled: Boolean(auth.user),
    shouldRefresh: () => !loading && !auxiliaryLoading,
  });

  const stats = overview?.stats;
  const timeZone = overview?.organization.timeZone;
  const workDate = overview?.workDate || currentDateInTimeZone(timeZone);
  const workDateLabel = formatDate(workDate, timeZone);
  const pendingLeaveCount = auxiliary.leaveRequests?.filter((request) => request.status === "PENDING").length ?? null;
  const upcomingHoliday = useMemo(() => {
    if (!auxiliary.holidays) return null;
    return [...auxiliary.holidays].filter((holiday) => holiday.holidayDate >= workDate).sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))[0] ?? null;
  }, [auxiliary.holidays, workDate]);
  const payrollUnpaidCount = auxiliary.payments?.filter((payment) => payment.status === "UNPAID").length ?? null;
  const payrollReviewCount = auxiliary.payments?.filter((payment) => payment.status === "RATE_REQUIRED" || payment.status === "CURRENCY_MISMATCH").length ?? null;
  const payrollNoHoursCount = auxiliary.payments?.filter((payment) => payment.status === "NO_RECORDED_HOURS").length ?? null;
  // The Work queue page contains attendance corrections and overtime requests only.
  // Keep its badge scoped to those same categories; leave and payroll items are listed
  // separately in Needs attention and must not inflate this navigation count.
  const workQueueCount = (stats?.pendingCorrections ?? 0) + (stats?.pendingOvertime ?? 0);
  const workQueueCountReady = Boolean(stats);
  const actionCount = workQueueCount + (pendingLeaveCount ?? 0) + (payrollUnpaidCount ?? 0) + (payrollReviewCount ?? 0);
  const actionCountReady = Boolean(stats && auxiliary.leaveRequests && auxiliary.payments);

  if (auth.checking) return <HRManagerLoading message="Verifying your HR Manager session…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;

  return <HRManagerShell user={auth.user} activePage="dashboard" title="HR operations hub" description="Your daily control center for people, time, leave, and pay." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut} logoutError={auth.error}>
    <div className="hr-manager-dashboard space-y-7">
      <style jsx global>{`
        [data-hr-manager-theme="light"] .hr-manager-dashboard {
          color: #172033;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-white,
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-\\[\\#F8FAFC\\],
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-\\[\\#E8EEF5\\] {
          color: #172033 !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-\\[\\#C5D0DE\\] {
          color: #475569 !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-\\[\\#9AA8BA\\],
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-\\[\\#8A9AAF\\],
        [data-hr-manager-theme="light"] .hr-manager-dashboard .text-\\[\\#71839A\\] {
          color: #64748b !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="bg-[#192333]"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="bg-[#151C28]"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="bg-[#111827]"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="bg-[#111a27]"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="bg-[#0B0F17]"] {
          background-color: #ffffff !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="border-[#344357]"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="border-[#3A4A60]"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="border-[#46607B]"] {
          border-color: #d7dfeb !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-blue-200"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-blue-300"] {
          color: #1d4ed8 !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-emerald-200"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-emerald-300"] {
          color: #047857 !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-amber-200"] {
          color: #92400e !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-violet-200"] {
          color: #6d28d9 !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-rose-100"],
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="text-rose-200"] {
          color: #be123c !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard [class*="bg-gradient-to-br"] {
          background-image: linear-gradient(135deg, #eff6ff, #ffffff 58%, #f1f5f9) !important;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard svg[class*="lucide-calendar"] {
          color: #1d4ed8 !important;
          stroke: currentColor;
        }
        [data-hr-manager-theme="light"] .hr-manager-dashboard a:focus-visible,
        [data-hr-manager-theme="light"] .hr-manager-dashboard button:focus-visible {
          outline-color: #2563eb;
        }
      `}</style>
      <section className="relative overflow-hidden rounded-2xl border border-[#344357] bg-gradient-to-br from-[#24354A] via-[#151C28] to-[#111827] p-4 shadow-lg shadow-black/15 sm:p-5">
        <div className="pointer-events-none absolute -right-12 -top-16 size-64 rounded-full bg-blue-500/[0.08] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0"><div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-200"><ShieldCheck size={12} /> Daily operations · {workDateLabel}</div><h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Your people, time and pay at a glance.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#C5D0DE]">Focus on today’s attendance, leave decisions and payroll items that need action.</p><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[#C5D0DE]"><span className="inline-flex items-center gap-1.5"><Building2 size={14} className="text-blue-300" />{overview?.organization.name || auth.user.organizationName}</span>{timeZone && <span>{timeZone}</span>}<span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-300" />{overview ? "Organization data loaded" : "Loading organization data"}</span></div></div>
          <div className="relative grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><Link href="/hr/employees?create=1" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><UserRoundPlus size={14} /> Add employee</Link><Link href="/hr/work-queue" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#3A4A60] bg-[#0B0F17]/70 px-3 py-2 text-xs font-semibold text-[#F8FAFC] transition hover:border-[#53647A] hover:bg-[#202D40]/80"><CheckCircle2 size={14} /> Work queue{workQueueCountReady ? ` · ${formatNumber(workQueueCount)}` : ""}</Link></div>
        </div>
      </section>

      <section aria-label="Team attendance calendar" className="overflow-hidden rounded-3xl border border-[#344357]/80 bg-[#111a27] p-3 shadow-xl shadow-black/10 sm:p-4">
        <AttendanceCalendarView audience="hr-manager" compact />
      </section>

      <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28]/75 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-200"><Bell size={17} /></span><div><h2 className="text-sm font-bold text-white">Attendance alerts</h2><p className="text-xs text-[#9AA8BA]">Kept out of the way until you need them.</p></div></div><button type="button" aria-expanded={alertsExpanded} onClick={() => setAlertsExpanded((expanded) => !expanded)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#3A4A60] px-3 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{alertsExpanded ? "Hide alerts" : "Show alerts"}<ChevronDown size={14} className={`transition-transform ${alertsExpanded ? "rotate-180" : ""}`} /></button></div>
        <div className={alertsExpanded ? "mt-4 block" : "hidden"}><AttendanceAlerts /></div>
      </section>

      {loadError && <section role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" /><div><p className="text-sm font-semibold text-rose-100">Overview data is unavailable</p><p className="mt-1 text-sm text-rose-200/80">{loadError}</p></div></div></section>}
      {auxiliaryError && <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-xs leading-5 text-amber-100">Some leave, holiday, or payroll summaries could not be loaded. They will be retried automatically.</p>}

      <section>
        <SectionHeading eyebrow="Your day at a glance" title="Start with the essentials" href="/hr/reports" linkLabel="Daily report" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active employees" value={stats?.activeEmployees} detail={`${formatNumber(stats?.totalEmployees)} total workforce records`} icon={UsersRound} tone="blue" href="/hr/employees" />
          <MetricCard label="Clock-ins today" value={stats?.clockInsRecordedToday} detail={`${formatNumber(stats?.clockOutsRecordedToday)} clock-outs recorded`} icon={CalendarClock} tone="green" href="/hr/modules/attendance" />
          <MetricCard label="Pending leave" value={pendingLeaveCount ?? undefined} detail={auxiliary.leaveRequests ? "Requests awaiting a decision" : auxiliaryLoading ? "Loading leave requests…" : "Leave summary unavailable"} icon={CalendarDays} tone="amber" href="/hr/modules/leave" />
          <MetricCard label="Salary payments unpaid" value={payrollUnpaidCount ?? undefined} detail={auxiliary.payments ? `Pay setup issues: ${formatNumber(payrollReviewCount ?? 0)}` : auxiliaryLoading ? "Loading salary records…" : "Payroll summary unavailable"} icon={Wallet} tone="violet" href="/hr/modules/payroll" />
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="One place for daily work" title="Your core HR workflows" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WorkflowCard title="Employees" description="Profiles, status, assignments, and onboarding." detail={`${formatNumber(stats?.activeEmployees)} active · ${formatNumber(stats?.unassignedEmployees)} unassigned`} href="/hr/employees" icon={Users} tone="blue" />
          <WorkflowCard title="Attendance & schedules" description="Daily clock events, worked hours, shifts, corrections, and overtime." detail={`${formatNumber(stats?.pendingCorrections)} corrections · ${formatNumber(stats?.pendingOvertime)} overtime requests`} href="/hr/modules/attendance" icon={Clock3} tone="green" />
          <WorkflowCard title="Leave & public holidays" description="Review time-off requests and manage the organization holiday calendar." detail={pendingLeaveCount === null ? (auxiliaryLoading ? "Loading request status…" : "Request summary unavailable") : `${formatNumber(pendingLeaveCount)} requests awaiting review`} href="/hr/modules/leave" icon={CalendarDays} tone="amber" />
          <WorkflowCard title="Salary & pay rates" description="Track monthly payment status, missing rates, and calculation issues." detail={auxiliary.payments ? `${formatNumber(payrollUnpaidCount)} unpaid · ${formatNumber(payrollReviewCount)} need rate review` : auxiliaryLoading ? "Loading payroll status…" : "Payroll summary unavailable"} href="/hr/modules/payroll" icon={Wallet} tone="violet" />
        </div>
      </section>

      <section className={`${PANEL} overflow-hidden`}>
        <div className="flex flex-col gap-2 border-b border-[#344357]/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">Needs attention</p><h2 className="mt-1 text-base font-bold text-white">Resolve the items that can block work</h2></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#3A4A60] bg-[#111827] px-3 py-1.5 text-xs font-semibold text-[#E8EEF5]"><AlertTriangle size={13} className="text-amber-200" />{actionCountReady ? formatNumber(actionCount) : "—"} open items identified</span></div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
          <AttentionCard title="Leave requests" count={pendingLeaveCount} detail="Pending manager decision" href="/hr/modules/leave" icon={CalendarDays} tone="amber" unavailable={pendingLeaveCount === null} />
          <AttentionCard title="Attendance corrections" count={stats?.pendingCorrections ?? null} detail="Review proposed punch changes" href="/hr/modules/attendance?section=corrections" icon={FileClock} tone="blue" unavailable={stats === undefined} />
          <AttentionCard title="Overtime requests" count={stats?.pendingOvertime ?? null} detail="Approve advance overtime requests" href="/hr/modules/attendance?section=overtime" icon={Clock3} tone="amber" unavailable={stats === undefined} />
          <AttentionCard title="Unpaid salary records" count={payrollUnpaidCount} detail="Payments not marked paid for this month" href="/hr/modules/payroll" icon={Wallet} tone="rose" unavailable={payrollUnpaidCount === null} />
          <AttentionCard title="Pay calculation issues" count={payrollReviewCount} detail="Missing rate or currency mismatch" href="/hr/modules/pay-rates" icon={AlertTriangle} tone="rose" unavailable={payrollReviewCount === null} />
          <AttentionCard title="Invitations to follow up" count={stats ? stats.pendingInvitations + stats.expiredInvitations : null} detail={`${formatNumber(stats?.pendingInvitations)} pending · ${formatNumber(stats?.expiredInvitations)} expired`} href="/hr/invitations" icon={Mail} tone="blue" unavailable={stats === undefined} />
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className={`${PANEL} min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-[#344357]/80 px-4 py-4 sm:px-5"><div><h2 className="text-base font-bold text-white">Upcoming public holiday</h2></div><CalendarDays size={18} className="text-blue-300" /></div>
          {auxiliary.holidays === null ? <div className="p-5 text-sm text-[#9AA8BA]">{auxiliaryLoading ? "Loading holiday calendar…" : "Holiday calendar unavailable."}</div> : upcomingHoliday ? <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/[0.07] text-blue-200"><span className="text-[10px] font-bold uppercase">{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${upcomingHoliday.holidayDate}T12:00:00Z`))}</span><span className="text-xl font-bold">{new Date(`${upcomingHoliday.holidayDate}T12:00:00Z`).getUTCDate()}</span></span><div className="min-w-0 flex-1"><p className="font-semibold text-white">{upcomingHoliday.name}</p><p className="mt-1 text-sm text-[#C5D0DE]">{formatDate(upcomingHoliday.holidayDate, timeZone)} · {upcomingHoliday.isPaid ? "Paid holiday" : "Unpaid holiday"}</p></div><Link href="/hr/modules/leave" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-blue-200">Manage calendar <ArrowRight size={13} /></Link></div> : <div className="p-5"><p className="text-sm font-semibold text-white">No upcoming public holidays</p><p className="mt-1 text-xs text-[#9AA8BA]">Add upcoming dates to help teams plan their work.</p><Link href="/hr/modules/leave" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300">Open holiday calendar <ArrowRight size={13} /></Link></div>}
        </div>
        <div className={`${PANEL} min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-[#344357]/80 px-4 py-4 sm:px-5"><div><h2 className="text-base font-bold text-white">Access & organization setup</h2></div><Building2 size={18} className="text-blue-300" /></div>
          <div className="grid grid-cols-2 gap-px bg-[#344357]/60"><Link href="/hr/invitations" className="bg-[#192333] p-4 transition hover:bg-[#202D40]"><p className="text-xs text-[#9AA8BA]">Pending invitations</p><p className="mt-1 text-2xl font-bold text-white">{formatNumber(stats?.pendingInvitations)}</p><p className="mt-1 text-[11px] text-[#9AA8BA]">Not yet accepted</p></Link><Link href="/hr/departments" className="bg-[#192333] p-4 transition hover:bg-[#202D40]"><p className="text-xs text-[#9AA8BA]">Departments needing manager review</p><p className="mt-1 text-2xl font-bold text-white">{formatNumber(overview?.departments.filter((department) => department.manager_needs_attention).length)}</p><p className="mt-1 text-[11px] text-[#9AA8BA]">Among departments shown</p></Link></div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><span className="text-xs text-[#9AA8BA]">{formatNumber(stats?.unassignedEmployees)} employees without a department</span><Link href="/hr/departments" className="shrink-0 text-xs font-semibold text-blue-300 hover:text-blue-200">Review setup <ArrowRight className="ml-1 inline" size={12} /></Link></div>
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <div className={`${PANEL} hr-dashboard-recent-employees min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-[#344357]/80 px-4 py-4 sm:px-5"><div><h2 className="text-base font-bold text-white">Recently added employees</h2></div><Users size={18} className="text-blue-300" /></div>
          {!overview ? <div className="p-5 text-sm text-[#9AA8BA]">{loading ? "Loading employees…" : "Employee information is unavailable."}</div> : overview.recentEmployees.length === 0 ? <div className="p-6"><p className="text-sm font-semibold text-white">No employee records yet</p><p className="mt-1 text-xs text-[#9AA8BA]">Add the first employee to begin building the workforce.</p><Link href="/hr/employees?create=1" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-300">Add employee <ArrowRight size={13} /></Link></div> : <div className="divide-y divide-slate-800/70">{overview.recentEmployees.slice(0, 5).map((employee) => { const name = employeeName(employee); return <Link href={`/hr/employees?employee=${encodeURIComponent(employee.id)}`} key={employee.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.025] sm:px-5"><EmployeeProfilePhoto employeeId={employee.id} name={name} className="size-9 rounded-xl border border-[#3A4A60] bg-[#202D40]/60" textClassName="text-[11px] font-bold text-blue-200" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{name}</span><span className="mt-1 block truncate text-xs text-[#9AA8BA]">{employee.designation || humanize(employee.workforce_role || "Employee")} · {employee.department_name || "Unassigned department"}</span></span><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${employee.employment_status === "ACTIVE" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300" : employee.employment_status === "INACTIVE" ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-200" : "border-[#3A4A60] bg-[#202D40]/60 text-[#C5D0DE]"}`}>{humanize(employee.employment_status)}</span><ChevronRight size={14} className="shrink-0 text-[#8A9AAF]" /></Link>; })}</div>}
          <div className="border-t border-[#344357]/80 px-4 py-3 sm:px-5"><Link href="/hr/employees" className="text-xs font-semibold text-blue-300 hover:text-blue-200">Open employee directory <ArrowRight size={13} className="ml-1 inline" /></Link></div>
        </div>
        <div className={`${PANEL} hr-dashboard-recent-activity min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-[#344357]/80 px-4 py-4 sm:px-5"><div><h2 className="text-base font-bold text-white">Recent people activity</h2></div><Activity size={18} className="text-blue-300" /></div>
          {!overview ? <div className="p-5 text-sm text-[#9AA8BA]">{loading ? "Loading activity…" : "Activity data is unavailable."}</div> : overview.recentActivity.length === 0 ? <div className="p-6"><p className="text-sm font-semibold text-white">No recent activity</p><p className="mt-1 text-xs text-[#9AA8BA]">Employee history events will appear here when available.</p></div> : <div className="divide-y divide-slate-800/70">{overview.recentActivity.slice(0, 6).map((activity) => <div key={activity.id} className="flex items-start gap-3 px-4 py-3 sm:px-5"><EmployeeProfilePhoto employeeId={activity.employeeId} name={activity.employeeName || activity.employeeCode || "Employee"} className="mt-0.5 size-8 rounded-lg border border-blue-400/15 bg-blue-500/10" textClassName="text-[10px] font-bold text-blue-200" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">{eventSummary(activity.eventType)}</p><p className="mt-1 truncate text-xs text-[#C5D0DE]">{activity.employeeName || activity.employeeCode}{activity.departmentName ? ` · ${activity.departmentName}` : ""}</p><p className="mt-1 text-[11px] text-[#8A9AAF]">{formatDateTime(activity.effectiveAt, timeZone)}</p></div></div>)}</div>}
        </div>
      </section>

      {auxiliary.payments && payrollNoHoursCount !== null && payrollNoHoursCount > 0 && <section className="flex flex-col gap-3 rounded-2xl border border-[#344357]/80 bg-[#111827] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-200"><Wallet size={17} /></span><div><p className="text-sm font-semibold text-white">{formatNumber(payrollNoHoursCount)} salary records have no payable hours</p><p className="mt-1 text-xs leading-5 text-[#9AA8BA]">These records are not counted as unpaid salary. Check attendance, approved paid leave, holiday hours, and effective pay rates where appropriate.</p></div></div><Link href="/hr/modules/payroll" className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-blue-300 hover:text-blue-200">Review payroll <ArrowRight size={14} /></Link></section>}

    </div>
  </HRManagerShell>;
}
