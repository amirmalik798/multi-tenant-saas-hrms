"use client";

import { useEffect, useRef } from "react";

export const ATTENDANCE_STATUS_CHANGED_EVENT = "hrms:attendance-status-changed";

/** Notify every mounted workspace that attendance-dependent data may have changed. */
export function notifyAttendanceStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ATTENDANCE_STATUS_CHANGED_EVENT));
}

/** Refresh the active workspace when a clock-in or clock-out is confirmed. */
export function useAttendanceRefresh(onAttendanceChanged: () => void, enabled = true) {
  const callbackRef = useRef(onAttendanceChanged);

  useEffect(() => {
    callbackRef.current = onAttendanceChanged;
  }, [onAttendanceChanged]);

  useEffect(() => {
    if (!enabled) return;
    const handleAttendanceChanged = () => callbackRef.current();
    window.addEventListener(ATTENDANCE_STATUS_CHANGED_EVENT, handleAttendanceChanged);
    return () => window.removeEventListener(ATTENDANCE_STATUS_CHANGED_EVENT, handleAttendanceChanged);
  }, [enabled]);
}
