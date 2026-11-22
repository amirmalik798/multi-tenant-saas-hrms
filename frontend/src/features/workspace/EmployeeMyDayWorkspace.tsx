"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, CalendarCheck, CalendarClock, CalendarDays,
  CheckCircle2, ChevronRight, Clock3, Coffee, FileClock, Mail,
  MessageCircle, Sparkles, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { apiRequest } from "@/lib/api-client";
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
  estimatedSalary?: number | null; regularMinutes?: number; payableOvertimeMinutes?: number;
  daysWithMissingRates?: number; currencyMismatch?: boolean;
}
interface EarningsPayload { month?: string; currencyCode?: string | null; summary?: EarningsSummary }
interface RequestItem extends Record<string, unknown> {
  id?: string; status?: string; createdAt?: string; requestedAt?: string; workDate?: string;
  startDate?: string; endDate?: string; leaveType?: string; eventType?: string; requestedMinutes?: number;
}
interface RequestPayload { requests?: RequestItem[] }
interface NotificationPayload { unreadMessages?: number }
interface MyDaySnapshot {
  calendar: CalendarPayload | null; punches: PunchPayload | null; earnings: EarningsPayload | null;
  leave: RequestPayload | null; corrections: RequestPayload | null; overtime: RequestPayload | null;
  notifications: NotificationPayload | null;
}
interface HomeRequest { id: string; title: string; detail: string; status: string; href: string; createdAt: string }

const EMPTY_SNAPSHOT: MyDaySnapshot = {
  calendar: null, punches: null, earnings: null, leave: null, corrections: null, overtime: null, notifications: null,
};

function addCalendarDays(value: string, amount: number): string {
  const date = new Date(value + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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
  const leave = (snapshot.leave?.requests ?? []).map((item, index) => ({
    id: "leave-" + String(item.id ?? index),
    title: humanize(item.leaveType) + " leave",
    detail: item.startDate && item.endDate
      ? formatDate(String(item.startDate)) + (item.startDate === item.endDate ? "" : " – " + formatDate(String(item.endDate)))
      : "Leave request",
    status: String(item.status ?? "UNKNOWN"), href: "/employee/leave", createdAt: createdAt(item),
  }));
  const corrections = (snapshot.corrections?.requests ?? []).map((item, index) => ({
    id: "correction-" + String(item.id ?? index), title: humanize(item.eventType) + " correction",
    detail: item.workDate ? formatDate(String(item.workDate)) : "Attendance correction",
    status: String(item.status ?? "UNKNOWN"), href: "/employee/requests", createdAt: createdAt(item),
  }));
  const overtime = (snapshot.overtime?.requests ?? []).map((item, index) => ({
    id: "overtime-" + String(item.id ?? index), title: "Overtime request",
    detail: (item.workDate ? formatDate(String(item.workDate)) : "Scheduled work") +
      (typeof item.requestedMinutes === "number" ? " · " + minutesLabel(item.requestedMinutes) : ""),
    status: String(item.status ?? "UNKNOWN"), href: "/employee/requests", createdAt: createdAt(item),
  }));
  return [...leave, ...corrections, ...overtime].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function EmployeeMyDayWorkspace() {
  const { user, timeZone, workDate, timeZoneStatus, currencyCode } = useWorkspace();
  const today = workDate || (timeZoneStatus === "ready" ? getISODateInTimeZone(timeZone) : "");
  const [snapshot, setSnapshot] = useState<MyDaySnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [criticalError, setCriticalError] = useState("");
  const [partialWarning, setPartialWarning] = useState("");
  const [savingPunch, setSavingPunch] = useState(false);
  const [punchError, setPunchError] = useState("");

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
  const statusKnown = isClockedIn || clockStatus === "CLOCKED_OUT";
  const scheduledMinutes = scheduledWorkMinutes(todayEntry);
  const workedMinutes = Number(todayEntry?.workedMinutes ?? 0);
  const regularMinutes = Number(todayEntry?.regularWorkedMinutes ?? workedMinutes);
  const progress = scheduledMinutes > 0 ? Math.min(100, Math.round((regularMinutes / scheduledMinutes) * 100)) : 0;
  const remainingMinutes = Math.max(0, scheduledMinutes - regularMinutes);
  const approvedLeaveToday = todayEntry?.leaveRequest?.status === "APPROVED";
  const holidayToday = Boolean(todayEntry?.publicHoliday);
  const canPunch = Boolean(todayEntry?.expectedStart && todayEntry.expectedEnd) &&
    statusKnown && !savingPunch && !approvedLeaveToday && !holidayToday;

  const weekStart = today ? mondayOf(today) : "";
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(weekStart, index);
    const entry = entriesByDate.get(date);
    return { date, label: dayLabel(date).split(" ")[0], worked: Number(entry?.workedMinutes ?? 0), scheduled: scheduledWorkMinutes(entry) };
  }), [weekStart, entriesByDate]);
  const weekWorked = weekDays.filter((day) => day.date <= today).reduce((sum, day) => sum + day.worked, 0);
  const weekScheduledToDate = weekDays.filter((day) => day.date <= today).reduce((sum, day) => sum + day.scheduled, 0);
  const maxChartMinutes = Math.max(600, ...weekDays.map((day) => Math.max(day.worked, day.scheduled)));
  const upcomingDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(today, index + 1);
    return { date, entry: entriesByDate.get(date) };
  }), [today, entriesByDate]);

  const allRequests = useMemo(() => buildRequests(snapshot), [snapshot]);
  const requestSourcesLoaded = Boolean(snapshot.leave && snapshot.corrections && snapshot.overtime);
  const pendingRequests = allRequests.filter((item) => item.status.toUpperCase() === "PENDING");
  const unreadMessages = snapshot.notifications?.unreadMessages;
  const earnings = snapshot.earnings?.summary;
  const earningsAmount = typeof earnings?.estimatedSalary === "number" ? earnings.estimatedSalary : null;
  const earningsCurrency = snapshot.earnings?.currencyCode || currencyCode;
  const firstName = user.firstName?.trim() || user.displayName?.trim().split(/\s+/)[0] || "there";
  let greeting = "Welcome";
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date()));
    greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  } catch { greeting = "Welcome"; }

  const statusText = isClockedIn ? "You're currently clocked in"
    : hasAttendanceEvents ? "Your last recorded action was clock-out" : "Your workday has not started";
  const shiftText = todayEntry?.scheduleName || (approvedLeaveToday
    ? humanize(todayEntry?.leaveRequest?.leaveType) + " leave"
    : todayEntry?.publicHoliday?.name || (todayEntry?.expectedStart ? "Assigned shift" : "No shift scheduled today"));

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

  const recentEvents = [...todaysEvents].sort((a, b) =>
    (Date.parse(b.recordedAt ?? "") || 0) - (Date.parse(a.recordedAt ?? "") || 0),
  ).slice(0, 4);

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
          <div className="myday-attendance-topline"><span className="myday-overline">YOUR WORKDAY</span><span className={"myday-live-state" + (isClockedIn ? " is-live" : "")}><span className="myday-live-dot" />{loading ? "Checking status" : isClockedIn ? "On the clock" : hasAttendanceEvents ? "Clocked out" : "Not started"}</span></div>
          <div className="myday-attendance-main">
            <div><p className="myday-overline myday-muted-overline">TIME WORKED TODAY</p><div className="myday-worked-value">{loading ? "—" : minutesLabel(workedMinutes)}</div><p className="myday-attendance-caption">{statusText}</p></div>
            <div className="myday-shift-summary"><span className="myday-shift-name">{shiftText}</span><div className="myday-shift-times">
              <div><span>SHIFT START</span><strong>{timestampLabel(todayEntry?.expectedStart, timeZone)}</strong></div><div><span>SHIFT END</span><strong>{timestampLabel(todayEntry?.expectedEnd, timeZone)}</strong></div>
            </div></div>
          </div>
          <div className="myday-progress-block">
            <div className="myday-progress-labels"><span>{scheduledMinutes > 0 ? "Scheduled work progress" : "Today's schedule"}</span><strong>{scheduledMinutes > 0 ? progress + "%" : "Not scheduled"}</strong></div>
            <div className="myday-progress-track" role="progressbar" aria-label="Scheduled work completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
            <div className="myday-progress-foot"><span>{scheduledMinutes > 0 ? minutesLabel(regularMinutes) + " completed" : (todayEntry?.publicHoliday?.name || "Enjoy your day")}</span><span>{scheduledMinutes > 0 && isClockedIn ? minutesLabel(remainingMinutes) + " scheduled time remaining" : todayEntry?.scheduledBreakMinutes ? minutesLabel(todayEntry.scheduledBreakMinutes) + " scheduled break" : ""}</span></div>
          </div>
          <div className="myday-attendance-actions">
            <Button type="button" size="lg" className={"myday-clock-button " + (isClockedIn ? "is-clock-out" : "is-clock-in")} busy={savingPunch} disabled={!canPunch || loading} onClick={() => void punch()} leading={<Clock3 size={18} />}>{savingPunch ? "Recording attendance…" : isClockedIn ? "Clock out" : "Clock in"}</Button>
            <span className="myday-clock-hint">{approvedLeaveToday || holidayToday ? "Attendance actions are unavailable for approved leave or a public holiday." : todayEntry?.expectedStart ? "Your shift and attendance rules are verified by HRMS." : "No active shift is assigned for today."}</span>
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
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-blue"><CalendarClock size={18} /></span><div><span className="myday-stat-label">Hours this week</span><strong>{loading ? "—" : minutesLabel(weekWorked)}</strong><small>{weekScheduledToDate > 0 ? "Of " + minutesLabel(weekScheduledToDate) + " scheduled to date" : "No scheduled hours yet"}</small></div></div>
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-amber"><FileClock size={18} /></span><div><span className="myday-stat-label">Pending requests</span><strong>{requestSourcesLoaded ? String(pendingRequests.length) : "—"}</strong><small>{requestSourcesLoaded ? "Waiting for a decision" : "Request status unavailable"}</small></div></div>
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-violet"><Mail size={18} /></span><div><span className="myday-stat-label">Unread messages</span><strong>{typeof unreadMessages === "number" ? String(unreadMessages) : "—"}</strong><small>{typeof unreadMessages === "number" ? "Personal conversations" : "Message count unavailable"}</small></div></div>
        <div className="myday-stat-card"><span className="myday-stat-icon myday-stat-green"><Wallet size={18} /></span><div><span className="myday-stat-label">Estimated earnings</span><strong>{earningsAmount !== null ? formatMoney(earningsAmount, earningsCurrency) : earnings?.daysWithMissingRates ? "Rates needed" : "—"}</strong><small>{snapshot.earnings ? "Month to date · not a payment confirmation" : "Earnings unavailable"}</small></div></div>
      </section>

      <section className="myday-content-grid">
        <div className="myday-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">YOUR TIME</span><h2>Hours this week</h2><p>Recorded work compared with your assigned shifts.</p></div><Link href="/employee/reports" className="myday-text-link">Attendance report <ArrowRight size={14} /></Link></div>
          <div className="myday-chart-summary"><div><strong>{minutesLabel(weekWorked)}</strong><span>Worked so far</span></div><div><strong>{minutesLabel(weekScheduledToDate)}</strong><span>Scheduled to date</span></div></div>
          <div className="myday-hours-chart" role="img" aria-label="Daily worked hours compared with scheduled hours this week">
            {weekDays.map((day) => {
              const scheduledHeight = Math.max(0, Math.min(100, day.scheduled / maxChartMinutes * 100));
              const workedHeight = Math.max(0, Math.min(100, day.worked / maxChartMinutes * 100));
              return <div className="myday-chart-day" key={day.date} title={dayLabel(day.date) + ": " + minutesLabel(day.worked) + " worked, " + minutesLabel(day.scheduled) + " scheduled"}>
                <div className="myday-chart-track"><span className="myday-chart-scheduled" style={{ height: scheduledHeight + "%" }} /><span className="myday-chart-worked" style={{ height: workedHeight + "%" }} /></div>
                <strong>{day.worked > 0 ? (day.worked / 60).toFixed(1) : "—"}</strong><small>{day.label}</small>
              </div>;
            })}
          </div>
          <div className="myday-chart-legend"><span><i className="is-worked" />Worked</span><span><i className="is-scheduled" />Scheduled</span></div>
        </div>

        <div className="myday-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">PLAN AHEAD</span><h2>Coming up</h2><p>Your next seven calendar days.</p></div><Link href="/employee/schedule" className="myday-icon-link" aria-label="Open full schedule"><ArrowRight size={17} /></Link></div>
          <div className="myday-upcoming-list">
            {upcomingDays.map(({ date, entry }) => {
              const label = entry?.scheduleName || (entry?.leaveRequest?.status === "APPROVED" ? humanize(entry.leaveRequest.leaveType) + " leave" : entry?.publicHoliday?.name || "Rest day");
              const detail = entry?.expectedStart && entry.expectedEnd ? timestampLabel(entry.expectedStart, timeZone) + " – " + timestampLabel(entry.expectedEnd, timeZone)
                : entry?.leaveRequest?.status === "APPROVED" ? "Approved time off" : entry?.publicHoliday ? "Organization holiday" : "No shift assigned";
              const state = entry?.scheduleName ? "Shift" : entry?.leaveRequest?.status === "APPROVED" ? "Leave" : entry?.publicHoliday ? "Holiday" : "Rest";
              return <div className="myday-upcoming-row" key={date}>
                <div className="myday-upcoming-date"><strong>{new Date(date + "T12:00:00.000Z").getUTCDate()}</strong><small>{dayLabel(date).split(" ")[0]}</small></div>
                <div className="myday-upcoming-copy"><strong>{label}</strong><small>{detail}</small></div>
                <span className={"myday-schedule-tag " + (state === "Leave" || state === "Holiday" ? "is-timeoff" : state === "Rest" ? "is-rest" : "")}>{state}</span>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section className="myday-bottom-grid">
        <div className="myday-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">STAY ON TOP</span><h2>My requests</h2><p>Your latest leave, attendance and overtime requests.</p></div><Link href="/employee/requests" className="myday-text-link">View all <ArrowRight size={14} /></Link></div>
          {allRequests.length > 0 ? <div className="myday-request-list">{allRequests.slice(0, 4).map((item) => <Link href={item.href} className="myday-request-row" key={item.id}>
            <span className="myday-request-icon"><FileClock size={17} /></span><span className="myday-request-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><StatusBadge value={item.status} /><ChevronRight size={15} className="myday-request-chevron" />
          </Link>)}</div> : <div className="myday-empty-state"><span><CheckCircle2 size={21} /></span><strong>{requestSourcesLoaded ? "You're all caught up" : "Request activity is unavailable"}</strong><small>{requestSourcesLoaded ? "Your recent requests will appear here when you submit them." : "We couldn't retrieve your request history. It will retry automatically."}</small></div>}
        </div>

        <div className="myday-panel myday-earnings-panel">
          <div className="myday-panel-heading"><div><span className="myday-section-kicker">YOUR PAY</span><h2>Month to date</h2><p>Estimated earnings from recorded work.</p></div><span className="myday-earnings-icon"><Wallet size={19} /></span></div>
          <div className="myday-earnings-value">{earningsAmount !== null ? formatMoney(earningsAmount, earningsCurrency) : earnings?.daysWithMissingRates ? "Rates needed" : "—"}</div>
          <span className="myday-earnings-note">Estimated · Not yet a payment confirmation</span>
          <div className="myday-earnings-breakdown"><div><span>Regular hours</span><strong>{minutesLabel(earnings?.regularMinutes)}</strong></div><div><span>Payable overtime</span><strong>{minutesLabel(earnings?.payableOvertimeMinutes)}</strong></div></div>
          {earnings?.currencyMismatch || (earnings?.daysWithMissingRates ?? 0) > 0 ? <p className="myday-earnings-warning"><AlertCircle size={14} />Some dates need rate or currency review before the total can be confirmed.</p> : null}
          <Link href="/employee/payroll" className="myday-earnings-link">View earnings and payslips <ArrowRight size={15} /></Link>
        </div>
      </section>

      <section className="myday-panel myday-punches-panel">
        <div className="myday-panel-heading"><div><span className="myday-section-kicker">TODAY'S ACTIVITY</span><h2>Attendance timeline</h2><p>Your recorded punches and scheduled shift boundaries.</p></div><Link href="/employee/attendance" className="myday-text-link">Attendance history <ArrowRight size={14} /></Link></div>
        <div className="myday-timeline">
          {todayEntry?.expectedStart ? <div className="myday-timeline-item is-scheduled"><span className="myday-timeline-marker"><CalendarClock size={14} /></span><div><strong>Scheduled start</strong><small>{timestampLabel(todayEntry.expectedStart, timeZone)}</small></div><span className="myday-timeline-meta">Shift</span></div> : null}
          {recentEvents.length > 0 ? recentEvents.slice().reverse().map((event, index) => <div className="myday-timeline-item" key={event.id || String(event.recordedAt) + index}>
            <span className="myday-timeline-marker">{event.eventType === "CLOCK_IN" ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}</span>
            <div><strong>{humanize(event.eventType)}</strong><small>{timestampLabel(event.recordedAt, timeZone)}{event.source ? " · " + humanize(event.source) : ""}</small></div><StatusBadge value="RECORDED" />
          </div>) : <div className="myday-timeline-empty"><Clock3 size={16} />No attendance punches recorded today.</div>}
          {todayEntry?.expectedEnd ? <div className="myday-timeline-item is-scheduled"><span className="myday-timeline-marker"><CalendarClock size={14} /></span><div><strong>Scheduled finish</strong><small>{timestampLabel(todayEntry.expectedEnd, timeZone)}</small></div><span className="myday-timeline-meta">Shift</span></div> : null}
          {todayEntry?.scheduledBreakMinutes ? <div className="myday-timeline-break"><Coffee size={14} />{minutesLabel(todayEntry.scheduledBreakMinutes)} scheduled break · timing follows your assigned shift policy.</div> : null}
        </div>
      </section>
      <footer className="myday-footer-note"><Sparkles size={14} />Your attendance and earnings use your organization's verified work calendar and approved records.<span>{snapshot.calendar?.timeZone || timeZone}</span></footer>
    </main>
  );
}
