"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, LogIn, LogOut, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { ATTENDANCE_STATUS_CHANGED_EVENT, notifyAttendanceStatusChanged } from "@/lib/attendance-events";

type AttendanceStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "loading" | "unavailable";
type ConfirmedStatus = Extract<AttendanceStatus, "CLOCKED_IN" | "CLOCKED_OUT">;
type ClockAction = "CLOCK_IN" | "CLOCK_OUT";
type ClockProps = { timeZone: string; timeZoneStatus: "loading" | "ready" | "unavailable"; showAttendanceStatus?: boolean };

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

async function readStatus(): Promise<ConfirmedStatus> {
  const response = await apiRequest<{ clockStatus?: unknown; data?: { clockStatus?: unknown } }>("/attendance/events");
  const status = response.clockStatus ?? response.data?.clockStatus;
  if (status !== "CLOCKED_IN" && status !== "CLOCKED_OUT") throw new Error("Your current attendance status could not be confirmed.");
  return status;
}

export function WorkspaceClock({ timeZone, timeZoneStatus, showAttendanceStatus = false }: ClockProps) {
  const [clock, setClock] = useState(() => formatClock(timeZone));
  const [status, setStatus] = useState<AttendanceStatus>(showAttendanceStatus ? "loading" : "unavailable");
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
    const timer = window.setInterval(() => setClock(formatClock(timeZone)), 1000);
    return () => window.clearInterval(timer);
  }, [timeZone, timeZoneStatus]);

  useEffect(() => {
    if (!showAttendanceStatus) return;
    let active = true;
    let inFlight = false;
    let queued = false;
    const refresh = async () => {
      if (!active || document.visibilityState !== "visible") return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try {
        const next = await readStatus();
        if (active) setStatus(next);
      } catch {
        if (active) setStatus("unavailable");
      } finally {
        inFlight = false;
        if (active && queued && document.visibilityState === "visible") { queued = false; void refresh(); }
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = window.setInterval(onVisible, 5_000);
    window.addEventListener("focus", onVisible);
    window.addEventListener(ATTENDANCE_STATUS_CHANGED_EVENT, onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(ATTENDANCE_STATUS_CHANGED_EVENT, onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [showAttendanceStatus]);

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

  async function performAction() {
    if (!showAttendanceStatus || submitting) return;
    setSubmitting(true); setActionError(""); setActionNotice("");
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
      // A lost response must not create duplicate punches: confirm the actual server state first.
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

  const statusLabel = status === "CLOCKED_IN" ? "Clocked in" : status === "CLOCKED_OUT" ? "Clocked out" : status === "loading" ? "Checking" : "Unavailable";
  const organizationTimeLabel = timeZoneStatus === "ready"
    ? `${clock.date} · ${timeZone}`
    : timeZoneStatus === "loading"
      ? "Loading organization time…"
      : "Organization time unavailable";
  // Match the source workspace behavior: the header communicates the next
  // available action, rather than merely echoing the stored attendance state.
  const currentClockAction: ClockAction | null = status === "CLOCKED_IN"
    ? "CLOCK_OUT"
    : status === "CLOCKED_OUT"
      ? "CLOCK_IN"
      : null;
  const headerActionLabel = status === "loading"
    ? "CHECKING"
    : status === "unavailable"
      ? "UNAVAILABLE"
      : currentClockAction === "CLOCK_IN"
        ? "CLOCK-IN"
        : "CLOCK-OUT";
  const headerTone = currentClockAction === null
    ? "is-clock-unknown"
    : currentClockAction === "CLOCK_IN"
      ? "is-clock-in"
      : "is-clock-out";
  const modal = open && portalReady ? createPortal(
    <div className="workspace-clock-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setOpen(false); }}>
      <section className="workspace-clock-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-clock-title" ref={dialogRef} tabIndex={-1}>
        <header className="workspace-clock-dialog-header"><div><span className="workspace-clock-eyebrow">Attendance terminal</span><h2 id="workspace-clock-title">Your working time</h2></div><button type="button" className="workspace-clock-close" aria-label="Close attendance clock" disabled={submitting} onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="workspace-clock-current"><div className="workspace-clock-current-icon"><Clock3 size={20} /></div><div><strong>{timeZoneStatus === "ready" ? clock.time : "--:--:--"}</strong><span>{organizationTimeLabel}</span></div></div>
        <div className="workspace-clock-status-line"><span className={`workspace-clock-dot ${status === "CLOCKED_IN" ? "is-in" : status === "CLOCKED_OUT" ? "is-out" : "is-unknown"}`} /><span>Current status</span><strong>{statusLabel}</strong></div>
        {actionError ? <div className="workspace-clock-alert" role="alert"><AlertCircle size={15} /><span>{actionError}</span></div> : null}
        {actionNotice ? <div className="workspace-clock-success" role="status"><CheckCircle2 size={15} /><span>{actionNotice}</span></div> : null}
        <div className="workspace-clock-guidance">Your assigned shift and organization attendance rules are checked by the server. Clock-in may be restricted outside your permitted shift window; clock-out remains available to close an open session.</div>
        <footer className="workspace-clock-dialog-footer">
          <button type="button" className="workspace-clock-secondary" disabled={submitting} onClick={() => setOpen(false)}>Close</button>
          <button
            type="button"
            className={`workspace-clock-primary ${status === "CLOCKED_IN" ? "is-clock-out" : status === "CLOCKED_OUT" ? "is-clock-in" : "is-clock-unknown"}`}
            aria-label={submitting ? "Recording attendance" : status === "CLOCKED_IN" ? "Clock out" : "Clock in"}
            disabled={submitting || status === "loading" || status === "unavailable"}
            onClick={() => void performAction()}
          >
            {submitting ? <LoaderCircle size={19} className="spin" aria-hidden="true" /> : status === "CLOCKED_IN" ? <LogOut size={19} aria-hidden="true" /> : <LogIn size={19} aria-hidden="true" />}
            <span>{submitting ? "Recording attendance…" : status === "CLOCKED_IN" ? "Clock Out" : "Clock In"}</span>
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
        className={`workspace-clock workspace-clock-actionable ${headerTone}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${timeZoneStatus === "ready" ? `Workspace time ${clock.time}` : organizationTimeLabel}. ${statusLabel}. Next action: ${headerActionLabel.toLowerCase()}. Open attendance clock.`}
        onClick={() => { setActionError(""); setActionNotice(""); setOpen(true); }}
      >
        <span className="workspace-clock-icon"><Clock3 size={15} /></span>
        <span className="workspace-clock-readout"><strong>{timeZoneStatus === "ready" ? clock.time : "--:--:--"}</strong><span>{organizationTimeLabel}</span></span>
        <span className={`workspace-clock-action-pill ${headerTone}`}>
          {currentClockAction === "CLOCK_IN" ? <LogIn size={15} aria-hidden="true" /> : currentClockAction === "CLOCK_OUT" ? <LogOut size={15} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
          <span>{headerActionLabel === "CLOCK-IN" ? "Clock In" : headerActionLabel === "CLOCK-OUT" ? "Clock Out" : headerActionLabel}</span>
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

