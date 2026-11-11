"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CommandPalette,
  CommandPaletteTrigger,
  buildSuperAdminCommandItems,
  type CommandPaletteItem,
  type CommandPaletteOrganization,
} from "../../components/super-admin/CommandPalette";
import { SuperAdminOrganizationLogo } from "../../components/super-admin/SuperAdminImages";

import SuperAdminThemeToggle from "../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../components/WorkspaceClock";
type Organization = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
};

type AdminUser = {
  email: string;
  role: string;
};

type InvitationApiRecord = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type Invitation = InvitationApiRecord & {
  organization_id: string;
  organization_name: string;
  display_status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "OTHER";
};

type FilterStatus = "ALL" | Invitation["display_status"];

type IconName =
  | "dashboard"
  | "building"
  | "admin"
  | "mail"
  | "message"
  | "activity"
  | "search"
  | "bell"
  | "chevron"
  | "clock"
  | "calendar"
  | "refresh"
  | "arrow"
  | "shield"
  | "filter"
  | "credit-card";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
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
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M20 12a8 8 0 1 0 2 5" />
      </>
    ),
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    "credit-card": (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M7 15h3" />
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resolveStatus(
  status: string,
  expiresAt: string,
): Invitation["display_status"] {
  const normalized = status.trim().toUpperCase();

  if (normalized === "PENDING" && new Date(expiresAt).getTime() <= Date.now()) {
    return "EXPIRED";
  }

  if (
    normalized === "PENDING" ||
    normalized === "ACCEPTED" ||
    normalized === "EXPIRED" ||
    normalized === "REVOKED"
  ) {
    return normalized;
  }

  return "OTHER";
}

function statusLabel(status: Invitation["display_status"]) {
  if (status === "OTHER") return "Unknown";

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function statusClasses(status: Invitation["display_status"]) {
  switch (status) {
    case "PENDING":
      return "bg-amber-500/10 text-amber-300 ring-amber-400/25";
    case "ACCEPTED":
      return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25";
    case "EXPIRED":
      return "bg-white/[0.06] text-slate-300 ring-white/10";
    case "REVOKED":
      return "bg-rose-500/10 text-rose-300 ring-rose-400/25";
    default:
      return "bg-white/[0.06] text-slate-300 ring-white/10";
  }
}

function getInvitationStatusDotStyle(status: Invitation["display_status"]) {
  switch (status) {
    case "PENDING":
      return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]";
    case "ACCEPTED":
      return "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "REVOKED":
      return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]";
    case "EXPIRED":
      return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
    default:
      return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
  }
}

export default function InvitationsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [invitationsPage, setInvitationsPage] = useState(1);
  const [invitationsTotal, setInvitationsTotal] = useState(0);
  const [invitationsTotalPages, setInvitationsTotalPages] = useState(1);
  const [invitationSummary, setInvitationSummary] = useState({ total: 0, pending: 0, accepted: 0, closed: 0 });

  const [reloadKey, setReloadKey] = useState(0);
  const refreshInFlightRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const hasPayloadRef = useRef(false);
  const lastSuccessfulRefreshRef = useRef(0);
  const revocationDialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOrganizations, setPaletteOrganizations] = useState<
    CommandPaletteOrganization[]
  >([]);

  const [revocationTarget, setRevocationTarget] = useState<Invitation | null>(
    null,
  );
  const [revocationReason, setRevocationReason] = useState("");
  const [revocationError, setRevocationError] = useState("");
  const [revocationLoading, setRevocationLoading] = useState(false);

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
      }
    }

    void verifySession();

    return () => {
      isActive = false;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/backend/auth/logout", {
        method: "POST",
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message || "Logout failed.");
      }

      router.replace("/");
      router.refresh();
    } catch (logoutFailure) {
      console.error("Logout error:", logoutFailure);

      setLogoutError(
        logoutFailure instanceof Error
          ? logoutFailure.message
          : "Could not log out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  // Load the organization index independently. Invitation searches and
  // pagination should not repeatedly fetch the same navigation data.
  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    async function loadOrganizationsForPalette() {
      try {
        const response = await fetch("/api/backend/organizations?page=1&pageSize=100", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error("Could not load organizations for navigation.");
        const data = await response.json();
        const organizations: Organization[] = Array.isArray(data)
          ? data
          : data.organizations;
        if (!Array.isArray(organizations)) {
          throw new Error("The organizations response was invalid.");
        }
        const indexedOrganizations: CommandPaletteOrganization[] = organizations
          .filter((organization): organization is Organization & { slug: string; status: string } =>
            typeof organization?.id === "string" &&
            typeof organization?.name === "string" &&
            typeof organization?.slug === "string" &&
            typeof organization?.status === "string")
          .map((organization) => ({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            status: organization.status,
          }));
        if (isActive) setPaletteOrganizations(indexedOrganizations);
      } catch (caught) {
        if (!controller.signal.aborted) {
          console.error("Could not load Super Admin command-palette organizations:", caught);
        }
      }
    }

    void loadOrganizationsForPalette();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [router]);

  // Debounce text entry so a fast typist does not trigger a request per key.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchDraft.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchDraft]);

  const loadInvitations = useCallback(async () => {
    refreshInFlightRef.current = true;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestSequence = ++requestSequenceRef.current;
    const hasExistingData = hasPayloadRef.current;

    if (!hasExistingData) {
      setLoading(true);
    }
    setError("");

    try {
      const query = new URLSearchParams({
        page: String(invitationsPage),
        pageSize: "25",
        search: searchQuery,
        status: filterStatus,
      });
      const response = await fetch(`/api/backend/platform-invitations?${query.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== "ok" || !Array.isArray(data.invitations)) {
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Could not load invitation records.",
        );
      }
      if (requestSequence !== requestSequenceRef.current) return;

      const rows = (data.invitations as (InvitationApiRecord & {
        organization_id: string;
        organization_name: string;
      })[]).map((invitation) => ({
        ...invitation,
        display_status: resolveStatus(invitation.status, invitation.expires_at),
      } satisfies Invitation));

      setInvitations(rows);
      setInvitationsTotal(Number(data.pagination?.total ?? rows.length));
      setInvitationsTotalPages(Math.max(1, Number(data.pagination?.totalPages ?? 1)));
      const summary = data.summary || {};
      setInvitationSummary({
        total: Number(summary.total || 0),
        pending: Number(summary.pending || 0),
        accepted: Number(summary.accepted || 0),
        closed: Number(summary.expired || 0) + Number(summary.revoked || 0),
      });
      hasPayloadRef.current = true;
      lastSuccessfulRefreshRef.current = Date.now();
      setError("");
    } catch (caught) {
      if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load invitation records.");
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
        refreshInFlightRef.current = false;
      }
    }
  }, [filterStatus, invitationsPage, router, searchQuery]);

  useEffect(() => {
    void loadInvitations();
    return () => {
      requestControllerRef.current?.abort();
    };
  }, [loadInvitations, reloadKey]);

  // Keep the registry reasonably fresh without requiring manual refreshes.
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || refreshInFlightRef.current) return;
      const lastRefresh = lastSuccessfulRefreshRef.current;
      if (lastRefresh === 0 || Date.now() - lastRefresh >= 60_000) {
        refreshInFlightRef.current = true;
        void loadInvitations();
      }
    };
    const intervalId = window.setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [loadInvitations]);

  // Give the destructive-action dialog predictable keyboard and focus behavior.
  useEffect(() => {
    if (!revocationTarget) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusFirst = () => {
      const first = revocationDialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? revocationDialogRef.current)?.focus();
    };
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!revocationLoading) {
          event.preventDefault();
          closeRevocationDialog();
        }
        return;
      }
      if (event.key !== "Tab" || !revocationDialogRef.current) return;
      const focusable = Array.from(
        revocationDialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        revocationDialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [revocationTarget?.id, revocationLoading]);


  function openRevocationDialog(invitation: Invitation) {
    setRevocationTarget(invitation);
    setRevocationReason("");
    setRevocationError("");
  }

  function closeRevocationDialog() {
    if (revocationLoading) return;

    setRevocationTarget(null);
    setRevocationReason("");
    setRevocationError("");
  }

  async function handleConfirmRevocation() {
    const target = revocationTarget;
    const reason = revocationReason.trim();

    if (!target || revocationLoading) return;

    if (reason.length < 3 || reason.length > 1000) {
      setRevocationError(
        "Enter a revocation reason between 3 and 1000 characters.",
      );
      return;
    }

    setRevocationError("");
    setRevocationLoading(true);

    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(
          target.organization_id,
        )}/invitations`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitationId: target.id, reason }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        router.replace("/");
        return;
      }

      if (!response.ok) {
        setReloadKey((key) => key + 1);
        throw new Error(data.message || "Failed to revoke invitation.");
      }

      const revokedAt = data.invitation?.revokedAt ?? new Date().toISOString();

      setInvitations((current) =>
        current.map((invitation) =>
          invitation.id === target.id
            ? {
                ...invitation,
                status: "REVOKED",
                revoked_at: revokedAt,
                display_status: "REVOKED",
              }
            : invitation,
        ),
      );

      setRevocationTarget(null);
      setRevocationReason("");
      setRevocationError("");
      setReloadKey((key) => key + 1);
    } catch (revocationFailure) {
      setRevocationError(
        revocationFailure instanceof Error
          ? revocationFailure.message
          : "Could not revoke this invitation.",
      );
    } finally {
      setRevocationLoading(false);
    }
  }

  const commandItems = useMemo(
    () => buildSuperAdminCommandItems(paletteOrganizations),
    [paletteOrganizations],
  );

  const selectCommandItem = useCallback(
    (item: CommandPaletteItem) => {
      if (item.disabled || !item.href) return;

      setCommandPaletteOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const filteredInvitations = invitations;

  const counts = invitationSummary;

  const isNavItemActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const navItems: { label: string; icon: IconName; href?: string }[] = [
    { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
    {
      label: "Organizations",
      icon: "building",
      href: "/dashboard/organizations",
    },
    {
      label: "Organization Admins",
      icon: "admin",
      href: "/dashboard/organization-admins",
    },
    {
      label: "Payments",
      icon: "credit-card",
      href: "/dashboard/payments",
    },
    {
      label: "Invitations",
      icon: "mail",
      href: "/dashboard/invitations",
    },
    { label: "Platform Support", icon: "message", href: "/dashboard/support" },
    { label: "System Health", icon: "activity", href: "/dashboard/system-health" },
    {
      label: "Audit Logs",
      icon: "shield",
      href: "/dashboard/audit-logs",
    },
  ];

  const statCards = [
    {
      label: "Total invitations",
      value: counts.total,
      description: "Across listed organizations",
      tone: "bg-blue-500/10 text-blue-300",
      icon: "mail" as const,
    },
    {
      label: "Pending",
      value: counts.pending,
      description: "Awaiting acceptance",
      tone: "bg-amber-500/10 text-amber-300",
      icon: "clock" as const,
    },
    {
      label: "Accepted",
      value: counts.accepted,
      description: "Account setup completed",
      tone: "bg-emerald-500/10 text-emerald-300",
      icon: "admin" as const,
    },
    {
      label: "Expired or revoked",
      value: counts.closed,
      description: "No longer usable",
      tone: "bg-white/[0.06] text-slate-300",
      icon: "calendar" as const,
    },
  ];

  return (
    <div
      className="sa-invitations-page min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark"
      style={{
        backgroundImage:
          "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)",
        backgroundSize: "auto, 42px 42px, 42px 42px",
      }}
    >
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#29384b] bg-[#0f1724] text-white lg:flex">
        <Link
          href="/dashboard"
          className="flex h-[86px] items-center gap-3 border-b border-[#29384b] px-6"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Icon name="shield" size={23} />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">
              HRMS Platform
            </span>
            <span className="mt-0.5 block text-sm text-slate-300">
              Super Admin
            </span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
          {navItems.map((item) => {
            const active = Boolean(
              item.href && isNavItemActive(item.href),
            );

            const classes = `flex h-[49px] items-center gap-3 rounded-lg px-3.5 text-[15px] transition ${
              active
                ? "border border-blue-300/10 border-l-2 border-l-[#75c7ff] bg-[#14283e] pl-[calc(0.875rem-2px)] font-semibold text-[#e3f2ff] shadow-sm shadow-black/10"
                : item.href
                  ? "border border-transparent font-medium text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-white"
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
                {item.label}
              </Link>
            ) : (
              <div
                key={item.label}
                className={classes}
                aria-disabled="true"
                title={`${item.label} section is not connected yet`}
              >
                <Icon name={item.icon} size={21} />
                {item.label}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[#29384b] p-4">
          <div className="rounded-xl border border-[#29384b] bg-[#111a28]/70 p-4">
            <p className="text-xs font-semibold text-slate-300">
              Platform Console
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              Manage organizations, administrators and invitations.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-20 border-b border-[#29384b] bg-[#0f1724]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-h-[71px] flex-col justify-center gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative hidden h-[43px] w-full max-w-[482px] sm:block">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Search commands and organizations; open command palette"
                aria-keyshortcuts="Control+K Meta+K"
                className="absolute inset-0 flex h-[43px] w-full items-center justify-between gap-3 rounded-lg border border-[#29384b] bg-[#111a28] py-2.5 pl-12 pr-[9.5rem] text-left text-sm text-slate-300 outline-none transition hover:border-[#75c7ff]/35 hover:bg-[#182232] focus-visible:border-[#75c7ff] focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20"
              >
                <span className="truncate">
                  Search commands or organizations...
                </span>
              </button>
              <span className="pointer-events-none absolute left-4 top-[11px] text-slate-300">
                <Icon name="search" size={20} />
              </span>
              <CommandPaletteTrigger
                onClick={() => setCommandPaletteOpen(true)}
              />
            </div>

            <div className="ml-auto flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
              <div className="flex items-center gap-3">
                <WorkspaceClock />
              <SuperAdminThemeToggle />
              <div className="hidden h-9 w-px bg-white/10 sm:block" />
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-sm font-bold tracking-wide text-[#d8efff] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    SA
                  </div>
                  <div className="hidden min-w-0 sm:block">
                    <p className="text-sm font-semibold leading-5 text-[#f8fafc]">
                      Super Admin
                    </p>
                    <p className="max-w-[190px] truncate text-xs leading-5 text-slate-300">
                      {user?.email || "Platform Administrator"}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="rounded-lg border border-white/10 bg-[#182232]/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>

          <div className="pb-3 sm:hidden">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Open global command palette"
              aria-keyshortcuts="Control+K Meta+K"
              className="flex h-[43px] w-full items-center gap-3 rounded-lg border border-[#29384b] bg-[#111a28] px-3.5 text-left text-sm text-slate-300 transition hover:border-[#75c7ff]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"
            >
              <Icon name="search" size={19} />
              <span className="min-w-0 flex-1 truncate">
                Search commands or organizations...
              </span>
              
            </button>
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

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-5 lg:px-8 lg:pt-5">
          {logoutError && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300"
            >
              <p>{logoutError}</p>
              <button
                type="button"
                onClick={() => setLogoutError("")}
                className="shrink-0 font-semibold"
                aria-label="Dismiss logout error"
              >
                Dismiss
              </button>
            </div>
          )}

          <section className="sa-invitation-page-heading mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8db9df]">
                <span className="h-px w-5 bg-[#75c7ff]/70" />
                Platform Control
                <span className="text-slate-600">/</span>
                Super Admin
              </p>
              <h1 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">
                Invitation Management
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">

              <Link
                href="/dashboard/organizations"
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-[#75c7ff]/20 bg-[#21486a] px-4 py-2.5 text-sm font-semibold text-[#eff8ff] shadow-sm shadow-black/20 transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"
              >
                <Icon name="building" size={17} />
                View organizations
                <Icon name="arrow" size={15} />
              </Link>
            </div>
          </section>

          {error && !hasPayloadRef.current && (
            <div
              role="alert"
              className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{error}</span>
            </div>
          )}

          <section
            aria-label="Invitation metrics"
            className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-4"
          >
            {statCards.map((card) => (
              <article
                key={card.label}
                className="relative flex min-h-[128px] min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-4 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-[''] xl:items-center 2xl:gap-4 2xl:px-5"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] ${card.tone}`}
                >
                  <Icon name={card.icon} size={25} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="break-words text-[10px] font-semibold uppercase leading-5 tracking-[0.17em] text-[#9eafc4]">
                    {card.label}
                  </p>
                  <p className="mt-2 tabular-nums text-3xl font-bold leading-none tracking-[-0.045em] text-[#f2f7fc]">
                    {loading && !hasPayloadRef.current ? "…" : error && !hasPayloadRef.current ? "—" : card.value.toLocaleString()}
                  </p>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-5 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-[#29384b] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#293c52] bg-[#18283b] text-[#8bcaff]">
                    <Icon name="mail" size={19} />
                  </span>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b0bfd0]">
                      Invitation History
                    </h3>
                  </div>
                </div>
                <p className="text-xs tabular-nums text-[#91a3b8]">
                  {loading
                    ? "Loading records..."
                    : `Showing ${invitationsTotal === 0 ? 0 : (invitationsPage - 1) * 25 + 1}–${Math.min(invitationsPage * 25, invitationsTotal)} of ${invitationsTotal} matching invitations`}
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <label htmlFor="invitation-search" className="sr-only">
                    Search invitations
                  </label>
                  <input
                    id="invitation-search"
                    type="search"
                    value={searchDraft}
                    onChange={(event) => { setSearchDraft(event.target.value); setInvitationsPage(1); }}
                    placeholder="Search organization, email, or invitation ID..."
                    className="h-11 w-full rounded-lg border border-[#29384b] bg-[#111a28] py-2.5 pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#75c7ff] focus:bg-[#182232] focus:ring-2 focus:ring-[#75c7ff]/20"
                  />
                  <span className="pointer-events-none absolute left-3.5 top-3 text-[#9eafc4]">
                    <Icon name="search" size={18} />
                  </span>
                </div>

                <div
                  className="sa-invitation-status-filters flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0"
                  aria-label="Filter invitations by status"
                >
                  {(
                    ["ALL", "PENDING", "ACCEPTED", "EXPIRED", "REVOKED"] as FilterStatus[]
                  ).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => { setFilterStatus(status); setInvitationsPage(1); }}
                      aria-pressed={filterStatus === status}
                      className={`sa-invitation-status-filter shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${
                        filterStatus === status
                          ? "border-[#75c7ff]/40 bg-[#18314a] text-[#e3f2ff] shadow-sm"
                          : "border-white/10 bg-white/[0.025] text-slate-300 hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                    >
                      {status === "ALL"
                        ? "All statuses"
                        : statusLabel(status as Invitation["display_status"])}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-3 sm:p-4 lg:hidden">
              {loading && invitations.length === 0 ? (
                <div className="rounded-xl border border-[#29384b] bg-[#111a28]/70 px-4 py-8 text-center text-sm text-slate-400">
                  <span className="inline-flex items-center gap-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                    Loading invitation history...
                  </span>
                </div>
              ) : error && invitations.length === 0 ? (
                <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200">
                  Invitation records could not be displayed.
                </div>
              ) : filteredInvitations.length === 0 ? (
                <div className="rounded-xl border border-[#29384b] bg-[#111a28]/60 px-4 py-8 text-center">
                  <Icon name="mail" size={23} />
                  <p className="mt-3 font-semibold text-slate-200">No invitations found</p>
                  <p className="mt-1 text-sm text-slate-400">Try another search or status filter.</p>
                </div>
              ) : filteredInvitations.map((invitation) => (
                <article key={`mobile-${invitation.id}`} className="sa-invitation-mobile-card min-w-0 rounded-xl border border-[#29384b] bg-[#111a28]/75 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <SuperAdminOrganizationLogo
                      organizationId={invitation.organization_id}
                      name={invitation.organization_name}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-[#e6eef7]">{invitation.organization_name}</p>
                      <p className="mt-1 break-all text-xs text-[#8195ad]">ID: {invitation.organization_id}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses(invitation.display_status)}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${getInvitationStatusDotStyle(invitation.display_status)}`} />
                      {statusLabel(invitation.display_status)}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-white/[0.07] pt-3">
                    <p className="break-all text-sm font-medium text-[#c9d5e3]">{invitation.email}</p>
                    <p className="mt-1 text-xs text-[#8195ad]">Organization Admin</p>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div><dt className="text-[#8195ad]">Created</dt><dd className="mt-1 font-medium text-[#b2c0d1]">{formatDate(invitation.created_at)}</dd></div>
                      <div><dt className="text-[#8195ad]">Expires</dt><dd className="mt-1 font-medium text-[#b2c0d1]">{formatDate(invitation.expires_at)}</dd></div>
                      {invitation.display_status === "ACCEPTED" && invitation.accepted_at && (
                        <div><dt className="text-[#8195ad]">Accepted</dt><dd className="mt-1 font-medium text-[#b2c0d1]">{formatDate(invitation.accepted_at)}</dd></div>
                      )}
                      {invitation.display_status === "REVOKED" && invitation.revoked_at && (
                        <div><dt className="text-[#8195ad]">Revoked</dt><dd className="mt-1 font-medium text-[#b2c0d1]">{formatDate(invitation.revoked_at)}</dd></div>
                      )}
                    </dl>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/organizations?organizationId=${encodeURIComponent(invitation.organization_id)}&panel=view`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#29384b] bg-[#182232]/90 px-3 py-2 text-xs font-semibold text-[#c5d5e6] transition hover:border-[#75c7ff]/25 hover:bg-[#18314a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"
                    >
                      View organization <Icon name="arrow" size={13} />
                    </Link>
                    {invitation.display_status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => openRevocationDialog(invitation)}
                        disabled={revocationLoading}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Revoke invitation
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent] lg:block">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91a7bf]">
                  <tr>
                    <th className="rounded-l-md px-3 py-3.5 font-semibold">
                      Organization
                    </th>
                    <th className="px-3 py-3.5 font-semibold">
                      Invited administrator
                    </th>
                    <th className="px-3 py-3.5 font-semibold">Status</th>
                    <th className="px-3 py-3.5 font-semibold">Created</th>
                    <th className="rounded-r-md px-3 py-3.5 font-semibold">
                      Expires
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#27384b]/75">
                  {loading && invitations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-slate-400"
                      >
                        <span className="inline-flex items-center gap-3">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                          Loading invitation history...
                        </span>
                      </td>
                    </tr>
                  ) : error && invitations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-slate-400"
                      >
                        Invitation records could not be displayed.
                      </td>
                    </tr>
                  ) : filteredInvitations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06] text-slate-400">
                          <Icon name="mail" size={23} />
                        </span>
                        <p className="mt-3 font-semibold text-slate-200">
                          No invitations found
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Try another search or status filter.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvitations.map((invitation) => (
                      <tr
                        key={invitation.id}
                        className="group transition-colors duration-200 hover:bg-[#14283e]/45 focus-within:bg-[#14283e]/45"
                      >
                        <td className="px-3 py-4 align-middle">
                          <div className="flex items-center gap-3">
                            <SuperAdminOrganizationLogo
                              organizationId={invitation.organization_id}
                              name={invitation.organization_name}
                              size="md"
                            />
                            <div className="min-w-0">
                              <p
                                className="max-w-[240px] truncate font-semibold text-[#e6eef7]"
                                title={invitation.organization_name}
                              >
                                {invitation.organization_name}
                              </p>
                              <p
                                className="mt-1 max-w-[240px] truncate text-xs text-[#8195ad]"
                                title={invitation.organization_id}
                              >
                                ID: {invitation.organization_id}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-4 align-middle">
                          <p
                            className="max-w-[280px] break-words font-medium text-[#c9d5e3]"
                            title={invitation.email}
                          >
                            {invitation.email}
                          </p>
                          <p className="mt-1 text-xs text-[#8195ad]">
                            Organization Admin
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/organizations?organizationId=${encodeURIComponent(invitation.organization_id)}&panel=view`}
                              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[#29384b] bg-[#182232]/90 px-3 py-2 text-xs font-semibold text-[#c5d5e6] transition hover:border-[#75c7ff]/25 hover:bg-[#18314a] hover:text-[#dff1ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"
                            >
                              View organization <Icon name="arrow" size={13} />
                            </Link>

                            {invitation.display_status === "PENDING" && (
                              <button
                                type="button"
                                onClick={() => openRevocationDialog(invitation)}
                                disabled={revocationLoading}
                                className="inline-flex w-fit items-center justify-center rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Revoke invitation
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-4 align-middle">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses(invitation.display_status)}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${getInvitationStatusDotStyle(invitation.display_status)}`}
                            />
                            {statusLabel(invitation.display_status)}
                          </span>

                          {invitation.display_status === "ACCEPTED" &&
                            invitation.accepted_at && (
                              <p className="mt-2 text-[11px] text-[#8195ad]">
                                Accepted {formatDate(invitation.accepted_at)}
                              </p>
                            )}

                          {invitation.display_status === "REVOKED" &&
                            invitation.revoked_at && (
                              <p className="mt-2 text-[11px] text-[#8195ad]">
                                Revoked {formatDate(invitation.revoked_at)}
                              </p>
                            )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 align-middle text-[#b2c0d1]">
                          {formatDate(invitation.created_at)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 align-middle text-[#b2c0d1]">
                          {formatDate(invitation.expires_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loading && !error && invitationsTotal > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#29384b] px-5 py-3 text-xs text-[#91a3b8]">
                <span>Page {invitationsPage} of {invitationsTotalPages}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setInvitationsPage((page) => Math.max(1, page - 1))} disabled={invitationsPage <= 1 || loading} className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-200 disabled:opacity-40">Previous</button>
                  <button type="button" onClick={() => setInvitationsPage((page) => Math.min(invitationsTotalPages, page + 1))} disabled={invitationsPage >= invitationsTotalPages || loading} className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-200 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandItems}
        onSelect={selectCommandItem}
      />

      {revocationTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRevocationDialog();
          }}
        >
          <div
            ref={revocationDialogRef}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="invitation-revocation-dialog-title"
            aria-describedby="invitation-revocation-dialog-description"
            className="w-full max-w-lg rounded-2xl border border-rose-400/25 bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300">
                <Icon name="mail" size={23} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">
                  Guarded invitation action
                </p>
                <h2
                  id="invitation-revocation-dialog-title"
                  className="mt-1 text-xl font-bold tracking-tight text-white"
                >
                  Revoke invitation?
                </h2>
                <p className="mt-1 break-words text-sm font-semibold text-slate-200">
                  {revocationTarget.email}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Organization: {revocationTarget.organization_name}
                </p>
              </div>
            </div>

            <p
              id="invitation-revocation-dialog-description"
              className="mt-4 text-sm leading-6 text-slate-300"
            >
              The invitation link will no longer be usable. This action cannot
              be undone; a new invitation can be created later.
            </p>

            <label
              htmlFor="global-invitation-revocation-reason"
              className="mt-4 block text-xs font-semibold text-slate-200"
            >
              Reason for revocation{" "}
              <span className="text-rose-200">(required)</span>
            </label>

            <textarea
              id="global-invitation-revocation-reason"
              value={revocationReason}
              onChange={(event) => {
                setRevocationReason(event.target.value);
                setRevocationError("");
              }}
              minLength={3}
              maxLength={1000}
              rows={3}
              disabled={revocationLoading}
              placeholder="Explain why this invitation is being revoked..."
              className="mt-2 w-full resize-y rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-4 focus:ring-rose-500/10 disabled:opacity-60"
            />

            <p className="mt-1 text-[11px] text-slate-400">
              The reason will be recorded in the platform audit log.
            </p>

            {revocationError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
              >
                {revocationError}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeRevocationDialog}
                disabled={revocationLoading}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmRevocation()}
                disabled={
                  revocationLoading || revocationReason.trim().length < 3
                }
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {revocationLoading
                  ? "Revoking invitation…"
                  : "Confirm revocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
