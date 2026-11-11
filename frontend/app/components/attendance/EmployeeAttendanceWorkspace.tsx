"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileClock,
  RefreshCw,
  Send,
  type LucideIcon,
} from "lucide-react";
import { useEmployeeWorkspaceUser } from "../employee/EmployeeChrome";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";
import AttendanceMonthlyHoursView from "./AttendanceMonthlyHoursView";
import { formatDateTime, formatTime } from "../../../lib/attendance-format";

type Row = Record<string, unknown>;
type TabKey = "today" | "calendar" | "monthly" | "requests";
type Notice = { type: "success" | "error"; message: string };
type SectionKey = "calendar" | "events" | "corrections" | "overtime" | "leave" | "holidays";
type Tab = { id: TabKey; label: string; icon: LucideIcon };
type ClockStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "";

const TABS: Tab[] = [
  { id: "today", label: "Today", icon: Clock3 },
  { id: "calendar", label: "History", icon: CalendarDays },
  { id: "monthly", label: "Monthly hours", icon: Clock3 },
  { id: "requests", label: "Request forms", icon: FileClock },
];

const PANEL = "min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] shadow-lg shadow-black/10";
const INPUT = "mt-1.5 w-full min-w-0 rounded-xl border border-slate-700 bg-[#0b111b] px-3.5 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10";
const PRIMARY = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-white/[0.03] px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50";

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(row: Row | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function number(row: Row, ...keys: string[]): number | null {
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

function idOf(row: Row): string {
  return text(row, "id");
}

function rowsFrom(payload: unknown, key: string): Row[] {
  if (!isRecord(payload)) return Array.isArray(payload) ? payload.filter(isRecord) : [];
  const value = payload[key];
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(payload.data) && Array.isArray(payload.data[key])) {
    return (payload.data[key] as unknown[]).filter(isRecord);
  }
  return [];
}

function responseMessage(payload: unknown): string {
  return isRecord(payload) ? text(payload, "message", "error", "detail") : "";
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

async function section(path: string, key: string): Promise<{ rows: Row[]; error: string; timeZone?: string; today?: string }> {
  try {
    const payload = await api(path);
    if (isRecord(payload) && text(payload, "status").toLowerCase() === "error") {
      return { rows: [], error: text(payload, "message", "error", "detail") || "The server could not verify this section." };
    }
    const metadata = isRecord(payload) ? payload : null;
    return {
      rows: rowsFrom(payload, key),
      error: "",
      timeZone: text(metadata, "timeZone"),
      today: text(metadata, "today"),
    };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Unable to load records." };
  }
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return localDate(date);
  }
}

function plusDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function organizationDateTimeIso(value: string, timeZone: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !timeZone) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const target = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };
  const targetAsUtc = Date.UTC(
    target.year, target.month - 1, target.day, target.hour, target.minute, 0,
  );
  let guess = targetAsUtc;

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
      );
      const displayedAsUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second),
      );
      const correction = targetAsUtc - displayedAsUtc;
      guess += correction;
      if (correction === 0) break;
    }

    const verified = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    if (
      Number(verified.year) !== target.year ||
      Number(verified.month) !== target.month ||
      Number(verified.day) !== target.day ||
      Number(verified.hour) !== target.hour ||
      Number(verified.minute) !== target.minute
    ) {
      return null;
    }

    return new Date(guess).toISOString();
  } catch {
    return null;
  }
}

function dateOf(row: Row, timeZone?: string): string {
  const value = text(row, "workDate", "work_date", "date", "periodStartDate", "period_start_date");
  if (!value) return "";

  // Date-only API values are calendar dates, not instants in time.
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (dateOnly) return dateOnly;

  // Interpret timestamp values using the organization timezone where available.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return timeZone ? dateInTimeZone(date, timeZone) : localDate(date);
}

function recordedAt(row: Row): string {
  return text(row, "recordedAt", "recorded_at", "requestedAt", "requested_at", "createdAt", "created_at", "timestamp");
}

function dateLabel(value: string, timeZone?: string): string {
  if (!value) return "—";

  // Keep date-only values as calendar dates; only timestamp values are
  // converted through a timezone-aware formatter.
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day, 12);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return value;
    }

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
}

function dateTimeLabel(value: string, timeZone?: string): string {
  return formatDateTime(value, timeZone);
}

function timeLabel(value: string, timeZone?: string): string {
  return formatTime(value, timeZone);
}

function humanize(value: string): string {
  return value
    ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Not specified";
}

function statusOf(row: Row): string {
  return text(row, "status", "approvalStatus", "approval_status", "state");
}

function statusStyle(status: string): string {
  const value = status.toUpperCase();
  if (/APPROVED|RESOLVED|CLOCKED_OUT|COMPLETED|ACTIVE/.test(value)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (/REJECTED|DISMISSED|FAILED|ERROR/.test(value)) return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  if (/PENDING|OPEN|RETURNED|LATE|POTENTIAL|DRAFT|REVIEW|SUBMITTED|UNRESOLVED/.test(value)) return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-slate-600 bg-slate-700/30 text-slate-300";
}

function employeeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Waiting for review",
    SUBMITTED: "Submitted for review",
    IN_REVIEW: "Under review",
    UNDER_REVIEW: "Under review",
    APPROVED: "Approved",
    REJECTED: "Not approved",
    RETURNED: "Changes requested",
    OPEN: "Needs attention",
    RESOLVED: "Resolved",
    DISMISSED: "Closed after review",
    COMPLETED: "Completed",
    DRAFT: "Draft",
  };
  return labels[status.toUpperCase()] || humanize(status);
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(status)}`}>{employeeStatusLabel(status)}</span>;
}

function Card({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <div className={`${PANEL} p-4 sm:p-5`}>
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/15 bg-sky-400/10 text-sky-300"><Icon size={17} /></span>
    </div>
    <p className="mt-4 break-words text-2xl font-bold tracking-tight text-white">{value}</p>
    <p className="mt-1 break-words text-xs leading-5 text-slate-500">{detail}</p>
  </div>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700 bg-black/10 px-5 py-8 text-center">
    <CalendarDays size={18} className="mx-auto text-slate-500" />
    <h3 className="mt-3 text-sm font-semibold text-slate-200">{title}</h3>
    <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{detail}</p>
  </div>;
}

function SectionError({ message }: { message: string }) {
  return message ? <div role="alert" className="mb-4 break-words rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm leading-6 text-rose-200">{message}</div> : null;
}

export default function EmployeeAttendanceWorkspace() {
  const user = useEmployeeWorkspaceUser();
  const [today, setToday] = useState("");
  const [calendarTimeZoneFromServer, setCalendarTimeZoneFromServer] = useState("");
  const [calendarTodayFromServer, setCalendarTodayFromServer] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadedFromDate, setLoadedFromDate] = useState("");
  const [loadedToDate, setLoadedToDate] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "recorded" | "no-records" | "leave" | "holiday">("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [serverClockStatus, setServerClockStatus] = useState<ClockStatus>("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [records, setRecords] = useState<Record<SectionKey, Row[]>>({
    calendar: [],
    events: [],
    corrections: [],
    overtime: [],
    leave: [],
    holidays: [],
  });
  const [errors, setErrors] = useState<Partial<Record<SectionKey, string>>>({});

  const [correctionEventId, setCorrectionEventId] = useState("");
  const [correctionType, setCorrectionType] = useState<"CLOCK_IN" | "CLOCK_OUT">("CLOCK_IN");
  const [correctionWorkDate, setCorrectionWorkDate] = useState("");
  const [correctionAt, setCorrectionAt] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const correctionDateTouched = useRef(false);
  const overtimeDateTouched = useRef(false);

  const [overtimeWorkDate, setOvertimeWorkDate] = useState("");
  const [overtimeMinutes, setOvertimeMinutes] = useState("60");
  const [overtimeReason, setOvertimeReason] = useState("");

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const validTabs: TabKey[] = ["today", "calendar", "monthly", "requests"];
    if (requestedTab === "corrections" || requestedTab === "overtime") {
      setActiveTab("requests");
    } else if (requestedTab && validTabs.includes(requestedTab as TabKey)) {
      setActiveTab(requestedTab as TabKey);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "requests") return;
    const targetId = window.location.hash.replace(/^#/, "");
    if (targetId !== "correction-request" && targetId !== "overtime-request") return;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab]);

  useEffect(() => {
    const todayValue = localDate(new Date());
    const start = plusDays(todayValue, -6);
    const end = plusDays(todayValue, 14);
    setToday(todayValue);
    setFromDate(start);
    setToDate(end);
    setLoadedFromDate(start);
    setLoadedToDate(end);
    setCorrectionWorkDate(todayValue);
    setOvertimeWorkDate(plusDays(todayValue, 1));
  }, []);

  const loadAttendance = useCallback(async (silent = false) => {
    if (!loadedFromDate || !loadedToDate) return;

    if (loadedFromDate > loadedToDate) {
      setErrors((current) => ({
        ...current,
        calendar: "The calendar start date must not be after its end date.",
      }));
      return;
    }

    if (!silent) setLoading(true);
    setServerClockStatus("");
    try {
      const query = `?fromDate=${encodeURIComponent(loadedFromDate)}&toDate=${encodeURIComponent(loadedToDate)}`;
      const [calendar, eventsResult, corrections, overtime, leaveRequests, holidays] = await Promise.all([
        section(`/attendance/calendar${query}`, "entries"),
        (async () => {
          try {
            const payload = await api("/attendance/events");
            const rawClockStatus = isRecord(payload)
              ? payload.clockStatus ?? (isRecord(payload.data) ? payload.data.clockStatus : undefined)
              : undefined;

            const clockStatus: ClockStatus =
              rawClockStatus === "CLOCKED_IN" || rawClockStatus === "CLOCKED_OUT"
                ? rawClockStatus
                : "";

            return {
              rows: rowsFrom(payload, "events"),
              error: clockStatus
                ? ""
                : "Your current clock status was not included in the server response. The system will recheck your attendance automatically; try again shortly.",
              clockStatus,
            };
          } catch (error) {
            return {
              rows: [] as Row[],
              error: error instanceof Error ? error.message : "Unable to load attendance events.",
              clockStatus: "" as const,
            };
          }
        })(),
        section("/attendance/corrections", "requests"),
        section("/attendance/overtime", "requests"),
        section("/leave/requests", "requests"),
        section(`/leave/holidays${query}`, "holidays"),
      ]);

      setRecords({
        calendar: calendar.rows,
        events: eventsResult.rows,
        corrections: corrections.rows,
        overtime: overtime.rows,
        leave: leaveRequests.rows,
        holidays: holidays.rows,
      });
      setServerClockStatus(eventsResult.clockStatus);
      if (calendar.timeZone) setCalendarTimeZoneFromServer(calendar.timeZone);
      if (calendar.today) setCalendarTodayFromServer(calendar.today);
      setErrors({
        calendar: calendar.error,
        events: eventsResult.error,
        corrections: corrections.error,
        overtime: overtime.error,
        leave: leaveRequests.error,
        holidays: holidays.error,
      });
    } finally {
      setLoading(false);
    }
  }, [loadedFromDate, loadedToDate]);

  useWorkspaceAutoRefresh(() => loadAttendance(true), {
    intervalMs: 60_000,
    shouldRefresh: () => !loading && !saving && !correctionEventId && !correctionReason.trim() && !overtimeReason.trim(),
  });

  useEffect(() => {
    if (user?.role === "EMPLOYEE" && loadedFromDate && loadedToDate) {
      void loadAttendance();
    }
  }, [user, loadedFromDate, loadedToDate, loadAttendance]);

  const calendarTimeZone = calendarTimeZoneFromServer || text(
    records.calendar.find((row) => text(row, "timeZone")) ?? {},
    "timeZone",
  ) || text(records.events.find((row) => text(row, "timeZone")) ?? {}, "timeZone");

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase();
    return records.calendar.filter((row) => {
      const events = Array.isArray(row.events) ? row.events.filter(isRecord) : [];
      const leave = isRecord(row.leaveRequest) ? row.leaveRequest : null;
      const holiday = isRecord(row.publicHoliday) ? row.publicHoliday : null;
      const hasSchedule = Boolean(text(row, "scheduleName"));
      const hasRecords = events.length > 0 || Boolean(text(row, "firstClockIn", "lastClockOut"));
      if (historyFilter === "recorded" && !hasRecords) return false;
      if (historyFilter === "no-records" && (!hasSchedule || hasRecords)) return false;
      if (historyFilter === "leave" && !leave) return false;
      if (historyFilter === "holiday" && !holiday) return false;
      if (!query) return true;
      const searchable = [
        dateOf(row, text(row, "timeZone") || calendarTimeZone),
        text(row, "scheduleName"),
        text(leave, "leaveType", "leave_type", "status"),
        text(holiday, "name"),
        text(row, "firstClockIn"),
        text(row, "lastClockOut"),
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [records.calendar, historySearch, historyFilter, calendarTimeZone]);

  // The server returns the organization's timezone on calendar rows. Correct
  // the initial form defaults once it is known, but never overwrite a date the
  // employee has already chosen.
  useEffect(() => {
    if (!calendarTimeZone) return;
    const organizationToday = calendarTodayFromServer || dateInTimeZone(new Date(), calendarTimeZone);
    setToday(organizationToday);
    if (!correctionDateTouched.current) setCorrectionWorkDate(organizationToday);
    if (!overtimeDateTouched.current) setOvertimeWorkDate(plusDays(organizationToday, 1));
  }, [calendarTimeZone, calendarTodayFromServer]);

  const tenantToday = calendarTimeZone
    ? dateInTimeZone(new Date(), calendarTimeZone)
    : today;

  const todayEntry =
    records.calendar.find((row) => dateOf(row, calendarTimeZone) === tenantToday) ?? null;

  // The raw event feed and calendar may group timestamped punches differently.
  // Use both sources and deduplicate by ID to keep Today's activity consistent
  // with the calendar without modifying any original attendance records.
  const todayEvents = useMemo(() => {
    const eventsById = new Map<string, Row>();
    const eventsWithoutId: Row[] = [];

    const addEvent = (row: Row) => {
      const id = idOf(row);

      if (id) {
        if (!eventsById.has(id)) eventsById.set(id, row);
        return;
      }

      const eventType = text(row, "eventType", "event_type").toUpperCase();
      const timestamp = recordedAt(row);
      const key = `${eventType}:${timestamp}`;

      const alreadyExists = eventsWithoutId.some(
        (item) =>
          `${text(item, "eventType", "event_type").toUpperCase()}:${recordedAt(item)}` === key,
      );

      if (!alreadyExists) eventsWithoutId.push(row);
    };

    records.events
      .filter((row) => dateOf(row, calendarTimeZone) === tenantToday)
      .forEach(addEvent);

    const groupedEvents = Array.isArray(todayEntry?.events)
      ? todayEntry.events.filter(isRecord)
      : [];

    groupedEvents.forEach(addEvent);

    return [...eventsById.values(), ...eventsWithoutId].sort(
      (a, b) =>
        new Date(recordedAt(b)).getTime() - new Date(recordedAt(a)).getTime(),
    );
  }, [records.events, tenantToday, todayEntry, calendarTimeZone]);

  const latestEvent = todayEvents[0] ?? null;

  const clockStatusVerified =
    (serverClockStatus === "CLOCKED_IN" || serverClockStatus === "CLOCKED_OUT") &&
    !errors.events;
  const clockedIn = clockStatusVerified && serverClockStatus === "CLOCKED_IN";
  const leaveAndHolidayStatusVerified = !errors.leave && !errors.holidays;
  const approvedLeaveToday = records.leave.find((row) => {
    const start = dateOf({ workDate: text(row, "startDate", "start_date", "fromDate", "from_date") }, calendarTimeZone);
    const end = dateOf({ workDate: text(row, "endDate", "end_date", "toDate", "to_date") }, calendarTimeZone);
    return statusOf(row).toUpperCase() === "APPROVED" && Boolean(start && end) && start <= tenantToday && end >= tenantToday;
  }) ?? null;
  const publicHolidayToday = records.holidays.find((row) =>
    dateOf({ workDate: text(row, "holidayDate", "holiday_date", "date", "workDate", "work_date") }, calendarTimeZone) === tenantToday,
  ) ?? null;
  const attendanceBlock = approvedLeaveToday
    ? {
        title: "Approved leave today",
        detail: `${humanize(text(approvedLeaveToday, "leaveType", "leave_type"))} leave is approved for today. Clock-in is not allowed for this date.`,
      }
    : publicHolidayToday
      ? {
          title: "Public holiday today",
          detail: `${text(publicHolidayToday, "name") || "Organization public holiday"}. Clock-in is not allowed for this date.`,
        }
      : null;
  const clockInBlocked = !leaveAndHolidayStatusVerified || Boolean(attendanceBlock);

  const pendingCorrections = records.corrections.filter(
    (row) => statusOf(row) === "PENDING",
  ).length;

  async function recordClockAction() {
    if (!clockStatusVerified || loading || saving) return;

    const action = clockedIn ? "CLOCK_OUT" : "CLOCK_IN";
    setSaving(action);
    setNotice(null);

    try {
      await api("/attendance/events", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      window.dispatchEvent(new Event("hrms:attendance-status-changed"));

      setNotice({
        type: "success",
        message: action === "CLOCK_IN" ? "Clock-in recorded." : "Clock-out recorded.",
      });

      await loadAttendance();
    } catch (error) {
      // A network error can happen after the server has committed the punch.
      // Refresh the authoritative status before the employee tries again.
      await loadAttendance();
      setNotice({
        type: "error",
        message: `${error instanceof Error ? error.message : "Unable to confirm the attendance action."} Your server status has been checked. Review it before trying again.`,
      });
    } finally {
      setSaving("");
    }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const requestedAt = organizationDateTimeIso(correctionAt, calendarTimeZone);
    const reason = correctionReason.trim();

    if (!requestedAt || !reason || reason.length > 500) {
      setNotice({
        type: "error",
        message: "Choose a valid time in your organization's timezone and provide a reason of no more than 500 characters. Check daylight-saving changes for the selected date if applicable.",
      });
      return;
    }

    const selected = records.events.find((row) => idOf(row) === correctionEventId);
    const actualEventType = selected
      ? text(selected, "eventType", "event_type")
      : correctionType;

    const body: Row = {
      eventType: actualEventType,
      requestedAt,
      originalEventId: correctionEventId || null,
      reason,
    };

    if (!correctionEventId) body.workDate = correctionWorkDate;

    setSaving("correction");
    setNotice(null);

    try {
      await api("/attendance/corrections", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setCorrectionReason("");
      setCorrectionEventId("");
      setNotice({
        type: "success",
        message: "Your correction request was submitted for review.",
      });

      await loadAttendance();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to submit the correction request.",
      });
    } finally {
      setSaving("");
    }
  }

  async function submitOvertime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const minutes = Number(overtimeMinutes);
    const reason = overtimeReason.trim();
    const todayInOrganization = calendarTimeZone
      ? dateInTimeZone(new Date(), calendarTimeZone)
      : localDate(new Date());

    if (!overtimeWorkDate || overtimeWorkDate <= todayInOrganization) {
      setNotice({
        type: "error",
        message: "Choose a future date. Overtime must be requested and approved before the extra work begins.",
      });
      return;
    }

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440 ||
      !reason ||
      reason.length > 500
    ) {
      setNotice({
        type: "error",
        message: "Enter 1–1440 overtime minutes and provide a reason of no more than 500 characters.",
      });
      return;
    }

    setSaving("overtime");
    setNotice(null);

    try {
      await api("/attendance/overtime", {
        method: "POST",
        body: JSON.stringify({
          requestType: "PREAUTHORIZATION",
          workDate: overtimeWorkDate,
          requestedMinutes: minutes,
          reason,
        }),
      });

      setOvertimeReason("");
      setNotice({
        type: "success",
        message: "Your advance overtime request was submitted. Wait for approval before working the extra time.",
      });

      await loadAttendance();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to submit the overtime request.",
      });
    } finally {
      setSaving("");
    }
  }

  function applyCalendarDates() {
    if (!fromDate || !toDate || fromDate > toDate) {
      setNotice({ type: "error", message: "Choose a valid calendar date range." });
      return;
    }

    const days =
      Math.floor(
        (new Date(`${toDate}T12:00:00`).getTime() -
          new Date(`${fromDate}T12:00:00`).getTime()) /
          86400000,
      ) + 1;

    if (days > 31) {
      setNotice({
        type: "error",
        message: "Choose a calendar range of 31 days or fewer.",
      });
      return;
    }

    setNotice(null);
    setLoadedFromDate(fromDate);
    setLoadedToDate(toDate);
    setActiveTab("calendar");
  }

  if (!user || user.role !== "EMPLOYEE") return null;

  const tabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? "Attendance";

  return (
    <div className="employee-attendance-workspace min-w-0 space-y-5 text-slate-100">
      <header className="employee-attendance-page-header flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 pb-5 sm:flex-row sm:items-end sm:p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300">
            My work · Attendance
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Attendance &amp; time
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Record actual working time, compare attendance history with scheduled shifts, and resolve your time records.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 sm:self-auto">
          <CalendarDays size={16} className="text-sky-300" />
          <span className="text-sm font-medium text-slate-300">
            {dateLabel(tenantToday, calendarTimeZone)}
          </span>
        </div>
      </header>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex min-w-0 items-start gap-3 rounded-xl border p-3.5 text-sm leading-6 ${
            notice.type === "success"
              ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
              : "border-rose-400/20 bg-rose-400/[0.06] text-rose-200"
          }`}
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{notice.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="shrink-0"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}

      <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          icon={Clock3}
          label="Today's status"
          value={!clockStatusVerified ? "Status unavailable" : clockedIn ? "Clocked in" : todayEvents.length ? "Clocked out" : "Not started"}
          detail={
            !clockStatusVerified
              ? "Wait for the system to verify your current attendance status"
              : latestEvent
              ? `Last event: ${timeLabel(recordedAt(latestEvent), text(latestEvent, "timeZone") || calendarTimeZone)}`
              : "No attendance event recorded today"
          }
        />
        <Card
          icon={CalendarDays}
          label="Scheduled days"
          value={String(records.calendar.filter((row) => Boolean(text(row, "expectedStart"))).length)}
          detail={`${dateLabel(loadedFromDate, calendarTimeZone)} – ${dateLabel(loadedToDate, calendarTimeZone)}`}
        />
        <Card
          icon={FileClock}
          label="Open corrections"
          value={String(pendingCorrections)}
          detail="Requests waiting for a decision"
        />
        <Card
          icon={FileClock}
          label="Pending overtime"
          value={String(records.overtime.filter((row) => statusOf(row).toUpperCase() === "PENDING").length)}
          detail="Advance requests waiting for a manager's decision"
        />
      </section>

      <section className={`${PANEL} overflow-hidden`}>
        <div className="grid min-w-0 gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  !clockStatusVerified
                    ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                    : clockedIn
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-slate-600 bg-slate-700/30 text-slate-300"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    !clockStatusVerified ? "bg-amber-300" : clockedIn ? "bg-emerald-300" : "bg-slate-400"
                  }`}
                />
                {!clockStatusVerified ? "Attendance status unavailable" : clockedIn ? "Work session open" : "No open work session"}
              </span>
              <span className="text-xs text-slate-500">
                {dateLabel(tenantToday, calendarTimeZone)}
              </span>
            </div>

            <h2 className="mt-3 text-xl font-bold tracking-tight">
              {!clockStatusVerified ? "We need to verify your attendance" : clockedIn ? "You're currently clocked in" : "Record your working time"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {!clockStatusVerified
                ? "Your current attendance state has not been confirmed by the server. The system will recheck your attendance automatically; try again shortly."
                : "Record the beginning and end of your work period. If you forget a punch or record the wrong time, submit a correction request rather than overwriting the original event."}
            </p>

            {todayEntry && (
              <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/[0.07] bg-black/10 px-3.5 py-2.5 text-sm">
                <CalendarDays size={16} className="shrink-0 text-sky-300" />
                <span className="break-words font-semibold">
                  {text(todayEntry, "scheduleName") || "Today's shift"}
                </span>
                <span className="text-slate-400">
                  {timeLabel(text(todayEntry, "expectedStart"), text(todayEntry, "timeZone") || calendarTimeZone)}
                  {" – "}
                  {timeLabel(text(todayEntry, "expectedEnd"), text(todayEntry, "timeZone") || calendarTimeZone)}
                </span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col items-start gap-2 lg:items-end">
            {attendanceBlock && (
              <div role="status" className="w-full max-w-sm rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-3 text-left lg:max-w-72">
                <p className="text-sm font-bold text-amber-100">{attendanceBlock.title}</p>
                <p className="mt-1 text-xs leading-5 text-amber-100/75">{attendanceBlock.detail}</p>
                {clockedIn && <p className="mt-2 text-xs font-semibold text-amber-100">An open session remains active. Clock out to close it safely.</p>}
              </div>
            )}
            {!leaveAndHolidayStatusVerified && !loading && (
              <div role="alert" className="w-full max-w-sm rounded-xl border border-rose-300/25 bg-rose-300/[0.07] p-3 text-xs leading-5 text-rose-100 lg:max-w-72">
                Today's leave/holiday status could not be verified. Clock-in remains disabled until the system confirms your status.
              </div>
            )}
            <button
              type="button"
              onClick={() => void recordClockAction()}
              disabled={Boolean(saving) || loading || !clockStatusVerified || (!clockedIn && clockInBlocked)}
              className={`inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
                clockedIn
                  ? "bg-rose-500 text-white shadow-rose-950/20 hover:bg-rose-400"
                  : "bg-emerald-500 text-[#052016] shadow-emerald-950/20 hover:bg-emerald-400"
              }`}
            >
              {saving === "CLOCK_IN" || saving === "CLOCK_OUT" ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : clockedIn ? (
                <ArrowDownRight size={18} />
              ) : (
                <ArrowUpRight size={18} />
              )}
              {saving === "CLOCK_IN"
                ? "Clocking in…"
                : saving === "CLOCK_OUT"
                  ? "Clocking out…"
                  : !clockStatusVerified
                    ? "Status unavailable"
                    : clockedIn
                      ? "Clock out"
                      : !leaveAndHolidayStatusVerified
                        ? "Verifying leave & holidays…"
                        : attendanceBlock
                          ? "Attendance unavailable today"
                          : "Clock in"}
            </button>
            <p className="max-w-64 text-xs leading-5 text-slate-500 lg:text-right">
              {!clockStatusVerified
                ? "Wait for automatic attendance verification before recording a punch."
                : clockedIn
                  ? "You can always clock out to close an open work session."
                  : !leaveAndHolidayStatusVerified
                    ? "We cannot confirm today's leave and holiday status. Wait for automatic leave and holiday verification before clocking in."
                    : attendanceBlock
                      ? "No clock-in is allowed on approved leave or a public holiday."
                      : "The server records the event time and validates the punch sequence."}
            </p>
          </div>
        </div>
      </section>

      <nav
        aria-label="Employee attendance sections"
        className="flex min-w-0 gap-1.5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#101722] p-1.5"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
              activeTab === id
                ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/20"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-300">
              {activeTab === "requests" ? "Take action" : "Personal records"}
            </p>
            <h2 className="mt-1 text-xl font-bold">{tabLabel}</h2>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw size={13} className="animate-spin" />
            Refreshing your attendance records…
          </div>
        )}

        {activeTab === "today" && (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className={`${PANEL} p-5 sm:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Today's activity</h3>
                  <p className="mt-1 text-sm text-slate-500">Your recent attendance events</p>
                </div>
                <Activity size={19} className="shrink-0 text-sky-300" />
              </div>
              <SectionError message={errors.events || ""} />
              <div className="mt-5">
                {todayEvents.length === 0 ? (
                  <Empty
                    title="No punches recorded today"
                    detail="Your clock-in and clock-out events appear here after they are recorded."
                  />
                ) : (
                  <div className="space-y-3">
                    {todayEvents.map((row, index) => {
                      const kind = text(row, "eventType", "event_type").toUpperCase();
                      const isIn = kind === "CLOCK_IN";
                      const timeZone = text(row, "timeZone") || calendarTimeZone;

                      return (
                        <div
                          key={idOf(row) || `${kind}-${index}`}
                          className="flex min-w-0 items-start gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3.5"
                        >
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                              isIn
                                ? "bg-emerald-400/10 text-emerald-300"
                                : "bg-sky-400/10 text-sky-300"
                            }`}
                          >
                            {isIn ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold">{humanize(kind)}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {dateTimeLabel(recordedAt(row), timeZone)}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-semibold">
                            {timeLabel(recordedAt(row), timeZone)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/30 p-3.5">
                <p className="text-xs leading-5 text-slate-400">
                  Original punches are retained. Request a correction if an event is missing or incorrect.
                </p>
              </div>
            </div>

            <div className={`${PANEL} p-5 sm:p-6`}>
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-200">
                  <CalendarDays size={19} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">Today’s planned shift</h3>
                  <p className="mt-1 text-sm text-slate-500">Expected hours, separate from actual punches</p>
                </div>
              </div>
              <SectionError message={errors.calendar || ""} />

              <div className="mt-4 flex justify-end">
                <Link href="/employee/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200">
                  View attendance calendar <CalendarDays size={14} />
                </Link>
              </div>

              {attendanceBlock ? (
                <div role="status" className={`mt-3 rounded-xl border p-4 ${approvedLeaveToday ? "border-amber-300/25 bg-amber-300/[0.06]" : "border-sky-300/25 bg-sky-300/[0.06]"}`}>
                  <div className="flex items-start gap-3">
                    <CalendarDays size={19} className={`mt-0.5 shrink-0 ${approvedLeaveToday ? "text-amber-200" : "text-sky-200"}`} />
                    <div className="min-w-0">
                      <p className={`font-semibold ${approvedLeaveToday ? "text-amber-100" : "text-sky-100"}`}>{attendanceBlock.title}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-300">{attendanceBlock.detail}</p>
                      {todayEntry && <p className="mt-2 text-xs leading-5 text-slate-400">An assigned shift also exists for today, but the approved time-off/holiday status takes precedence for attendance.</p>}
                    </div>
                  </div>
                </div>
              ) : !leaveAndHolidayStatusVerified ? (
                <div role="alert" className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/[0.06] p-4">
                  <p className="font-semibold text-rose-100">Leave and holiday status unavailable</p>
                  <p className="mt-1 text-sm leading-5 text-slate-300">We could not verify whether today is approved leave or a public holiday. The shift summary is withheld until that status can be confirmed.</p>
                </div>
              ) : todayEntry ? (
                <div className="mt-3 space-y-4">
                  <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Schedule</p>
                    <p className="mt-2 break-words text-lg font-bold">
                      {text(todayEntry, "scheduleName") || "Assigned shift"}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Starts</p>
                        <p className="mt-1 font-semibold">
                          {timeLabel(text(todayEntry, "expectedStart"), text(todayEntry, "timeZone") || calendarTimeZone)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Ends</p>
                        <p className="mt-1 font-semibold">
                          {timeLabel(text(todayEntry, "expectedEnd"), text(todayEntry, "timeZone") || calendarTimeZone)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.05] p-3.5">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-sky-300" />
                    <p className="text-xs leading-5 text-slate-400">
                      The schedule describes expected work time. Recorded punches are tracked separately as actual attendance.
                    </p>
                  </div>
                </div>
              ) : errors.calendar ? null : loading || !loadedFromDate ? (
                <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/10 p-4 text-sm text-slate-400">
                  <RefreshCw size={15} className="animate-spin text-sky-300" />
                  Loading your planned shift…
                </div>
              ) : (
                <div className="mt-5">
                  <Empty
                    title="No scheduled shift for today"
                    detail="No schedule entry for today was returned by the HRMS. If today is a leave day or public holiday, its status is shown above. Use History to inspect your attendance records across a wider date range."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div className={`${PANEL} overflow-hidden`}>
            <div className="border-b border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Attendance records</p>
                  <h3 className="mt-1 text-lg font-bold text-white">Your work history</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-400">Review planned shifts, punches, leave, holidays, and recorded work time by date.</p>
                </div>
              </div>
              <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-end">
                <label className="block min-w-0 text-xs font-semibold text-slate-400">From date
                  <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={INPUT} />
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-400">To date
                  <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={INPUT} />
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-400">Show
                  <select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value as typeof historyFilter)} className={INPUT}>
                    <option value="all">All records</option>
                    <option value="recorded">Punches recorded</option>
                    <option value="no-records">Scheduled, no punches</option>
                    <option value="leave">Leave dates</option>
                    <option value="holiday">Public holidays</option>
                  </select>
                </label>
                <button type="button" className={`${PRIMARY} mt-1`} onClick={applyCalendarDates} disabled={loading}>
                  <CalendarDays size={16} /> Apply dates
                </button>
              </div>
              <label className="mt-3 block text-xs font-semibold text-slate-400">Search history
                <input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search date, shift, leave, holiday, or time…" className={INPUT} />
              </label>
              <p className="mt-2 text-xs text-slate-500">Showing {filteredHistory.length} of {records.calendar.length} loaded days. Choose a date range of up to 31 days.</p>
            </div>
            <div className="p-4 sm:p-5">
              <SectionError message={errors.calendar || ""} />
              {records.calendar.length === 0 ? (
                <Empty title="No attendance history yet" detail="Your scheduled shifts, recorded punches, leave, and holidays will appear here when available." />
              ) : filteredHistory.length === 0 ? (
                <Empty title="No matching days" detail="Try another search term or change the record filter or date range." />
              ) : (
                <div className="space-y-3">
                  {filteredHistory.map((row, index) => {
                    const rowTimeZone = text(row, "timeZone") || calendarTimeZone;
                    const rowDate = dateOf(row, rowTimeZone);
                    const events = Array.isArray(row.events) ? row.events.filter(isRecord) : [];
                    const leave = isRecord(row.leaveRequest) ? row.leaveRequest : null;
                    const holiday = isRecord(row.publicHoliday) ? row.publicHoliday : null;
                    const hasSchedule = Boolean(text(row, "scheduleName"));
                    const hasRecords = events.length > 0 || Boolean(text(row, "firstClockIn", "lastClockOut"));
                    const dayStatus = holiday ? "PUBLIC HOLIDAY" : leave ? text(leave, "status") || "LEAVE" : hasRecords ? "RECORDED" : hasSchedule ? "NO_RECORDS" : "NO_SHIFT";
                    const workedMinutes = number(row, "workedMinutes", "worked_minutes");
                    const totalWorkedMinutes = workedMinutes === null ? null : Math.max(0, Math.round(workedMinutes));
                    const workedLabel = totalWorkedMinutes === null ? "—" : `${Math.floor(totalWorkedMinutes / 60)}h ${totalWorkedMinutes % 60}m`;
                    return (
                      <article key={idOf(row) || `${rowDate}-${index}`} className="min-w-0 rounded-xl border border-white/[0.08] bg-black/10 p-4 transition-colors hover:border-white/[0.14]">
                        <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">{dateLabel(rowDate, rowTimeZone)}</p>
                            <p className="mt-1 break-words text-sm text-slate-400">{text(row, "scheduleName") || (holiday ? "Public holiday" : leave ? "Leave day" : "No scheduled shift")}</p>
                            {(holiday || leave) && <div className="mt-2 flex flex-wrap gap-2">
                              {holiday && <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-2.5 py-1 text-xs font-semibold text-sky-200">Holiday · {text(holiday, "name") || "Public holiday"}</span>}
                              {leave && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${text(leave, "status").toUpperCase() === "APPROVED" ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-amber-300/20 bg-amber-300/[0.07] text-amber-200"}`}>{humanize(text(leave, "leaveType", "leave_type"))} leave · {employeeStatusLabel(text(leave, "status"))}</span>}
                            </div>}
                          </div>
                          <StatusPill status={dayStatus} />
                        </div>
                        <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                          {[
                            ["Scheduled in", text(row, "expectedStart")],
                            ["Scheduled out", text(row, "expectedEnd")],
                            ["Clock-in", text(row, "firstClockIn")],
                            ["Clock-out", text(row, "lastClockOut")],
                            ["Worked", workedLabel],
                          ].map(([label, value]) => (
                            <div key={label} className="min-w-0 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                              <p className="text-[11px] text-slate-500">{label}</p>
                              <p className="mt-1 break-words text-sm font-semibold text-slate-200">{label === "Worked" ? value : timeLabel(value, rowTimeZone)}</p>
                            </div>
                          ))}
                        </div>
                        {events.length > 0 && <details className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-300">Recorded events ({events.length})</summary>
                          <div className="mt-3 flex flex-wrap gap-2">{events.map((item, eventIndex) => <span key={idOf(item) || `${text(item, "eventType", "event_type")}-${eventIndex}`} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-xs text-slate-300">{humanize(text(item, "eventType", "event_type"))} · {timeLabel(recordedAt(item), text(item, "timeZone") || rowTimeZone)}</span>)}</div>
                        </details>}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "monthly" && (
          <AttendanceMonthlyHoursView audience="employee" />
        )}


        {activeTab === "requests" && (
          <div className="space-y-4">
          <div className="rounded-2xl border border-sky-300/15 bg-sky-300/[0.045] p-4 sm:p-5">
            <h2 className="text-sm font-bold text-white">Requests & corrections</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Submit a correction for a recorded or missing punch, and request overtime through the existing review workflow. Original attendance events remain unchanged.</p>
          </div>
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <form onSubmit={submitCorrection} className={`${PANEL} p-5 sm:p-6`}>
              <h3 id="correction-request" className="font-semibold">Request an attendance correction</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Choose a recorded punch to request a time correction, or report a missing clock-in or clock-out. Your original attendance event is never overwritten.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-slate-300">
                  Original punch
                  <select
                    value={correctionEventId}
                    onChange={(event) => setCorrectionEventId(event.target.value)}
                    className={INPUT}
                  >
                    <option value="">Missing punch / no original event</option>
                    {records.events.map((row) => {
                      const id = idOf(row);
                      return id ? (
                        <option key={id} value={id}>
                          {humanize(text(row, "eventType", "event_type"))}
                          {" — "}
                          {dateTimeLabel(recordedAt(row), text(row, "timeZone") || calendarTimeZone)}
                        </option>
                      ) : null;
                    })}
                  </select>
                </label>

                {!correctionEventId && (
                  <>
                    <label className="block text-sm font-medium text-slate-300">
                      Missing punch type
                      <select
                        value={correctionType}
                        onChange={(event) =>
                          setCorrectionType(event.target.value as "CLOCK_IN" | "CLOCK_OUT")
                        }
                        className={INPUT}
                      >
                        <option value="CLOCK_IN">Clock-in</option>
                        <option value="CLOCK_OUT">Clock-out</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-300">
                      Work date
                      <input
                        type="date"
                        value={correctionWorkDate}
                        onChange={(event) => { correctionDateTouched.current = true; setCorrectionWorkDate(event.target.value); }}
                        required
                        className={INPUT}
                      />
                    </label>
                  </>
                )}

                <label className="block text-sm font-medium text-slate-300">
                  Requested date and time ({calendarTimeZone || "organization timezone"})
                  <input
                    type="datetime-local"
                    value={correctionAt}
                    onChange={(event) => setCorrectionAt(event.target.value)}
                    required
                    className={INPUT}
                  />
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Enter the time as it occurred in your organization's timezone. This request is reviewed before it changes your attendance record.</span>
                </label>
                <label className="block text-sm font-medium text-slate-300">
                  Reason
                  <textarea
                    value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    required
                    rows={4}
                    maxLength={500}
                    placeholder="Explain what happened and why the time needs correction."
                    className={INPUT}
                  />
                </label>
                <button type="submit" disabled={Boolean(saving)} className={PRIMARY}>
                  {saving === "correction" ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Submit correction
                </button>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Submitting a request does not change the original punch. A reviewer must decide the request.
              </p>
            </form>

            <div className={`${PANEL} p-5 sm:p-6`}>
              <h3 className="font-semibold">My correction requests</h3>
              <p className="mt-1 text-sm text-slate-500">Track your requests and review decisions.</p>
              <SectionError message={errors.corrections || ""} />

              <div className="mt-5 space-y-3">
                {records.corrections.length === 0 ? (
                  <Empty title="No correction requests" detail="Requests you submit will appear here." />
                ) : (
                  records.corrections.map((row, index) => (
                    <article
                      key={idOf(row) || `correction-${index}`}
                      className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-4"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {humanize(text(row, "eventType", "event_type"))}
                            {" · "}
                            {dateLabel(text(row, "workDate", "work_date"), text(row, "timeZone") || calendarTimeZone)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Requested:{" "}
                            {dateTimeLabel(text(row, "requestedAt", "requested_at"), text(row, "timeZone") || calendarTimeZone)}
                          </p>
                        </div>
                        <StatusPill status={statusOf(row)} />
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                        {text(row, "reason") || "No reason returned"}
                      </p>
                      {text(row, "reviewerNote", "reviewer_note") && (
                        <p className="mt-3 break-words rounded-lg bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
                          Reviewer note: {text(row, "reviewerNote", "reviewer_note")}
                        </p>
                      )}
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
          </div>
        )}


        {activeTab === "requests" && (
          <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Need to follow up on something you already submitted?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Use My Requests to see review status, decisions and manager notes in one place.</p>
            </div>
            <Link href="/employee/requests" className={SECONDARY}>Track my requests</Link>
          </div>
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <form onSubmit={submitOvertime} className={`${PANEL} p-5 sm:p-6`}>
              <h3 id="overtime-request" className="font-semibold">Request overtime approval</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Request approval before working extra time. You must wait for your manager's approval before starting overtime. Actual worked time is recorded separately by clock-in and clock-out.
              </p>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-3 text-xs leading-5 text-sky-100">
                  Overtime must be requested in advance. Requests for a date that has already started or passed cannot be submitted here. Approval gives permission; it does not automatically mean the full requested duration was worked or payable.
                </div>

                <label className="block text-sm font-medium text-slate-300">
                  Planned overtime date
                  <input
                    type="date"
                    min={today ? plusDays(today, 1) : undefined}
                    required
                    value={overtimeWorkDate}
                    onChange={(event) => { overtimeDateTouched.current = true; setOvertimeWorkDate(event.target.value); }}
                    className={INPUT}
                  />
                </label>

                <label className="block text-sm font-medium text-slate-300">
                  Requested overtime minutes
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    required
                    value={overtimeMinutes}
                    onChange={(event) => setOvertimeMinutes(event.target.value)}
                    className={INPUT}
                  />
                </label>

                <label className="block text-sm font-medium text-slate-300">
                  Reason
                  <textarea
                    required
                    rows={4}
                    maxLength={500}
                    value={overtimeReason}
                    onChange={(event) => setOvertimeReason(event.target.value)}
                    placeholder="Explain why the extra working time was needed."
                    className={INPUT}
                  />
                </label>

                <button
                  type="submit"
                  disabled={Boolean(saving)}
                  className={PRIMARY}
                >
                  {saving === "overtime" ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Request overtime approval
                </button>


              </div>
            </form>

            <div className={`${PANEL} p-5 sm:p-6`}>
              <h3 className="font-semibold">My overtime requests</h3>
              <p className="mt-1 text-sm text-slate-500">
                Requested and approved overtime minutes are tracked separately.
              </p>
              <SectionError message={errors.overtime || ""} />

              <div className="mt-5 space-y-3">
                {records.overtime.length === 0 ? (
                  <Empty title="No overtime requests" detail="Your submitted overtime requests will appear here." />
                ) : (
                  records.overtime.map((row, index) => {
                    const timeZone = text(row, "timeZone") || calendarTimeZone;
                    return (
                      <article
                        key={idOf(row) || `overtime-${index}`}
                        className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-4"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {number(row, "requestedMinutes", "requested_minutes") ?? "—"} minutes requested
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {dateLabel(text(row, "workDate", "work_date"), timeZone)}
                              {" · "}
                              {humanize(text(row, "requestType", "request_type"))}
                            </p>
                          </div>
                          <StatusPill status={statusOf(row)} />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                          <span className="text-slate-400">
                            Approved:{" "}
                            <strong className="text-slate-100">
                              {number(row, "approvedMinutes", "approved_minutes") ?? 0} min
                            </strong>
                          </span>
                          <span className="text-slate-400">
                            Requested:{" "}
                            <strong className="text-slate-100">
                              {number(row, "requestedMinutes", "requested_minutes") ?? "—"} min
                            </strong>
                          </span>
                        </div>

                        <p className="mt-3 break-words text-sm leading-6 text-slate-400">
                          {text(row, "reason") || "No reason returned"}
                        </p>

                        {text(row, "reviewerNote", "reviewer_note") && (
                          <p className="mt-3 break-words rounded-lg bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
                            Reviewer note: {text(row, "reviewerNote", "reviewer_note")}
                          </p>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          </div>
        )}
      </section>
    </div>
  );
}

