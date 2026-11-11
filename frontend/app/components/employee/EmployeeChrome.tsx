"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock,
  Command,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Sun,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import WorkspaceClock from "../WorkspaceClock";
import OrganizationLogo from "../OrganizationLogo";

export type EmployeeWorkspaceRole =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

export type EmployeeWorkspaceUser = {
  id: string;
  email: string;
  role: EmployeeWorkspaceRole;
  organizationId: string;
  organizationName: string;
  employeeId: string;
  permissions: string[];
};

type SessionResponse = {
  authenticated?: boolean;
  message?: string;
  user?: EmployeeWorkspaceUser;
};

type EmployeeNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type EmployeeNavGroup = {
  label: string;
  items: EmployeeNavItem[];
};

type CommandItem = EmployeeNavItem & {
  group: string;
};

const EmployeeWorkspaceContext =
  createContext<EmployeeWorkspaceUser | null>(null);

export function useEmployeeWorkspaceUser() {
  return useContext(EmployeeWorkspaceContext);
}

export function getEmployeeRoleLabel(role: EmployeeWorkspaceRole) {
  switch (role) {
    case "HR_MANAGER":
      return "HR Manager";
    case "DEPARTMENT_MANAGER":
      return "Department Manager";
    case "EMPLOYEE":
      return "Employee";
    default:
      return "Employee";
  }
}

function isWorkforceRole(value: unknown): value is EmployeeWorkspaceRole {
  return (
    value === "HR_MANAGER" ||
    value === "DEPARTMENT_MANAGER" ||
    value === "EMPLOYEE"
  );
}

const navGroups: EmployeeNavGroup[] = [
  {
    label: "MY WORKSPACE",
    items: [
      {
        label: "My Day",
        href: "/employee/dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "My Profile",
        href: "/employee/profile",
        icon: UserRound,
      },
    ],
  },
  {
    label: "PLAN & TIME",
    items: [
      {
        label: "Attendance & Time",
        href: "/employee/attendance",
        icon: Clock,
      },
      {
        label: "My Earnings",
        href: "/employee/payroll",
        icon: BadgeDollarSign,
      },
    ],
  },
  {
    label: "TIME OFF",
    items: [
      {
        label: "Leave & holidays",
        href: "/employee/leave",
        icon: CalendarDays,
      },
    ],
  },
  {
    label: "FOLLOW THROUGH",
    items: [
      {
        label: "My Requests",
        href: "/employee/requests",
        icon: ClipboardList,
      },
      {
        label: "Messages",
        href: "/employee/communications",
        icon: MessageSquare,
      },
    ],
  },
];

const mobileNavItems: EmployeeNavItem[] = [
  { label: "Home", href: "/employee/dashboard", icon: LayoutDashboard },
  { label: "Time", href: "/employee/attendance", icon: Clock },
  { label: "Earnings", href: "/employee/payroll", icon: BadgeDollarSign },
  { label: "Leave", href: "/employee/leave", icon: CalendarDays },
  { label: "Requests", href: "/employee/requests", icon: ClipboardList },
  { label: "Messages", href: "/employee/communications", icon: MessageSquare },
  { label: "Profile", href: "/employee/profile", icon: UserRound },
];

const commandItems: CommandItem[] = [
  ...navGroups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      group: group.label,
    })),
  ),
  {
    label: "Change Password",
    href: "/account/change-password",
    icon: KeyRound,
    group: "ACCOUNT",
  },
];

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-6 text-slate-100">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#121b29] px-5 py-4">
        <span className="size-2 animate-pulse rounded-full bg-sky-400" />
        <p className="text-sm text-slate-300">{message}</p>
      </div>
    </main>
  );
}

export function EmployeeChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<EmployeeWorkspaceUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [activeCommand, setActiveCommand] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const reloadSession = useCallback(async () => {
    let redirecting = false;

    setChecking(true);
    setError("");
    setUser(null);

    try {
      const response = await fetch("/api/backend/employee-auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | SessionResponse
        | null;

      const sessionUser = data?.user;

      if (
        !response.ok ||
        data?.authenticated !== true ||
        !sessionUser ||
        !isWorkforceRole(sessionUser.role) ||
        typeof sessionUser.id !== "string" ||
        typeof sessionUser.email !== "string" ||
        typeof sessionUser.organizationId !== "string" ||
        typeof sessionUser.organizationName !== "string" ||
        typeof sessionUser.employeeId !== "string" ||
        !Array.isArray(sessionUser.permissions)
      ) {
        redirecting = true;
        router.replace("/");
        return;
      }

      if (sessionUser.role === "HR_MANAGER") {
        redirecting = true;
        router.replace("/hr/dashboard");
        return;
      }

      if (sessionUser.role === "DEPARTMENT_MANAGER") {
        redirecting = true;
        router.replace("/dm/dashboard");
        return;
      }

      setUser(sessionUser);
    } catch {
      setError(
        "We could not verify your session. Check your connection and try again.",
      );
    } finally {
      if (!redirecting) {
        setChecking(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void reloadSession();
  }, [reloadSession]);

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("hrms-employee-theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }
    } catch {
      // Theme preference is optional; the workspace safely defaults to dark.
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("hrms-employee-theme", nextTheme);
    } catch {
      // The current session still uses the selected theme if storage is unavailable.
    }
  }

  // Keep the existing login destination contract while sending each role
  // to the correct workspace after session verification.
  useEffect(() => {
    if (!checking && user && pathname === "/employee/welcome") {
      router.replace("/employee/dashboard");
    }
  }, [checking, pathname, router, user]);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        setCommandQuery("");
        setActiveCommand(0);
      }

      if (event.key === "Escape") {
        setPaletteOpen(false);
        setAccountOpen(false);
        setMobileOpen(false);
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();

    if (!query) {
      return commandItems;
    }

    return commandItems.filter((item) =>
      `${item.label} ${item.group}`.toLowerCase().includes(query),
    );
  }, [commandQuery]);

  useEffect(() => {
    setActiveCommand(0);
  }, [commandQuery, paletteOpen]);

  function chooseCommand(item: CommandItem) {
    setPaletteOpen(false);
    setCommandQuery("");
    router.push(item.href);
  }

  function handleCommandKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "ArrowDown" && filteredCommands.length > 0) {
      event.preventDefault();
      setActiveCommand((current) =>
        current >= filteredCommands.length - 1 ? 0 : current + 1,
      );
    }

    if (event.key === "ArrowUp" && filteredCommands.length > 0) {
      event.preventDefault();
      setActiveCommand((current) =>
        current <= 0 ? filteredCommands.length - 1 : current - 1,
      );
    }

    if (event.key === "Enter" && filteredCommands.length > 0) {
      event.preventDefault();
      chooseCommand(
        filteredCommands[
          Math.min(activeCommand, filteredCommands.length - 1)
        ],
      );
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");

    try {
      const response = await fetch("/api/backend/employee-auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        setError("Sign out could not be confirmed. Please try again.");
        setLoggingOut(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to contact the server to sign out. Please try again.");
      setLoggingOut(false);
    }
  }

  if (checking) {
    return <LoadingScreen message="Verifying your HRMS session…" />;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-5 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121b29] p-6 shadow-2xl">
          <h1 className="text-xl font-semibold">Workspace unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400" role="alert">
            {error || "Your session could not be loaded."}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void reloadSession()}
              className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Try again
            </button>

            <Link
              href="/"
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
            >
              Sign in
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const avatarInitial = user.email.trim().charAt(0).toUpperCase() || "E";
  const currentPage =
    navGroups
      .flatMap((group) => group.items)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ??
    (pathname === "/employee/attendance" ? "Attendance & Time" : "My Workspace");

  return (
    <EmployeeWorkspaceContext.Provider value={user}>
      <div data-employee-theme={theme} className="employee-theme-root min-h-screen bg-[#0b0f17] text-slate-100">
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          />
        )}

        <div className="flex min-h-screen">
          <aside
            data-employee-sidebar
            className={[
              "employee-sidebar-shell fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.08] bg-[#101722] transition-transform duration-200",
              mobileOpen
                ? "visible translate-x-0"
                : "invisible -translate-x-full",
              "lg:visible lg:static lg:z-auto lg:w-64 lg:translate-x-0",
            ].join(" ")}
            aria-label="Employee workspace sidebar"
          >
            <div data-employee-sidebar-brand className="employee-sidebar-brand flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
              <Link
                href="/employee/dashboard"
                className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
                onClick={() => setMobileOpen(false)}
              >
                <div className="flex size-9 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sm font-black text-sky-200">
                  H
                </div>

                <div>
                  <p className="text-sm font-bold tracking-wide text-white">
                    HRMS
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">
                    Employee space
                  </p>
                </div>
              </Link>

              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
                aria-label="Close navigation menu"
                onClick={() => setMobileOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div data-employee-sidebar-organization className="employee-sidebar-organization border-b border-white/[0.07] px-4 py-4">
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <OrganizationLogo className="size-11 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Organization
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-200">
                    {user.organizationName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {getEmployeeRoleLabel(user.role)} Portal
                  </p>
                </div>
              </div>
            </div>

            <nav data-employee-sidebar-nav className="employee-sidebar-nav min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
              {navGroups.map((group) => (
                <section key={group.label} className="employee-sidebar-group">
                  <h2 className="mb-2 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-500">
                    {group.label}
                  </h2>

                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={[
                            "employee-sidebar-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                            active
                              ? "border border-sky-300/15 bg-sky-400/10 text-sky-100"
                              : "border border-transparent text-slate-400 hover:bg-white/[0.045] hover:text-slate-100",
                          ].join(" ")}
                        >
                          <Icon
                            size={17}
                            className={
                              active ? "text-sky-300" : "text-slate-500"
                            }
                          />
                          <span>{item.label}</span>
                          {active && (
                            <span
                              aria-hidden="true"
                              className="ml-auto size-1.5 rounded-full bg-sky-300"
                            />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>

            <div data-employee-sidebar-footer className="employee-sidebar-footer border-t border-white/[0.07] p-4">
              <Link
                href="/account/change-password"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.045] hover:text-white"
              >
                <KeyRound size={17} />
                Change password
              </Link>

              <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.025] p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sm font-bold text-sky-200">
                  {avatarInitial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-200">
                    {user.email}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Employee account
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#0d131d]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/5 lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu size={19} />
                </button>

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Employee workspace
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-200">
                    {currentPage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCommandQuery("");
                    setActiveCommand(0);
                    setPaletteOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-400 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-slate-200 sm:min-w-52"
                  aria-label="Search pages and actions"
                >
                  <Search size={15} />
                  <span className="hidden sm:inline">Search workspace</span>
                </button>

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.025] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                  aria-pressed={theme === "light"}
                  title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <WorkspaceClock requireOrganizationTimeZone showAttendanceStatus />
                <div className="relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((open) => !open)}
                    className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-white/5"
                  >
                    <span className="flex size-8 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-xs font-bold text-sky-200">
                      {avatarInitial}
                    </span>
                    <ChevronDown
                      size={14}
                      className="hidden text-slate-500 sm:block"
                    />
                  </button>

                  {accountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-white/10 bg-[#141e2c] p-2 shadow-2xl"
                    >
                      <div className="border-b border-white/[0.07] px-3 py-3">
                        <p className="truncate text-xs font-semibold text-white">
                          {user.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {getEmployeeRoleLabel(user.role)}
                        </p>
                      </div>

                      <Link
                        role="menuitem"
                        href="/employee/profile"
                        onClick={() => setAccountOpen(false)}
                        className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        <UserRound size={16} />
                        My profile
                      </Link>

                      <Link
                        role="menuitem"
                        href="/account/change-password"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        <KeyRound size={16} />
                        Change password
                      </Link>

                      <button
                        role="menuitem"
                        type="button"
                        disabled={loggingOut}
                        onClick={() => void handleLogout()}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"
                      >
                        <LogOut size={16} />
                        {loggingOut ? "Signing out…" : "Sign out"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <main className="w-full flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:px-8 lg:pb-8">
              <div className="mx-auto w-full max-w-7xl">
                {error && (
                  <div
                    role="alert"
                    className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200"
                  >
                    {error}
                  </div>
                )}

                {children}
              </div>
            </main>

            <footer className="border-t border-white/[0.06] px-5 py-4 text-center text-[11px] text-slate-600">
              HRMS Employee Workspace
            </footer>
          </div>
        </div>

        <nav
          aria-label="Primary mobile navigation"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-white/[0.09] bg-[#0d131d]/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl sm:hidden"
        >
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition ${
                  active ? "text-sky-200" : "text-slate-500 hover:text-slate-200"
                }`}
              >
                <span className={`flex size-8 items-center justify-center rounded-xl ${active ? "bg-sky-300/10" : ""}`}>
                  <Icon size={17} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {paletteOpen && (
          <div
            className="hrms-attendance-modal-backdrop fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh] backdrop-blur-md"
            onClick={() => setPaletteOpen(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Search workspace pages and actions"
              className="employee-command-dialog w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#121b29] shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
                <Search size={18} className="shrink-0 text-slate-500" />
                <input
                  autoFocus
                  type="text"
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="Search pages and actions…"
                  aria-label="Search pages and actions"
                  className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
                <kbd className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-500">
                  ESC
                </kbd>
              </div>

              <div className="max-h-[55vh] overflow-y-auto p-2">
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Command
                      size={24}
                      className="mx-auto text-slate-600"
                    />
                    <p className="mt-3 text-sm font-medium text-slate-300">
                      No matching pages
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Try another search term.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredCommands.map((item, index) => {
                      const Icon = item.icon;
                      const active = index === activeCommand;

                      return (
                        <button
                          type="button"
                          key={item.href}
                          onMouseEnter={() => setActiveCommand(index)}
                          onClick={() => chooseCommand(item)}
                          className={[
                            "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                            active
                              ? "bg-sky-400/10 text-white"
                              : "text-slate-300 hover:bg-white/[0.04]",
                          ].join(" ")}
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]">
                            <Icon size={17} />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {item.label}
                            </span>
                            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {item.group}
                            </span>
                          </span>

                          {active && (
                            <ArrowRight
                              size={15}
                              className="text-sky-300"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3 text-[10px] text-slate-500">
                <span>Navigate to workspace pages</span>
                <span>↑ ↓ to move · Enter to open</span>
              </div>
            </section>
          </div>
        )}
      </div>
    </EmployeeWorkspaceContext.Provider>
  );
}

