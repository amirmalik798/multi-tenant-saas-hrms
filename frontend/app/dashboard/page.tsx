"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { CommandPalette, CommandPaletteTrigger, buildSuperAdminCommandItems, type CommandPaletteItem } from "../components/super-admin/CommandPalette";
import WorkspaceClock from "../components/WorkspaceClock";
import { SuperAdminOrganizationLogo } from "../components/super-admin/SuperAdminImages";
import SuperAdminThemeToggle from "../components/super-admin/SuperAdminThemeToggle";
type AdminUser = {
  email: string;
  role: string;
};
type DashboardStats = {
  totalOrganizations: number;
  activeOrganizations: number;
  pendingSetupOrganizations: number;
  suspendedOrganizations: number;
  archivedOrganizations: number;
  totalUsers: number;
  activeUsers: number;
  platformAdminUsers: number;
  organizationAdminUsers: number;
  hrManagerUsers: number;
  departmentManagerUsers: number;
  employeeUsers: number;
  totalEmployees: number;
  // Returned by the dashboard statistics API.
  pendingInvitations: number;
  monthlyRegistrations: Array<{ month: string; count: number }>;
};
type Organization = {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  status: string;
  created_at: string;
  // Returned by the existing organization-list API.
  organization_admin_email: string | null;
  user_count: number | string;
};
type IconName =
  | "dashboard"
  | "building"
  | "users"
  | "admin"
  | "mail"
  | "message"
  | "activity"
  | "credit-card"
  | "search"
  | "bell"
  | "chevron"
  | "clock"
  | "arrow"
  | "external"
   | "shield"
   | "calendar"
   | "more";
function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="11" width="7" height="10" rx="1.5" />
        <rect x="3" y="14" width="8" height="7" rx="1.5" />
      </>
    ),
    building: (
      <>
        <rect x="4" y="2.5" width="16" height="19" rx="2" />
        <path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    admin: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M19 8v6m-3-3h6" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    message: <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    "credit-card": (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M7 15h3" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: (
      <>
        <path d="M7 17 17 7M7 7h10v10" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7M21 3 11 13" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    more: (
      <>
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
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
      {paths[name]}
    </svg>
  );
}
function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const difference = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(difference / 60_000);
  const hours = Math.floor(difference / 3_600_000);
  const days = Math.floor(difference / 86_400_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}
function getStatusStyle(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    case "PENDING_SETUP":
      return "bg-amber-500/10 text-amber-300 ring-amber-400/20";
    case "SUSPENDED":
      return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
    default:
      return "bg-white/[0.06] text-slate-300 ring-white/10";
  }
}
function getStatusDotStyle(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "PENDING_SETUP":
      return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]";
    case "SUSPENDED":
      return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]";
    default:
      return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
  }
}
function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [statsData, setStatsData] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [organizationsError, setOrganizationsError] = useState("");
  const hasLoadedOrganizationsRef = useRef(false);
  const hasLoadedRecentOrganizationsRef = useRef(false);
  const dashboardRequestsInFlightRef = useRef(0);
  // Dedicated server-paginated list for the Recent Organizations panel. Keep the
  // broader dashboard organization data separate for charts and command search.
  const [recentOrganizations, setRecentOrganizations] = useState<Organization[]>([]);
  const [recentOrganizationsLoading, setRecentOrganizationsLoading] = useState(true);
  const [recentOrganizationsError, setRecentOrganizationsError] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [recentOrganizationsPage, setRecentOrganizationsPage] = useState(1);
  const [recentOrganizationsTotal, setRecentOrganizationsTotal] = useState(0);
  const [recentOrganizationsTotalPages, setRecentOrganizationsTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const lastAutoRefreshAtRef = useRef(Date.now());
  const [statusActionOrganization, setStatusActionOrganization] = useState<Organization | null>(null);
  const [statusConfirmationSlug, setStatusConfirmationSlug] = useState("");
  const [statusUpdatingOrganizationId, setStatusUpdatingOrganizationId] = useState<string | null>(null);
  const [statusActionError, setStatusActionError] = useState("");
  const [statusActionNotice, setStatusActionNotice] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const statusDialogRef = useRef<HTMLDivElement>(null);
  const statusConfirmationInputRef = useRef<HTMLInputElement>(null);
  const statusConfirmButtonRef = useRef<HTMLButtonElement>(null);
  // Keep the existing Super Admin session verification.
  useEffect(() => {
    let isActive = true;
    async function verifySession() {
      try {
        const response = await fetch("/api/backend/auth/me", {
          cache: "no-store",
        });
        if (!response.ok) {
          router.replace("/");
          return;
        }
        const data = await response.json();
        if (isActive) setUser(data.user ?? null);
      } catch {
        if (isActive) router.replace("/");
      } finally {
        if (isActive) setChecking(false);
      }
    }
    void verifySession();
    return () => {
      isActive = false;
    };
  }, [router]);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  // Keep dashboard data fresh without a manual refresh control. Poll only while
  // visible, and coalesce focus/visibility events to avoid duplicate requests.
  useEffect(() => {
    if (!user) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || dashboardRequestsInFlightRef.current > 0) return;
      const now = Date.now();
      if (now - lastAutoRefreshAtRef.current < 30_000) return;
      lastAutoRefreshAtRef.current = now;
      setReloadKey((value) => value + 1);
    };
    const intervalId = window.setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let isActive = true;
    async function loadStats() {
      dashboardRequestsInFlightRef.current += 1;
      try {
        const response = await fetch("/api/backend/dashboard/stats", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error("Could not load dashboard statistics.");
        const data = await response.json();
        if (!data.stats) throw new Error("The statistics response was invalid.");
        if (isActive) {
          setStatsData(data.stats);
          setStatsError(false);
        }
      } catch (error) {
        console.error("Dashboard statistics error:", error);
        if (isActive) setStatsError(true);
      } finally {
        dashboardRequestsInFlightRef.current = Math.max(0, dashboardRequestsInFlightRef.current - 1);
      }
    }
    void loadStats();
    return () => {
      isActive = false;
    };
  }, [user, router, reloadKey]);
  useEffect(() => {
    if (!user) return;
    let isActive = true;
    async function loadOrganizations() {
      dashboardRequestsInFlightRef.current += 1;
      if (isActive && !hasLoadedOrganizationsRef.current) setOrganizationsLoading(true);
      try {
        const response = await fetch("/api/backend/organizations", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error("Could not load organizations.");
        const data = await response.json();
        const items = Array.isArray(data) ? data : data.organizations;
        if (!Array.isArray(items)) throw new Error("The organizations response was invalid.");
        if (isActive) {
          setOrganizations(items);
          setOrganizationsError("");
          hasLoadedOrganizationsRef.current = true;
        }
      } catch (error) {
        console.error("Organizations loading error:", error);
        if (isActive) {
          setOrganizationsError(error instanceof Error ? error.message : "Could not load organizations.");
          hasLoadedOrganizationsRef.current = true;
        }
      } finally {
        dashboardRequestsInFlightRef.current = Math.max(0, dashboardRequestsInFlightRef.current - 1);
        if (isActive) setOrganizationsLoading(false);
      }
    }
    void loadOrganizations();
    return () => {
      isActive = false;
    };
  }, [user, router, reloadKey]);
  // Load the complete organization directory through the existing authenticated,
  // server-filtered API, one page at a time. This avoids silently limiting the
  // dashboard panel to the first 100 organizations.
  useEffect(() => {
    if (!user) return;
    let isActive = true;

    async function loadRecentOrganizations() {
      dashboardRequestsInFlightRef.current += 1;
      if (!hasLoadedRecentOrganizationsRef.current) setRecentOrganizationsLoading(true);
      setRecentOrganizationsError("");
      try {
        const query = new URLSearchParams({
          page: String(recentOrganizationsPage),
          pageSize: "10",
          search: debouncedSearchQuery,
          status: "ALL",
        });
        const response = await fetch(`/api/backend/organizations?${query.toString()}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error("Could not load organizations.");
        const data = await response.json();
        if (!Array.isArray(data.organizations)) {
          throw new Error("The organizations response was invalid.");
        }
        if (!isActive) return;
        setRecentOrganizations(data.organizations);
        hasLoadedRecentOrganizationsRef.current = true;
        setRecentOrganizationsTotal(Number(data.pagination?.total ?? data.organizations.length));
        setRecentOrganizationsTotalPages(Math.max(1, Number(data.pagination?.totalPages ?? 1)));
      } catch (error) {
        console.error("Recent organizations loading error:", error);
        if (isActive) {
          setRecentOrganizationsError(
            error instanceof Error ? error.message : "Could not load organizations.",
          );
        }
      } finally {
        dashboardRequestsInFlightRef.current = Math.max(0, dashboardRequestsInFlightRef.current - 1);
        if (isActive) {
          hasLoadedRecentOrganizationsRef.current = true;
          setRecentOrganizationsLoading(false);
        }
      }
    }

    void loadRecentOrganizations();
    return () => {
      isActive = false;
    };
  }, [user, router, reloadKey, recentOrganizationsPage, debouncedSearchQuery]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/auth/logout", {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setLogoutError(
        error instanceof Error ? error.message : "Could not log out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  }
  const commandItems = useMemo(
    () => buildSuperAdminCommandItems(organizations),
    [organizations],
  );

  const selectCommandItem = useCallback((item: CommandPaletteItem) => {
    if (item.disabled || !item.href) return;
    setCommandPaletteOpen(false);
    router.push(item.href);
  }, [router]);

  const closeStatusDialog = useCallback(() => {
    if (statusUpdatingOrganizationId) return;
    setStatusActionOrganization(null);
    setStatusConfirmationSlug("");
    setStatusActionError("");
  }, [statusUpdatingOrganizationId]);

  async function handleConfirmOrganizationStatusChange() {
    const organization = statusActionOrganization;
    if (!organization || statusUpdatingOrganizationId) return;

    const isSuspending = organization.status === "ACTIVE";
    const nextStatus = isSuspending ? "SUSPENDED" : "ACTIVE";
    const actionLabel = isSuspending ? "suspend" : "reactivate";
    if (isSuspending && statusConfirmationSlug.trim() !== organization.slug.trim()) {
      setStatusActionError("Enter the organization's slug exactly to confirm suspension.");
      return;
    }

    setStatusUpdatingOrganizationId(organization.id);
    setStatusActionError("");
    setStatusActionNotice("");

    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(organization.id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setCommandPaletteOpen(false);
        setStatusActionOrganization(null);
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || `Failed to ${actionLabel} organization.`);
      }

      const savedStatus = data.organization?.status;
      if (savedStatus !== "ACTIVE" && savedStatus !== "SUSPENDED") {
        throw new Error("The server response did not include a valid saved organization status.");
      }
      setOrganizations((current) =>
        current.map((item) => item.id === organization.id ? { ...item, status: savedStatus } : item),
      );
      setRecentOrganizations((current) =>
        current.map((item) => item.id === organization.id ? { ...item, status: savedStatus } : item),
      );
      setStatsData((current) => {
        if (!current) return current;
        const activeDelta = (savedStatus === "ACTIVE" ? 1 : 0) - (organization.status === "ACTIVE" ? 1 : 0);
        const suspendedDelta = (savedStatus === "SUSPENDED" ? 1 : 0) - (organization.status === "SUSPENDED" ? 1 : 0);
        return {
          ...current,
          activeOrganizations: Math.max(0, current.activeOrganizations + activeDelta),
          suspendedOrganizations: Math.max(0, current.suspendedOrganizations + suspendedDelta),
        };
      });
      setStatusActionNotice(`${organization.name} ${savedStatus === "SUSPENDED" ? "was suspended" : "was reactivated"} successfully.`);
      setReloadKey((value) => value + 1);
      setStatusActionOrganization(null);
      setStatusConfirmationSlug("");
      setStatusActionError("");
    } catch (error) {
      console.error("Organization status update error:", error);
      setStatusActionError(error instanceof Error ? error.message : `Could not ${actionLabel} this organization. Please try again.`);
    } finally {
      setStatusUpdatingOrganizationId(null);
    }
  }

  useEffect(() => {
    if (!statusActionOrganization || statusUpdatingOrganizationId) return;
    function handleStatusDialogEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStatusDialog();
      }
    }
    window.addEventListener("keydown", handleStatusDialogEscape);
    return () => window.removeEventListener("keydown", handleStatusDialogEscape);
  }, [statusActionOrganization, statusUpdatingOrganizationId, closeStatusDialog]);

  useEffect(() => {
    if (!statusActionOrganization) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (statusActionOrganization.status === "ACTIVE") {
      statusConfirmationInputRef.current?.focus();
    } else {
      statusConfirmButtonRef.current?.focus();
    }

    function trapTabKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !statusDialogRef.current) return;
      const focusable = Array.from(statusDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trapTabKey);
    return () => {
      document.removeEventListener("keydown", trapTabKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [statusActionOrganization]);

  const recentActivity = organizations.slice(0, 5);
  const registrationMonths = useMemo(() => {
    return (statsData?.monthlyRegistrations ?? []).map((item) => {
      const [year, month] = item.month.split("-").map(Number);
      const date = new Date(year, month - 1, 1);
      return {
        label: date.toLocaleDateString("en-US", { month: "short" }),
        count: Number(item.count) || 0,
      };
    });
  }, [statsData?.monthlyRegistrations]);
  const maxRegistrationCount = Math.max(0, ...registrationMonths.map((month) => month.count));
  const registrationAxisStep = Math.max(1, Math.ceil(maxRegistrationCount / 3));
  const registrationAxisMax = registrationAxisStep * 3;
  const totalOrganizations = statsData?.totalOrganizations ?? 0;
  const activeOrganizations = statsData?.activeOrganizations ?? 0;
  const pendingSetupOrganizations = statsData?.pendingSetupOrganizations ?? 0;
  const suspendedOrganizations = statsData?.suspendedOrganizations ?? 0;
  const archivedOrganizations = statsData?.archivedOrganizations ?? 0;
  const activeWidth = totalOrganizations > 0 ? (activeOrganizations / totalOrganizations) * 100 : 0;
  const pendingWidth = totalOrganizations > 0 ? (pendingSetupOrganizations / totalOrganizations) * 100 : 0;
  const suspendedWidth = totalOrganizations > 0 ? (suspendedOrganizations / totalOrganizations) * 100 : 0;
  const archivedWidth = totalOrganizations > 0 ? (archivedOrganizations / totalOrganizations) * 100 : 0;
  const totalUsers = statsData?.totalUsers ?? 0;
  const activeUsers = statsData?.activeUsers ?? 0;
  const platformAdminUsers = statsData?.platformAdminUsers ?? 0;
  const organizationAdminUsers = statsData?.organizationAdminUsers ?? 0;
  const hrManagerUsers = statsData?.hrManagerUsers ?? 0;
  const departmentManagerUsers = statsData?.departmentManagerUsers ?? 0;
  const employeeUsers = statsData?.employeeUsers ?? 0;
  const totalEmployees = statsData?.totalEmployees ?? 0;
  const classifiedUsers = platformAdminUsers + organizationAdminUsers + hrManagerUsers + departmentManagerUsers + employeeUsers;
  const unclassifiedUsers = Math.max(0, totalUsers - classifiedUsers);
  const inactiveUsers = Math.max(0, totalUsers - activeUsers);
  const platformAdminEnd = totalUsers > 0 ? (platformAdminUsers / totalUsers) * 100 : 0;
  const organizationAdminEnd = totalUsers > 0
    ? ((platformAdminUsers + organizationAdminUsers) / totalUsers) * 100
    : 0;
  const hrManagerEnd = totalUsers > 0
    ? ((platformAdminUsers + organizationAdminUsers + hrManagerUsers) / totalUsers) * 100
    : 0;
  const departmentManagerEnd = totalUsers > 0
    ? ((platformAdminUsers + organizationAdminUsers + hrManagerUsers + departmentManagerUsers) / totalUsers) * 100
    : 0;
  const employeeEnd = totalUsers > 0
    ? (classifiedUsers / totalUsers) * 100
    : 0;
  const userDistributionDonut = `conic-gradient(
    #1677ff 0% ${platformAdminEnd}%,
    #8b5cf6 ${platformAdminEnd}% ${organizationAdminEnd}%,
    #06b6d4 ${organizationAdminEnd}% ${hrManagerEnd}%,
    #f59e0b ${hrManagerEnd}% ${departmentManagerEnd}%,
    #10b981 ${departmentManagerEnd}% ${employeeEnd}%,
    #64748b ${employeeEnd}% 100%
  )`;
  const pendingInvitationsValue = statsError
    ? "Unavailable"
    : statsData?.pendingInvitations !== undefined
      ? statsData.pendingInvitations.toLocaleString()
      : "—";
  const metrics = [
    {
      label: "Total Organizations",
      value: statsError ? "Unavailable" : statsData ? totalOrganizations.toLocaleString() : "Loading...",
      icon: "building" as const,
      iconStyle: "bg-blue-500/15 text-blue-300",
    },
    {
      label: "Total Users",
      value: statsError ? "Unavailable" : statsData ? totalUsers.toLocaleString() : "Loading...",
      icon: "users" as const,
      iconStyle: "bg-emerald-500/15 text-emerald-300",
    },
    {
      label: "Organization Admins",
      value: statsError ? "Unavailable" : statsData ? organizationAdminUsers.toLocaleString() : "Loading...",
      icon: "admin" as const,
      iconStyle: "bg-violet-500/15 text-violet-300",
    },
    {
      label: "Pending Invitations",
      value: pendingInvitationsValue,
      icon: "mail" as const,
      iconStyle: "bg-orange-500/15 text-orange-300",
    },
  ];
  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17]">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#182232]/90 px-6 py-5 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-300">Verifying your admin session...</p>
        </div>
      </main>
    );
  }
  if (!user) return null;
  const navItems: { label: string; icon: IconName; href?: string }[] = [
    { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
    { label: "Organizations", icon: "building", href: "/dashboard/organizations" },
    { label: "Organization Admins", icon: "admin", href: "/dashboard/organization-admins" },
    { label: "Payments", icon: "credit-card", href: "/dashboard/payments" },
    { label: "Invitations", icon: "mail", href: "/dashboard/invitations" },
    { label: "Platform Support", icon: "message", href: "/dashboard/support" },
    { label: "System Health", icon: "activity", href: "/dashboard/system-health" },
    { label: "Audit Logs", icon: "shield", href: "/dashboard/audit-logs" },
  ];
  // Exact match for Dashboard; nested routes keep their parent section active.
  const isNavItemActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div data-super-admin-dashboard className="min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark" style={{ backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)", backgroundSize: "auto, 42px 42px, 42px 42px" }}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#29384b] bg-[#0f1724] text-white lg:flex">
        <Link href="/dashboard" className="flex h-[86px] items-center gap-3 border-b border-[#29384b] px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Icon name="shield" size={23} />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">HRMS Platform</span>
            <span className="mt-0.5 block text-sm text-slate-300">Super Admin</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
          {navItems.map((item) => {
            const active = Boolean(item.href && isNavItemActive(item.href));
            const classes = `flex h-[49px] items-center gap-3 rounded-lg px-3.5 text-[15px] transition ${
              active
                ? "border border-blue-300/10 border-l-2 border-l-[#75c7ff] bg-[#14283e] pl-[calc(0.875rem-2px)] font-semibold text-[#e3f2ff] shadow-sm shadow-black/10"
                : item.href
                  ? "border border-transparent font-medium text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-white"
                  : "cursor-default font-medium text-slate-400"
            }`;
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={classes}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} size={21} />
                <span>{item.label}</span>
              </Link>
            ) : (
              <div
                key={item.label}
                className={classes}
                aria-disabled="true"
                title={`${item.label} page is not available yet`}
              >
                <Icon name={item.icon} size={21} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </nav>
      
      </aside>
      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-20 flex min-h-[71px] flex-col justify-center border-b border-[#29384b] bg-[#0f1724]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="relative hidden h-[43px] w-full max-w-[482px] sm:block">
              <label htmlFor="dashboard-search" className="sr-only">Search organizations</label>
              <input
                id="dashboard-search"
                type="search"
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setRecentOrganizationsPage(1); }}
                placeholder="Search organizations…"
                className="absolute inset-0 h-[43px] w-full rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-12 pr-[6.5rem] text-sm text-slate-100 outline-none placeholder:text-slate-300 focus:border-[#75c7ff] focus:bg-[#182232] focus:ring-2 focus:ring-[#75c7ff]/20"
              />
              <span className="pointer-events-none absolute left-4 top-[11px] text-slate-300">
                <Icon name="search" size={20} />
              </span>
              <CommandPaletteTrigger onClick={() => setCommandPaletteOpen(true)} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
              <WorkspaceClock />
              <div className="hidden h-9 w-px bg-slate-700/70 sm:block" />
              <SuperAdminThemeToggle />
              <div className="flex items-center gap-3" aria-label="Signed in as Super Admin">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-sm font-bold tracking-wide text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">SA</div>
                <div className="hidden min-w-0 sm:block">
                  <p className="text-sm font-semibold leading-5 text-[#f8fafc]">Super Admin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="ml-1 rounded-lg border border-white/10 bg-[#182232]/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
          <div className="relative mt-3 sm:hidden">
            <label htmlFor="dashboard-search-mobile" className="sr-only">Search organizations</label>
            <input
              id="dashboard-search-mobile"
              type="search"
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setRecentOrganizationsPage(1); }}
              placeholder="Search organizations…"
              className="h-11 w-full rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#75c7ff] focus:bg-[#182232] focus:ring-2 focus:ring-[#75c7ff]/20"
            />
            <span className="pointer-events-none absolute left-3 top-[13px] text-slate-400"><Icon name="search" size={18} /></span>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:hidden" aria-label="Super Admin mobile navigation">
            {navItems.filter((item) => item.href).map((item) => {
              if (!item.href) return null;
              const active = isNavItemActive(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${
                    active
                      ? "border-[#75c7ff]/25 bg-[#18314a] font-semibold text-[#e3f2ff] shadow-sm"
                      : "border-white/10 bg-[#182232]/90 text-slate-200 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon name={item.icon} size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300">
              <p>{logoutError}</p>
              <button type="button" onClick={() => setLogoutError("")} className="font-semibold underline">Dismiss</button>
            </div>
          )}
          <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">Dashboard</h1>
            </div>
          </section>
          {statusActionNotice && (
            <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <p>{statusActionNotice}</p>
              <button type="button" onClick={() => setStatusActionNotice("")} className="font-semibold text-emerald-100 underline">Dismiss</button>
            </div>
          )}
          <section aria-label="Platform overview metrics" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-4">
            {metrics.map((metric) => (
              <article key={metric.label} className="relative flex min-h-[128px] min-w-0 flex-col items-start gap-3 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-4 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-[''] xl:flex-row xl:items-center xl:px-4 2xl:gap-5 2xl:px-6 2xl:py-6">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] 2xl:h-12 2xl:w-12 ${metric.iconStyle}`}>
                  <Icon name={metric.icon} size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.17em] leading-5 text-[#9eafc4]">{metric.label}</p>
                  <p className="mt-2 min-w-0 break-words text-3xl font-bold leading-none tracking-[-0.045em] tabular-nums text-[#f2f7fc] xl:text-[34px]">{metric.value}</p>
                </div>
              </article>
            ))}
          </section>
          <section className="mt-4 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            <article className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl 2xl:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-blue-300"><Icon name="building" size={23} /></span>
                  <h2 className="text-sm font-semibold tracking-tight text-[#d4dfeb]">Organization Growth</h2>
                </div>
                <span className="inline-flex h-8 items-center gap-2 rounded-md border border-[#2a3b50] bg-[#111a28]/70 px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#a9bbcf]">Last 6 months</span>
              </div>
              <div className="mt-6 grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-2">
                <div className="flex h-[150px] flex-col justify-between pb-0 text-right text-[10px] tabular-nums text-[#91a3b8]">
                  {[registrationAxisMax, registrationAxisStep * 2, registrationAxisStep, 0].map((label) => <span key={label}>{label}</span>)}
                </div>
                <div>
                  <div className="relative h-[150px]">
                    <div className="absolute inset-0 flex flex-col justify-between">
                      {[0, 1, 2, 3].map((line) => <div key={line} className="border-t border-white/[0.07]" />)}
                    </div>
                    <div className="absolute inset-0 flex items-end justify-around gap-4 px-3">
                      {registrationMonths.map((month, index) => (
                        <div key={`${month.label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                          <span className={`mb-1 text-[10px] font-semibold tabular-nums ${month.count === maxRegistrationCount && month.count > 0 ? "text-[#b8e3ff]" : "text-[#8299b2]"}`}>{month.count}</span>
                          <div
                            className="w-full max-w-[42px] rounded-t-md border-x border-t border-[#75c7ff]/25 bg-gradient-to-t from-[#24609a]/80 via-[#3189c4]/85 to-[#91d7ff] shadow-[0_0_10px_rgba(77,170,235,0.10)] transition-[height] duration-500 ease-out"
                            style={{ height: month.count === 0 ? "2px" : `${Math.max(5, (month.count / Math.max(1, registrationAxisMax)) * 76)}%` }}
                            title={`${month.label}: ${month.count} organization registrations`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex justify-around gap-4 border-t border-[#29384b] pt-2.5">
                    {registrationMonths.map((month, index) => <span key={`${month.label}-${index}`} className={`flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] tabular-nums ${index === registrationMonths.length - 1 ? "text-[#c2e7ff]" : "text-[#91a3b8]"}`}>{month.label}</span>)}
                  </div>
                </div>
              </div>
            </article>
            <article className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl 2xl:p-6">
              <div className="flex items-center gap-3">
                <span className="text-[#cbd5e1]"><Icon name="users" size={23} /></span>
                <h2 className="text-sm font-semibold tracking-tight text-[#d4dfeb]">User Distribution</h2>
              </div>
              <div className="mt-7 flex min-h-[164px] items-center justify-center gap-5">
                <div
                  className="relative h-[160px] w-[160px] shrink-0 rounded-full ring-1 ring-white/10 shadow-[0_0_18px_rgba(59,130,246,0.08)]"
                  role="img"
                  aria-label={`User distribution: ${platformAdminUsers} Super Admins, ${organizationAdminUsers} Organization Admins, ${hrManagerUsers} HR Managers, ${departmentManagerUsers} Department Managers, ${employeeUsers} Employees, ${unclassifiedUsers} unclassified users`}
                  style={{ background: statsData ? userDistributionDonut : "#263244" }}
                >
                  <div className="absolute inset-[30px] flex flex-col items-center justify-center rounded-full bg-[#111a28]">
                    <span className="text-[25px] font-bold leading-none tracking-tight tabular-nums text-[#f8fafc]">{statsError ? "—" : statsData ? totalUsers.toLocaleString() : "..."}</span>
                    <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Total Users</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  {[
                    { label: "Super Admins", value: platformAdminUsers, color: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.55)]" },
                    { label: "Org Admins", value: organizationAdminUsers, color: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.55)]" },
                    { label: "HR Managers", value: hrManagerUsers, color: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" },
                    { label: "Department Managers", value: departmentManagerUsers, color: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" },
                    { label: "Employees", value: employeeUsers, color: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" },
                    ...(unclassifiedUsers > 0 ? [{ label: "Other", value: unclassifiedUsers, color: "bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.5)]" }] : []),
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-300">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.color}`} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-[#f8fafc]">{statsError ? "—" : statsData ? item.value.toLocaleString() : "..."}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#111a28] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
                    <Icon name="building" size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Total Employees</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-300">
                      Employee records, including Organization Admins
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums text-[#f8fafc]">
                  {statsError ? "—" : statsData ? totalEmployees.toLocaleString() : "..."}
                </p>
              </div>
              {statsError && <p role="alert" className="mt-3 text-xs text-rose-300">User analytics could not be loaded.</p>}
            </article>
            <article className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl 2xl:p-6">
              <div className="flex items-center gap-3">
                <span className="text-[#cbd5e1]"><Icon name="calendar" size={23} /></span>
                <h2 className="text-sm font-semibold tracking-tight text-[#d4dfeb]">Organizations by Status</h2>
              </div>
              <div className="mt-7 rounded-xl border border-[#29384b] bg-[#101a27]/80 p-4 sm:p-5" role="img" aria-label={`Organization lifecycle: ${activeOrganizations} active, ${pendingSetupOrganizations} pending setup, ${suspendedOrganizations} suspended, ${archivedOrganizations} archived`}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fa5be]">Organization portfolio</p>
                    <p className="mt-2 text-4xl font-bold leading-none tracking-[-0.045em] tabular-nums text-[#f2f7fc]">{statsError ? "—" : statsData ? totalOrganizations.toLocaleString() : "..."}</p>
                    
                  </div>
                  <span className="rounded-md border border-[#293f56] bg-[#14263a] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#a7c4df]">Lifecycle</span>
                </div>
                <div className="mt-5 flex h-3.5 w-full overflow-hidden rounded-full border border-white/[0.06] bg-[#243246]" aria-hidden="true">
                  <div className="h-full bg-gradient-to-r from-[#248c73] to-[#5bd1ac] transition-[width] duration-500" style={{ width: statsData ? `${activeWidth}%` : "0%" }} />
                  <div className="h-full bg-gradient-to-r from-[#b58232] to-[#e5bd68] transition-[width] duration-500" style={{ width: statsData ? `${pendingWidth}%` : "0%" }} />
                  <div className="h-full bg-gradient-to-r from-[#ad5367] to-[#e58a97] transition-[width] duration-500" style={{ width: statsData ? `${suspendedWidth}%` : "0%" }} />
                  <div className="h-full bg-gradient-to-r from-[#66758b] to-[#a7b2c1] transition-[width] duration-500" style={{ width: statsData ? `${archivedWidth}%` : "0%" }} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
                  {[
                    { label: "Active", value: activeOrganizations, dot: "bg-[#5bd1ac]", number: "text-[#c1f4e2]" },
                    { label: "Pending setup", value: pendingSetupOrganizations, dot: "bg-[#e5bd68]", number: "text-[#f5deb0]" },
                    { label: "Suspended", value: suspendedOrganizations, dot: "bg-[#e58a97]", number: "text-[#ffd0d7]" },
                    { label: "Archived", value: archivedOrganizations, dot: "bg-[#a7b2c1]", number: "text-[#d1d9e3]" },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 border-t border-[#27374b] pt-3">
                      <p className="flex items-center gap-2 text-xs font-medium text-[#a6b5c8]"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`} />{item.label}</p>
                      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${item.number}`}>{statsError ? "—" : statsData ? item.value.toLocaleString() : "..."}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
          <section className="mt-4 grid gap-4 2xl:grid-cols-[1.8fr_1fr]">
            <article className="min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-5 py-5 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="text-[#cbd5e1]"><Icon name="building" size={23} /></span>
                  <h2 className="text-sm font-semibold tracking-tight text-[#d4dfeb]">Organizations</h2>
                </div>
                <Link href="/dashboard/organizations" className="inline-flex items-center gap-1 text-sm font-medium text-blue-300 hover:text-blue-300">
                  View All <Icon name="arrow" size={14} />
                </Link>
              </div>
              <div className="overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#75c7ff]/30" role="region" aria-label="Recent organizations table" tabIndex={0}>
                <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                  <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-xs font-semibold uppercase tracking-[0.08em] text-[#aebed0]">
                    <tr>
                      <th className="w-[240px] rounded-l-md px-3 py-3.5 font-semibold">Organization</th>
                      <th className="w-[190px] px-3 py-3.5 font-semibold">Organization Admin</th>
                      <th className="w-[130px] px-3 py-3.5 font-semibold">Status</th>
                      <th className="w-[70px] text-center px-3 py-3.5 font-semibold">Users</th>
                      <th className="w-[130px] px-3 py-3.5 font-semibold rounded-r-md">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27384b]/75">
                    {recentOrganizationsLoading ? (
                      <tr><td colSpan={5} className="px-3 text-center text-sm text-slate-300">Loading organizations...</td></tr>
                    ) : recentOrganizationsError ? (
                      <tr><td colSpan={5} className="px-3 text-center text-sm text-rose-300">{recentOrganizationsError}</td></tr>
                    ) : recentOrganizations.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 text-center text-sm text-slate-300">No matching organizations.</td></tr>
                    ) : recentOrganizations.map((organization) => (
                      <tr key={organization.id} className="group transition-colors duration-200 hover:bg-[#14283e]/45 focus-within:bg-[#14283e]/45">
                        <td className="px-3 py-4 align-middle min-w-0">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <SuperAdminOrganizationLogo
                              organizationId={organization.id}
                              name={organization.name}
                              size="md"
                              className="transition-colors duration-200 group-hover:border-[#75c7ff]/30"
                            />
                            <div className="min-w-0">
                              <span className="block max-w-[180px] truncate text-sm font-semibold text-[#f8fafc] transition-colors duration-200 group-hover:text-white">{organization.name}</span>
                              <span className="mt-0.5 block max-w-[180px] truncate text-xs text-slate-300">{organization.slug}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-label={`Actions for ${organization.name}`}>
                            <Link
                              href={`/dashboard/organizations?organizationId=${encodeURIComponent(organization.id)}&panel=view`}
                              title="View organization details"
                              className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#75c7ff]/25 bg-[#75c7ff]/[0.07] px-2.5 py-1.5 text-[11px] font-semibold text-[#9ed5ff] transition-all duration-200 hover:border-[#75c7ff]/50 hover:bg-[#75c7ff]/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                            >
                              View details <Icon name="arrow" size={11} />
                            </Link>
                            {organization.status?.toUpperCase() === "ARCHIVED" ? (
                              <span
                                className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border border-slate-400/15 bg-slate-500/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-slate-400"
                                title="Archived organizations are read-only."
                              >
                                Read-only
                              </span>
                            ) : (
                              <Link
                                href={`/dashboard/organizations?organizationId=${encodeURIComponent(organization.id)}&panel=edit`}
                                className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] px-2.5 py-1.5 text-[11px] font-semibold text-[#d3deeb] transition-colors hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                              >
                                Edit
                              </Link>
                            )}
                            {organization.status === "ACTIVE" || organization.status === "SUSPENDED" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setStatusActionOrganization(organization);
                                  setStatusConfirmationSlug("");
                                  setStatusActionError("");
                                  setStatusActionNotice("");
                                }}
                                disabled={statusUpdatingOrganizationId === organization.id}
                                title={organization.status === "ACTIVE" ? "Suspend organization" : "Reactivate organization"}
                                aria-label={`${organization.status === "ACTIVE" ? "Suspend" : "Reactivate"} ${organization.name}`}
                                className={`inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] disabled:cursor-not-allowed disabled:opacity-60 ${
                                  organization.status === "ACTIVE"
                                    ? "border-rose-400/20 bg-rose-500/[0.06] text-rose-300 hover:border-rose-300/35 hover:bg-rose-500/10"
                                    : "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-300 hover:border-emerald-300/35 hover:bg-emerald-500/10"
                                }`}
                              >
                                {statusUpdatingOrganizationId === organization.id
                                  ? "Updating…"
                                  : organization.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                              </button>
                            ) : (
                              <span
                                className={`inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                                  organization.status?.toUpperCase() === "ARCHIVED"
                                    ? "border-slate-400/15 bg-slate-500/[0.05] text-slate-400"
                                    : "border-amber-300/15 bg-amber-400/[0.04] text-amber-200/70"
                                }`}
                                title={organization.status?.toUpperCase() === "ARCHIVED" ? "Archived organizations are read-only." : "Organization setup must be completed before changing its status."}
                              >
                                {organization.status?.toUpperCase() === "ARCHIVED" ? "Archived" : "Setup first"}
                              </span>
                            )}
                            <Link
                              href={`/dashboard/organizations/${encodeURIComponent(organization.id)}`}
                              aria-label={organization.status === "PENDING_SETUP"
                                ? `Open invitation setup for ${organization.name}`
                                : `Open full details for ${organization.name}`}
                              title={organization.status === "PENDING_SETUP" ? "Invite administrator" : "Open full organization details"}
                              className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] px-2.5 py-1.5 text-[11px] font-semibold text-[#b9c7d8] transition hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                            >
                              {organization.status === "PENDING_SETUP" ? "Invite Admin" : "Full details"}
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle min-w-0">
                          <span className="block max-w-[175px] truncate text-[#cbd5e1]" title={organization.organization_admin_email || "No linked Organization Admin account"}>
                            {organization.organization_admin_email || "Not assigned"}
                          </span>
                        </td>
                        <td className="px-3 py-4 align-middle min-w-0">
                          <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusStyle(organization.status)}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStatusDotStyle(organization.status)}`} />
                            {formatStatus(organization.status)}
                          </span>
                        </td>
                        <td className="px-3 py-4 align-middle min-w-0 text-center font-medium tabular-nums text-[#cbd5e1]">{organization.user_count == null ? "—" : Number(organization.user_count).toLocaleString()}</td>
                        <td className="px-3 py-4 align-middle whitespace-nowrap tabular-nums text-[#cbd5e1]">{formatDate(organization.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span>
                  {recentOrganizationsLoading
                    ? "Loading records…"
                    : `Showing ${recentOrganizationsTotal === 0 ? 0 : (recentOrganizationsPage - 1) * 10 + 1}–${Math.min(recentOrganizationsPage * 10, recentOrganizationsTotal)} of ${recentOrganizationsTotal} organizations`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecentOrganizationsPage((page) => Math.max(1, page - 1))}
                    disabled={recentOrganizationsLoading || recentOrganizationsPage <= 1}
                    className="rounded-lg border border-white/10 px-3 py-2 font-medium text-slate-200 transition hover:border-[#75c7ff]/35 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="min-w-[84px] text-center tabular-nums">
                    Page {recentOrganizationsPage} of {recentOrganizationsTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecentOrganizationsPage((page) => Math.min(recentOrganizationsTotalPages, page + 1))}
                    disabled={recentOrganizationsLoading || recentOrganizationsPage >= recentOrganizationsTotalPages}
                    className="rounded-lg border border-white/10 px-3 py-2 font-medium text-slate-200 transition hover:border-[#75c7ff]/35 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </article>
            <article className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-5 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[#cbd5e1]"><Icon name="clock" size={23} /></span>
                  <h2 className="text-sm font-semibold tracking-tight text-[#d4dfeb]">Recent Registrations</h2>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">Latest</span>
              </div>
              <div className="mt-4">
                {organizationsLoading && organizations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-300">Loading registrations...</p>
                ) : organizationsError ? (
                  <p role="alert" className="py-8 text-center text-sm text-rose-300">{organizationsError}</p>
                ) : recentActivity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-300">No recent organization registrations.</p>
                ) : (
                  <div className="relative ml-2 border-l border-[#31445b] pl-5">
                    {recentActivity.map((organization) => (
                      <div key={`activity-${organization.id}`} className="relative flex items-start gap-3 py-3 first:pt-1 last:pb-1">
                        <span className="absolute -left-[25px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-[#141f2e] bg-[#75c7ff] shadow-[0_0_0_3px_rgba(117,199,255,0.08)]" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-5 text-[#edf4fb]">Organization registered</p>
                          <p className="mt-0.5 truncate text-xs text-[#9fb0c4]" title={organization.name}>{organization.name}</p>
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#6f89a4]">{formatDate(organization.created_at)}</p>
                        </div>
                        <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[#a7b7ca]">{formatRelativeTime(organization.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </section>
        </div>

        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          items={commandItems}
          onSelect={selectCommandItem}
          blocked={Boolean(statusActionOrganization)}
        />

        {statusActionOrganization && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeStatusDialog();
            }}
          >
            <div
              ref={statusDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="organization-status-dialog-title"
              aria-describedby="organization-status-dialog-description"
              tabIndex={-1}
              className={`w-full max-w-lg rounded-2xl border bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] sm:p-6 ${statusActionOrganization.status === "ACTIVE" ? "border-rose-400/30" : "border-emerald-400/25"}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${statusActionOrganization.status === "ACTIVE" ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                  <Icon name="shield" size={23} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Guarded organization action</p>
                  <h2 id="organization-status-dialog-title" className="mt-1 text-xl font-bold tracking-tight text-white">
                    {statusActionOrganization.status === "ACTIVE" ? "Suspend organization?" : "Reactivate organization?"}
                  </h2>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-200">{statusActionOrganization.name}</p>
                </div>
              </div>

              {statusActionOrganization.status === "ACTIVE" ? (
                <div id="organization-status-dialog-description" className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                  <p>Suspending this organization will block access through the platform&apos;s organization-status checks. Its data will remain in place.</p>
                  <p className="rounded-lg border border-amber-400/20 bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-5 text-amber-100/90">Organization-admin authentication is rejected when an organization is suspended. This status action does not itself purge every employee session cookie, so it should not be treated as a guaranteed immediate revocation of every existing session.</p>
                  <label htmlFor="confirm-organization-slug" className="block pt-1 text-xs font-semibold text-slate-200">Type this organization&apos;s slug to confirm: <span className="text-rose-200">{statusActionOrganization.slug}</span></label>
                  <input
                    ref={statusConfirmationInputRef}
                    id="confirm-organization-slug"
                    type="text"
                    autoComplete="off"
                    value={statusConfirmationSlug}
                    onChange={(event) => {
                      setStatusConfirmationSlug(event.target.value);
                      setStatusActionError("");
                    }}
                    placeholder={statusActionOrganization.slug}
                    className="h-11 w-full rounded-lg border border-white/15 bg-[#0f1724] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-4 focus:ring-rose-500/10"
                  />
                </div>
              ) : (
                <p id="organization-status-dialog-description" className="mt-5 text-sm leading-6 text-slate-300">This will restore the organization&apos;s status to ACTIVE so its users can regain access, subject to their account status and sign-in/session checks.</p>
              )}

              {statusActionError && <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{statusActionError}</p>}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeStatusDialog}
                  disabled={Boolean(statusUpdatingOrganizationId)}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  ref={statusConfirmButtonRef}
                  type="button"
                  onClick={() => void handleConfirmOrganizationStatusChange()}
                  disabled={Boolean(statusUpdatingOrganizationId) || (statusActionOrganization.status === "ACTIVE" && statusConfirmationSlug.trim() !== statusActionOrganization.slug.trim())}
                  className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${statusActionOrganization.status === "ACTIVE" ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"}`}
                >
                  {statusUpdatingOrganizationId === statusActionOrganization.id
                    ? "Updating organization…"
                    : statusActionOrganization.status === "ACTIVE" ? "Confirm suspension" : "Confirm reactivation"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
