"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CountrySelect, replacePhoneCountryCode } from "../../components/workforce/CountryPhoneFields";
import {
  CommandPalette,
  CommandPaletteTrigger,
  buildSuperAdminCommandItems,
  type CommandPaletteItem,
  type CommandPaletteOrganization,
} from "../../components/super-admin/CommandPalette";
import { SuperAdminOrganizationLogo, SuperAdminUserAvatar } from "../../components/super-admin/SuperAdminImages";

import SuperAdminThemeToggle from "../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../components/WorkspaceClock";
type AdminUser = {
  email: string;
  role: string;
};

type OrganizationAdmin = {
  id: string;
  email: string;
  account_status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_status: string;
  role_name: string;
  first_name: string | null;
  last_name: string | null;
  employee_code: string | null;
  phone: string | null;
  country?: string | null;
  city?: string | null;
  designation: string | null;
  employment_status: string | null;
  joining_date: string | null;
  latest_invitation_status: string | null;
  latest_invitation_expires_at: string | null;
};

type AccountFilter =
  | "ALL"
  | "ACTIVE"
  | "INVITED"
  | "SUSPENDED"
  | "ARCHIVED"
  | "DEACTIVATED";

type AdminAccountStatus = "ACTIVE" | "SUSPENDED";

type IconName =
  | "dashboard"
  | "building"
  | "users"
  | "admin"
  | "mail"
  | "message"
  | "activity"
  | "search"
  | "bell"
  | "chevron"
  | "clock"
  | "arrow"
  | "external"
  | "shield"
  | "calendar"
  | "filter"
  | "plus"
  | "refresh"
  | "more"
  | "close"
  | "email"
  | "phone"
  | "briefcase"
  | "credit-card"
  | "copy";

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
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
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
    filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: (
      <path d="M20 7v5h-5M4 17v-5h5m-4.2-3A8 8 0 0 1 18 6l2 6M4 12l2 6a8 8 0 0 0 13.2-3" />
    ),
    more: (
      <>
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    email: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    phone: (
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1Z" />
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),
    "credit-card": (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M7 15h3" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="13" height="13" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
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
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Not available";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusStyle(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    case "INVITED": return "bg-amber-500/10 text-amber-300 ring-amber-400/20";
    case "SUSPENDED": return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
    case "ARCHIVED": return "bg-slate-500/10 text-slate-300 ring-slate-400/20";
    case "DEACTIVATED": return "bg-white/[0.06] text-slate-300 ring-white/10";
    default: return "bg-white/[0.06] text-slate-200 ring-white/10";
  }
}
function getStatusDotStyle(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "INVITED": return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]";
    case "SUSPENDED": return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]";
    case "ARCHIVED": return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
    case "DEACTIVATED": return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
    default: return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
  }
}

function getOrganizationStatusStyle(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    case "PENDING_SETUP": return "bg-amber-500/10 text-amber-300 ring-amber-400/20";
    case "SUSPENDED": return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
    case "ARCHIVED": return "bg-slate-500/10 text-slate-300 ring-slate-400/20";
    default: return "bg-white/[0.06] text-slate-300 ring-white/10";
  }
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OA"
  );
}

function getDisplayName(admin: OrganizationAdmin) {
  const fullName = [admin.first_name, admin.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || admin.email;
}

function getEffectiveAccessStatus(admin: OrganizationAdmin): string {
  // Organization-level status determines effective access, even when the
  // individual account remains marked ACTIVE in the database.
  const organizationStatus = admin.organization_status?.toUpperCase();
  if (organizationStatus === "ARCHIVED") {
    return "ARCHIVED";
  }
  if (organizationStatus === "SUSPENDED") {
    return "SUSPENDED";
  }

  return admin.account_status?.toUpperCase() ?? "UNKNOWN";
}

export default function OrganizationAdminsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [admins, setAdmins] = useState<OrganizationAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const hasLoadedAdminsRef = useRef(false);
  const lastAutoRefreshAtRef = useRef(0);
  const [statusFilter, setStatusFilter] = useState<AccountFilter>("ALL");
  const [selectedAdmin, setSelectedAdmin] =
    useState<OrganizationAdmin | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copyEmailError, setCopyEmailError] = useState("");
  const [statusChangeAdmin, setStatusChangeAdmin] =
    useState<OrganizationAdmin | null>(null);
  const statusChangeAdminRef = useRef<OrganizationAdmin | null>(null);
  statusChangeAdminRef.current = statusChangeAdmin;
  const [statusChangeReason, setStatusChangeReason] = useState("");
  const [statusChangeError, setStatusChangeError] = useState("");
  const [statusChangeMessage, setStatusChangeMessage] = useState("");
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);
  const [replacementInviteAdmin, setReplacementInviteAdmin] = useState<OrganizationAdmin | null>(null);
  const replacementInviteAdminRef = useRef<OrganizationAdmin | null>(null);
  replacementInviteAdminRef.current = replacementInviteAdmin;
  const [replacementInviteEmail, setReplacementInviteEmail] = useState("");
  const [replacementAdminFirstName, setReplacementAdminFirstName] = useState("");
  const [replacementAdminLastName, setReplacementAdminLastName] = useState("");
  const [replacementAdminCountry, setReplacementAdminCountry] = useState("");
  const [replacementAdminCity, setReplacementAdminCity] = useState("");
  const [replacementAdminPhone, setReplacementAdminPhone] = useState("");
  const [replacementInviteError, setReplacementInviteError] = useState("");
  const [replacementInviteMessage, setReplacementInviteMessage] = useState("");
  const [replacementInviteSubmitting, setReplacementInviteSubmitting] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOrganizations, setPaletteOrganizations] =
    useState<CommandPaletteOrganization[]>([]);
  const detailsDrawerRef = useRef<HTMLElement | null>(null);
  const detailsDrawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const statusChangeDialogRef = useRef<HTMLElement | null>(null);
  const statusChangeReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const replacementInviteDialogRef = useRef<HTMLElement | null>(null);
  const replacementInviteEmailRef = useRef<HTMLInputElement | null>(null);

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

        if (isActive) {
          setUser(data.user ?? null);
        }
      } catch {
        if (isActive) {
          router.replace("/");
        }
      } finally {
        if (isActive) {
          setCheckingSession(false);
        }
      }
    }

    void verifySession();

    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;
    const controller = new AbortController();

    async function loadAdmins() {
      const isInitialLoad = !hasLoadedAdminsRef.current;
      if (isInitialLoad) setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/backend/organization-admins${statusFilter === "ARCHIVED" ? "?includeArchived=true" : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          router.replace("/");
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Could not load Organization Admin accounts.");
        }

        const items = data.organizationAdmins;
        if (!Array.isArray(items)) {
          throw new Error("The Organization Admins API returned an unexpected response.");
        }

        if (isActive) {
          setAdmins(items);
          hasLoadedAdminsRef.current = true;
          setError("");
        }
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        console.error("Organization Admins loading error:", loadError);
        if (isActive && !hasLoadedAdminsRef.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Something went wrong while loading accounts.",
          );
        }
      } finally {
        if (isActive && isInitialLoad) setLoading(false);
      }
    }

    void loadAdmins();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [user, router, refreshKey, statusFilter]);

  useEffect(() => {
    if (!user) return;

    lastAutoRefreshAtRef.current = Date.now();
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastAutoRefreshAtRef.current < 60_000) return;
      lastAutoRefreshAtRef.current = now;
      setRefreshKey((current) => current + 1);
    };

    const intervalId = window.setInterval(refreshIfStale, 15_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    let isActive = true;

    async function loadPaletteOrganizations() {
      try {
        const response = await fetch("/api/backend/organizations", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();

        const candidateItems: unknown = Array.isArray(data)
          ? data
          : data.organizations;

        if (!Array.isArray(candidateItems)) return;

        const items = candidateItems
          .filter(
            (item: unknown): item is CommandPaletteOrganization =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as CommandPaletteOrganization).id === "string" &&
              typeof (item as CommandPaletteOrganization).name === "string" &&
              typeof (item as CommandPaletteOrganization).slug === "string" &&
              typeof (item as CommandPaletteOrganization).status === "string",
          )
          .map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            status: item.status,
          }));

        if (isActive) {
          setPaletteOrganizations(items);
        }
      } catch {
        // Palette discovery is optional; the page still works if this request fails.
      }
    }

    void loadPaletteOrganizations();

    return () => {
      isActive = false;
    };
  }, []);

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

  useEffect(() => {
    if (!selectedAdmin) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() =>
      detailsDrawerCloseRef.current?.focus(),
    );

    function handleDrawerKeyDown(event: KeyboardEvent) {
      // Keep the details drawer open while the status confirmation modal is active.
      if (statusChangeAdminRef.current || replacementInviteAdminRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedAdmin(null);
        return;
      }

      if (event.key !== "Tab" || !detailsDrawerRef.current) return;

      const focusable = Array.from(
        detailsDrawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (!focusable.length) return;

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

    document.addEventListener("keydown", handleDrawerKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDrawerKeyDown);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [selectedAdmin]);

  useEffect(() => {
    if (!statusChangeAdmin) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => statusChangeReasonRef.current?.focus());

    function handleStatusModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !statusChangeSubmitting) {
        event.preventDefault();
        setStatusChangeAdmin(null);
        setStatusChangeError("");
        return;
      }
      if (event.key !== "Tab" || !statusChangeDialogRef.current) return;
      const focusable = Array.from(statusChangeDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
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

    document.addEventListener("keydown", handleStatusModalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleStatusModalKeyDown);
      window.cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, [statusChangeAdmin, statusChangeSubmitting]);

  useEffect(() => {
    if (!replacementInviteAdmin) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => replacementInviteEmailRef.current?.focus());

    function handleReplacementInviteKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !replacementInviteSubmitting) {
        event.preventDefault();
        setReplacementInviteAdmin(null);
        setReplacementInviteError("");
        return;
      }
      if (event.key !== "Tab" || !replacementInviteDialogRef.current) return;
      const focusable = Array.from(replacementInviteDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
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

    document.addEventListener("keydown", handleReplacementInviteKeyDown);
    return () => {
      document.removeEventListener("keydown", handleReplacementInviteKeyDown);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [replacementInviteAdmin, replacementInviteSubmitting]);

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

  function openReplacementAdminInvite(admin: OrganizationAdmin) {
    if (admin.organization_status?.toUpperCase() !== "ACTIVE") {
      setReplacementInviteMessage("A replacement Organization Admin can only be invited while the organization is active.");
      return;
    }
    if (admin.account_status?.toUpperCase() !== "ACTIVE") {
      setReplacementInviteMessage("This administrator is not currently active. Review the account status before starting a replacement workflow.");
      return;
    }
    setReplacementInviteMessage("");
    setReplacementInviteError("");
    setReplacementInviteEmail("");
    setReplacementAdminFirstName("");
    setReplacementAdminLastName("");
    setReplacementAdminCountry("");
    setReplacementAdminCity("");
    setReplacementAdminPhone("");
    setReplacementInviteAdmin(admin);
  }

  async function handleReplacementAdminInvite() {
    const target = replacementInviteAdmin;
    if (!target || replacementInviteSubmitting) return;
    const email = replacementInviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      setReplacementInviteError("Enter a valid email address for the replacement administrator.");
      return;
    }
    if (email === target.email.trim().toLowerCase()) {
      setReplacementInviteError("Use a different email address from the current administrator.");
      return;
    }
    if (target.organization_status?.toUpperCase() !== "ACTIVE") {
      setReplacementInviteError("This organization must be active before inviting a replacement administrator.");
      return;
    }
    const adminPhoneDigits = replacementAdminPhone.replace(/\D/g, "").length;
    if (
      replacementAdminFirstName.trim().length < 2 ||
      !replacementAdminLastName.trim() ||
      !replacementAdminCountry.trim() ||
      replacementAdminCity.trim().length < 2 ||
      !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(replacementAdminPhone.trim()) ||
      adminPhoneDigits < 7 || adminPhoneDigits > 15
    ) {
      setReplacementInviteError("Complete the replacement administrator's name, phone, country, and city with valid details.");
      return;
    }

    setReplacementInviteSubmitting(true);
    setReplacementInviteError("");
    try {
      const response = await fetch(`/api/backend/organizations/${encodeURIComponent(target.organization_id)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          adminFirstName: replacementAdminFirstName.trim(),
          adminLastName: replacementAdminLastName.trim(),
          adminPhone: replacementAdminPhone.trim(),
          adminCountry: replacementAdminCountry.trim(),
          adminCity: replacementAdminCity.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; emailSent?: boolean };
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok || data.emailSent !== true) {
        throw new Error(data.message || "The invitation was not confirmed as sent.");
      }
      const message = `Replacement invitation sent to ${email} for ${target.organization_name}. ${target.email} remains active for now. After the new administrator accepts the invitation and appears in this directory, return here and suspend the former administrator with an audit reason. The backend prevents suspending the last active administrator.`;
      setReplacementInviteMessage(message);
      setStatusChangeMessage(message);
      setRefreshKey((current) => current + 1);
      setReplacementInviteAdmin(null);
      setReplacementInviteEmail("");
      setReplacementAdminFirstName("");
      setReplacementAdminLastName("");
      setReplacementAdminCountry("");
      setReplacementAdminCity("");
      setReplacementAdminPhone("");
    } catch (error) {
      setReplacementInviteError(error instanceof Error ? error.message : "Could not send the replacement invitation.");
    } finally {
      setReplacementInviteSubmitting(false);
    }
  }

  async function handleCopyEmail() {
    if (!selectedAdmin) return;

    setCopyEmailError("");

    try {
      await navigator.clipboard.writeText(selectedAdmin.email);
      setCopiedEmail(true);
      window.setTimeout(() => setCopiedEmail(false), 1600);
    } catch {
      setCopyEmailError(
        "Could not copy automatically. Select the email address and copy it manually.",
      );
    }
  }

  function openStatusChangeModal(admin: OrganizationAdmin) {
    const accountStatus = admin.account_status?.toUpperCase();
    if (accountStatus !== "ACTIVE" && accountStatus !== "SUSPENDED") return;

    setStatusChangeMessage("");
    setStatusChangeError("");
    setStatusChangeReason("");
    setStatusChangeAdmin(admin);
  }

  async function handleConfirmStatusChange() {
    if (!statusChangeAdmin || statusChangeSubmitting) return;

    const reason = statusChangeReason.trim();
    if (reason.length < 3) {
      setStatusChangeError("Enter a reason of at least 3 characters.");
      return;
    }

    const currentStatus = statusChangeAdmin.account_status.toUpperCase();
    if (currentStatus !== "ACTIVE" && currentStatus !== "SUSPENDED") {
      setStatusChangeError("Only active or suspended administrator accounts can be changed.");
      return;
    }

    const nextStatus: AdminAccountStatus =
      currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const target = statusChangeAdmin;

    setStatusChangeSubmitting(true);
    setStatusChangeError("");

    try {
      const response = await fetch(
        `/api/backend/organization-admins/${encodeURIComponent(target.id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, reason }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Could not ${nextStatus === "SUSPENDED" ? "suspend" : "reactivate"} this Organization Admin.`,
        );
      }

      const updatedAt = new Date().toISOString();
      setAdmins((current) =>
        current.map((admin) =>
          admin.id === target.id
            ? { ...admin, account_status: nextStatus, updated_at: updatedAt }
            : admin,
        ),
      );
      setSelectedAdmin((current) =>
        current?.id === target.id
          ? { ...current, account_status: nextStatus, updated_at: updatedAt }
          : current,
      );

      setStatusChangeMessage(
        `${target.email} was ${nextStatus === "SUSPENDED" ? "suspended" : "reactivated"} successfully.`,
      );
      setStatusChangeAdmin(null);
      setStatusChangeReason("");

      // Reconcile the local display with the server's authoritative directory data.
      try {
        const refreshResponse = await fetch("/api/backend/organization-admins", {
          cache: "no-store",
        });
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          if (Array.isArray(refreshData.organizationAdmins)) {
            const refreshedAdmins = refreshData.organizationAdmins as OrganizationAdmin[];
            setAdmins(refreshedAdmins);
            setSelectedAdmin((current) => {
              if (!current || current.id !== target.id) return current;
              return refreshedAdmins.find((admin) => admin.id === target.id) ?? current;
            });
          }
        }
      } catch (refreshError) {
        console.error("Could not refresh Organization Admin directory:", refreshError);
      }
    } catch (statusFailure) {
      setStatusChangeError(
        statusFailure instanceof Error
          ? statusFailure.message
          : "Could not change this account's status. Please try again.",
      );
    } finally {
      setStatusChangeSubmitting(false);
    }
  }

  const filteredAdmins = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();

    return admins.filter((admin) => {
      const searchValues = [
        admin.first_name,
        admin.last_name,
        `${admin.first_name ?? ""} ${admin.last_name ?? ""}`,
        admin.email,
        admin.organization_name,
        admin.organization_slug,
        admin.employee_code,
        admin.phone,
        admin.designation,
      ];

      const matchesSearch =
        !query ||
        searchValues.some((value) =>
          (value ?? "").toLowerCase().includes(query),
        );

      const matchesStatus =
        statusFilter === "ALL" ||
        getEffectiveAccessStatus(admin) === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [admins, debouncedSearchQuery, statusFilter]);

  const counts = useMemo(
    () => ({
      total: admins.length,
      active: admins.filter(
        (admin) => getEffectiveAccessStatus(admin) === "ACTIVE",
      ).length,
      invited: admins.filter(
        (admin) => getEffectiveAccessStatus(admin) === "INVITED",
      ).length,
      suspendedOrDeactivated: admins.filter((admin) => {
        const status = getEffectiveAccessStatus(admin);
        return status === "SUSPENDED" || status === "ARCHIVED" || status === "DEACTIVATED";
      }).length,
    }),
    [admins],
  );



  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17]">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#182232]/80 px-6 py-5 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-300">
            Verifying your admin session...
          </p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  // Users sidebar item removed; Organization Admins remains clickable.
  const isNavItemActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const navItems: {
    label: string;
    icon: IconName;
    href?: string;
  }[] = [
    {
      label: "Dashboard",
      icon: "dashboard",
      href: "/dashboard",
    },
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
    { label: "Audit Logs", icon: "shield", href: "/dashboard/audit-logs" },
  ];

  const summaryCards = [
    {
      label: "Total Admin Accounts",
      value: loading ? "…" : error ? "—" : counts.total.toLocaleString(),
      description: "Organization-level administrator accounts",
      icon: "admin" as const,
      iconStyle: "bg-blue-500/15 text-blue-300",
    },
    {
      label: "Active",
      value: loading ? "…" : error ? "—" : counts.active.toLocaleString(),
      description: "Can currently sign in",
      icon: "shield" as const,
      iconStyle: "bg-emerald-500/15 text-emerald-300",
    },
    {
      label: "Invited",
      value: loading ? "…" : error ? "—" : counts.invited.toLocaleString(),
      description: "Awaiting account setup",
      icon: "mail" as const,
      iconStyle: "bg-amber-500/15 text-amber-300",
    },
    {
      label: "Restricted Accounts",
      value: loading
        ? "…"
        : error
          ? "—"
          : counts.suspendedOrDeactivated.toLocaleString(),
      description: "Suspended, archived or deactivated",
      icon: "clock" as const,
      iconStyle: "bg-rose-500/15 text-rose-300",
    },
  ];

  return (
    <div className="sa-organization-admins-page min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark" style={{ backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)", backgroundSize: "auto, 42px 42px, 42px 42px" }}>
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
              Review administrator accounts across registered organizations.
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
                className="absolute inset-0 flex h-[43px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-12 pr-[9.5rem] text-left text-sm text-slate-300 outline-none transition hover:border-blue-400/40 hover:bg-[#182232] focus-visible:border-[#75c7ff] focus-visible:ring-4 focus-visible:ring-[#75c7ff]/30"
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
                      {user.email || "Platform Administrator"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
          </div>

          <div className="pb-3 sm:hidden">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Open global command palette"
              aria-keyshortcuts="Control+K Meta+K"
              className="flex h-[43px] w-full items-center gap-3 rounded-lg border border-white/10 bg-[#111a28] px-3.5 text-left text-sm text-slate-300 transition hover:border-blue-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
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

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300"
            >
              <p>{logoutError}</p>
              <button
                type="button"
                onClick={() => setLogoutError("")}
                className="font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {statusChangeMessage && (
            <div
              role="status"
              className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"
            >
              <p>{statusChangeMessage}</p>
              <button
                type="button"
                onClick={() => setStatusChangeMessage("")}
                className="font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fb5d5]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#75c7ff] shadow-[0_0_8px_rgba(117,199,255,0.35)]" />
                <span>Platform Control</span>
                <span className="text-[#52677e]">/</span>
                <span className="text-[#b0bfd0]">Access Directory</span>
              </div>
              <h1 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">
                Organization Admins
              </h1>
              <p className="mt-1 text-[15px] text-slate-300">
                Review organization administrator accounts and their associated
                organizations.
              </p>
            </div>

          </section>

          <section
            aria-label="Organization Admin account summary"
            className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {summaryCards.map((card) => (
              <article
                key={card.label}
                className="relative flex min-w-0 min-h-[128px] flex-col items-start gap-3 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-4 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-[''] xl:flex-row xl:items-center xl:px-4 2xl:gap-5 2xl:px-6 2xl:py-6"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] 2xl:h-12 2xl:w-12 ${card.iconStyle}`}
                >
                  <Icon name={card.icon} size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase leading-5 tracking-[0.17em] text-[#9eafc4]">
                    {card.label}
                  </p>
                  <p className="mt-2 min-w-0 break-words text-3xl font-bold leading-none tracking-[-0.045em] tabular-nums text-[#f2f7fc] xl:text-[34px]">
                    {card.value}
                  </p>
                  <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-xs leading-4 text-[#9eafc4]">
                    {card.description}
                  </p>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-5 min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-[#29384b] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b0bfd0]">
                  All Organization Admins
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Select an account to open its details in the right-side panel.
                </p>
              </div>
              <p className="text-xs text-slate-300">
                {loading
                  ? "Loading accounts..."
                  : `Showing ${filteredAdmins.length} of ${admins.length} accounts`}
              </p>
            </div>

            <div className="grid gap-3 border-b border-[#29384b] bg-[#101a27] p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center sm:px-5">
              <label className="relative block min-w-0 w-full">
                <span className="sr-only">Search Organization Admins</span>
                <span className="pointer-events-none absolute left-3.5 top-3 text-slate-300">
                  <Icon name="search" size={18} />
                </span>
                <input
                  id="admin-table-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search admins, emails or organizations..."
                  className="h-11 w-full rounded-lg border border-[#29384b] bg-[#111a28] py-2.5 pl-10 pr-4 text-sm text-[#e6edf6] outline-none placeholder:text-[#718198] transition focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20"
                />
              </label>

              <label className="relative block min-w-0 w-full">
                <span className="sr-only">Filter Organization Admins by access status</span>
                <span className="pointer-events-none absolute left-3.5 top-3 text-slate-300">
                  <Icon name="filter" size={18} />
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as AccountFilter)}
                  aria-label="Filter Organization Admins by access status"
                  className="scheme-dark h-11 w-full appearance-none rounded-lg border border-[#29384b] bg-[#111a28] py-2.5 pl-10 pr-10 text-sm text-[#e6edf6] outline-none transition focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20"
                >
                  <option value="ALL">All access statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INVITED">Invited</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="DEACTIVATED">Deactivated</option>
                </select>
                <span className="pointer-events-none absolute right-3.5 top-3 text-slate-300">
                  <Icon name="chevron" size={17} />
                </span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                }}
                disabled={!searchQuery && statusFilter === "ALL"}
                className="h-11 rounded-lg border border-[#31445b] bg-[#17263a] px-4 text-sm font-semibold text-[#b7c7d9] transition hover:border-[#75c7ff]/30 hover:bg-[#1a3147] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear filters
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                Loading Organization Admins...
              </div>
            ) : error ? (
              <div
                className="m-5 rounded-lg border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-300"
                role="alert"
              >
                {error}
              </div>
            ) : admins.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                  <Icon name="admin" size={26} />
                </div>
                <h3 className="mt-4 font-semibold text-[#f8fafc]">
                  No Organization Admin accounts found
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Organization Admin accounts will appear here when they exist.
                </p>
              </div>
            ) : filteredAdmins.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                  <Icon name="search" size={22} />
                </div>
                <h3 className="mt-4 font-semibold text-[#f8fafc]">
                  No matching accounts
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Try a different name, email, organization or status.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("ALL");
                  }}
                  className="mt-4 text-sm font-semibold text-[#9ed8ff] hover:text-[#d8efff]"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 px-4 pb-4 xl:hidden">
                  {filteredAdmins.map((admin) => {
                    const effectiveStatus = getEffectiveAccessStatus(admin);
                    const canChangeStatus = admin.organization_status?.toUpperCase() !== "ARCHIVED" &&
                      (admin.account_status?.toUpperCase() === "SUSPENDED" ||
                        (admin.account_status?.toUpperCase() === "ACTIVE" && admin.organization_status?.toUpperCase() !== "SUSPENDED"));
                    return (
                      <article key={`mobile-${admin.id}`} className="sa-admin-mobile-card rounded-xl border border-[#29384b] bg-[#111a28]/75 p-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <SuperAdminUserAvatar organizationId={admin.organization_id} userId={admin.id} name={getDisplayName(admin)} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-[#f8fafc]">{getDisplayName(admin)}</p>
                            <p className="mt-0.5 truncate text-sm text-slate-300">{admin.email}</p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusStyle(effectiveStatus)}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${getStatusDotStyle(effectiveStatus)}`} />
                            {formatStatus(effectiveStatus)}
                          </span>
                        </div>
                        <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-white/10 pt-3">
                          <SuperAdminOrganizationLogo organizationId={admin.organization_id} name={admin.organization_name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-200">{admin.organization_name}</p>
                            <p className="truncate text-xs text-slate-400">{admin.organization_slug}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => { setSelectedAdmin(admin); setCopiedEmail(false); setCopyEmailError(""); }} className="sa-admin-action-button rounded-lg border border-[#31445b] bg-[#17263a] px-3 py-2 text-sm font-semibold text-[#c5d4e4] transition hover:border-[#75c7ff]/30 hover:bg-[#1a3147] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60" aria-label={`View details for ${getDisplayName(admin)}`}>View details</button>
                          {canChangeStatus ? (
                            <button type="button" onClick={() => openStatusChangeModal(admin)} className={`sa-admin-action-button sa-admin-status-action rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60 ${admin.account_status?.toUpperCase() === "SUSPENDED" ? "sa-admin-status-reactivate border-emerald-400/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" : "sa-admin-status-suspend border-rose-400/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"}`} aria-label={`${admin.account_status?.toUpperCase() === "SUSPENDED" ? "Reactivate" : "Suspend"} ${getDisplayName(admin)}`}>{admin.account_status?.toUpperCase() === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>
                          ) : <span className="rounded-lg border border-transparent px-3 py-2 text-center text-xs text-slate-400">No account action</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent] xl:block">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91a7bf]">
                    <tr>
                      <th className="rounded-l-md px-3 py-3.5 font-semibold">
                        Administrator
                      </th>
                      <th className="px-3 py-3.5 font-semibold">
                        Organization
                      </th>
                      <th className="px-3 py-3.5 font-semibold">
                        Access Status
                      </th>
                      <th className="px-3 py-3.5 font-semibold">
                        Last Login
                      </th>
                      <th className="rounded-r-md px-3 py-3.5 font-semibold">
                        Created At
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27384b]/75">
                    {filteredAdmins.map((admin) => (
                      <tr
                        key={admin.id}
                        className={`border-l-2 border-l-transparent transition-colors hover:bg-[#14283e]/45 ${
                          selectedAdmin?.id === admin.id
                            ? "border-l-[#75c7ff] bg-[#14283e]/80"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-4 align-middle">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <SuperAdminUserAvatar
                              organizationId={admin.organization_id}
                              userId={admin.id}
                              name={getDisplayName(admin)}
                              size="sm"
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAdmin(admin);
                                  setCopiedEmail(false);
                                  setCopyEmailError("");
                                }}
                                className="block max-w-[245px] text-left"
                              >
                                <span className="block truncate font-semibold text-[#f8fafc] hover:text-[#b8e3ff]">
                                  {getDisplayName(admin)}
                                </span>
                                <span className="mt-1 block max-w-[245px] truncate text-xs text-slate-300">
                                  {admin.email}
                                </span>
                              </button>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedAdmin(admin);
                                    setCopiedEmail(false);
                                    setCopyEmailError("");
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#31445b] bg-[#17263a] px-2.5 py-1.5 text-xs font-semibold text-[#c5d4e4] transition hover:border-[#75c7ff]/30 hover:bg-[#1a3147] hover:text-[#dff2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60"
                                  aria-label={`View details for ${getDisplayName(admin)}`}
                                >
                                  View
                                  <Icon name="arrow" size={13} />
                                </button>
                                {admin.organization_status?.toUpperCase() !== "ARCHIVED" &&
                                  (admin.account_status?.toUpperCase() === "SUSPENDED" ||
                                    (admin.account_status?.toUpperCase() === "ACTIVE" &&
                                      admin.organization_status?.toUpperCase() !== "SUSPENDED")) && (
                                  <button
                                    type="button"
                                    onClick={() => openStatusChangeModal(admin)}
                                    className={`inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60 ${
                                      admin.account_status?.toUpperCase() === "SUSPENDED"
                                        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                        : "border-rose-400/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                                    }`}
                                    aria-label={`${admin.account_status?.toUpperCase() === "SUSPENDED" ? "Reactivate" : "Suspend"} ${getDisplayName(admin)}`}
                                  >
                                    {admin.account_status?.toUpperCase() === "SUSPENDED"
                                      ? "Reactivate"
                                      : "Suspend"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <SuperAdminOrganizationLogo
                              organizationId={admin.organization_id}
                              name={admin.organization_name}
                              size="sm"
                            />
                            <span className="min-w-0">
                              <span
                                className="block max-w-[190px] truncate font-medium text-slate-200"
                                title={admin.organization_name}
                              >
                                {admin.organization_name}
                              </span>
                              <span className="mt-1 block text-xs text-slate-400">
                                {admin.organization_slug}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <span
                            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusStyle(
                              getEffectiveAccessStatus(admin),
                            )}`}
                          >
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${getStatusDotStyle(getEffectiveAccessStatus(admin))}`} />
                            {formatStatus(getEffectiveAccessStatus(admin))}
                          </span>
                        </td>
                        <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                          {admin.last_login_at
                            ? formatDateTime(admin.last_login_at)
                            : "Never"}
                        </td>
                        <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                          {formatDate(admin.created_at)}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}

            {!loading && !error && admins.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-3 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span>
                  Showing {filteredAdmins.length} of {admins.length} Organization
                  Admin accounts.
                </span>
                <span>
                  Details open in a side panel; no separate admin details page.
                </span>
              </div>
            )}
          </section>

          <footer className="mt-6 border-t border-[#29384b] py-4 text-xs leading-5 text-[#8b9eb4]">
            HRMS Platform · Super Admin Console
          </footer>
        </div>
      </main>

      {selectedAdmin && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/70 backdrop-blur-md"
            onClick={() => setSelectedAdmin(null)}
            aria-label="Close Organization Admin details panel"
          />

          <aside
            ref={detailsDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-detail-title"
            tabIndex={-1}
            className="organization-slide-over-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col overflow-hidden border-l border-[#29384b] bg-[#111a28] text-[#f8fafc] shadow-[-20px_0_56px_rgba(0,0,0,0.48)] motion-reduce:transition-none focus:outline-none"
          >
            <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[#29384b] bg-[#111a28]/95 px-5 py-5 backdrop-blur-xl sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">
                  Account details
                </p>
                <h2
                  id="admin-detail-title"
                  className="mt-1 text-xl font-bold tracking-tight text-[#f8fafc]"
                >
                  Organization Admin
                </h2>
                <p className="mt-1 text-xs text-slate-300">
                  Full details are displayed here without opening another page.
                </p>
              </div>

              <button
                ref={detailsDrawerCloseRef}
                type="button"
                onClick={() => setSelectedAdmin(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#29384b] text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                aria-label="Close details"
              >
                <Icon name="close" size={19} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent] sm:p-5">
              <section className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <SuperAdminUserAvatar
                    organizationId={selectedAdmin.organization_id}
                    userId={selectedAdmin.id}
                    name={getDisplayName(selectedAdmin)}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-[#f8fafc]">
                      {getDisplayName(selectedAdmin)}
                    </h3>
                    <p className="mt-1 break-all text-sm text-slate-300">
                      {selectedAdmin.email}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusStyle(
                      getEffectiveAccessStatus(selectedAdmin),
                    )}`}
                  >
                    {formatStatus(getEffectiveAccessStatus(selectedAdmin))}
                  </span>
                  <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300 ring-1 ring-inset ring-blue-400/20">
                    {formatStatus(selectedAdmin.role_name)}
                  </span>
                  <span
                    className="inline-flex rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-200 ring-1 ring-inset ring-white/10"
                    title="The individual account record status, separate from effective access status"
                  >
                    Account record: {formatStatus(selectedAdmin.account_status)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyEmail()}
                  className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${copiedEmail ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-[#29384b] bg-[#0f1724] text-slate-200 hover:bg-white/[0.06]"}`}
                  aria-live="polite"
                >
                  {copiedEmail ? (
                    <span aria-hidden="true">✓</span>
                  ) : (
                    <Icon name="copy" size={15} />
                  )}
                  {copiedEmail ? "Email copied!" : "Copy email address"}
                </button>

                {copyEmailError && (
                  <p role="alert" className="mt-2 text-xs text-rose-300">
                    {copyEmailError}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">
                    <Icon name="shield" size={17} />
                  </span>
                  <h3 className="font-bold text-[#f8fafc]">Account access controls</h3>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  {selectedAdmin.organization_status?.toUpperCase() === "ARCHIVED"
                    ? "This organization's archived state blocks administrator access, regardless of the individual account status."
                    : "Suspend this administrator's individual account or reactivate it. Organization-level suspension, when present, overrides individual account access."}
                </p>
                {selectedAdmin.organization_status?.toUpperCase() === "ARCHIVED" ? (
                  <p className="mt-4 rounded-lg border border-slate-400/20 bg-slate-500/[0.06] p-3 text-xs leading-5 text-slate-300">
                    This organization is archived, so administrator access is blocked. Individual status actions are unavailable for archived organizations.
                  </p>
                ) : selectedAdmin.account_status?.toUpperCase() === "ACTIVE" &&
                selectedAdmin.organization_status?.toUpperCase() === "SUSPENDED" ? (
                  <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-200">
                    This organization is suspended, so administrator access is already blocked. The individual Suspend action is hidden until the organization is reactivated.
                  </p>
                ) : (selectedAdmin.account_status?.toUpperCase() === "ACTIVE" ||
                    selectedAdmin.account_status?.toUpperCase() === "SUSPENDED") ? (
                  <button
                    type="button"
                    onClick={() => openStatusChangeModal(selectedAdmin)}
                    className={`mt-4 w-full rounded-lg border px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60 ${
                      selectedAdmin.account_status?.toUpperCase() === "SUSPENDED"
                        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : "border-rose-400/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                    }`}
                  >
                    {selectedAdmin.account_status?.toUpperCase() === "SUSPENDED"
                      ? "Reactivate Administrator"
                      : "Suspend Administrator"}
                  </button>
                ) : (
                  <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
                    Status actions are available for active or suspended accounts only.
                  </p>
                )}
                {selectedAdmin.account_status?.toUpperCase() === "ACTIVE" && selectedAdmin.organization_status?.toUpperCase() === "ACTIVE" && (
                  <div className="mt-4 border-t border-[#29384b] pt-4">
                    <button
                      type="button"
                      onClick={() => openReplacementAdminInvite(selectedAdmin)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60"
                    >
                      <Icon name="email" size={17} /> Invite replacement administrator
                    </button>
                    <p className="mt-2 text-xs leading-5 text-slate-400">Invite the successor first. Keep the current admin active until the new admin accepts and you can verify access; then suspend the former account with an audit reason.</p>
                    {replacementInviteMessage && <p role="status" className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-200">{replacementInviteMessage}</p>}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-3">
                  <SuperAdminOrganizationLogo
                    organizationId={selectedAdmin.organization_id}
                    name={selectedAdmin.organization_name}
                    size="md"
                  />
                  <h3 className="font-bold text-[#f8fafc]">Organization</h3>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-300">Name</dt>
                    <dd className="mt-1 font-semibold text-slate-100">
                      {selectedAdmin.organization_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-300">Slug</dt>
                    <dd className="mt-1 text-slate-200">
                      {selectedAdmin.organization_slug}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-slate-300">
                      Organization status
                    </dt>
                    <dd>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${getOrganizationStatusStyle(
                          selectedAdmin.organization_status,
                        )}`}
                      >
                        {formatStatus(selectedAdmin.organization_status)}
                      </span>
                    </dd>
                  </div>
                  <div className="pt-1">
                    <Link
                      href={`/dashboard/organizations?organizationId=${encodeURIComponent(
                        selectedAdmin.organization_id,
                      )}&panel=view`}
                      onClick={() => setSelectedAdmin(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9ed8ff] hover:text-[#d8efff]"
                    >
                      View organization details
                      <Icon name="external" size={14} />
                    </Link>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                    <Icon name="users" size={17} />
                  </span>
                  <h3 className="font-bold text-[#f8fafc]">
                    Profile information
                  </h3>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-300">Designation</dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.designation || "Not provided"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-300">Employee code</dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.employee_code || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-300">Phone</dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.phone || "Not provided"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-300">Country</dt>
                    <dd className="mt-1 break-words font-medium text-slate-100">
                      {selectedAdmin.country || "Not provided"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-300">City</dt>
                    <dd className="mt-1 break-words font-medium text-slate-100">
                      {selectedAdmin.city || "Not provided"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-300">
                      Employment status
                    </dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.employment_status
                        ? formatStatus(selectedAdmin.employment_status)
                        : "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-300">Joining date</dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.joining_date
                        ? formatDate(selectedAdmin.joining_date)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">
                    <Icon name="shield" size={17} />
                  </span>
                  <h3 className="font-bold text-[#f8fafc]">
                    Account activity
                  </h3>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-300">Account created</dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {formatDateTime(selectedAdmin.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-300">Last updated</dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {formatDateTime(selectedAdmin.updated_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-300">
                      Last successful login
                    </dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {formatDateTime(selectedAdmin.last_login_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-300">
                      Latest invitation status
                    </dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.latest_invitation_status
                        ? formatStatus(selectedAdmin.latest_invitation_status)
                        : "No invitation record found"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-300">
                      Latest invitation expiry
                    </dt>
                    <dd className="mt-1 font-medium text-slate-100">
                      {selectedAdmin.latest_invitation_expires_at
                        ? formatDateTime(
                            selectedAdmin.latest_invitation_expires_at,
                          )
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              <p className="px-1 pb-3 text-[11px] leading-5 text-slate-400">
                Status changes are processed by the secured Super Admin API and recorded in the platform audit log. Invitation management remains in the Invitations workflow.
              </p>
            </div>
          </aside>
        </>
      )}

      {statusChangeAdmin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close status confirmation"
            disabled={statusChangeSubmitting}
            onClick={() => {
              if (statusChangeSubmitting) return;
              setStatusChangeAdmin(null);
              setStatusChangeError("");
            }}
          />
          <section
            ref={statusChangeDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-status-modal-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-[#34465d] bg-[#111a28] p-6 text-[#f8fafc] shadow-[0_24px_90px_rgba(0,0,0,0.65)] sm:p-7"
          >
            <div className="flex items-start gap-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${statusChangeAdmin.account_status?.toUpperCase() === "SUSPENDED" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-rose-400/25 bg-rose-500/10 text-rose-300"}`}>
                <Icon name="shield" size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="admin-status-modal-title" className="text-lg font-bold tracking-tight">
                  {statusChangeAdmin.account_status?.toUpperCase() === "SUSPENDED" ? "Reactivate Organization Admin?" : "Suspend Organization Admin?"}
                </h2>
                <p className="mt-2 break-all text-sm font-semibold text-slate-200">
                  {getDisplayName(statusChangeAdmin)}
                </p>
                <p className="mt-1 break-all text-xs text-slate-400">
                  {statusChangeAdmin.email}
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-300">
              {statusChangeAdmin.account_status?.toUpperCase() === "SUSPENDED"
                ? "Reactivating this account restores its individual account status to ACTIVE. Access will still depend on the organization's status."
                : "Suspending this account prevents the administrator from using this account while preserving the account and its records. The backend will prevent suspending the last active Organization Admin."}
            </p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleConfirmStatusChange();
              }}
            >
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-200">
                  Reason for this action <span className="text-rose-300">*</span>
                </span>
                <textarea
                  ref={statusChangeReasonRef}
                  value={statusChangeReason}
                  onChange={(event) => setStatusChangeReason(event.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  placeholder="Explain why this account status is being changed..."
                  className="w-full resize-y rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 py-3 text-sm leading-6 text-[#f8fafc] outline-none placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20 disabled:opacity-60"
                  disabled={statusChangeSubmitting}
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Required for the platform audit trail. Maximum 500 characters.
                </span>
              </label>

              {statusChangeError && (
                <div role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm leading-5 text-rose-300">
                  {statusChangeError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (statusChangeSubmitting) return;
                    setStatusChangeAdmin(null);
                    setStatusChangeError("");
                  }}
                  disabled={statusChangeSubmitting}
                  className="rounded-lg border border-[#34465d] bg-[#182232] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusChangeSubmitting || statusChangeReason.trim().length < 3}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60 disabled:cursor-not-allowed disabled:opacity-50 ${statusChangeAdmin.account_status?.toUpperCase() === "SUSPENDED" ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25" : "border-rose-400/25 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"}`}
                >
                  {statusChangeSubmitting ? "Saving..." : statusChangeAdmin.account_status?.toUpperCase() === "SUSPENDED" ? "Confirm Reactivation" : "Confirm Suspension"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {replacementInviteAdmin && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close replacement invitation" disabled={replacementInviteSubmitting} onClick={() => { if (!replacementInviteSubmitting) { setReplacementInviteAdmin(null); setReplacementInviteError(""); } }} />
          <section ref={replacementInviteDialogRef} role="dialog" aria-modal="true" aria-labelledby="replacement-admin-invite-title" className="relative z-10 w-full max-w-lg rounded-2xl border border-[#34465d] bg-[#111a28] p-6 text-[#f8fafc] shadow-[0_24px_90px_rgba(0,0,0,0.65)] sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 text-sky-200"><Icon name="email" size={21} /></span>
              <div className="min-w-0 flex-1">
                <h2 id="replacement-admin-invite-title" className="text-lg font-bold tracking-tight">Invite a replacement Organization Admin</h2>
                <p className="mt-2 break-words text-sm font-semibold text-slate-200">{replacementInviteAdmin.organization_name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Current administrator: {replacementInviteAdmin.email}</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-100">
              The current administrator will remain active. Send the invitation first, verify the successor accepts it and can access the organization, then suspend the former administrator through the audited status workflow. This avoids accidentally locking the organization out.
            </div>
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void handleReplacementAdminInvite(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-200">Replacement admin email <span className="text-rose-300">*</span></span>
                <input ref={replacementInviteEmailRef} type="email" required maxLength={254} autoComplete="email" value={replacementInviteEmail} onChange={(event) => setReplacementInviteEmail(event.target.value)} placeholder="new.admin@example.com" aria-invalid={Boolean(replacementInviteError)} className="w-full rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 py-3 text-sm text-[#f8fafc] outline-none placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20 disabled:opacity-60" disabled={replacementInviteSubmitting} autoFocus />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-200">First name <span className="text-rose-300">*</span></span><input type="text" required minLength={2} maxLength={100} autoComplete="given-name" value={replacementAdminFirstName} onChange={(event) => setReplacementAdminFirstName(event.target.value)} disabled={replacementInviteSubmitting} className="w-full rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 py-3 text-sm text-white outline-none focus:border-[#75c7ff] disabled:opacity-60" /></label>
                <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-200">Last name <span className="text-rose-300">*</span></span><input type="text" required minLength={1} maxLength={100} autoComplete="family-name" value={replacementAdminLastName} onChange={(event) => setReplacementAdminLastName(event.target.value)} disabled={replacementInviteSubmitting} className="w-full rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 py-3 text-sm text-white outline-none focus:border-[#75c7ff] disabled:opacity-60" /></label>
              </div>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-200">Country <span className="text-rose-300">*</span></span><CountrySelect id="replacement-admin-country" value={replacementAdminCountry} required disabled={replacementInviteSubmitting} onChange={(value) => { setReplacementAdminPhone((current) => replacePhoneCountryCode(current, replacementAdminCountry, value)); setReplacementAdminCountry(value); }} className="h-12 w-full rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 text-sm text-white outline-none focus:border-[#75c7ff]" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-200">City <span className="text-rose-300">*</span></span><input type="text" required minLength={2} maxLength={100} autoComplete="address-level2" value={replacementAdminCity} onChange={(event) => setReplacementAdminCity(event.target.value)} disabled={replacementInviteSubmitting} className="w-full rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 py-3 text-sm text-white outline-none focus:border-[#75c7ff] disabled:opacity-60" /></label>
                <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-200">Phone <span className="text-rose-300">*</span></span><input type="tel" required maxLength={50} autoComplete="tel" value={replacementAdminPhone} onChange={(event) => setReplacementAdminPhone(event.target.value)} disabled={replacementInviteSubmitting} className="w-full rounded-xl border border-[#34465d] bg-[#0b111b] px-3.5 py-3 text-sm text-white outline-none focus:border-[#75c7ff] disabled:opacity-60" /></label>
              </div>
              {replacementInviteError && <div role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm leading-5 text-rose-300">{replacementInviteError}</div>}
              <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => { if (replacementInviteSubmitting) return; setReplacementInviteAdmin(null); setReplacementInviteError(""); }} disabled={replacementInviteSubmitting} className="rounded-lg border border-[#34465d] bg-[#182232] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={replacementInviteSubmitting || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replacementInviteEmail.trim()) || replacementInviteEmail.trim().toLowerCase() === replacementInviteAdmin.email.trim().toLowerCase() || replacementAdminFirstName.trim().length < 2 || !replacementAdminLastName.trim() || !replacementAdminCountry.trim() || replacementAdminCity.trim().length < 2 || !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(replacementAdminPhone.trim()) || replacementAdminPhone.replace(/\D/g, "").length < 7 || replacementAdminPhone.replace(/\D/g, "").length > 15} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50">{replacementInviteSubmitting ? "Sending invitation…" : "Send invitation"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandItems}
        onSelect={selectCommandItem}
        blocked={Boolean(selectedAdmin)}
      />
    </div>
  );
}
