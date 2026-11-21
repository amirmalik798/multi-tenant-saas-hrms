"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { CountryDisplay, CountrySelect, replacePhoneCountryCode } from "../../../components/workforce/CountryPhoneFields";
import { SuperAdminOrganizationLogo, SuperAdminUserAvatar } from "../../../components/super-admin/SuperAdminImages";
import {
  CommandPalette,
  buildSuperAdminCommandItems,
  type CommandPaletteItem,
  type CommandPaletteOrganization,
} from "../../../components/super-admin/CommandPalette";
import SuperAdminThemeToggle from "../../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../../components/WorkspaceClock";
type Organization = {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  country?: string | null;
  status: string;
  created_at: string;
  license?: OrganizationLicense | null;
};
type OrganizationLicense = {
  organizationId: string;
  licenseExists: boolean;
  status: "NOT_ACTIVATED" | "ACTIVE" | "EXPIRED";
  activationSource: "NONE" | "LEGACY_GRACE" | "PAYMENT" | null;
  startsAt: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
  canAccess: boolean;
  restrictionReason: "LICENSE_RECORD_MISSING" | "NOT_ACTIVATED" | "EXPIRED" | null;
  databaseTime: string;
};
type Invitation = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
type OrganizationAccount = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  employee_code: string | null;
  designation: string | null;
};
type OrganizationUsersSummary = {
  total: number;
  active: number;
  invited: number;
  suspended: number;
  deactivated: number;
};
type OrganizationUserFilter = "ALL" | "ACTIVE" | "INVITED" | "SUSPENDED" | "DEACTIVATED";
type IconName =
  | "dashboard"
  | "building"
  | "users"
  | "admin"
  | "mail"
  | "credit-card"
  | "message"
  | "activity"
  | "bell"
  | "chevron"
  | "clock"
  | "arrow"
  | "shield"
  | "calendar"
  | "copy"
  | "check"
  | "external"
  | "logout"
  | "search";
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
    "credit-card": (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M7 15h3" />
      </>
    ),
    message: <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
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
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    external: (
      <>
        <path d="M14 3h7v7M21 3 11 13" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
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
function formatDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function getEffectiveInvitationStatus(invitation: Invitation) {
  if (invitation.status === "PENDING") {
    const expiry = new Date(invitation.expires_at).getTime();
    if (Number.isFinite(expiry) && expiry <= Date.now()) return "EXPIRED";
  }
  return invitation.status;
}

function getLicenseStatusPresentation(status: OrganizationLicense["status"]) {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" };
    case "EXPIRED":
      return { label: "Expired", className: "border-rose-400/25 bg-rose-500/10 text-rose-300" };
    default:
      return { label: "Not activated", className: "border-amber-400/25 bg-amber-500/10 text-amber-300" };
  }
}
function statusBadge(status: string) {
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
function accountStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    case "INVITED":
      return "bg-amber-500/10 text-amber-300 ring-amber-400/20";
    case "SUSPENDED":
      return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
    case "DEACTIVATED":
      return "bg-white/[0.06] text-slate-300 ring-white/10";
    default:
      return "bg-white/[0.06] text-slate-300 ring-white/10";
  }
}
function getOrganizationStatusDotStyle(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "PENDING_SETUP": return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]";
    case "SUSPENDED": return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]";
    default: return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
  }
}
function getAccountStatusDotStyle(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    case "INVITED": return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]";
    case "SUSPENDED": return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]";
    default: return "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]";
  }
}
function getEffectiveUserAccessStatus(
  account: OrganizationAccount,
  organizationStatus: string | null | undefined,
) {
  if (organizationStatus?.toUpperCase() === "SUSPENDED") {
    return "SUSPENDED";
  }
  return account.status;
}
export default function OrganizationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationReloadKey, setOrganizationReloadKey] = useState(0);
  const organizationLoadedIdRef = useRef<string | null>(null);
  const invitationsLoadedRef = useRef(false);
  const organizationUsersLoadedRef = useRef(false);
  const lastBackgroundRefreshRef = useRef(0);
  const [error, setError] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusConfirmationOpen, setStatusConfirmationOpen] = useState(false);
  const [statusConfirmationSlug, setStatusConfirmationSlug] = useState("");
  const statusDialogRef = useRef<HTMLDivElement>(null);
  const statusConfirmationInputRef = useRef<HTMLInputElement>(null);
  const statusConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const archiveReasonInputRef = useRef<HTMLTextAreaElement>(null);
  const archiveConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationAdminFirstName, setInvitationAdminFirstName] = useState("");
  const [invitationAdminLastName, setInvitationAdminLastName] = useState("");
  const [invitationAdminCountry, setInvitationAdminCountry] = useState("");
  const [invitationAdminCity, setInvitationAdminCity] = useState("");
  const [invitationAdminPhone, setInvitationAdminPhone] = useState("");
  const [invitationCreating, setInvitationCreating] = useState(false);
  const [invitationError, setInvitationError] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [invitationsError, setInvitationsError] = useState("");
  const [invitationReloadKey, setInvitationReloadKey] = useState(0);
  const [invitationRevocationTarget, setInvitationRevocationTarget] = useState<Invitation | null>(null);
  const [invitationRevocationReason, setInvitationRevocationReason] = useState("");
  const [invitationRevocationError, setInvitationRevocationError] = useState("");
  const [invitationRevoking, setInvitationRevoking] = useState(false);
  const invitationRevokingRef = useRef(false);
  invitationRevokingRef.current = invitationRevoking;
  const invitationRevocationDialogRef = useRef<HTMLDivElement>(null);
  const invitationRevocationReasonInputRef = useRef<HTMLTextAreaElement>(null);
  const [organizationUsers, setOrganizationUsers] =
    useState<OrganizationAccount[]>([]);
  const [organizationUsersSummary, setOrganizationUsersSummary] =
    useState<OrganizationUsersSummary | null>(null);
  const [organizationUsersLoading, setOrganizationUsersLoading] =
    useState(true);
  const [organizationUsersError, setOrganizationUsersError] = useState("");
  const [organizationUsersReloadKey, setOrganizationUsersReloadKey] = useState(0);
  const [organizationUserFilter, setOrganizationUserFilter] = useState<OrganizationUserFilter>("ALL");
  const [organizationUserSearch, setOrganizationUserSearch] = useState("");
  const [debouncedOrganizationUserSearch, setDebouncedOrganizationUserSearch] = useState("");
  const [organizationUsersMatchingTotal, setOrganizationUsersMatchingTotal] = useState(0);
  const [organizationUsersHasMore, setOrganizationUsersHasMore] = useState(false);
  const [loadingMoreOrganizationUsers, setLoadingMoreOrganizationUsers] = useState(false);
  const [organizationUsersMoreError, setOrganizationUsersMoreError] = useState("");
  const organizationUsersMoreControllerRef = useRef<AbortController | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOrganizations, setPaletteOrganizations] = useState<CommandPaletteOrganization[]>([]);
  useEffect(() => {
    organizationUsersMoreControllerRef.current?.abort();
    invitationsLoadedRef.current = false;
    organizationUsersLoadedRef.current = false;
    setInvitations([]);
    setOrganizationUsers([]);
    setOrganizationUsersSummary(null);
    setOrganizationUsersMatchingTotal(0);
    setOrganizationUsersHasMore(false);
    setInvitationsLoading(true);
    setOrganizationUsersLoading(true);
  }, [id]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const isNewOrganization = organizationLoadedIdRef.current !== id;
    if (isNewOrganization) {
      organizationLoadedIdRef.current = null;
      setOrganization(null);
      setError("");
      setLoading(true);
    }

    async function loadOrganization() {
      try {
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(id)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Could not load organization details.");
        }
        if (!data.organization) {
          throw new Error("The server did not return organization details.");
        }
        if (isActive) {
          setOrganization({ ...data.organization, license: data.license ?? null });
          setError("");
          organizationLoadedIdRef.current = id;
        }
      } catch (err) {
        if (isActive && !controller.signal.aborted && !organization) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        if (isActive && !controller.signal.aborted) setLoading(false);
      }
    }
    void loadOrganization();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [id, router, organizationReloadKey]);
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    if (!invitationsLoadedRef.current) setInvitationsLoading(true);
    async function loadInvitations() {
      try {
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(id)}/invitations`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || "Could not load invitation history.",
          );
        }
        if (!Array.isArray(data.invitations)) {
          throw new Error("Unexpected invitation history response.");
        }
        if (isActive) {
          setInvitations(data.invitations);
          setInvitationsError("");
          invitationsLoadedRef.current = true;
        }
      } catch (err) {
        if (isActive && !controller.signal.aborted && !invitationsLoadedRef.current) {
          setInvitationsError(
            err instanceof Error
              ? err.message
              : "Failed to load invitation history.",
          );
        }
      } finally {
        if (isActive && !controller.signal.aborted) setInvitationsLoading(false);
      }
    }
    void loadInvitations();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [id, router, invitationReloadKey]);
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    organizationUsersMoreControllerRef.current?.abort();
    if (!organizationUsersLoadedRef.current) setOrganizationUsersLoading(true);
    setLoadingMoreOrganizationUsers(false);
    setOrganizationUsersError("");
    setOrganizationUsersMoreError("");

    // If the whole organization is suspended, every linked account has suspended access,
    // so fetch all account records and apply the effective status filter in the UI.
    const apiStatusFilter: OrganizationUserFilter =
      organization?.status?.toUpperCase() === "SUSPENDED" ? "ALL" : organizationUserFilter;
    const query = new URLSearchParams({
      status: apiStatusFilter,
      offset: "0",
      q: debouncedOrganizationUserSearch,
    });

    async function loadOrganizationUsers() {
      try {
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(id)}/users?${query.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || "Could not load organization users.");
        }
        if (!Array.isArray(data.users)) {
          throw new Error("Unexpected organization users response.");
        }
        const users = data.users as OrganizationAccount[];
        const counts = data.counts ?? {};
        const totalValue = Number(data.total);
        const total = Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : users.length;
        const matchingValue = Number(data.matchingTotal);
        const matchingTotal = Number.isFinite(matchingValue) && matchingValue >= 0 ? matchingValue : total;
        if (isActive) {
          setOrganizationUsers(users);
          organizationUsersLoadedRef.current = true;
          setOrganizationUsersSummary({
            total,
            active: Number(counts.active) || 0,
            invited: Number(counts.invited) || 0,
            suspended: Number(counts.suspended) || 0,
            deactivated: Number(counts.deactivated) || 0,
          });
          setOrganizationUsersMatchingTotal(matchingTotal);
          setOrganizationUsersHasMore(Boolean(data.hasMore));
          setOrganizationUsersError("");
        }
      } catch (err) {
        if (isActive && !controller.signal.aborted) {
          setOrganizationUsersError(
            err instanceof Error ? err.message : "Could not load organization users.",
          );
        }
      } finally {
        if (isActive && !controller.signal.aborted) setOrganizationUsersLoading(false);
      }
    }
    void loadOrganizationUsers();
    return () => {
      isActive = false;
      controller.abort();
      organizationUsersMoreControllerRef.current?.abort();
    };
  }, [id, router, organizationUsersReloadKey, organizationUserFilter, organization?.status, debouncedOrganizationUserSearch]);

  const refreshOrganizationUsersInBackground = useCallback(async () => {
    const controller = new AbortController();
    organizationUsersMoreControllerRef.current?.abort();
    organizationUsersMoreControllerRef.current = controller;
    const targetLoadedCount = Math.max(organizationUsers.length, 100);
    const apiStatusFilter: OrganizationUserFilter =
      organization?.status?.toUpperCase() === "SUSPENDED" ? "ALL" : organizationUserFilter;
    const refreshedUsers: OrganizationAccount[] = [];
    let offset = 0;
    let firstPageData: Record<string, unknown> | null = null;

    try {
      do {
        const query = new URLSearchParams({
          status: apiStatusFilter,
          offset: String(offset),
          q: debouncedOrganizationUserSearch,
        });
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(id)}/users?${query.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.users)) return;
        if (!firstPageData) firstPageData = data;
        const pageUsers = data.users as OrganizationAccount[];
        refreshedUsers.push(...pageUsers);
        offset += pageUsers.length;
        if (pageUsers.length === 0 || !data.hasMore || offset >= targetLoadedCount) break;
      } while (!controller.signal.aborted);

      if (controller.signal.aborted || !firstPageData) return;
      const counts = (firstPageData.counts ?? {}) as Record<string, unknown>;
      const totalValue = Number(firstPageData.total);
      const total = Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : refreshedUsers.length;
      const matchingValue = Number(firstPageData.matchingTotal);
      const matchingTotal = Number.isFinite(matchingValue) && matchingValue >= 0 ? matchingValue : total;
      const visibleUsers = refreshedUsers.slice(0, targetLoadedCount);
      setOrganizationUsers(visibleUsers);
      setOrganizationUsersSummary({
        total,
        active: Number(counts.active) || 0,
        invited: Number(counts.invited) || 0,
        suspended: Number(counts.suspended) || 0,
        deactivated: Number(counts.deactivated) || 0,
      });
      setOrganizationUsersMatchingTotal(matchingTotal);
      setOrganizationUsersHasMore(visibleUsers.length < matchingTotal);
      setOrganizationUsersError("");
    } catch {
      // Background refresh is intentionally non-disruptive; keep the last good data.
    }
  }, [id, router, organization?.status, organizationUserFilter, debouncedOrganizationUserSearch, organizationUsers.length]);

  useEffect(() => {
    const refreshData = () => {
      if (document.visibilityState !== "visible") return;
      if (statusConfirmationOpen || archiveConfirmationOpen || statusUpdating || invitationRevocationTarget || invitationCreating || invitationRevoking || loadingMoreOrganizationUsers || organizationUsersLoading) return;
      const now = Date.now();
      if (now - lastBackgroundRefreshRef.current < 55_000) return;
      lastBackgroundRefreshRef.current = now;
      setOrganizationReloadKey((key) => key + 1);
      setInvitationReloadKey((key) => key + 1);
      void refreshOrganizationUsersInBackground();
    };

    if (lastBackgroundRefreshRef.current === 0) {
      lastBackgroundRefreshRef.current = Date.now();
    }
    const interval = window.setInterval(refreshData, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshData();
    };
    window.addEventListener("focus", refreshData);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshData);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [statusConfirmationOpen, archiveConfirmationOpen, statusUpdating, invitationRevocationTarget, invitationCreating, invitationRevoking, loadingMoreOrganizationUsers, organizationUsersLoading, refreshOrganizationUsersInBackground]);

  useEffect(() => {
    let isActive = true;
    async function loadPaletteOrganizations() {
      try {
        const response = await fetch("/api/backend/organizations", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const candidateItems: unknown = Array.isArray(data) ? data : data.organizations;
        if (!Array.isArray(candidateItems)) return;
        const items = candidateItems.filter(
          (item: unknown): item is CommandPaletteOrganization =>
            typeof item === "object" && item !== null &&
            typeof (item as CommandPaletteOrganization).id === "string" &&
            typeof (item as CommandPaletteOrganization).name === "string" &&
            typeof (item as CommandPaletteOrganization).slug === "string" &&
            typeof (item as CommandPaletteOrganization).status === "string",
        ).map((item) => ({ id: item.id, name: item.name, slug: item.slug, status: item.status }));
        if (isActive) setPaletteOrganizations(items);
      } catch {
        // Palette discovery is optional; the details page should remain usable if it fails.
      }
    }
    void loadPaletteOrganizations();
    return () => { isActive = false; };
  }, []);

  const commandItems = useMemo(
    () => buildSuperAdminCommandItems(paletteOrganizations),
    [paletteOrganizations],
  );

  const selectCommandItem = useCallback((item: CommandPaletteItem) => {
    if (item.disabled || !item.href) return;
    setCommandPaletteOpen(false);
    router.push(item.href);
  }, [router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedOrganizationUserSearch(organizationUserSearch.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [organizationUserSearch]);

  async function loadMoreOrganizationUsers() {
    if (loadingMoreOrganizationUsers || organizationUsersLoading || !canLoadMoreOrganizationUsers) return;
    const controller = new AbortController();
    organizationUsersMoreControllerRef.current?.abort();
    organizationUsersMoreControllerRef.current = controller;
    setLoadingMoreOrganizationUsers(true);
    setOrganizationUsersMoreError("");
    const apiStatusFilter: OrganizationUserFilter =
      organization?.status?.toUpperCase() === "SUSPENDED" ? "ALL" : organizationUserFilter;
    const query = new URLSearchParams({
      status: apiStatusFilter,
      offset: String(organizationUsers.length),
      q: debouncedOrganizationUserSearch,
    });
    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(id)}/users?${query.toString()}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.users)) {
        throw new Error(data.message || "Could not load more organization users.");
      }
      if (controller.signal.aborted) return;
      const nextUsers = data.users as OrganizationAccount[];
      setOrganizationUsers((current) => {
        const knownIds = new Set(current.map((account) => account.id));
        return [...current, ...nextUsers.filter((account) => !knownIds.has(account.id))];
      });
      setOrganizationUsersMatchingTotal(Number(data.matchingTotal) || 0);
      setOrganizationUsersHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (!controller.signal.aborted) {
        setOrganizationUsersMoreError(
          err instanceof Error ? err.message : "Could not load more organization users.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMoreOrganizationUsers(false);
    }
  }

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
    } catch (err) {
      setLogoutError(
        err instanceof Error
          ? err.message
          : "Could not log out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }
  async function handleCreateInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvitationError("");
    setInvitationUrl("");
    setCopyMessage("");
    setInvitationCreating(true);
    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(id)}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: invitationEmail.trim().toLowerCase(),
            adminFirstName: invitationAdminFirstName.trim(),
            adminLastName: invitationAdminLastName.trim(),
            adminPhone: invitationAdminPhone.trim(),
            adminCountry: invitationAdminCountry.trim(),
            adminCity: invitationAdminCity.trim(),
          }),
        },
      );
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || "Failed to create invitation.");
      }
      if (
        typeof data.invitationUrl !== "string" ||
        !data.invitation ||
        typeof data.invitation.id !== "string"
      ) {
        throw new Error(
          "The server did not return complete invitation details.",
        );
      }
      setInvitationUrl(data.invitationUrl);
      setInvitationEmail("");
      setInvitationAdminFirstName("");
      setInvitationAdminLastName("");
      setInvitationAdminCountry("");
      setInvitationAdminCity("");
      setInvitationAdminPhone("");
      const newInvitation: Invitation = {
        id: data.invitation.id,
        email: data.invitation.email,
        status: data.invitation.status,
        expires_at: data.invitation.expiresAt,
        accepted_at: null,
        revoked_at: null,
        created_at: data.invitation.createdAt,
      };
      setInvitations((current) => [
        newInvitation,
        ...current.filter(
          (invitation) => invitation.id !== newInvitation.id,
        ),
      ]);
    } catch (err) {
      setInvitationError(
        err instanceof Error
          ? err.message
          : "Could not create invitation.",
      );
    } finally {
      setInvitationCreating(false);
    }
  }
  function openInvitationRevocationDialog(invitation: Invitation) {
    setInvitationRevocationTarget(invitation);
    setInvitationRevocationReason("");
    setInvitationRevocationError("");
  }

  function closeInvitationRevocationDialog() {
    if (invitationRevokingRef.current) return;
    setInvitationRevocationTarget(null);
    setInvitationRevocationReason("");
    setInvitationRevocationError("");
  }

  async function handleConfirmInvitationRevocation() {
    const target = invitationRevocationTarget;
    const reason = invitationRevocationReason.trim();
    if (!target || invitationRevoking) return;

    if (reason.length < 3 || reason.length > 1000) {
      setInvitationRevocationError(
        "Enter a revocation reason between 3 and 1000 characters.",
      );
      return;
    }

    setInvitationRevocationError("");
    setInvitationRevoking(true);

    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(id)}/invitations`,
        {
          method: "PATCH",
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
        setInvitationReloadKey((key) => key + 1);
        throw new Error(data.message || "Failed to revoke invitation.");
      }

      const revokedAt = data.invitation?.revokedAt ?? new Date().toISOString();
      setInvitations((current) =>
        current.map((invitation) =>
          invitation.id === target.id
            ? { ...invitation, status: "REVOKED", revoked_at: revokedAt }
            : invitation,
        ),
      );
      setInvitationRevocationTarget(null);
      setInvitationRevocationReason("");
      setInvitationRevocationError("");
      setInvitationReloadKey((key) => key + 1);
    } catch (err) {
      setInvitationRevocationError(
        err instanceof Error ? err.message : "Could not revoke this invitation.",
      );
    } finally {
      setInvitationRevoking(false);
    }
  }

  async function handleCopyInvitationLink() {
    if (!invitationUrl) return;
    setCopyMessage("");
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopyMessage("Invitation link copied successfully.");
    } catch {
      setCopyMessage(
        "Automatic copying failed. Select the URL above and copy it manually.",
      );
    }
  }
  async function changeOrganizationStatus(
    nextStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED",
    reason?: string,
  ) {
    setStatusError("");
    setStatusMessage("");
    setStatusUpdating(true);
    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: nextStatus,
            ...(reason ? { reason } : {}),
          }),
        },
      );
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update organization status.",
        );
      }
      setOrganization((current) =>
        current
          ? { ...current, status: data.organization.status }
          : current,
      );
      setStatusMessage(
        `Organization status updated to ${formatStatus(data.organization.status)}.`,
      );
      return true;
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : "Could not update organization status.",
      );
      return false;
    } finally {
      setStatusUpdating(false);
    }
  }

  const closeOrganizationStatusDialog = useCallback(() => {
    if (statusUpdating) return;
    setStatusConfirmationOpen(false);
    setStatusConfirmationSlug("");
    setStatusError("");
  }, [statusUpdating]);

  async function handleConfirmOrganizationStatusChange() {
    if (!organization || statusUpdating) return;
    const isSuspending = organization.status === "ACTIVE";
    const nextStatus = isSuspending ? "SUSPENDED" : "ACTIVE";
    if (isSuspending && statusConfirmationSlug.trim() !== organization.slug.trim()) {
      setStatusError("Enter the organization slug exactly as shown to confirm suspension.");
      return;
    }
    const saved = await changeOrganizationStatus(nextStatus);
    if (saved) {
      setStatusConfirmationOpen(false);
      setStatusConfirmationSlug("");
    }
  }

  function openOrganizationStatusAction() {
    if (
      !organization ||
      organization.status === "PENDING_SETUP" ||
      organization.status === "ARCHIVED" ||
      statusUpdating
    ) return;
    setStatusConfirmationSlug("");
    setStatusError("");
    setStatusMessage("");
    setStatusConfirmationOpen(true);
  }

  const closeArchiveDialog = useCallback(() => {
    if (statusUpdating) return;
    setArchiveConfirmationOpen(false);
    setArchiveReason("");
    setStatusError("");
  }, [statusUpdating]);

  function openArchiveOrganizationDialog() {
    if (!organization || organization.status !== "SUSPENDED" || statusUpdating) return;
    setArchiveReason("");
    setStatusError("");
    setStatusMessage("");
    setArchiveConfirmationOpen(true);
  }

  async function handleConfirmArchiveOrganization() {
    if (!organization || organization.status !== "SUSPENDED" || statusUpdating) return;
    const normalizedReason = archiveReason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) {
      setStatusError("Enter an archive reason between 3 and 1000 characters.");
      return;
    }
    const saved = await changeOrganizationStatus("ARCHIVED", normalizedReason);
    if (saved) {
      setArchiveConfirmationOpen(false);
      setArchiveReason("");
    }
  }

  useEffect(() => {
    if (!statusConfirmationOpen || statusUpdating) return;
    function handleStatusDialogEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOrganizationStatusDialog();
      }
    }
    window.addEventListener("keydown", handleStatusDialogEscape);
    return () => window.removeEventListener("keydown", handleStatusDialogEscape);
  }, [statusConfirmationOpen, statusUpdating, closeOrganizationStatusDialog]);

  useEffect(() => {
    if (!statusConfirmationOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (organization?.status === "ACTIVE") {
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
  }, [statusConfirmationOpen, organization?.status]);

  useEffect(() => {
    if (!archiveConfirmationOpen || statusUpdating) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    archiveReasonInputRef.current?.focus();

    function handleArchiveDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeArchiveDialog();
        return;
      }
      if (event.key !== "Tab" || !archiveDialogRef.current) return;
      const focusable = Array.from(archiveDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

    document.addEventListener("keydown", handleArchiveDialogKeydown);
    return () => {
      document.removeEventListener("keydown", handleArchiveDialogKeydown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [archiveConfirmationOpen, statusUpdating, closeArchiveDialog]);

  useEffect(() => {
    if (!invitationRevocationTarget) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    invitationRevocationReasonInputRef.current?.focus();

    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!invitationRevokingRef.current) closeInvitationRevocationDialog();
        return;
      }
      if (event.key !== "Tab" || !invitationRevocationDialogRef.current) return;
      const focusable = Array.from(invitationRevocationDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

    document.addEventListener("keydown", handleDialogKeydown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeydown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [invitationRevocationTarget]);

  const filteredOrganizationUsers = useMemo(() => {
    const query = debouncedOrganizationUserSearch.toLowerCase();
    return organizationUsers.filter((account) => {
      const effectiveStatus = getEffectiveUserAccessStatus(account, organization?.status).toUpperCase();
      if (organization?.status?.toUpperCase() === "SUSPENDED" && organizationUserFilter !== "ALL" && effectiveStatus !== organizationUserFilter) {
        return false;
      }
      if (!query) return true;
      return [account.display_name, account.email, account.role, account.designation ?? "", account.employee_code ?? ""]
        .some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [organizationUsers, organization, organizationUserFilter, debouncedOrganizationUserSearch]);

  const userFilterMatchingTotal = useMemo(() => {
    if (organization?.status?.toUpperCase() === "SUSPENDED" && organizationUserFilter !== "ALL" && organizationUserFilter !== "SUSPENDED") return 0;
    return organizationUsersMatchingTotal;
  }, [organization, organizationUserFilter, organizationUsersMatchingTotal]);

  const canLoadMoreOrganizationUsers = organizationUsersHasMore && !(
    organization?.status?.toUpperCase() === "SUSPENDED" && organizationUserFilter !== "ALL" && organizationUserFilter !== "SUSPENDED"
  );

  function openEditOrganizationDrawer() {
    if (!organization || organization.status === "ARCHIVED") return;
    const params = new URLSearchParams({ organizationId: organization.id, panel: "edit" });
    router.push(`/dashboard/organizations?${params.toString()}`);
  }

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
    {
      label: "Audit Logs",
      icon: "shield",
      href: "/dashboard/audit-logs",
    },
  ];
  const isPendingSetup = organization?.status === "PENDING_SETUP";
  const isActive = organization?.status === "ACTIVE";
  const isSuspended = organization?.status === "SUSPENDED";
  const isArchived = organization?.status === "ARCHIVED";
  const organizationRouteMismatch = Boolean(organization && organization.id !== id);
  const effectiveOrganizationUsersSummary =
    organizationUsersSummary && organization?.status?.toUpperCase() === "SUSPENDED"
      ? {
          ...organizationUsersSummary,
          active: 0,
          invited: 0,
          suspended: organizationUsersSummary.total,
          deactivated: 0,
        }
      : organizationUsersSummary;
  const invitationCount = invitations.length;
  const pendingInvitationCount = invitations.filter(
    (invitation) => getEffectiveInvitationStatus(invitation) === "PENDING",
  ).length;
  return (
    <div className="super-admin-theme-root super-admin-org-details-page min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark" style={{ backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)", backgroundSize: "auto, 42px 42px, 42px 42px" }}>
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
                  ? "border border-transparent font-medium text-slate-300 hover:border-[#29384b] hover:bg-white/[0.035] hover:text-white"
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
        <header className="sticky top-0 z-20 flex min-h-[71px] flex-col justify-center border-b border-[#29384b] bg-[#0f1724]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="hidden h-[43px] w-full max-w-[482px] sm:block">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label="Search commands and organizations; open command palette"
                aria-keyshortcuts="Control+K Meta+K"
                className="flex h-full w-full items-center justify-between gap-3 rounded-lg border border-[#29384b] bg-[#111a28] px-3.5 text-left text-sm text-slate-300 transition hover:border-[#75c7ff]/35 hover:bg-[#182232] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
              >
                <span className="flex min-w-0 items-center gap-3"><Icon name="search" size={18} /><span className="truncate">Search commands or organizations...</span></span>
                
              </button>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
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
                  <p className="text-xs leading-5 text-slate-300">
                    Platform Administrator
                  </p>
                </div>
                <span className="text-slate-200">
                  <Icon name="chevron" size={18} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="ml-1 inline-flex items-center gap-2 rounded-lg border border-[#29384b] bg-[#182232]/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#75c7ff]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                <Icon name="logout" size={16} />
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
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
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
                <Link href="/dashboard" className="rounded-sm hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20">
                  Dashboard
                </Link>
                <span>/</span>
                <Link
                  href="/dashboard/organizations"
                  className="rounded-sm hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20"
                >
                  Organizations
                </Link>
                <span>/</span>
                <span className="text-slate-300">Details</span>
              </div>
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8db9df]">
                <span className="h-px w-5 bg-[#75c7ff]/70" /> Platform Control <span className="text-slate-600">/</span> Organization Details
              </p>
              <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">
                {loading || organizationRouteMismatch
                  ? "Organization Details"
                  : organization?.name || "Organization Details"}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                Organization profile, access status, users, and invitations.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard/organizations"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#29384b] bg-[#182232]/80 px-4 py-2.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#75c7ff]/30"
              >
                <span aria-hidden="true">←</span> All Organizations
              </Link>
              {organization && (
                <button
                  type="button"
                  onClick={openEditOrganizationDrawer}
                  disabled={isArchived}
                  title={isArchived ? "Archived organizations are read-only." : undefined}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#75c7ff]/20 bg-[#21486a] px-4 py-2.5 text-sm font-semibold text-[#eff8ff] shadow-sm shadow-black/20 transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Edit Organization <Icon name="arrow" size={15} />
                </button>
              )}
            </div>
          </div>
          {loading || organizationRouteMismatch ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-sm">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                Loading organization details...
              </div>
            </div>
          ) : error || !organization ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-6 text-sm text-rose-300"
            >
              <p className="font-semibold">Unable to load organization</p>
              <p className="mt-1">{error || "Organization not found."}</p>
              <Link
                href="/dashboard/organizations"
                className="mt-4 inline-flex rounded-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20"
              >
                Return to organizations
              </Link>
            </div>
          ) : (
            <>
              {statusError && (
                <div
                  role="alert"
                  className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300"
                >
                  <p>{statusError}</p>
                  <button type="button" onClick={() => setStatusError("")} className="shrink-0 font-semibold underline">Dismiss</button>
                </div>
              )}
              {statusMessage && (
                <div
                  role="status"
                  className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"
                >
                  <p>{statusMessage}</p>
                  <button type="button" onClick={() => setStatusMessage("")} className="shrink-0 font-semibold underline">Dismiss</button>
                </div>
              )}
              {(isPendingSetup || isActive) && (
                <section className="relative isolate z-0 mb-8 mt-5 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                  <div className="flex items-center gap-3 border-b border-[#29384b] px-5 py-5 sm:px-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-300">
                      <Icon name="mail" size={21} />
                    </span>
                    <div>
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.13em] text-[#d5e1ef]">
                        Invite Organization Admin
                      </h2>
                      <p className="mt-1 text-xs text-slate-300">
                        {isPendingSetup
                          ? "Invite the first Organization Admin to complete setup."
                          : "Invite an additional Organization Admin to this active organization."}
                      </p>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                      <form onSubmit={handleCreateInvitation} className="min-w-0 space-y-4">
                        <div>
                          <label htmlFor="invitationEmail" className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-100">
                            <span>Administrator work email</span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300">Required</span>
                          </label>
                          <div className={`flex items-center gap-3 rounded-xl border bg-[#0f1724] px-3.5 transition focus-within:ring-4 focus-within:ring-blue-500/10 ${invitationEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail.trim()) ? "border-rose-400/60" : "border-[#29384b] focus-within:border-blue-400"}`}>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-slate-300"><Icon name="mail" size={17} /></span>
                            <input
                              id="invitationEmail"
                              type="email"
                              required
                              maxLength={254}
                              autoComplete="email"
                              value={invitationEmail}
                              onChange={(event) => { setInvitationEmail(event.target.value); setInvitationError(""); }}
                              placeholder="name@company.com"
                              aria-invalid={Boolean(invitationEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail.trim()))}
                              aria-describedby="invitation-email-help invitation-email-validation"
                              disabled={invitationCreating}
                              className="min-h-12 min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
                            />
                            {invitationEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail.trim()) && <span className="pr-1 text-emerald-300" aria-label="Valid email"><Icon name="check" size={17} /></span>}
                          </div>
                          <p id="invitation-email-help" className="mt-2 text-xs leading-5 text-slate-300">
                            {isPendingSetup
                              ? "Use the work email of the person who will manage this organization."
                              : "Use the work email of the additional administrator you want to invite."}
                          </p>
                          <p id="invitation-email-validation" aria-live="polite" className="mt-1 min-h-4 text-xs text-rose-300">
                            {invitationEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail.trim()) ? "Enter a valid email address to continue." : " "}
                          </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-100">Administrator first name <span className="text-rose-300">*</span></span>
                            <input type="text" required minLength={2} maxLength={100} autoComplete="given-name" value={invitationAdminFirstName} onChange={(event) => setInvitationAdminFirstName(event.target.value)} placeholder="First name" disabled={invitationCreating} className="min-h-12 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60" />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-100">Administrator last name <span className="text-rose-300">*</span></span>
                            <input type="text" required minLength={1} maxLength={100} autoComplete="family-name" value={invitationAdminLastName} onChange={(event) => setInvitationAdminLastName(event.target.value)} placeholder="Last name" disabled={invitationCreating} className="min-h-12 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60" />
                          </label>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-100">Administrator country <span className="text-rose-300">*</span></span>
                            <CountrySelect id="invitation-admin-country" value={invitationAdminCountry} required disabled={invitationCreating} onChange={(value) => { setInvitationAdminPhone((current) => replacePhoneCountryCode(current, invitationAdminCountry, value)); setInvitationAdminCountry(value); }} className="h-12 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm text-white outline-none focus:border-blue-400" />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-100">Administrator city <span className="text-rose-300">*</span></span>
                            <input type="text" required minLength={2} maxLength={100} autoComplete="address-level2" value={invitationAdminCity} onChange={(event) => setInvitationAdminCity(event.target.value)} placeholder="City" disabled={invitationCreating} className="min-h-12 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60" />
                          </label>
                        </div>
                        <label className="block">
                          <span className="mb-2 block text-sm font-semibold text-slate-100">Administrator phone <span className="text-rose-300">*</span></span>
                          <input type="tel" required maxLength={50} autoComplete="tel" value={invitationAdminPhone} onChange={(event) => setInvitationAdminPhone(event.target.value)} placeholder="+250 788 123 456" disabled={invitationCreating} className="min-h-12 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 py-2 text-sm tabular-nums text-white outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60" />
                        </label>
                        <button
                          type="submit"
                          disabled={invitationCreating || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail.trim()) || invitationEmail.trim().length > 254 || invitationAdminFirstName.trim().length < 2 || !invitationAdminLastName.trim() || !invitationAdminCountry.trim() || invitationAdminCity.trim().length < 2 || !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(invitationAdminPhone.trim()) || invitationAdminPhone.replace(/\D/g, "").length < 7 || invitationAdminPhone.replace(/\D/g, "").length > 15}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#75c7ff]/20 bg-[#21486a] px-5 py-3 text-sm font-semibold text-[#eff8ff] shadow-sm shadow-black/20 transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {invitationCreating ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-[#29384b] border-t-white" /> : <Icon name="mail" size={17} />}
                          {invitationCreating
                            ? "Creating invitation…"
                            : isPendingSetup
                              ? "Create initial admin invitation"
                              : "Create additional admin invitation"}
                        </button>
                      </form>
                      <aside className="h-fit min-w-0 self-start rounded-xl border border-amber-400/15 bg-amber-500/[0.06] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">Invitation details</p>
                        <div className="mt-3 space-y-3 text-xs leading-5 text-slate-200">
                          <p className="flex items-start gap-2"><span className="mt-0.5 text-amber-200"><Icon name="check" size={14} /></span><span>Expires after <strong>48 hours</strong>.</span></p>
                          <p className="flex items-start gap-2"><span className="mt-0.5 text-amber-200"><Icon name="check" size={14} /></span><span>Mailtrap Sandbox captures test email; it does not deliver to the real inbox.</span></p>
                        </div>
                      </aside>
                    </div>
                    {invitationError && (
                      <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">
                        <p>{invitationError}</p>
                        <button type="button" onClick={() => setInvitationError("")} className="shrink-0 font-semibold underline">Dismiss</button>
                      </div>
                    )}
                    {invitationUrl && (
                      <div aria-live="polite" className="mt-5 rounded-lg border border-blue-400/20 bg-blue-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#182232]/80 text-blue-300">
                            <Icon name="check" size={19} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-[#f8fafc]">
                              Invitation created for testing
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-slate-300">Copy the invitation URL below and share it with the invited administrator.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setInvitationUrl(""); setCopyMessage(""); }}
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-300 underline hover:text-white focus-visible:outline-none focus-visible:border-[#75c7ff]/50 focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20"
                          >
                            Dismiss
                          </button>
                        </div>
                        <label
                          htmlFor="generatedInvitationUrl"
                          className="mb-2 mt-4 block text-xs font-semibold text-slate-200"
                        >
                          Invitation URL
                        </label>
                        <input
                          id="generatedInvitationUrl"
                          type="text"
                          readOnly
                          value={invitationUrl}
                          onFocus={(event) => event.currentTarget.select()}
                          className="w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-3 text-sm text-white outline-none selection:bg-blue-500/30 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20"
                        />
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void handleCopyInvitationLink()}
                            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#75c7ff]/30 ${copyMessage === "Invitation link copied successfully." ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-[#29384b] bg-[#182232]/80 text-slate-200 hover:bg-white/[0.06]"}`}
                          >
                            <Icon name={copyMessage === "Invitation link copied successfully." ? "check" : "copy"} size={16} />
                            {copyMessage === "Invitation link copied successfully." ? "Copied" : "Copy Invitation Link"}
                          </button>
                          {copyMessage && (
                            <p role="status" className="text-xs text-slate-300">
                              {copyMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
              <section
                className="mt-7 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-4"
                aria-label="Organization overview"
              >
                <article className="relative flex min-h-[128px] min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-5 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-['']">
                  <SuperAdminOrganizationLogo organizationId={organization.id} name={organization.name} size="lg" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">Organization</p>
                    <p className="mt-1 truncate text-lg font-bold text-[#f8fafc]">
                      {organization.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-300">
                      {organization.slug}
                    </p>
                  </div>
                </article>
                <article className="relative flex min-h-[128px] min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-5 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-['']">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#29384b] ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-300"
                        : isPendingSetup
                          ? "bg-amber-500/15 text-amber-300"
                          : isArchived
                            ? "bg-slate-500/15 text-slate-300"
                            : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    <Icon name="shield" size={25} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">Current Status</p>
                    <span
                      className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusBadge(organization.status)}`}
                    >
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${getOrganizationStatusDotStyle(organization.status)}`} />
                      {formatStatus(organization.status)}
                    </span>
                  </div>
                </article>
                <article className="relative flex min-h-[128px] min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-5 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-['']">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#29384b] bg-violet-500/15 text-violet-300">
                    <Icon name="mail" size={25} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">Recent invitations</p>
                    <p className="mt-2 text-3xl font-bold leading-none tracking-[-0.045em] tabular-nums text-[#f2f7fc]">
                      {invitationsLoading ? "…" : invitationCount}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      {invitationsLoading
                        ? "Loading records"
                        : `${pendingInvitationCount} pending · latest ${invitations.length} of up to 50`}
                    </p>
                  </div>
                </article>
                <article className="relative flex min-h-[128px] min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-5 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-['']">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#29384b] bg-orange-500/15 text-orange-300">
                    <Icon name="calendar" size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">Registered</p>
                    <p className="mt-1 text-lg font-bold text-[#f8fafc]">
                      {formatDate(organization.created_at)}
                    </p>

                  </div>
                </article>
              </section>
              <section className="sa-org-license-panel mt-5 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:p-6" aria-labelledby="organization-license-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#29384b] bg-blue-500/10 text-blue-300"><Icon name="shield" size={21} /></span>
                    <div>
                      <h2 id="organization-license-heading" className="text-sm font-semibold text-[#f8fafc]">Platform license</h2>
                      <p className="mt-0.5 text-xs text-slate-300">Current entitlement and validity period</p>
                    </div>
                  </div>
                  {organization.license ? (
                    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getLicenseStatusPresentation(organization.license.status).className}`}>
                      {getLicenseStatusPresentation(organization.license.status).label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-slate-400/25 bg-slate-500/10 px-3 py-1.5 text-xs font-semibold text-slate-300">Unavailable</span>
                  )}
                </div>
                {organization.license ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-[#29384b] bg-white/[0.02] p-3.5">
                      <p className="text-xs text-slate-300">Starts</p>
                      <p className="mt-1.5 text-sm font-semibold text-[#f8fafc]">{organization.license.startsAt ? formatDate(organization.license.startsAt) : "Not started"}</p>
                    </div>
                    <div className="rounded-lg border border-[#29384b] bg-white/[0.02] p-3.5">
                      <p className="text-xs text-slate-300">Expires</p>
                      <p className="mt-1.5 text-sm font-semibold text-[#f8fafc]">{organization.license.expiresAt ? formatDate(organization.license.expiresAt) : "No expiry recorded"}</p>
                    </div>
                    <div className="rounded-lg border border-[#29384b] bg-white/[0.02] p-3.5">
                      <p className="text-xs text-slate-300">Remaining</p>
                      <p className="mt-1.5 text-sm font-semibold text-[#f8fafc]">{organization.license.remainingDays === null ? "—" : `${organization.license.remainingDays} days`}</p>
                    </div>
                    <div className="rounded-lg border border-[#29384b] bg-white/[0.02] p-3.5">
                      <p className="text-xs text-slate-300">Activation source</p>
                      <p className="mt-1.5 text-sm font-semibold text-[#f8fafc]">{organization.license.activationSource === "LEGACY_GRACE" ? "Legacy grace" : organization.license.activationSource === "PAYMENT" ? "Payment" : organization.license.activationSource === "NONE" ? "Not activated" : "—"}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3.5 py-3 text-sm text-amber-200">License information is temporarily unavailable. Organization details remain available.</p>
                )}
              </section>
              <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <article className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                  <div className="flex items-center gap-3 border-b border-[#29384b] px-5 py-5 sm:px-6">
                    <span className="text-[#9fcfff]">
                      <Icon name="building" size={23} />
                    </span>
                    <div>
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.13em] text-[#d5e1ef]">
                        Organization Information
                      </h2>
                      <p className="mt-1 text-xs text-slate-300">
                        Company profile and contact details
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">
                        Organization Name
                      </p>
                      <p className="mt-2 break-words font-semibold text-[#f8fafc]">
                        {organization.name}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">
                        Organization Slug
                      </p>
                      <p className="mt-2 break-all font-medium text-slate-200">
                        {organization.slug}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">
                        Contact Email
                      </p>
                      <p className="mt-2 break-all font-medium text-slate-200">
                        {organization.contact_email || "—"}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">
                        Contact Phone
                      </p>
                      <p className="mt-2 break-words font-medium text-[#f8fafc]">
                        {organization.contact_phone || "—"}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">Country</p>
                      <p className="mt-2 break-words font-medium text-[#f8fafc]"><CountryDisplay value={organization.country} /></p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5 sm:col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">
                        Registered Address
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words font-medium text-[#f8fafc]">
                        {organization.address || "—"}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#29384b] bg-white/[0.015] p-3.5 sm:col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9eafc4]">
                        Organization ID
                      </p>
                      <p className="mt-2 break-all font-mono text-xs text-slate-300">
                        {organization.id}
                      </p>
                    </div>
                  </div>
                </article>
                <article className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                  <div className="flex items-center gap-3 border-b border-[#29384b] px-5 py-5 sm:px-6">
                    <span className="text-[#9fcfff]">
                      <Icon name="shield" size={23} />
                    </span>
                    <div>
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.13em] text-[#d5e1ef]">
                        Organization Controls
                      </h2>
                      <p className="mt-1 text-xs text-slate-300">
                        Manage access and setup status
                      </p>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-3 rounded-lg bg-[#101a28] p-4">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isPendingSetup
                            ? "bg-amber-500/15 text-amber-300"
                            : isActive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : isArchived
                                ? "bg-slate-500/15 text-slate-300"
                                : "bg-rose-500/15 text-rose-300"
                        }`}
                      >
                        <Icon name="shield" size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#f8fafc]">
                          {isPendingSetup
                            ? "Setup is still pending"
                            : isActive
                              ? "Organization is active"
                              : isSuspended
                                ? "Organization is suspended"
                                : "Organization is archived"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-300">
                          {isPendingSetup
                            ? "Generate an admin invitation to begin setup. Status controls become available after activation."
                            : isActive
                              ? "This organization is currently marked active on the platform."
                              : isSuspended
                                ? "This organization is suspended. You can reactivate it or archive it permanently when appropriate."
                                : "This organization is archived. Its records remain for historical reference, and its status cannot be reopened."}
                        </p>
                      </div>
                    </div>
                    {isPendingSetup ? (
                      <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
                        Complete the initial administrator setup before changing this organization&apos;s status.
                      </p>
                    ) : isArchived ? (
                      <p className="mt-4 rounded-lg border border-slate-400/20 bg-slate-500/10 p-3 text-xs leading-5 text-slate-300">
                        This organization is archived. Reactivation and further status changes are disabled.
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void openOrganizationStatusAction()}
                          disabled={statusUpdating}
                          className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#75c7ff]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
                            isActive
                              ? "bg-rose-600 hover:bg-rose-700"
                              : "bg-emerald-600 hover:bg-emerald-700"
                          }`}
                        >
                          {statusUpdating
                            ? "Updating status..."
                            : isActive
                              ? "Suspend Organization"
                              : "Reactivate Organization"}
                        </button>
                        {isSuspended && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={openArchiveOrganizationDialog}
                              disabled={statusUpdating}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Archive Organization
                            </button>
                            <p className="mt-2 text-xs leading-5 text-slate-400">
                              Archive is available only after suspension and cannot be reversed through this workflow.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={openEditOrganizationDrawer}
                      disabled={isArchived}
                      title={isArchived ? "Archived organizations are read-only." : undefined}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#29384b] bg-[#182232]/80 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#75c7ff]/30"
                    >
                      Edit Organization <Icon name="arrow" size={15} />
                    </button>
                  </div>
                </article>
              </section>
              <section className="mt-5 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 border-b border-[#29384b] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="text-[#9fcfff]">
                      <Icon name="users" size={23} />
                    </span>
                    <div>
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.13em] text-[#d5e1ef]">
                        Organization Users
                      </h2>
                      <p className="mt-1 text-xs text-slate-300">
                        Read-only list of login accounts linked to this organization.
                      </p>
                    </div>
                  </div>
                  <span className="w-fit rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
                    {organizationUsersSummary
                      ? `${organizationUsersSummary.total.toLocaleString()} total accounts`
                      : "Total accounts —"}
                  </span>
                </div>
                {organizationUsersLoading ? (
                  <div className="flex items-center gap-3 p-6 text-sm text-slate-300">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    Loading organization users...
                  </div>
                ) : organizationUsersError ? (
                  <div
                    role="alert"
                    className="m-5 flex flex-col items-start gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p>{organizationUsersError}</p>
                    <button
                      type="button"
                      onClick={() => setOrganizationUsersReloadKey((key) => key + 1)}
                      className="shrink-0 rounded-md border border-rose-400/20 bg-[#182232]/80 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      Try again
                    </button>
                  </div>
                ) : organizationUsersSummary &&
                  organizationUsersSummary.total === 0 ? (
                  <div className="p-8 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                      <Icon name="users" size={22} />
                    </span>
                    <p className="mt-3 font-semibold text-[#f8fafc]">
                      No user accounts yet
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      This organization has no linked login accounts.
                    </p>
                  </div>
                ) : (
                  <>
                    {organizationUsersSummary && (
                      <div className="grid grid-cols-2 gap-3 border-b border-[#29384b] bg-[#0f1724] p-4 sm:grid-cols-4">
                        <button type="button" aria-pressed={organizationUserFilter === "ACTIVE"} onClick={() => setOrganizationUserFilter("ACTIVE")} className={`sa-org-user-metric rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${organizationUserFilter === "ACTIVE" ? "sa-org-user-metric-selected border-blue-400/60 bg-blue-500/10" : "border-[#29384b] bg-[#182232]/80 hover:border-[#29384b] hover:bg-[#1a293b]/80"}`}>
                          <p className="text-xs text-slate-300">Active</p>
                          <p className="mt-1 text-xl font-bold text-emerald-300">
                            {effectiveOrganizationUsersSummary!.active.toLocaleString()}
                          </p>
                        </button>
                        <button type="button" aria-pressed={organizationUserFilter === "INVITED"} onClick={() => setOrganizationUserFilter("INVITED")} className={`sa-org-user-metric rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${organizationUserFilter === "INVITED" ? "sa-org-user-metric-selected border-blue-400/60 bg-blue-500/10" : "border-[#29384b] bg-[#182232]/80 hover:border-[#29384b] hover:bg-[#1a293b]/80"}`}>
                          <p className="text-xs text-slate-300">Invited</p>
                          <p className="mt-1 text-xl font-bold text-amber-300">
                            {effectiveOrganizationUsersSummary!.invited.toLocaleString()}
                          </p>
                        </button>
                        <button type="button" aria-pressed={organizationUserFilter === "SUSPENDED"} onClick={() => setOrganizationUserFilter("SUSPENDED")} className={`sa-org-user-metric rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${organizationUserFilter === "SUSPENDED" ? "sa-org-user-metric-selected border-blue-400/60 bg-blue-500/10" : "border-[#29384b] bg-[#182232]/80 hover:border-[#29384b] hover:bg-[#1a293b]/80"}`}>
                          <p className="text-xs text-slate-300">Suspended</p>
                          <p className="mt-1 text-xl font-bold text-rose-300">
                            {effectiveOrganizationUsersSummary!.suspended.toLocaleString()}
                          </p>
                        </button>
                        <button type="button" aria-pressed={organizationUserFilter === "DEACTIVATED"} onClick={() => setOrganizationUserFilter("DEACTIVATED")} className={`sa-org-user-metric rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${organizationUserFilter === "DEACTIVATED" ? "sa-org-user-metric-selected border-blue-400/60 bg-blue-500/10" : "border-[#29384b] bg-[#182232]/80 hover:border-[#29384b] hover:bg-[#1a293b]/80"}`}>
                          <p className="text-xs text-slate-300">Deactivated</p>
                          <p className="mt-1 text-xl font-bold text-slate-200">
                            {effectiveOrganizationUsersSummary!.deactivated.toLocaleString()}
                          </p>
                        </button>
                      </div>
                    )}
                    <div className="flex flex-col gap-3 border-b border-[#29384b] bg-[#0f1724] px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-center gap-2">
                        {([
                          { id: "ALL", label: "All accounts" },
                          { id: "ACTIVE", label: "Active" },
                          { id: "INVITED", label: "Invited" },
                          { id: "SUSPENDED", label: "Suspended" },
                          { id: "DEACTIVATED", label: "Deactivated" },
                        ] as const).map((filter) => (
                          <button key={filter.id} type="button" aria-pressed={organizationUserFilter === filter.id}
                            onClick={() => setOrganizationUserFilter(filter.id)}
                            className={`sa-org-user-filter rounded-full border px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 ${organizationUserFilter === filter.id ? "sa-org-user-filter-selected border-blue-400/40 bg-blue-500/15 text-blue-200" : "border-[#29384b] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white"}`}>
                            {filter.label}
                          </button>
                        ))}
                        <span className="ml-auto text-[11px] text-slate-300">{filteredOrganizationUsers.length.toLocaleString()} loaded match{filteredOrganizationUsers.length === 1 ? "" : "es"}</span>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label className="relative block w-full sm:max-w-sm">
                          <span className="sr-only">Search organization accounts</span>
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"><Icon name="search" size={16} /></span>
                          <input type="search" value={organizationUserSearch} onChange={(event) => setOrganizationUserSearch(event.target.value)} placeholder="Search name, email, role or employee code" className="min-h-10 w-full rounded-lg border border-[#29384b] bg-[#111a28] py-2 pl-9 pr-9 text-xs text-white outline-none placeholder:text-slate-300 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20" />
                          {organizationUserSearch && <button type="button" aria-label="Clear user search" onClick={() => setOrganizationUserSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-xs text-slate-300 hover:text-white focus-visible:outline-none focus-visible:border-[#75c7ff]/50 focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20">×</button>}
                        </label>
                        <p className="text-[11px] text-slate-300">{userFilterMatchingTotal.toLocaleString()} account{userFilterMatchingTotal === 1 ? "" : "s"} match this filter</p>
                      </div>
                    </div>
                    {filteredOrganizationUsers.length === 0 ? (
                      <div className="p-6 text-sm text-slate-300">
                        {organizationUsers.length === 0 ? "No user details were returned." : "No accounts match this search and status filter."}
                      </div>
                    ) : (
                      <div className="overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent]">
                        <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
                          <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91a7bf]">
                            <tr>
                              <th className="rounded-l-md px-3 py-3.5 font-semibold">
                                User
                              </th>
                              <th className="px-3 py-3.5 font-semibold">
                                Role / Designation
                              </th>
                              <th className="px-3 py-3.5 font-semibold">
                                Access Status
                              </th>
                              <th className="px-3 py-3.5 font-semibold">
                                Last Login
                              </th>
                              <th className="px-3 py-3.5 font-semibold rounded-r-md">
                                Created
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#27384b]/75">
                            {filteredOrganizationUsers.map((account) => (
                              <tr
                                key={account.id}
                                className="group transition-colors duration-200 hover:bg-[#14283e]/45 focus-within:bg-[#14283e]/45"
                              >
                                <td className="px-3 py-4 align-middle">
                                  <div className="flex min-w-0 items-start gap-2.5">
                                    <SuperAdminUserAvatar
                                      organizationId={organization.id}
                                      userId={account.id}
                                      name={account.display_name || account.email}
                                      size="md"
                                    />
                                    <div className="min-w-0">
                                  <p className="font-semibold text-[#f8fafc]">
                                    {account.display_name || account.email}
                                  </p>
                                  <p className="mt-1 break-all text-xs text-slate-300">
                                    {account.email}
                                  </p>
                                  {account.employee_code && (
                                    <p className="mt-1 text-[11px] text-slate-300">
                                      Code: {account.employee_code}
                                    </p>
                                  )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-4 align-middle text-slate-200">
                                  <p className="font-medium">
                                    {formatStatus(account.role)}
                                  </p>
                                  {account.designation && (
                                    <p className="mt-1 text-xs text-slate-300">
                                      {account.designation}
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-4 align-middle whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${accountStatusBadge(getEffectiveUserAccessStatus(account, organization.status))}`}
                                  >
                                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${getAccountStatusDotStyle(getEffectiveUserAccessStatus(account, organization.status))}`} />
                                    {formatStatus(getEffectiveUserAccessStatus(account, organization.status))}
                                  </span>
                                  {organization.status?.toUpperCase() === "SUSPENDED" &&
                                    account.status.toUpperCase() !== "SUSPENDED" && (
                                      <p className="mt-1 text-[10px] text-slate-300">
                                        Account record: {formatStatus(account.status)}
                                      </p>
                                    )}
                                </td>
                                <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                                  {account.last_login_at
                                    ? formatDate(account.last_login_at, true)
                                    : "Never logged in"}
                                </td>
                                <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                                  {formatDate(account.created_at, true)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {(canLoadMoreOrganizationUsers || organizationUsersMoreError) && (
                      <div className="flex flex-col gap-3 border-t border-[#29384b] bg-[#0f1724] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="min-w-0">
                          {organizationUsersMoreError && <p role="alert" className="mb-1 text-xs text-rose-300">{organizationUsersMoreError}</p>}
                          <p className="text-xs text-slate-300">Loaded {organizationUsers.length.toLocaleString()} of {userFilterMatchingTotal.toLocaleString()} matching accounts.</p>
                        </div>
                        <button type="button" onClick={() => void loadMoreOrganizationUsers()} disabled={loadingMoreOrganizationUsers || organizationUsersLoading}
                          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#29384b] bg-[#182232]/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30 disabled:cursor-not-allowed disabled:opacity-60">
                          {loadingMoreOrganizationUsers && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300/40 border-t-slate-100" />}
                          {loadingMoreOrganizationUsers ? "Loading accounts…" : "Load more accounts"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
              <section className="mt-5 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 border-b border-[#29384b] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="text-[#9fcfff]">
                      <Icon name="mail" size={23} />
                    </span>
                    <div>
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.13em] text-[#d5e1ef]">
                        Invitation History
                      </h2>
                      <p className="mt-1 text-xs text-slate-300">
                        Most recent invitations for this organization.
                      </p>
                    </div>
                  </div>
                  {!invitationsLoading && !invitationsError && (
                    <span className="w-fit rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-300">
                      Latest {invitations.length} · maximum 50
                    </span>
                  )}
                </div>
                {invitationsLoading ? (
                  <div className="flex items-center gap-3 p-6 text-sm text-slate-300">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    Loading invitation history...
                  </div>
                ) : invitationsError ? (
                  <div role="alert" className="m-5 flex flex-col items-start gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300 sm:flex-row sm:items-center sm:justify-between">
                    <p>{invitationsError}</p>
                    <button
                      type="button"
                      onClick={() => setInvitationReloadKey((key) => key + 1)}
                      className="shrink-0 rounded-md border border-rose-400/20 bg-[#182232]/80 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      Try again
                    </button>
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="p-8 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                      <Icon name="mail" size={22} />
                    </span>
                    <p className="mt-3 font-semibold text-[#f8fafc]">
                      No invitations yet
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Invitations created for this organization will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent]">
                    <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                      <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91a7bf]">
                        <tr>
                          <th className="rounded-l-md px-3 py-3.5 font-semibold">
                            Email
                          </th>
                          <th className="px-3 py-3.5 font-semibold">
                            Status
                          </th>
                          <th className="px-3 py-3.5 font-semibold">
                            Created
                          </th>
                          <th className="px-3 py-3.5 font-semibold">
                            Expires
                          </th>
                          <th className="rounded-r-md px-3 py-3.5 text-right font-semibold">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27384b]/75">
                        {invitations.map((invitation) => {
                          const effectiveInvitationStatus = getEffectiveInvitationStatus(invitation);
                          const invitationStatusStyle =
                            effectiveInvitationStatus === "ACCEPTED"
                              ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20"
                              : effectiveInvitationStatus === "PENDING"
                                ? "bg-amber-500/10 text-amber-300 ring-amber-400/20"
                                : effectiveInvitationStatus === "REVOKED"
                                  ? "bg-rose-500/10 text-rose-300 ring-rose-400/20"
                                  : "bg-white/[0.06] text-slate-300 ring-white/10";
                          return (
                            <tr
                              key={invitation.id}
                              className="group transition-colors duration-200 hover:bg-[#14283e]/45 focus-within:bg-[#14283e]/45"
                            >
                              <td className="px-3 py-4 align-middle whitespace-nowrap font-medium text-[#f8fafc]">
                                {invitation.email}
                              </td>
                              <td className="px-3 py-4 align-middle whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${invitationStatusStyle}`}
                                >
                                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${effectiveInvitationStatus === "ACCEPTED" ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : effectiveInvitationStatus === "PENDING" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.45)]" : effectiveInvitationStatus === "REVOKED" ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]" : "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.25)]"}`} />
                                  {formatStatus(effectiveInvitationStatus)}
                                </span>
                              </td>
                              <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                                {formatDate(invitation.created_at)}
                              </td>
                              <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                                {formatDate(invitation.expires_at, true)}
                              </td>
                              <td className="px-3 py-4 align-middle text-right">
                                {effectiveInvitationStatus === "PENDING" ? (
                                  <button
                                    type="button"
                                    onClick={() => openInvitationRevocationDialog(invitation)}
                                    disabled={invitationRevoking}
                                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Revoke
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-500">No action</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="mt-6 border-t border-[#29384b] py-4 text-xs leading-5 text-[#8b9eb4]">
            HRMS Platform · Super Admin Console
          </footer>
        </div>
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandItems}
        onSelect={selectCommandItem}
      />
      {statusConfirmationOpen && organization && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeOrganizationStatusDialog();
          }}
        >
          <div
            ref={statusDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="organization-status-dialog-title"
            aria-describedby="organization-status-dialog-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
            className={`w-full max-w-lg rounded-2xl border bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] sm:p-6 ${organization.status === "ACTIVE" ? "border-rose-400/30" : "border-emerald-400/25"}`}
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${organization.status === "ACTIVE" ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                <Icon name="shield" size={23} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">Guarded organization action</p>
                <h2 id="organization-status-dialog-title" className="mt-1 text-xl font-bold tracking-tight text-white">
                  {organization.status === "ACTIVE" ? "Suspend organization?" : "Reactivate organization?"}
                </h2>
                <p className="mt-1 break-words text-sm font-semibold text-slate-200">{organization.name}</p>
              </div>
            </div>

            {organization.status === "ACTIVE" ? (
              <div id="organization-status-dialog-description" className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
                <p>Suspending this organization blocks access through organization-status checks. Its data will remain in place.</p>
                <label htmlFor="confirm-organization-slug" className="block pt-1 text-xs font-semibold text-slate-200">Type the organization slug to confirm: <span className="text-rose-200">{organization.slug}</span></label>
                <input
                  ref={statusConfirmationInputRef}
                  id="confirm-organization-slug"
                  type="text"
                  autoComplete="off"
                  value={statusConfirmationSlug}
                  onChange={(event) => { setStatusConfirmationSlug(event.target.value); setStatusError(""); }}
                  placeholder={organization.slug}
                  disabled={statusUpdating}
                  className="h-11 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-4 focus:ring-rose-500/10 disabled:opacity-60"
                />
              </div>
            ) : (
              <p id="organization-status-dialog-description" className="mt-5 text-sm leading-6 text-slate-300">This restores the organization status to ACTIVE. Individual account status and sign-in checks will still apply.</p>
            )}

            {statusError && <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{statusError}</p>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeOrganizationStatusDialog}
                disabled={statusUpdating}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                ref={statusConfirmButtonRef}
                type="button"
                onClick={() => void handleConfirmOrganizationStatusChange()}
                disabled={statusUpdating || (organization.status === "ACTIVE" && statusConfirmationSlug.trim() !== organization.slug.trim())}
                className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${organization.status === "ACTIVE" ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"}`}
              >
                {statusUpdating ? "Updating organization…" : organization.status === "ACTIVE" ? "Confirm suspension" : "Confirm reactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
      {archiveConfirmationOpen && organization && (
        <div
          className="fixed inset-0 z-[105] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeArchiveDialog();
          }}
        >
          <div
            ref={archiveDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="organization-archive-dialog-title"
            aria-describedby="organization-archive-dialog-description"
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300">
                <Icon name="shield" size={23} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">Irreversible organization action</p>
                <h2 id="organization-archive-dialog-title" className="mt-1 text-xl font-bold tracking-tight text-white">Archive organization?</h2>
                <p className="mt-1 break-words text-sm font-semibold text-slate-200">{organization.name}</p>
              </div>
            </div>
            <p id="organization-archive-dialog-description" className="mt-4 text-sm leading-6 text-slate-300">
              This organization is suspended. Archiving will mark it as ARCHIVED while retaining its historical records. The current workflow does not permit reactivation afterward. Make sure this is intentional.
            </p>
            <label htmlFor="organization-archive-reason" className="mt-4 block text-xs font-semibold text-slate-200">
              Reason for archiving <span className="text-rose-200">(required)</span>
            </label>
            <textarea
              ref={archiveReasonInputRef}
              id="organization-archive-reason"
              value={archiveReason}
              onChange={(event) => { setArchiveReason(event.target.value); setStatusError(""); }}
              minLength={3}
              maxLength={1000}
              rows={3}
              disabled={statusUpdating}
              placeholder="Explain why this organization is being archived..."
              className="mt-2 w-full resize-y rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-4 focus:ring-rose-500/10 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-slate-400">The reason and status transition will be recorded in the platform audit log.</p>
            {statusError && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {statusError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeArchiveDialog}
                disabled={statusUpdating}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                ref={archiveConfirmButtonRef}
                type="button"
                onClick={() => void handleConfirmArchiveOrganization()}
                disabled={statusUpdating || archiveReason.trim().length < 3}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {statusUpdating ? "Archiving organization…" : "Confirm archive"}
              </button>
            </div>
          </div>
        </div>
      )}
      {invitationRevocationTarget && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInvitationRevocationDialog();
          }}
        >
          <div
            ref={invitationRevocationDialogRef}
            role="dialog"
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">Guarded invitation action</p>
                <h2 id="invitation-revocation-dialog-title" className="mt-1 text-xl font-bold tracking-tight text-white">Revoke invitation?</h2>
                <p className="mt-1 break-words text-sm font-semibold text-slate-200">{invitationRevocationTarget.email}</p>
              </div>
            </div>
            <p id="invitation-revocation-dialog-description" className="mt-4 text-sm leading-6 text-slate-300">
              The invitation link will no longer be usable. This action cannot be undone; you can create a new invitation later.
            </p>
            <label htmlFor="invitation-revocation-reason" className="mt-4 block text-xs font-semibold text-slate-200">
              Reason for revocation <span className="text-rose-200">(required)</span>
            </label>
            <textarea
              ref={invitationRevocationReasonInputRef}
              id="invitation-revocation-reason"
              value={invitationRevocationReason}
              onChange={(event) => { setInvitationRevocationReason(event.target.value); setInvitationRevocationError(""); }}
              minLength={3}
              maxLength={1000}
              rows={3}
              disabled={invitationRevoking}
              placeholder="Explain why this invitation is being revoked..."
              className="mt-2 w-full resize-y rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-4 focus:ring-rose-500/10 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-slate-400">The reason will be written to the platform audit log.</p>
            {invitationRevocationError && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {invitationRevocationError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeInvitationRevocationDialog}
                disabled={invitationRevoking}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmInvitationRevocation()}
                disabled={invitationRevoking || invitationRevocationReason.trim().length < 3}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {invitationRevoking ? "Revoking invitation…" : "Confirm revocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
