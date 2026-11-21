"use client";

import { useEffect, useRef } from "react";

type RefreshHandler = () => void | Promise<void>;

/**
 * Keep live workspace data current without refreshing hidden tabs or
 * overlapping requests. Each active screen owns its existing data loader.
 */
export function useSmartRefresh(
  onRefresh: RefreshHandler,
  enabled = true,
  intervalMs = 5_000,
) {
  const handlerRef = useRef(onRefresh);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    handlerRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    const canRefresh = () =>
      active &&
      document.visibilityState === "visible" &&
      (typeof navigator === "undefined" || navigator.onLine);

    const run = () => {
      if (!canRefresh()) return;
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }

      inFlightRef.current = true;
      void Promise.resolve()
        .then(() => handlerRef.current())
        .catch(() => {
          // Individual workspace loaders retain and render their own errors.
        })
        .finally(() => {
          inFlightRef.current = false;
          if (queuedRef.current) {
            queuedRef.current = false;
            if (canRefresh()) run();
          }
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    const handleOnline = () => run();

    const timer = window.setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      window.removeEventListener("online", handleOnline);
      queuedRef.current = false;
    };
  }, [enabled, intervalMs]);
}
