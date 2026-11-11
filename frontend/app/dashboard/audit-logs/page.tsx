"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CommandPalette,
  CommandPaletteTrigger,
  buildSuperAdminCommandItems,
  type CommandPaletteItem,
  type CommandPaletteOrganization,
} from "../../components/super-admin/CommandPalette";

import SuperAdminThemeToggle from "../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../components/WorkspaceClock";
type AdminUser = { email: string; role: string };

type AuditLog = {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  actionKey: string;
  targetType: string;
  targetId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  metadata: unknown;
  createdAt: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AuditFilterOptions = {
  actions: string[];
  targetTypes: string[];
  organizations: { id: string; name: string }[];
  platformWideValue: string;
};

type IconName =
  | "dashboard"
  | "building"
  | "admin"
  | "mail"
  | "credit-card"
  | "message"
  | "activity"
  | "search"
  | "refresh"
  | "logout"
  | "clock"
  | "chevron"
  | "shield"
  | "filter"
  | "external"
  | "calendar";

const DEFAULT_FILTER_OPTIONS: AuditFilterOptions = {
  actions: [],
  targetTypes: [],
  organizations: [],
  platformWideValue: "__PLATFORM__",
};

const navItems: { label: string; href?: string; icon: IconName }[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Organizations", href: "/dashboard/organizations", icon: "building" },
  { label: "Organization Admins", href: "/dashboard/organization-admins", icon: "admin" },
  { label: "Payments", href: "/dashboard/payments", icon: "credit-card" },
  { label: "Invitations", href: "/dashboard/invitations", icon: "mail" },
    { label: "Platform Support", icon: "message", href: "/dashboard/support" },
    { label: "System Health", icon: "activity", href: "/dashboard/system-health" },
  { label: "Audit Logs", href: "/dashboard/audit-logs", icon: "shield" },
];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></>,
    building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
    admin: <><circle cx="9" cy="7" r="4" /><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M19 8v6m-3-3h6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    "credit-card": <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M7 15h3" /></>,
    message: <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
    external: <><path d="M14 3h7v7M21 3 11 13" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {paths[name]}
    </svg>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatAction(value: string) {
  return value.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "No data recorded";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function actionBadgeStyle(actionKey: string) {
  const action = actionKey.toLowerCase();
  if (action.includes("revoke") || action.includes("suspend") || action.includes("archive")) {
    return "border-rose-400/20 bg-rose-500/10 text-rose-200";
  }
  if (action.includes("create") || action.includes("invite")) {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  }
  if (action.includes("status") || action.includes("update")) {
    return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  }
  return "border-[#75c7ff]/20 bg-[#75c7ff]/[0.07] text-[#b5e1ff]";
}

function getTargetDestination(log: AuditLog) {
  const targetType = log.targetType.trim().toUpperCase().replace(/[ -]/g, "_");

  if (targetType === "ORGANIZATION" && log.targetId) {
    const params = new URLSearchParams({ organizationId: log.targetId, panel: "view" });
    return {
      href: `/dashboard/organizations?${params.toString()}`,
      label: "View organization",
      description: "Open the organization record associated with this event.",
    };
  }

  if (targetType === "INVITATION" && log.organizationId) {
    return {
      href: `/dashboard/organizations/${encodeURIComponent(log.organizationId)}`,
      label: "Review invitation context",
      description: "Open the related organization to review its invitation history.",
    };
  }

  if (["USER", "EMPLOYEE", "ORGANIZATION_ADMIN", "ORGANIZATIONADMIN"].includes(targetType)) {
    if (log.organizationId) {
      return {
        href: `/dashboard/organizations/${encodeURIComponent(log.organizationId)}`,
        label: "Review organization accounts",
        description: "Open the related organization to review its user accounts.",
      };
    }

    if (targetType === "ORGANIZATION_ADMIN" || targetType === "ORGANIZATIONADMIN") {
      return {
        href: "/dashboard/organization-admins",
        label: "Open admin directory",
        description: "Open the Organization Admin directory.",
      };
    }
  }

  if (log.organizationId) {
    return {
      href: `/dashboard/organizations/${encodeURIComponent(log.organizationId)}`,
      label: "Open organization context",
      description: "Open the organization associated with this event.",
    };
  }

  return null;
}

export default function AuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState<AuditFilterOptions>(DEFAULT_FILTER_OPTIONS);
  const shouldLoadFilterOptionsRef = useRef(true);
  const lastSuccessfulLoadRef = useRef(0);
  const hasLoadedLogsRef = useRef(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actorEmailInput, setActorEmailInput] = useState("");
  const [actorEmailFilter, setActorEmailFilter] = useState("");
  const [targetIdInput, setTargetIdInput] = useState("");
  const [targetIdFilter, setTargetIdFilter] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeInput, setTargetTypeInput] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [organizationInput, setOrganizationInput] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("");
  const [fromDateInput, setFromDateInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDateInput, setToDateInput] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterValidationError, setFilterValidationError] = useState("");

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOrganizations, setPaletteOrganizations] = useState<CommandPaletteOrganization[]>([]);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        const response = await fetch("/api/backend/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.user) {
          router.replace("/");
          return;
        }

        if (active) setUser(data.user as AdminUser);
      } catch {
        if (active) router.replace("/");
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
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) return;

        const data = await response.json();
        const candidates: unknown = Array.isArray(data) ? data : data.organizations;
        if (!Array.isArray(candidates)) return;

        const items: CommandPaletteOrganization[] = candidates
          .filter((item: unknown): item is CommandPaletteOrganization =>
            typeof item === "object" && item !== null &&
            typeof (item as CommandPaletteOrganization).id === "string" &&
            typeof (item as CommandPaletteOrganization).name === "string" &&
            typeof (item as CommandPaletteOrganization).slug === "string" &&
            typeof (item as CommandPaletteOrganization).status === "string",
          )
          .map((item) => ({ id: item.id, name: item.name, slug: item.slug, status: item.status }));

        if (active) setPaletteOrganizations(items);
      } catch {
        // The command palette remains available for global commands even if organization discovery fails.
      }
    }

    void loadPaletteOrganizations();
    return () => { active = false; };
  }, [user, router]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    const controller = new AbortController();

    async function loadLogs() {
      if (!hasLoadedLogsRef.current) setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (search) params.set("q", search);
      if (actorEmailFilter) params.set("actorEmail", actorEmailFilter);
      if (targetIdFilter) params.set("targetId", targetIdFilter);
      if (actionFilter) params.set("action", actionFilter);
      if (targetFilter) params.set("targetType", targetFilter);
      if (organizationFilter) params.set("organizationId", organizationFilter);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (shouldLoadFilterOptionsRef.current) params.set("includeFilters", "1");

      try {
        const response = await fetch(`/api/backend/audit-logs?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);

        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error(data?.message || "Could not load audit logs.");
        if (!Array.isArray(data?.logs) || !data?.pagination) {
          throw new Error("The audit log response was incomplete.");
        }

        if (active) {
          setLogs(data.logs as AuditLog[]);
          setPagination(data.pagination as Pagination);
          hasLoadedLogsRef.current = true;
          lastSuccessfulLoadRef.current = Date.now();
          if (data.filterOptions) {
            setFilters({
              actions: Array.isArray(data.filterOptions.actions) ? data.filterOptions.actions : [],
              targetTypes: Array.isArray(data.filterOptions.targetTypes) ? data.filterOptions.targetTypes : [],
              organizations: Array.isArray(data.filterOptions.organizations) ? data.filterOptions.organizations : [],
              platformWideValue: typeof data.filterOptions.platformWideValue === "string"
                ? data.filterOptions.platformWideValue
                : DEFAULT_FILTER_OPTIONS.platformWideValue,
            });
            shouldLoadFilterOptionsRef.current = false;
          }
        }
      } catch (loadError) {
        if (active && !controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load audit logs.");
        }
      } finally {
        if (active && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLogs();
    return () => { active = false; controller.abort(); };
  }, [user, pagination.page, pagination.pageSize, search, actorEmailFilter, targetIdFilter, actionFilter, targetFilter, organizationFilter, fromDate, toDate, reloadKey, router]);

  useEffect(() => {
    if (!user) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      const lastSuccess = lastSuccessfulLoadRef.current;
      if (lastSuccess === 0 || Date.now() - lastSuccess >= 60_000) {
        setReloadKey((current) => current + 1);
      }
    };
    const interval = window.setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [user]);

  const isActive = useCallback(
    (href: string) => href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );

  const commandItems = useMemo(
    () => buildSuperAdminCommandItems(paletteOrganizations),
    [paletteOrganizations],
  );

  const selectCommandItem = useCallback((item: CommandPaletteItem) => {
    if (item.disabled || !item.href) return;
    setCommandPaletteOpen(false);
    router.push(item.href);
  }, [router]);

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const currentPageActorCount = new Set(logs.map((log) => log.actorEmail).filter(Boolean)).size;
  const currentPageTargetCount = new Set(logs.map((log) => log.targetType).filter(Boolean)).size;

  const activeFilterCount = [search, actorEmailFilter, targetIdFilter, actionFilter, targetFilter, organizationFilter, fromDate, toDate]
    .filter(Boolean).length;

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (logoutFailure) {
      setLogoutError(logoutFailure instanceof Error ? logoutFailure.message : "Could not log out.");
    } finally {
      setLoggingOut(false);
    }
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fromDateInput && toDateInput && fromDateInput > toDateInput) {
      setFilterValidationError("The start date must be on or before the end date.");
      return;
    }

    setFilterValidationError("");
    setSearch(searchInput.trim());
    setActorEmailFilter(actorEmailInput.trim());
    setTargetIdFilter(targetIdInput.trim());
    setActionFilter(actionInput);
    setTargetFilter(targetTypeInput);
    setOrganizationFilter(organizationInput);
    setFromDate(fromDateInput);
    setToDate(toDateInput);
    setExpandedLogId(null);
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function handleResetFilters() {
    setSearchInput("");
    setSearch("");
    setActorEmailInput("");
    setActorEmailFilter("");
    setTargetIdInput("");
    setTargetIdFilter("");
    setActionInput("");
    setActionFilter("");
    setTargetTypeInput("");
    setTargetFilter("");
    setOrganizationInput("");
    setOrganizationFilter("");
    setFromDateInput("");
    setFromDate("");
    setToDateInput("");
    setToDate("");
    setFilterValidationError("");
    setExpandedLogId(null);
    setPagination((current) => ({ ...current, page: 1 }));
  }


  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-slate-200">
        <div className="flex items-center gap-3 rounded-xl border border-[#29384b] bg-[#141f2e] px-6 py-5 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent" />
          Verifying your admin session…
        </div>
      </main>
    );
  }

  if (!user) return null;

  const metrics = [
    { label: "Matching events", value: loading ? "…" : error ? "—" : pagination.total.toLocaleString(), description: "Records matching the applied filters", icon: "activity" as const, tone: "bg-blue-500/10 text-blue-300" },
    { label: "Events on this page", value: loading ? "…" : error ? "—" : logs.length.toLocaleString(), description: error ? "Pagination unavailable until records load" : `Page ${pagination.page} of ${pagination.totalPages}`, icon: "calendar" as const, tone: "bg-violet-500/10 text-violet-300" },
    { label: "Actors on this page", value: loading ? "…" : error ? "—" : currentPageActorCount.toLocaleString(), description: "Distinct actor identities in these records", icon: "admin" as const, tone: "bg-emerald-500/10 text-emerald-300" },
    { label: "Target types on this page", value: loading ? "…" : error ? "—" : currentPageTargetCount.toLocaleString(), description: "Distinct target types represented by records on this page", icon: "building" as const, tone: "bg-amber-500/10 text-amber-300" },
  ];

  return (
    <div
      className="min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark"
      style={{
        backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)",
        backgroundSize: "auto, 42px 42px, 42px 42px",
      }}
    >
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#29384b] bg-[#0f1724] text-white lg:flex">
        <Link href="/dashboard" className="flex h-[86px] items-center gap-3 border-b border-[#29384b] px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"><Icon name="shield" size={23} /></span>
          <span><span className="block text-lg font-bold tracking-tight">HRMS Platform</span><span className="mt-0.5 block text-sm text-slate-300">Super Admin</span></span>
        </Link>
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
          {navItems.map((item) => {
            const active = Boolean(item.href && isActive(item.href));
            const classes = `flex h-[49px] items-center gap-3 rounded-lg px-3.5 text-[15px] transition ${active ? "border border-blue-300/10 border-l-2 border-l-[#75c7ff] bg-[#14283e] pl-[calc(0.875rem-2px)] font-semibold text-[#e3f2ff] shadow-sm shadow-black/10" : item.href ? "border border-transparent font-medium text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-white" : "cursor-default font-medium text-slate-400"}`;
            return item.href ? (
              <Link key={item.label} href={item.href} className={classes} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={21} /><span>{item.label}</span></Link>
            ) : (
              <div key={item.label} className={classes} aria-disabled="true" title={`${item.label} page is not available yet`}><Icon name={item.icon} size={21} /><span>{item.label}</span></div>
            );
          })}
        </nav>
      </aside>

      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-20 flex min-h-[71px] flex-col justify-center border-b border-[#29384b] bg-[#0f1724]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="relative hidden h-[43px] w-full max-w-[482px] sm:block">
              <button type="button" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" className="absolute inset-0 flex h-[43px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-12 pr-4 text-left text-sm text-slate-300 outline-none transition hover:border-[#75c7ff]/35 hover:bg-[#182232] focus-visible:border-[#75c7ff] focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20">
                <span className="truncate">Search commands or organizations...</span>
              </button>
              <span className="pointer-events-none absolute left-4 top-[11px] text-slate-300"><Icon name="search" size={20} /></span>
              <CommandPaletteTrigger onClick={() => setCommandPaletteOpen(true)} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
              <div className="hidden h-9 w-px bg-slate-700/70 sm:block" />
              <WorkspaceClock />
              <SuperAdminThemeToggle />
              <div className="flex items-center gap-3" aria-label="Signed in as Super Admin">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-sm font-bold tracking-wide text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">SA</div>
                <div className="hidden min-w-0 sm:block"><p className="text-sm font-semibold leading-5 text-[#f8fafc]">Super Admin</p><p className="max-w-[190px] truncate text-xs leading-5 text-slate-400">{user.email || "Platform Administrator"}</p></div>
              </div>
              <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="ml-1 inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#182232]/90 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm">
                <Icon name="logout" size={14} />{loggingOut ? "Logging out…" : "Logout"}
              </button>
            </div>
          </div>
          <div className="relative mt-3 sm:hidden">
            <button type="button" onClick={() => setCommandPaletteOpen(true)} aria-label="Search commands and organizations" aria-keyshortcuts="Control+K Meta+K" className="flex h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-[#111a28] px-3.5 text-left text-sm text-slate-300 transition hover:border-[#75c7ff]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30">
              <Icon name="search" size={18} /><span className="min-w-0 flex-1 truncate">Search commands or organizations...</span>
            </button>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {navItems.filter((item) => item.href).map((item) => {
              if (!item.href) return null;
              const active = isActive(item.href);
              return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${active ? "border-[#75c7ff]/25 bg-[#18314a] font-semibold text-[#e3f2ff] shadow-sm" : "border-white/10 bg-[#182232]/90 text-slate-200 hover:border-white/20 hover:bg-white/[0.05]"}`}><Icon name={item.icon} size={16} /><span>{item.label}</span></Link>;
            })}
          </nav>
        </header>

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200"><p>{logoutError}</p><button type="button" onClick={() => setLogoutError("")} className="shrink-0 font-semibold underline underline-offset-2">Dismiss</button></div>}

          <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8db9df]"><span className="h-px w-5 bg-[#75c7ff]/70" />Platform Control <span className="text-slate-600">/</span> Super Admin</p>
              <h1 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">Audit Logs</h1>
            </div>
            <div className="inline-flex min-h-[44px] items-center gap-3 self-start rounded-lg border border-[#2a3b50] bg-[#111a28]/85 px-3.5 text-xs font-medium text-[#c0ccdb] shadow-sm sm:self-auto">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#293c52] bg-[#18283b] text-[#8bcaff]"><Icon name="clock" size={16} /></span>
              <span className="whitespace-nowrap">Newest first</span>
              <span className="rounded-full border border-[#273b51] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#91a9c2]">Read only</span>
            </div>
          </section>

          {error && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span></div>}

          <section aria-label="Audit log overview metrics" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-4">
            {metrics.map((metric) => (
              <article key={metric.label} className="relative flex min-h-[128px] min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-4 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-[''] xl:items-center 2xl:gap-4 2xl:px-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] ${metric.tone}`}><Icon name={metric.icon} size={24} /></span>
                <div className="min-w-0 flex-1"><p className="break-words text-[10px] font-semibold uppercase leading-5 tracking-[0.17em] text-[#9eafc4]">{metric.label}</p><p className="mt-2 break-words text-3xl font-bold leading-none tracking-[-0.045em] tabular-nums text-[#f2f7fc]">{metric.value}</p></div>
              </article>
            ))}
          </section>

          <section className="mt-5 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><div className="flex items-center gap-2 text-[#8bcaff]"><Icon name="filter" size={18} /><h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#d5e1ef]">Filter audit data</h2></div><p className="mt-1 text-xs leading-5 text-[#91a3b8]">Filter options are populated from recorded audit data. Date filters include the full selected days.</p></div>
              {activeFilterCount > 0 && <span className="rounded-full border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] px-3 py-1 text-[11px] font-semibold text-[#b5e1ff]">{activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}</span>}
            </div>
            <form onSubmit={handleApplyFilters} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="block xl:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">General search</span>
                <span className="relative block">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-500"><Icon name="search" size={15} /></span>
                  <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={200} placeholder="Search action, organization, reason, or record ID…" className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#75c7ff]/60 focus:ring-2 focus:ring-[#75c7ff]/10" />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Action type</span>
                <select value={actionInput} onChange={(event) => setActionInput(event.target.value)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none focus:border-[#75c7ff]/60">
                  <option value="">All recorded actions</option>
                  {filters.actions.map((action) => <option key={action} value={action}>{formatAction(action)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Actor email contains</span>
                <input type="text" inputMode="email" autoComplete="off" value={actorEmailInput} onChange={(event) => setActorEmailInput(event.target.value)} maxLength={254} placeholder="admin@company.com" className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#75c7ff]/60 focus:ring-2 focus:ring-[#75c7ff]/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Target type</span>
                <select value={targetTypeInput} onChange={(event) => setTargetTypeInput(event.target.value)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none focus:border-[#75c7ff]/60">
                  <option value="">All target types</option>
                  {filters.targetTypes.map((targetType) => <option key={targetType} value={targetType}>{formatAction(targetType)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Target record ID contains</span>
                <input value={targetIdInput} onChange={(event) => setTargetIdInput(event.target.value)} maxLength={120} placeholder="Paste a target ID" className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 font-mono text-xs text-white outline-none placeholder:font-sans placeholder:text-slate-500 focus:border-[#75c7ff]/60 focus:ring-2 focus:ring-[#75c7ff]/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">Organization scope</span>
                <select value={organizationInput} onChange={(event) => setOrganizationInput(event.target.value)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none focus:border-[#75c7ff]/60">
                  <option value="">All organizations</option>
                  <option value={filters.platformWideValue}>Platform-wide (no organization)</option>
                  {filters.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">From date (inclusive)</span>
                <input type="date" value={fromDateInput} max={toDateInput || undefined} onChange={(event) => setFromDateInput(event.target.value)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none focus:border-[#75c7ff]/60" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">To date (inclusive)</span>
                <input type="date" value={toDateInput} min={fromDateInput || undefined} onChange={(event) => setToDateInput(event.target.value)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none focus:border-[#75c7ff]/60" />
              </label>
              <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-3">
                <button type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#75c7ff] px-4 text-xs font-bold text-[#0b0f17] transition hover:bg-[#9bd8ff] disabled:cursor-not-allowed disabled:opacity-50"><Icon name="filter" size={14} />Apply filters</button>
                <button type="button" onClick={handleResetFilters} disabled={loading && activeFilterCount === 0 && !searchInput && !actorEmailInput && !targetIdInput && !actionInput && !targetTypeInput && !organizationInput && !fromDateInput && !toDateInput} className="h-10 rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Reset all</button>
                <span className="ml-auto self-center text-[11px] text-slate-500">Filters combine with AND logic</span>
              </div>
              {filterValidationError && <p role="alert" className="sm:col-span-2 xl:col-span-3 text-xs text-rose-300">{filterValidationError}</p>}
            </form>
            {(fromDate || toDate) && <p className="mt-3 text-xs text-slate-400">Applied date range: {fromDate ? formatDateOnly(fromDate) : "Earliest available"} – {toDate ? formatDateOnly(toDate) : "Today and later"}</p>}
          </section>

          <section className="sa-audit-register mt-5 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
            <div className="flex flex-col gap-3 border-b border-[#29384b] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#d5e1ef]">Audit event register</h2>
                
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#29384b] bg-[#0f1724] px-3 py-1.5 text-[11px] font-semibold tabular-nums text-slate-300">{loading ? "Loading records…" : `${rangeStart}–${rangeEnd} of ${pagination.total.toLocaleString()}`}</span>
                <label className="flex items-center gap-2 text-xs text-slate-400"><span>Rows</span><select aria-label="Rows per page" value={pagination.pageSize} disabled={loading} onChange={(event) => { setExpandedLogId(null); setPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) })); }} className="h-9 rounded-lg border border-[#29384b] bg-[#0f1724] px-2 text-xs text-slate-200 outline-none focus:border-[#75c7ff]/50"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select></label>
              </div>
            </div>

            {error && <div role="alert" className="m-4 rounded-lg border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

            <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent]">
              <table className="w-full min-w-[1000px] table-fixed border-collapse text-left text-sm">
                <thead className="border-b border-[#29384b] bg-[#111a28]/95 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a4b6ca]">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 w-[88px] border-r border-[#29384b] bg-[#111a28] px-3 py-3.5">Inspect</th>
                    <th scope="col" className="w-[140px] px-3 py-3.5">When</th>
                    <th scope="col" className="w-[175px] px-3 py-3.5">Event</th>
                    <th scope="col" className="w-[180px] px-3 py-3.5">Actor</th>
                    <th scope="col" className="w-[190px] px-3 py-3.5">Target</th>
                    <th scope="col" className="w-[220px] px-3 py-3.5">Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27384b]/80">
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-300"><span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent align-middle" />Loading audit events…</td></tr>
                  ) : error ? null : logs.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-14 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#29384b] bg-[#111a28] text-slate-400"><Icon name="activity" size={22} /></span><p className="mt-3 text-sm font-semibold text-white">No audit events found</p><p className="mt-1 text-xs text-slate-400">Adjust the filters or reset them to search all recorded activity.</p><button type="button" onClick={handleResetFilters} className="mt-3 text-xs font-semibold text-[#9ed5ff] underline underline-offset-4">Reset filters</button></td></tr>
                  ) : logs.map((log) => {
                    const destination = getTargetDestination(log);
                    const expanded = expandedLogId === log.id;
                    const eventDate = new Date(log.createdAt);
                    return (
                      <Fragment key={log.id}>
                        <tr className="group align-top transition-colors hover:bg-[#14283e]/35">
                          <td className="sticky left-0 z-10 border-r border-[#29384b] bg-[#141f2e] px-3 py-3 align-middle group-hover:bg-[#18283b]">
                            <button type="button" aria-label={`${expanded ? "Hide" : "Inspect"} audit record for ${log.actorEmail || "unknown actor"}: ${formatAction(log.actionKey)}`} aria-expanded={expanded} aria-controls={`audit-detail-${log.id}`} onClick={() => setExpandedLogId((current) => current === log.id ? null : log.id)} className={`inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/40 ${expanded ? "border-[#75c7ff]/40 bg-[#18314a] text-[#e3f2ff]" : "border-[#29384b] bg-[#0f1724] text-slate-200 hover:border-[#75c7ff]/40 hover:text-white"}`}>
                              {expanded ? "Hide" : "Inspect"}<Icon name="chevron" size={13} />
                            </button>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="text-xs font-semibold leading-5 tabular-nums text-slate-100">{Number.isNaN(eventDate.getTime()) ? "Date unavailable" : eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                            <p className="mt-1 text-[11px] leading-4 tabular-nums text-slate-400">{Number.isNaN(eventDate.getTime()) ? "—" : eventDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className={`inline-flex max-w-full whitespace-normal break-words rounded-md border px-2 py-1.5 text-xs font-semibold leading-4 ${actionBadgeStyle(log.actionKey)}`}>{formatAction(log.actionKey)}</span>
                            <p className="mt-1.5 text-[10px] leading-4 text-slate-500">{log.targetType ? formatAction(log.targetType) : "Unknown target type"}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="break-words text-xs font-semibold leading-5 text-white" title={log.actorEmail}>{log.actorEmail || "Unknown actor"}</p>
                            <p className="mt-1 max-w-full truncate font-mono text-[10px] leading-4 text-slate-500" title={log.actorUserId || undefined}>{log.actorUserId || "System / unavailable ID"}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="text-xs font-semibold leading-5 text-slate-100">{formatAction(log.targetType || "Unknown target")}</p>
                            <p className="mt-1 max-w-full truncate font-mono text-[10px] leading-4 text-slate-500" title={log.targetId || undefined}>{log.targetId || "No target ID recorded"}</p>
                            {destination ? <Link href={destination.href} title={destination.description} className="mt-2 inline-flex max-w-full items-center gap-1 text-[11px] font-semibold leading-4 text-[#b9e2ff] underline decoration-[#75c7ff]/25 underline-offset-4 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30">{destination.label}<Icon name="external" size={12} /></Link> : <p className="mt-2 text-[10px] leading-4 text-slate-500">No direct destination</p>}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {log.organizationId ? <Link href={`/dashboard/organizations/${encodeURIComponent(log.organizationId)}`} className="block max-w-full break-words text-xs font-semibold leading-5 text-[#b9e2ff] underline decoration-[#75c7ff]/25 underline-offset-4 hover:text-white" title={log.organizationName || log.organizationId}>{log.organizationName || "Organization unavailable"}</Link> : <p className="text-xs font-medium leading-5 text-slate-300">Platform-wide</p>}
                            <p className="mt-1.5 block max-w-full truncate text-[11px] leading-4 text-slate-400" title={log.reason || "No reason recorded"}>{log.reason || "No reason recorded"}</p>
                          </td>
                        </tr>
                        {expanded && <tr id={`audit-detail-${log.id}`} className="bg-[#0c1420]/90"><td colSpan={6} className="p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Audit record details</h3><p className="mt-1 text-xs text-slate-400">Read-only audit evidence.</p></div><p className="max-w-full break-all font-mono text-[10px] leading-4 text-slate-500">Record ID: {log.id}</p></div><div className="grid gap-3 xl:grid-cols-3"><div className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e] p-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a9bbcf]">Before state</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0f1724] p-3 text-xs leading-5 text-slate-200">{stringify(log.beforeState)}</pre></div><div className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e] p-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a9bbcf]">After state</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0f1724] p-3 text-xs leading-5 text-slate-200">{stringify(log.afterState)}</pre></div><div className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e] p-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a9bbcf]">Metadata</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0f1724] p-3 text-xs leading-5 text-slate-200">{stringify(log.metadata)}</pre></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border border-[#29384b] bg-[#111a28] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Actor user ID</p><p className="mt-1 break-all font-mono text-xs text-slate-300">{log.actorUserId || "Not recorded"}</p></div><div className="rounded-lg border border-[#29384b] bg-[#111a28] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Target ID</p><p className="mt-1 break-all font-mono text-xs text-slate-300">{log.targetId || "Not recorded"}</p></div><div className="rounded-lg border border-[#29384b] bg-[#111a28] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Organization ID</p><p className="mt-1 break-all font-mono text-xs text-slate-300">{log.organizationId || "Platform-wide / not recorded"}</p></div><div className="rounded-lg border border-[#29384b] bg-[#111a28] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Recorded time</p><p className="mt-1 text-xs text-slate-300">{formatDate(log.createdAt)}</p></div></div></td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer className="flex flex-col gap-3 border-t border-[#29384b] bg-[#111a28]/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs leading-5 text-slate-400">Showing <span className="font-semibold tabular-nums text-slate-200">{rangeStart}–{rangeEnd}</span> of <span className="font-semibold tabular-nums text-slate-200">{pagination.total.toLocaleString()}</span> matching events</p>
              <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setExpandedLogId(null); setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) })); }} disabled={loading || pagination.page <= 1} className="h-9 rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="min-w-24 text-center text-xs tabular-nums text-slate-400">Page {pagination.page} of {pagination.totalPages}</span><button type="button" onClick={() => { setExpandedLogId(null); setPagination((current) => ({ ...current, page: Math.min(current.totalPages, current.page + 1) })); }} disabled={loading || pagination.page >= pagination.totalPages} className="h-9 rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>
            </footer>
          </section>

          <footer className="mt-6 flex flex-col gap-2 border-t border-[#29384b] py-4 text-xs leading-5 text-[#8b9eb4] sm:flex-row sm:items-center sm:justify-between"><span>HRMS Platform <span className="px-1.5 text-slate-600">·</span> Super Admin Console</span><span>Audit records are read-only in this view.</span></footer>
        </div>
      </main>

      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} items={commandItems} onSelect={selectCommandItem} />
    </div>
  );
}
