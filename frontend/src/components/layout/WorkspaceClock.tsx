"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, LogIn, LogOut, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { getISODateInTimeZone } from "@/lib/format";
import { getAttendanceClockEligibility } from "@/lib/attendance-clock-eligibility";
import { ATTENDANCE_STATUS_CHANGED_EVENT, notifyAttendanceStatusChanged } from "@/lib/attendance-events";
import type { WorkspaceRole } from "@/types/workspace";

type AttendanceStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "loading" | "unavailable";
type ConfirmedStatus = Extract<AttendanceStatus, "CLOCKED_IN" | "CLOCKED_OUT">;
type ClockAction = "CLOCK_IN" | "CLOCK_OUT";
type ClockProps = {
  timeZone: string;
  timeZoneStatus: "loading" | "ready" | "unavailable";
  showAttendanceStatus?: boolean;
  employeeId?: string;
  role?: WorkspaceRole;
};

interface ShiftEntry {
  employeeId?: string;
  workDate?: string;
  scheduleName?: string | null;
  expectedStart?: string | null;
  expectedEnd?: string | null;
  leaveRequest?: { leaveType?: string; status?: string } | null;
  publicHoliday?: { name?: string } | null;
}
interface CalendarPayload {
  today?: string;
  timeZone?: string;
  entries?: ShiftEntry[];
}
interface ShiftData {
  today: string;
  entry: ShiftEntry | null;
}

function formatClock(timeZone: string) {
  const now = new Date();
  try {
    return {
      time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone }).format(now),
      date: new Intl.DateTimeFormat("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone }).format(now),
    };
  } catch {
    return { time: "--:--:--", date: "Time zone unavailable" };
  }
}

function formatActionTime(value: string | null | undefined, timeZone: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date);
  } catch {
    return "—";
  }
}

async function readStatus(): Promise<ConfirmedStatus> {
  const response = await apiRequest<{ clockStatus?: unknown; data?: { clockStatus?: unknown } }>("/attendance/events");
  const status = response.clockStatus ?? response.data?.clockStatus;
  if (status !== "CLOCKED_IN" && status !== "CLOCKED_OUT") throw new Error("Your current attendance status could not be confirmed.");
  return status;
}

async function readShiftData(employeeId: string, role: WorkspaceRole, timeZone: string): Promise<ShiftData> {
  const requestedToday = getISODateInTimeZone(timeZone);
  const scope = role === "HR_MANAGER" || role === "DEPARTMENT_MANAGER" ? "&scope=self" : "";
  const response = await apiRequest<CalendarPayload>(
    "/attendance/calendar?fromDate=" + requestedToday + "&toDate=" + requestedToday + scope,
  );
  const today = response.today || requestedToday;
  const entry = (response.entries ?? []).find((item) =>
    item.workDate === today && item.employeeId === employeeId,
  ) ?? null;
  return { today, entry };
}

export function WorkspaceClock({
  timeZone,
  timeZoneStatus,
  showAttendanceStatus = false,
  employeeId,
  role,
}: ClockProps) {
  const [clock, setClock] = useState(() => formatClock(timeZone));
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [status, setStatus] = useState<AttendanceStatus>(showAttendanceStatus ? "loading" : "unavailable");
  const [shiftData, setShiftData] = useState<ShiftData | null>(null);
  const [shiftStatus, setShiftStatus] = useState<"loading" | "ready" | "unavailable">(showAttendanceStatus ? "loading" : "unavailable");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const statusRef = useRef<AttendanceStatus>(status);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { setPortalReady(true); }, []);
  useEffect(() => {
    if (timeZoneStatus !== "ready") return;
    setClock(formatClock(timeZone));
    const timer = window.setInterval(() => {
      setClock(formatClock(timeZone));
      setClockNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timeZone, timeZoneStatus]);

  useEffect(() => {
    if (!showAttendanceStatus) return;
    if (!employeeId || !role || timeZoneStatus !== "ready") {
      setShiftStatus("unavailable");
      return;
    }

    let active = true;
    let inFlight = false;
    let queued = false;
    let forceQueued = false;
    let lastScheduleRefreshAt = 0;
    let lastScheduleDate = "";

    const refresh = async (forceShiftRefresh = false) => {
      if (!active || document.visibilityState !== "visible") return;
      if (inFlight) {
        queued = true;
        forceQueued = forceQueued || forceShiftRefresh;
        return;
      }
      inFlight = true;
      try {
        try {
          const next = await readStatus();
          if (active) setStatus(next);
        } catch {
          if (active) setStatus("unavailable");
        }

        let currentToday = "";
        try { currentToday = getISODateInTimeZone(timeZone); } catch { currentToday = ""; }
        const shouldRefreshShift = forceShiftRefresh ||
          (currentToday && currentToday !== lastScheduleDate) ||
          Date.now() - lastScheduleRefreshAt >= 60000;

        if (shouldRefreshShift) {
          lastScheduleRefreshAt = Date.now();
          if (currentToday) lastScheduleDate = currentToday;
          try {
            const nextShiftData = await readShiftData(employeeId, role, timeZone);
            if (active) {
              setShiftData(nextShiftData);
              setShiftStatus("ready");
            }
          } catch {
            if (active) {
              setShiftData(null);
              setShiftStatus("unavailable");
            }
          }
        }
      } finally {
        inFlight = false;
        if (active && queued && document.visibilityState === "visible") {
          const refreshShift = forceQueued;
          queued = false;
          forceQueued = false;
          void refresh(refreshShift);
        }
      }
    };

    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onAttendanceChanged = () => { void refresh(true); };
    setShiftStatus("loading");
    setShiftData(null);
    void refresh(true);
    const timer = window.setInterval(onVisible, 5000);
    window.addEventListener("focus", onVisible);
    window.addEventListener(ATTENDANCE_STATUS_CHANGED_EVENT, onAttendanceChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(ATTENDANCE_STATUS_CHANGED_EVENT, onAttendanceChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [showAttendanceStatus, employeeId, role, timeZone, timeZoneStatus]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
      (focusable ?? dialogRef.current)?.focus();
    });
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items: HTMLElement[] = [];
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])').forEach((item) => items.push(item));
      if (!items.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first: HTMLElement = items[0]; const last: HTMLElement = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeys);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeys);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else triggerRef.current?.focus();
    };
  }, [open, submitting]);

  const eligibility = getAttendanceClockEligibility({
    status,
    expectedStart: shiftData?.entry?.expectedStart,
    expectedEnd: shiftData?.entry?.expectedEnd,
    approvedLeave: shiftData?.entry?.leaveRequest?.status === "APPROVED",
    publicHoliday: Boolean(shiftData?.entry?.publicHoliday),
    now: clockNow,
  });
  const eligibilityReason = status === "CLOCKED_IN"
    ? null
    : shiftStatus !== "ready"
      ? "SHIFT_DATA_UNAVAILABLE"
      : eligibility.blockReason;
  const canPerformClockAction = status === "CLOCKED_IN" ||
    (status === "CLOCKED_OUT" && shiftStatus === "ready" && eligibility.canClockIn);
  const statusLabel = status === "CLOCKED_IN" ? "Clocked in" : status === "CLOCKED_OUT" ? "Clocked out" : status === "loading" ? "Checking" : "Unavailable";
  const organizationTimeLabel = timeZoneStatus === "ready"
    ? clock.date + " · " + timeZone
    : timeZoneStatus === "loading"
      ? "Loading organization time…"
      : "Organization time unavailable";

  let actionAvailabilityLabel = "Checking shift";
  let actionAvailabilityDetail = "Your assigned shift and attendance eligibility are being checked.";
  if (status === "CLOCKED_IN") {
    actionAvailabilityLabel = "Clock out";
    actionAvailabilityDetail = "Clock-out remains available so your open attendance session can always be closed.";
  } else if (status === "loading") {
    actionAvailabilityLabel = "Checking";
    actionAvailabilityDetail = "Your current attendance status is being confirmed.";
  } else if (status === "unavailable") {
    actionAvailabilityLabel = "Unavailable";
    actionAvailabilityDetail = "Your current attendance status could not be confirmed. Try again shortly.";
  } else if (shiftStatus === "loading") {
    actionAvailabilityLabel = "Checking shift";
    actionAvailabilityDetail = "Your assigned shift and attendance eligibility are being checked.";
  } else if (shiftStatus === "unavailable") {
    actionAvailabilityLabel = "Schedule unavailable";
    actionAvailabilityDetail = "Your assigned shift could not be retrieved. Clock-in is disabled until your shift eligibility can be verified.";
  } else {
    switch (eligibilityReason) {
      case "APPROVED_LEAVE":
        actionAvailabilityLabel = "On approved leave";
        actionAvailabilityDetail = "Clock-in is unavailable during approved leave.";
        break;
      case "PUBLIC_HOLIDAY":
        actionAvailabilityLabel = "Public holiday";
        actionAvailabilityDetail = "Clock-in is unavailable on an organization public holiday.";
        break;
      case "NO_SHIFT":
        actionAvailabilityLabel = "No shift today";
        actionAvailabilityDetail = "You do not have an active shift assigned for today. Contact your manager if this is unexpected.";
        break;
      case "INVALID_SHIFT":
        actionAvailabilityLabel = "Check schedule";
        actionAvailabilityDetail = "Your assigned shift times could not be verified. Contact your manager.";
        break;
      case "BEFORE_SHIFT":
        actionAvailabilityLabel = "Available at " + formatActionTime(shiftData?.entry?.expectedStart, timeZone);
        actionAvailabilityDetail = "Your shift starts at " + formatActionTime(shiftData?.entry?.expectedStart, timeZone) + ". Clock-in opens at that time.";
        break;
      case "SHIFT_ENDED":
        actionAvailabilityLabel = "Shift ended";
        actionAvailabilityDetail = "Your assigned shift has ended. Contact your manager if your schedule needs correction.";
        break;
      case null:
        actionAvailabilityLabel = "Clock in";
        actionAvailabilityDetail = "Your assigned shift is active. You can clock in now.";
        break;
      default:
        actionAvailabilityLabel = "Unavailable";
        actionAvailabilityDetail = "Clock-in eligibility could not be verified.";
    }
  }

  const headerTone = status === "CLOCKED_IN"
    ? "is-clock-out"
    : status === "CLOCKED_OUT" && canPerformClockAction
      ? "is-clock-in"
      : "is-clock-unknown";
  async function performAction() {
    if (!showAttendanceStatus || submitting || !canPerformClockAction) return;
    setSubmitting(true);
    setActionError("");
    setActionNotice("");
    const current = statusRef.current;
    const action: ClockAction = current === "CLOCKED_IN" ? "CLOCK_OUT" : "CLOCK_IN";
    const expected: ConfirmedStatus = action === "CLOCK_IN" ? "CLOCKED_IN" : "CLOCKED_OUT";
    try {
      await apiRequest("/attendance/events", { method: "POST", body: JSON.stringify({ action }) });
      const confirmed = await readStatus();
      if (confirmed !== expected) throw new Error("The attendance event was submitted, but the new clock status could not be confirmed. Refresh the status before trying again.");
      setStatus(confirmed);
      setActionNotice(action === "CLOCK_IN" ? "Your clock-in was recorded." : "Your clock-out was recorded.");
      notifyAttendanceStatusChanged();
      setOpen(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The attendance action was not accepted.";
      try {
        const confirmed = await readStatus();
        setStatus(confirmed);
        if (confirmed === expected) {
          setActionNotice(action === "CLOCK_IN" ? "Your clock-in was recorded." : "Your clock-out was recorded.");
          notifyAttendanceStatusChanged();
          setOpen(false);
          return;
        }
      } catch { setStatus("unavailable"); }
      setActionError(message);
    } finally { setSubmitting(false); }
  }

  const modal = open && portalReady ? createPortal(
    <div className="workspace-clock-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setOpen(false); }}>
      <section className="workspace-clock-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-clock-title" ref={dialogRef} tabIndex={-1}>
        <header className="workspace-clock-dialog-header"><div><span className="workspace-clock-eyebrow">Attendance terminal</span><h2 id="workspace-clock-title">Your working time</h2></div><button type="button" className="workspace-clock-close" aria-label="Close attendance clock" disabled={submitting} onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="workspace-clock-current"><div className="workspace-clock-current-icon"><Clock3 size={20} /></div><div><strong>{timeZoneStatus === "ready" ? clock.time : "--:--:--"}</strong><span>{organizationTimeLabel}</span></div></div>
        <div className="workspace-clock-status-line"><span className={"workspace-clock-dot " + (status === "CLOCKED_IN" ? "is-in" : status === "CLOCKED_OUT" ? "is-out" : "is-unknown")} /><span>Current status</span><strong>{statusLabel}</strong></div>
        {shiftData?.entry ? (
          <div className="workspace-clock-shift-card">
            <div className="workspace-clock-shift-copy">
              <span className="workspace-clock-shift-label">Assigned shift</span>
              <strong>{shiftData.entry.scheduleName || "Assigned shift"}</strong>
            </div>
            {shiftData.entry.expectedStart && shiftData.entry.expectedEnd ? (
              <div className="workspace-clock-shift-hours">
                <Clock3 size={14} aria-hidden="true" />
                <span>{formatActionTime(shiftData.entry.expectedStart, timeZone)} – {formatActionTime(shiftData.entry.expectedEnd, timeZone)}</span>
              </div>
            ) : (
              <p className="workspace-clock-shift-missing">Shift hours are not available. Contact your manager if this looks incorrect.</p>
            )}
          </div>
        ) : null}
        {actionError ? <div className="workspace-clock-alert" role="alert"><AlertCircle size={15} /><span>{actionError}</span></div> : null}
        {actionNotice ? <div className="workspace-clock-success" role="status"><CheckCircle2 size={15} /><span>{actionNotice}</span></div> : null}
        <div className={"workspace-clock-guidance " + (canPerformClockAction ? "is-available" : "is-restricted")}>
          <AlertCircle size={15} />
          <span>{actionAvailabilityDetail}</span>
        </div>
        <footer className="workspace-clock-dialog-footer">
          <button type="button" className="workspace-clock-secondary" disabled={submitting} onClick={() => setOpen(false)}>Close</button>
          <button
            type="button"
            className={"workspace-clock-primary " + headerTone}
            aria-label={submitting ? "Recording attendance" : actionAvailabilityLabel}
            disabled={submitting || !canPerformClockAction}
            onClick={() => void performAction()}
          >
            {submitting ? <LoaderCircle size={19} className="spin" aria-hidden="true" /> : status === "CLOCKED_IN" ? <LogOut size={19} aria-hidden="true" /> : canPerformClockAction ? <LogIn size={19} aria-hidden="true" /> : <Clock3 size={19} aria-hidden="true" />}
            <span>{submitting ? "Recording attendance…" : actionAvailabilityLabel}</span>
          </button>
        </footer>
      </section>
    </div>, document.body,
  ) : null;

  return <>
    {showAttendanceStatus ? (
      <button
        ref={triggerRef}
        type="button"
        className={"workspace-clock workspace-clock-actionable " + headerTone}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={(timeZoneStatus === "ready" ? "Workspace time " + clock.time : organizationTimeLabel) + ". " + statusLabel + ". " + actionAvailabilityDetail + " Open attendance clock."}
        onClick={() => { setActionError(""); setActionNotice(""); setOpen(true); }}
      >
        <span className="workspace-clock-icon"><Clock3 size={15} /></span>
        <span className="workspace-clock-readout"><strong>{timeZoneStatus === "ready" ? clock.time : "--:--:--"}</strong><span>{organizationTimeLabel}</span></span>
        <span className={"workspace-clock-action-pill " + headerTone}>
          {status === "CLOCKED_IN" ? <LogOut size={15} aria-hidden="true" /> : canPerformClockAction ? <LogIn size={15} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
          <span>{actionAvailabilityLabel}</span>
        </span>
      </button>
    ) : (
      <div className="workspace-clock workspace-clock-admin">
        <span className="workspace-clock-icon"><Clock3 size={15} /></span>
        <span className="workspace-clock-readout"><strong>{timeZoneStatus === "ready" ? clock.time : "--:--:--"}</strong><span>{organizationTimeLabel}</span></span>
      </div>
    )}
    {modal}
  </>;
}
