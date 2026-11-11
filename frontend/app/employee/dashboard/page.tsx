
"use client";

import AttendanceAlerts from "../../components/notifications/AttendanceAlerts";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Timer,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../../components/shared/useWorkspaceAutoRefresh";
import { useEmployeeWorkspaceUser } from "../../components/employee/EmployeeChrome";
import AttendanceCalendarView from "../../components/attendance/AttendanceCalendarView";

type Row = Record<string, unknown>;
type ClockStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "";
type Notice = {
  type: "success" | "error";
  message: string;
};

const PANEL =
  "min-w-0 rounded-2xl border border-white/[0.075] bg-[#121b28] shadow-lg shadow-black/10 transition-colors duration-200 hover:border-white/[0.12]";

const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-[#041d14] shadow-sm shadow-emerald-950/20 transition-colors hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

const CLOCK_OUT_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-rose-500 px-6 py-3.5 text-sm font-bold text-white shadow-sm shadow-rose-950/20 transition-colors hover:bg-rose-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.11] bg-[#0f1723] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-sky-300/35 hover:bg-sky-300/[0.05] hover:text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

const MUTED_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";

function isRecord(value: unknown): value is Row {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function read(
  row: Row | null | undefined,
  ...keys: string[]
): string {
  if (!row) return "";

  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function recordsFrom(payload: unknown, key: string): Row[] {
  if (!isRecord(payload)) return [];

  const direct = payload[key];

  if (Array.isArray(direct)) {
    return direct.filter(isRecord);
  }

  if (isRecord(payload.data)) {
    const nested = payload.data[key];

    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
  }

  return [];
}

function errorMessage(payload: unknown): string {
  return isRecord(payload)
    ? read(payload, "message", "error", "detail")
    : "";
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload) ||
        `The request failed with HTTP ${response.status}.`,
    );
  }

  return payload;
}

function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);

  date.setDate(date.getDate() + days);

  return localDate(date);
}

function dateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const values: Record<string, string> = {};

    for (const part of parts) {
      values[part.type] = part.value;
    }

    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return localDate(date);
  }
}

function dateOf(row: Row, timeZone: string): string {
  const value = read(
    row,
    "workDate",
    "work_date",
    "date",
    "periodStartDate",
    "period_start_date",
  );

  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return dateInTimeZone(date, timeZone);
}

function timestampOf(row: Row): string {
  return read(
    row,
    "recordedAt",
    "recorded_at",
    "timestamp",
    "createdAt",
    "created_at",
  );
}

function eventTypeOf(row: Row): string {
  return read(row, "eventType", "event_type").toUpperCase();
}

function timestampMilliseconds(row: Row): number | null {
  const stamp = timestampOf(row);
  if (!stamp) return null;

  const milliseconds = new Date(stamp).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function zonedLocalDateTimeMilliseconds(
  dateValue: string,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const [year, month, day] = dateValue.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetUtc;

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

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = formatter.formatToParts(new Date(guess));
      const values: Record<string, string> = {};

      for (const part of parts) values[part.type] = part.value;

      const displayedAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second),
      );

      const correction = targetUtc - displayedAsUtc;
      guess += correction;

      if (correction === 0) break;
    }

    return guess;
  } catch {
    return new Date(year, month - 1, day, hour, minute, 0).getTime();
  }
}

function zonedDayBounds(
  dateValue: string,
  timeZone: string,
): { startMs: number; endMs: number } {
  const nextDay = addDays(dateValue, 1);

  return {
    startMs: zonedLocalDateTimeMilliseconds(dateValue, 0, 0, timeZone),
    endMs: zonedLocalDateTimeMilliseconds(nextDay, 0, 0, timeZone),
  };
}

function formatElapsedDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatLiveDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

type WorkSession = {
  startMs: number;
  endMs: number | null;
};

type DailyWorkSummary = {
  totalTodayMs: number;
  activeSessionMs: number | null;
  activeSessionStartMs: number | null;
  lastCompletedSessionMs: number | null;
  completedSessionsToday: number;
};

function mergeAttendanceEvents(events: Row[], calendarEntries: Row[]): Row[] {
  const byKey = new Map<string, Row>();

  const add = (row: Row, preferCalendarVersion = false) => {
    const kind = eventTypeOf(row);
    if (kind !== "CLOCK_IN" && kind !== "CLOCK_OUT") return;

    const timestamp = timestampOf(row);
    if (!timestamp || timestampMilliseconds(row) === null) return;

    const id = read(row, "id", "eventId", "event_id");
    const key = id || `${kind}:${timestamp}`;

    if (preferCalendarVersion || !byKey.has(key)) {
      byKey.set(key, row);
    }
  };

  events.forEach((row) => add(row));

  // Calendar events may contain effective events that reflect approved
  // corrections. Prefer those versions when the event identity matches.
  for (const entry of calendarEntries) {
    const groupedEvents = Array.isArray(entry.events)
      ? entry.events.filter(isRecord)
      : [];

    groupedEvents.forEach((row) => add(row, true));
  }

  return [...byKey.values()].sort(
    (first, second) =>
      (timestampMilliseconds(first) ?? 0) -
      (timestampMilliseconds(second) ?? 0),
  );
}

function calculateDailyWorkSummary(
  rows: Row[],
  workDate: string,
  timeZone: string,
  nowMs: number,
  clockedIn: boolean,
): DailyWorkSummary {
  const { startMs: dayStartMs, endMs: dayEndMs } = zonedDayBounds(
    workDate,
    timeZone,
  );

  const sessions: WorkSession[] = [];
  let openStartMs: number | null = null;

  for (const row of rows) {
    const eventType = eventTypeOf(row);
    const eventMs = timestampMilliseconds(row);

    if (eventMs === null) continue;

    if (eventType === "CLOCK_IN") {
      // Ignore a duplicate clock-in in an already-open sequence. The API
      // remains the source of truth and normally prevents this situation.
      if (openStartMs === null) openStartMs = eventMs;
      continue;
    }

    if (eventType === "CLOCK_OUT" && openStartMs !== null) {
      if (eventMs >= openStartMs) {
        sessions.push({ startMs: openStartMs, endMs: eventMs });
      }
      openStartMs = null;
    }
  }

  const activeSessionStartMs = clockedIn ? openStartMs : null;

  if (clockedIn && openStartMs !== null) {
    sessions.push({ startMs: openStartMs, endMs: null });
  }

  let totalTodayMs = 0;
  let lastCompletedSessionMs: number | null = null;
  let lastCompletedEndMs = -1;
  let completedSessionsToday = 0;

  for (const session of sessions) {
    const sessionIsActive = session.endMs === null;
    const sessionEndMs = sessionIsActive
      ? (nowMs > 0 ? nowMs : session.startMs)
      : session.endMs!;

    const overlapStart = Math.max(session.startMs, dayStartMs);
    const overlapEnd = Math.min(sessionEndMs, dayEndMs);
    const overlapMs = Math.max(0, overlapEnd - overlapStart);

    totalTodayMs += overlapMs;

    if (
      !sessionIsActive &&
      session.endMs !== null &&
      session.endMs >= dayStartMs &&
      session.endMs < dayEndMs
    ) {
      completedSessionsToday += 1;

      if (session.endMs > lastCompletedEndMs) {
        lastCompletedEndMs = session.endMs;
        lastCompletedSessionMs = session.endMs - session.startMs;
      }
    }
  }

  const activeSessionMs =
    activeSessionStartMs !== null && nowMs > 0
      ? Math.max(0, nowMs - activeSessionStartMs)
      : null;

  return {
    totalTodayMs,
    activeSessionMs,
    activeSessionStartMs,
    lastCompletedSessionMs,
    completedSessionsToday,
  };
}

function formatDate(value: string, timeZone?: string): string {
  if (!value) return "Date unavailable";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day, 12).toLocaleDateString(
      "en-US",
      {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      },
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleDateString("en-US");
  }
}

function formatTime(value: string, timeZone?: string): string {
  if (!value) return "—";

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const [hours, minutes] = value.split(":").map(Number);
    if (hours <= 23 && minutes <= 59) return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

function humanize(value: string): string {
  return value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Not provided";
}

function statusClasses(status: string): string {
  const value = status.toUpperCase();

  if (/ACTIVE|APPROVED|RESOLVED|CLOCKED_IN/.test(value)) {
    return "border-emerald-400/30 bg-emerald-400/15 text-emerald-300 shadow-sm shadow-emerald-500/10";
  }

  if (/INACTIVE|FORMER|REJECTED|DISMISSED|CLOCKED_OUT/.test(value)) {
    return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }

  return "border-amber-400/30 bg-amber-400/15 text-amber-200 shadow-sm shadow-amber-500/10";
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${statusClasses(label)}`}
    >
      {label}
    </span>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof Clock3;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`${PANEL} p-6 sm:p-7 flex flex-col justify-between`}>
      <div>
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-300/[0.12] to-sky-400/[0.04] text-sky-200 shadow-inner">
              <Icon size={20} />
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-white">
                {title}
              </h2>

              {description && (
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {description}
                </p>
              )}
            </div>
          </div>

          {action}
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

export default function EmployeeDashboardPage() {
  const user = useEmployeeWorkspaceUser();
  const employeeId = user?.employeeId ?? "";

  const [profile, setProfile] = useState<Row | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<Row[]>([]);
  const [calendarError, setCalendarError] = useState("");
  const [events, setEvents] = useState<Row[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Row[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<Row[]>([]);
  const [timeOffError, setTimeOffError] = useState("");
  const [correctionRequests, setCorrectionRequests] = useState<Row[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<Row[]>([]);
  const [workflowErrors, setWorkflowErrors] = useState<string[]>([]);

  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Kigali",
  );

  const [serverClockStatus, setServerClockStatus] =
    useState<ClockStatus>("");

  // Initialized after hydration so the live timer does not render different
  // seconds on the server and the first client render.
  const [nowMs, setNowMs] = useState(0);
  const [dateTick, setDateTick] = useState(0);

  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState("");
  const [profileError, setProfileError] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!employeeId) return;

    if (!silent) setLoading(true);
    setServerClockStatus("");

    const browserToday = dateInTimeZone(new Date(), timeZone);

    const fromDate = addDays(browserToday, -2);
    const toDate = addDays(browserToday, 14);

    const calendarQuery =
      `?fromDate=${encodeURIComponent(fromDate)}` +
      `&toDate=${encodeURIComponent(toDate)}`;

    const [profileResult, eventsResult, calendarResult, correctionsResult, overtimeResult, leaveResult, holidaysResult] =
      await Promise.allSettled([
        api("/employees/me"),
        api("/attendance/events"),
        api(`/attendance/calendar${calendarQuery}`),
        api("/attendance/corrections"),
        api("/attendance/overtime"),
        api("/leave/requests"),
        api(`/leave/holidays${calendarQuery}`),
      ]);

    let nextProfile: Row | null = null;
    let nextEvents: Row[] = [];
    let nextCalendar: Row[] = [];
    let nextCalendarError = "";
    let nextClockStatus: ClockStatus = "";

    let nextProfileError = "";
    let nextEventsError = "";

    if (profileResult.status === "fulfilled") {
      const payload = profileResult.value;

      const source = isRecord(payload) && isRecord(payload.data)
        ? payload.data
        : payload;

      if (isRecord(source) && isRecord(source.employee)) {
        nextProfile = source.employee;
      } else {
        nextProfileError =
          "Your employee details were not returned by the server.";
      }
    } else {
      nextProfileError =
        profileResult.reason instanceof Error
          ? profileResult.reason.message
          : "Unable to load your employee details.";
    }

    if (eventsResult.status === "fulfilled") {
      const payload = eventsResult.value;

      nextEvents = recordsFrom(payload, "events");

      const root = isRecord(payload) ? payload : null;
      const nested = root && isRecord(root.data) ? root.data : null;
      const status = read(root, "clockStatus") || read(nested, "clockStatus");

      if (status === "CLOCKED_IN" || status === "CLOCKED_OUT") {
        nextClockStatus = status;
      } else {
        nextEventsError = "The server did not confirm whether you are clocked in. The system will recheck your attendance automatically; try again shortly.";
      }
    } else {
      nextEventsError =
        eventsResult.reason instanceof Error
          ? eventsResult.reason.message
          : "Unable to load your attendance events.";
    }

    if (calendarResult.status === "fulfilled") {
      nextCalendar = recordsFrom(calendarResult.value, "entries");
      if (!isRecord(calendarResult.value) || calendarResult.value.status === "error") {
        nextCalendarError = errorMessage(calendarResult.value) || "Unable to verify your upcoming shift, leave, and public holidays.";
      }
    } else {
      nextCalendarError = calendarResult.reason instanceof Error
        ? calendarResult.reason.message
        : "Unable to verify your upcoming shift, leave, and public holidays.";
    }

    const calendarPayload = calendarResult.status === "fulfilled" && isRecord(calendarResult.value)
      ? calendarResult.value
      : null;
    const calendarData = calendarPayload && isRecord(calendarPayload.data) ? calendarPayload.data : calendarPayload;
    const nextTimeZone =
      (calendarData ? read(calendarData, "timeZone") : "") ||
      (nextCalendar.find((row) => read(row, "timeZone")) &&
        read(nextCalendar.find((row) => read(row, "timeZone")) ?? {}, "timeZone"));

    const eventTimeZone = nextEvents.find((row) => read(row, "timeZone"))
      ? read(
          nextEvents.find((row) => read(row, "timeZone")) ?? {},
          "timeZone",
        )
      : "";

    const resolvedTimeZone =
      nextTimeZone ||
      eventTimeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "Africa/Kigali";

    let nextLeaveRequests: Row[] = [];
    let nextPublicHolidays: Row[] = [];
    let nextTimeOffError = "";

    if (leaveResult.status === "fulfilled") {
      nextLeaveRequests = recordsFrom(leaveResult.value, "requests");
      if (isRecord(leaveResult.value) && read(leaveResult.value, "status").toLowerCase() === "error") {
        nextTimeOffError = errorMessage(leaveResult.value) || "Unable to verify approved leave for today.";
      }
    } else {
      nextTimeOffError = leaveResult.reason instanceof Error
        ? leaveResult.reason.message
        : "Unable to verify approved leave for today.";
    }

    if (holidaysResult.status === "fulfilled") {
      nextPublicHolidays = recordsFrom(holidaysResult.value, "holidays");
      if (isRecord(holidaysResult.value) && read(holidaysResult.value, "status").toLowerCase() === "error") {
        nextTimeOffError = [nextTimeOffError, errorMessage(holidaysResult.value) || "Unable to verify public holidays for today."].filter(Boolean).join(" ");
      }
    } else {
      nextTimeOffError = [
        nextTimeOffError,
        holidaysResult.reason instanceof Error
          ? holidaysResult.reason.message
          : "Unable to verify public holidays for today.",
      ].filter(Boolean).join(" ");
    }

    const workflowErrorsNext: string[] = [];
    if (leaveResult.status === "rejected") {
      workflowErrorsNext.push(leaveResult.reason instanceof Error ? leaveResult.reason.message : "Unable to load leave requests.");
    }
    const nextCorrections = correctionsResult.status === "fulfilled"
      ? recordsFrom(correctionsResult.value, "requests")
      : (workflowErrorsNext.push(correctionsResult.reason instanceof Error ? correctionsResult.reason.message : "Unable to load correction requests."), [] as Row[]);
    const nextOvertime = overtimeResult.status === "fulfilled"
      ? recordsFrom(overtimeResult.value, "requests")
      : (workflowErrorsNext.push(overtimeResult.reason instanceof Error ? overtimeResult.reason.message : "Unable to load overtime requests."), [] as Row[]);

    setProfile(nextProfile);
    setEvents(nextEvents);
    setCalendarEntries(nextCalendar);
    setCalendarError(nextCalendarError);
    setLeaveRequests(nextLeaveRequests);
    setPublicHolidays(nextPublicHolidays);
    setTimeOffError(nextTimeOffError);
    setCorrectionRequests(nextCorrections);
    setOvertimeRequests(nextOvertime);
    setWorkflowErrors(workflowErrorsNext);
    setTimeZone(resolvedTimeZone);
    setServerClockStatus(nextClockStatus);

    setProfileError(nextProfileError);
    setEventsError(nextEventsError);
    setLoading(false);
  }, [employeeId, timeZone]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useWorkspaceAutoRefresh(() => loadDashboard(true), {
    intervalMs: 60_000,
    shouldRefresh: () => !loading && !savingAction && Boolean(employeeId),
  });

  useEffect(() => {
    setDateTick(Date.now());
    const intervalId = window.setInterval(() => setDateTick(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const tenantToday = useMemo(
    () => dateInTimeZone(new Date(dateTick || Date.now()), timeZone),
    [timeZone, dateTick],
  );

  // Keep the current day's calendar entry available for merging effective
  // (approved-correction) events into the dashboard's personal timeline.
  const todayEntry = useMemo(
    () => calendarEntries.find((row) => dateOf(row, timeZone) === tenantToday) ?? null,
    [calendarEntries, tenantToday, timeZone],
  );

  // Build time-off dates from both the attendance calendar and the dedicated
  // leave/holiday endpoints. The dashboard must not rely on nested calendar
  // metadata alone to decide whether a future shift is eligible.
  const approvedLeaveRanges = useMemo(() => leaveRequests.filter((row) =>
    read(row, "status", "approvalStatus", "approval_status", "state").toUpperCase() === "APPROVED"
  ).map((row) => ({
    row,
    start: dateOf({ workDate: read(row, "startDate", "start_date", "fromDate", "from_date") }, timeZone),
    end: dateOf({ workDate: read(row, "endDate", "end_date", "toDate", "to_date") }, timeZone),
  })).filter((item) => item.start && item.end), [leaveRequests, timeZone]);

  const holidayDates = useMemo(() => {
    const dates = new Map<string, Row>();
    for (const row of publicHolidays) {
      const rawDate = read(row, "holidayDate", "holiday_date", "date", "workDate", "work_date");
      const date = rawDate ? dateOf({ workDate: rawDate }, timeZone) : "";
      if (date) dates.set(date, row);
    }
    return dates;
  }, [publicHolidays, timeZone]);

  const nextTimeOffEntry = useMemo(() => {
    const candidates: Row[] = [];
    for (const row of calendarEntries) {
      const workDate = dateOf(row, timeZone);
      const holiday = isRecord(row.publicHoliday) ? row.publicHoliday : null;
      const leave = isRecord(row.leaveRequest) ? row.leaveRequest : null;
      const approvedLeave = read(leave, "status", "approvalStatus", "approval_status", "state").toUpperCase() === "APPROVED";
      if (workDate > tenantToday && (holiday || approvedLeave)) candidates.push(row);
    }
    for (const [date, holiday] of holidayDates) {
      if (date > tenantToday) candidates.push({ workDate: date, publicHoliday: holiday });
    }
    for (const item of approvedLeaveRanges) {
      const date = item.start > tenantToday ? item.start : addDays(tenantToday, 1);
      if (item.end >= date) candidates.push({ workDate: date, leaveRequest: item.row });
    }
    return candidates.sort((a, b) => {
      const dateOrder = dateOf(a, timeZone).localeCompare(dateOf(b, timeZone));
      if (dateOrder) return dateOrder;
      return Number(isRecord(b.publicHoliday)) - Number(isRecord(a.publicHoliday));
    })[0] ?? null;
  }, [calendarEntries, holidayDates, approvedLeaveRanges, tenantToday, timeZone]);

  const nextShiftEntry = useMemo(() => {
    return calendarEntries
      .filter((row) => {
        const workDate = dateOf(row, timeZone);
        const hasSchedule = Boolean(
          read(row, "scheduleName", "schedule_name", "expectedStart", "expected_start", "expectedEnd", "expected_end"),
        );
        const holiday = isRecord(row.publicHoliday) ? row.publicHoliday : null;
        const leave = isRecord(row.leaveRequest) ? row.leaveRequest : null;
        const approvedLeave = read(leave, "status", "approvalStatus", "approval_status", "state").toUpperCase() === "APPROVED";
        const explicitHoliday = holidayDates.has(workDate);
        const explicitApprovedLeave = approvedLeaveRanges.some((item) => item.start <= workDate && item.end >= workDate);
        return hasSchedule && workDate > tenantToday && !holiday && !approvedLeave && !explicitHoliday && !explicitApprovedLeave;
      })
      .sort((a, b) => dateOf(a, timeZone).localeCompare(dateOf(b, timeZone)))[0] ?? null;
  }, [calendarEntries, holidayDates, approvedLeaveRanges, tenantToday, timeZone]);

  const needsAttention = useMemo(() => {
    const items: { id: string; title: string; detail: string; href: string; tone: "warning" | "info" }[] = [];
    const pendingStatuses = ["PENDING", "SUBMITTED", "IN_REVIEW", "UNDER_REVIEW"];
    const waitingCorrections = correctionRequests.filter((row) => pendingStatuses.includes(read(row, "status", "approvalStatus", "approval_status", "state").toUpperCase()));
    const waitingOvertime = overtimeRequests.filter((row) => pendingStatuses.includes(read(row, "status", "approvalStatus", "approval_status", "state").toUpperCase()));
    const waitingLeave = leaveRequests.filter((row) => pendingStatuses.includes(read(row, "status", "approvalStatus", "approval_status", "state").toUpperCase()));
    if (waitingCorrections.length || waitingOvertime.length) {
      items.push({ id: "pending-review", title: "Requests awaiting review", detail: `${waitingCorrections.length} correction(s) · ${waitingOvertime.length} overtime request(s)`, href: "/employee/requests", tone: "info" });
    }
    if (waitingLeave.length) {
      items.push({ id: "pending-leave", title: "Leave request awaiting decision", detail: `${waitingLeave.length} leave request(s) are still awaiting a decision.`, href: "/employee/leave", tone: "info" });
    }
    return items.slice(0, 4);
  }, [correctionRequests, overtimeRequests, leaveRequests]);

  const todayEvents = useMemo(() => {
    const eventsByKey = new Map<string, Row>();

    function addEvent(row: Row, preferNewerSource = false) {
      if (dateOf(row, timeZone) !== tenantToday) return;

      const eventType = read(row, "eventType", "event_type").toUpperCase();
      const stamp = timestampOf(row);
      const id = read(row, "id");
      const key = id || `${eventType}:${stamp}`;

      if (preferNewerSource || !eventsByKey.has(key)) {
        eventsByKey.set(key, row);
      }
    }

    events.forEach((row) => addEvent(row));

    const groupedEvents = Array.isArray(todayEntry?.events)
      ? todayEntry.events.filter(isRecord)
      : [];

    groupedEvents.forEach((row) => addEvent(row, true));

    return [...eventsByKey.values()].sort(
      (first, second) =>
        new Date(timestampOf(second)).getTime() -
        new Date(timestampOf(first)).getTime(),
    );
  }, [events, todayEntry, tenantToday, timeZone]);

  const latestEvent = todayEvents[0] ?? null;
  const latestEventType = read(latestEvent, "eventType", "event_type").toUpperCase();

  const clockStatusVerified =
    (serverClockStatus === "CLOCKED_IN" || serverClockStatus === "CLOCKED_OUT") &&
    !eventsError;
  const clockedIn = clockStatusVerified && serverClockStatus === "CLOCKED_IN";

  const approvedLeaveToday = useMemo(
    () => leaveRequests.find((row) => {
      const start = dateOf({ workDate: read(row, "startDate", "start_date", "fromDate", "from_date") }, timeZone);
      const end = dateOf({ workDate: read(row, "endDate", "end_date", "toDate", "to_date") }, timeZone);
      return read(row, "status", "approvalStatus", "approval_status", "state").toUpperCase() === "APPROVED" &&
        Boolean(start && end) && start <= tenantToday && end >= tenantToday;
    }) ?? null,
    [leaveRequests, tenantToday, timeZone],
  );

  const publicHolidayToday = useMemo(
    () => publicHolidays.find((row) =>
      dateOf({ workDate: read(row, "holidayDate", "holiday_date", "date", "workDate", "work_date") }, timeZone) === tenantToday,
    ) ?? null,
    [publicHolidays, tenantToday, timeZone],
  );

  const clockInBlocked = Boolean(approvedLeaveToday || publicHolidayToday || timeOffError);

  const timeOffNotice = approvedLeaveToday
    ? {
        title: "Approved leave today",
        detail: `${read(approvedLeaveToday, "leaveType", "leave_type").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Leave"} is approved for today. You do not need to clock in.`,
        kind: "leave" as const,
      }
    : publicHolidayToday
      ? {
          title: "Public holiday today",
          detail: `${read(publicHolidayToday, "name") || "Your organization has a public holiday today."} Attendance clock-in is unavailable for this date.`,
          kind: "holiday" as const,
        }
      : timeOffError
        ? {
            title: "Unable to verify leave or holiday",
            detail: "Clock-in is temporarily disabled because the system could not verify today's leave and public-holiday status. The system will recheck automatically. If the status remains unavailable, contact your HR Manager.",
            kind: "error" as const,
          }
        : null;

  // Update the elapsed-session timer only while a session is open.
  // The timer is display-only; recorded punch timestamps remain authoritative.
  useEffect(() => {
    if (!clockedIn) {
      setNowMs(0);
      return;
    }

    setNowMs(Date.now());

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [clockedIn]);

  const attendanceEventsForCalculation = useMemo(
    () => mergeAttendanceEvents(events, calendarEntries),
    [events, calendarEntries],
  );

  const workTimeSummary = useMemo(
    () =>
      calculateDailyWorkSummary(
        attendanceEventsForCalculation,
        tenantToday,
        timeZone,
        nowMs,
        clockedIn,
      ),
    [
      attendanceEventsForCalculation,
      tenantToday,
      timeZone,
      nowMs,
      clockedIn,
    ],
  );

  const firstName = read(profile, "first_name", "firstName");

  const employeeDisplayName =
    [
      read(profile, "first_name", "firstName"),
      read(profile, "last_name", "lastName"),
    ]
      .filter(Boolean)
      .join(" ") ||
    user?.email ||
    "Employee";

  const employeeStatus = read(profile, "employment_status", "employmentStatus");

  async function recordClockAction() {
    if (!clockStatusVerified || loading || savingAction || eventsError) return;

    const action = clockedIn ? "CLOCK_OUT" : "CLOCK_IN";

    setSavingAction(action);
    setNotice(null);

    try {
      await api("/attendance/events", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      window.dispatchEvent(new Event("hrms:attendance-status-changed"));

      setNotice({
        type: "success",
        message:
          action === "CLOCK_IN"
            ? "Your clock-in has been recorded successfully."
            : "Your clock-out has been recorded successfully.",
      });

      await loadDashboard();
    } catch (error) {
      await loadDashboard();
      setNotice({
        type: "error",
        message: `${error instanceof Error ? error.message : "Unable to confirm your attendance action."} Your attendance status has been refreshed. Check it before trying again.`,
      });
    } finally {
      setSavingAction("");
    }
  }

  return (
    <div className="employee-dashboard-workspace min-w-0 space-y-6 text-slate-100 pb-10">
      <AttendanceAlerts collapsible />

      {/* Compact enterprise header */}
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.075] bg-[#121b28] p-4 shadow-lg shadow-black/10 sm:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-16 size-56 rounded-full border border-sky-200/[0.06]"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-4 -top-8 size-40 rounded-full bg-sky-400/[0.035] blur-3xl"
        />

        <div className="relative flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
          {/* Employee photo and welcome information */}
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <EmployeeProfilePhoto
              name={employeeDisplayName}
              employeeId={employeeId || undefined}
              className="size-14 rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-300/20 to-indigo-300/10 text-xl shadow-inner sm:size-16"
            />

            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[0.045] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                <ShieldCheck size={13} />
                My Day
              </div>

              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
                Welcome back, {firstName || "Employee"}
              </h1>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300/90 sm:text-sm">
              </p>

              {user?.organizationName && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Building2 size={14} className="text-sky-300" />
                  <span>{user.organizationName}</span>
                </div>
              )}

              {profileError && (
                <p role="status" className="mt-3 max-w-xl text-xs leading-5 text-amber-200">
                  Employment details could not be loaded. Your clock status and schedule remain separately reported where available. {profileError}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur-md shadow-inner">
              <CalendarDays size={14} className="text-sky-400" />
              <span>{formatDate(tenantToday, timeZone)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Feedback Notice Banner */}
      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex min-w-0 items-start gap-3.5 rounded-2xl border p-4 text-sm leading-6 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${
            notice.type === "success"
              ? "border-emerald-400/30 bg-emerald-950/40 text-emerald-200"
              : "border-rose-400/30 bg-rose-950/40 text-rose-200"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <CircleAlert size={20} className="mt-0.5 shrink-0 text-rose-400" />
          )}

          <span className="min-w-0 flex-1 break-words font-medium">
            {notice.message}
          </span>

          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded-lg p-1 text-xl leading-4 opacity-70 hover:opacity-100 hover:bg-white/10 transition"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Primary clock action and next assigned shift */}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section
          className={`${PANEL} overflow-hidden relative border-l-4 ${
            clockedIn ? "border-l-emerald-400" : "border-l-sky-400"
          }`}
        >
          <div className="relative p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-sky-400/[0.05] blur-2xl"
            />

            <div className="relative">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wide shadow-sm ${
                    !clockStatusVerified
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                      : clockedIn
                        ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300"
                        : "border-slate-500/30 bg-white/[0.05] text-slate-300"
                  }`}
                >
                  <span
                    className={`size-2 rounded-full animate-pulse ${
                      !clockStatusVerified
                        ? "bg-amber-300"
                        : clockedIn
                          ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                          : "bg-slate-400"
                    }`}
                  />
                  {!clockStatusVerified
                    ? "Attendance Status Unavailable"
                    : clockedIn
                      ? "Currently Clocked In"
                      : todayEvents.length > 0
                        ? "Clocked Out"
                        : "Not Clocked In"}
                </span>

                {employeeStatus && (
                  <StatusBadge label={humanize(employeeStatus)} />
                )}
              </div>

              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {!clockStatusVerified
                  ? "We need to verify your attendance"
                  : clockedIn
                    ? "Your work session is active"
                    : "Ready to start your shift?"}
              </h2>

              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-slate-300/80">
                {!clockStatusVerified
                  ? "Your current attendance state has not been confirmed. The system will recheck your attendance automatically; try again shortly."
                   : "Clock in when your shift starts and clock out when you finish."}
              </p>

              {latestEvent && (
                <div className="mt-5 inline-flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-xs text-slate-300">
                  <Clock3 size={16} className="shrink-0 text-sky-400" />
                  <span>
                    Latest activity:{" "}
                    <strong className="font-bold text-white">
                      {humanize(latestEventType)}
                    </strong>{" "}
                    at{" "}
                    <strong className="font-bold text-white">
                      {formatTime(
                        timestampOf(latestEvent),
                        read(latestEvent, "timeZone") || timeZone,
                      )}
                    </strong>
                  </span>
                </div>
              )}

              {eventsError && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/40 p-4 text-xs leading-relaxed text-rose-200"
                >
                  {eventsError}
                  <p className="mt-1 font-medium">
                    Wait until the system confirms your attendance status before recording another punch.
                  </p>
                </div>
              )}

              {timeOffNotice && (
                <div
                  role={timeOffNotice.kind === "error" ? "alert" : "status"}
                  className={`mt-5 rounded-2xl border p-4 ${
                    timeOffNotice.kind === "leave"
                      ? "border-amber-300/25 bg-amber-300/[0.07]"
                      : timeOffNotice.kind === "holiday"
                        ? "border-sky-300/25 bg-sky-300/[0.07]"
                        : "border-rose-300/25 bg-rose-300/[0.07]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {timeOffNotice.kind === "error" ? (
                      <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-200" />
                    ) : (
                      <CalendarDays size={20} className={`mt-0.5 shrink-0 ${timeOffNotice.kind === "leave" ? "text-amber-200" : "text-sky-200"}`} />
                    )}
                    <div>
                      <p className={`font-semibold ${timeOffNotice.kind === "leave" ? "text-amber-100" : timeOffNotice.kind === "holiday" ? "text-sky-100" : "text-rose-100"}`}>
                        {timeOffNotice.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{timeOffNotice.detail}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void recordClockAction()}
                  disabled={
                    loading ||
                    Boolean(savingAction) ||
                    !clockStatusVerified ||
                    Boolean(eventsError) ||
                    (!clockedIn && clockInBlocked)
                  }
                  className={
                    clockedIn ? CLOCK_OUT_BUTTON : PRIMARY_BUTTON
                  }
                >
                  {savingAction ? (
                    <RefreshCw size={19} className="animate-spin" />
                  ) : clockedIn ? (
                    <ArrowDownRight size={20} />
                  ) : (
                    <ArrowUpRight size={20} />
                  )}

                  {savingAction === "CLOCK_IN"
                    ? "Clocking In…"
                    : savingAction === "CLOCK_OUT"
                      ? "Clocking Out…"
                      : !clockStatusVerified
                        ? "Status unavailable"
                        : clockedIn
                          ? "Clock Out Now"
                          : clockInBlocked
                            ? "Clock-in unavailable"
                            : "Clock In Now"}
                </button>

                <Link
                  href="/employee/attendance"
                  className={SECONDARY_BUTTON}
                >
                  <CalendarClock size={17} className="text-sky-400" />
                  <span>Attendance &amp; Time</span>
                  <ArrowRight size={15} />
                </Link>
              </div>

              {/* Live, event-derived work-time summary */}
              <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl border border-sky-300/15 bg-gradient-to-br from-sky-300/[0.09] to-sky-400/[0.025] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-sky-200">
                      <Clock3 size={15} className="shrink-0" />
                      Time worked today
                    </div>
                    <span className="shrink-0 rounded-full border border-white/[0.09] bg-black/20 px-2 py-1 text-[10px] font-semibold text-slate-300">
                      {workTimeSummary.completedSessionsToday} completed
                    </span>
                  </div>

                  <p className="mt-3 text-3xl font-black tracking-tight text-white tabular-nums">
                    {clockedIn && nowMs === 0
                      ? "Updating…"
                      : formatElapsedDuration(workTimeSummary.totalTodayMs)}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {clockedIn
                      ? "Includes completed sessions and time elapsed in your active session today."
                      : workTimeSummary.completedSessionsToday > 0
                        ? "Calculated from completed clock-in and clock-out pairs for today's date."
                        : "Your recorded working time will appear here after you complete a work session."}
                  </p>
                </div>

                <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
                      <Timer size={15} className="shrink-0 text-emerald-300" />
                      {clockedIn ? "Current session" : "Last completed session"}
                    </div>

                    {clockedIn && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                        LIVE
                      </span>
                    )}
                  </div>

                  <p className="mt-3 break-words font-mono text-3xl font-black tracking-tight text-white tabular-nums">
                    {clockedIn
                      ? workTimeSummary.activeSessionMs !== null
                        ? formatLiveDuration(workTimeSummary.activeSessionMs)
                        : "Updating…"
                      : workTimeSummary.lastCompletedSessionMs !== null
                        ? formatElapsedDuration(workTimeSummary.lastCompletedSessionMs)
                        : "—"}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {clockedIn
                      ? workTimeSummary.activeSessionStartMs !== null
                        ? `Clocked in at ${formatTime(new Date(workTimeSummary.activeSessionStartMs).toISOString(), timeZone)}. Timer updates every second.`
                        : "Your clock-in is active. The attendance status will update automatically."
                      : workTimeSummary.lastCompletedSessionMs !== null
                        ? "Duration of your most recent completed clock-in/clock-out session today."
                        : "A completed session duration will appear after you clock out."}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-slate-400/80">
                Time is calculated from recorded attendance events. These figures are elapsed time, not payroll-payable hours, and do not automatically deduct scheduled breaks.
              </p>
            </div>
          </div>
        </section>

        <Panel
          title="Next shift"
          description="Next assigned shift."
          icon={CalendarClock}
          action={
            <Link href="/employee/attendance?tab=calendar" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-sky-300 hover:text-sky-200">
              View calendar <ArrowRight size={14} />
            </Link>
          }
        >
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={15} className="animate-spin" />Finding your next shift…</div>
          ) : (
            <div className="space-y-3">
              {!calendarError && !timeOffError && nextTimeOffEntry && (() => {
                const holiday = isRecord(nextTimeOffEntry.publicHoliday) ? nextTimeOffEntry.publicHoliday : null;
                const leave = isRecord(nextTimeOffEntry.leaveRequest) ? nextTimeOffEntry.leaveRequest : null;
                const isHoliday = Boolean(holiday);
                const leaveType = read(leave, "leaveType", "leave_type").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
                return (
                  <div className={`rounded-xl border p-3 ${isHoliday ? "border-sky-300/25 bg-sky-300/[0.06]" : "border-violet-300/25 bg-violet-300/[0.06]"}`}>
                    <div className="flex items-start gap-2.5">
                      <CalendarDays size={17} className={`mt-0.5 shrink-0 ${isHoliday ? "text-sky-200" : "text-violet-200"}`} />
                      <div className="min-w-0">
                        <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${isHoliday ? "text-sky-200" : "text-violet-200"}`}>{isHoliday ? "Upcoming public holiday" : "Approved leave"}</p>
                        <p className="mt-1 text-sm font-semibold text-white">{formatDate(dateOf(nextTimeOffEntry, timeZone), timeZone)}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-300">{isHoliday ? read(holiday, "name") || "Public holiday" : `${leaveType || "Leave"}${leave?.isPaid === true ? " · paid" : leave?.isPaid === false ? " · unpaid" : ""}`} — no clock-in is expected for this date.</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {calendarError || timeOffError ? (
                <div role="alert" className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
                  <p className="text-sm font-semibold text-amber-100">Upcoming schedule could not be verified</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">The dashboard could not confirm your shifts, approved leave, and public holidays. The dashboard will check again automatically before updating this summary.</p>
                </div>
              ) : nextShiftEntry ? (
                <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.035] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">Next working shift · {formatDate(dateOf(nextShiftEntry, timeZone), timeZone)}</p>
                  <h3 className="mt-2 break-words text-base font-bold text-white">{read(nextShiftEntry, "scheduleName", "schedule_name") || "Assigned shift"}</h3>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-black/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Starts</p><p className="mt-1 text-lg font-black text-white">{formatTime(read(nextShiftEntry, "expectedStart", "expected_start"), read(nextShiftEntry, "timeZone") || timeZone)}</p></div>
                    <div className="rounded-lg bg-black/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ends</p><p className="mt-1 text-lg font-black text-white">{formatTime(read(nextShiftEntry, "expectedEnd", "expected_end"), read(nextShiftEntry, "timeZone") || timeZone)}</p></div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/[0.1] p-4">
                  <p className="text-sm font-semibold text-white">No upcoming working shift found</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">No eligible assigned shift was returned for the next 14 days. Approved leave and public holidays are excluded from the next-shift calculation.</p>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* The weekly attendance calendar is the employee's primary planning view. */}
      <AttendanceCalendarView audience="employee" compact />

      {/* Personal timeline and next actions */}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel
          title="Today's timeline"
          description="Today’s clock events."
          icon={Activity}
          action={
            <Link href="/employee/attendance?tab=calendar" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-sky-300 transition hover:text-sky-200 hover:underline">
              <span>View history</span><ArrowRight size={14} />
            </Link>
          }
        >
          {eventsError ? (
            <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm leading-relaxed text-rose-200">
              Attendance history could not be loaded. It will be checked again automatically. {eventsError}
            </div>
          ) : loading && todayEvents.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-5 text-sm text-slate-300"><RefreshCw size={17} className="animate-spin text-sky-400" />Loading today's records…</div>

          ) : todayEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.12] bg-black/10 px-5 py-8 text-center">
              <Clock3 size={24} className="mx-auto text-slate-500" />
              <p className="mt-3 text-sm font-bold text-white">No punches recorded yet today</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Recorded clock-in and clock-out events will appear here after the server confirms them.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todayEvents.slice(0, 6).map((row, index) => {
                const eventType = eventTypeOf(row);
                const isClockIn = eventType === "CLOCK_IN";
                return (
                  <div key={read(row, "id") || `${eventType}-${timestampOf(row)}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/15 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${isClockIn ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-sky-400/20 bg-sky-400/10 text-sky-200"}`}>
                        {isClockIn ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
                      </span>
                      <div className="min-w-0"><p className="text-sm font-semibold text-white">{humanize(eventType)}</p></div>
                    </div>
                    <time className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-bold text-sky-200">{formatTime(timestampOf(row), read(row, "timeZone") || timeZone)}</time>
                  </div>
                );
              })}
              {todayEvents.length > 6 && <p className="pt-1 text-center text-xs text-slate-500">Showing six recent events. Open History for the full range.</p>}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Needs your attention"
            description="Items requiring your attention."
            icon={ClipboardList}
            action={<Link href="/employee/requests" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-sky-300 hover:text-sky-200">My requests <ArrowRight size={14} /></Link>}
          >
            {workflowErrors.length > 0 && needsAttention.length > 0 && (
              <p role="status" className="mb-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100">Some request sources could not be checked. Open My Requests to review source-specific errors.</p>
            )}
            {workflowErrors.length > 0 && needsAttention.length === 0 ? (
              <div role="alert" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100">Some request statuses could not be checked. Open My Requests to retry. {workflowErrors[0]}</div>
            ) : loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={15} className="animate-spin" />Checking your items…</div>
            ) : needsAttention.length ? (
              <div className="space-y-2.5">
                {needsAttention.map((item) => (
                  <Link key={item.id} href={item.href} className="flex min-w-0 items-start gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3.5 transition hover:border-white/[0.14] hover:bg-white/[0.025]">
                    <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${item.tone === "warning" ? "bg-amber-300/10 text-amber-200" : "bg-sky-300/10 text-sky-200"}`}><AlertCircle size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{item.title}</span><span className="mt-1 block break-words text-xs leading-5 text-slate-500">{item.detail}</span></span>
                    <ArrowRight size={15} className="mt-1 shrink-0 text-slate-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4"><div className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-200" /><div><p className="text-sm font-semibold text-white">No action items returned</p><p className="mt-1 text-xs leading-5 text-slate-500">The latest successful request data did not report a leave, correction, or overtime request awaiting your action.</p></div></div></div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

