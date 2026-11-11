"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

type ClockSnapshot = { time: string; date: string; zone: string };
type ContextStatus = "loading" | "ready" | "unavailable";
type AttendanceStatus = "CLOCKED_IN" | "CLOCKED_OUT" | "loading" | "unavailable";

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

  useEffect(() => {
    if (!showAttendanceStatus) return;

    let active = true;
    let requestInFlight = false;

    const loadAttendanceStatus = async () => {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        const response = await fetch("/api/backend/attendance/events", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Attendance status unavailable");

        const payload = await response.json().catch(() => null) as
          | { clockStatus?: unknown; data?: { clockStatus?: unknown } }
          | null;
        const status = payload?.clockStatus ?? payload?.data?.clockStatus;

        if (status !== "CLOCKED_IN" && status !== "CLOCKED_OUT") {
          throw new Error("Attendance status was not confirmed");
        }

        if (active) setAttendanceStatus(status);
      } catch {
        if (active) setAttendanceStatus("unavailable");
      } finally {
        requestInFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadAttendanceStatus();
    };

    void loadAttendanceStatus();
    const timer = window.setInterval(() => void loadAttendanceStatus(), 10_000);
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

  return (
    <div
      aria-label={showAttendanceStatus
        ? `${attendanceLabel}. ${snapshot ? `${snapshot.time}, ${snapshot.date}, ${snapshot.zone}` : statusLabel}`
        : snapshot ? `Workspace time ${snapshot.time}, ${snapshot.date}, ${snapshot.zone}` : statusLabel}
      title={snapshot ? `${snapshot.date} · ${snapshot.zone}` : statusLabel}
      className={`sa-workspace-clock flex min-w-[112px] shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:min-w-[150px] sm:gap-2 sm:px-3 sm:py-2 ${containerTone}`} data-workspace-clock="true"
    >
      <span className={`flex size-7 items-center justify-center rounded-lg border sm:size-8 ${iconTone}`}>
        <Clock3 size={14} className="sm:hidden" />
        <Clock3 size={16} className="hidden sm:block" />
      </span>
      <span className="min-w-0">
        <span className="sa-clock-time flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-bold tabular-nums tracking-tight text-slate-100 sm:text-sm">
          {snapshot?.time ?? "--:--:--"}
          {showAttendanceStatus && (
            <span className={`inline-flex items-center gap-1 rounded-md border border-current/15 bg-black/10 px-1.5 py-0.5 font-sans text-[8px] font-extrabold tracking-[0.08em] sm:text-[9px] ${attendanceTone.label}`}>
              <span className={`size-1.5 rounded-full ${attendanceTone.dot}`} />
              {attendanceLabel}
            </span>
          )}
        </span>
        <span className="sa-clock-date hidden max-w-44 truncate text-[10px] font-medium text-slate-400 md:block">
          {snapshot ? `${snapshot.date} · ${snapshot.zone}` : statusLabel}
        </span>
      </span>
    </div>
  );
}
