"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

type GateState = "checking" | "allowed" | "blocked" | "error";

export default function OrganizationSetupGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");
  const requestSequence = useRef(0);

  // Licensing must remain reachable before setup is complete. An organization
  // with an inactive or expired license still needs a route to submit payment
  // proof, while the licensing API independently enforces Organization Admin
  // authentication and tenant ownership.
  const isSetupAccessiblePage =
    pathname === "/org/settings" ||
    pathname.startsWith("/org/settings/") ||
    pathname === "/org/support" ||
    pathname.startsWith("/org/support/") ||
    pathname === "/org/license" ||
    pathname.startsWith("/org/license/");

  const checkSetup = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (isSetupAccessiblePage) {
      setState("allowed");
      return;
    }

    setState("checking");
    try {
      const response = await fetch("/api/backend/org/settings", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      // A route change or manual retry may have started a newer check. Ignore
      // stale responses so they cannot overwrite current state or redirect.
      if (requestId !== requestSequence.current) return;

      // Let existing page-level authentication handling deal with signed-out
      // sessions. Protected backend endpoints still enforce the setup lock.
      if (response.status === 401) {
        setState("allowed");
        return;
      }

      if (!response.ok) {
        setState("error");
        return;
      }

      const payload = await response.json() as {
        settings?: { setupCompletedAt?: string | null };
      };
      if (requestId !== requestSequence.current) return;

      if (!payload.settings?.setupCompletedAt) {
        setState("blocked");
        router.replace("/org/settings?setupRequired=1");
        return;
      }

      setState("allowed");
    } catch {
      if (requestId === requestSequence.current) setState("error");
    }
  }, [isSetupAccessiblePage, router]);

  useEffect(() => {
    void checkSetup();
  }, [checkSetup]);

  if (isSetupAccessiblePage || state === "allowed") return <>{children}</>;

  if (state === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-6 text-slate-100">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Organization setup</p>
          <h1 className="mt-3 text-2xl font-semibold">We couldn’t verify your setup status</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">For your organization’s security, other workspace pages remain locked until setup status can be verified. Retry the check or open Organization Profile &amp; Settings.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => void checkSetup()} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950">Retry check</button>
            <button type="button" onClick={() => router.replace("/org/settings")} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-100">Open settings</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-6 text-slate-100">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />
        <p className="mt-4 text-sm text-slate-400">Verifying organization setup…</p>
      </div>
    </main>
  );
}
