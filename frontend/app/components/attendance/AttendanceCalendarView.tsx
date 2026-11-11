"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";
import { formatDateTime as formatDateTimeShared } from "../../../lib/attendance-format";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Download,
  X,
  RefreshCw,
  Users,
} from "lucide-react";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";

type CalendarEvent = {
  id: string;
  eventType: "CLOCK_IN" | "CLOCK_OUT";
  recordedAt: string;
  timeZone: string;
  source: string;
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
  workedMinutes?: number;
  calculationStatus?: string;
  approvedOvertimeMinutes?: number | null;
  leaveRequest?: { id: string; leaveType: string; status: string; isPaid: boolean } | null;
  publicHoliday?: { id: string; name: string; isPaid: boolean } | null;

};

type CalendarResponse = {
  status?: string;
  message?: string;
  scope?: string;
  entries?: CalendarEntry[];
  hasMore?: boolean;
  nextOffset?: number | null;
  today?: string;
  timeZone?: string;
};

type DailyAttendanceRow = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentName: string | null;
  scheduleName: string | null;
  timeZone: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  firstClockIn: string | null;
  lastClockOut: string | null;
  eventCount: number;
  events: CalendarEvent[];
  workedMinutes?: number;
  actualElapsedMinutes?: number;
  regularWorkedMinutes?: number;
  calculationStatus?: string;
  leaveRequest?: { id: string; leaveType: string; status: string; isPaid: boolean } | null;
  publicHoliday?: { id: string; name: string; isPaid: boolean } | null;
};

type DailyAttendanceResponse = {
  status?: string;
  message?: string;
  reportDate?: string;
  organizationName?: string;
  timeZone?: string;
  reportScope?: string;
  generatedAt?: string;
  serverNow?: string;
  absenceAfterMinutes?: number;
  rows?: DailyAttendanceRow[];
};

async function fetchAllCalendarEntries(params: URLSearchParams, signal?: AbortSignal): Promise<CalendarResponse> {
  const entries: CalendarEntry[] = [];
  let offset = 0;
  for (let page = 0; page < 501; page += 1) {
    const pageParams = new URLSearchParams(params);
    if (offset > 0) pageParams.set("offset", String(offset));
    const response = await fetch(`/api/backend/attendance/calendar?${pageParams.toString()}`, {
      method: "GET", credentials: "same-origin", cache: "no-store", signal,
    });
    const data = (await response.json().catch(() => null)) as CalendarResponse | null;
    if (!response.ok) throw new Error(data?.message || `Unable to load attendance calendar (HTTP ${response.status}).`);
    if (!data || !Array.isArray(data.entries)) throw new Error("The attendance calendar returned an invalid response.");
    entries.push(...data.entries);
    if (!data.hasMore) return { ...data, entries, hasMore: false };
    if (typeof data.nextOffset !== "number" || data.nextOffset <= offset) throw new Error("Attendance pagination did not advance. Try again in a moment.");
    offset = data.nextOffset;
  }
  throw new Error("Attendance records exceed the supported page limit. Narrow the week or contact your administrator.");
}

function weekRangeFor(value: string) {
  const base = new Date(`${value}T12:00:00`);
  const start = startOfWeek(base);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: localDateString(start), to: localDateString(end) };
}

type AttendanceState =
  | "CHECKED_IN"
  | "NO_CLOCK_IN"
  | "POTENTIAL_ABSENCE"
  | "UPCOMING"
  | "AWAITING_CLOCK_IN"
  | "NEEDS_REVIEW"
  | "UNSCHEDULED"
  | "NOT_SCHEDULED"
  | "APPROVED_LEAVE"
  | "PUBLIC_HOLIDAY";

type RollCallFilter =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "ABSENT"
  | "AWAITING"
  | "NEEDS_REVIEW"
  | "UNSCHEDULED"
  | "LEAVE"
  | "HOLIDAY"
  | "ALL_ACTIVITY";

type Props = {
  audience: "employee" | "department-manager" | "hr-manager";
  compact?: boolean;
  actorEmployeeId?: string;
};

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function defaultFromDate() {
  return localDateString(startOfWeek(new Date()));
}

function defaultToDate() {
  const date = startOfWeek(new Date());
  date.setDate(date.getDate() + 6);
  return localDateString(date);
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(
  value: string | null,
  timeZone: string | null,
) {
  return formatDateTimeShared(value, timeZone);
}

function formatDuration(minutesValue: number | null | undefined) {
  const minutes = Number.isFinite(minutesValue) ? Math.max(0, Math.floor(Number(minutesValue))) : 0;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

function employeeLabel(entry: CalendarEntry) {
  const name = `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim();

  return name || entry.employeeCode || "Employee";
}

function dailyEmployeeLabel(entry: DailyAttendanceRow) {
  const name = `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim();
  return name || entry.employeeCode || "Employee";
}

function dateInTimeZone(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return localDateString(value);
  }
}

function attendanceState(
  entry: DailyAttendanceRow,
  reportDate: string,
  timeZone: string,
  serverNow: string,
  absenceAfterMinutes: number,
): AttendanceState {
  const events = Array.isArray(entry.events) ? entry.events : [];
  const hasClockIn = Boolean(entry.firstClockIn) || events.some((event) => event.eventType === "CLOCK_IN");
  const hasEvents = Number(entry.eventCount) > 0 || events.length > 0;

  if (entry.leaveRequest?.status?.toUpperCase() === "APPROVED") return "APPROVED_LEAVE";
  if (entry.publicHoliday) return "PUBLIC_HOLIDAY";
  if (!entry.expectedStart) return hasEvents ? "UNSCHEDULED" : "NOT_SCHEDULED";
  if (hasClockIn) return "CHECKED_IN";
  if (hasEvents) return "NEEDS_REVIEW";

  const now = new Date(serverNow);
  const nowMs = Number.isNaN(now.getTime()) ? Date.now() : now.getTime();
  const expectedStartMs = new Date(entry.expectedStart).getTime();
  const todayInOrganization = dateInTimeZone(now, timeZone || "Africa/Kigali");

  if (reportDate < todayInOrganization) return "NO_CLOCK_IN";
  if (Number.isFinite(expectedStartMs) && nowMs >= expectedStartMs + Math.max(0, absenceAfterMinutes) * 60_000) {
    return "POTENTIAL_ABSENCE";
  }
  if (Number.isFinite(expectedStartMs) && expectedStartMs > nowMs) return "UPCOMING";
  return "AWAITING_CLOCK_IN";
}

function attendanceStateLabel(value: AttendanceState) {
  switch (value) {
    case "CHECKED_IN": return "Checked in";
    case "NO_CLOCK_IN": return "No clock-in (review)";
    case "POTENTIAL_ABSENCE": return "Potential absence";
    case "UPCOMING": return "Upcoming shift";
    case "AWAITING_CLOCK_IN": return "Awaiting clock-in";
    case "NEEDS_REVIEW": return "Needs review";
    case "UNSCHEDULED": return "Off-schedule activity";
    case "NOT_SCHEDULED": return "Not scheduled";
    case "APPROVED_LEAVE": return "Approved leave";
    case "PUBLIC_HOLIDAY": return "Public holiday";
  }
}

function attendanceStateClasses(value: AttendanceState) {
  switch (value) {
    case "CHECKED_IN": return "border-emerald-400/25 bg-emerald-400/[0.09] text-emerald-200";
    case "APPROVED_LEAVE": return "border-violet-400/30 bg-violet-400/[0.09] text-violet-200";
    case "PUBLIC_HOLIDAY": return "border-amber-400/30 bg-amber-400/[0.09] text-amber-100";
    case "NO_CLOCK_IN":
    case "POTENTIAL_ABSENCE": return "border-rose-400/25 bg-rose-400/[0.08] text-rose-200";
    case "UPCOMING": return "border-sky-400/25 bg-sky-400/[0.08] text-sky-200";
    case "AWAITING_CLOCK_IN": return "border-amber-400/25 bg-amber-400/[0.08] text-amber-200";
    case "NEEDS_REVIEW": return "border-violet-400/25 bg-violet-400/[0.08] text-violet-200";
    default: return "border-white/10 bg-white/[0.025] text-slate-400";
  }
}

function statusClasses(status: string | null) {
  switch ((status ?? "").toUpperCase()) {
    case "OPEN":
    case "RETURNED":
    case "PENDING":
      return "border-amber-400/20 bg-amber-400/[0.07] text-amber-200";

    case "APPROVED":
    case "RESOLVED":
      return "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200";

    case "DISMISSED":
    case "REJECTED":
      return "border-slate-400/15 bg-white/[0.03] text-slate-400";

    case "SUBMITTED":
      return "border-sky-400/20 bg-sky-400/[0.07] text-sky-200";

    default:
      return "border-white/10 bg-white/[0.025] text-slate-400";
  }
}

function StatusLabel({ value }: { value: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
        statusClasses(value),
      ].join(" ")}
    >
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sky-200">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-white">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceCalendarView({ audience, compact = false, actorEmployeeId }: Props) {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const calendarBackgroundRefreshRef = useRef(false);
  const dailyBackgroundRefreshRef = useRef(false);
  const [reportDate, setReportDate] = useState(() => localDateString(new Date()));
  const [organizationToday, setOrganizationToday] = useState(() => localDateString(new Date()));
  const [organizationTimeZone, setOrganizationTimeZone] = useState("Africa/Kigali");
  const [alignedToOrganizationDate, setAlignedToOrganizationDate] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");
  const [dailyRows, setDailyRows] = useState<DailyAttendanceRow[]>([]);
  const [dailyRowsDate, setDailyRowsDate] = useState("");
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [dailyTimeZone, setDailyTimeZone] = useState("Africa/Kigali");
  const [dailyScope, setDailyScope] = useState("Your permitted attendance scope");
  const [dailyServerNow, setDailyServerNow] = useState("");
  const [absenceAfterMinutes, setAbsenceAfterMinutes] = useState(120);
  const [rollCallFilter, setRollCallFilter] = useState<RollCallFilter>("SCHEDULED");
  const [rollCallQuery, setRollCallQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<DailyAttendanceRow | null>(null);
  const [pendingModalSelection, setPendingModalSelection] = useState<{
    employeeId: string;
    workDate: string;
  } | null>(null);

  function closeAttendanceDetails() {
    setPendingModalSelection(null);
    setSelectedEmployee(null);
  }

  useEffect(() => {
    if (!selectedEmployee) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingModalSelection(null);
        setSelectedEmployee(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedEmployee]);

  const isEmployee = audience === "employee";
  useWorkspaceAutoRefresh(
    () => {
      calendarBackgroundRefreshRef.current = true;
      dailyBackgroundRefreshRef.current = true;
      setReloadKey((key) => key + 1);
    },
    {
      enabled: true,
      intervalMs: 60_000,
      shouldRefresh: () => !loading && !dailyLoading && !reportLoading && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate) && fromDate <= toDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate),
    },
  );
  const title = isEmployee
    ? "My attendance calendar"
    : "Team attendance calendar";

  const description = isEmployee
    ? "Review your assigned shifts and recorded punches."
    : audience === "department-manager"
      ? "Review schedule coverage and recorded attendance for employees in your assigned departments."
      : "Review organization attendance records and schedule coverage.";

  function setWeekRange(offset: number) {
    const baseDate = offset === 0
      ? new Date(`${organizationToday}T12:00:00`)
      : new Date(`${fromDate || defaultFromDate()}T12:00:00`);
    const start = startOfWeek(baseDate);
    start.setDate(start.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const nextFrom = localDateString(start);
    const nextTo = localDateString(end);
    setFromDate(nextFrom);
    setToDate(nextTo);
    setReportDate(offset === 0 ? organizationToday : nextFrom);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadCalendar() {
      if (!calendarBackgroundRefreshRef.current) setLoading(true);
      setError("");

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
        fromDate > toDate
      ) {
        setError("Choose a valid date range. The start date must not be after the end date.");
        setEntries([]);
        calendarBackgroundRefreshRef.current = false;
        setLoading(false);
        return;
      }

      const range =
        (
          Date.parse(`${toDate}T00:00:00Z`) -
          Date.parse(`${fromDate}T00:00:00Z`)
        ) / 86400000;

      if (range > 30) {
        setError("Choose a date range of 31 calendar days or fewer.");
        setEntries([]);
        calendarBackgroundRefreshRef.current = false;
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({ fromDate, toDate });
        const data = await fetchAllCalendarEntries(params, controller.signal);
        if (data.today && /^\d{4}-\d{2}-\d{2}$/.test(data.today)) {
          setOrganizationToday(data.today);
          if (data.timeZone) setOrganizationTimeZone(data.timeZone);
          if (!alignedToOrganizationDate) {
            const initialRange = weekRangeFor(data.today);
            setAlignedToOrganizationDate(true);
            if (fromDate !== initialRange.from || toDate !== initialRange.to) {
              setFromDate(initialRange.from);
              setToDate(initialRange.to);
            }
            setReportDate(data.today);
          }
        }
        setEntries(data.entries ?? []);
        setHasMore(Boolean(data.hasMore));
      } catch (caught) {
        if (controller.signal.aborted) return;

        setEntries([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load the attendance calendar",
        );
      } finally {
        calendarBackgroundRefreshRef.current = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadCalendar();

    return () => controller.abort();
  }, [fromDate, toDate, reloadKey, alignedToOrganizationDate]);

  useEffect(() => {
    if (isEmployee) return;

    const controller = new AbortController();

    async function loadDailyAttendance() {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
        setDailyRows([]);
        setDailyRowsDate(reportDate);
        setDailyError("Choose a valid date to review daily attendance.");
        dailyBackgroundRefreshRef.current = false;
        setDailyLoading(false);
        return;
      }

      if (!dailyBackgroundRefreshRef.current) setDailyLoading(true);
      setDailyRowsDate("");
      setDailyError("");
      // Do not briefly show the previous date's roster totals while the new
      // report is loading.
      setDailyRows([]);

      try {
        const params = new URLSearchParams({ date: reportDate, format: "json" });
        const calendarParams = new URLSearchParams({ fromDate: reportDate, toDate: reportDate });
        const [response, calendarData] = await Promise.all([
          fetch(`/api/backend/attendance/reports/daily?${params.toString()}`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }),
          fetchAllCalendarEntries(calendarParams, controller.signal),
        ]);
        const data = (await response.json().catch(() => null)) as DailyAttendanceResponse | null;

        if (!response.ok) {
          throw new Error(data?.message || `Unable to load daily attendance (HTTP ${response.status}).`);
        }
        const leaveHolidayByEmployee = new Map<string, CalendarEntry>(
          (calendarData?.entries ?? []).map((entry): [string, CalendarEntry] => [entry.employeeId, entry]),
        );
        const enrichedRows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => {
          const calendarEntry = leaveHolidayByEmployee.get(row.employeeId);
          return {
            ...row,
            leaveRequest: calendarEntry?.leaveRequest ?? null,
            publicHoliday: calendarEntry?.publicHoliday ?? null,
          };
        });
        setDailyRows(enrichedRows);
        setDailyRowsDate(reportDate);
        setDailyTimeZone(data?.timeZone || "Africa/Kigali");
        setDailyScope(data?.reportScope || "Your permitted attendance scope");
        setDailyServerNow(data?.serverNow || data?.generatedAt || new Date().toISOString());
        setAbsenceAfterMinutes(Number.isFinite(data?.absenceAfterMinutes) ? Math.max(0, Number(data?.absenceAfterMinutes)) : 120);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setDailyRows([]);
          setDailyRowsDate(reportDate);
          setDailyError(caught instanceof Error ? caught.message : "Unable to load daily attendance.");
        }
      } finally {
        dailyBackgroundRefreshRef.current = false;
        if (!controller.signal.aborted) setDailyLoading(false);
      }
    }

    void loadDailyAttendance();
    return () => controller.abort();
  }, [isEmployee, reportDate, reloadKey]);

  // Calendar cells and the daily roster are populated by separate API routes.
  // When a calendar cell is opened, keep its snapshot only as temporary display
  // data and replace it with the matching daily-report row once that exact date
  // has finished loading. This prevents the modal from briefly showing a stale
  // or differently-calculated work-session total.
  useEffect(() => {
    if (!pendingModalSelection) return;
    if (pendingModalSelection.workDate !== reportDate) return;
    if (dailyLoading || dailyRowsDate !== pendingModalSelection.workDate) return;

    const latestRow = dailyRows.find(
      (row) => row.employeeId === pendingModalSelection.employeeId,
    );
    if (latestRow) setSelectedEmployee(latestRow);
    setPendingModalSelection(null);
  }, [pendingModalSelection, reportDate, dailyLoading, dailyRowsDate, dailyRows]);

  async function generateDailyPdf() {
    if (isEmployee) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      setReportError("Choose a valid date for the daily attendance report.");
      setReportSuccess("");
      return;
    }

    setReportLoading(true);
    setReportError("");
    setReportSuccess("");

    try {
      const params = new URLSearchParams({ date: reportDate });
      const response = await fetch(
        `/api/backend/attendance/reports/daily?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(
          payload?.message ||
            `Unable to generate the report (HTTP ${response.status}).`,
        );
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error("The report was empty. Please try again.");
      }

      const contentDisposition = response.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch?.[1] || `daily-attendance-${reportDate}.pdf`;
      const objectUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setReportSuccess(
        `Daily attendance PDF downloaded for ${formatDate(reportDate)}.`,
      );
    } catch (caught) {
      setReportError(
        caught instanceof Error
          ? caught.message
          : "Unable to generate the daily attendance report.",
      );
    } finally {
      setReportLoading(false);
    }
  }

  const dailyRoster = dailyRows.map((entry) => ({
    entry,
    state: attendanceState(entry, reportDate, dailyTimeZone, dailyServerNow || new Date().toISOString(), absenceAfterMinutes),
  }));
  const expectedRows = dailyRoster.filter(({ entry, state }) => Boolean(entry.expectedStart) && state !== "PUBLIC_HOLIDAY" && state !== "APPROVED_LEAVE");
  const checkedInRows = dailyRoster.filter(({ state }) => state === "CHECKED_IN");
  const absenceRows = dailyRoster.filter(({ state }) => state === "NO_CLOCK_IN" || state === "POTENTIAL_ABSENCE");
  const awaitingRows = dailyRoster.filter(({ state }) => state === "UPCOMING" || state === "AWAITING_CLOCK_IN");
  const reviewRows = dailyRoster.filter(({ state }) => state === "NEEDS_REVIEW");
  const unscheduledRows = dailyRoster.filter(({ state }) => state === "UNSCHEDULED");
  const leaveRows = dailyRoster.filter(({ state }) => state === "APPROVED_LEAVE");
  const holidayRows = dailyRoster.filter(({ state }) => state === "PUBLIC_HOLIDAY");
  const filteredDailyRoster = dailyRoster.filter(({ entry, state }) => {
    const query = rollCallQuery.trim().toLocaleLowerCase();
    const matchesQuery = !query || [
      dailyEmployeeLabel(entry),
      entry.employeeCode || "",
      entry.departmentName || "",
      entry.scheduleName || "",
    ].some((value) => value.toLocaleLowerCase().includes(query));
    const matchesFilter =
      rollCallFilter === "SCHEDULED" ? Boolean(entry.expectedStart) && state !== "PUBLIC_HOLIDAY" && state !== "APPROVED_LEAVE" :
      rollCallFilter === "CHECKED_IN" ? state === "CHECKED_IN" :
      rollCallFilter === "ABSENT" ? state === "NO_CLOCK_IN" || state === "POTENTIAL_ABSENCE" :
      rollCallFilter === "AWAITING" ? state === "UPCOMING" || state === "AWAITING_CLOCK_IN" :
      rollCallFilter === "NEEDS_REVIEW" ? state === "NEEDS_REVIEW" :
      rollCallFilter === "UNSCHEDULED" ? state === "UNSCHEDULED" :
      rollCallFilter === "LEAVE" ? state === "APPROVED_LEAVE" :
      rollCallFilter === "HOLIDAY" ? state === "PUBLIC_HOLIDAY" :
      Boolean(entry.expectedStart) || state === "UNSCHEDULED" || state === "NEEDS_REVIEW" || state === "APPROVED_LEAVE" || state === "PUBLIC_HOLIDAY";
    return matchesQuery && matchesFilter;
  });

  const calendarDates = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) return [] as string[];
    const dates: string[] = [];
    const cursor = new Date(`${fromDate}T12:00:00Z`);
    const end = new Date(`${toDate}T12:00:00Z`);
    while (cursor <= end && dates.length < 31) {
      dates.push(localDateString(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  })();
  const calendarEntriesByDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const existing = calendarEntriesByDate.get(entry.workDate) ?? [];
    existing.push(entry);
    calendarEntriesByDate.set(entry.workDate, existing);
  }
  const weekLabel = calendarDates.length === 7
    ? `${formatDate(calendarDates[0])} – ${formatDate(calendarDates[6])}`
    : "Choose a week";

  const calendarControls = (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setWeekRange(-1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05]"><ChevronLeft size={14} /> Previous</button>
        <button type="button" onClick={() => setWeekRange(0)} className="hr-calendar-this-week h-9 rounded-lg border border-blue-700 bg-blue-600 px-3 text-xs font-bold !text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111a27]">This week</button>
        <button type="button" onClick={() => setWeekRange(1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05]">Next <ChevronRight size={14} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold text-slate-200">{weekLabel}</p>

      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {!compact && <header className="order-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-300">
          Attendance & time
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
          {description}
        </p>
      </header>}

      {/* Date and week navigation live inside the calendar panel below. */}


      {!isEmployee && !compact && (
        <section className="order-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1723]">
          <div className="border-b border-white/[0.07] bg-gradient-to-r from-[#17263a] via-[#111a27] to-[#111a27] p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">Daily roll-call</p>
                <h2 className="mt-1.5 text-lg font-semibold text-white">Who was expected, who arrived, and who is missing?</h2>
                <p className="mt-2 text-[10px] font-semibold text-slate-500">Scope: <span className="font-medium text-slate-400">{dailyScope}</span> · Organization time zone: <span className="font-medium text-slate-400">{dailyTimeZone || organizationTimeZone}</span></p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block min-w-[165px] text-xs font-medium text-slate-400">
                  Attendance date
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(event) => {
                      const nextDate = event.target.value;
                      setReportDate(nextDate);
                      if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate) && (nextDate < fromDate || nextDate > toDate)) {
                        const range = weekRangeFor(nextDate);
                        setFromDate(range.from);
                        setToDate(range.to);
                      }
                      setReportError("");
                      setReportSuccess("");
                    }}
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 text-sm text-slate-200 outline-none transition focus:border-sky-300/40 focus:ring-2 focus:ring-sky-300/10"
                  />
                </label>

                <button type="button" onClick={() => void generateDailyPdf()} disabled={reportLoading || !reportDate} className="dm-download-pdf inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3.5 text-xs font-bold text-white transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait disabled:opacity-70">
                  {reportLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  {reportLoading ? "Preparing PDF…" : "Download PDF"}
                </button>
              </div>
            </div>
            {(reportError || reportSuccess) && (
              <p role={reportError ? "alert" : "status"} className={`mt-3 text-xs leading-5 ${reportError ? "text-rose-300" : "text-emerald-300"}`}>
                {reportError || reportSuccess}
              </p>
            )}
          </div>

          <div className="p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={Users} label="Expected on this shift" value={expectedRows.length} />
              <SummaryCard icon={CheckCircle2} label="Checked in" value={checkedInRows.length} />
              <SummaryCard icon={AlertCircle} label="No clock-in / absence review" value={absenceRows.length} />
              <SummaryCard icon={Clock} label="Awaiting or upcoming" value={awaitingRows.length} />
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" aria-label="Filter daily attendance roster">
                {[
                  { value: "SCHEDULED" as const, label: `Expected (${expectedRows.length})` },
                  { value: "CHECKED_IN" as const, label: `Checked in (${checkedInRows.length})` },
                  { value: "ABSENT" as const, label: `No clock-in / absence (${absenceRows.length})` },
                  { value: "AWAITING" as const, label: `Awaiting (${awaitingRows.length})` },
                  { value: "NEEDS_REVIEW" as const, label: `Needs review (${reviewRows.length})` },
                  { value: "UNSCHEDULED" as const, label: `Off schedule (${unscheduledRows.length})` },
                  { value: "LEAVE" as const, label: `Approved leave (${leaveRows.length})` },
                  { value: "HOLIDAY" as const, label: `Public holiday (${holidayRows.length})` },
                  { value: "ALL_ACTIVITY" as const, label: "All activity" },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={rollCallFilter === filter.value}
                    onClick={() => setRollCallFilter(filter.value)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${rollCallFilter === filter.value ? "border-sky-600 bg-sky-600 text-white shadow-sm" : "border-white/[0.09] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="block w-full lg:max-w-xs">
                <span className="sr-only">Search attendance roster</span>
                <input type="search" value={rollCallQuery} onChange={(event) => setRollCallQuery(event.target.value)} placeholder="Search name, code, department…" className="h-10 w-full rounded-xl border border-white/10 bg-[#0b111b] px-3.5 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-300/40 focus:ring-2 focus:ring-sky-300/10" />
              </label>
            </div>

            {dailyError && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3.5 text-sm text-rose-200">{dailyError}</div>}
            {dailyLoading ? (
              <div role="status" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.015] p-10 text-sm text-slate-400"><RefreshCw size={15} className="animate-spin" /> Loading the daily roster…</div>
            ) : dailyError ? null : filteredDailyRoster.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-5 py-10 text-center">
                <Users size={22} className="mx-auto text-slate-600" />
                <p className="mt-3 text-sm font-semibold text-slate-200">No people match this view</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Try another status filter or search term. Employees without a shift are not counted as expected to attend.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <thead className="bg-white/[0.025]">
                      <tr className="border-b border-white/[0.07] text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                        <th scope="col" className="px-4 py-3">Employee</th>
                        <th scope="col" className="px-4 py-3">Department</th>
                        <th scope="col" className="px-4 py-3">Expected shift</th>
                        <th scope="col" className="px-4 py-3">Clock-in / clock-out</th>
                        <th scope="col" className="px-4 py-3">Attendance status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredDailyRoster.map(({ entry, state }) => (
                        <tr key={entry.employeeId} className="align-top transition hover:bg-white/[0.02]">
                          <td className="px-4 py-3.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              {(audience === "department-manager" || audience === "hr-manager") && <EmployeeProfilePhoto employeeId={actorEmployeeId && entry.employeeId === actorEmployeeId ? undefined : entry.employeeId} name={dailyEmployeeLabel(entry)} className="size-9 rounded-lg border border-white/10 bg-slate-800" textClassName="text-[10px] font-bold text-slate-300" />}
                              <div className="min-w-0">
                                <button type="button" onClick={() => { setPendingModalSelection(null); setSelectedEmployee(entry); }} className="text-left text-sm font-semibold text-sky-100 underline decoration-sky-300/30 underline-offset-2 transition hover:text-white hover:decoration-sky-200" aria-label={`View attendance details for ${dailyEmployeeLabel(entry)}`}>{dailyEmployeeLabel(entry)}</button>
                                <p className="mt-1 text-[10px] text-slate-500">{entry.employeeCode || "No employee code"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-300">{entry.departmentName || "Unassigned"}</td>
                          <td className="px-4 py-3.5">
                            {state === "PUBLIC_HOLIDAY" ? <><p className="text-xs font-semibold text-amber-100">Public holiday</p><p className="mt-1 text-[11px] text-amber-100/70">No scheduled shift</p></> : state === "APPROVED_LEAVE" ? <><p className="text-xs font-semibold capitalize text-violet-100">Approved leave</p><p className="mt-1 text-[11px] text-violet-100/70">No attendance expected</p></> : <><p className="text-xs font-semibold text-slate-200">{entry.scheduleName || (entry.expectedStart ? "Assigned shift" : "No schedule")}</p><p className="mt-1 text-[11px] text-slate-500">{entry.expectedStart ? `${formatDateTime(entry.expectedStart, entry.timeZone || dailyTimeZone)} – ${formatDateTime(entry.expectedEnd, entry.timeZone || dailyTimeZone)}` : "No expected hours"}</p></>}
                          </td>
                          <td className="px-4 py-3.5 text-xs tabular-nums text-slate-200"><p><span className="text-slate-500">In </span>{formatDateTime(entry.firstClockIn, entry.timeZone || dailyTimeZone)}</p><p className="mt-1"><span className="text-slate-500">Out </span>{formatDateTime(entry.lastClockOut ?? null, entry.timeZone || dailyTimeZone)}</p></td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1.5 text-[10px] font-bold ${attendanceStateClasses(state)}`}>{attendanceStateLabel(state)}</span>
                            {state === "NO_CLOCK_IN" && <p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-rose-200/70">No attendance recorded. Check leave, holidays, or approved absence before treating this as a no-show.</p>}
                            {state === "POTENTIAL_ABSENCE" && <p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-rose-200/70">Absence threshold reached; review before taking action.</p>}
                            {state === "NEEDS_REVIEW" && <p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-violet-200/70">Attendance events exist, but no clock-in was found.</p>}
                            {state === "APPROVED_LEAVE" && <p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-violet-200/80">{entry.leaveRequest?.leaveType ? `${entry.leaveRequest.leaveType.replaceAll("_", " ")} leave is approved.` : "Approved leave covers this date."}{entry.eventCount > 0 ? " Attendance events also exist; review them." : " Do not treat this as an absence."}</p>}
                            {state === "PUBLIC_HOLIDAY" && <p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-amber-100/80">{entry.publicHoliday?.name || "Organization public holiday"}. Do not treat this as an absence.{entry.eventCount > 0 ? " Attendance events also exist; review them." : ""}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[10px] leading-5 text-slate-500">Showing {filteredDailyRoster.length.toLocaleString()} record{filteredDailyRoster.length === 1 ? "" : "s"} for {formatDate(reportDate)}. Approved leave and public holidays are shown separately from absence reviews.
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {error && (
        <section
          role="alert"
          className="order-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-sm text-rose-200"
        >
          {error}
        </section>
      )}

      {!isEmployee && hasMore && !loading && (
        <section role="status" className="order-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3.5 text-xs leading-5 text-amber-100">
          The history view reached its 2,000-record display limit. Narrow the date range to inspect a complete slice. The selected-day roll-call above is loaded separately.
        </section>
      )}

      {loading ? (
        <section className="order-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111a27]">
          <div className="p-4 sm:p-5"><h2 className="text-base font-semibold text-white">Attendance calendar</h2>{calendarControls}</div>
          <div className="flex items-center justify-center gap-3 border-t border-white/[0.07] p-10 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin" /> Loading attendance calendar…</div>
        </section>
      ) : (
        <section className="attendance-calendar order-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111a27]">
          <div className="border-b border-white/[0.07] bg-gradient-to-r from-[#17263a] via-[#111a27] to-[#111a27] p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">{isEmployee ? "Your time" : "Team planning"}</p>
                <h2 className="mt-1 text-base font-semibold text-white">{isEmployee ? "My attendance calendar" : "Team schedule calendar"}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">{isEmployee ? "Review your shifts, recorded punches, leave, and organization holidays." : "Monday–Sunday overview of assigned shifts, recorded punches, leave, and public holidays. Select any day to review employee details below."}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold"><span className="rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-2.5 py-1 text-sky-200">Scheduled</span><span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-emerald-200">Punches recorded</span></div>
            </div>
            {calendarControls}
          </div>
          {!error && entries.length === 0 && <div className="border-b border-white/[0.06] px-4 py-3 text-xs text-slate-400">No attendance records for this week yet. The full Monday–Sunday calendar remains available for review.</div>}
          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-7 border-b border-white/[0.07] bg-white/[0.035]">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <div key={day} className="border-r border-white/[0.04] px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 last:border-r-0 sm:px-3">{day}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-px bg-white/[0.06]">
                {calendarDates.map((date) => {
                  const dayEntries = calendarEntriesByDate.get(date) ?? [];
                  const dateObject = new Date(`${date}T12:00:00Z`);
                  const isToday = date === organizationToday;
                  const scheduledCount = dayEntries.filter((entry) => Boolean(entry.expectedStart) && !entry.publicHoliday && entry.leaveRequest?.status?.toUpperCase() !== "APPROVED").length;
                  const punchCount = dayEntries.filter((entry) => entry.eventCount > 0).length;
                  const leaveCount = dayEntries.filter((entry) => entry.leaveRequest?.status?.toUpperCase() === "APPROVED").length;
                  const pendingLeaveCount = dayEntries.filter((entry) => ["PENDING", "SUBMITTED", "IN_REVIEW", "UNDER_REVIEW"].includes(entry.leaveRequest?.status?.toUpperCase() || "")).length;
                  const holidayCount = dayEntries.filter((entry) => Boolean(entry.publicHoliday)).length;
                  const overtimeCount = dayEntries.filter((entry) => Number(entry.approvedOvertimeMinutes ?? 0) > 0).length;
                  return <div key={date} onClick={() => { setReportDate(date); setReportError(""); setReportSuccess(""); }} className={`min-h-36 w-full bg-[#0d141f] p-2.5 text-left transition hover:bg-[#172334] sm:min-h-40 sm:p-3 ${isToday ? "ring-1 ring-inset ring-sky-400/50" : ""} ${reportDate === date ? "outline outline-2 -outline-offset-2 outline-indigo-300/70" : ""}`}>
                    <div className="flex items-center justify-between gap-1">
                      <button type="button" onClick={(event) => { event.stopPropagation(); setReportDate(date); setReportError(""); setReportSuccess(""); }} aria-pressed={reportDate === date} className={`flex size-7 items-center justify-center rounded-lg text-xs font-bold tabular-nums transition hover:ring-1 hover:ring-sky-300/60 ${isToday ? "bg-sky-400 text-slate-950" : "text-slate-300"}`}>{dateObject.getUTCDate()}</button>
                      {dayEntries.length > 0 && <span className="text-[10px] tabular-nums text-slate-500">{dayEntries.length} {dayEntries.length === 1 ? "person" : "people"}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {scheduledCount > 0 && <span className="rounded-md bg-sky-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-200">{scheduledCount} scheduled</span>}
                      {punchCount > 0 && <span className="rounded-md bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">{punchCount} recorded</span>}
                      {leaveCount > 0 && <span className="rounded-md bg-violet-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-200">{leaveCount} approved leave</span>}
                      {pendingLeaveCount > 0 && <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">{pendingLeaveCount} leave pending</span>}
                      {holidayCount > 0 && <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">{holidayCount} holiday</span>}
                      {overtimeCount > 0 && <span className="rounded-md bg-cyan-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-100">{overtimeCount} approved OT</span>}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayEntries.map((entry) => {
                        const leaveStatus = entry.leaveRequest?.status?.toUpperCase() || "";
                        const onLeave = leaveStatus === "APPROVED";
                        const leavePending = ["PENDING", "SUBMITTED", "IN_REVIEW", "UNDER_REVIEW"].includes(leaveStatus);
                        const onHoliday = Boolean(entry.publicHoliday);
                        const punchTimes = [entry.firstClockIn ? `In ${formatDateTime(entry.firstClockIn, entry.timeZone)}` : "", entry.lastClockOut ? `Out ${formatDateTime(entry.lastClockOut, entry.timeZone)}` : ""].filter(Boolean).join(" · ");
                        const leaveLabel = `${(entry.leaveRequest?.leaveType || "Leave").replaceAll("_", " ")} leave`;
                        const statusText = onHoliday ? (entry.publicHoliday?.name || "Public holiday") : onLeave ? `${leaveLabel} approved` : leavePending ? `${leaveLabel} pending` : punchTimes || (entry.expectedStart ? "Scheduled" : "No shift");
                        return <button type="button" key={`${entry.employeeId}-${entry.workDate}`} onClick={(event) => {
                          event.stopPropagation();
                          setReportDate(entry.workDate);
                          setReportError("");
                          setReportSuccess("");
                          const sameDateDailyRow = dailyRowsDate === entry.workDate && !dailyLoading
                            ? dailyRows.find((row) => row.employeeId === entry.employeeId)
                            : undefined;
                          const calendarFallback: DailyAttendanceRow = {
                            employeeId: entry.employeeId,
                            employeeCode: entry.employeeCode,
                            firstName: entry.firstName,
                            lastName: entry.lastName,
                            departmentName: entry.departmentName,
                            scheduleName: entry.scheduleName,
                            timeZone: entry.timeZone,
                            expectedStart: entry.expectedStart,
                            expectedEnd: entry.expectedEnd,
                            firstClockIn: entry.firstClockIn,
                            lastClockOut: entry.lastClockOut,
                            eventCount: entry.eventCount,
                            events: entry.events,
                            workedMinutes: entry.workedMinutes,
                            calculationStatus: entry.calculationStatus,
                            leaveRequest: entry.leaveRequest ?? null,
                            publicHoliday: entry.publicHoliday ?? null,
                          };
                          setSelectedEmployee(sameDateDailyRow ?? calendarFallback);
                          // Employee self-service does not load the manager daily-report
                          // endpoint, so its calendar response remains the direct source.
                          setPendingModalSelection(isEmployee ? null : {
                            employeeId: entry.employeeId,
                            workDate: entry.workDate,
                          });
                        }} className={`block w-full rounded-md border px-1.5 py-1 text-left text-[10px] transition hover:border-sky-300/30 hover:bg-sky-300/[0.05] ${onHoliday ? "border-amber-300/15 bg-amber-300/[0.05] text-amber-100" : onLeave ? "border-violet-300/15 bg-violet-300/[0.05] text-violet-100" : leavePending ? "border-amber-300/15 bg-amber-300/[0.035] text-amber-100" : "border-white/[0.06] bg-white/[0.025] text-slate-300"}`} title={`${employeeLabel(entry)} · ${statusText}`}>
                        <div className="flex min-w-0 items-center gap-1.5 font-semibold">
                          {audience !== "employee" && (
                            <EmployeeProfilePhoto
                              employeeId={actorEmployeeId && entry.employeeId === actorEmployeeId ? undefined : entry.employeeId}
                              name={employeeLabel(entry)}
                              className="size-5 rounded-md border border-white/10 bg-slate-800"
                              textClassName="text-[8px] font-bold text-slate-300"
                            />
                          )}
                          <span className={`shrink-0 ${onHoliday ? "text-amber-300" : onLeave ? "text-violet-300" : leavePending ? "text-amber-300" : entry.eventCount > 0 ? "text-emerald-300" : entry.expectedStart ? "text-sky-300" : "text-slate-500"}`}>●</span>
                          <span className="min-w-0 truncate">{employeeLabel(entry)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[9px] opacity-80">{statusText}</div>
                      </button>; })}
                      {dayEntries.length === 0 && <p className="mt-3 text-[10px] text-slate-600">No records</p>}
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>
          {hasMore && <p role="status" className="border-t border-amber-300/15 bg-amber-300/[0.035] p-3 text-xs leading-5 text-amber-100">Some attendance records could not be loaded. Some attendance records could not be loaded. The calendar will check again automatically; contact your administrator if the issue continues.</p>}
        </section>
      )}


      {compact && !isEmployee && (
        <section className="order-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f1723]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-3 sm:px-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">Selected day</p><h3 className="mt-0.5 text-sm font-semibold text-white">{formatDate(reportDate)}</h3></div>
            <span className="text-[10px] text-slate-500">{dailyLoading ? "Updating…" : `${dailyRoster.length} people`}</span>
          </div>
          {dailyError ? <p role="status" className="px-4 py-3 text-xs text-amber-200">{dailyError}</p> : dailyLoading ? <p className="px-4 py-4 text-xs text-slate-400">Loading clock times and leave status…</p> : dailyRoster.length === 0 ? <p className="px-4 py-4 text-xs text-slate-500">No attendance roster records for this date.</p> : <div className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto">
            {dailyRoster.map(({ entry, state }) => {
              const onLeave = state === "APPROVED_LEAVE";
              const onHoliday = state === "PUBLIC_HOLIDAY";
              const label = onHoliday ? (entry.publicHoliday?.name || "Public holiday") : onLeave ? `${(entry.leaveRequest?.leaveType || "Approved").replaceAll("_", " ")} leave` : attendanceStateLabel(state);
              return <div key={entry.employeeId} className="grid gap-1.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <EmployeeProfilePhoto
                    employeeId={actorEmployeeId && entry.employeeId === actorEmployeeId ? undefined : entry.employeeId}
                    name={dailyEmployeeLabel(entry)}
                    className="size-8 rounded-lg border border-white/10 bg-slate-800"
                    textClassName="text-[10px] font-bold text-slate-300"
                  />
                  <div className="min-w-0">
                    <button type="button" onClick={() => { setPendingModalSelection(null); setSelectedEmployee(entry); }} className="max-w-full truncate text-left text-xs font-semibold text-sky-100 underline decoration-sky-300/30 underline-offset-2 transition hover:text-white hover:decoration-sky-200" aria-label={`View attendance details for ${dailyEmployeeLabel(entry)}`}>{dailyEmployeeLabel(entry)}</button>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">{entry.departmentName || "Unassigned department"}</p>
                  </div>
                </div>
                <div><span className={`inline-flex max-w-full rounded-full border px-2 py-1 text-[10px] font-semibold ${attendanceStateClasses(state)}`}>{label}</span>{onLeave && <p className="mt-1 text-[10px] text-violet-200/70">{entry.leaveRequest?.isPaid ? "Paid leave" : "Unpaid leave"}</p>}{onHoliday && <p className="mt-1 text-[10px] text-amber-100/70">No scheduled shift</p>}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] tabular-nums text-slate-300"><span><span className="text-slate-500">In </span>{formatDateTime(entry.firstClockIn, entry.timeZone || dailyTimeZone)}</span><span><span className="text-slate-500">Out </span>{formatDateTime(entry.lastClockOut ?? null, entry.timeZone || dailyTimeZone)}</span></div>
              </div>;
            })}
          </div>}
        </section>
      )}

      {selectedEmployee && (
        <div data-employee-attendance-backdrop className="hrms-attendance-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAttendanceDetails(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-detail-title" className="employee-attendance-detail-modal flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111a27] shadow-2xl shadow-black/50">
            <div className="employee-attendance-detail-header flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.08] bg-gradient-to-r from-[#17263a] to-[#111a27] p-5">
  <div className="flex min-w-0 items-center gap-3">
    <EmployeeProfilePhoto
  employeeId={actorEmployeeId && selectedEmployee.employeeId === actorEmployeeId ? undefined : selectedEmployee.employeeId}
  name={dailyEmployeeLabel(selectedEmployee)}
  className="size-14 shrink-0 rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-300/20 to-indigo-300/10 text-xl shadow-inner"
/>

    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">
        Attendance details
      </p>
      <h2
        id="attendance-detail-title"
        className="mt-1 truncate text-lg font-semibold text-white"
      >
        {dailyEmployeeLabel(selectedEmployee)}
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        {selectedEmployee.departmentName || "Unassigned department"} · {formatDate(reportDate)}
      </p>
    </div>
  </div>

  <button
    type="button"
    onClick={closeAttendanceDetails}
    aria-label="Close attendance details"
    className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
  >
    <X size={16} />
  </button>
</div>
            <div className="employee-attendance-detail-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/70">Clock in</p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-emerald-100">{formatDateTime(selectedEmployee.firstClockIn, selectedEmployee.timeZone || dailyTimeZone)}</p>
              </div>
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100/70">Clock out</p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-amber-100">{formatDateTime(selectedEmployee.lastClockOut, selectedEmployee.timeZone || dailyTimeZone)}</p>
              </div>
              <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.06] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-100/70">Total work session</p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-sky-100" aria-live="polite">{pendingModalSelection?.employeeId === selectedEmployee.employeeId && pendingModalSelection.workDate === reportDate ? "Updating…" : formatDuration(selectedEmployee.workedMinutes)}</p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><Clock size={14} className="text-sky-300" /> Recorded punches</div>
                {selectedEmployee.events?.length ? <div className="mt-3 space-y-2">{selectedEmployee.events.map((event, index) => <div key={`${event.id}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2 text-xs"><span className={event.eventType === "CLOCK_IN" ? "font-semibold text-emerald-200" : "font-semibold text-amber-100"}>{event.eventType === "CLOCK_IN" ? "Clock in" : "Clock out"}</span><span className="tabular-nums text-slate-300">{formatDateTime(event.recordedAt, event.timeZone || selectedEmployee.timeZone || dailyTimeZone)}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No clock events recorded for this date.</p>}
              </div>

              <section aria-label="Leave and holiday details" className="mt-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Leave & holidays</p>

                  {selectedEmployee.leaveRequest && (
                    <div className="rounded-xl border border-violet-300/20 bg-violet-300/[0.06] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-violet-100">
                          {(selectedEmployee.leaveRequest.leaveType || "Leave").replaceAll("_", " ").toLowerCase()}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                          selectedEmployee.leaveRequest.status?.toUpperCase() === "APPROVED"
                            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                            : "border-amber-300/20 bg-amber-300/10 text-amber-100"
                        }`}>
                          {(selectedEmployee.leaveRequest.status || "Pending").replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[10px] text-violet-100/75">
                        {selectedEmployee.leaveRequest.isPaid ? "Paid leave" : "Unpaid leave"} · {formatDate(reportDate)}
                      </p>
                    </div>
                  )}

                  {selectedEmployee.publicHoliday && (
                    <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-amber-100">
                          {selectedEmployee.publicHoliday.name || "Public holiday"}
                        </span>
                        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-100">
                          Public holiday
                        </span>
                      </div>
                      <p className="mt-1.5 text-[10px] text-amber-100/75">
                        {selectedEmployee.publicHoliday.isPaid ? "Paid holiday" : "Unpaid holiday"} · {formatDate(reportDate)}
                      </p>
                    </div>
                  )}

                  {!selectedEmployee.leaveRequest && !selectedEmployee.publicHoliday && (
                    <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-slate-500">
                      No leave request or public holiday is recorded for this date.
                    </p>
                  )}
                </section>

              {selectedEmployee.calculationStatus && <p className="mt-3 text-[10px] text-slate-500">Calculation status: {selectedEmployee.calculationStatus.replaceAll("_", " ").toLowerCase()}</p>}
            </div>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}

