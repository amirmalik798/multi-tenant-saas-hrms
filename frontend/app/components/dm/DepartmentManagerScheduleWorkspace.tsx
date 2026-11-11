"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

type Department = { id: string; name: string };
type OverviewResponse = {
  message?: string;
  workDate?: string;
  timeZone?: string;
  weekStartsOn?: number;
  departments?: Department[];
}
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
  scheduleAssignmentId: string | null;
  scheduleId: string | null;
  scheduleName: string | null;
  timeZone: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  scheduledBreakMinutes: number | null;
  firstClockIn: string | null;
  lastClockOut: string | null;
  eventCount: number;
  events: CalendarEvent[];
  leaveRequest?: { id: string; leaveType: string; status: string; isPaid: boolean } | null;
  publicHoliday?: { id: string; name: string; isPaid: boolean } | null;
};
type CalendarResponse = { message?: string; entries?: CalendarEntry[]; hasMore?: boolean; scope?: string };
type ViewMode = "week" | "agenda";
type ScheduleAssignment = { id: string; employeeId: string; employeeCode?: string | null; firstName?: string | null; lastName?: string | null; departmentId?: string | null; departmentName?: string | null; scheduleName?: string | null; effectiveFrom: string; effectiveTo?: string | null; days?: { dayOfWeek: number; startTime: string; endTime: string; breakMinutes: number }[] };
type AssignmentsResponse = { assignments?: ScheduleAssignment[]; message?: string };

const PANEL = "min-w-0 rounded-2xl border border-slate-800/90 bg-[#131a24] shadow-lg shadow-black/10";
const INPUT = "h-11 w-full rounded-xl border border-slate-800 bg-[#0e141c] px-3 text-sm text-slate-200 outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api/backend${path}`, { method: "GET", credentials: "same-origin", cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message || `Request failed with HTTP ${response.status}.`);
  if (payload === null) throw new Error("The server returned an unreadable response.");
  return payload;
}

function localDateString(date: Date, timeZone = "Africa/Kigali"): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
  } catch {
    // Fall through to the browser-local date only if the supplied timezone is invalid.
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function startOfWeek(value: string, weekStartsOn = 1): string {
  const date = new Date(`${value}T12:00:00Z`);
  const normalizedWeekStart = Number.isInteger(weekStartsOn) && weekStartsOn >= 1 && weekStartsOn <= 7 ? weekStartsOn : 1;
  const firstDay = normalizedWeekStart % 7;
  const offset = (date.getUTCDay() - firstDay + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function dayLabel(value: string, _timeZone?: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  } catch { return value; }
}
function fullDateLabel(value: string, _timeZone?: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  } catch { return value; }
}
function timeLabel(value: string | null, timeZone?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...(timeZone ? { timeZone } : {}) }).format(date);
  } catch { return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); }
}
function employeeName(entry: CalendarEntry): string {
  return `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() || entry.employeeCode || "Employee";
}
function initials(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "E";
}
function latestEvent(entry: CalendarEntry): CalendarEvent | null {
  const events = Array.isArray(entry.events) ? [...entry.events] : [];
  events.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  return events.length ? events[events.length - 1] : null;
}
function countText(value: number): string { return new Intl.NumberFormat().format(value); }


function CalendarDayEntry({ entry, timeZone, actorEmployeeId }: { entry: CalendarEntry; timeZone: string; actorEmployeeId?: string }) {
  const scheduled = Boolean(entry.expectedStart && entry.scheduleName);
  const approvedLeave = entry.leaveRequest?.status?.toUpperCase() === "APPROVED";
  const hasTimeOff = approvedLeave || Boolean(entry.publicHoliday);
  const name = employeeName(entry);
  const punchSummary = entry.eventCount > 0
    ? `${entry.firstClockIn ? `${timeLabel(entry.firstClockIn, entry.timeZone || timeZone)} in` : "No clock-in"} · ${entry.lastClockOut ? `${timeLabel(entry.lastClockOut, entry.timeZone || timeZone)} out` : "No clock-out"}`
    : scheduled && !hasTimeOff ? "No punches yet" : entry.eventCount === 0 && !scheduled ? "No attendance recorded" : "";

  return (
    <article className="min-w-0 border-t border-slate-800/70 px-2.5 py-2.5 first:border-t-0">
      <div className="flex min-w-0 items-center gap-2">
        <EmployeeProfilePhoto employeeId={actorEmployeeId && entry.employeeId === actorEmployeeId ? undefined : entry.employeeId} name={name} className="size-8 rounded-lg border border-slate-700 bg-slate-800/80" textClassName="text-[10px] font-bold text-slate-300" />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-slate-100" title={name}>{name}</p>
          {entry.employeeCode && <p className="mt-0.5 truncate text-[10px] text-slate-500">{entry.employeeCode}</p>}
        </div>
      </div>
      {entry.publicHoliday && (
        <p className="dm-schedule-holiday-marker mt-1 rounded-md bg-violet-400/10 px-1.5 py-1 text-[10px] leading-4 text-violet-200" title={entry.publicHoliday.name}>
          Holiday · {entry.publicHoliday.name}
        </p>
      )}
      {entry.leaveRequest && (
        <p className={`mt-1 rounded-md px-1.5 py-1 text-[10px] leading-4 ${approvedLeave ? "bg-amber-400/10 text-amber-200" : "bg-slate-700/70 text-slate-300"}`}>
          {entry.leaveRequest.leaveType.replaceAll("_", " ")} · {entry.leaveRequest.status.toLowerCase().replaceAll("_", " ")}
        </p>
      )}
      {scheduled ? (
        <div className="mt-1.5">
          <p className="line-clamp-2 text-[10px] leading-4 text-slate-300" title={entry.scheduleName || ""}>{entry.scheduleName}</p>
          <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums text-sky-200">
            {timeLabel(entry.expectedStart, entry.timeZone || timeZone)}–{timeLabel(entry.expectedEnd, entry.timeZone || timeZone)}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-[10px] text-slate-500">No scheduled shift</p>
      )}
      {punchSummary && (
        <p className={`mt-1 text-[10px] leading-4 ${entry.eventCount > 0 ? "text-emerald-200" : scheduled && !hasTimeOff ? "text-amber-200" : "text-slate-400"}`}>
          {punchSummary}
        </p>
      )}
      {scheduled && hasTimeOff && (
        <p className="mt-1 text-[10px] leading-4 text-rose-200">Shift overlaps time off</p>
      )}
      {entry.departmentName && <p className="mt-1 truncate text-[10px] text-slate-500" title={entry.departmentName}>{entry.departmentName}</p>}
    </article>
  );
}

function CalendarAgendaRow({ entry, actorEmployeeId }: { entry: CalendarEntry; actorEmployeeId?: string }) {
  const latest = latestEvent(entry);
  const scheduled = Boolean(entry.expectedStart && entry.scheduleName);
  return (
    <article className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <EmployeeProfilePhoto employeeId={actorEmployeeId && entry.employeeId === actorEmployeeId ? undefined : entry.employeeId} name={employeeName(entry)} className="size-10 rounded-xl border border-slate-700 bg-slate-800/80" textClassName="text-xs font-bold text-slate-300" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-200">{employeeName(entry)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{entry.employeeCode || "No employee code"}{entry.departmentName ? ` · ${entry.departmentName}` : ""}</p>
          <p className="mt-2 text-xs text-slate-300">{scheduled ? entry.scheduleName : "No schedule record for this date"}</p>
          {scheduled && <p className="mt-1 text-xs text-slate-500">Scheduled {timeLabel(entry.expectedStart, entry.timeZone)} – {timeLabel(entry.expectedEnd, entry.timeZone)}{entry.scheduledBreakMinutes !== null ? ` · ${entry.scheduledBreakMinutes} min scheduled break` : ""}</p>}
          <p className="mt-1.5 text-xs text-slate-400">{entry.eventCount > 0 ? `First clock-in: ${timeLabel(entry.firstClockIn, entry.timeZone)} · Last clock-out: ${timeLabel(entry.lastClockOut, entry.timeZone)}` : "No clock events returned for this date"}</p>
          {entry.publicHoliday && <p className="dm-schedule-holiday-agenda mt-2 text-xs font-semibold text-violet-300">Public holiday: {entry.publicHoliday.name}{entry.publicHoliday.isPaid ? " · Paid" : ""}</p>}
          {entry.leaveRequest && <p className={`mt-2 text-xs font-semibold ${entry.leaveRequest.status === "APPROVED" ? "text-emerald-300" : "text-amber-200"}`}>Leave: {entry.leaveRequest.leaveType.replaceAll("_", " ")} · {entry.leaveRequest.status}</p>}
          {scheduled && (entry.publicHoliday || entry.leaveRequest?.status.toUpperCase() === "APPROVED") && <p className="mt-2 text-xs font-semibold text-rose-200">Review needed: a shift is assigned on a public holiday or approved leave date.</p>}
          {latest && <p className="mt-1 text-[10px] text-slate-500">Latest recorded event: {latest.eventType.replaceAll("_", " ")} at {timeLabel(latest.recordedAt, entry.timeZone)}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {scheduled && <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold text-sky-200">Scheduled</span>}
        {entry.eventCount > 0 && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">{entry.eventCount} event{entry.eventCount === 1 ? "" : "s"}</span>}
      </div>
    </article>
  );
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: number | string; detail: string; icon: LucideIcon; tone: "sky" | "emerald" | "amber" | "indigo" }) {
  const tones = {
    sky: "border-sky-500/20 bg-sky-500/10 text-sky-200",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-200",
  };
  return <section className={`${PANEL} p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-white">{typeof value === "number" ? countText(value) : value}</p></div><span className={`flex size-10 items-center justify-center rounded-xl border ${tones[tone]}`}><Icon size={18} /></span></div><p className="mt-2 text-[11px] leading-5 text-slate-500">{detail}</p></section>;
}

export default function DepartmentManagerScheduleWorkspace({ actorEmployeeId }: { actorEmployeeId?: string }) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [anchorDate, setAnchorDate] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [calendarError, setCalendarError] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const calendarRequestId = useRef(0);
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentSearch, setAssignmentSearch] = useState("");

  const loadOverview = useCallback(async (silent = false) => {
    setOverviewError("");
    try {
      const data = await getJson<OverviewResponse>("/department-manager/overview");
      setOverview(data);
      const date = data.workDate || localDateString(new Date(), data.timeZone || "Africa/Kigali");
      setAnchorDate((current) => current || date);
      setSelectedDate((current) => current || date);
    } catch (error) {
      if (!silent) {
        setOverview(null);
        const fallback = localDateString(new Date(), "Africa/Kigali");
        setAnchorDate((current) => current || fallback);
        setSelectedDate((current) => current || fallback);
      }
      setOverviewError(error instanceof Error ? error.message : "Unable to load department and time-zone settings.");
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const loadAssignments = useCallback(async (silent = false) => {
    if (!silent) setAssignmentsLoading(true); setAssignmentsError("");
    try { const data = await getJson<AssignmentsResponse>("/schedule-assignments"); setAssignments(Array.isArray(data.assignments) ? data.assignments : []); }
    catch (error) { if (!silent) setAssignments([]); setAssignmentsError(error instanceof Error ? error.message : "Unable to load shift assignments."); }
    finally { if (!silent) setAssignmentsLoading(false); }
  }, []);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const weekStart = useMemo(() => startOfWeek(anchorDate || localDateString(new Date()), overview?.weekStartsOn ?? 1), [anchorDate, overview?.weekStartsOn]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekEnd = weekDates[6] || weekStart;
  const timeZone = overview?.timeZone || "Africa/Kigali";

  const loadCalendar = useCallback(async (silent = false) => {
    if (!anchorDate || !weekStart || !weekEnd) return;
    const requestId = ++calendarRequestId.current;
    if (!silent) {
      setCalendarLoading(true);
      setEntries([]);
      setHasMore(false);
    }
    setCalendarError("");
    try {
      const params = new URLSearchParams({ fromDate: weekStart, toDate: weekEnd });
      const data = await getJson<CalendarResponse>(`/attendance/calendar?${params.toString()}`);
      if (requestId !== calendarRequestId.current) return;
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      if (requestId !== calendarRequestId.current) return;
      if (!silent) {
        setEntries([]);
        setHasMore(false);
      }
      setCalendarError(error instanceof Error ? error.message : "Unable to load the team schedule.");
    } finally {
      if (!silent && requestId === calendarRequestId.current) setCalendarLoading(false);
    }
  }, [anchorDate, weekStart, weekEnd]);

  useEffect(() => { void loadCalendar(); }, [loadCalendar]);

  useWorkspaceAutoRefresh(async () => {
    await Promise.all([loadOverview(), loadAssignments(true), loadCalendar(true)]);
  }, {
    intervalMs: 60_000,
    shouldRefresh: () => !calendarLoading && !assignmentsLoading,
  });

  const scopedEntries = useMemo(() => entries.filter((entry) => departmentFilter === "ALL" || entry.departmentId === departmentFilter), [entries, departmentFilter]);
  const scheduledEntries = scopedEntries.filter((entry) => Boolean(entry.scheduleName && entry.expectedStart));
  const withPunches = scopedEntries.filter((entry) => entry.eventCount > 0);
  const timeOffEntries = scopedEntries.filter((entry) =>
    Boolean(entry.publicHoliday || entry.leaveRequest?.status?.toUpperCase() === "APPROVED"),
  );
  const scheduledWithoutPunches = scheduledEntries.filter((entry) => entry.eventCount === 0 && !entry.publicHoliday && entry.leaveRequest?.status?.toUpperCase() !== "APPROVED");
  const visibleAssignments = useMemo(() => {
    const query = assignmentSearch.trim().toLocaleLowerCase();
    return assignments.filter((a) => {
      if (departmentFilter !== "ALL" && a.departmentId !== departmentFilter) return false;
      const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
      return !query || [name, a.employeeCode, a.departmentName, a.scheduleName].some((v) => String(v ?? "").toLocaleLowerCase().includes(query));
    }).sort((a, b) => (a.departmentName ?? "").localeCompare(b.departmentName ?? "") || `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`));
  }, [assignments, assignmentSearch, departmentFilter]);

  const visibleDates = viewMode === "agenda" ? [selectedDate || anchorDate || weekStart] : weekDates;
  const entriesForDate = useCallback((date: string) => scopedEntries.filter((entry) => entry.workDate === date).sort((a, b) => {
    const aTime = a.expectedStart ? Date.parse(a.expectedStart) : Number.MAX_SAFE_INTEGER;
    const bTime = b.expectedStart ? Date.parse(b.expectedStart) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || employeeName(a).localeCompare(employeeName(b));
  }), [scopedEntries]);

  const goWeek = (delta: number) => {
    const nextAnchor = addDays(weekStart, delta * 7);
    setAnchorDate(nextAnchor);
    setSelectedDate(nextAnchor);
  };
  const jumpToCurrentWeek = () => {
    const date = overview?.workDate || localDateString(new Date(), timeZone);
    setAnchorDate(date);
    setSelectedDate(date);
  };

  return <div className="space-y-6">
    <section className={`${PANEL} overflow-hidden`}>
      <div className="flex flex-col gap-4 border-b border-slate-800/80 bg-gradient-to-r from-sky-500/[0.07] via-[#131a24] to-indigo-500/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-200"><CalendarRange size={20} /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">Planning view</p><h2 className="mt-1 text-lg font-semibold text-white">{anchorDate ? `${dayLabel(weekStart, timeZone)} – ${dayLabel(weekEnd, timeZone)}` : "Team schedule"}</h2><p className="mt-1 text-sm leading-6 text-slate-400">Review assigned shifts beside recorded attendance. This view does not create or change assignments.</p></div></div>

      </div>
      <div className="grid gap-3 border-b border-slate-800/80 p-4 sm:grid-cols-[minmax(220px,0.75fr)_1fr] sm:p-5"><label className="block min-w-0 text-xs font-semibold text-slate-400">Department scope<select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className={`${INPUT} mt-1.5`}><option value="ALL">All assigned departments</option>{(overview?.departments ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><div className="flex flex-wrap items-end justify-between gap-3"><div className="inline-flex rounded-xl border border-slate-800 bg-[#0e141c] p-1"><button type="button" onClick={() => setViewMode("week")} aria-pressed={viewMode === "week"} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${viewMode === "week" ? "bg-sky-500/15 text-sky-200" : "text-slate-400 hover:text-slate-200"}`}>Week overview</button><button type="button" onClick={() => setViewMode("agenda")} aria-pressed={viewMode === "agenda"} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${viewMode === "agenda" ? "bg-sky-500/15 text-sky-200" : "text-slate-400 hover:text-slate-200"}`}>Agenda</button></div></div></div>
    </section>

    {(overviewError || calendarError) && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4 text-sm leading-6 text-rose-200"><AlertCircle size={16} className="mr-2 inline" />{overviewError || calendarError}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Scheduled shifts" value={calendarError ? "—" : calendarLoading && entries.length === 0 ? "…" : scheduledEntries.length} detail="Employee-days with an assigned shift" icon={CalendarDays} tone="sky" />
      <Metric label="Attendance recorded" value={calendarError ? "—" : calendarLoading && entries.length === 0 ? "…" : withPunches.length} detail="Employee-days containing clock events" icon={Clock3} tone="emerald" />
      <Metric label="Approved time off" value={calendarError ? "—" : calendarLoading && entries.length === 0 ? "…" : timeOffEntries.length} detail="Employee-days marked leave or public holiday" icon={ShieldCheck} tone="indigo" />
      <Metric label="No punches yet" value={calendarError ? "—" : calendarLoading && entries.length === 0 ? "…" : scheduledWithoutPunches.length} detail="Scheduled employee-days without punches, excluding approved time off" icon={Users} tone="amber" />
    </div>

    <section className={`${PANEL} overflow-hidden`}>
      <div className="border-b border-slate-800/80 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Team calendar</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">A simple weekly summary. Select a day to see employee-level shift, attendance, leave and holiday details.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => goWeek(-1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-white/[0.025] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-sky-400/40" aria-label="Previous week"><ArrowLeft size={13} />Previous</button>
            <button type="button" onClick={jumpToCurrentWeek} className="h-9 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 text-xs font-semibold text-sky-200 hover:bg-sky-500/15 focus:outline-none focus:ring-2 focus:ring-sky-400/40">Today</button>
            <button type="button" onClick={() => goWeek(1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-white/[0.025] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-sky-400/40" aria-label="Next week">Next<ArrowRight size={13} /></button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-slate-700 bg-[#0e141c] px-3 py-1.5 text-xs font-semibold tabular-nums text-slate-300">
            {fullDateLabel(weekStart, timeZone)} – {fullDateLabel(weekEnd, timeZone)}
          </span>
          {calendarLoading && <span className="text-xs text-slate-400">Updating week…</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 gap-px bg-slate-800/80">
          {weekDates.map((date) => {
            const dayEntries = entriesForDate(date);
            const scheduledCount = dayEntries.filter((entry) => Boolean(entry.scheduleName && entry.expectedStart)).length;
            const eventCount = dayEntries.filter((entry) => entry.eventCount > 0).length;
            const leaveCount = dayEntries.filter((entry) => entry.leaveRequest?.status?.toUpperCase() === "APPROVED").length;
            const holidayCount = dayEntries.filter((entry) => Boolean(entry.publicHoliday)).length;
            const isToday = date === (overview?.workDate || localDateString(new Date(), timeZone));
            const active = date === selectedDate;
            return (
              <section key={date} className={`min-w-0 bg-[#111821] ${active ? "ring-1 ring-inset ring-sky-400/60" : ""}`}>
                <button type="button" onClick={() => { setSelectedDate(date); setViewMode("agenda"); }}
                  aria-pressed={active}
                  className={`w-full min-h-[90px] px-2 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400/60 ${isToday ? "bg-emerald-400/[0.07]" : active ? "bg-sky-400/[0.07]" : "hover:bg-white/[0.035]"}`}>
                  <span className="flex items-start justify-between gap-1">
                    <span className="min-w-0">
                      <span className={`block text-[10px] font-bold uppercase tracking-wide ${isToday ? "text-emerald-200" : "text-slate-400"}`}>
                        {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                      </span>
                      <span className="mt-1 block text-xl font-semibold leading-6 tabular-nums text-white">{Number(date.slice(-2))}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">{new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
                    </span>
                    {isToday && <span className="mt-0.5 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">Today</span>}
                  </span>
                  <span className="mt-2 block text-[10px] leading-4 text-slate-400">
                    {calendarError ? "Data unavailable" : `${scheduledCount} shift${scheduledCount === 1 ? "" : "s"} · ${eventCount} attended`}
                  </span>
                  {(leaveCount > 0 || holidayCount > 0) && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {leaveCount > 0 && <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">{leaveCount} leave</span>}
                      {holidayCount > 0 && <span className="rounded-full bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200">{holidayCount} holiday</span>}
                    </span>
                  )}
                </button>
                <div className="min-h-[120px]">
                  {calendarLoading ? (
                    <div className="space-y-2 p-2"><div className="h-3 animate-pulse rounded bg-slate-800" /><div className="h-3 w-2/3 animate-pulse rounded bg-slate-800" /></div>
                  ) : calendarError ? (
                    <p className="px-2 py-3 text-[10px] leading-4 text-rose-200">Unable to load day</p>
                  ) : dayEntries.length === 0 ? (
                    <p className="px-2 py-4 text-[10px] leading-4 text-slate-600">No calendar records</p>
                  ) : (
                    dayEntries.map((entry) => <CalendarDayEntry key={`${entry.employeeId}-${entry.workDate}`} entry={entry} timeZone={timeZone} actorEmployeeId={actorEmployeeId} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="border-t border-slate-800/80 bg-[#0e141c]/60 px-4 py-3 text-[11px] leading-5 text-slate-500 sm:px-5">
        Summary counts are employee-days, not unique employees. Employee details are shown in the selected day’s agenda below.
      </div>
    </section>
    {hasMore && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">The weekly calendar reached the attendance API response limit. Use the department filter to narrow the calendar, or open Attendance &amp; Time for a narrower report range.</p>}

    {viewMode === "agenda" && (
      <section className={`${PANEL} overflow-hidden`}>
        <div className="flex flex-col gap-2 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-white">{fullDateLabel(selectedDate || weekStart, timeZone)}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Planned shifts and recorded events are shown separately; leave and holiday markers remain visible even without punches.</p>
          </div>
          <Link href="/dm/attendance" className="inline-flex min-h-9 items-center gap-2 self-start rounded-xl border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.04]">Open attendance review <ArrowRight size={13} /></Link>
        </div>
        {calendarLoading ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl border border-slate-800 bg-[#0e141c]" />)}</div>
        ) : calendarError ? (
          <div className="p-8 text-center">
            <AlertCircle size={22} className="mx-auto text-rose-300" />
            <p className="mt-3 text-sm font-semibold text-slate-200">Schedule data unavailable</p>
            <p className="mt-1 text-xs text-slate-500">The page will not represent a failed request as an empty schedule.</p>
          </div>
        ) : (
          <div>
            {visibleDates.map((date) => {
              const dayEntries = entriesForDate(date);
              return (
                <div key={date} className="border-b border-slate-800/70 last:border-b-0">
                  <div className="flex items-center justify-between gap-2 bg-black/10 px-5 py-3">
                    <p className="text-xs font-semibold text-slate-300">{fullDateLabel(date, timeZone)}</p>
                    <span className="text-[10px] text-slate-500">{dayEntries.length} calendar records</span>
                  </div>
                  {dayEntries.length === 0 ? (
                    <div className="px-5 py-7">
                      <p className="text-sm font-medium text-slate-300">No calendar records returned for this day</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">This does not prove that no one is working; the calendar endpoint returns days with a schedule, attendance event, leave, or holiday.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {dayEntries.map((entry) => <CalendarAgendaRow key={`${entry.employeeId}-${entry.workDate}`} entry={entry} actorEmployeeId={actorEmployeeId} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasMore && <div className="border-t border-amber-500/20 bg-amber-500/[0.05] px-5 py-3 text-xs leading-5 text-amber-100">The backend capped the calendar response. Refine the view using the department filter or review smaller date ranges in Attendance & Time to inspect all available records.</div>}
      </section>
    )}

    <section className={`${PANEL} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h3 className="text-base font-semibold text-white">Shift assignments</h3><p className="mt-1 text-xs text-slate-500">Employee shifts and effective dates in your managed departments.</p></div></div>
      <div className="grid gap-3 border-b border-slate-800/70 p-4 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end sm:px-5"><label className="block text-xs font-semibold text-slate-400">Find employee, department or shift<input value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Search assignments…" className={`${INPUT} mt-1.5`} /></label><p className="text-xs text-slate-500">{assignmentsLoading ? "Loading…" : `${visibleAssignments.length} assignment${visibleAssignments.length === 1 ? "" : "s"}`}</p></div>
      {assignmentsError ? <div role="alert" className="p-5 text-sm text-rose-200"><AlertCircle size={15} className="mr-2 inline"/>{assignmentsError}</div>
      : assignmentsLoading && assignments.length === 0 ? <div className="space-y-3 p-5">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl border border-slate-800 bg-[#0e141c]" />)}</div>
      : visibleAssignments.length === 0 ? <div className="px-5 py-8 text-center"><CalendarRange size={22} className="mx-auto text-slate-500"/><p className="mt-2 text-sm font-semibold text-slate-200">No matching assignments</p><p className="mt-1 text-xs text-slate-500">Try another search or department scope.</p></div>
      : <div className="divide-y divide-slate-800/70">{visibleAssignments.map((a) => { const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.employeeCode || "Employee"; const days = Array.isArray(a.days) ? a.days : []; const today = overview?.workDate || localDateString(new Date()); const effective = a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today); return <article key={a.id} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-start sm:px-5"><div className="flex min-w-0 items-start gap-3"><EmployeeProfilePhoto employeeId={a.employeeId} name={name} className="size-10 rounded-xl border border-slate-700 bg-slate-800/80" textClassName="text-xs font-bold text-slate-300" /><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-100">{name}</p><p className="mt-1 text-xs text-slate-500">{a.employeeCode || "No employee code"}{a.departmentName ? ` · ${a.departmentName}` : ""}</p></div></div><div className="min-w-0"><p className="text-sm font-semibold text-sky-200">{a.scheduleName || "Shift name unavailable"}</p><p className="mt-1 text-xs text-slate-400">{a.effectiveFrom} → {a.effectiveTo || "No end date"}</p><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${effective ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200" : "border-slate-700 bg-slate-800/70 text-slate-400"}`}>{effective ? "Effective today" : "Outside current dates"}</span></div><div className="flex flex-wrap gap-1.5">{days.length ? days.map((d) => <span key={`${a.id}-${d.dayOfWeek}`} className="rounded-lg border border-slate-700/80 bg-[#0e141c] px-2 py-1.5 text-[11px] text-slate-300">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.dayOfWeek] ?? `Day ${d.dayOfWeek}`} · {d.startTime}–{d.endTime}</span>) : <span className="text-xs text-slate-500">Shift hours unavailable</span>}</div></article>; })}</div>}

    </section>

    <section className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-[#151e2b] to-[#121821] p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-300"><ShieldCheck size={18} /></span><div><h3 className="text-sm font-semibold text-slate-200">Schedule ownership and data confidence</h3><p className="mt-1 text-xs leading-5 text-slate-500">Department Managers can review the schedule assignments returned for their managed departments. Schedule definitions and assignments remain managed by authorized HR staff. Planned times, attendance events and payable hours are different concepts.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/dm/reviews" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.04]">Open review queue <ArrowRight size={13} /></Link><Link href="/dm/team" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.04]"><Users size={13} />Open team directory</Link></div></div></div></section>
  </div>;
}

