"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
} from "./OrganizationAdminChrome";

type Page =
  | "attendance"
  | "schedules"
  | "leave"
  | "pay-rates"
  | "payroll"
  | "reports";

type OrganizationAdminUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type SessionPayload = {
  authenticated?: boolean;
  message?: string;
  user?: Partial<OrganizationAdminUser>;
};

type Props = {
  activePage: Page;
  title: string;
  description: string;
  children: ReactNode;
};

export default function OrganizationAdminHRModuleShell({
  activePage,
  title,
  description,
  children,
}: Props) {
  const router = useRouter();
  const [user, setUser] = useState<OrganizationAdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const verifySession = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/backend/org/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as SessionPayload | null;
      const candidate = payload?.user;
      if (
        !response.ok ||
        payload?.authenticated !== true ||
        !candidate ||
        typeof candidate.id !== "string" ||
        typeof candidate.email !== "string" ||
        candidate.role !== "ORGANIZATION_ADMIN" ||
        typeof candidate.organizationId !== "string" ||
        typeof candidate.organizationName !== "string"
      ) {
        router.replace("/");
        return;
      }
      setUser(candidate as OrganizationAdminUser);
    } catch {
      setError("We could not verify your Organization Admin session. Please try again.");
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    void verifySession();
  }, [verifySession]);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "Unable to sign out.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1220] px-5 text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-[#111a28] px-5 py-4 text-sm text-slate-300">
          Verifying Organization Admin session…
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1220] px-5 text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-[#111a28] p-5 text-sm text-slate-300">
          <p>{error || "Your Organization Admin session is unavailable."}</p>
          <button type="button" onClick={() => void verifySession()} className="mt-3 rounded-lg bg-sky-500 px-3 py-2 font-semibold text-white">
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="org-admin-workspace organization-admin-workspace min-h-screen bg-[#0b1220] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(35,91,130,0.07),transparent_42%)]" />
      <OrganizationAdminSidebar activePage={activePage} />
      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage={activePage}
          organizationName={user.organizationName}
          loggingOut={loggingOut}
          onLogout={() => void logout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
        />
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {error && (
            <div role="alert" aria-live="assertive" className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3.5 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0">{error}</p>
              {!user && (
                <button
                  type="button"
                  onClick={() => void verifySession()}
                  disabled={checking}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-rose-300/25 bg-rose-300/10 px-3.5 text-xs font-bold text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {checking ? "Checking…" : "Try again"}
                </button>
              )}
            </div>
          )}
          <section aria-labelledby="org-module-page-title" className="mb-6">
            <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Workspace</span>
              <span aria-hidden="true" className="text-slate-600">/</span>
              <span aria-current="page" className="text-slate-300">{title}</span>
            </nav>
            <div className="flex flex-col gap-2 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 id="org-module-page-title" className="text-2xl font-bold tracking-tight text-white sm:text-[28px]">{title}</h1>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-3 py-1.5 text-[11px] font-semibold text-sky-200">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-300" />
                Organization workspace
              </span>
            </div>
          </section>
          {children}
        </div>
      </main>
    </div>
  );
}
