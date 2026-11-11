"use client";

import { useEffect, useRef } from "react";

/**
 * Refresh read-only workspace data only after it becomes stale. The same
 * freshness check is reused for timer, tab focus, page restore, and visibility
 * changes so returning to a tab never causes duplicate requests.
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

    const refreshIfStale = () => {
      if (
        running ||
        document.visibilityState !== "visible" ||
        Date.now() - lastRefreshAt < intervalMs ||
        (shouldRefreshRef.current && !shouldRefreshRef.current())
      ) return;

      lastRefreshAt = Date.now();
      running = true;
      Promise.resolve()
        .then(() => refreshRef.current())
        .catch(() => {
          // Existing loaders own user-facing error state.
        })
        .finally(() => { running = false; });
    };

    const timer = window.setInterval(refreshIfStale, 10_000);
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("pageshow", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("pageshow", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [enabled, intervalMs]);
}
