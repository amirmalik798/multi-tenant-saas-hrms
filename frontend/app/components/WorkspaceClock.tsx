"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, LoaderCircle, LogIn, LogOut, X } from "lucide-react";

type ClockSnapshot = { time: string; date: string; zone: string };
type ContextStatus = "loading" | "ready" | "unavailable";
type AttendanceStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "loading" | "unavailable";
type ConfirmedAttendanceStatus = Extract<AttendanceStatus, "CLOCKED_IN" | "CLOCKED_OUT">;
type ClockAction = "CLOCK_IN" | "CLOCK_OUT";
type AttendanceStatusResponse = {
  clockStatus?: unknown;
  data?: { clockStatus?: unknown };
  message?: unknown;
};
type AttendanceEventResponse = {
  message?: unknown;
  event?: { recordedAt?: unknown } | null;
};

async function readAttendanceStatus(): Promise<ConfirmedAttendanceStatus> {
  const response = await fetch("/api/backend/attendance/events", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as AttendanceStatusResponse | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : "Attendance status is unavailable. Please try again.",
    );
  }

  const status = payload?.clockStatus ?? payload?.data?.clockStatus;
  if (status !== "CLOCKED_IN" && status !== "CLOCKED_OUT") {
    throw new Error("Your current attendance status could not be confirmed.");
  }
  return status;
}

function readClock(timeZone: string | null): ClockSnapshot | null {
  const now = new Date();
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  try {
    const options = timeZone ? { timeZone } : {};
    return {
      time: new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        ...options,
      }).format(now),
      date: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...options,
      }).format(now),
      zone,
    };
  } catch {
    // Never silently substitute the device timezone for an organization clock.
    return null;
  }
}

/**
 * Tenant workspaces must opt into organization time. The platform dashboard
 * intentionally keeps the default device-local clock.
 */
export default function WorkspaceClock({
  requireOrganizationTimeZone = false,
  showAttendanceStatus = false,
}: {
  requireOrganizationTimeZone?: boolean;
  showAttendanceStatus?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<ClockSnapshot | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [contextStatus, setContextStatus] = useState<ContextStatus>(
    requireOrganizationTimeZone ? "loading" : "ready",
  );
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>(
    showAttendanceStatus ? "loading" : "unavailable",
  );
  const [clockModalOpen, setClockModalOpen] = useState(false);
  const [modalStatusLoading, setModalStatusLoading] = useState(false);
  const [clockSubmitting, setClockSubmitting] = useState(false);
  const [clockStatusError, setClockStatusError] = useState("");
  const [clockActionError, setClockActionError] = useState("");
  const [clockActionResult, setClockActionResult] = useState<"success" | null>(null);
  const [completedAction, setCompletedAction] = useState<ClockAction | null>(null);
  const [recordedAtLabel, setRecordedAtLabel] = useState("");
  const attendanceStatusRevisionRef = useRef(0);
  const [portalReady, setPortalReady] = useState(false);
  const clockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  // Wait until hydration has completed before creating a browser-only portal.
  useEffect(() => {
    setPortalReady(true);
  }, []);

  // The dialog lives under document.body so sticky headers, backdrop filters,
  // transformed shells and overflow containers cannot clip or reposition it.
  useEffect(() => {
    if (!clockModalOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = dialogRef.current?.querySelector<HTMLElement>(
        "[data-dialog-initial-focus]",
      );
      (initialFocus ?? dialogRef.current)?.focus();
    });

    const keepFocusInsideDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", keepFocusInsideDialog);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", keepFocusInsideDialog);
      document.body.style.overflow = previousBodyOverflow;

      if (clockTriggerRef.current?.isConnected) {
        clockTriggerRef.current.focus();
      }
    };
  }, [clockModalOpen]);

  useEffect(() => {
    if (!showAttendanceStatus) return;

    let active = true;
    let requestInFlight = false;

    const loadAttendanceStatus = async () => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      const revision = attendanceStatusRevisionRef.current;

      try {
        const status = await readAttendanceStatus();
        if (active && revision === attendanceStatusRevisionRef.current) {
          setAttendanceStatus(status);
        }
      } catch {
        if (active && revision === attendanceStatusRevisionRef.current) {
          setAttendanceStatus("unavailable");
        }
      } finally {
        requestInFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadAttendanceStatus();
    };

    void loadAttendanceStatus();
    const timer = window.setInterval(refreshWhenVisible, 10_000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("hrms:attendance-status-changed", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("hrms:attendance-status-changed", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [showAttendanceStatus]);

  useEffect(() => {
    if (!requireOrganizationTimeZone) {
      setContextStatus("ready");
      return;
    }

    let active = true;
    const loadContext = async () => {
      try {
        const response = await fetch("/api/backend/workspace/context", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Organization time context unavailable");
        const context = await response.json() as { timeZone?: unknown };
        if (typeof context.timeZone !== "string" || !context.timeZone.trim()) {
          throw new Error("Organization timezone is missing");
        }
        // Validate before publishing the value to the clock.
        new Intl.DateTimeFormat("en-US", { timeZone: context.timeZone });
        if (active) {
          setTimeZone(context.timeZone);
          setContextStatus("ready");
        }
      } catch {
        if (active) {
          setTimeZone(null);
          setContextStatus("unavailable");
        }
      }
    };

    void loadContext();
    const retry = window.setInterval(() => { void loadContext(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(retry);
    };
  }, [requireOrganizationTimeZone]);

  useEffect(() => {
    if (requireOrganizationTimeZone && contextStatus !== "ready") {
      setSnapshot(null);
      return;
    }
    const update = () => setSnapshot(readClock(requireOrganizationTimeZone ? timeZone : null));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [contextStatus, requireOrganizationTimeZone, timeZone]);

  async function refreshModalAttendanceStatus() {
    setModalStatusLoading(true);
    setClockStatusError("");
    try {
      const status = await readAttendanceStatus();
      attendanceStatusRevisionRef.current += 1;
      setAttendanceStatus(status);
    } catch (caught) {
      setClockStatusError(
        caught instanceof Error
          ? caught.message
          : "Your attendance status could not be loaded. Please try again.",
      );
    } finally {
      setModalStatusLoading(false);
    }
  }

  async function openClockConfirmation() {
    if (!showAttendanceStatus) return;
    setClockModalOpen(true);
    setClockStatusError("");
    setClockActionError("");
    setClockActionResult(null);
    setCompletedAction(null);
    setRecordedAtLabel("");

    if (attendanceStatus === "loading" || attendanceStatus === "unavailable") {
      await refreshModalAttendanceStatus();
    }
  }

  function closeClockConfirmation() {
    if (clockSubmitting) return;
    setClockModalOpen(false);
    setClockStatusError("");
    setClockActionError("");
    setClockActionResult(null);
    setCompletedAction(null);
    setRecordedAtLabel("");
  }

  async function confirmClockAction() {
    if (clockSubmitting) return;

    const action: ClockAction | null =
      attendanceStatus === "CLOCKED_IN"
        ? "CLOCK_OUT"
        : attendanceStatus === "CLOCKED_OUT"
          ? "CLOCK_IN"
          : null;

    if (!action) {
      setClockStatusError("Your current attendance status could not be confirmed. Refresh it before continuing.");
      return;
    }

    if (!snapshot || (requireOrganizationTimeZone && contextStatus !== "ready")) {
      setClockStatusError("The organization's current time is unavailable. Please try again when it has loaded.");
      return;
    }

    setClockSubmitting(true);
    setClockActionError("");
    try {
      const response = await fetch("/api/backend/attendance/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null) as AttendanceEventResponse | null;

      if (!response.ok) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : "Your attendance action could not be recorded. Please try again.",
        );
      }

      attendanceStatusRevisionRef.current += 1;
      setAttendanceStatus(action === "CLOCK_IN" ? "CLOCKED_IN" : "CLOCKED_OUT");
      setCompletedAction(action);
      setClockActionResult("success");

      if (typeof payload?.event?.recordedAt === "string") {
        const recordedAt = new Date(payload.event.recordedAt);
        if (!Number.isNaN(recordedAt.getTime())) {
          try {
            setRecordedAtLabel(
              new Intl.DateTimeFormat("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
                ...(timeZone ? { timeZone } : {}),
              }).format(recordedAt),
            );
          } catch {
            setRecordedAtLabel(snapshot.time);
          }
        }
      }

      window.dispatchEvent(new Event("hrms:attendance-status-changed"));
    } catch (caught) {
      let latestStatus: ConfirmedAttendanceStatus | null = null;
      try {
        latestStatus = await readAttendanceStatus();
        attendanceStatusRevisionRef.current += 1;
        setAttendanceStatus(latestStatus);
      } catch {
        // The action result is unknown until the attendance status can be read again.
      }

      const expectedStatus = action === "CLOCK_IN" ? "CLOCKED_IN" : "CLOCKED_OUT";
      if (latestStatus === expectedStatus) {
        // The server may have saved the punch even if its response was lost.
        setClockActionError("");
        setCompletedAction(action);
        setClockActionResult("success");
        window.dispatchEvent(new Event("hrms:attendance-status-changed"));
      } else {
        setClockActionError(
          caught instanceof Error
            ? caught.message
            : "Your attendance action could not be recorded. Please try again.",
        );
      }
    } finally {
      setClockSubmitting(false);
    }
  }

  useEffect(() => {
    if (!clockModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !clockSubmitting) {
        setClockModalOpen(false);
        setClockStatusError("");
        setClockActionError("");
        setClockActionResult(null);
        setCompletedAction(null);
        setRecordedAtLabel("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clockModalOpen, clockSubmitting]);

  const currentClockAction: ClockAction | null =
    attendanceStatus === "CLOCKED_IN"
      ? "CLOCK_OUT"
      : attendanceStatus === "CLOCKED_OUT"
        ? "CLOCK_IN"
        : null;
  const displayedAction = clockActionResult === "success" && completedAction
    ? completedAction
    : currentClockAction;
  const displayedActionName = displayedAction === "CLOCK_IN" ? "clock-in" : "clock-out";
  const attendanceLabel =
    attendanceStatus === "CLOCKED_IN" ? "CLOCKED IN" :
    attendanceStatus === "CLOCKED_OUT" ? "CLOCKED OUT" :
    attendanceStatus === "loading" ? "CHECKING" : "STATUS UNAVAILABLE";
  const attendanceTone = attendanceStatus === "CLOCKED_IN"
    ? {
        container: "border-emerald-400/30 bg-gradient-to-br from-emerald-400/[0.14] to-emerald-500/[0.06]",
        icon: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
        label: "text-emerald-300",
        dot: "bg-emerald-400",
      }
    : attendanceStatus === "CLOCKED_OUT"
      ? {
          container: "border-rose-400/30 bg-gradient-to-br from-rose-400/[0.14] to-rose-500/[0.06]",
          icon: "border-rose-300/25 bg-rose-300/10 text-rose-200",
          label: "text-rose-300",
          dot: "bg-rose-400",
        }
      : {
          container: "border-sky-400/20 bg-gradient-to-br from-sky-400/[0.12] to-indigo-400/[0.06]",
          icon: "border-sky-300/20 bg-sky-300/10 text-sky-200",
          label: "text-slate-400",
          dot: "bg-slate-400",
        };
  const containerTone = showAttendanceStatus ? attendanceTone.container : "border-sky-400/20 bg-gradient-to-br from-sky-400/[0.12] to-indigo-400/[0.06]";
  const iconTone = showAttendanceStatus ? attendanceTone.icon : "border-sky-300/20 bg-sky-300/10 text-sky-200";
  const statusLabel = requireOrganizationTimeZone && contextStatus !== "ready"
    ? contextStatus === "loading" ? "Loading organization time…" : "Organization time unavailable"
    : "Workspace time";

  const clockContent = (
    <>
      <span className={"flex size-7 items-center justify-center rounded-lg border sm:size-8 " + iconTone}>
        <Clock3 size={14} className="sm:hidden" />
        <Clock3 size={16} className="hidden sm:block" />
      </span>
      <span className="min-w-0 text-left">
        <span className="sa-clock-time flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-bold tabular-nums tracking-tight text-slate-100 sm:text-sm">
          {snapshot?.time ?? "--:--:--"}
          {showAttendanceStatus && (
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={"inline-flex items-center gap-1 rounded-md border border-current/15 bg-black/10 px-1.5 py-0.5 font-sans text-[8px] font-extrabold tracking-[0.08em] sm:text-[9px] " + attendanceTone.label}
            >
              <span className={"size-1.5 rounded-full " + attendanceTone.dot} />
              {currentClockAction === "CLOCK_IN"
                ? "CLOCK-IN"
                : currentClockAction === "CLOCK_OUT"
                  ? "CLOCK-OUT"
                  : attendanceStatus === "loading"
                    ? "CHECKING"
                    : "UNAVAILABLE"}
            </span>
          )}
        </span>
        <span className="sa-clock-date hidden max-w-44 truncate text-[10px] font-medium text-slate-400 md:block">
          {snapshot ? snapshot.date + " · " + snapshot.zone : statusLabel}
        </span>
      </span>
    </>
  );

  const modalCanConfirm = Boolean(
    currentClockAction &&
    snapshot &&
    (!requireOrganizationTimeZone || contextStatus === "ready") &&
    !modalStatusLoading &&
    !clockSubmitting &&
    clockActionResult !== "success" &&
    !clockStatusError
  );

  return (
    <>
      {showAttendanceStatus ? (
        <button
          ref={clockTriggerRef}
          type="button"
          onClick={() => { void openClockConfirmation(); }}
          aria-label={
            currentClockAction
              ? "Attendance clock. Click to confirm " + displayedActionName + ". Current status " + attendanceLabel + "."
              : "Attendance clock. " + attendanceLabel + ". Click to check attendance status."
          }
          title={
            currentClockAction
              ? "Click to confirm " + displayedActionName
              : "Click to check your attendance status"
          }
          aria-haspopup="dialog"
          aria-expanded={clockModalOpen}
          data-workspace-clock="true"
          data-workspace-clock-interactive="true"
          className={
            "sa-workspace-clock group flex min-w-[112px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-200 hover:-translate-y-0.5 hover:border-sky-300/50 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-0 sm:min-w-[150px] sm:gap-2 sm:px-3 sm:py-2 " +
            containerTone
          }
        >
          {clockContent}
          <ArrowRight
            size={13}
            aria-hidden="true"
            className="ml-auto shrink-0 text-sky-200/60 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-100"
          />
        </button>
      ) : (
        <div
          aria-label={
            snapshot
              ? "Workspace time " + snapshot.time + ", " + snapshot.date + ", " + snapshot.zone
              : statusLabel
          }
          title={snapshot ? snapshot.date + " · " + snapshot.zone : statusLabel}
          data-workspace-clock="true"
          className={
            "sa-workspace-clock flex min-w-[112px] shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:min-w-[150px] sm:gap-2 sm:px-3 sm:py-2 " +
            containerTone
          }
        >
          {clockContent}
        </div>
      )}

      {showAttendanceStatus && clockModalOpen && portalReady && typeof document !== "undefined" && createPortal((
        <div
          className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/25 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeClockConfirmation();
          }}
        >
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-clock-dialog-title"
            aria-describedby="workspace-clock-dialog-description"
            onMouseDown={(event) => event.stopPropagation()}
            className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md shrink-0 overflow-y-auto overscroll-contain rounded-3xl border border-slate-700/80 bg-[#0b1220] shadow-[0_28px_80px_rgba(0,0,0,0.42)] outline-none sm:max-h-[calc(100dvh-2.5rem)]"
          >
            <div className="h-1 w-full bg-gradient-to-r from-sky-400 via-indigo-400 to-cyan-300" />
            <div className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={
                    "flex size-12 shrink-0 items-center justify-center rounded-2xl border " +
                    (clockActionResult === "success"
                      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                      : displayedAction === "CLOCK_OUT"
                        ? "border-rose-300/25 bg-rose-400/10 text-rose-200"
                        : "border-sky-300/25 bg-sky-400/10 text-sky-200")
                  }>
                    {clockActionResult === "success" ? (
                      <CheckCircle2 size={24} />
                    ) : displayedAction === "CLOCK_OUT" ? (
                      <LogOut size={23} />
                    ) : displayedAction === "CLOCK_IN" ? (
                      <LogIn size={23} />
                    ) : (
                      <Clock3 size={23} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/80">
                      Attendance confirmation
                    </p>
                    <h2 id="workspace-clock-dialog-title" className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
                      {clockActionResult === "success"
                        ? (completedAction === "CLOCK_IN" ? "Clock-in recorded" : "Clock-out recorded")
                        : modalStatusLoading
                          ? "Checking attendance"
                          : clockStatusError && !currentClockAction
                            ? "Attendance status unavailable"
                            : currentClockAction === "CLOCK_IN"
                              ? "Confirm clock-in"
                              : currentClockAction === "CLOCK_OUT"
                                ? "Confirm clock-out"
                                : "Attendance clock"}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeClockConfirmation}
                  disabled={clockSubmitting}
                  aria-label="Close attendance confirmation"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-white/[0.03] text-slate-400 transition hover:border-slate-500 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X size={17} />
                </button>
              </div>

              <p id="workspace-clock-dialog-description" className="mt-5 text-sm leading-relaxed text-slate-300">
                {clockActionResult === "success"
                  ? "Your attendance event has been saved successfully."
                  : currentClockAction === "CLOCK_IN"
                    ? "Please confirm that you are starting your work shift now."
                    : currentClockAction === "CLOCK_OUT"
                      ? "Please confirm that you are ending your current work session now."
                      : "We are checking your latest attendance record before allowing a clock action."}
              </p>

              <div className="mt-5 rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Current organization time
                  </span>
                  <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-sky-200">
                    Live
                  </span>
                </div>
                <p className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                  {snapshot?.time ?? "--:--:--"}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  {snapshot ? snapshot.date + " · " + snapshot.zone : statusLabel}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
                  <span className="text-xs text-slate-400">Current attendance status</span>
                  <span className={"inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-extrabold tracking-wider " + attendanceTone.label + " " + attendanceTone.container}>
                    <span className={"size-1.5 rounded-full " + attendanceTone.dot} />
                    {attendanceLabel}
                  </span>
                </div>
              </div>

              {modalStatusLoading && (
                <div role="status" className="mt-4 flex items-center gap-2 text-xs font-medium text-sky-200">
                  <LoaderCircle size={15} className="animate-spin" />
                  Checking your latest attendance status…
                </div>
              )}

              {clockStatusError && (
                <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-100">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{clockStatusError}</span>
                </div>
              )}

              {clockActionError && (
                <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-400/[0.08] p-3 text-xs leading-relaxed text-rose-100">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{clockActionError}</span>
                </div>
              )}

              {clockActionResult === "success" && (
                <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] p-3 text-xs leading-relaxed text-emerald-100">
                  {completedAction === "CLOCK_IN"
                    ? "You are now clocked in."
                    : "You are now clocked out."}
                  {recordedAtLabel ? " Recorded at " + recordedAtLabel + " (" + (timeZone || "organization time") + ")." : ""}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                {clockActionResult === "success" ? (
                  <button
                    type="button"
                    onClick={closeClockConfirmation}
                    autoFocus
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.98]"
                  >
                    Done
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={closeClockConfirmation}
                      disabled={clockSubmitting}
                      data-dialog-initial-focus
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-white/[0.03] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    {clockStatusError && !currentClockAction ? (
                      <button
                        type="button"
                        onClick={() => { void refreshModalAttendanceStatus(); }}
                        disabled={modalStatusLoading}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {modalStatusLoading && <LoaderCircle size={15} className="animate-spin" />}
                        Retry status
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { void confirmClockAction(); }}
                        disabled={!modalCanConfirm}
                        aria-busy={clockSubmitting}
                        className={
                          "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold !text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none [&>svg]:!text-white " +
                          (currentClockAction === "CLOCK_OUT"
                            ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                            : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20")
                        }
                      >
                        {clockSubmitting ? (
                          <>
                            <LoaderCircle size={16} className="animate-spin" />
                            Recording…
                          </>
                        ) : (
                          <>
                            {currentClockAction === "CLOCK_OUT" ? <LogOut size={16} /> : <LogIn size={16} />}
                            Confirm {currentClockAction === "CLOCK_OUT" ? "CLOCK-OUT" : "CLOCK-IN"}
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      ), document.body)}
    </>
  );
}
