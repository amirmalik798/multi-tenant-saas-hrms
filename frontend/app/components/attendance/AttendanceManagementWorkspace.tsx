"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileClock,
  RefreshCw,
  Timer,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import AttendanceCalendarView from "./AttendanceCalendarView";
import AttendanceMonthlyHoursView from "./AttendanceMonthlyHoursView";
import { formatDateTime } from "../../../lib/attendance-format";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Audience = "department-manager" | "hr-manager";
type Row = Record<string, unknown>;
type Section = "review" | "calendar" | "hours" | "schedules" | "corrections" | "overtime" | "excess-overtime";
type Tab = { id: Section; label: string; icon: LucideIcon };
type ApiResult<T> = { value: T; error: string };

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];
const PANEL = "min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] shadow-lg shadow-black/10";
const INPUT = "mt-1.5 w-full min-w-0 rounded-xl border border-slate-700 bg-[#0b111b] px-3.5 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10";
const PRIMARY = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50";

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(row: Row | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function num(row: Row, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}
function recordId(row: Row): string { return str(row, "id"); }
function isExcludedHrTargetRecord(row: Row): boolean {
  const raw = str(row, "workforce_role", "workforceRole", "roleName", "role_name", "role", "userRole", "user_role");
  const role = raw.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ["ORGANIZATION_ADMIN", "ORG_ADMIN", "ORGANIZATIONADMIN", "ORGANIZATION_ADMINISTRATOR", "ORGANIZATION_OWNER", "ORG_OWNER", "TENANT_ADMIN", "ADMINISTRATOR", "HR_MANAGER", "HRMANAGER"].includes(role) || role.startsWith("ORGANIZATION_ADMIN_") || role.startsWith("ORGANIZATIONADMIN_") || role.startsWith("ORG_ADMIN_") || role.startsWith("ORGANIZATION_OWNER_") || role.startsWith("ORG_OWNER_") || role.startsWith("TENANT_ADMIN_") || role.startsWith("HR_MANAGER_") || role.startsWith("HRMANAGER_");
}
async function listAllActiveEmployees(): Promise<Row[]> {
  const first = await api("/employees?page=1&limit=100&status=ACTIVE&sortBy=name&sortOrder=asc");
  if (!isRecord(first) || !Array.isArray(first.employees)) throw new Error("The employee list response was invalid.");
  const employees = arrayAt(first, "employees");
  const pagination = isRecord(first.pagination) ? first.pagination : {};
  const totalPages = Math.max(1, num(pagination, "totalPages") ?? 1);
  if (totalPages > 10001) throw new Error("The employee list is too large to load safely.");
  const all = [...employees];
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await api(`/employees?page=${page}&limit=100&status=ACTIVE&sortBy=name&sortOrder=asc`);
    if (!isRecord(next) || !Array.isArray(next.employees)) throw new Error("The employee list was incomplete. Try again in a moment.");
    all.push(...(next.employees as unknown[]).filter(isRecord));
  }
  return all;
}
function responseMessage(payload: unknown): string { return isRecord(payload) ? str(payload, "message", "error", "detail") : ""; }
function arrayAt(payload: unknown, key: string): Row[] {
  if (!isRecord(payload)) return Array.isArray(payload) ? payload.filter(isRecord) : [];
  if (Array.isArray(payload[key])) return (payload[key] as unknown[]).filter(isRecord);
  if (isRecord(payload.data) && Array.isArray(payload.data[key])) return (payload.data[key] as unknown[]).filter(isRecord);
  return [];
}
async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responseMessage(payload) || `Request failed with HTTP ${response.status}.`);
  return payload;
}
async function list(path: string, key: string): Promise<ApiResult<Row[]>> {
  try { return { value: arrayAt(await api(path), key), error: "" }; }
  catch (error) { return { value: [], error: error instanceof Error ? error.message : "Unable to load records." }; }
}
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function offsetDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function dateLabel(value: string): string {
  if (!value) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function dateTimeLabel(value: string): string {
  return formatDateTime(value);
}

function humanize(value: string): string {
  return value ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not specified";
}
function status(row: Row): string { return str(row, "status"); }
function statusClass(value: string): string {
  const s = value.toUpperCase();
  if (/APPROVED|RESOLVED|ACTIVE|COMPLETED/.test(s)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (/REJECTED|DISMISSED|FAILED/.test(s)) return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  if (/PENDING|OPEN|SUBMITTED|RETURNED/.test(s)) return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-slate-600 bg-slate-700/30 text-slate-300";
}
function Status({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(value)}`}>{label || humanize(value)}</span>;
}
function excessReviewStatusLabel(value: string): string {
  switch (value.toUpperCase()) {
    case "OPEN": return "Awaiting review";
    case "REVIEWED_NO_PAY": return "Reviewed — no extra pay";
    case "FOLLOW_UP": return "Follow-up requested";
    default: return humanize(value);
  }
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700 bg-black/10 px-5 py-8 text-center"><CalendarDays size={18} className="mx-auto text-slate-500" /><p className="mt-3 text-sm font-semibold text-slate-200">{title}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{detail}</p></div>;
}
function ErrorMessage({ children }: { children: string }) {
  return children ? <div role="alert" className="mb-4 break-words rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm leading-6 text-rose-200">{children}</div> : null;
}
function PersonName(row: Row): string {
  return [str(row, "firstName", "first_name"), str(row, "lastName", "last_name")].filter(Boolean).join(" ") || str(row, "employeeCode", "employee_code") || "Employee";
}
function attendancePhotoEmployeeId(employeeId: string, actorEmployeeId?: string): string | undefined {
  if (!employeeId || employeeId === actorEmployeeId) return undefined;
  return employeeId;
}
function duration(row: Row): string {
  const seconds = num(row, "totalRecordedSeconds");
  if (seconds === null) return "—";
  return `${Math.floor(Math.max(0, seconds) / 3600)}h ${Math.floor((Math.max(0, seconds) % 3600) / 60)}m`;
}

export default function AttendanceManagementWorkspace({ audience, initialSection = "calendar", actorEmployeeId }: { audience: Audience; initialSection?: Section; actorEmployeeId?: string }) {
  const isHr = audience === "hr-manager";
  const tabs: Tab[] = [
    ...(!isHr ? [{ id: "review" as const, label: "Review queue", icon: ClipboardCheck }] : []),
    { id: "calendar", label: "Team schedule calendar", icon: CalendarDays },
    { id: "hours", label: "Monthly hours", icon: Clock3 },
    ...(isHr ? [{ id: "schedules" as const, label: "Schedules & assignments", icon: Clock3 }] : []),
    { id: "corrections", label: "Corrections", icon: FileClock },
    { id: "overtime", label: "Overtime", icon: Timer },
    { id: "excess-overtime", label: "Excess time review", icon: ClipboardCheck },
  ];

  const [activeSection, setActiveSection] = useState<Section>(initialSection);
  const [reviewFilter, setReviewFilter] = useState<"ALL" | "CORRECTIONS" | "OVERTIME">("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Section, string>>>({});

  const [corrections, setCorrections] = useState<Row[]>([]);
  const [overtime, setOvertime] = useState<Row[]>([]);
  const [excessOvertime, setExcessOvertime] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [scheduleStart, setScheduleStart] = useState("08:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [breakMinutes, setBreakMinutes] = useState("60");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignScheduleId, setAssignScheduleId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [correctingAssignmentId, setCorrectingAssignmentId] = useState("");
  const [correctionScheduleId, setCorrectionScheduleId] = useState("");
  const [correctionEffectiveFrom, setCorrectionEffectiveFrom] = useState("");

  useEffect(() => {
    let cancelled = false;
    const initializeDateRange = async () => {
      // The Department Manager overview provides the organization's authoritative work date.
      // HR keeps the existing browser-local behavior because this component is shared with HR Manager.
      let current = localDate(new Date());
      if (audience === "department-manager") {
        try {
          const summary: unknown = await api("/department-manager/overview");
          const workDate = isRecord(summary) ? str(summary, "workDate") : "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(workDate)) current = workDate;
        } catch {
          // Keep the workspace usable when the summary endpoint is temporarily unavailable.
        }
      }
      if (cancelled) return;
      setFromDate(offsetDate(current, audience === "department-manager" ? -16 : -6));
      setToDate(offsetDate(current, 14));
      setEffectiveFrom(current);
    };
    void initializeDateRange();
    return () => { cancelled = true; };
  }, [audience]);

  const reloadAll = useCallback(async (silent = false) => {
    if (!fromDate || !toDate) return;
    if (fromDate > toDate) {
      setErrors((existing) => ({ ...existing, calendar: "The start date must not be after the end date." }));
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [correctionResult, overtimeResult, assignmentResult, excessResult] = await Promise.all([
        list("/attendance/corrections", "requests"),
        list("/attendance/overtime", "requests"),
        list("/schedule-assignments", "assignments"),
        list(`/attendance/excess-overtime?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`, "cases"),
      ]);
      setCorrections(correctionResult.value);
      setOvertime(overtimeResult.value);
      setAssignments(assignmentResult.value);
      setExcessOvertime(excessResult.value);
      const nextErrors: Partial<Record<Section, string>> = {
        corrections: correctionResult.error,
        overtime: overtimeResult.error,
        "excess-overtime": excessResult.error,
        schedules: assignmentResult.error,
      };

      if (isHr) {
        const [scheduleResult, employeeResult] = await Promise.all([
          list("/schedules?includeInactive=true", "schedules"),
          listAllActiveEmployees().then((value) => ({ value, error: "" })).catch((error) => ({ value: [] as Row[], error: error instanceof Error ? error.message : "Unable to load all active employees." })),
        ]);
        setSchedules(scheduleResult.value);
        setEmployees(employeeResult.value.filter((employee) => !isExcludedHrTargetRecord(employee)));
        nextErrors.schedules = [assignmentResult.error, scheduleResult.error, employeeResult.error].filter(Boolean).join(" ");

      } else {
        setSchedules([]);
        setEmployees([]);
      }
      setErrors(nextErrors);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, isHr]);

  useEffect(() => {
    if (fromDate && toDate) void reloadAll();
  }, [fromDate, toDate, refreshTick, reloadAll]);

  useWorkspaceAutoRefresh(() => reloadAll(true), {
    enabled: true,
    intervalMs: 60_000,
    shouldRefresh: () => !loading && Boolean(fromDate && toDate),
  });

  useEffect(() => {
    if (!assignEmployeeId && employees.length) setAssignEmployeeId(recordId(employees[0]));
    if (!assignScheduleId && schedules.some((item) => status(item) === "ACTIVE")) {
      const active = schedules.find((item) => status(item) === "ACTIVE");
      if (active) setAssignScheduleId(recordId(active));
    }
  }, [employees, schedules, assignEmployeeId, assignScheduleId]);

  const isOwnRecord = (row: Row) => Boolean(actorEmployeeId) && str(row, "employeeId", "employee_id") === actorEmployeeId;
  const pendingCorrections = corrections.filter((row) => status(row) === "PENDING");
  const pendingOvertime = overtime.filter((row) => status(row) === "PENDING");
  const actionableCorrections = pendingCorrections.filter((row) => !isOwnRecord(row));
  const actionableOvertime = pendingOvertime.filter((row) => !isOwnRecord(row));
  const pendingCount = actionableCorrections.length + actionableOvertime.length;
  const reviewItems = [
    ...actionableCorrections.map((row) => ({ kind: "CORRECTIONS" as const, row, id: recordId(row), createdAt: str(row, "requestedAt", "createdAt", "created_at", "workDate") })),
    ...actionableOvertime.map((row) => ({ kind: "OVERTIME" as const, row, id: recordId(row), createdAt: str(row, "requestedAt", "createdAt", "created_at", "workDate") })),
  ].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
  });
  const visibleReviewItems = reviewFilter === "ALL" ? reviewItems : reviewItems.filter((item) => item.kind === reviewFilter);

  async function runAction(key: string, path: string, body: Row, successMessage: string) {
    setSaving(key);
    setNotice(null);
    try {
      await api(path, { method: "PATCH", body: JSON.stringify(body) });
      setNotice({ type: "success", message: successMessage });
      setRefreshTick((n) => n + 1);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "The requested action failed." });
    } finally {
      setSaving("");
    }
  }

  async function reviewCorrection(row: Row, decision: "APPROVE" | "REJECT") {
    const id = recordId(row);
    const reviewerNote = (notes[`correction:${id}`] || "").trim();
    if (decision === "REJECT" && !reviewerNote) {
      setNotice({ type: "error", message: "Enter a reviewer note before rejecting a correction." });
      return;
    }
    await runAction(`correction:${id}`, `/attendance/corrections/${encodeURIComponent(id)}`, { decision, reviewerNote: reviewerNote || null }, decision === "APPROVE" ? "Correction approved." : "Correction rejected.");
  }


  async function reviewOvertime(row: Row, decision: "APPROVE" | "REJECT") {
    const id = recordId(row);
    const reviewerNote = (notes[`overtime:${id}`] || "").trim();
    if (decision === "REJECT" && !reviewerNote) {
      setNotice({ type: "error", message: "Enter a reviewer note before rejecting overtime." });
      return;
    }
    await runAction(`overtime:${id}`, `/attendance/overtime/${encodeURIComponent(id)}`, {
      decision,
      ...(decision === "APPROVE" ? { approvedMinutes: num(row, "requestedMinutes") ?? 1 } : {}),
      reviewerNote: reviewerNote || null,
    }, decision === "APPROVE" ? "Overtime request approved." : "Overtime request rejected.");
  }

  async function correctScheduleAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correctingAssignmentId || !correctionScheduleId || !correctionEffectiveFrom) {
      setNotice({ type: "error", message: "Choose a replacement schedule and correction date." });
      return;
    }
    setSaving(`correct-assignment:${correctingAssignmentId}`);
    setNotice(null);
    try {
      await api(`/schedule-assignments/${encodeURIComponent(correctingAssignmentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduleId: correctionScheduleId, effectiveFrom: correctionEffectiveFrom }),
      });
      setNotice({ type: "success", message: "Shift assignment corrected. The previous assignment history was preserved." });
      setCorrectingAssignmentId("");
      setCorrectionScheduleId("");
      setCorrectionEffectiveFrom("");
      setRefreshTick((n) => n + 1);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to correct this shift assignment." });
    } finally {
      setSaving("");
    }
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = scheduleName.trim();
    const description = scheduleDescription.trim();
    const breakValue = Number(breakMinutes);
    if (!name || name.length > 100 || description.length > 500 || selectedDays.length === 0 || !Number.isInteger(breakValue) || breakValue < 0 || breakValue > 1439) {
      setNotice({ type: "error", message: "Provide a schedule name, select at least one weekday, and enter a valid break duration." });
      return;
    }
    const days = selectedDays.map((dayOfWeek) => ({ dayOfWeek, startTime: scheduleStart, endTime: scheduleEnd, breakMinutes: breakValue }));
    setSaving("create-schedule");
    setNotice(null);
    try {
      await api("/schedules", { method: "POST", body: JSON.stringify({ name, description: description || null, status: "ACTIVE", days }) });
      setScheduleName("");
      setScheduleDescription("");
      setNotice({ type: "success", message: "Work schedule created." });
      setRefreshTick((n) => n + 1);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to create the schedule." });
    } finally {
      setSaving("");
    }
  }

  async function assignSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignEmployeeId || !assignScheduleId || !effectiveFrom || (effectiveTo && effectiveTo < effectiveFrom)) {
      setNotice({ type: "error", message: "Choose an employee, an active schedule, and a valid effective date range." });
      return;
    }
    setSaving("assign-schedule");
    setNotice(null);
    try {
      await api("/schedule-assignments", { method: "POST", body: JSON.stringify({ employeeId: assignEmployeeId, scheduleId: assignScheduleId, effectiveFrom, effectiveTo: effectiveTo || null }) });
      setNotice({ type: "success", message: "Schedule assigned to the employee." });
      setEffectiveTo("");
      setRefreshTick((n) => n + 1);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to assign this schedule." });
    } finally {
      setSaving("");
    }
  }

  async function toggleSchedule(row: Row) {
    if (!isHr) return;
    const id = recordId(row);
    const nextStatus = status(row) === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setSaving(`schedule:${id}`);
    setNotice(null);
    try {
      await api(`/schedules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      setNotice({ type: "success", message: `Schedule ${nextStatus.toLowerCase()}.` });
      setRefreshTick((n) => n + 1);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to update the schedule." });
    } finally {
      setSaving("");
    }
  }

  function noteField(kind: string, id: string, placeholder: string) {
    const key = `${kind}:${id}`;
    return <label className="block text-xs font-medium text-slate-400">Reviewer note<textarea rows={2} maxLength={500} value={notes[key] || ""} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} className={INPUT} /></label>;
  }

  const activeSchedules = useMemo(() => schedules.filter((row) => status(row) === "ACTIVE"), [schedules]);

  return <div className="attendance-management-workspace min-w-0 space-y-5">
    <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-slate-400">{isHr ? "Organization attendance" : "Team attendance"}</p></div></div>

    {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3.5 text-sm leading-6 ${notice.type === "success" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200" : "border-rose-400/20 bg-rose-400/[0.06] text-rose-200"}`}><AlertCircle size={17} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1 break-words">{notice.message}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button></div>}

    <section aria-label="Attendance workload summary" className={`grid min-w-0 gap-3 sm:grid-cols-2 ${isHr ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      <div className={`${PANEL} relative overflow-hidden p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending corrections</p><p className="mt-2 text-3xl font-bold tabular-nums text-white">{errors.corrections ? "—" : actionableCorrections.length}</p><p className="mt-1 text-xs leading-5 text-slate-500">Attendance records awaiting review</p></div><span className="rounded-xl border border-sky-400/15 bg-sky-400/[0.08] p-2.5 text-sky-300"><FileClock size={18} /></span></div></div>
      <div className={`${PANEL} relative overflow-hidden p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending overtime</p><p className="mt-2 text-3xl font-bold tabular-nums text-white">{errors.overtime ? "—" : actionableOvertime.length}</p><p className="mt-1 text-xs leading-5 text-slate-500">Requests awaiting a decision</p></div><span className="rounded-xl border border-amber-400/15 bg-amber-400/[0.08] p-2.5 text-amber-200"><Timer size={18} /></span></div></div>
      {isHr ? <>
        <div className={`${PANEL} relative overflow-hidden p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Excess time to review</p><p className="mt-2 text-3xl font-bold tabular-nums text-white">{errors["excess-overtime"] ? "—" : excessOvertime.filter((row) => status(row).toUpperCase() === "OPEN").length}</p><p className="mt-1 text-xs leading-5 text-slate-500">Open excess-time cases</p></div><span className="rounded-xl border border-violet-400/15 bg-violet-400/[0.08] p-2.5 text-violet-200"><ClipboardCheck size={18} /></span></div></div>
        <div className={`${PANEL} relative overflow-hidden p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active schedules</p><p className="mt-2 text-3xl font-bold tabular-nums text-white">{errors.schedules ? "—" : activeSchedules.length}</p><p className="mt-1 text-xs leading-5 text-slate-500">Available for shift assignments</p></div><span className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.08] p-2.5 text-emerald-200"><CalendarDays size={18} /></span></div></div>
      </> : <div className={`${PANEL} relative overflow-hidden p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total awaiting review</p><p className="mt-2 text-3xl font-bold tabular-nums text-white">{[errors.corrections, errors.overtime].some(Boolean) ? "—" : pendingCount}</p><p className="mt-1 text-xs leading-5 text-slate-500">Excludes your own requests</p></div><span className="rounded-xl border border-sky-400/15 bg-sky-400/[0.08] p-2.5 text-sky-300"><ClipboardCheck size={18} /></span></div></div>}
    </section>

    <section className={`attendance-workspace-navigation ${PANEL} p-3 sm:p-4`} aria-label="Attendance workspace navigation">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p><p className="mt-1 text-sm text-slate-300">Choose a task area. Counts highlight items that may need attention.</p></div><span className="text-xs text-slate-500">{tabs.length} areas</span></div>
      <nav aria-label="Attendance management sections" className="flex min-w-0 gap-1.5 overflow-x-auto pb-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const count = id === "corrections" ? (errors.corrections ? "—" : actionableCorrections.length) : id === "overtime" ? (errors.overtime ? "—" : actionableOvertime.length) : id === "excess-overtime" ? (errors["excess-overtime"] ? "—" : excessOvertime.filter((row) => status(row).toUpperCase() === "OPEN").length) : null;
          const hasCount = count !== null;
          return <button key={id} type="button" onClick={() => setActiveSection(id)} aria-current={activeSection === id ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${activeSection === id ? "hr-manager-attendance-section-tab !bg-[#1769aa] !text-white !border !border-[#1769aa] ring-1 ring-[#1769aa] shadow-sm [&>svg]:!text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"}`}><Icon size={16} />{label}{hasCount && <span className={`min-w-6 rounded-md px-1.5 py-0.5 text-center text-[11px] tabular-nums ${Number(count) > 0 ? "bg-amber-400/10 text-amber-200" : "bg-white/[0.05] text-slate-500"}`}>{count}</span>}</button>;
        })}
      </nav>
    </section>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-1"><div><p className="text-base font-semibold text-white">{tabs.find((tab) => tab.id === activeSection)?.label || "Attendance"}</p><p className="mt-1 text-sm text-slate-500">{activeSection === "calendar" ? "Inspect daily attendance events and patterns." : activeSection === "hours" ? "Review recorded and payable hours for the selected period." : activeSection === "schedules" ? "Manage shift definitions and effective-dated employee assignments." : activeSection === "corrections" ? "Resolve missing punches and requested attendance adjustments." : activeSection === "overtime" ? "Review advance overtime requests and their decisions." : activeSection === "excess-overtime" ? "Review excess time separately from approved overtime pay." : "Review actionable attendance requests within your authorized scope."}</p></div></div>

    {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw size={13} className="animate-spin" />Loading attendance management data…</div>}

    {activeSection === "review" && !isHr && <section className={`${PANEL} p-4 sm:p-6`}>
      <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><h3 className="flex items-center gap-2 font-semibold text-white"><ClipboardCheck size={18} className="text-sky-300" /> Team review queue</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Review employee-submitted records in your assigned departments. Each item keeps its own decision rules and required notes. Your own requests are excluded because you cannot review them.</p></div>
        <span className="inline-flex w-fit items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">{[errors.corrections, errors.overtime].some(Boolean) ? "Partial count" : `${pendingCount} actionable item${pendingCount === 1 ? "" : "s"}`}</span>
      </div>
      <div className="mt-5 flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label="Filter review queue">
        {([
          ["ALL", "All items", [errors.corrections, errors.overtime].some(Boolean) ? "—" : pendingCount],
          ["CORRECTIONS", "Corrections", errors.corrections ? "—" : actionableCorrections.length],

          ["OVERTIME", "Overtime", errors.overtime ? "—" : actionableOvertime.length],
        ] as const).map(([filter, label, count]) => <button key={filter} type="button" onClick={() => setReviewFilter(filter)} aria-pressed={reviewFilter === filter} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${reviewFilter === filter ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-slate-700 bg-black/10 text-slate-400 hover:text-slate-200"}`}>{label}<span className="rounded-md bg-black/20 px-1.5 py-0.5 tabular-nums">{count}</span></button>)}
      </div>
      <ErrorMessage>{[errors.corrections, errors.overtime].filter(Boolean).join(" ")}</ErrorMessage>
      {loading && <div className="my-4 flex items-center gap-2 text-xs text-slate-500"><RefreshCw size={13} className="animate-spin" />Refreshing review items…</div>}
      {!loading && visibleReviewItems.length === 0 ? <div className="mt-4"><Empty title={[errors.corrections, errors.overtime].some(Boolean) ? "Review queue is incomplete" : reviewFilter === "ALL" ? "Your review queue is clear" : `No ${reviewFilter.toLowerCase()} to review`} detail={[errors.corrections, errors.overtime].some(Boolean) ? "At least one review source could not be loaded. The queue will check again automatically." : "No items match this filter in your permitted department scope."} /></div> : <div className="mt-4 space-y-3">{visibleReviewItems.map((item, index) => {
        const row = item.row;
        const id = item.id;
        const kindLabels = { CORRECTIONS: "Attendance correction", OVERTIME: "Overtime request" };
        const workDateValue = str(row, "workDate");
        const periodStartValue = str(row, "periodStartDate");
        const periodEndValue = str(row, "periodEndDate");
        const requestedAtValue = str(row, "requestedAt", "submittedAt", "createdAt", "created_at");
        const contextualDate = workDateValue ? dateLabel(workDateValue) : periodStartValue ? `${dateLabel(periodStartValue)} – ${dateLabel(periodEndValue)}` : (requestedAtValue ? dateTimeLabel(requestedAtValue) : "");
        return <article key={`${item.kind}-${id || index}`} className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/10 p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{(audience === "department-manager" || audience === "hr-manager") && <EmployeeProfilePhoto employeeId={attendancePhotoEmployeeId(str(row, "employeeId", "employee_id"), actorEmployeeId)} name={PersonName(row)} className="size-10 rounded-xl border border-white/10 bg-slate-800" textClassName="text-[11px] font-bold text-slate-300" />}<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-sky-300">{kindLabels[item.kind]}</p><h4 className="mt-1 break-words text-sm font-semibold text-white">{PersonName(row)}</h4><p className="mt-1 break-words text-xs leading-5 text-slate-500">{str(row, "employeeCode", "employee_code")}{str(row, "departmentName", "department_name") ? ` · ${str(row, "departmentName", "department_name")}` : ""}{contextualDate ? ` · ${contextualDate}` : ""}</p></div></div><Status value={status(row)} /></div>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">{item.kind === "CORRECTIONS" ? (str(row, "reason", "requestReason") || "Review the requested attendance adjustment against the original record.") : (str(row, "reason") || `Requested ${num(row, "requestedMinutes") ?? "—"} overtime minutes.`)}</p>
          {item.kind === "CORRECTIONS" && <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Original recorded time</p><p className="mt-1 break-words text-sm font-semibold text-slate-200">{str(row, "originalEventId") ? (str(row, "originalRecordedAt") ? dateTimeLabel(str(row, "originalRecordedAt")) : "Original timestamp unavailable") : "Missing punch — no original event"}</p></div><div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.035] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">Proposed time · {humanize(str(row, "eventType"))}</p><p className="mt-1 break-words text-sm font-semibold text-slate-100">{dateTimeLabel(str(row, "requestedAt"))}</p></div></div>}
          {item.kind === "CORRECTIONS" && <div className="mt-4 space-y-3">{noteField("correction", id, "Required if rejecting this correction") }<div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} disabled={Boolean(saving)} onClick={() => void reviewCorrection(row, "APPROVE")}><CheckCircle2 size={15} />Approve correction</button><button type="button" className={SECONDARY} disabled={Boolean(saving)} onClick={() => void reviewCorrection(row, "REJECT")}><XCircle size={15} />Reject</button></div></div>}

          {item.kind === "OVERTIME" && <div className="mt-4 space-y-3">{noteField("overtime", id, "Required if rejecting overtime; optional for approval") }<div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} disabled={Boolean(saving)} onClick={() => void reviewOvertime(row, "APPROVE")}><CheckCircle2 size={15} />Approve {num(row, "requestedMinutes") ?? "requested"} minutes</button><button type="button" className={SECONDARY} disabled={Boolean(saving)} onClick={() => void reviewOvertime(row, "REJECT")}><XCircle size={15} />Reject</button></div></div>}
        </article>;
      })}</div>}

    </section>}

    {activeSection === "calendar" && <div className={`${PANEL} p-4 sm:p-5`}><div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{isHr ? "Organization attendance calendar" : "Team attendance calendar"}</h3><p className="mt-1 text-sm leading-5 text-slate-500">Review expected shifts alongside recorded attendance.</p></div></div><AttendanceCalendarView audience={audience} actorEmployeeId={actorEmployeeId} /></div>}
    {activeSection === "hours" && <AttendanceMonthlyHoursView audience={audience} actorEmployeeId={actorEmployeeId} />}

    {activeSection === "schedules" && <div className="space-y-5">
      {isHr && <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <form onSubmit={createSchedule} className={`${PANEL} p-5 sm:p-6`}><h3 className="font-semibold">Create a work schedule</h3><p className="mt-1 text-sm leading-6 text-slate-500">Set the recurring working days, hours, and break for this shift.</p><div className="mt-5 space-y-4"><label className="block text-sm font-medium text-slate-300">Schedule name<input required maxLength={100} value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} className={INPUT} placeholder="Standard Day Shift" /></label><label className="block text-sm font-medium text-slate-300">Description<input maxLength={500} value={scheduleDescription} onChange={(event) => setScheduleDescription(event.target.value)} className={INPUT} placeholder="Optional schedule details" /></label><div><p className="text-sm font-medium text-slate-300">Working days</p><div className="mt-2 flex flex-wrap gap-2">{DAYS.map((day) => <label key={day.value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selectedDays.includes(day.value) ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-slate-700 bg-black/10 text-slate-400"}`}><input type="checkbox" checked={selectedDays.includes(day.value)} onChange={(event) => setSelectedDays((current) => event.target.checked ? [...current, day.value].sort((a, b) => a - b) : current.filter((value) => value !== day.value))} className="accent-sky-400" />{day.label}</label>)}</div></div><div className="grid min-w-0 gap-3 sm:grid-cols-3"><label className="block text-sm font-medium text-slate-300">Start time<input type="time" required value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} className={INPUT} /></label><label className="block text-sm font-medium text-slate-300">End time<input type="time" required value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} className={INPUT} /></label><label className="block text-sm font-medium text-slate-300">Break minutes<input type="number" min={0} max={1439} required value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)} className={INPUT} /></label></div><button type="submit" disabled={Boolean(saving)} className={PRIMARY}>{saving === "create-schedule" ? <RefreshCw size={15} className="animate-spin" /> : <CalendarDays size={15} />}Create schedule</button></div></form>
        <form onSubmit={assignSchedule} className={`${PANEL} p-5 sm:p-6`}><h3 className="font-semibold">Assign schedule to an employee</h3><p className="mt-1 text-sm leading-6 text-slate-500">Choose an employee, schedule, and effective date. Overlapping assignments are not allowed.</p><div className="mt-5 space-y-4"><label className="block text-sm font-medium text-slate-300">Active employee<select required value={assignEmployeeId} onChange={(event) => setAssignEmployeeId(event.target.value)} className={INPUT}><option value="">Select employee</option>{employees.map((employee) => { const id = recordId(employee); return id ? <option key={id} value={id}>{PersonName(employee)}{str(employee, "employeeCode") ? ` · ${str(employee, "employeeCode")}` : ""}{str(employee, "departmentName") ? ` · ${str(employee, "departmentName")}` : ""}</option> : null; })}</select></label><label className="block text-sm font-medium text-slate-300">Active schedule<select required value={assignScheduleId} onChange={(event) => setAssignScheduleId(event.target.value)} className={INPUT}><option value="">Select schedule</option>{activeSchedules.map((schedule) => <option key={recordId(schedule)} value={recordId(schedule)}>{str(schedule, "name")}</option>)}</select></label><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-300">Effective from<input type="date" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={INPUT} /></label><label className="block text-sm font-medium text-slate-300">Effective to (optional)<input type="date" value={effectiveTo} min={effectiveFrom || undefined} onChange={(event) => setEffectiveTo(event.target.value)} className={INPUT} /></label></div><button type="submit" disabled={Boolean(saving) || !employees.length || !activeSchedules.length} className={PRIMARY}>{saving === "assign-schedule" ? <RefreshCw size={15} className="animate-spin" /> : <Users size={15} />}Assign schedule</button>{!employees.length && <p className="text-xs leading-5 text-amber-200">No active employees were returned. Check the employee list permission or filters.</p>}</div></form>
      </div>}

      <div className={`${PANEL} p-5 sm:p-6`}><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{isHr ? "Schedule definitions" : "Assigned team schedules"}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{isHr ? "Manage active schedule templates and inspect effective-dated assignments." : "Review effective-dated schedule assignments for employees in your assigned departments. Schedule creation and reassignment are restricted to authorized HR roles."}</p></div><Status value={`${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`} /></div><ErrorMessage>{errors.schedules || ""}</ErrorMessage>
        {isHr && <div className="mt-5 space-y-3">{schedules.length === 0 ? <Empty title="No schedule definitions" detail="Create a work schedule above to begin assigning working patterns." /> : schedules.map((row, index) => { const days = Array.isArray(row.days) ? row.days.filter(isRecord) : []; return <article key={recordId(row) || `schedule-${index}`} className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{str(row, "name")}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{str(row, "description") || "No description"}</p></div><div className="flex items-center gap-2"><Status value={status(row)} /><button type="button" className={SECONDARY} disabled={Boolean(saving)} onClick={() => void toggleSchedule(row)}>{saving === `schedule:${recordId(row)}` ? <RefreshCw size={14} className="animate-spin" /> : null}{status(row) === "ACTIVE" ? "Deactivate" : "Activate"}</button></div></div><div className="mt-3 flex flex-wrap gap-2">{days.map((day, dayIndex) => <span key={`${recordId(row)}-${str(day, "dayOfWeek")}-${dayIndex}`} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-xs text-slate-300">{DAYS.find((item) => item.value === num(day, "dayOfWeek"))?.label || `Day ${str(day, "dayOfWeek")}`} · {str(day, "startTime")}–{str(day, "endTime")} · {str(day, "breakMinutes")}m break</span>)}</div></article>; })}</div>}
        <div className="mt-5 space-y-3">{assignments.length === 0 ? <Empty title="No schedule assignments" detail="No assignments are available within your current access scope." /> : assignments.map((row, index) => { const assignmentId = recordId(row); const isCorrecting = correctingAssignmentId === assignmentId; return <article key={assignmentId || `assignment-${index}`} className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><p className="break-words text-sm font-semibold">{PersonName(row)}</p><p className="mt-1 break-words text-xs text-slate-500">{str(row, "employeeCode")}{str(row, "departmentName") ? ` · ${str(row, "departmentName")}` : ""}</p><p className="mt-2 text-sm text-slate-300">{str(row, "scheduleName") || "Schedule name unavailable"}</p></div><div className="flex flex-wrap items-center gap-2"><Status value={str(row, "scheduleStatus") || "ASSIGNED"} />{isHr && <button type="button" className={SECONDARY} onClick={() => { setCorrectingAssignmentId(isCorrecting ? "" : assignmentId); setCorrectionScheduleId(str(row, "scheduleId")); setCorrectionEffectiveFrom(str(row, "effectiveFrom") || localDate(new Date())); }} disabled={Boolean(saving)}>{isCorrecting ? "Cancel" : "Correct shift"}</button>}</div></div><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><div><p className="text-xs text-slate-500">Effective from</p><p className="mt-1 text-sm font-semibold">{dateLabel(str(row, "effectiveFrom"))}</p></div><div><p className="text-xs text-slate-500">Effective to</p><p className="mt-1 text-sm font-semibold">{str(row, "effectiveTo") ? dateLabel(str(row, "effectiveTo")) : "No end date"}</p></div></div>{Array.isArray(row.days) && <div className="mt-3 flex flex-wrap gap-2">{(row.days as unknown[]).filter(isRecord).map((day, dayIndex) => <span key={`${assignmentId}-${dayIndex}`} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-xs text-slate-300">{DAYS.find((item) => item.value === num(day, "dayOfWeek"))?.label || `Day ${str(day, "dayOfWeek")}`} · {str(day, "startTime")}–{str(day, "endTime")}</span>)}</div>}{isCorrecting && <form onSubmit={correctScheduleAssignment} className="mt-4 grid min-w-0 gap-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-4 sm:grid-cols-3"><label className="block text-sm font-medium text-slate-300">Replacement shift<select required value={correctionScheduleId} onChange={(event) => setCorrectionScheduleId(event.target.value)} className={INPUT}><option value="">Choose shift</option>{activeSchedules.map((schedule) => <option key={recordId(schedule)} value={recordId(schedule)}>{str(schedule, "name")}</option>)}</select></label><label className="block text-sm font-medium text-slate-300">Correct from<input required type="date" min={str(row, "effectiveFrom")} max={str(row, "effectiveTo") || undefined} value={correctionEffectiveFrom} onChange={(event) => setCorrectionEffectiveFrom(event.target.value)} className={INPUT} /></label><div className="flex items-end"><button type="submit" className={PRIMARY} disabled={Boolean(saving) || !correctionScheduleId || !correctionEffectiveFrom}>{saving === `correct-assignment:${assignmentId}` ? "Saving…" : "Save correction"}</button></div><p className="text-xs leading-5 text-slate-400 sm:col-span-3">The correction takes effect on the selected date. Earlier assignment history remains intact. If attendance is already recorded on that date, choose a later date.</p></form>}</article>; })}</div>
      </div>
    </div>}

    {activeSection === "excess-overtime" && <section className={`${PANEL} p-5 sm:p-6`}>
      <div className="mb-5">
        <h3 className="font-semibold text-white">Clock-outs beyond scheduled or approved time</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
          These cases are detected from completed attendance events. Review confirms the record or requests follow-up; it does not retroactively authorize overtime or add unpaid excess minutes to payroll.
        </p>
      </div>
      <ErrorMessage>{errors["excess-overtime"] || ""}</ErrorMessage>
      {!loading && !errors["excess-overtime"] && excessOvertime.length === 0 && <Empty title="No excess-time cases found" detail="No completed clock-outs exceeded the scheduled end plus overtime approved in advance for this date range." />}
      <div className="space-y-3">
        {excessOvertime.map((row) => {
          const id = recordId(row);
          const isOpen = status(row) === "OPEN";
          return <article key={id} className="rounded-2xl border border-white/[0.08] bg-black/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {(audience === "department-manager" || audience === "hr-manager") && <EmployeeProfilePhoto employeeId={attendancePhotoEmployeeId(str(row, "employeeId", "employee_id"), actorEmployeeId)} name={PersonName(row)} className="size-10 rounded-xl border border-white/10 bg-slate-800" textClassName="text-[11px] font-bold text-slate-300" />}
                <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{PersonName(row)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {str(row, "employeeCode")}{str(row, "departmentName") ? ` · ${str(row, "departmentName")}` : ""} · {dateLabel(str(row, "workDate"))}
                </p>
                </div>
              </div>
              <Status value={status(row)} label={excessReviewStatusLabel(status(row))} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-xs text-slate-500">Scheduled shift end</p><p className="mt-1 text-sm font-semibold text-slate-200">{dateTimeLabel(str(row, "scheduledEnd"))}</p></div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-xs text-slate-500">Actual clock-out</p><p className="mt-1 text-sm font-semibold text-slate-200">{dateTimeLabel(str(row, "actualClockOut"))}</p></div>
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3"><p className="text-xs text-amber-200/80">Unapproved excess</p><p className="mt-1 text-lg font-bold text-amber-100">{num(row, "excessMinutes") ?? 0} min</p></div>
            </div>
            {str(row, "reviewerNote") && <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm leading-6 text-slate-300">Reviewer note: {str(row, "reviewerNote")}</p>}
            {isOpen && <div className="mt-4 space-y-3">
              {noteField(`excess-follow-up`, id, "Required if follow-up is needed; explain what must be checked")}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={PRIMARY} disabled={Boolean(saving)} onClick={() => void runAction(`excess-reviewed:${id}`, `/attendance/excess-overtime/${encodeURIComponent(id)}`, { decision: "MARK_REVIEWED", reviewerNote: (notes[`excess-follow-up:${id}`] || "").trim() || null }, "Excess time reviewed — no extra pay authorized.")}><CheckCircle2 size={15} />Mark reviewed — no extra pay</button>
                <button type="button" className={SECONDARY} disabled={Boolean(saving)} onClick={() => {
                  const reviewerNote = (notes[`excess-follow-up:${id}`] || "").trim();
                  if (!reviewerNote) {
                    setNotice({ type: "error", message: "Add a reviewer note before requesting follow-up." });
                    return;
                  }
                  void runAction(`excess-follow-up:${id}`, `/attendance/excess-overtime/${encodeURIComponent(id)}`, { decision: "FOLLOW_UP", reviewerNote }, "Follow-up recorded. The excess time remains unpaid.");
                }}><FileClock size={15} />Request follow-up</button>
              </div>
            </div>}
          </article>;
        })}
      </div>
    </section>}

    {activeSection === "corrections" && <div className={`${PANEL} p-5 sm:p-6`}><div className="mb-4"><h3 className="font-semibold">Attendance correction review</h3><p className="mt-1 text-sm leading-6 text-slate-500">Confirm the requested event, date, employee and reason. Rejection requires a note.</p></div><ErrorMessage>{errors.corrections || ""}</ErrorMessage><div className="space-y-3">{corrections.length === 0 ? <Empty title="No correction requests" detail="No requests match your access scope." /> : corrections.map((row, index) => { const id = recordId(row); const isPending = status(row) === "PENDING"; return <article key={id || `correction-${index}`} className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{(audience === "department-manager" || audience === "hr-manager") && <EmployeeProfilePhoto employeeId={attendancePhotoEmployeeId(str(row, "employeeId", "employee_id"), actorEmployeeId)} name={PersonName(row)} className="size-9 rounded-lg border border-white/10 bg-slate-800" textClassName="text-[10px] font-bold text-slate-300" />}<div className="min-w-0"><p className="break-words text-sm font-semibold">{PersonName(row)} · {humanize(str(row, "eventType"))}</p><p className="mt-1 break-words text-xs text-slate-500">{str(row, "employeeCode")}{str(row, "departmentName") ? ` · ${str(row, "departmentName")}` : ""} · {dateLabel(str(row, "workDate"))}</p></div></div><Status value={status(row)} /></div><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3"><div className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs text-slate-500">Original recorded time</p><p className="mt-1 break-words text-sm font-semibold">{str(row, "originalEventId") ? (str(row, "originalRecordedAt") ? dateTimeLabel(str(row, "originalRecordedAt")) : "Timestamp unavailable") : "Missing punch"}</p></div><div className="rounded-lg border border-sky-500/15 p-3"><p className="text-xs text-sky-300">Proposed time</p><p className="mt-1 break-words text-sm font-semibold">{dateTimeLabel(str(row, "requestedAt"))}</p></div><div className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs text-slate-500">Reason</p><p className="mt-1 break-words text-sm text-slate-300">{str(row, "reason") || "—"}</p></div></div>{str(row, "reviewerNote") && <p className="mt-3 break-words text-xs leading-5 text-slate-400">Previous reviewer note: {str(row, "reviewerNote")}</p>}{isPending && !isOwnRecord(row) && <div className="mt-4 space-y-3">{noteField("correction", id, "Optional for approval; required for rejection") }<div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} disabled={Boolean(saving)} onClick={() => void reviewCorrection(row, "APPROVE")}>{saving === `correction:${id}` ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}Approve</button><button type="button" className={SECONDARY} disabled={Boolean(saving)} onClick={() => void reviewCorrection(row, "REJECT")}><XCircle size={15} />Reject</button></div></div>}{isPending && isOwnRecord(row) && <p className="mt-3 text-xs leading-5 text-slate-500">You submitted this request. Another authorized reviewer must make the decision.</p>}</article>; })}</div></div>}




    {activeSection === "overtime" && <div className={`${PANEL} p-5 sm:p-6`}><div className="mb-4"><h3 className="font-semibold">Overtime approval queue</h3><p className="mt-1 text-sm leading-6 text-slate-500">Approve the requested minutes or reject with a review note. Approval remains distinct from payroll calculation.</p></div><ErrorMessage>{errors.overtime || ""}</ErrorMessage><div className="space-y-3">{overtime.length === 0 ? <Empty title="No overtime requests" detail="No overtime requests were returned within your permission scope." /> : overtime.map((row, index) => { const id = recordId(row); const pending = status(row) === "PENDING"; return <article key={id || `overtime-${index}`} className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{(audience === "department-manager" || audience === "hr-manager") && <EmployeeProfilePhoto employeeId={attendancePhotoEmployeeId(str(row, "employeeId", "employee_id"), actorEmployeeId)} name={PersonName(row)} className="size-9 rounded-lg border border-white/10 bg-slate-800" textClassName="text-[10px] font-bold text-slate-300" />}<div className="min-w-0"><p className="break-words text-sm font-semibold">{PersonName(row)} · {dateLabel(str(row, "workDate"))}</p><p className="mt-1 break-words text-xs text-slate-500">{humanize(str(row, "requestType"))}{str(row, "departmentName") ? ` · ${str(row, "departmentName")}` : ""}</p></div></div><Status value={status(row)} /></div><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3"><div className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs text-slate-500">Requested minutes</p><p className="mt-1 text-lg font-bold">{num(row, "requestedMinutes") ?? "—"}</p></div><div className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs text-slate-500">Approved minutes</p><p className="mt-1 text-lg font-bold">{num(row, "approvedMinutes") ?? 0}</p></div><div className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs text-slate-500">Requested at</p><p className="mt-1 break-words text-sm font-semibold">{dateTimeLabel(str(row, "requestedAt"))}</p></div></div><p className="mt-3 break-words text-sm leading-6 text-slate-300">{str(row, "reason") || "No reason returned"}</p>{pending && !isOwnRecord(row) && <div className="mt-4 space-y-3">{noteField("overtime", id, "Optional for approval; required for rejection") }<div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} disabled={Boolean(saving)} onClick={() => void reviewOvertime(row, "APPROVE")}><CheckCircle2 size={15} />Approve requested minutes</button><button type="button" className={SECONDARY} disabled={Boolean(saving)} onClick={() => void reviewOvertime(row, "REJECT")}><XCircle size={15} />Reject</button></div></div>}{pending && isOwnRecord(row) && <p className="mt-3 text-xs leading-5 text-slate-500">You submitted this overtime request. Another authorized reviewer must make the decision.</p>}</article>; })}</div></div>}


  </div>;
}

