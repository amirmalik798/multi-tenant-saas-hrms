
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { OrganizationCommandPalette } from "./OrganizationCommandPalette";
import WorkspaceClock from "../WorkspaceClock";


/**
 * Refreshes tenant-scoped read data only when it has become stale and the
 * Organization Admin tab is visible. Focus/visibility events reuse the same
 * stale check, so returning to the workspace does not cause duplicate loads.
 */
export function useOrganizationAdminAutoRefresh(
  refresh: () => void | Promise<void>,
  options: {
    enabled?: boolean;
    intervalMs?: number;
    shouldRefresh?: () => boolean;
  } = {},
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
      ) {
        return;
      }

      lastRefreshAt = Date.now();
      running = true;
      Promise.resolve()
        .then(() => refreshRef.current())
        .catch((error) => {
          // The page's existing loader owns user-facing error state.
          console.warn("Organization Admin background refresh failed:", error);
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

type OrganizationPage = "dashboard" | "employees" | "departments" | "organization-chart" | "invitations" | "communications" | "support" | "settings" | "profile" | "license";
type PaletteContext = Exclude<OrganizationPage, "license">;

type OrganizationAdminSidebarProps = { activePage: OrganizationPage };
type OrganizationAdminHeaderProps = {
  activePage: OrganizationPage;
  organizationName: string;
  loggingOut: boolean;
  onLogout: () => void;
  commandPaletteOpen: boolean;
  onCommandPaletteOpenChange: (open: boolean) => void;
  onCreate?: () => boolean | void;
  onNavigateRequest?: (href: string) => boolean | void;
  headerMeta?: ReactNode;
};

const navItems: Array<{
  id: OrganizationPage;
  label: string;
  href: string;
  icon: "dashboard" | "users" | "layers" | "hierarchy" | "mail" | "settings" | "credit-card";
}> = [
  { id: "dashboard", label: "Dashboard", href: "/org/dashboard", icon: "dashboard" },
  { id: "profile", label: "My Profile", href: "/org/profile", icon: "settings" },
  { id: "employees", label: "Employees", href: "/org/employees", icon: "users" },
  { id: "departments", label: "Departments", href: "/org/departments", icon: "layers" },
  { id: "organization-chart", label: "Organization Chart", href: "/org/organization-chart", icon: "hierarchy" },
  { id: "invitations", label: "Invitations", href: "/org/invitations", icon: "mail" },
  { id: "communications", label: "Messages", href: "/org/communications", icon: "mail" },
  { id: "support", label: "Platform Support", href: "/org/support", icon: "mail" },
  { id: "settings", label: "Organization Profile & Settings", href: "/org/settings", icon: "settings" },
  { id: "license", label: "License & Payments", href: "/org/license", icon: "credit-card" },
];

function Icon({
  name,
  size = 20,
}: {
  name:
    | "dashboard"
    | "users"
    | "layers"
    | "hierarchy"
    | "mail"
    | "settings"
    | "credit-card"
    | "building"
    | "logout"
    | "lock";
  size?: number;
}) {
  const artwork: Record<
    | "dashboard"
    | "users"
    | "layers"
    | "hierarchy"
    | "mail"
    | "settings"
    | "credit-card"
    | "building"
    | "logout"
    | "lock",
    ReactNode
  > = {
    dashboard: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="11" width="7" height="10" rx="1.5" />
        <rect x="3" y="14" width="8" height="7" rx="1.5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    hierarchy: (
      <>
        <rect x="9" y="3" width="6" height="5" rx="1" />
        <rect x="2" y="16" width="6" height="5" rx="1" />
        <rect x="16" y="16" width="6" height="5" rx="1" />
        <path d="M12 8v4M5 16v-2h14v2M19 14v2" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    settings: (
      <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="2" y1="14" x2="6" y2="14" />
        <line x1="10" y1="8" x2="14" y2="8" />
        <line x1="18" y1="16" x2="22" y2="16" />
      </>
    ),
    "credit-card": (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M7 15h3" />
      </>
    ),
    building: (
      <>
        <rect x="4" y="2.5" width="16" height="19" rx="2" />
        <path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v3" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {artwork[name]}
    </svg>
  );
}

export function OrganizationAdminSidebar({
  activePage,
}: OrganizationAdminSidebarProps) {
  const [logoVersion, setLogoVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setLogoVersion(Date.now());
    window.addEventListener("hrms:organization-logo-updated", refresh);
    return () => window.removeEventListener("hrms:organization-logo-updated", refresh);
  }, []);
  return (
    <aside aria-label="Organization Admin navigation" className="organization-admin-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#29384b] bg-[#0f1724] text-white lg:flex">
      <Link
        href="/org/dashboard"
        className="flex h-[86px] shrink-0 items-center gap-3 border-b border-[#29384b] px-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#75c7ff]"
      >
        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon name="building" size={23} />
          <img key={logoVersion} src={`/api/backend/org/logo?v=${logoVersion}`} alt="" className="absolute h-10 w-10 rounded-xl object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        </span>
        <span>
          <span className="block text-lg font-bold tracking-tight">
            HRMS Platform
          </span>
          <span className="mt-0.5 block text-sm text-slate-300">
            Organization Admin
          </span>
        </span>
      </Link>

      <nav
        className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4"
        aria-label="Organization Admin navigation"
      >
        {navItems.map((item) => {
          const active = item.id === activePage;

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-[49px] items-center gap-3 rounded-lg px-3.5 text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${
                active
                  ? "border border-blue-300/10 border-l-2 border-l-[#75c7ff] bg-[#14283e] pl-[calc(0.875rem-2px)] font-semibold text-[#e3f2ff] shadow-sm shadow-black/10"
                  : "border border-transparent font-medium text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-white"
              }`}
            >
              <Icon name={item.icon} size={21} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}


export function OrganizationAdminHeader({
  activePage,
  organizationName,
  loggingOut,
  onLogout,
  commandPaletteOpen,
  onCommandPaletteOpenChange,
  onCreate,
  onNavigateRequest,
  headerMeta,
}: OrganizationAdminHeaderProps) {
  const [adminPhotoVersion, setAdminPhotoVersion] = useState(0);
  const [organizationLogoVersion, setOrganizationLogoVersion] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let initial: "dark" | "light" = "dark";
    try {
      const saved = window.localStorage.getItem("hrms-org-admin-theme");
      if (saved === "light" || saved === "dark") initial = saved;
    } catch {
      // Theme persistence is optional.
    }
    setTheme(initial);
    document.documentElement.dataset.orgAdminTheme = initial;

    return () => {
      delete document.documentElement.dataset.orgAdminTheme;
    };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.orgAdminTheme = next;
    try {
      window.localStorage.setItem("hrms-org-admin-theme", next);
    } catch {
      // Keep the selected theme for this session.
    }
  }

  useEffect(() => {
    const refresh = () => setAdminPhotoVersion(Date.now());
    window.addEventListener("hrms:org-admin-photo-updated", refresh);
    return () => window.removeEventListener("hrms:org-admin-photo-updated", refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setOrganizationLogoVersion(Date.now());
    window.addEventListener("hrms:organization-logo-updated", refresh);
    return () => window.removeEventListener("hrms:organization-logo-updated", refresh);
  }, []);
  return (
    <>
      <style jsx global>{`
        @keyframes organizationAdminDrawerIn {
          from {
            transform: translateX(24px);
            opacity: 0.72;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .organization-slide-over-panel {
          animation: organizationAdminDrawerIn 240ms cubic-bezier(0.16, 1, 0.3, 1)
            both;
        }

        /* A visible, high-contrast keyboard focus treatment across all org-admin pages. */
        :where(button, a, input, select, textarea, [role="button"], [tabindex]):focus-visible {
          outline: 2px solid #75c7ff !important;
          outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
          .organization-slide-over-panel {
            animation: none !important;
          }

          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <header className="sticky top-0 z-20 flex min-h-[71px] flex-col justify-center border-b border-[#29384b] bg-[#0f1724]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex w-full items-center justify-between gap-3 sm:gap-4">
          <div className="relative min-w-0 flex-1 sm:max-w-[482px]">
            <OrganizationCommandPalette
              context={activePage === "license" ? "settings" : activePage as PaletteContext}
              open={commandPaletteOpen}
              onOpenChange={onCommandPaletteOpenChange}
              onCreate={onCreate}
              onNavigateRequest={onNavigateRequest}
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {headerMeta}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-pressed={theme === "light"}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#182232]/90 text-slate-200 transition hover:border-[#75c7ff]/30 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <WorkspaceClock requireOrganizationTimeZone />


            <div className="hidden h-9 w-px bg-slate-700/70 sm:block" />

            <div
              className="flex items-center gap-2 sm:gap-3"
              aria-label={`Signed in as Organization Admin for ${organizationName}`}
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-xs font-bold tracking-wide text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                OA
                <img key={adminPhotoVersion} src={`/api/backend/org/profile/photo?v=${adminPhotoVersion}`} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              </div>

              <div className="hidden min-w-0 sm:block">
                <p className="text-xs font-semibold leading-5 text-[#f8fafc]">
                  Organization Admin
                </p>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-white/[0.06] text-slate-400">
                    <Icon name="building" size={11} />
                    <img
                      key={organizationLogoVersion}
                      src={`/api/backend/org/logo?v=${organizationLogoVersion}`}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  </span>
                  <p
                    className="max-w-[160px] truncate text-xs leading-5 text-slate-400"
                    title={organizationName}
                  >
                    {organizationName}
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/account/change-password"
              aria-label="Change password"
              title="Change password"
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#182232]/90 px-2.5 text-xs font-semibold text-slate-200 transition hover:border-[#75c7ff]/30 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] sm:px-3 sm:text-sm"
            >
              <Icon name="lock" size={15} />
              <span className="hidden xl:inline">Change password</span>
            </Link>

            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              aria-label={loggingOut ? "Logging out" : "Log out"}
              title={loggingOut ? "Logging out" : "Log out"}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#182232]/90 px-2.5 text-xs font-semibold text-slate-200 transition hover:border-rose-400/25 hover:bg-rose-400/[0.07] hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-sm"
            >
              <Icon name="logout" size={15} />
              <span className="hidden sm:inline">{loggingOut ? "Logging out…" : "Logout"}</span>
            </button>
          </div>
        </div>

        <nav
          className="mt-3 flex gap-2 overflow-x-auto pb-3 lg:hidden"
          aria-label="Organization Admin mobile navigation"
        >
          {navItems.map((item) => {
            const active = item.id === activePage;

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition ${
                  active
                    ? "border-[#75c7ff]/25 bg-[#18314a] font-semibold text-[#e3f2ff]"
                    : "border-white/10 bg-[#182232]/90 text-slate-300 hover:border-white/20 hover:bg-white/[0.05]"
                }`}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
