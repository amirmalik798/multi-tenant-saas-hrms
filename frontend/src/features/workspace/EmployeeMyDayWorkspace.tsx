"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, CalendarCheck, CalendarClock, CalendarDays,
  CheckCircle2, ChevronLeft, ChevronRight, Clock3, Coffee, FileClock, Mail,
  MessageCircle, Sparkles, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { apiRequest } from "@/lib/api-client";
import { getAttendanceClockEligibility } from "@/lib/attendance-clock-eligibility";
import { formatDate, formatMoney, getISODateInTimeZone, humanize } from "@/lib/format";
import { useAttendanceRefresh, notifyAttendanceStatusChanged } from "@/lib/attendance-events";
import { useSmartRefresh } from "@/lib/smart-refresh";

interface AttendanceEvent { id?: string; eventType?: string; recordedAt?: string; source?: string }
interface AttendanceDay {
  workDate: string; scheduleName?: string | null; expectedStart?: string | null; expectedEnd?: string | null;
  scheduledBreakMinutes?: number | null; workedMinutes?: number; regularWorkedMinutes?: number;
  payableOvertimeMinutes?: number; excessUnapprovedOvertimeMinutes?: number; calculationStatus?: string;
  events?: AttendanceEvent[];
  leaveRequest?: { leaveType?: string; status?: string; isPaid?: boolean } | null;
  publicHoliday?: { name?: string; isPaid?: boolean } | null;
}
interface CalendarPayload { today?: string; timeZone?: string; entries?: AttendanceDay[] }
interface PunchPayload { clockStatus?: string; events?: AttendanceEvent[]; personalEvents?: AttendanceEvent[] }
interface EarningsSummary {
  estimatedSalary?: number | null;
  totalWorkedMinutes?: number;
  regularMinutes?: number;
  payableOvertimeMinutes?: number;
  potentialOvertimeMinutes?: number;
  excessUnapprovedOvertimeMinutes?: number;
  paidLeaveMinutes?: number;
  paidHolidayMinutes?: number;
  daysWorked?: number;
  daysWithMissingRates?: number;
  currencyMismatch?: boolean;
}
interface EarningsDay {
  workDate: string;
  scheduleName?: string | null;
  isPaidLeave?: boolean;
  isPaidHoliday?: boolean;
  paidLeaveMinutes?: number;
  paidHolidayMinutes?: number;
  workedMinutes?: number;
  regularWorkedMinutes?: number;
  potentialOvertimeMinutes?: number;
  payableOvertimeMinutes?: number;
  excessUnapprovedOvertimeMinutes?: number;
  calculationStatus?: string;
  clockIn?: string | null;
  clockOut?: string | null;
  estimatedPay?: number | null;
  currencyCode?: string | null;
}
interface EarningsPayload {
  month?: string;
  currencyCode?: string | null;
  hasRates?: boolean;
  summary?: EarningsSummary;
  days?: EarningsDay[];
}
interface RequestItem extends Record<string, unknown> {
  id?: string; status?: string; createdAt?: string; requestedAt?: string; workDate?: string;
  startDate?: string; endDate?: string; leaveType?: string; eventType?: string; requestedMinutes?: number;
  approvedMinutes?: number | null; reason?: string; reviewerNote?: string | null; decisionAt?: string | null;
  originalRecordedAt?: string | null; isPaid?: boolean; requestType?: string;
}
interface RequestPayload { requests?: RequestItem[] }
interface NotificationPayload { unreadMessages?: number }
interface MyDaySnapshot {
  calendar: CalendarPayload | null; punches: PunchPayload | null; earnings: EarningsPayload | null;
  leave: RequestPayload | null; corrections: RequestPayload | null; overtime: RequestPayload | null;
  notifications: NotificationPayload | null;
}
type HomeRequestKind = "leave" | "correction" | "overtime";
interface HomeRequest {
  id: string; recordId: string; kind: HomeRequestKind; title: string; detail: string;
  status: string; href: string; createdAt: string; reason?: string; reviewerNote?: string | null;
  decisionAt?: string | null; workDate?: string; startDate?: string; endDate?: string;
  leaveType?: string; isPaid?: boolean; eventType?: string; requestedAt?: string;
  originalRecordedAt?: string | null; requestedMinutes?: number; approvedMinutes?: number | null;
  requestType?: string;
}
interface TimelineItem {
  key: string; kind: "shift" | "event"; label: string; at: string;
  eventType?: string; source?: string; elapsedMinutes?: number;
}
interface SelectedShift { date: string; entry?: AttendanceDay }

const EMPTY_SNAPSHOT: MyDaySnapshot = {
  calendar: null, punches: null, earnings: null, leave: null, corrections: null, overtime: null, notifications: null,
};

function MyDaySkeleton({ className = "" }: { className?: string }) {
  return <span className={"myday-skeleton " + className} aria-hidden="true" />;
}

function addCalendarDays(value: string, amount: number): string {
  const date = new Date(value + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function addCalendarMonths(value: string, amount: number): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}
function lastDateOfMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
function mondayOf(value: string): string {
  const date = new Date(value + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() || 7) - 1));
  return date.toISOString().slice(0, 10);
}
function minutesLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const minutes = Math.max(0, Math.floor(value));
  return Math.floor(minutes / 60) + "h " + String(minutes % 60).padStart(2, "0") + "m";
}
function timestampLabel(value: string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
  catch { return "—"; }
}
function dayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value + "T12:00:00.000Z"));
}
function dateTimeLabel(value: string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true, timeZone,
    }).format(date);
  } catch { return "—"; }
}
function scheduledWorkMinutes(entry: AttendanceDay | undefined): number {
  if (!entry?.expectedStart || !entry.expectedEnd) return 0;
  const start = new Date(entry.expectedStart).getTime();
  const end = new Date(entry.expectedEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.floor((end - start) / 60000) - Math.max(0, Number(entry.scheduledBreakMinutes ?? 0)));
}
function createdAt(item: RequestItem): string {
  return typeof item.createdAt === "string" ? item.createdAt : typeof item.requestedAt === "string" ? item.requestedAt : "";
}
function buildRequests(snapshot: MyDaySnapshot): HomeRequest[] {
  const leave = (snapshot.leave?.requests ?? []).map((item, index): HomeRequest => ({
    id: "leave-" + String(item.id ?? index), recordId: String(item.id ?? ""),
    kind: "leave",
    title: humanize(item.leaveType) + " leave",
    detail: item.startDate && item.endDate
      ? formatDate(String(item.startDate)) + (item.startDate === item.endDate ? "" : " – " + formatDate(String(item.endDate)))
      : "Leave request",
    status: String(item.status ?? "UNKNOWN"), href: "/employee/leave", createdAt: createdAt(item),
    reason: item.reason, reviewerNote: item.reviewerNote, decisionAt: item.decisionAt,
    startDate: item.startDate, endDate: item.endDate, leaveType: item.leaveType, isPaid: item.isPaid,
  }));
  const corrections = (snapshot.corrections?.requests ?? []).map((item, index): HomeRequest => ({
    id: "correction-" + String(item.id ?? index), recordId: String(item.id ?? ""),
    kind: "correction", title: humanize(item.eventType) + " correction",
    detail: item.workDate ? formatDate(String(item.workDate)) : "Attendance correction",
    status: String(item.status ?? "UNKNOWN"), href: "/employee/requests", createdAt: createdAt(item),
    reason: item.reason, reviewerNote: item.reviewerNote, decisionAt: item.decisionAt,
    workDate: item.workDate, eventType: item.eventType, requestedAt: item.requestedAt,
    originalRecordedAt: item.originalRecordedAt,
  }));
  const overtime = (snapshot.overtime?.requests ?? []).map((item, index): HomeRequest => ({
    id: "overtime-" + String(item.id ?? index), recordId: String(item.id ?? ""),
    kind: "overtime", title: "Overtime request",
    detail: (item.workDate ? formatDate(String(item.workDate)) : "Scheduled work") +
      (typeof item.requestedMinutes === "number" ? " · " + minutesLabel(item.requestedMinutes) : ""),
    status: String(item.status ?? "UNKNOWN"), href: "/employee/requests", createdAt: createdAt(item),
    reason: item.reason, reviewerNote: item.reviewerNote, decisionAt: item.decisionAt,
    workDate: item.workDate, requestedAt: item.requestedAt, requestedMinutes: item.requestedMinutes,
    approvedMinutes: item.approvedMinutes, requestType: item.requestType,
  }));
  return [...leave, ...corrections, ...overtime].sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
}

export function EmployeeMyDayWorkspace() {
  const { user, timeZone, workDate, timeZoneStatus, currencyCode } = useWorkspace();
  const [calendarToday, setCalendarToday] = useState<string | null>(null);
  const today = calendarToday || workDate || (timeZoneStatus === "ready" ? getISODateInTimeZone(timeZone) : "");
  const [snapshot, setSnapshot] = useState<MyDaySnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [criticalError, setCriticalError] = useState("");
  const [partialWarning, setPartialWarning] = useState("");
  const [savingPunch, setSavingPunch] = useState(false);
  const [punchError, setPunchError] = useState("");
  const [selectedShift, setSelectedShift] = useState<SelectedShift | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<HomeRequest | null>(null);
  const [selectedMonthDay, setSelectedMonthDay] = useState<EarningsDay | null>(null);
  const [selectedInsightsMonth, setSelectedInsightsMonth] = useState<string | null>(null);
  const [monthlyEarningsState, setMonthlyEarningsState] = useState<{
    month: string;
    payload: EarningsPayload | null;
    loading: boolean;
    error: string;
  }>({ month: "", payload: null, loading: false, error: "" });
  const currentMonth = today ? today.slice(0, 7) : "";
  const activeInsightsMonth = selectedInsightsMonth || currentMonth;
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeInsightsMonth || activeInsightsMonth === currentMonth || timeZoneStatus !== "ready") return;
    let active = true;
    setMonthlyEarningsState({ month: activeInsightsMonth, payload: null, loading: true, error: "" });
    apiRequest<EarningsPayload>("/employee/earnings?month=" + activeInsightsMonth)
      .then((payload) => {
        if (active) setMonthlyEarningsState({ month: activeInsightsMonth, payload, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMonthlyEarningsState({
          month: activeInsightsMonth,
          payload: null,
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load attendance for this month.",
        });
      });
    return () => { active = false; };
  }, [activeInsightsMonth, currentMonth, timeZoneStatus]);

  const load = useCallback(async (silent = false) => {
    if (!today || timeZoneStatus !== "ready") {
      if (!silent) {
        setLoading(false);
        setCriticalError("Your organization's time zone is not available yet. My Day will load when the work calendar can be verified.");
      }
      return;
    }
    if (!silent) setLoading(true);
    setCriticalError("");
    setPartialWarning("");
    const weekStartDate = mondayOf(today);
    const weekEndDate = addCalendarDays(weekStartDate, 13);
    const month = today.slice(0, 7);
    const results = await Promise.allSettled([
      apiRequest<CalendarPayload>("/attendance/calendar?fromDate=" + weekStartDate + "&toDate=" + weekEndDate),
      apiRequest<PunchPayload>("/attendance/events"),
      apiRequest<EarningsPayload>("/employee/earnings?month=" + month),
      apiRequest<RequestPayload>("/leave/requests"),
      apiRequest<RequestPayload>("/attendance/corrections"),
      apiRequest<RequestPayload>("/attendance/overtime"),
      apiRequest<NotificationPayload>("/notifications/summary"),
    ] as const);
    const next: MyDaySnapshot = {
      calendar: results[0].status === "fulfilled" ? results[0].value : null,
      punches: results[1].status === "fulfilled" ? results[1].value : null,
      earnings: results[2].status === "fulfilled" ? results[2].value : null,
      leave: results[3].status === "fulfilled" ? results[3].value : null,
      corrections: results[4].status === "fulfilled" ? results[4].value : null,
      overtime: results[5].status === "fulfilled" ? results[5].value : null,
      notifications: results[6].status === "fulfilled" ? results[6].value : null,
    };
    setSnapshot(next);
    if (next.calendar?.today && /^\d{4}-\d{2}-\d{2}$/.test(next.calendar.today) && next.calendar.today !== today) {
      setCalendarToday(next.calendar.today);
    }
    setCriticalError(!next.calendar || !next.punches
      ? "Today's attendance could not be fully loaded. Clock actions remain disabled until the server confirms your status."
      : "");
    const optionalFailures = results.slice(2).filter((result) => result.status === "rejected").length;
    setPartialWarning(optionalFailures > 0
      ? "Some personal information is temporarily unavailable. Missing sections will retry automatically."
      : "");
    if (!silent) setLoading(false);
  }, [today, timeZoneStatus]);

  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), Boolean(today && timeZoneStatus === "ready"), 30000);
  useAttendanceRefresh(() => { void load(true); });

  const entries = snapshot.calendar?.entries ?? [];
  const entriesByDate = useMemo(() => new Map(entries.map((entry) => [entry.workDate, entry])), [entries]);
  const todayEntry = entriesByDate.get(today);
  const todaysEvents = todayEntry?.events ?? [];
  const clockStatus = snapshot.punches?.clockStatus;
  const hasAttendanceEvents = todaysEvents.length > 0;
  const isClockedIn = clockStatus === "CLOCKED_IN";
  const scheduledMinutes = scheduledWorkMinutes(todayEntry);
  const workedMinutes = Number(todayEntry?.workedMinutes ?? 0);
  const regularMinutes = Number(todayEntry?.regularWorkedMinutes ?? workedMinutes);
  const progress = scheduledMinutes > 0 ? Math.min(100, Math.round((regularMinutes / scheduledMinutes) * 100)) : 0;
  const remainingMinutes = Math.max(0, scheduledMinutes - regularMinutes);
  const approvedLeaveToday = todayEntry?.leaveRequest?.status === "APPROVED";
  const holidayToday = Boolean(todayEntry?.publicHoliday);
  const clockEligibility = getAttendanceClockEligibility({
    status: clockStatus,
    expectedStart: todayEntry?.expectedStart,
    expectedEnd: todayEntry?.expectedEnd,
    approvedLeave: approvedLeaveToday,
    publicHoliday: holidayToday,
    now: clockNow,
  });
  const clockInTooEarly = clockEligibility.blockReason === "BEFORE_SHIFT";
  const clockInTooLate = clockEligibility.blockReason === "SHIFT_ENDED";
  const minutesUntilShift = clockEligibility.minutesUntilShift;
  const canPunch = !savingPunch && (clockEligibility.canClockIn || clockEligibility.canClockOut);

  const weekStart = today ? mondayOf(today) : "";
  const weekDays = useMemo(() => weekStart ? Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(weekStart, index);
    const entry = entriesByDate.get(date);
    return { date, label: dayLabel(date).split(" ")[0], worked: Number(entry?.workedMinutes ?? 0), scheduled: scheduledWorkMinutes(entry) };
  }) : [], [weekStart, entriesByDate]);
  const weekWorked = weekDays.filter((day) => day.date <= today).reduce((sum, day) => sum + day.worked, 0);
  const weekScheduled = weekDays.reduce((sum, day) => sum + day.scheduled, 0);
  const maxChartMinutes = Math.max(600, ...weekDays.map((day) => Math.max(day.worked, day.scheduled)));
  const upcomingDays = useMemo(() => today ? Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(today, index + 1);
    return { date, entry: entriesByDate.get(date) };
  }) : [], [today, entriesByDate]);
  const hasUpcomingSchedule = upcomingDays.some(({ entry }) =>
    Boolean(entry?.scheduleName || entry?.leaveRequest || entry?.publicHoliday),
  );
  const hasWeeklyActivity = weekDays.some((day) => day.worked > 0 || day.scheduled > 0);

  const allRequests = useMemo(() => buildRequests(snapshot), [snapshot]);
  const requestSourcesLoaded = Boolean(snapshot.leave && snapshot.corrections && snapshot.overtime);
  const pendingRequests = allRequests.filter((item) => item.status.toUpperCase() === "PENDING");
  const unreadMessages = snapshot.notifications?.unreadMessages;
  const earnings = snapshot.earnings?.summary;
  const earningsAmount = typeof earnings?.estimatedSalary === "number" ? earnings.estimatedSalary : null;
  const earningsCurrency = snapshot.earnings?.currencyCode || currencyCode;
  const earningsUnavailableLabel = earnings?.currencyMismatch
    ? "Currency review"
    : (earnings?.daysWithMissingRates ?? 0) > 0
      ? "Rates needed"
      : snapshot.earnings?.hasRates === false
        ? "Pay rates not set"
        : "Estimate unavailable";
  const isCurrentInsightsMonth = Boolean(activeInsightsMonth && activeInsightsMonth === currentMonth);
  const monthlyEarnings = isCurrentInsightsMonth
    ? snapshot.earnings
    : monthlyEarningsState.month === activeInsightsMonth
      ? monthlyEarningsState.payload
      : null;
  const monthlyEarningsLoading = isCurrentInsightsMonth
    ? loading && !snapshot.earnings
    : !activeInsightsMonth || monthlyEarningsState.month !== activeInsightsMonth || monthlyEarningsState.loading;
  const monthlyEarningsError = isCurrentInsightsMonth
    ? !loading && !snapshot.earnings ? "Current-month attendance data could not be retrieved. It will retry automatically." : ""
    : monthlyEarningsState.month === activeInsightsMonth ? monthlyEarningsState.error : "";
  const insightsMonthEnd = activeInsightsMonth
    ? isCurrentInsightsMonth ? today : lastDateOfMonth(activeInsightsMonth)
    : "";
  const canGoToPreviousMonth = activeInsightsMonth > "2000-01";
  const canGoToNextMonth = Boolean(activeInsightsMonth && activeInsightsMonth < currentMonth);
  const monthLabel = useMemo(() => {
    if (!activeInsightsMonth) return "Select a month";
    const firstDay = new Date(activeInsightsMonth + "-01T12:00:00.000Z");
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  }, [activeInsightsMonth]);
  const monthlyDays = useMemo(() => (monthlyEarnings?.days ?? [])
    .filter((day) => day.workDate.slice(0, 7) === activeInsightsMonth && day.workDate <= insightsMonthEnd)
    .sort((a, b) => a.workDate.localeCompare(b.workDate)),
  [monthlyEarnings, activeInsightsMonth, insightsMonthEnd]);
  const monthTotalWorked = monthlyDays.reduce((sum, day) => sum + Number(day.workedMinutes ?? 0), 0);
  const monthDaysWorked = monthlyDays.filter((day) => Number(day.workedMinutes ?? 0) > 0).length;
  const monthRegularWorked = monthlyDays.reduce((sum, day) => sum + Number(day.regularWorkedMinutes ?? 0), 0);
  const monthPayableOvertime = monthlyDays.reduce((sum, day) => sum + Number(day.payableOvertimeMinutes ?? 0), 0);
  const monthPaidTimeOff = monthlyDays.reduce((sum, day) =>
    sum + Number(day.paidLeaveMinutes ?? 0) + Number(day.paidHolidayMinutes ?? 0), 0,
  );
  const monthUnapprovedOvertime = monthlyDays.reduce((sum, day) =>
    sum + Number(day.excessUnapprovedOvertimeMinutes ?? 0), 0,
  );
  const monthMaxWorked = Math.max(60, ...monthlyDays.map((day) => Number(day.workedMinutes ?? 0)));
  const hasMonthlyAttendance = monthlyDays.some((day) =>
    Boolean(day.scheduleName) || Number(day.workedMinutes ?? 0) > 0 ||
    Number(day.paidLeaveMinutes ?? 0) > 0 || Number(day.paidHolidayMinutes ?? 0) > 0,
  );
  const firstName = user.firstName?.trim() || user.displayName?.trim().split(/\s+/)[0] || "there";
  let greeting = "Welcome";
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date()));
    greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  } catch { greeting = "Welcome"; }

  const statusText = loading ? "Loading your attendance..."
    : isClockedIn ? "You're currently clocked in"
    : approvedLeaveToday ? "You're on approved leave today"
      : holidayToday ? "Today is an organization public holiday"
        : clockInTooEarly ? "Your shift starts at " + timestampLabel(todayEntry?.expectedStart, timeZone)
          : clockInTooLate ? "Your scheduled shift has ended"
            : hasAttendanceEvents ? "Your last recorded action was clock-out"
              : "Your workday has not started";
  const shiftText = loading
    ? "Loading your assigned shift..."
    : approvedLeaveToday
      ? humanize(todayEntry?.leaveRequest?.leaveType) + " leave"
      : holidayToday
        ? todayEntry?.publicHoliday?.name || "Public holiday"
        : todayEntry?.scheduleName || (todayEntry?.expectedStart ? "Assigned shift" : "No shift scheduled today");
  const heroStatus = loading ? "Checking status"
    : isClockedIn ? "On the clock"
      : approvedLeaveToday ? "On approved leave"
        : holidayToday ? "Public holiday"
          : clockInTooEarly ? "Shift upcoming"
            : clockInTooLate ? "Shift ended"
              : todayEntry?.expectedStart ? hasAttendanceEvents ? "Clocked out" : "Not started"
                : "Day off";

  async function refreshClockStatus(): Promise<PunchPayload> {
    return apiRequest<PunchPayload>("/attendance/events");
  }
  async function punch() {
    if (!canPunch) return;
    setSavingPunch(true);
    setPunchError("");
    const action = isClockedIn ? "CLOCK_OUT" : "CLOCK_IN";
    const expectedStatus = action === "CLOCK_IN" ? "CLOCKED_IN" : "CLOCKED_OUT";
    try {
      await apiRequest("/attendance/events", { method: "POST", body: JSON.stringify({ action }) });
      const confirmed = await refreshClockStatus();
      if (confirmed.clockStatus !== expectedStatus) throw new Error("The attendance action was submitted, but the updated clock status could not be confirmed.");
      setSnapshot((current) => ({ ...current, punches: confirmed }));
      notifyAttendanceStatusChanged();
      await load(true);
    } catch (caught) {
      try {
        const confirmed = await refreshClockStatus();
        setSnapshot((current) => ({ ...current, punches: confirmed }));
        if (confirmed.clockStatus === expectedStatus) {
          notifyAttendanceStatusChanged();
          await load(true);
          return;
        }
      } catch {
        // Keep the last confirmed attendance data visible if the response is delayed.
      }
      setPunchError(caught instanceof Error ? caught.message : "The attendance action could not be completed.");
    } finally { setSavingPunch(false); }
  }

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
    if (todayEntry?.expectedStart) {
      items.push({ key: "scheduled-start", kind: "shift", label: "Scheduled start", at: todayEntry.expectedStart });
    }

    const orderedEvents = [...todaysEvents]
      .filter((event) => Boolean(event.recordedAt))
      .sort((a, b) => Date.parse(a.recordedAt ?? "") - Date.parse(b.recordedAt ?? ""));
    let openClockInAt: number | null = null;
    const elapsedByEvent = new Map<string, number>();

    for (const event of orderedEvents) {
      const eventTime = Date.parse(event.recordedAt ?? "");
      if (!Number.isFinite(eventTime)) continue;

      if (event.eventType === "CLOCK_IN") {
        openClockInAt = openClockInAt === null ? eventTime : null;
        continue;
      }

      if (event.eventType === "CLOCK_OUT" && openClockInAt !== null && eventTime > openClockInAt) {
        const elapsed = Math.floor((eventTime - openClockInAt) / 60000);
        if (event.id) elapsedByEvent.set(event.id, elapsed);
        openClockInAt = null;
      }
    }

    for (const event of orderedEvents) {
      if (!event.recordedAt) continue;
      items.push({
        key: event.id || "punch-" + event.recordedAt,
        kind: "event",
        label: humanize(event.eventType),
        at: event.recordedAt,
        eventType: event.eventType,
        source: event.source,
        elapsedMinutes: event.id ? elapsedByEvent.get(event.id) : undefined,
      });
    }

    if (todayEntry?.expectedEnd) {
      items.push({ key: "scheduled-finish", kind: "shift", label: "Scheduled finish", at: todayEntry.expectedEnd });
    }
    return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [todayEntry, todaysEvents]);

  return (
    <main className="myday-root">
      <header className="myday-heading-row">
        <div className="myday-heading-copy"><p className="eyebrow">EMPLOYEE WORKSPACE</p><h1>{greeting}, {firstName}</h1><p>Your day, your time, and everything that needs your attention.</p></div>
        <div className="myday-context"><span className="myday-org-chip"><span className="myday-org-dot" />{user.organizationName}</span><span className="myday-date-chip"><CalendarDays size={15} />{today ? formatDate(today) : "Work date unavailable"}</span></div>
      </header>

      {criticalError ? <div className="myday-alert myday-alert-danger" role="alert"><AlertCircle size={17} /><span>{criticalError}</span></div> : null}
      {partialWarning ? <div className="myday-alert myday-alert-warning" role="status"><AlertCircle size={17} /><span>{partialWarning}</span></div> : null}

      <section className="myday-primary-grid">
        <div className="myday-attendance-card">
          <div className="myday-attendance-topline"><span className="myday-overline">YOUR WORKDAY</span><span className={"myday-live-state" + (isClockedIn ? " is-live" : "")}><span className="myday-live-dot" />{heroStatus}</span></div>
          <div className="myday-attendance-main">
            <div><p className="myday-overline myday-muted-overline">TIME WORKED TODAY</p><div className="myday-worked-value">{loading ? <MyDaySkeleton className="myday-skeleton-time" /> : minutesLabel(workedMinutes)}</div><p className="myday-attendance-caption">{statusText}</p></div>
            <div className="myday-shift-summary"><span className="myday-shift-name">{loading ? <MyDaySkeleton className="myday-skeleton-shift" /> : shiftText}</span><div className="myday-shift-times">
              <div><span>SHIFT START</span><strong>{loading ? <MyDaySkeleton className="myday-skeleton-time-small" /> : timestampLabel(todayEntry?.expectedStart, timeZone)}</strong></div><div><span>SHIFT END</span><strong>{loading ? <MyDaySkeleton className="myday-skeleton-time-small" /> : timestampLabel(todayEntry?.expectedEnd, timeZone)}</strong></div>
            </div>
            {todayEntry?.scheduledBreakMinutes ? <div className="myday-shift-break"><Coffee size={13} />{minutesLabel(todayEntry.scheduledBreakMinutes)} scheduled break</div> : null}
            </div>
          </div>
          <div className="myday-progress-block">
            <div className="myday-progress-labels"><span>{loading ? "Checking your schedule" : scheduledMinutes > 0 ? "Scheduled work progress" : "Today's schedule"}</span><strong>{loading ? "—" : scheduledMinutes > 0 ? progress + "%" : "Not scheduled"}</strong></div>
            <div className="myday-progress-track" role="progressbar" aria-label="Scheduled work completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
            <div className="myday-progress-foot"><span>{loading ? "Attendance data is loading" : scheduledMinutes > 0 ? minutesLabel(regularMinutes) + " completed" : (todayEntry?.publicHoliday?.name || "Enjoy your day")}</span><span>{!loading && scheduledMinutes > 0 && isClockedIn ? minutesLabel(remainingMinutes) + " scheduled time remaining" : ""}</span></div>
          </div>
          <div className="myday-attendance-actions">
            <Button type="button" size="lg" className={"myday-clock-button " + (isClockedIn ? "is-clock-out" : "is-clock-in")} busy={savingPunch} disabled={!canPunch || loading} onClick={() => void punch()} leading={<Clock3 size={18} />}>{savingPunch ? "Recording attendance…" : loading ? "Checking shift..." : isClockedIn ? "Clock out" : clockInTooEarly ? "Available at " + timestampLabel(todayEntry?.expectedStart, timeZone) : clockInTooLate ? "Shift ended" : approvedLeaveToday ? "On approved leave" : holidayToday ? "Public holiday" : !todayEntry?.expectedStart ? "No shift today" : "Clock in"}</Button>
            <span className="myday-clock-hint">{loading ? "Checking your assigned shift and attendance eligibility." : isClockedIn ? "Clock-out remains available so an open attendance session can always be closed." : approvedLeaveToday ? "Clock-in is unavailable during approved leave." : holidayToday ? "Clock-in is unavailable on an organization public holiday." : clockInTooEarly ? "Clock-in opens in " + minutesLabel(minutesUntilShift) + " at " + timestampLabel(todayEntry?.expectedStart, timeZone) + "." : clockInTooLate ? "Clock-in is closed because this shift has ended. Contact your manager if your schedule needs correction." : todayEntry?.expectedStart ? "Your shift and attendance rules are verified by HRMS." : "No active shift is assigned for today."}</span>
          </div>
          {punchError ? <p className="myday-inline-error" role="alert">{punchError}</p> : null}
          {todayEntry?.calculationStatus === "REVIEW_REQUIRED" ? <Link className="myday-review-link" href="/employee/requests"><AlertCircle size={15} />Your attendance needs review<ChevronRight size={15} /></Link> : null}
        </div>

        <aside className="myday-quick-card">
          <div><span className="myday-section-kicker">YOUR SHORTCUTS</span><h2>Get things done</h2><p>Common actions, right where you need them.</p></div>
          <div className="myday-quick-actions">
            <Link href="/employee/leave" className="myday-quick-action"><span className="myday-quick-icon"><CalendarCheck size={18} /></span><span><strong>Request leave</strong><small>Plan time away</small></span><ChevronRight size={16} /></Link>
            <Link href="/employee/requests" className="myday-quick-action"><span className="myday-quick-icon"><FileClock size={18} /></span><span><strong>Attendance & overtime</strong><small>Submit or track a request</small></span><ChevronRight size={16} /></Link>
            <Link href="/employee/payroll" className="myday-quick-action"><span className="myday-quick-icon"><Wallet size={18} /></span><span><strong>My earnings</strong><small>View pay and payslips</small></span><ChevronRight size={16} /></Link>
            <Link href="/employee/communications" className="myday-quick-action"><span className="myday-quick-icon"><MessageCircle size={18} /></span><span><strong>Messages</strong><small>Talk with your workplace</small></span><ChevronRight size={16} /></Link>
          </div>
        </aside>
      </section>

      <section className="myday-stat-grid" aria-label="Personal summary">
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-blue"><CalendarClock size={18} /></span><div><span className="myday-stat-label">Hours this week</span><strong>{snapshot.calendar ? minutesLabel(weekWorked) : loading ? <MyDaySkeleton className="myday-skeleton-stat" /> : "Unavailable"}</strong><small>{loading ? "Loading weekly hours..." : snapshot.calendar ? weekScheduled > 0 ? "Of " + minutesLabel(weekScheduled) + " scheduled this week" : "No scheduled hours this week" : "Weekly data unavailable"}</small></div></div>
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-amber"><FileClock size={18} /></span><div><span className="myday-stat-label">Pending requests</span><strong>{requestSourcesLoaded ? String(pendingRequests.length) : loading ? <MyDaySkeleton className="myday-skeleton-stat" /> : "Unavailable"}</strong><small>{requestSourcesLoaded ? "Waiting for a decision" : loading ? "Loading your requests..." : "Request status unavailable"}</small></div></div>
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-violet"><Mail size={18} /></span><div><span className="myday-stat-label">Unread messages</span><strong>{typeof unreadMessages === "number" ? String(unreadMessages) : loading ? <MyDaySkeleton className="myday-skeleton-stat" /> : "Unavailable"}</strong><small>{typeof unreadMessages === "number" ? "Personal conversations" : loading ? "Checking messages..." : "Message count unavailable"}</small></div></div>
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-green"><Wallet size={18} /></span><div><span className="myday-stat-label">Estimated earnings</span><strong>{loading ? <MyDaySkeleton className="myday-skeleton-stat myday-skeleton-money" /> : earningsAmount !== null ? formatMoney(earningsAmount, earningsCurrency) : earningsUnavailableLabel}</strong><small>{loading ? "Calculating month to date..." : earningsAmount !== null ? "Month to date · not a payment confirmation" : "Estimate not available yet"}</small></div></div>
      </section>

      <section className="myday-content-grid">
        <div className="myday-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">YOUR TIME</span><h2>Hours this week</h2><p>Recorded work compared with your assigned shifts.</p></div><Link href="/employee/reports" className="myday-text-link">Attendance report <ArrowRight size={14} /></Link></div>
          <div className="myday-chart-summary"><div><strong>{loading ? <MyDaySkeleton className="myday-skeleton-stat" /> : minutesLabel(weekWorked)}</strong><span>Worked so far</span></div><div><strong>{loading ? <MyDaySkeleton className="myday-skeleton-stat" /> : minutesLabel(weekScheduled)}</strong><span>Scheduled this week</span></div></div>
          {loading ? (
            <div className="myday-chart-loading" role="status" aria-label="Loading weekly attendance chart">
              {Array.from({ length: 7 }, (_, index) => <div className="myday-chart-day" key={index}><MyDaySkeleton className="myday-skeleton-chart-bar" /><MyDaySkeleton className="myday-skeleton-chart-label" /><MyDaySkeleton className="myday-skeleton-chart-day" /></div>)}
            </div>
          ) : !snapshot.calendar ? (
            <div className="myday-empty-state"><span><AlertCircle size={21} /></span><strong>Attendance chart unavailable</strong><small>Weekly attendance could not be retrieved. It will retry automatically.</small></div>
          ) : !hasWeeklyActivity ? (
            <div className="myday-empty-state"><span><CalendarClock size={21} /></span><strong>No scheduled hours this week</strong><small>Your weekly hours will appear here when a shift is assigned or attendance is recorded.</small></div>
          ) : (
            <>
              <div className="myday-hours-chart" role="img" aria-label="Daily worked hours compared with scheduled hours this week">
                {weekDays.map((day) => {
                  const scheduledHeight = Math.max(0, Math.min(100, day.scheduled / maxChartMinutes * 100));
                  const workedHeight = Math.max(0, Math.min(100, day.worked / maxChartMinutes * 100));
                  return <div className="myday-chart-day" key={day.date} title={dayLabel(day.date) + ": " + minutesLabel(day.worked) + " worked, " + minutesLabel(day.scheduled) + " scheduled"}>
                    <div className="myday-chart-track"><span className="myday-chart-scheduled" style={{ height: scheduledHeight + "%" }} /><span className="myday-chart-worked" style={{ height: workedHeight + "%" }} /></div>
                    <strong>{day.worked > 0 ? day.worked < 60 ? Math.round(day.worked) + "m" : (day.worked / 60).toFixed(1) + "h" : "—"}</strong><small>{day.label}</small>
                  </div>;
                })}
              </div>
              <div className="myday-chart-legend"><span><i className="is-worked" />Worked</span><span><i className="is-scheduled" />Scheduled</span></div>
            </>
          )}
        </div>

        <div className="myday-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">PLAN AHEAD</span><h2>Coming up</h2><p>Your next seven calendar days.</p></div><Link href="/employee/schedule" className="myday-icon-link" aria-label="Open full schedule"><ArrowRight size={17} /></Link></div>
          <div className="myday-upcoming-list">
            {loading ? (
              Array.from({ length: 5 }, (_, index) => <div className="myday-upcoming-skeleton" key={index}><MyDaySkeleton className="myday-skeleton-date" /><div><MyDaySkeleton className="myday-skeleton-row-title" /><MyDaySkeleton className="myday-skeleton-row-detail" /></div><MyDaySkeleton className="myday-skeleton-tag" /></div>)
            ) : !snapshot.calendar ? (
              <div className="myday-empty-state"><span><AlertCircle size={21} /></span><strong>Schedule unavailable</strong><small>Your upcoming shifts could not be loaded. Please try again shortly.</small></div>
            ) : !hasUpcomingSchedule ? (
              <div className="myday-empty-state"><span><CalendarDays size={21} /></span><strong>No upcoming shifts assigned</strong><small>Your next seven days have no scheduled shifts, approved leave or public holidays.</small></div>
            ) : upcomingDays.map(({ date, entry }) => {
              const label = entry?.scheduleName || (entry?.leaveRequest?.status === "APPROVED" ? humanize(entry.leaveRequest.leaveType) + " leave" : entry?.publicHoliday?.name || "Rest day");
              const detail = entry?.expectedStart && entry.expectedEnd ? timestampLabel(entry.expectedStart, timeZone) + " – " + timestampLabel(entry.expectedEnd, timeZone)
                : entry?.leaveRequest?.status === "APPROVED" ? "Approved time off" : entry?.publicHoliday ? "Organization holiday" : "No shift assigned";
              const state = entry?.scheduleName ? "Shift" : entry?.leaveRequest?.status === "APPROVED" ? "Leave" : entry?.publicHoliday ? "Holiday" : "Rest";
              return <button
                type="button"
                className="myday-upcoming-row myday-upcoming-button"
                key={date}
                onClick={() => setSelectedShift({ date, entry })}
                aria-label={"View " + label + " details for " + dayLabel(date)}
              >
                <span className="myday-upcoming-date"><strong>{new Date(date + "T12:00:00.000Z").getUTCDate()}</strong><small>{dayLabel(date).split(" ")[0]}</small></span>
                <span className="myday-upcoming-copy"><strong>{label}</strong><small>{detail}</small></span>
                <span className={"myday-schedule-tag " + (state === "Leave" || state === "Holiday" ? "is-timeoff" : state === "Rest" ? "is-rest" : "")}>{state}</span>
                <ChevronRight className="myday-upcoming-chevron" size={15} aria-hidden="true" />
              </button>;
            })}
          </div>
        </div>
      </section>

      <section className="myday-panel myday-monthly-panel">
        <div className="myday-panel-heading myday-monthly-heading">
          <div>
            <span className="myday-section-kicker">YOUR MONTH</span>
            <h2>Monthly attendance insights</h2>
            <p>{monthLabel} · {isCurrentInsightsMonth ? "Recorded work and approved paid time, month to date." : "Full-month attendance and approved paid time."}</p>
          </div>
          <div className="myday-month-panel-actions">
            <div className="myday-month-navigation" aria-label="Choose attendance insights month">
              <button
                type="button"
                className="myday-month-nav-button"
                aria-label="Previous month"
                title="Previous month"
                disabled={!canGoToPreviousMonth}
                onClick={() => setSelectedInsightsMonth(addCalendarMonths(activeInsightsMonth, -1))}
              ><ChevronLeft size={16} /></button>
              <div className="myday-month-current"><strong>{monthLabel}</strong><span>{isCurrentInsightsMonth ? "Month to date" : "Full month"}</span></div>
              <button
                type="button"
                className="myday-month-nav-button"
                aria-label="Next month"
                title="Next month"
                disabled={!canGoToNextMonth}
                onClick={() => setSelectedInsightsMonth(addCalendarMonths(activeInsightsMonth, 1))}
              ><ChevronRight size={16} /></button>
              {!isCurrentInsightsMonth ? (
                <button type="button" className="myday-month-current-button" onClick={() => setSelectedInsightsMonth(null)}>
                  <CalendarDays size={14} /> Current
                </button>
              ) : null}
            </div>
            <Link href="/employee/reports" className="myday-text-link">Attendance reports <ArrowRight size={14} /></Link>
          </div>
        </div>

        {monthlyEarningsLoading ? (
          <div className="myday-monthly-loading" role="status" aria-label="Loading monthly attendance insights">
            {Array.from({ length: 5 }, (_, index) => <div className="myday-month-metric-skeleton" key={index}><MyDaySkeleton className="myday-skeleton-row-detail" /><MyDaySkeleton className="myday-skeleton-stat" /></div>)}
          </div>
        ) : !monthlyEarnings ? (
          <div className="myday-empty-state">
            <span><AlertCircle size={21} /></span>
            <strong>Monthly attendance insights unavailable</strong>
            <small>{monthlyEarningsError || "Your monthly attendance breakdown could not be retrieved. It will retry automatically."}</small>
          </div>
        ) : (
          <>
            <div className="myday-month-metrics">
              <div className="myday-month-metric">
                <span className="myday-month-metric-icon myday-stat-blue"><Clock3 size={17} /></span>
                <span className="myday-month-metric-label">Total worked</span>
                <strong>{minutesLabel(monthTotalWorked)}</strong>
                <small>Actual recorded work</small>
              </div>
              <div className="myday-month-metric">
                <span className="myday-month-metric-icon myday-stat-violet"><CalendarCheck size={17} /></span>
                <span className="myday-month-metric-label">Days worked</span>
                <strong>{String(monthDaysWorked)}</strong>
                <small>Days with attendance</small>
              </div>
              <div className="myday-month-metric">
                <span className="myday-month-metric-icon myday-stat-blue"><CalendarClock size={17} /></span>
                <span className="myday-month-metric-label">Regular time</span>
                <strong>{minutesLabel(monthRegularWorked)}</strong>
                <small>Calculated regular hours</small>
              </div>
              <div className="myday-month-metric">
                <span className="myday-month-metric-icon myday-stat-amber"><FileClock size={17} /></span>
                <span className="myday-month-metric-label">Payable overtime</span>
                <strong>{minutesLabel(monthPayableOvertime)}</strong>
                <small>Approved and payable</small>
              </div>
              <div className="myday-month-metric">
                <span className="myday-month-metric-icon myday-stat-green"><CalendarDays size={17} /></span>
                <span className="myday-month-metric-label">Paid time off</span>
                <strong>{minutesLabel(monthPaidTimeOff)}</strong>
                <small>Paid leave and holidays</small>
              </div>
            </div>

            <div className="myday-month-chart-heading">
              <div><strong>Daily recorded work</strong><span>Actual worked hours for each day of the month</span></div>
              <span className="myday-month-chart-unit">Hours · {isCurrentInsightsMonth ? "month to date" : "full month"}</span>
            </div>
            {!hasMonthlyAttendance ? (
              <div className="myday-empty-state myday-month-chart-empty">
                <span><CalendarDays size={21} /></span>
                <strong>No attendance activity in {monthLabel}</strong>
                <small>Daily attendance bars will appear when work, paid leave or scheduled assignments are recorded in this month.</small>
              </div>
            ) : (
              <>
                <div className="myday-month-chart-scroll">
                  <div className="myday-month-chart">
                    {monthlyDays.map((day) => {
                      const worked = Number(day.workedMinutes ?? 0);
                      const barHeight = worked > 0 ? Math.max(3, Math.round((worked / monthMaxWorked) * 100)) : 0;
                      const dayNumber = Number(day.workDate.slice(8, 10));
                      const dayMarker = day.paidLeaveMinutes ? "L" : day.paidHolidayMinutes ? "H" : day.scheduleName && worked === 0 ? "S" : "";
                      const title = dayLabel(day.workDate) + " · " + minutesLabel(worked) + " recorded" +
                        (day.paidLeaveMinutes ? " · " + minutesLabel(day.paidLeaveMinutes) + " paid leave" : "") +
                        (day.paidHolidayMinutes ? " · " + minutesLabel(day.paidHolidayMinutes) + " paid holiday" : "");
                      return (
                        <button
                          type="button"
                          className={"myday-month-day-button" + (worked > 0 ? " has-work" : "") + (day.paidLeaveMinutes ? " is-leave" : "") + (day.paidHolidayMinutes ? " is-holiday" : "")}
                          key={day.workDate}
                          title={title}
                          aria-label={"View " + title}
                          onClick={() => setSelectedMonthDay(day)}
                        >
                          <span className="myday-month-bar-track">
                            <span className="myday-month-bar" style={{ height: barHeight + "%" }} />
                          </span>
                          <strong>{dayNumber}</strong>
                          <small>{dayMarker || " "}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="myday-month-chart-legend">
                  <span><i className="is-work" /> Recorded work</span>
                  <span><i className="is-leave" /> Paid leave</span>
                  <span><i className="is-holiday" /> Paid holiday</span>
                  <span><i className="is-scheduled" /> Scheduled day with no recorded work</span>
                </div>
                <p className="myday-month-chart-hint">Select any day to inspect its attendance, overtime and estimated pay details.</p>
              </>
            )}
            {monthUnapprovedOvertime > 0 ? (
              <div className="myday-month-overtime-note"><AlertCircle size={15} /><span>{minutesLabel(monthUnapprovedOvertime)} of additional overtime is awaiting approval and is not included in payable overtime.</span></div>
            ) : null}
          </>
        )}
      </section>

      <section className="myday-bottom-grid">
        <div className="myday-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">STAY ON TOP</span><h2>My requests</h2><p>Your latest leave, attendance and overtime requests.</p></div><Link href="/employee/requests" className="myday-text-link">View all <ArrowRight size={14} /></Link></div>
          {loading && !requestSourcesLoaded ? (
            <div className="myday-loading-rows" role="status" aria-label="Loading requests">
              {Array.from({ length: 3 }, (_, index) => <div className="myday-request-skeleton" key={index}><MyDaySkeleton className="myday-skeleton-request-icon" /><div><MyDaySkeleton className="myday-skeleton-row-title" /><MyDaySkeleton className="myday-skeleton-row-detail" /></div><MyDaySkeleton className="myday-skeleton-tag" /></div>)}
            </div>
          ) : allRequests.length > 0 ? <div className="myday-request-list">{allRequests.slice(0, 4).map((item) => <button type="button" className="myday-request-row myday-request-button" key={item.id} onClick={() => setSelectedRequest(item)} aria-label={"View details for " + item.title}>
            <span className="myday-request-icon"><FileClock size={17} /></span><span className="myday-request-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><StatusBadge value={item.status} /><ChevronRight size={15} className="myday-request-chevron" />
          </button>)}</div> : <div className="myday-empty-state"><span>{requestSourcesLoaded ? <CheckCircle2 size={21} /> : <AlertCircle size={21} />}</span><strong>{requestSourcesLoaded ? "You're all caught up" : "Request activity is unavailable"}</strong><small>{requestSourcesLoaded ? "Your recent requests will appear here when you submit them." : "We couldn't retrieve your request history. It will retry automatically."}</small></div>}
        </div>

        <div className="myday-panel myday-earnings-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">YOUR PAY</span><h2>Month to date</h2><p>Estimated earnings from recorded work.</p></div><span className="myday-earnings-icon"><Wallet size={19} /></span></div>
          <div className="myday-earnings-value">{loading ? <MyDaySkeleton className="myday-skeleton-money-value" /> : earningsAmount !== null ? formatMoney(earningsAmount, earningsCurrency) : earningsUnavailableLabel}</div>
          <span className="myday-earnings-note">{loading ? "Calculating your month-to-date estimate..." : earningsAmount !== null ? "Estimated · Not yet a payment confirmation" : "Your estimate is unavailable until pay data is complete."}</span>
          {loading ? (
            <div className="myday-earnings-breakdown myday-earnings-breakdown-loading"><div><MyDaySkeleton className="myday-skeleton-row-detail" /><MyDaySkeleton className="myday-skeleton-row-title" /></div><div><MyDaySkeleton className="myday-skeleton-row-detail" /><MyDaySkeleton className="myday-skeleton-row-title" /></div></div>
          ) : snapshot.earnings ? (
            <div className="myday-earnings-breakdown"><div><span>Regular hours</span><strong>{minutesLabel(earnings?.regularMinutes)}</strong></div><div><span>Payable overtime</span><strong>{minutesLabel(earnings?.payableOvertimeMinutes)}</strong></div></div>
          ) : (
            <div className="myday-earnings-unavailable">We couldn't retrieve your earnings summary. It will retry automatically.</div>
          )}
          {!loading && (earnings?.currencyMismatch || (earnings?.daysWithMissingRates ?? 0) > 0) ? <p className="myday-earnings-warning"><AlertCircle size={14} />Some dates need rate or currency review before the total can be confirmed.</p> : null}
          <Link href="/employee/payroll" className="myday-earnings-link">View earnings and payslips <ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className="myday-panel myday-punches-panel">
        <div className="myday-panel-heading"><div><span className="myday-section-kicker">TODAY'S ACTIVITY</span><h2>Attendance timeline</h2><p>Your recorded punches and scheduled shift boundaries.</p></div><Link href="/employee/attendance" className="myday-text-link">Attendance history <ArrowRight size={14} /></Link></div>
        <div className="myday-timeline">
          {loading ? (
            <div className="myday-loading-rows" role="status" aria-label="Loading attendance timeline">
              {Array.from({ length: 3 }, (_, index) => <div className="myday-request-skeleton" key={index}><MyDaySkeleton className="myday-skeleton-request-icon" /><div><MyDaySkeleton className="myday-skeleton-row-title" /><MyDaySkeleton className="myday-skeleton-row-detail" /></div><MyDaySkeleton className="myday-skeleton-tag" /></div>)}
            </div>
          ) : timelineItems.map((item) => (
            <div className={"myday-timeline-item" + (item.kind === "shift" ? " is-scheduled" : "")} key={item.key}>
              <span className="myday-timeline-marker">
                {item.kind === "shift" ? <CalendarClock size={14} /> : item.eventType === "CLOCK_IN" ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
              </span>
              <div>
                <strong>{item.label}</strong>
                <small>{timestampLabel(item.at, timeZone)}{item.source ? " · " + humanize(item.source) : ""}</small>
                {typeof item.elapsedMinutes === "number" ? <small className="myday-session-duration">Elapsed session: {minutesLabel(item.elapsedMinutes)}</small> : null}
              </div>
              {item.kind === "event" ? <StatusBadge value="RECORDED" /> : <span className="myday-timeline-meta">Shift</span>}
            </div>
          ))}
          {!loading && !timelineItems.some((item) => item.kind === "event") ? (
            <div className="myday-timeline-empty"><Clock3 size={16} />No attendance punches recorded today.</div>
          ) : null}
        </div>
      </section>
      <footer className="myday-footer-note"><Sparkles size={14} />Your attendance and earnings use your organization's verified work calendar and approved records.<span>{snapshot.calendar?.timeZone || timeZone}</span></footer>

      <Drawer
        open={Boolean(selectedShift)}
        title={selectedShift ? "Shift details" : "Shift details"}
        description={selectedShift ? dayLabel(selectedShift.date) : undefined}
        onClose={() => setSelectedShift(null)}
        width="standard"
        footer={<div className="myday-drawer-footer"><Link href="/employee/schedule" className="myday-drawer-link" onClick={() => setSelectedShift(null)}>Open my full schedule <ArrowRight size={15} /></Link></div>}
      >
        {selectedShift ? (() => {
          const entry = selectedShift.entry;
          const shiftMinutes = scheduledWorkMinutes(entry);
          const isLeave = entry?.leaveRequest?.status === "APPROVED";
          const holiday = entry?.publicHoliday;
          const hasShift = Boolean(entry?.scheduleName || entry?.expectedStart || entry?.expectedEnd);
          return (
            <div className="myday-detail-stack">
              <div className="myday-detail-status">
                <div><span className="myday-detail-eyebrow">WORK DATE</span><strong>{formatDate(selectedShift.date)}</strong></div>
                <StatusBadge value={isLeave ? "APPROVED" : holiday ? "HOLIDAY" : hasShift ? "SCHEDULED" : "REST DAY"} />
              </div>
              <div className="myday-detail-card">
                <span className="myday-detail-eyebrow">ASSIGNMENT</span>
                <h3>{isLeave ? humanize(entry?.leaveRequest?.leaveType) + " leave" : holiday ? holiday.name || "Public holiday" : entry?.scheduleName || "No shift assigned"}</h3>
                <p>{isLeave ? "Your leave is approved for this date." : holiday ? (holiday.isPaid ? "This is a paid public holiday." : "This is an unpaid public holiday.") : hasShift ? "These are the scheduled working hours assigned to you." : "There is no working shift assigned to you on this date."}</p>
              </div>
              {hasShift ? (
                <div className="myday-detail-metrics">
                  <div className="myday-detail-metric"><span>Shift starts</span><strong>{timestampLabel(entry?.expectedStart, timeZone)}</strong></div>
                  <div className="myday-detail-metric"><span>Shift ends</span><strong>{timestampLabel(entry?.expectedEnd, timeZone)}</strong></div>
                  <div className="myday-detail-metric"><span>Scheduled work</span><strong>{minutesLabel(shiftMinutes)}</strong></div>
                  <div className="myday-detail-metric"><span>Scheduled break</span><strong>{minutesLabel(entry?.scheduledBreakMinutes ?? 0)}</strong></div>
                </div>
              ) : null}
              {isLeave ? (
                <div className="myday-detail-section"><h4>Leave information</h4><div className="myday-detail-row"><span>Leave type</span><strong>{humanize(entry?.leaveRequest?.leaveType)}</strong></div><div className="myday-detail-row"><span>Payment</span><strong>{entry?.leaveRequest?.isPaid ? "Paid leave" : "Unpaid leave"}</strong></div></div>
              ) : null}
              {holiday ? (
                <div className="myday-detail-section"><h4>Holiday information</h4><div className="myday-detail-row"><span>Holiday</span><strong>{holiday.name || "Public holiday"}</strong></div><div className="myday-detail-row"><span>Payment</span><strong>{holiday.isPaid ? "Paid holiday" : "Unpaid holiday"}</strong></div></div>
              ) : null}
              {entry && (Number(entry.workedMinutes ?? 0) > 0 || (entry.events?.length ?? 0) > 0) ? (
                <div className="myday-detail-section">
                  <h4>Recorded attendance</h4>
                  <div className="myday-detail-row"><span>Worked time</span><strong>{minutesLabel(entry.workedMinutes)}</strong></div>
                  <div className="myday-detail-row"><span>Regular time</span><strong>{minutesLabel(entry.regularWorkedMinutes)}</strong></div>
                  <div className="myday-detail-row"><span>Payable overtime</span><strong>{minutesLabel(entry.payableOvertimeMinutes)}</strong></div>
                  {entry.events?.length ? <div className="myday-detail-event-list">{[...entry.events].sort((a,b) => Date.parse(a.recordedAt ?? "") - Date.parse(b.recordedAt ?? "")).map((event,index) => <div className="myday-detail-event" key={event.id || String(event.recordedAt) + index}><span>{humanize(event.eventType)}</span><strong>{timestampLabel(event.recordedAt,timeZone)}</strong></div>)}</div> : null}
                </div>
              ) : null}
              {entry?.leaveRequest?.status === "PENDING" ? <div className="myday-detail-note">A leave request is pending for this date. Check My Leave for its latest decision.</div> : null}
            </div>
          );
        })() : null}
      </Drawer>

      <Drawer
        open={Boolean(selectedMonthDay)}
        title="Daily attendance details"
        description={selectedMonthDay ? formatDate(selectedMonthDay.workDate) : undefined}
        onClose={() => setSelectedMonthDay(null)}
        width="standard"
        footer={<div className="myday-drawer-footer"><Link href="/employee/attendance" className="myday-drawer-link" onClick={() => setSelectedMonthDay(null)}>Open attendance history <ArrowRight size={15} /></Link></div>}
      >
        {selectedMonthDay ? (
          <div className="myday-detail-stack">
            <div className="myday-detail-status">
              <div><span className="myday-detail-eyebrow">WORK DATE</span><strong>{formatDate(selectedMonthDay.workDate)}</strong></div>
              {selectedMonthDay.calculationStatus ? <StatusBadge value={selectedMonthDay.calculationStatus} /> : <StatusBadge value="RECORDED" />}
            </div>
            <div className="myday-detail-card">
              <span className="myday-detail-eyebrow">DAILY SUMMARY</span>
              <h3>{selectedMonthDay.scheduleName || (selectedMonthDay.isPaidLeave ? "Paid leave" : selectedMonthDay.isPaidHoliday ? "Paid public holiday" : "Attendance record")}</h3>
              <p>{Number(selectedMonthDay.workedMinutes ?? 0) > 0
                ? "This is the attendance time calculated from your recorded and approved punch events."
                : selectedMonthDay.isPaidLeave
                  ? "No attendance work is recorded for this day. Paid leave time is included in payable time."
                  : selectedMonthDay.isPaidHoliday
                    ? "No attendance work is recorded for this day. Paid public holiday time is included in payable time."
                    : "There is no recorded work time for this date."}</p>
            </div>
            <div className="myday-detail-metrics">
              <div className="myday-detail-metric"><span>Actual worked</span><strong>{minutesLabel(selectedMonthDay.workedMinutes)}</strong></div>
              <div className="myday-detail-metric"><span>Regular time</span><strong>{minutesLabel(selectedMonthDay.regularWorkedMinutes)}</strong></div>
              <div className="myday-detail-metric"><span>Payable overtime</span><strong>{minutesLabel(selectedMonthDay.payableOvertimeMinutes)}</strong></div>
              <div className="myday-detail-metric"><span>Potential overtime</span><strong>{minutesLabel(selectedMonthDay.potentialOvertimeMinutes)}</strong></div>
            </div>
            {(Number(selectedMonthDay.paidLeaveMinutes ?? 0) > 0 || Number(selectedMonthDay.paidHolidayMinutes ?? 0) > 0) ? (
              <div className="myday-detail-section">
                <h4>Paid time</h4>
                {Number(selectedMonthDay.paidLeaveMinutes ?? 0) > 0 ? <div className="myday-detail-row"><span>Paid leave</span><strong>{minutesLabel(selectedMonthDay.paidLeaveMinutes)}</strong></div> : null}
                {Number(selectedMonthDay.paidHolidayMinutes ?? 0) > 0 ? <div className="myday-detail-row"><span>Paid holiday</span><strong>{minutesLabel(selectedMonthDay.paidHolidayMinutes)}</strong></div> : null}
              </div>
            ) : null}
            <div className="myday-detail-section">
              <h4>Punch records</h4>
              <div className="myday-detail-row"><span>Clock in</span><strong>{dateTimeLabel(selectedMonthDay.clockIn, timeZone)}</strong></div>
              <div className="myday-detail-row"><span>Clock out</span><strong>{dateTimeLabel(selectedMonthDay.clockOut, timeZone)}</strong></div>
            </div>
            {Number(selectedMonthDay.excessUnapprovedOvertimeMinutes ?? 0) > 0 ? (
              <div className="myday-detail-note">
                {minutesLabel(selectedMonthDay.excessUnapprovedOvertimeMinutes)} of additional overtime is not currently payable because it is awaiting the required approval or review.
              </div>
            ) : null}
            <div className="myday-detail-section">
              <h4>Estimated daily pay</h4>
              <div className="myday-detail-row"><span>Estimate</span><strong>{typeof selectedMonthDay.estimatedPay === "number" ? formatMoney(selectedMonthDay.estimatedPay, selectedMonthDay.currencyCode || earningsCurrency) : "Not available"}</strong></div>
              <p className="myday-detail-prose">This is an estimate based on recorded attendance, applicable rates and approved overtime. It is not a payslip or payment confirmation.</p>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(selectedRequest)}
        title={selectedRequest?.title || "Request details"}
        description={selectedRequest ? selectedRequest.kind === "leave" ? "Leave request" : selectedRequest.kind === "correction" ? "Attendance correction" : "Overtime pre-authorization" : undefined}
        onClose={() => setSelectedRequest(null)}
        width="standard"
        footer={<div className="myday-drawer-footer"><Link href={selectedRequest?.href || "/employee/requests"} className="myday-drawer-link" onClick={() => setSelectedRequest(null)}>{selectedRequest?.kind === "leave" ? "Open leave and holidays" : "Open my requests"} <ArrowRight size={15} /></Link></div>}
      >
        {selectedRequest ? (
          <div className="myday-detail-stack">
            <div className="myday-detail-status">
              <div><span className="myday-detail-eyebrow">REQUEST STATUS</span><strong>{humanize(selectedRequest.status)}</strong></div>
              <StatusBadge value={selectedRequest.status} />
            </div>
            <div className="myday-detail-card">
              <span className="myday-detail-eyebrow">REQUEST SUMMARY</span>
              <h3>{selectedRequest.title}</h3>
              <p>{selectedRequest.detail}</p>
            </div>
            <div className="myday-detail-section">
              <h4>Request information</h4>
              {selectedRequest.kind === "leave" ? (
                <>
                  <div className="myday-detail-row"><span>Leave type</span><strong>{humanize(selectedRequest.leaveType)}</strong></div>
                  <div className="myday-detail-row"><span>Start date</span><strong>{selectedRequest.startDate ? formatDate(selectedRequest.startDate) : "—"}</strong></div>
                  <div className="myday-detail-row"><span>End date</span><strong>{selectedRequest.endDate ? formatDate(selectedRequest.endDate) : "—"}</strong></div>
                  <div className="myday-detail-row"><span>Payment</span><strong>{selectedRequest.isPaid ? "Paid leave" : "Unpaid leave"}</strong></div>
                </>
              ) : selectedRequest.kind === "correction" ? (
                <>
                  <div className="myday-detail-row"><span>Work date</span><strong>{selectedRequest.workDate ? formatDate(selectedRequest.workDate) : "—"}</strong></div>
                  <div className="myday-detail-row"><span>Punch type</span><strong>{humanize(selectedRequest.eventType)}</strong></div>
                  <div className="myday-detail-row"><span>Requested punch time</span><strong>{dateTimeLabel(selectedRequest.requestedAt, timeZone)}</strong></div>
                  {selectedRequest.originalRecordedAt ? <div className="myday-detail-row"><span>Original recorded time</span><strong>{dateTimeLabel(selectedRequest.originalRecordedAt, timeZone)}</strong></div> : null}
                </>
              ) : (
                <>
                  <div className="myday-detail-row"><span>Work date</span><strong>{selectedRequest.workDate ? formatDate(selectedRequest.workDate) : "—"}</strong></div>
                  <div className="myday-detail-row"><span>Request type</span><strong>{humanize(selectedRequest.requestType)}</strong></div>
                  <div className="myday-detail-row"><span>Requested overtime</span><strong>{minutesLabel(selectedRequest.requestedMinutes)}</strong></div>
                  {typeof selectedRequest.approvedMinutes === "number" ? <div className="myday-detail-row"><span>Approved overtime</span><strong>{minutesLabel(selectedRequest.approvedMinutes)}</strong></div> : null}
                </>
              )}
              <div className="myday-detail-row"><span>Submitted</span><strong>{dateTimeLabel(selectedRequest.createdAt, timeZone)}</strong></div>
              {selectedRequest.decisionAt ? <div className="myday-detail-row"><span>Decision date</span><strong>{dateTimeLabel(selectedRequest.decisionAt, timeZone)}</strong></div> : null}
            </div>
            {selectedRequest.reason ? <div className="myday-detail-section"><h4>Your reason</h4><p className="myday-detail-prose">{selectedRequest.reason}</p></div> : null}
            {selectedRequest.reviewerNote ? <div className="myday-detail-section myday-reviewer-note"><h4>Reviewer feedback</h4><p className="myday-detail-prose">{selectedRequest.reviewerNote}</p></div> : selectedRequest.status.toUpperCase() === "PENDING" ? <div className="myday-detail-note">This request is awaiting review. You'll see the decision and any reviewer feedback here.</div> : null}
          </div>
        ) : null}
      </Drawer>
    </main>
  );
}
