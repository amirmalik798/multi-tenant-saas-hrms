"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ChevronRight,
  ChevronDown,
  FileBarChart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Search,
  Sun,
  Moon,
  ShieldCheck,
  Target,
  Users,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import WorkspaceClock from "../WorkspaceClock";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import OrganizationLogo from "../OrganizationLogo";

export type DepartmentManagerUser = {
  id: string;
  email: string;
  role: "DEPARTMENT_MANAGER";
  organizationId: string;
  organizationName: string;
  employeeId: string;
  permissions: string[];
};

type WorkforceRole =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

type SessionResponse = {
  authenticated?: boolean;
  message?: string;
  user?: {
    id?: string;
    email?: string;
    role?: WorkforceRole;
    organizationId?: string;
    organizationName?: string;
    employeeId?: string;
    permissions?: string[];
  };
};

type CommandItem = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  href?: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

const commandItems: CommandItem[] = [
  {
    id: "overview",
    label: "Team overview",
    description: "Return to your Department Manager dashboard",
    keywords: "home dashboard overview",
    href: "/dm/dashboard",
    icon: LayoutDashboard,
  },
  {
  id: "team",
  label: "My team",
  description: "Search, filter, and review employees in your assigned departments",
  keywords: "employees team staff people directory assigned department search",
  href: "/dm/team",
  icon: Users,
},
  {
    id: "profile",
    label: "My Profile",
    description: "View your Department Manager profile and update your photo",
    keywords: "profile personal details photo account",
    href: "/dm/profile",
    icon: UserRound,
  },
  {
    id: "departments",
    label: "Assigned departments",
    description: "Review your assigned departments",
    keywords: "departments teams operations groups",
    href: "/dm/dashboard#assigned-departments",
    icon: ShieldCheck,
  },
  {
    id: "schedule",
    label: "Team schedule",
    description: "Review assigned shifts alongside recorded attendance for your departments",
    keywords: "schedule calendar week shifts assignments agenda coverage",
    href: "/dm/schedule",
    icon: CalendarRange,
  },
  {
    id: "reviews",
    label: "Review queue",
    description: "Resolve pending attendance corrections and overtime requests",
    keywords: "review approvals queue corrections overtime pending",
    href: "/dm/reviews",
    icon: ClipboardCheck,
  },
  {
    id: "attendance",
    label: "Attendance & time",
    description: "Inspect team attendance, recorded events, and hours",
    keywords: "attendance clock time records punches corrections overtime",
    href: "/dm/attendance",
    icon: CalendarClock,
  },
  {
    id: "leave",
    label: "Leave, holidays & absence",
    description: "Review team leave requests and check public holidays",
    keywords: "leave holiday absence vacation time off annual sick approve review",
    href: "/dm/leave",
    icon: CalendarDays,
  },
  {
    id: "my-earnings",
    label: "My Earnings",
    description: "Review your own estimated earnings and personal salary payment history",
    keywords: "my earnings personal pay income my salary payment history",
    href: "/dm/earnings",
    icon: Wallet,
  },
  {
    id: "payroll",
    label: "Team salary payments",
    description: "View recorded monthly salary payments for managed departments",
    keywords: "payroll salary payment compensation monthly earnings",
    href: "/dm/payroll",
    icon: BadgeDollarSign,
  },
  {
    id: "communications",
    label: "Messages",
    description: "Message your HR Manager and reply to employee conversations",
    keywords: "messages communication inbox chat HR manager",
    href: "/dm/communications",
    icon: MessageSquare,
  },
  {
    id: "performance",
    label: "Performance, objectives, skills & discipline",
    description: "Performance and development workflows are not enabled yet",
    keywords: "performance objectives goals skills development discipline",
    icon: Target,
    comingSoon: true,
  },

  {
    id: "reports",
    label: "Reporting, audit, imports & data governance",
    description: "Department-scoped reporting tools are not enabled yet",
    keywords: "reports audit imports data governance analytics",
    icon: FileBarChart,
    comingSoon: true,
  },
  {
    id: "account",
    label: "Change password",
    description: "Open your account password settings",
    keywords: "account security password credentials",
    href: "/account/change-password",
    icon: KeyRound,
  },
];

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function isWorkforceRole(
  value: unknown,
): value is WorkforceRole {
  return (
    value === "HR_MANAGER" ||
    value === "DEPARTMENT_MANAGER" ||
    value === "EMPLOYEE"
  );
}

export function useDepartmentManagerSession() {
  const router = useRouter();

  const [user, setUser] =
    useState<DepartmentManagerUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const reload = useCallback(async () => {
    setChecking(true);
    setError("");

    let redirecting = false;

    try {
      const response = await fetch(
        "/api/backend/employee-auth/me",
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data = await readJson<SessionResponse>(response);
      const person = data?.user;

      if (
        !response.ok ||
        data?.authenticated !== true ||
        !person ||
        !isWorkforceRole(person.role) ||
        typeof person.id !== "string" ||
        typeof person.email !== "string" ||
        typeof person.organizationId !== "string" ||
        typeof person.organizationName !== "string" ||
        typeof person.employeeId !== "string" ||
        !Array.isArray(person.permissions)
      ) {
        setUser(null);
        redirecting = true;
        router.replace("/");
        return;
      }

      if (person.role !== "DEPARTMENT_MANAGER") {
        setUser(null);
        redirecting = true;

        router.replace(
          person.role === "HR_MANAGER"
            ? "/hr/dashboard"
            : "/employee/welcome",
        );

        return;
      }

      setUser({
        id: person.id,
        email: person.email,
        role: "DEPARTMENT_MANAGER",
        organizationId: person.organizationId,
        organizationName: person.organizationName,
        employeeId: person.employeeId,
        permissions: person.permissions,
      });
    } catch {
      setUser(null);
      setError(
        "We could not verify your session. Check that the backend is running and try again.",
      );
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
      const response = await fetch(
        "/api/backend/employee-auth/logout",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

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

export function DepartmentManagerLoading({
  message = "Verifying your Department Manager session…",
}: {
  message?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1117] px-5 text-slate-100">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-[#161b22] px-6 py-5 text-sm font-medium shadow-2xl">
        <RefreshCw
          size={18}
          className="animate-spin text-sky-400"
        />
        {message}
      </div>
    </main>
  );
}

export function DepartmentManagerUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1117] px-5 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#161b22] p-8 shadow-2xl">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/20">
          <ShieldCheck size={27} />
        </div>

        <h1 className="mt-6 text-xl font-bold tracking-tight text-white">
          Department Manager workspace unavailable
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          {message}
        </p>

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            Try again
          </button>

          <Link
            href="/"
            className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

type ShellProps = {
  user: DepartmentManagerUser;
  title: string;
  description: string;
  actions?: ReactNode;
  onLogout: () => void;
  loggingOut: boolean;
  children: ReactNode;
};

export function DepartmentManagerShell({
  user,
  title,
  description,
  actions,
  onLogout,
  loggingOut,
  children,
}: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("hrms-department-manager-theme");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      // Theme preference is optional; the workspace safely defaults to dark.
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("hrms-department-manager-theme", nextTheme);
    } catch {
      // The current session still uses the selected theme if storage is unavailable.
    }
  }

  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();

    return text
      ? commandItems.filter((item) =>
          `${item.label} ${item.description} ${item.keywords}`
            .toLowerCase()
            .includes(text),
        )
      : commandItems;
  }, [query]);

  const navigationGroups: { id: string; label: string; itemIds: string[] }[] = [
    { id: "overview", label: "Overview & people", itemIds: ["overview", "team", "profile", "departments"] },
    { id: "time", label: "Time & requests", itemIds: ["schedule", "attendance", "reviews", "leave"] },
    { id: "operations", label: "Pay & communication", itemIds: ["my-earnings", "payroll", "communications"] },
  ];

  const navigationById = new Map(commandItems.map((item) => [item.id, item]));

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setPaletteOpen(true);
        setQuery("");
        setCommandIndex(0);
      } else if (event.key === "Escape") {
        setPaletteOpen(false);
        setQuery("");
      }
    }

    window.addEventListener("keydown", handleKey);

    return () =>
      window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;

    const timer = window.setTimeout(
      () => inputRef.current?.focus(),
      0,
    );

    return () => window.clearTimeout(timer);
  }, [paletteOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function openCommand(item: CommandItem) {
    if (!item.href || item.comingSoon) return;

    setPaletteOpen(false);
    setQuery("");
    router.push(item.href);
  }

  function active(href: string) {
    if (href.includes("#")) return false;

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  }

  const navClass = (isCurrent: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
      isCurrent
        ? "bg-sky-500/15 font-semibold text-sky-300 ring-1 ring-sky-500/25"
        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
    }`;

  return (
    <div data-department-manager-theme={theme} className="department-manager-theme-root min-h-screen bg-[#0d1117] font-sans text-slate-100 antialiased selection:bg-sky-500/30 selection:text-sky-200">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[276px] flex-col border-r border-slate-800/80 bg-[#151b24] transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link
          href="/dm/dashboard"
          className="flex h-[76px] shrink-0 items-center gap-3 border-b border-slate-800/80 px-5"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-900/30">
            <ShieldCheck size={23} />
          </span>

          <span className="min-w-0">
            <span className="block text-base font-extrabold tracking-tight text-white">
              HRMS Core
            </span>
            <span className="block text-xs text-slate-400">
              Team operations
            </span>
          </span>
        </Link>

        <div className="shrink-0 border-b border-slate-800/80 bg-black/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <OrganizationLogo className="size-11 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Organization
              </p>
              <p className="mt-1.5 truncate text-sm font-semibold text-slate-200">
                {user.organizationName}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300 ring-1 ring-sky-500/20">
                <span className="size-1.5 rounded-full bg-sky-400" />
                Department Manager Portal
              </span>
            </div>
          </div>
        </div>

        <nav
          aria-label="Department Manager navigation"
          className="flex-1 space-y-3 overflow-y-auto px-3 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {navigationGroups.map((group) => {
            const expanded = !collapsedNavGroups[group.id];
            const groupItems = group.itemIds
              .map((id) => navigationById.get(id))
              .filter((item): item is CommandItem => Boolean(item));

            return (
              <section key={group.id} className="rounded-2xl border border-slate-800/55 bg-slate-950/20 p-1.5">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setCollapsedNavGroups((current) => ({ ...current, [group.id]: !expanded }))}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <span>{group.label}</span>
                  <ChevronDown size={14} className={`shrink-0 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
                </button>

                {expanded && (
                  <div className="space-y-0.5 pb-1 pt-1">
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      const current = active(item.href ?? "");

                      return (
                        <Link
                          key={item.id}
                          href={item.href ?? "/dm/dashboard"}
                          onClick={() => setMobileOpen(false)}
                          aria-current={current ? "page" : undefined}
                          title={item.description}
                          className={`${navClass(current)} min-h-10 gap-2.5 rounded-lg px-3 py-2 text-[13px]`}
                        >
                          <Icon size={16} className={current ? "shrink-0 text-sky-300" : "shrink-0 text-slate-500"} />
                          <span className="min-w-0 flex-1 leading-5">{item.label}</span>
                          {current && <span className="size-1.5 shrink-0 rounded-full bg-sky-300" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-800/80 p-3">
          <Link
            href="/account/change-password"
            className="flex min-h-10 items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <KeyRound size={16} />
            My account
            <ArrowRight size={14} className="ml-auto" />
          </Link>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-[276px]">
        <header className="sticky top-0 z-20 flex min-h-[74px] items-center justify-between gap-3 border-b border-slate-800/80 bg-[#121821]/90 px-4 shadow-lg shadow-black/10 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-slate-800 bg-[#151b24] p-2.5 text-slate-300 transition hover:bg-white/5 lg:hidden"
            >
              <Menu size={19} />
            </button>

            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCommandIndex(0);
                setPaletteOpen(true);
              }}
              aria-label="Open workspace command palette"
              className="flex min-w-0 w-full max-w-lg items-center gap-3 rounded-xl border border-slate-800 bg-[#0e141c] px-3.5 py-2.5 text-left text-sm text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
            >
              <Search
                size={17}
                className="shrink-0 text-slate-500"
              />

              <span className="min-w-0 flex-1 truncate">
                Search workspace and team shortcuts…
              </span>

            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {actions}
            <WorkspaceClock requireOrganizationTimeZone showAttendanceStatus />

            <button
              type="button"
              onClick={toggleTheme}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-[#151b24] text-slate-300 transition hover:border-slate-700 hover:bg-white/5 hover:text-white"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-pressed={theme === "light"}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <Link
              href="/dm/profile"
              title="Open your profile"
              className="hidden items-center gap-2.5 rounded-xl border border-slate-800 bg-[#151b24] p-1.5 pl-2.5 transition hover:border-sky-500/30 hover:bg-white/[0.035] md:flex"
            >
              <EmployeeProfilePhoto
                name="Department Manager"
                className="size-8 rounded-lg border border-sky-400/20 bg-sky-500/15"
                textClassName="text-[10px] font-extrabold text-sky-300"
              />
              <div className="max-w-[170px] min-w-0 pr-1">
                <p className="truncate text-xs font-semibold text-slate-200">
                  Department Manager
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {user.email}
                </p>
              </div>
            </Link>

            <Link
              href="/account/change-password"
              title="Change password"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-[#151b24] px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-white/5 hover:text-white"
            >
              <KeyRound size={15} />
              <span className="hidden xl:inline">Password</span>
            </Link>

            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              title="Sign out"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">
                {loggingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-6 pb-24 sm:px-7 sm:py-8 sm:pb-24 lg:px-9 lg:py-9">
          {(title || description) && <div className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div className="min-w-0">
              {title && <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>}
              {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}
            </div>
          </div>}

          {children}
        </main>
      </div>

      <nav aria-label="Quick workspace navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-800/90 bg-[#111821]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-2xl shadow-black/30 backdrop-blur-xl lg:hidden">
        {[
          { href: "/dm/dashboard", label: "Home", icon: LayoutDashboard },
          { href: "/dm/team", label: "Team", icon: Users },
          { href: "/dm/schedule", label: "Schedule", icon: CalendarRange },
          { href: "/dm/leave", label: "Leave", icon: CalendarDays },
          { href: "/dm/reviews", label: "Reviews", icon: ClipboardCheck },
          { href: "/dm/communications", label: "Messages", icon: MessageSquare },
        ].map((item) => {
          const Icon = item.icon;
          const current = active(item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold transition ${current ? "text-sky-200" : "text-slate-500 hover:text-slate-200"}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-sm sm:px-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPaletteOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Department Manager command palette"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700/80 bg-[#121a25] shadow-2xl shadow-black/60"
          >
            <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
              <Search size={19} className="shrink-0 text-sky-300" />

              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCommandIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCommandIndex((index) =>
                      Math.min(
                        index + 1,
                        Math.max(filtered.length - 1, 0),
                      ),
                    );
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setCommandIndex((index) =>
                      Math.max(index - 1, 0),
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const item = filtered[commandIndex];
                    if (item) openCommand(item);
                  }
                }}
                placeholder="Search navigation or team workflows…"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                aria-label="Search command palette"
              />

              <span className="hidden rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-500 sm:inline">
                ESC
              </span>

              <button
                type="button"
                aria-label="Close command palette"
                onClick={() => setPaletteOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[min(65vh,560px)] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-semibold text-slate-200">
                    No matching workspace actions
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Try team, department, attendance, leave, or performance.
                  </p>
                </div>
              ) : (
                filtered.map((item, index) => {
                  const Icon = item.icon;
                  const selected = index === commandIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={Boolean(item.comingSoon)}
                      onMouseEnter={() => setCommandIndex(index)}
                      onClick={() => openCommand(item)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                        item.comingSoon
                          ? "cursor-not-allowed opacity-55"
                          : selected
                            ? "bg-sky-500/10 ring-1 ring-sky-500/20"
                            : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${
                          selected
                            ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
                            : "border-slate-800 bg-slate-900 text-slate-400"
                        }`}
                      >
                        <Icon size={18} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-200">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          {item.description}
                        </span>
                      </span>

                      {item.comingSoon ? (
                        <span className="shrink-0 rounded-md border border-slate-700 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          Soon
                        </span>
                      ) : selected ? (
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-sky-300"
                        />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500 sm:px-5">
              <span>↑ ↓ navigate · Enter open · Esc close</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

