"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Building2, CreditCard, LayoutDashboard, LogOut, Mail, MessageSquare, ShieldCheck, Users, Search } from "lucide-react";
import { CommandPalette, CommandPaletteTrigger, buildSuperAdminCommandItems, type CommandPaletteItem, type CommandPaletteOrganization } from "../../components/super-admin/CommandPalette";
import PlatformSupportWorkspace from "../../components/communications/PlatformSupportWorkspace";

import SuperAdminThemeToggle from "../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../components/WorkspaceClock";
type AdminUser = { email: string; role: string };
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
  { label: "Organization Admins", href: "/dashboard/organization-admins", icon: Users },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { label: "Invitations", href: "/dashboard/invitations", icon: Mail },
  { label: "Platform Support", href: "/dashboard/support", icon: MessageSquare },
  { label: "System Health", href: "/dashboard/system-health", icon: Activity },
  { label: "Audit Logs", href: "/dashboard/audit-logs", icon: ShieldCheck },
];
const shellBackground = {
  backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)",
  backgroundSize: "auto, 42px 42px, 42px 42px",
};

export default function PlatformSupportInboxPage() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOrganizations, setPaletteOrganizations] = useState<CommandPaletteOrganization[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let active = true;
    async function verifySession() {
      try {
        const response = await fetch("/api/backend/auth/me", { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.authenticated !== true || payload?.user?.role !== "SUPER_ADMIN") {
          router.replace("/");
          return;
        }
        if (active) setUser(payload.user as AdminUser);
      } catch {
        if (active) setError("Unable to verify your Super Admin session.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void verifySession();
    return () => { active = false; };
  }, [router]);


  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadPaletteOrganizations() {
      try {
        const response = await fetch("/api/backend/organizations", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const candidates = Array.isArray(payload) ? payload : payload?.organizations;
        if (!Array.isArray(candidates)) return;
        const valid = candidates.filter((item: unknown): item is CommandPaletteOrganization =>
          typeof item === "object" && item !== null &&
          typeof (item as CommandPaletteOrganization).id === "string" &&
          typeof (item as CommandPaletteOrganization).name === "string" &&
          typeof (item as CommandPaletteOrganization).slug === "string" &&
          typeof (item as CommandPaletteOrganization).status === "string"
        );
        if (active) setPaletteOrganizations(valid);
      } catch {
        // Organization suggestions are optional; static commands remain available.
      }
    }
    void loadPaletteOrganizations();
    return () => { active = false; };
  }, [user]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/auth/logout", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setLogoutError(caught instanceof Error ? caught.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-sm text-slate-300">Loading Platform Support Inbox…</main>;
  if (!user) return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-5 text-slate-200"><section className="max-w-md rounded-2xl border border-slate-800 bg-[#131a24] p-6"><h1 className="text-lg font-semibold">Platform Support unavailable</h1><p className="mt-2 text-sm text-slate-400">{error || "Your session could not be verified."}</p><button type="button" onClick={() => router.replace("/")} className="mt-4 rounded-xl bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950">Return to sign in</button></section></main>;

  return (
    <div className="min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark" style={shellBackground}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#29384b] bg-[#0f1724] text-white lg:flex">
        <Link href="/dashboard" className="flex h-[86px] items-center gap-3 border-b border-[#29384b] px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-[#d8efff]"><ShieldCheck size={23} /></span>
          <span><span className="block text-lg font-bold tracking-tight">HRMS Platform</span><span className="mt-0.5 block text-sm text-slate-300">Super Admin</span></span>
        </Link>
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4" aria-label="Super Admin navigation">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = href === "/dashboard/support";
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex h-[49px] items-center gap-3 rounded-lg px-3.5 text-[15px] transition ${active ? "border border-blue-300/10 border-l-2 border-l-[#75c7ff] bg-[#14283e] pl-[calc(0.875rem-2px)] font-semibold text-[#e3f2ff]" : "border border-transparent font-medium text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-white"}`}><Icon size={21} /><span>{label}</span></Link>;
          })}
        </nav>
        
      </aside>
      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-20 border-b border-[#29384b] bg-[#0f1724]/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-h-[43px] items-center justify-between gap-4">
            <div className="relative hidden h-[43px] w-full max-w-[482px] sm:block">
              <button type="button" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" className="absolute inset-0 flex h-[43px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-12 pr-[6.5rem] text-left text-sm text-slate-300 outline-none transition hover:border-[#75c7ff]/35 hover:bg-[#182232] focus-visible:border-[#75c7ff] focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20"><span className="truncate">Search commands or organizations...</span></button>
              <span className="pointer-events-none absolute left-4 top-[11px] text-slate-300"><Search size={20} /></span><CommandPaletteTrigger onClick={() => setCommandPaletteOpen(true)} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4"><div className="hidden h-9 w-px bg-slate-700/70 sm:block" /><WorkspaceClock />
              <SuperAdminThemeToggle />
              <div className="flex items-center gap-3" aria-label="Signed in as Super Admin"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-sm font-bold text-[#d8efff]">SA</div><div className="hidden min-w-0 sm:block"><p className="text-sm font-semibold leading-5">Super Admin</p><p className="max-w-[190px] truncate text-xs leading-5 text-slate-400">{user.email || "Platform Administrator"}</p></div></div><button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#182232]/90 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05] disabled:opacity-60 sm:text-sm"><LogOut size={14} />{loggingOut ? "Logging out…" : "Logout"}</button></div>
          </div>
          <div className="relative mt-3 sm:hidden"><button type="button" onClick={() => setCommandPaletteOpen(true)} aria-label="Search commands and organizations" aria-keyshortcuts="Control+K Meta+K" className="flex h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-[#111a28] px-3.5 text-left text-sm text-slate-300 transition hover:border-[#75c7ff]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"><Search size={18} /><span className="min-w-0 flex-1 truncate">Search commands or organizations...</span></button></div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Super Admin mobile navigation">{navItems.map(({ label, href, icon: Icon }) => <Link key={href} href={href} aria-current={href === "/dashboard/support" ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${href === "/dashboard/support" ? "border-[#75c7ff]/25 bg-[#18314a] font-semibold text-[#e3f2ff]" : "border-white/10 bg-[#182232]/90 text-slate-200 hover:border-white/20 hover:bg-white/[0.05]"}`}><Icon size={16} /><span>{label}</span></Link>)}</nav>
        </header>
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200"><p>{logoutError}</p><button type="button" onClick={() => setLogoutError("")} className="shrink-0 font-semibold underline underline-offset-2">Dismiss</button></div>}
          <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">Platform Support Inbox</h1></div><div className="inline-flex min-h-[44px] items-center gap-3 self-start rounded-lg border border-[#2a3b50] bg-[#111a28]/85 px-3.5 text-xs font-medium text-[#c0ccdb] sm:self-auto"><span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#293c52] bg-[#18283b] text-[#8bcaff]"><MessageSquare size={16} /></span><span>Platform Operations</span><span className="rounded-full border border-[#273b51] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#91a9c2]">Private</span></div></section>
          <PlatformSupportWorkspace role="SUPER_ADMIN" />
        </div>
      </main>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} items={buildSuperAdminCommandItems(paletteOrganizations)} onSelect={(item: CommandPaletteItem) => { if (item.href) router.push(item.href); }} />
    </div>
  );
}
