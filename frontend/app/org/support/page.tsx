"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlatformSupportWorkspace from "../../components/communications/PlatformSupportWorkspace";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
} from "../../components/org-admin/OrganizationAdminChrome";

type OrgAdminUser = {
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

export default function OrganizationSupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function verifySession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", { credentials: "same-origin", cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.authenticated !== true || data?.user?.role !== "ORGANIZATION_ADMIN" || !data?.user?.organizationId) {
          router.replace("/");
          return;
        }
        if (active) setUser(data.user as OrgAdminUser);
      } catch {
        if (active) setError("Unable to verify your Organization Admin session.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void verifySession();
    return () => { active = false; };
  }, [router]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to log out.");
      }
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to log out.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-sm text-slate-300">Loading platform support…</main>;
  if (!user) return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-5 text-slate-200"><section className="max-w-md rounded-2xl border border-slate-800 bg-[#131a24] p-6"><h1 className="text-lg font-semibold">Platform support unavailable</h1><p className="mt-2 text-sm text-slate-400">{error || "Your session could not be verified."}</p><button type="button" onClick={() => router.replace("/")} className="mt-4 rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950">Return to sign in</button></section></main>;

  return (
    <div className="org-admin-workspace org-admin-support relative min-h-screen bg-[#0b0f17] font-sans text-[#f8fafc] scheme-dark">
      <OrganizationAdminSidebar activePage="support" />
      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader activePage="support" organizationName={user.organizationName} loggingOut={loggingOut} onLogout={() => void handleLogout()} commandPaletteOpen={commandPaletteOpen} onCommandPaletteOpenChange={setCommandPaletteOpen} onNavigateRequest={() => true} />
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          <PlatformSupportWorkspace role="ORGANIZATION_ADMIN" />
        </div>
      </main>
    </div>
  );
}
