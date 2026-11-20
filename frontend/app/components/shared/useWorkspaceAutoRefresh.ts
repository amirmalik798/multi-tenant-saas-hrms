"use client";

import { useEffect, useRef } from "react";

/**
 * Refresh read-only workspace data only after it becomes stale. The same
 * freshness check is reused for timer, tab focus, page restore, and visibility
 * changes so returning to a tab never causes duplicate requests.
 *
 * A confirmed attendance change bypasses the normal stale interval so mounted
 * attendance, schedule, and payroll views immediately reload server data.
 */
export function useWorkspaceAutoRefresh(
  refresh: () => void | Promise<void>,
  options: { enabled?: boolean; intervalMs?: number; shouldRefresh?: () => boolean } = {},
) {
  const refreshRef = useRef(refresh);
  const shouldRefreshRef = useRef(options.shouldRefresh);
  refreshRef.current = refresh;
  shouldRefreshRef.current = options.shouldRefresh;

  const enabled = options.enabled ?? true;
  const intervalMs = options.intervalMs ?? 60_000;

  useEffect(() => {
    if (!enabled) return;
    let lastRefreshAt = Date.now();
    let running = false;
    let attendanceRefreshPending = false;
    let retryTimeout: number | null = null;

    const refreshWorkspace = (force = false) => {
      if (document.visibilityState !== "visible") {
        if (force) attendanceRefreshPending = true;
        return;
      }
      if (running) {
        if (force) attendanceRefreshPending = true;
        return;
      }
      if (shouldRefreshRef.current && !shouldRefreshRef.current()) {
        if (force) attendanceRefreshPending = true;
        return;
      }
      if (!force && !attendanceRefreshPending && Date.now() - lastRefreshAt < intervalMs) {
        return;
      }

      lastRefreshAt = Date.now();
      attendanceRefreshPending = false;
      running = true;

      Promise.resolve()
        .then(() => refreshRef.current())
        .catch(() => {
          // Existing loaders own user-facing error state.
        })
        .finally(() => {
          running = false;
          // If a punch arrived during an in-flight read, perform a fresh read
          // after that request settles. The interval below retries if a page
          // is still saving or otherwise temporarily guarded.
          if (attendanceRefreshPending && retryTimeout === null) {
            retryTimeout = window.setTimeout(() => {
              retryTimeout = null;
              refreshWorkspace(true);
            }, 0);
          }
        });
    };

    const refreshIfStale = () => {
      refreshWorkspace(attendanceRefreshPending);
    };
    const refreshAfterAttendanceChange = () => {
      refreshWorkspace(true);
    };

    const timer = window.setInterval(refreshIfStale, 10_000);
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("pageshow", refreshIfStale);
    window.addEventListener("hrms:attendance-status-changed", refreshAfterAttendanceChange);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(timer);
      if (retryTimeout !== null) window.clearTimeout(retryTimeout);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("pageshow", refreshIfStale);
      window.removeEventListener("hrms:attendance-status-changed", refreshAfterAttendanceChange);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [enabled, intervalMs]);
}
