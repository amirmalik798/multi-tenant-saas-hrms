
"use client";

import { HRManagerDrawerTheme } from "./HRManagerDrawerTheme";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileBarChart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Network,
  RefreshCw,
  ShieldCheck,
  Sun,
  Moon,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HRManagerCommandPalette } from "./HRManagerCommandPalette";
import WorkspaceClock from "../WorkspaceClock";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import OrganizationLogo from "../OrganizationLogo";

export type HRManagerUser = {
  id: string;
  email: string;
  role: "HR_MANAGER" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
  organizationId: string;
  organizationName: string;
  employeeId: string;
  permissions: string[];
};

type SessionResponse = {
  authenticated?: boolean;
  message?: string;
  user?: HRManagerUser;
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export type HRActivePage =
  | "dashboard"
  | "profile"
  | "employees"
  | "departments"
  | "invitations"
  | "organization-chart"
  | "work-queue"
  | "reports"
  | "communications"
  | "modules";

const navGroups: NavGroup[] = [
  {
    label: "People",
    icon: Users,
    items: [
      { label: "Employees", href: "/hr/employees", icon: Users },
      { label: "Departments", href: "/hr/departments", icon: Building2 },
      { label: "Organization chart", href: "/hr/organization-chart", icon: Network },
      { label: "Invitations", href: "/hr/invitations", icon: Mail },
    ],
  },
  {
    label: "Time, leave & holidays",
    icon: CalendarClock,
    items: [
      { label: "Team schedule calendar", href: "/hr/modules/attendance?section=calendar", icon: CalendarDays },
      { label: "Schedules", href: "/hr/modules/time-schedules", icon: CalendarClock },
      { label: "Leave & public holidays", href: "/hr/modules/leave", icon: CalendarDays },
    ],
  },
  {
    label: "Pay & reporting",
    icon: BadgeDollarSign,
    items: [
      { label: "Salary payments", href: "/hr/modules/payroll", icon: BadgeDollarSign },
      { label: "Employee pay rates", href: "/hr/modules/pay-rates", icon: BadgeDollarSign },
      { label: "Daily attendance report", href: "/hr/reports", icon: FileBarChart },
    ],
  },
  {
    label: "Communication",
    icon: Mail,
    items: [
      { label: "Messages", href: "/hr/communications", icon: Mail },
    ],
  },
];

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export function useHRManagerSession() {
  const router = useRouter();
  const [user, setUser] = useState<HRManagerUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const reload = useCallback(async () => {
    setChecking(true);
    setError("");

    let redirecting = false;

    try {
      const response = await fetch("/api/backend/employee-auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const data = await readJson<SessionResponse>(response);
      const sessionUser = data?.user;

      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403 ||
          data?.authenticated === false
        ) {
          redirecting = true;
          router.replace("/");
          return;
        }

        throw new Error(
          data?.message || "We could not verify your session. Please try again.",
        );
      }

      if (
        data?.authenticated !== true ||
        !sessionUser ||
        typeof sessionUser.id !== "string" ||
        typeof sessionUser.email !== "string" ||
        typeof sessionUser.organizationId !== "string" ||
        typeof sessionUser.organizationName !== "string" ||
        !Array.isArray(sessionUser.permissions)
      ) {
        redirecting = true;
        router.replace("/");
        return;
      }

      if (sessionUser.role !== "HR_MANAGER") {
        redirecting = true;
        router.replace(
          sessionUser.role === "DEPARTMENT_MANAGER"
            ? "/dm/dashboard"
            : "/employee/welcome",
        );
        return;
      }

      setUser(sessionUser);
    } catch {
      setError("We could not verify your session. Please try again.");
    } finally {
      if (!redirecting) {
        setChecking(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const logout = useCallback(async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setError("");

    try {
      const response = await fetch("/api/backend/employee-auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      const data = await readJson<{ message?: string }>(response);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to sign out.");
      }

      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  return {
    user,
    checking,
    error,
    loggingOut,
    reload,
    logout,
  };
}

/**
 * Intelligent HR Manager workspace refresh.
 *
 * Matches the Organization Admin refresh pattern:
 * - Checks for stale data every 10 seconds.
 * - Refreshes after the configured stale interval.
 * - Runs only while the browser tab is visible.
 * - Prevents overlapping refresh operations.
 * - Supports page-specific guards to protect active work.
 *
 * Existing page loaders remain responsible for fetching data
 * and handling errors.
 */
export function useHRManagerAutoRefresh(
  refresh: () => void | Promise<void>,
  options: {
    enabled?: boolean;
    intervalMs?: number;
    shouldRefresh?: () => boolean;
  } = {},
) {
  const refreshRef = useRef(refresh);
  const shouldRefreshRef = useRef(options.shouldRefresh);

  // Keep the latest callbacks without restarting the polling lifecycle.
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
      ) {
        return;
      }

      lastRefreshAt = Date.now();
      running = true;

      Promise.resolve()
        .then(() => refreshRef.current())
        .catch((error) => {
          // The page's existing loader owns user-facing error state.
          console.warn("HR Manager background refresh failed:", error);
        })
        .finally(() => {
          running = false;
        });
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

export function HRManagerLoading({
  message = "Verifying your HR Manager session…",
}: {
  message?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111827] px-5 text-[#F8FAFC] font-sans">
      <div className="flex items-center gap-3.5 rounded-2xl border border-[#344357] bg-[#0B0F17] px-6 py-5 text-sm font-semibold shadow-2xl">
        <RefreshCw className="animate-spin text-blue-400" size={20} />
        {message}
      </div>
    </main>
  );
}

export function HRManagerUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111827] px-5 py-10 font-sans">
      <section className="w-full max-w-md rounded-3xl border border-[#344357] bg-[#0B0F17] p-8 shadow-2xl">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
          <ShieldCheck size={28} />
        </div>

        <h1 className="mt-6 text-xl font-bold tracking-tight text-white">
          HR workspace unavailable
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-[#C5D0DE]">
          {message}
        </p>

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-xl bg-blue-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98]"
          >
            Try again
          </button>

          <Link
            href="/"
            className="flex-1 rounded-xl border border-[#3A4A60] bg-[#111827] px-4 py-3 text-center text-sm font-semibold text-[#F8FAFC] transition-all hover:bg-[#202D40] active:scale-[0.98]"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

export function HRManagerShell({
  user,
  activePage,
  title,
  description,
  actions,
  onLogout,
  loggingOut,
  logoutError,
  children,
}: {
  user: HRManagerUser;
  activePage: HRActivePage;
  title: string;
  description?: string | null;
  actions?: ReactNode;
  onLogout: () => void;
  loggingOut: boolean;
  logoutError?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [profilePhotoVersion, setProfilePhotoVersion] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("hrms-hr-manager-theme");

      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }
    } catch {
      // Theme preference is optional; the workspace safely defaults to dark.
    }
  }, []);

  useEffect(() => {
    // Also expose the active theme on <html> so dialogs rendered through
    // React portals receive the same theme as the HR Manager workspace.
    document.documentElement.dataset.hrManagerTheme = theme;

    return () => {
      if (document.documentElement.dataset.hrManagerTheme === theme) {
        delete document.documentElement.dataset.hrManagerTheme;
      }
    };
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);

    try {
      window.localStorage.setItem("hrms-hr-manager-theme", nextTheme);
    } catch {
      // The current session still uses the selected theme if storage is unavailable.
    }
  }

  useEffect(() => {
    const refreshProfilePhoto = () =>
      setProfilePhotoVersion((current) => current + 1);

    window.addEventListener(
      "hrms:profile-photo-updated",
      refreshProfilePhoto,
    );

    return () => {
      window.removeEventListener(
        "hrms:profile-photo-updated",
        refreshProfilePhoto,
      );
    };
  }, []);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    People: true,
  });

  useEffect(() => {
    const activeGroup = navGroups.find((group) =>
      group.items.some(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      ),
    );

    if (activeGroup) {
      setExpandedGroups((current) => ({
        ...current,
        [activeGroup.label]: true,
      }));
    }
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  function isLinkActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div
      data-hr-manager-theme={theme}
      className="hr-manager-theme-root min-h-screen bg-[#0B0F17] text-[#F8FAFC] font-sans antialiased selection:bg-blue-500/30 selection:text-blue-100"
      style={
        theme === "dark"
          ? {
              backgroundImage:
                "radial-gradient(ellipse at 8% 0%, rgba(59,130,246,0.16), transparent 34%), radial-gradient(ellipse at 92% 12%, rgba(34,211,238,0.08), transparent 30%), linear-gradient(145deg, #0B0F17 0%, #111827 55%, #0B0F17 100%)",
            }
          : undefined
      }
    >
      <HRManagerDrawerTheme />

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[#344357]/80 bg-[#192333] transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] shrink-0 items-center gap-3.5 border-b border-[#344357]/80 bg-[#24354A]/70 px-4 pl-6">
          <Link
            href="/hr/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex min-w-0 flex-1 items-center gap-3.5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-md shadow-blue-500/20">
              <ShieldCheck size={24} />
            </span>

            <span className="min-w-0">
              <span className="block text-base font-extrabold tracking-tight text-white">
                HRMS Core
              </span>
              <span className="block text-xs font-medium text-[#C5D0DE]">
                People operations
              </span>
            </span>
          </Link>

          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-xl p-2 text-[#C5D0DE] transition hover:bg-[#202D40] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="shrink-0 border-b border-[#344357]/80 bg-[#151C28] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <OrganizationLogo className="size-11 rounded-xl" />

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C5D0DE]">
                Organization
              </p>

              <p className="mt-1 truncate text-sm font-bold text-[#F8FAFC]">
                {user.organizationName}
              </p>

              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400 ring-1 ring-blue-500/20">
                <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
                HR Manager Portal
              </div>
            </div>
          </div>
        </div>

        <nav
          aria-label="HR Manager navigation"
          className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4 scrollbar-thin scrollbar-thumb-slate-800"
        >
          <Link
            href="/hr/dashboard"
            onClick={() => setMobileOpen(false)}
            aria-current={activePage === "dashboard" ? "page" : undefined}
            className={`flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-sm font-medium transition-all ${
              activePage === "dashboard"
                ? "bg-blue-500/15 font-semibold text-blue-400 shadow-xs ring-1 ring-blue-500/30"
                : "text-[#C5D0DE] hover:bg-[#202D40]/50 hover:text-[#F8FAFC]"
            }`}
          >
            <LayoutDashboard
              size={18}
              className={
                activePage === "dashboard"
                  ? "text-blue-400"
                  : "text-[#9AA8BA]"
              }
            />

            <span className="flex-1">HR overview</span>

            {activePage === "dashboard" && (
              <ChevronRight size={15} className="text-blue-400" />
            )}
          </Link>

          <Link
            href="/hr/work-queue"
            onClick={() => setMobileOpen(false)}
            aria-current={activePage === "work-queue" ? "page" : undefined}
            className={`mb-3 flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-sm font-medium transition-all ${
              activePage === "work-queue"
                ? "bg-blue-500/15 font-semibold text-blue-400 shadow-xs ring-1 ring-blue-500/30"
                : "text-[#C5D0DE] hover:bg-[#202D40]/50 hover:text-[#F8FAFC]"
            }`}
          >
            <ClipboardList
              size={18}
              className={
                activePage === "work-queue"
                  ? "text-blue-400"
                  : "text-[#9AA8BA]"
              }
            />

            <span className="flex-1">Work queue</span>

            {activePage === "work-queue" && (
              <ChevronRight size={15} className="text-blue-400" />
            )}
          </Link>

          <Link
            href="/hr/profile"
            onClick={() => setMobileOpen(false)}
            aria-current={activePage === "profile" ? "page" : undefined}
            className={`mb-3 flex h-11 items-center gap-3.5 rounded-xl px-3.5 text-sm font-medium transition-all ${
              activePage === "profile"
                ? "bg-blue-500/15 font-semibold text-blue-400 shadow-xs ring-1 ring-blue-500/30"
                : "text-[#C5D0DE] hover:bg-[#202D40]/50 hover:text-[#F8FAFC]"
            }`}
          >
            <UserRound
              size={18}
              className={
                activePage === "profile"
                  ? "text-blue-400"
                  : "text-[#9AA8BA]"
              }
            />

            <span className="flex-1">My Profile</span>

            {activePage === "profile" && (
              <ChevronRight size={15} className="text-blue-400" />
            )}
          </Link>

          {navGroups.map((group) => {
            const GroupIcon = group.icon;
            const expanded = Boolean(expandedGroups[group.label]);

            return (
              <section
                key={group.label}
                className="overflow-hidden rounded-2xl border border-[#344357]/60 bg-[#151C28]/40 transition-colors hover:border-[#3A4A60]/80"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [group.label]: !expanded,
                    }))
                  }
                  className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left text-[#E8EEF5] transition hover:bg-[#202D40]/40"
                >
                  <GroupIcon
                    size={17}
                    className="shrink-0 text-[#C5D0DE]"
                  />

                  <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#E8EEF5]">
                    {group.label}
                  </span>

                  {expanded ? (
                    <ChevronDown size={14} className="text-[#9AA8BA]" />
                  ) : (
                    <ChevronRight size={14} className="text-[#9AA8BA]" />
                  )}
                </button>

                {expanded && (
                  <div className="space-y-1 border-t border-[#344357]/60 bg-[#192333] px-2 py-2">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isLinkActive(item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                            active
                              ? "bg-blue-500/15 font-semibold text-blue-400 ring-1 ring-blue-500/20"
                              : "text-[#C5D0DE] hover:bg-[#202D40]/50 hover:text-[#F8FAFC]"
                          }`}
                        >
                          <ItemIcon
                            size={15}
                            className={`shrink-0 ${
                              active ? "text-blue-400" : "text-[#9AA8BA]"
                            }`}
                          />

                          <span className="min-w-0 flex-1">
                            {item.label}
                          </span>

                          {active && (
                            <span className="size-1.5 rounded-full bg-blue-400" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
      </aside>

      <div className="min-h-screen lg:ml-[280px]">
        <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-[#344357]/80 bg-[#192333]/90 px-4 backdrop-blur-md sm:px-8 lg:px-10 shadow-lg">
          <div className="flex min-w-0 items-center gap-4 flex-1">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-[#344357] bg-[#151C28] p-2.5 text-[#E8EEF5] transition hover:bg-[#202D40] lg:hidden shadow-xs"
            >
              <Menu size={20} />
            </button>

            <div className="relative min-w-0 w-full max-w-md flex-1">
              <HRManagerCommandPalette
                context={activePage}
                open={commandPaletteOpen}
                onOpenChange={setCommandPaletteOpen}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {actions}

            <WorkspaceClock requireOrganizationTimeZone />

            <button
              type="button"
              onClick={toggleTheme}
              className="hr-manager-theme-toggle inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#344357] bg-[#151C28] text-[#C5D0DE] transition hover:border-[#3A4A60] hover:bg-[#202D40] hover:text-white"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-pressed={theme === "light"}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="hidden md:flex items-center gap-2.5 rounded-2xl border border-[#344357] bg-[#151C28] p-1.5 pl-3 shadow-xs">
              <EmployeeProfilePhoto
                employeeId={user.employeeId}
                name={user.email}
                refreshKey={profilePhotoVersion}
                className="size-8 rounded-xl border border-blue-500/30 bg-blue-500/20"
                textClassName="text-xs font-extrabold text-blue-400"
              />

              <div className="min-w-0 text-left pr-1">
                <p className="truncate text-xs font-bold text-[#F8FAFC]">
                  HR Manager
                </p>

                <p className="truncate text-[11px] text-[#C5D0DE] max-w-[150px]">
                  {user.email}
                </p>
              </div>
            </div>

            <Link
              href="/account/change-password"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 text-xs font-semibold text-[#E8EEF5] shadow-xs transition-all hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-white active:scale-[0.98]"
              title="Change password"
            >
              <KeyRound size={15} className="text-[#C5D0DE]" />
              <span className="hidden lg:inline">Change password</span>
            </Link>

            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 text-xs font-semibold text-rose-300 shadow-xs transition-all hover:bg-rose-500/20 hover:border-rose-500/50 active:scale-[0.98] disabled:opacity-50"
              title="Sign out"
            >
              <LogOut size={15} className="text-rose-400" />

              <span className="hidden lg:inline">
                {loggingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-10">
          {logoutError && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-300" />
              <span>{logoutError}</span>
            </div>
          )}

          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="mt-2.5 text-2xl font-black tracking-tight text-white sm:text-3xl">
                {title}
              </h1>

              {typeof description === "string" && description.trim() ? (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#C5D0DE]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {children}

          <footer className="mt-12 flex flex-col justify-between gap-4 border-t border-[#344357]/80 pt-6 text-xs font-medium text-[#9AA8BA] sm:flex-row">
            <span>HRMS Enterprise · HR Manager workspace</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
