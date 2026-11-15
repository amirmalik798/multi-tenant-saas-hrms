"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CommandPalette, CommandPaletteTrigger, buildSuperAdminCommandItems, type CommandPaletteItem } from "../../components/super-admin/CommandPalette";
import { CreateOrganizationDrawer } from "../../components/super-admin/CreateOrganizationDrawer";
import { SuperAdminOrganizationLogo, SuperAdminUserAvatar } from "../../components/super-admin/SuperAdminImages";
import { CountryDisplay, CountrySelect, replacePhoneCountryCode } from "../../components/workforce/CountryPhoneFields";

import SuperAdminThemeToggle from "../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../components/WorkspaceClock";
type AdminUser = {
  email: string;
  role: string;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country?: string | null;
  status: string;
  created_at: string;
  organization_admin_email?: string | null;
  organization_admin_user_id?: string | null;
  user_count?: number | string | null;
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

type OrganizationInvitation = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type OrganizationUsersSummary = {
  total: number;
  matchingTotal: number;
  active: number;
  invited: number;
  suspended: number;
  deactivated: number;
  returned: number;
};

type StatusFilter = "NON_ARCHIVED" | "ACTIVE" | "PENDING_SETUP" | "SUSPENDED" | "ARCHIVED";
type OrganizationPanelMode = "view" | "edit";
type OrganizationPanelDiscardIntent = "close" | "returnToView";
type OrganizationViewTab = "overview" | "users" | "activity";
type OrganizationUserFilter = "ALL" | "ACTIVE" | "INVITED" | "SUSPENDED" | "DEACTIVATED";
type OrganizationEditField = "name" | "slug" | "contactEmail" | "contactPhone" | "address" | "country";
type OrganizationEditValues = Record<OrganizationEditField, string>;
type SlugAvailability = "idle" | "checking" | "available" | "taken" | "error";

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
  | "filter"
  | "plus"
  | "refresh"
  | "copy"
  | "check"
  | "more";

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
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
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
    refresh: <path d="M20 7v5h-5M4 17v-5h5m-4.2-3A8 8 0 0 1 18 6l2 6M4 12l2 6a8 8 0 0 0 13.2-3" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
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

function getInvitationStatusStyle(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-amber-500/10 text-amber-300 ring-amber-400/20";
    case "ACCEPTED":
      return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    case "REVOKED":
      return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
    case "EXPIRED":
      return "bg-white/[0.06] text-slate-300 ring-white/10";
    default:
      return "bg-white/[0.06] text-slate-300 ring-white/10";
  }
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
      .toUpperCase() || "O"
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const processedDashboardPanelRequest = useRef(false);

  const [user, setUser] = useState<AdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("NON_ARCHIVED");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false);
  const [organizationsReloadKey, setOrganizationsReloadKey] = useState(0);
  const [isRefreshingOrganizations, setIsRefreshingOrganizations] = useState(false);
  const [backgroundRefreshError, setBackgroundRefreshError] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [isSearchDebouncing, setIsSearchDebouncing] = useState(false);
  const hasLoadedOrganizationsRef = useRef(false);
  const [organizationsPage, setOrganizationsPage] = useState(1);
  const [organizationsTotal, setOrganizationsTotal] = useState(0);
  const [organizationsTotalPages, setOrganizationsTotalPages] = useState(1);
  const [organizationSummary, setOrganizationSummary] = useState({ total: 0, active: 0, pending: 0, suspended: 0, archived: 0 });

  const [selectedOrganization, setSelectedOrganization] =
    useState<Organization | null>(null);
  const selectedOrganizationId = selectedOrganization?.id;
  const [organizationLicense, setOrganizationLicense] = useState<OrganizationLicense | null>(null);
  const [organizationLicenseLoading, setOrganizationLicenseLoading] = useState(false);
  const [organizationLicenseError, setOrganizationLicenseError] = useState("");

  const [panelMode, setPanelMode] =
    useState<OrganizationPanelMode>("view");
  const [organizationViewTab, setOrganizationViewTab] =
    useState<OrganizationViewTab>("overview");
  const [organizationUserFilter, setOrganizationUserFilter] =
    useState<OrganizationUserFilter>("ALL");
  const [copyFeedback, setCopyFeedback] = useState<"id" | "slug" | null>(null);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slugAvailability, setSlugAvailability] = useState<SlugAvailability>("idle");
  const [touchedEditFields, setTouchedEditFields] = useState<Set<OrganizationEditField>>(() => new Set());
  const [editSubmitAttempted, setEditSubmitAttempted] = useState(false);
  const [panelDiscardIntent, setPanelDiscardIntent] =
    useState<OrganizationPanelDiscardIntent | null>(null);
  const panelDiscardIntentRef = useRef<OrganizationPanelDiscardIntent | null>(null);
  panelDiscardIntentRef.current = panelDiscardIntent;
  const organizationPanelRef = useRef<HTMLElement | null>(null);
  const organizationPanelBodyRef = useRef<HTMLDivElement | null>(null);
  const organizationPanelCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const organizationEditNameInputRef = useRef<HTMLInputElement | null>(null);
  const organizationEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const organizationPanelFocusTargetRef = useRef<"close" | "edit" | "name">("close");
  const organizationPanelDiscardDialogRef = useRef<HTMLDivElement | null>(null);
  const organizationPanelOpenerRef = useRef<HTMLElement | null>(null);

  const [organizationUsers, setOrganizationUsers] =
    useState<OrganizationAccount[]>([]);

  const [organizationUsersSummary, setOrganizationUsersSummary] =
    useState<OrganizationUsersSummary | null>(null);

  const [loadingOrganizationUsers, setLoadingOrganizationUsers] =
    useState(false);

  const [organizationUsersError, setOrganizationUsersError] =
    useState("");
  const [loadingMoreOrganizationUsers, setLoadingMoreOrganizationUsers] =
    useState(false);
  const [organizationUsersMoreError, setOrganizationUsersMoreError] =
    useState("");
  const [organizationUsersReloadKey, setOrganizationUsersReloadKey] = useState(0);
  const organizationUsersLoadMoreControllerRef = useRef<AbortController | null>(null);

  const [organizationInvitations, setOrganizationInvitations] =
    useState<OrganizationInvitation[]>([]);
  const [loadingOrganizationInvitations, setLoadingOrganizationInvitations] =
    useState(false);
  const [organizationInvitationsError, setOrganizationInvitationsError] =
    useState("");
  const [invitationHistoryReloadKey, setInvitationHistoryReloadKey] =
    useState(0);
  const organizationUsersLoadedKeyRef = useRef<string | null>(null);
  const organizationInvitationsLoadedKeyRef = useRef<string | null>(null);

  const [panelError, setPanelError] = useState("");
  const [panelSuccess, setPanelSuccess] = useState("");
  const [savingOrganization, setSavingOrganization] = useState(false);

  const [statusUpdatingOrganizationId, setStatusUpdatingOrganizationId] =
    useState<string | null>(null);
  const [statusActionOrganization, setStatusActionOrganization] =
    useState<Organization | null>(null);
  const [statusConfirmationSlug, setStatusConfirmationSlug] = useState("");
  const [statusActionError, setStatusActionError] = useState("");
  const [tableActionSuccess, setTableActionSuccess] = useState("");
  const statusDialogRef = useRef<HTMLDivElement | null>(null);
  const statusConfirmationInputRef = useRef<HTMLInputElement | null>(null);
  const statusConfirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const [editFields, setEditFields] = useState({
    name: "",
    slug: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    country: "",
  });

  const hasOrganizationChanges =
    selectedOrganization !== null &&
    (editFields.name.trim() !== selectedOrganization.name ||
      editFields.slug.trim().toLowerCase() !== selectedOrganization.slug.toLowerCase() ||
      editFields.contactEmail.trim().toLowerCase() !==
        (selectedOrganization.contact_email ?? "").toLowerCase() ||
      editFields.contactPhone.trim() !==
        (selectedOrganization.contact_phone ?? "") ||
      editFields.address.trim() !== (selectedOrganization.address ?? "") ||
      editFields.country.trim() !== (selectedOrganization.country ?? ""));

  const originalEditFields = useMemo<OrganizationEditValues>(() => ({
    name: selectedOrganization?.name ?? "",
    slug: selectedOrganization?.slug ?? "",
    contactEmail: selectedOrganization?.contact_email ?? "",
    contactPhone: selectedOrganization?.contact_phone ?? "",
    address: selectedOrganization?.address ?? "",
    country: selectedOrganization?.country ?? "",
  }), [selectedOrganization]);

  const editFieldErrors = useMemo<Partial<Record<OrganizationEditField, string>>>(() => {
    const errors: Partial<Record<OrganizationEditField, string>> = {};
    const name = editFields.name.trim();
    const slug = editFields.slug.trim().toLowerCase();
    const email = editFields.contactEmail.trim().toLowerCase();
    const phone = editFields.contactPhone.trim();
    const address = editFields.address.trim();

    if (name.length < 2 || name.length > 120) errors.name = "Name must be between 2 and 120 characters.";
    if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.slug = "Use lowercase letters, numbers, and single hyphens only (max 80 characters).";
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.contactEmail = "Enter a valid email address.";
    }
    if (!/^[+()\d\s.-]{7,30}$/.test(phone)) {
      errors.contactPhone = "Use 7–30 characters with digits, spaces, +, parentheses, dots, or hyphens.";
    }
    if (address.length < 3 || address.length > 255) errors.address = "Address must be between 3 and 255 characters.";
    return errors;
  }, [editFields]);

  const filteredOrganizationUsers = useMemo(() => {
    if (organizationUserFilter === "ALL") return organizationUsers;
    if (organizationUserFilter === "SUSPENDED") {
      return organizationUsers.filter((account) => account.status === "SUSPENDED");
    }
    return organizationUsers.filter((account) => account.status === organizationUserFilter);
  }, [organizationUsers, organizationUserFilter]);

  function isEditFieldModified(field: OrganizationEditField) {
    const current = editFields[field].trim();
    const original = originalEditFields[field].trim();
    return field === "slug" || field === "contactEmail"
      ? current.toLowerCase() !== original.toLowerCase()
      : current !== original;
  }

  function showEditFieldError(field: OrganizationEditField) {
    return (touchedEditFields.has(field) || editSubmitAttempted) && Boolean(editFieldErrors[field]);
  }

  function editFieldBorderClass(field: OrganizationEditField) {
    if (showEditFieldError(field)) return "border-rose-400/70";
    if (isEditFieldModified(field)) return "border-blue-400/70";
    return "border-white/15";
  }

  function updateEditField(field: OrganizationEditField, value: string) {
    setEditFields((current) => ({ ...current, [field]: value }));
    setTouchedEditFields((current) => new Set(current).add(field));
    setPanelError("");
    if (field === "slug") {
      const normalized = value.trim().toLowerCase();
      setSlugAvailability(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) && normalized.length <= 80 ? "checking" : "idle");
    }
  }

  function revertEditField(field: OrganizationEditField) {
    setEditFields((current) => ({ ...current, [field]: originalEditFields[field] }));
    setTouchedEditFields((current) => new Set(current).add(field));
    setPanelError("");
    if (field === "slug") setSlugAvailability("checking");
  }

  async function copyOrganizationValue(field: "id" | "slug", value: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
      await navigator.clipboard.writeText(value);
      setCopyFeedback(field);
      if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      setPanelError("Could not copy automatically. Select the value and copy it manually.");
    }
  }

  useEffect(() => () => {
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (panelMode !== "edit" || !selectedOrganization) {
      setSlugAvailability("idle");
      return;
    }

    const slug = editFields.slug.trim().toLowerCase();
    if (!slug || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setSlugAvailability("idle");
      return;
    }
    if (slug === (selectedOrganization.slug ?? "").trim().toLowerCase()) {
      setSlugAvailability("available");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSlugAvailability("checking");
      try {
        const query = new URLSearchParams({
          slug,
          excludeOrganizationId: selectedOrganization.id,
        });
        const response = await fetch(`/api/backend/organization-slug-availability?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.available !== "boolean") {
          throw new Error(data.message || "Slug availability could not be verified.");
        }
        setSlugAvailability(data.available ? "available" : "taken");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Organization slug availability check failed:", error);
        setSlugAvailability("error");
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [panelMode, selectedOrganization?.id, selectedOrganization?.slug, editFields.slug, router]);

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
        if (isActive) router.replace("/");
      } finally {
        if (isActive) setCheckingSession(false);
      }
    }

    void verifySession();

    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setIsSearchDebouncing(false);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (!user || isSearchDebouncing) return;

    let isActive = true;
    const controller = new AbortController();

    async function loadOrganizations() {
      if (hasLoadedOrganizationsRef.current) {
        setIsRefreshingOrganizations(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const query = new URLSearchParams({
          page: String(organizationsPage),
          pageSize: "25",
          search: debouncedSearchQuery.trim(),
          status: statusFilter,
        });
        const response = await fetch(`/api/backend/organizations?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          router.replace("/");
          return;
        }

        if (!response.ok) {
          throw new Error("Could not load organizations. Please try again.");
        }

        const data = await response.json();
        const items = Array.isArray(data) ? data : data.organizations;

        if (!Array.isArray(items)) {
          throw new Error("The organizations API returned an unexpected response.");
        }

        if (isActive) {
          setOrganizations(items);
          setBackgroundRefreshError("");
          hasLoadedOrganizationsRef.current = true;
          setOrganizationsTotal(Number(data.pagination?.total ?? items.length));
          setOrganizationsTotalPages(Math.max(1, Number(data.pagination?.totalPages ?? 1)));
          if (data.summary) setOrganizationSummary({
            total: Number(data.summary.total || 0),
            active: Number(data.summary.active || 0),
            pending: Number(data.summary.pending || 0),
            suspended: Number(data.summary.suspended || 0),
            archived: Number(data.summary.archived || 0),
          });
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Organizations loading error:", loadError);

        if (isActive) {
          const message = loadError instanceof Error
            ? loadError.message
            : "Something went wrong while loading organizations.";
          if (hasLoadedOrganizationsRef.current) {
            setBackgroundRefreshError(message);
          } else {
            setError(message);
          }
        }
      } finally {
        if (isActive) {
          setLoading(false);
          setIsRefreshingOrganizations(false);
        }
      }
    }

    void loadOrganizations();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [user, router, organizationsReloadKey, organizationsPage, debouncedSearchQuery, statusFilter, isSearchDebouncing]);


  useEffect(() => {
    if (!user) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        setOrganizationsReloadKey((key) => key + 1);
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [user]);


  useEffect(() => {
    if (!user || !selectedOrganization?.id || panelMode !== "view" || organizationViewTab !== "activity") return;
    const refreshHistoryIfVisible = () => {
      if (document.visibilityState === "visible") {
        setInvitationHistoryReloadKey((key) => key + 1);
      }
    };
    const intervalId = window.setInterval(refreshHistoryIfVisible, 60_000);
    document.addEventListener("visibilitychange", refreshHistoryIfVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshHistoryIfVisible);
    };
  }, [user, selectedOrganization?.id, panelMode, organizationViewTab]);

  useEffect(() => {
    const organizationId = selectedOrganization?.id;

    if (typeof organizationId !== "string" || organizationId.length === 0 || panelMode !== "view") {
      organizationInvitationsLoadedKeyRef.current = null;
      setOrganizationInvitations([]);
      setOrganizationInvitationsError("");
      setLoadingOrganizationInvitations(false);
      return;
    }

    if (organizationViewTab !== "activity") {
      setLoadingOrganizationInvitations(false);
      return;
    }

    // Retain previously loaded rows while the administrator moves between tabs.
    const requestOrganizationId: string = organizationId;
    const loadKey = `${requestOrganizationId}:${invitationHistoryReloadKey}`;
    if (organizationInvitationsLoadedKeyRef.current === loadKey) {
      setLoadingOrganizationInvitations(false);
      return;
    }
    let isActive = true;

    async function loadOrganizationInvitations() {
      const hasCachedHistory = organizationInvitationsLoadedKeyRef.current?.startsWith(`${requestOrganizationId}:`) ?? false;
      if (!hasCachedHistory) setLoadingOrganizationInvitations(true);
      setOrganizationInvitationsError("");

      try {
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(requestOrganizationId)}/invitations`,
          { cache: "no-store" },
        );

        if (response.status === 401) {
          router.replace("/");
          return;
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load this organization's invitation history.",
          );
        }

        if (!Array.isArray(data.invitations)) {
          throw new Error(
            "The organization invitations API returned an unexpected response.",
          );
        }

        if (isActive) {
          setOrganizationInvitations(data.invitations as OrganizationInvitation[]);
          setOrganizationInvitationsError("");
          organizationInvitationsLoadedKeyRef.current = loadKey;
        }
      } catch (invitationsError) {
        console.error("Organization invitation history loading error:", invitationsError);

        if (isActive) {
          setOrganizationInvitationsError(
            invitationsError instanceof Error
              ? invitationsError.message
              : "Could not load invitation history. Please try again.",
          );
        }
      } finally {
        if (isActive) setLoadingOrganizationInvitations(false);
      }
    }

    void loadOrganizationInvitations();

    return () => {
      isActive = false;
    };
  }, [selectedOrganization?.id, panelMode, organizationViewTab, router, invitationHistoryReloadKey]);

  useEffect(() => {
    const organizationId = selectedOrganization?.id;

    if (typeof organizationId !== "string" || organizationId.length === 0 || panelMode !== "view") {
      organizationUsersLoadedKeyRef.current = null;
      organizationUsersLoadMoreControllerRef.current?.abort();
      organizationUsersLoadMoreControllerRef.current = null;
      setOrganizationUsers([]);
      setOrganizationUsersSummary(null);
      setOrganizationUsersError("");
      setOrganizationUsersMoreError("");
      setLoadingMoreOrganizationUsers(false);
      setLoadingOrganizationUsers(false);
      return;
    }

    if (organizationViewTab !== "users") {
      setLoadingOrganizationUsers(false);
      setLoadingMoreOrganizationUsers(false);
      return;
    }

    const requestOrganizationId: string = organizationId;
    const loadKey = `${requestOrganizationId}:${organizationUserFilter}:${organizationUsersReloadKey}`;
    if (organizationUsersLoadedKeyRef.current === loadKey) {
      setLoadingOrganizationUsers(false);
      return;
    }
    let isActive = true;
    organizationUsersLoadMoreControllerRef.current?.abort();
    organizationUsersLoadMoreControllerRef.current = null;

    async function loadOrganizationUsers() {
      setLoadingOrganizationUsers(true);
      setLoadingMoreOrganizationUsers(false);
      setOrganizationUsersError("");
      setOrganizationUsersMoreError("");
      setOrganizationUsers([]);
      setOrganizationUsersSummary((current) => {
        if (!current) return current;
        const matchingTotal = organizationUserFilter === "ALL"
          ? current.total
          : organizationUserFilter === "ACTIVE"
            ? current.active
            : organizationUserFilter === "INVITED"
              ? current.invited
              : organizationUserFilter === "SUSPENDED"
                ? current.suspended
                : current.deactivated;
        return { ...current, matchingTotal };
      });

      try {
        const query = new URLSearchParams({
          status: organizationUserFilter,
          offset: "0",
        });
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(requestOrganizationId)}/users?${query.toString()}`,
          { cache: "no-store" },
        );

        if (response.status === 401) {
          router.replace("/");
          return;
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load this organization's users.",
          );
        }

        if (!Array.isArray(data.users)) {
          throw new Error(
            "The organization users API returned an unexpected response.",
          );
        }

        const users = data.users as OrganizationAccount[];
        const counts = data.counts ?? {};

        const rawTotal = Number(data.total);
        const total =
          Number.isFinite(rawTotal) && rawTotal >= 0
            ? rawTotal
            : users.length;

        const rawMatchingTotal = Number(data.matchingTotal);
        const matchingTotal = Number.isFinite(rawMatchingTotal) && rawMatchingTotal >= 0
          ? rawMatchingTotal
          : total;

        const summary: OrganizationUsersSummary = {
          total,
          matchingTotal,
          active: Number(counts.active) || 0,
          invited: Number(counts.invited) || 0,
          suspended: Number(counts.suspended) || 0,
          deactivated: Number(counts.deactivated) || 0,
          returned: users.length,
        };

        if (isActive) {
          setOrganizationUsers(users);
          setOrganizationUsersSummary(summary);
          organizationUsersLoadedKeyRef.current = loadKey;

          setSelectedOrganization((current) =>
            current && current.id === requestOrganizationId
              ? { ...current, user_count: total }
              : current,
          );

          setOrganizations((current) =>
            current.map((organization) =>
              organization.id === requestOrganizationId
                ? { ...organization, user_count: total }
                : organization,
            ),
          );
        }
      } catch (usersError) {
        console.error("Organization users loading error:", usersError);

        if (isActive) {
          setOrganizationUsersError(
            usersError instanceof Error
              ? usersError.message
              : "Could not load this organization's users. Please try again.",
          );
        }
      } finally {
        if (isActive) setLoadingOrganizationUsers(false);
      }
    }

    void loadOrganizationUsers();

    return () => {
      isActive = false;
      organizationUsersLoadMoreControllerRef.current?.abort();
      organizationUsersLoadMoreControllerRef.current = null;
    };
  }, [selectedOrganization?.id, panelMode, organizationViewTab, organizationUserFilter, organizationUsersReloadKey, router]);

  async function loadMoreOrganizationUsers() {
    const organizationId = selectedOrganization?.id;
    if (
      !organizationId ||
      loadingMoreOrganizationUsers ||
      loadingOrganizationUsers ||
      !organizationUsersSummary ||
      organizationUsers.length >= organizationUsersSummary.matchingTotal
    ) return;

    const controller = new AbortController();
    organizationUsersLoadMoreControllerRef.current?.abort();
    organizationUsersLoadMoreControllerRef.current = controller;
    setLoadingMoreOrganizationUsers(true);
    setOrganizationUsersMoreError("");

    try {
      const query = new URLSearchParams({
        status: organizationUserFilter,
        offset: String(organizationUsers.length),
      });
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(organizationId)}/users?${query.toString()}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.users)) {
        throw new Error(data.message || "Could not load more user accounts.");
      }
      const nextUsers = data.users as OrganizationAccount[];
      if (controller.signal.aborted) return;
      setOrganizationUsers((current) => {
        const existingIds = new Set(current.map((account) => account.id));
        return [...current, ...nextUsers.filter((account) => !existingIds.has(account.id))];
      });
      setOrganizationUsersSummary((current) => current ? {
        ...current,
        matchingTotal: Number.isFinite(Number(data.matchingTotal))
          ? Math.max(0, Number(data.matchingTotal))
          : current.matchingTotal,
        returned: current.returned + nextUsers.length,
      } : current);
    } catch (error) {
      if (!controller.signal.aborted) {
        setOrganizationUsersMoreError(
          error instanceof Error ? error.message : "Could not load more user accounts. Please try again.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMoreOrganizationUsers(false);
        if (organizationUsersLoadMoreControllerRef.current === controller) {
          organizationUsersLoadMoreControllerRef.current = null;
        }
      }
    }
  }

  const openOrganizationPanel = useCallback((
    organization: Organization,
    mode: OrganizationPanelMode,
  ) => {
    // Archived organizations remain viewable, but edit mode must never open.
    // This also protects direct links such as ?panel=edit and command-palette actions.
    const archivedEditRequest =
      organization.status?.toUpperCase() === "ARCHIVED" && mode === "edit";
    const resolvedMode: OrganizationPanelMode = archivedEditRequest ? "view" : mode;

    const activeElement = document.activeElement;
    organizationPanelOpenerRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    organizationPanelFocusTargetRef.current = resolvedMode === "edit" ? "name" : "close";
    setPanelDiscardIntent(null);
    setSelectedOrganization(organization);
    setOrganizationLicense(null);
    setOrganizationLicenseError("");
    setOrganizationLicenseLoading(true);
    setPanelMode(resolvedMode);
    setOrganizationViewTab("overview");
    setOrganizationUserFilter("ALL");
    setTouchedEditFields(new Set());
    setEditSubmitAttempted(false);
    setSlugAvailability("idle");
    setCopyFeedback(null);

    organizationUsersLoadedKeyRef.current = null;
    organizationInvitationsLoadedKeyRef.current = null;
    setOrganizationUsers([]);
    setOrganizationUsersSummary(null);
    setOrganizationUsersError("");
    setLoadingOrganizationUsers(false);
    organizationUsersLoadMoreControllerRef.current?.abort();
    organizationUsersLoadMoreControllerRef.current = null;
    setLoadingMoreOrganizationUsers(false);
    setOrganizationUsersMoreError("");
    setOrganizationInvitations([]);
    setOrganizationInvitationsError("");
    setLoadingOrganizationInvitations(false);

    setPanelError("");
    setPanelSuccess(
      archivedEditRequest
        ? "Archived organizations are read-only. Details opened in view mode."
        : "",
    );

    setEditFields({
      name: organization.name ?? "",
      slug: organization.slug ?? "",
      contactEmail: organization.contact_email ?? "",
      contactPhone: organization.contact_phone ?? "",
      address: organization.address ?? "",
      country: organization.country ?? "",
    });
  }, []);

  // Open the existing side panel when the dashboard links here with
  // ?organizationId=<id>&panel=view|edit, then remove the one-time query.
  useEffect(() => {
    if (loading || processedDashboardPanelRequest.current) return;

    const params = new URLSearchParams(window.location.search);
    const organizationId = params.get("organizationId");
    const requestedPanel = params.get("panel");
    const shouldCreateOrganization = params.get("create") === "1";

    // Shared command palette actions on other dashboard pages can open the drawer here.
    if (shouldCreateOrganization) {
      processedDashboardPanelRequest.current = true;
      setCreateOrganizationOpen(true);
      router.replace("/dashboard/organizations", { scroll: false });
      return;
    }

    // Ordinary visits to the Organizations page should behave exactly as before.
    if (!organizationId && !requestedPanel) {
      processedDashboardPanelRequest.current = true;
      return;
    }

    if (!organizationId || (requestedPanel !== "view" && requestedPanel !== "edit")) {
      processedDashboardPanelRequest.current = true;
      router.replace("/dashboard/organizations", { scroll: false });
      return;
    }

    const organization = organizations.find((item) => item.id === organizationId);

    // The list API is limited to the latest 100 organizations. If this ID is
    // not present, avoid leaving stale parameters in the URL or opening the wrong panel.
    if (!organization) {
      processedDashboardPanelRequest.current = true;
      router.replace("/dashboard/organizations", { scroll: false });
      return;
    }

    processedDashboardPanelRequest.current = true;
    openOrganizationPanel(organization, requestedPanel);
    router.replace("/dashboard/organizations", { scroll: false });
  }, [loading, organizations, router, openOrganizationPanel]);

  function finishCloseOrganizationPanel() {
    if (savingOrganization) return;

    setPanelDiscardIntent(null);
    setSelectedOrganization(null);
    setPanelError("");
    setPanelSuccess("");

    const opener = organizationPanelOpenerRef.current;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      organizationPanelOpenerRef.current = null;
    });
  }

  function requestCloseOrganizationPanel() {
    if (savingOrganization) return;

    if (panelMode === "edit" && hasOrganizationChanges) {
      setPanelDiscardIntent("close");
      return;
    }

    finishCloseOrganizationPanel();
  }

  function returnToOrganizationView() {
    if (!selectedOrganization) return;

    setEditFields({
      name: selectedOrganization.name ?? "",
      slug: selectedOrganization.slug ?? "",
      contactEmail: selectedOrganization.contact_email ?? "",
      contactPhone: selectedOrganization.contact_phone ?? "",
      address: selectedOrganization.address ?? "",
      country: selectedOrganization.country ?? "",
    });
    organizationPanelFocusTargetRef.current = "edit";
    setPanelMode("view");
    setTouchedEditFields(new Set());
    setEditSubmitAttempted(false);
    setSlugAvailability("idle");
    setPanelDiscardIntent(null);
    setPanelError("");
    setPanelSuccess("");
  }

  function requestCancelOrganizationEdit() {
    if (savingOrganization) return;

    if (hasOrganizationChanges) {
      setPanelDiscardIntent("returnToView");
      return;
    }

    returnToOrganizationView();
  }

  function confirmOrganizationPanelDiscard() {
    const intent = panelDiscardIntent;
    setPanelDiscardIntent(null);

    if (intent === "close") {
      finishCloseOrganizationPanel();
    } else if (intent === "returnToView") {
      returnToOrganizationView();
    }
  }

  function trapOrganizationPanelTabKey(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;

    const focusScope = panelDiscardIntent
      ? organizationPanelDiscardDialogRef.current
      : organizationPanelRef.current;
    if (!focusScope) return;

    const focusable = Array.from(focusScope.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]"),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!focusScope.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function beginOrganizationEdit() {
    if (!selectedOrganization) return;
    if (selectedOrganization.status?.toUpperCase() === "ARCHIVED") {
      setPanelMode("view");
      setPanelError("Archived organizations are read-only and cannot be edited.");
      return;
    }

    setEditFields({
      name: selectedOrganization.name ?? "",
      slug: selectedOrganization.slug ?? "",
      contactEmail: selectedOrganization.contact_email ?? "",
      contactPhone: selectedOrganization.contact_phone ?? "",
      address: selectedOrganization.address ?? "",
      country: selectedOrganization.country ?? "",
    });
    setTouchedEditFields(new Set());
    setEditSubmitAttempted(false);
    setSlugAvailability("idle");

    organizationPanelFocusTargetRef.current = "name";
    setPanelMode("edit");
    setPanelError("");
    setPanelSuccess("");
  }

  async function handleRestoreArchivedOrganization(organization: Organization) {
    const confirmed = window.confirm(`Restore ${organization.name} from archive? It will return to SUSPENDED status and will not be reactivated automatically.`);
    if (!confirmed) return;
    const reason = window.prompt("Enter a reason for restoring this organization (at least 3 characters):")?.trim() || "";
    if (reason.length < 3 || reason.length > 1000) {
      setTableActionSuccess("");
      setError("Restore cancelled: provide a reason between 3 and 1000 characters.");
      return;
    }
    setStatusUpdatingOrganizationId(organization.id);
    setError("");
    try {
      const response = await fetch(`/api/backend/organizations/${encodeURIComponent(organization.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED", restoreArchived: true, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not restore this organization.");
      setOrganizationsReloadKey((key) => key + 1);
      setSelectedOrganization((current) => current?.id === organization.id ? { ...current, status: "SUSPENDED" } : current);
      setTableActionSuccess(`${organization.name} was restored to Suspended status.`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Could not restore this organization.");
    } finally {
      setStatusUpdatingOrganizationId(null);
    }
  }

  function handleToggleOrganizationStatus(organization: Organization) {
    if (organization.status === "PENDING_SETUP") return;
    setStatusActionOrganization(organization);
    setStatusConfirmationSlug("");
    setStatusActionError("");
  }

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
    setTableActionSuccess("");

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
        current.map((item) =>
          item.id === organization.id ? { ...item, status: savedStatus } : item,
        ),
      );
      setSelectedOrganization((current) =>
        current?.id === organization.id ? { ...current, status: savedStatus } : current,
      );
      setTableActionSuccess(
        `${organization.name} ${savedStatus === "SUSPENDED" ? "was suspended" : "was reactivated"} successfully.`,
      );
      setStatusActionOrganization(null);
      setStatusConfirmationSlug("");
      setStatusActionError("");
    } catch (statusError) {
      console.error("Organization status update error:", statusError);
      setStatusActionError(
        statusError instanceof Error
          ? statusError.message
          : `Could not ${actionLabel} this organization. Please try again.`,
      );
    } finally {
      setStatusUpdatingOrganizationId(null);
    }
  }

  async function handleSaveOrganization(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setEditSubmitAttempted(true);

    if (!selectedOrganization) return;

    // Defense in depth: never submit an edit for an archived organization,
    // even if the UI state is stale or an edit form was opened before archival.
    if (selectedOrganization.status?.toUpperCase() === "ARCHIVED") {
      setPanelMode("view");
      setPanelError("Archived organizations are read-only and cannot be edited.");
      return;
    }

    if (Object.keys(editFieldErrors).length > 0) {
      setPanelError("Please correct the highlighted fields before saving.");
      return;
    }
    if (slugAvailability === "checking") {
      setPanelError("Wait for the slug availability check to finish before saving.");
      return;
    }
    if (slugAvailability === "taken") {
      setPanelError("This slug is already used by another organization. Choose a different slug.");
      return;
    }

    setSavingOrganization(true);
    setPanelError("");
    setPanelSuccess("");

    try {
      const response = await fetch(
        `/api/backend/organizations/${encodeURIComponent(selectedOrganization.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editFields.name.trim(),
            slug: editFields.slug.trim().toLowerCase(),
            contactEmail: editFields.contactEmail.trim().toLowerCase(),
            contactPhone: editFields.contactPhone.trim(),
            address: editFields.address.trim(),
            country: editFields.country.trim(),
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        router.replace("/");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update organization.",
        );
      }

      const serverOrganization =
        (data.organization ?? {}) as Partial<Organization>;

      const updatedOrganization: Organization = {
        ...selectedOrganization,
        ...serverOrganization,
        name: serverOrganization.name ?? editFields.name.trim(),
        slug:
          serverOrganization.slug ??
          editFields.slug.trim().toLowerCase(),
        contact_email:
          serverOrganization.contact_email ??
          editFields.contactEmail.trim().toLowerCase(),
        contact_phone:
          serverOrganization.contact_phone ??
          editFields.contactPhone.trim(),
        address:
          serverOrganization.address ?? editFields.address.trim(),
        country:
          serverOrganization.country ?? (editFields.country.trim() || null),
      };

      setOrganizations((current) =>
        current.map((organization) =>
          organization.id === updatedOrganization.id
            ? updatedOrganization
            : organization,
        ),
      );

      setSelectedOrganization(updatedOrganization);
      setPanelMode("view");
      setPanelSuccess(
        data.message || "Organization updated successfully.",
      );
    } catch (saveError) {
      console.error("Organization update error:", saveError);

      setPanelError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update this organization. Please try again.",
      );
    } finally {
      setSavingOrganization(false);
    }
  }

  useEffect(() => {
    if (!selectedOrganizationId) {
      setOrganizationLicense(null);
      setOrganizationLicenseLoading(false);
      setOrganizationLicenseError("");
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function loadOrganizationLicense() {
      setOrganizationLicenseLoading(true);
      setOrganizationLicenseError("");
      try {
        const response = await fetch(
          `/api/backend/organizations/${encodeURIComponent(selectedOrganizationId!)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || "Could not load license information.");
        }
        if (active) {
          setOrganizationLicense(data.license ?? null);
          if (!data.license) setOrganizationLicenseError("License information is currently unavailable.");
        }
      } catch (loadError) {
        if (active && !(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setOrganizationLicenseError(
            loadError instanceof Error ? loadError.message : "Could not load license information.",
          );
        }
      } finally {
        if (active) setOrganizationLicenseLoading(false);
      }
    }

    void loadOrganizationLicense();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedOrganizationId, router]);

  useEffect(() => {
    if (!selectedOrganizationId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (commandPaletteOpen || statusActionOrganization || createOrganizationOpen) return;

      event.preventDefault();
      event.stopPropagation();

      if (panelDiscardIntentRef.current) {
        setPanelDiscardIntent(null);
        return;
      }

      if (savingOrganization) return;
      requestCloseOrganizationPanel();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    selectedOrganizationId,
    savingOrganization,
    commandPaletteOpen,
    statusActionOrganization,
    createOrganizationOpen,
    panelMode,
    hasOrganizationChanges,
  ]);

  // Keep the scroll lock tied to the drawer's open/closed lifecycle, not to
  // selectedOrganization object updates after saving. Otherwise a save could
  // accidentally leave the page body locked.
  useEffect(() => {
    if (!selectedOrganizationId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedOrganizationId]);

  // Put keyboard focus inside the drawer and move it to the edit form when
  // switching modes. When the discard prompt is open, its own buttons manage focus.
  useEffect(() => {
    if (!selectedOrganizationId || panelDiscardIntent) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const focusTarget = organizationPanelFocusTargetRef.current;
      if (panelMode === "edit" && focusTarget === "name") {
        organizationEditNameInputRef.current?.focus();
      } else if (panelMode === "view" && focusTarget === "edit") {
        organizationEditButtonRef.current?.focus();
      } else {
        organizationPanelCloseButtonRef.current?.focus();
      }
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [selectedOrganizationId, panelMode, panelDiscardIntent]);

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

  const filteredOrganizations = organizations;

  const counts = organizationSummary;

  const commandItems = useMemo(
    () => buildSuperAdminCommandItems(organizations),
    [organizations],
  );

  const selectCommandItem = useCallback((item: CommandPaletteItem) => {
    if (item.disabled || !item.href) return;
    setCommandPaletteOpen(false);

    if (item.id === "create-organization") {
      setCreateOrganizationOpen(true);
      return;
    }

    // When the palette is already on the Organizations page, selecting an
    // organization must open the panel directly. Pushing another URL with a
    // query string does not remount this page, so the one-time URL effect
    // won't run again for that selection.
    if (item.organizationId) {
      const organization = organizations.find(
        (candidate) => candidate.id === item.organizationId,
      );

      if (organization) {
        openOrganizationPanel(organization, "view");
        return;
      }
    }

    router.push(item.href);
  }, [openOrganizationPanel, organizations, router]);

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

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17]">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#182232]/90 px-6 py-5 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-300">
            Verifying your admin session...
          </p>
        </div>
      </main>
    );
  }

  if (!user) return null;

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

  const summaryCards = [
    {
      label: "Total organizations",
      value: loading && !hasLoadedOrganizationsRef.current ? "…" : error && !hasLoadedOrganizationsRef.current ? "—" : counts.total.toLocaleString(),
      icon: "building" as const,
      iconStyle: "bg-blue-500/15 text-blue-300",
    },
    {
      label: "Active",
      value: loading && !hasLoadedOrganizationsRef.current ? "…" : error && !hasLoadedOrganizationsRef.current ? "—" : counts.active.toLocaleString(),
      icon: "shield" as const,
      iconStyle: "bg-emerald-500/15 text-emerald-300",
    },
    {
      label: "Pending setup",
      value: loading && !hasLoadedOrganizationsRef.current ? "…" : error && !hasLoadedOrganizationsRef.current ? "—" : counts.pending.toLocaleString(),
      icon: "clock" as const,
      iconStyle: "bg-amber-500/15 text-amber-300",
    },
    {
      label: "Suspended",
      value: loading && !hasLoadedOrganizationsRef.current ? "…" : error && !hasLoadedOrganizationsRef.current ? "—" : counts.suspended.toLocaleString(),
      icon: "admin" as const,
      iconStyle: "bg-rose-500/15 text-rose-300",
    },
    {
      label: "Archived",
      value: loading && !hasLoadedOrganizationsRef.current ? "…" : error && !hasLoadedOrganizationsRef.current ? "—" : counts.archived.toLocaleString(),
      icon: "building" as const,
      iconStyle: "bg-slate-500/15 text-slate-300",
    },
  ];

  return (
    <div className="super-admin-theme-root sa-organizations-page min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark" style={{ backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)", backgroundSize: "auto, 42px 42px, 42px 42px" }}>
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
              Manage registered organizations and monitor their status.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-20 border-b border-[#29384b] bg-[#0f1724]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-h-[71px] flex-col justify-center gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative hidden h-[43px] w-full max-w-[482px] sm:block">
              <label htmlFor="organization-search" className="sr-only">
                Search organizations
              </label>
              <input
                id="organization-search"
                type="search"
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setIsSearchDebouncing(true); setOrganizationsPage(1); }}
                placeholder="Search organizations in this view…"
                className="absolute inset-0 h-[43px] w-full rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-12 pr-[6.5rem] text-sm text-slate-100 outline-none placeholder:text-slate-300 focus:border-[#75c7ff] focus:bg-[#182232] focus:ring-2 focus:ring-[#75c7ff]/20"
              />
              <span className="pointer-events-none absolute left-4 top-[11px] text-slate-300">
                <Icon name="search" size={20} />
              </span>
              <CommandPaletteTrigger onClick={() => setCommandPaletteOpen(true)} />
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

          <div className="pb-3 sm:hidden">
            <label htmlFor="organization-search-mobile" className="sr-only">
              Search organizations
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-3 text-slate-300">
                <Icon name="search" size={19} />
              </span>
              <input
                id="organization-search-mobile"
                type="search"
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setIsSearchDebouncing(true); setOrganizationsPage(1); }}
                placeholder="Search organizations in this view…"
                className="h-11 w-full rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-11 pr-20 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-[#75c7ff] focus:bg-[#182232] focus:ring-2 focus:ring-[#75c7ff]/20"
              />
              <CommandPaletteTrigger compact onClick={() => setCommandPaletteOpen(true)} />
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

          <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8db9df]">
                <span className="h-px w-5 bg-[#75c7ff]/70" /> Platform Control <span className="text-slate-600">/</span> Super Admin
              </p>
              <h1 className="text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">
                Organizations
              </h1>
            </div>

          </section>

          <section
            aria-label="Organization status summary"
            className="sa-org-summary-grid grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:gap-4"
          >
            {summaryCards.map((card) => (
              <article
                key={card.label}
                className="sa-org-summary-card relative flex min-h-[112px] min-w-0 flex-col items-start gap-3 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 px-4 py-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl before:absolute before:bottom-5 before:left-0 before:top-5 before:w-[2px] before:bg-[#75c7ff]/70 before:content-[''] xl:flex-row xl:items-center xl:px-4 2xl:gap-4 2xl:px-5 2xl:py-5"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] 2xl:h-12 2xl:w-12 ${card.iconStyle}`}
                >
                  <Icon name={card.icon} size={25} />
                </div>
                <div className="min-w-0">
                  <p className="sa-org-summary-label text-xs font-semibold leading-5 text-[#aebed0]">
                    {card.label}
                  </p>
                  <p className="mt-1 min-w-0 break-words text-3xl font-bold leading-none tracking-[-0.045em] tabular-nums text-[#f2f7fc] xl:text-[32px]">
                    {card.value}
                  </p>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-4 min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-[#29384b] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b0bfd0]">
                  All Organizations
                </h2>
                <p className="mt-1 text-sm leading-5 text-[#9eafc4]">
                  Manage organization details, status and associated accounts.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-xs text-slate-300" aria-live="polite">
                  {isRefreshingOrganizations && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" aria-hidden="true" />}
                  <span>{loading ? "Loading organizations…" : `Showing ${organizationsTotal === 0 ? 0 : (organizationsPage - 1) * 25 + 1}–${Math.min(organizationsPage * 25, organizationsTotal)} of ${organizationsTotal} matching organizations`}</span>
                  {isRefreshingOrganizations && <span className="text-[11px] text-[#91a3b8]">Updating</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOrganizationOpen(true)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#75c7ff]/20 bg-[#21486a] px-4 py-2.5 text-sm font-semibold text-[#eff8ff] shadow-sm shadow-black/20 transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                >
                  <Icon name="plus" size={17} />
                  Create Organization
                </button>
              </div>
            </div>

            {backgroundRefreshError && (
              <div className="px-5 pt-3 sm:px-6">
                <div role="status" className="rounded-lg border border-amber-400/20 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200">
                  Could not refresh the latest organization data. Showing the last loaded results.
                </div>
              </div>
            )}

            {tableActionSuccess && (
              <div className="px-5 pt-4 sm:px-6">
                <div
                  role="status"
                  className="flex items-start justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
                >
                  <span>{tableActionSuccess}</span>
                  <button
                    type="button"
                    onClick={() => setTableActionSuccess("")}
                    className="shrink-0 font-semibold underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#29384b] bg-[#101a28]/90 p-4 sm:px-5">
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <div className="relative w-full sm:w-[300px]">
                  <span className="pointer-events-none absolute left-3.5 top-3 text-slate-300">
                    <Icon name="filter" size={18} />
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setOrganizationsPage(1); }}
                    aria-label="Filter organizations by status"
                    className="h-11 w-full appearance-none rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-10 pr-10 text-sm text-slate-100 outline-none transition focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20"
                  >
                    <option className="bg-[#111a28] text-slate-100" value="NON_ARCHIVED">All operational organizations</option>
                    <option className="bg-[#111a28] text-slate-100" value="ACTIVE">Active</option>
                    <option className="bg-[#111a28] text-slate-100" value="PENDING_SETUP">Pending Setup</option>
                    <option className="bg-[#111a28] text-slate-100" value="SUSPENDED">Suspended</option>
                    <option className="bg-[#111a28] text-slate-100" value="ARCHIVED">Archived</option>
                  </select>
                  <span className="pointer-events-none absolute right-3.5 top-3 text-slate-300">
                    <Icon name="chevron" size={17} />
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setIsSearchDebouncing(searchQuery.length > 0);
                    setStatusFilter("NON_ARCHIVED");
                    setOrganizationsPage(1);
                  }}
                  disabled={!searchQuery && statusFilter === "NON_ARCHIVED"}
                  className="h-11 rounded-lg border border-white/[0.09] bg-white/[0.025] px-4 text-sm font-medium text-[#d3deeb] transition hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear filters
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-[#a7b6c9]">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                Loading organizations...
              </div>
            ) : error ? (
              <div
                className="m-5 rounded-lg border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-200"
                role="alert"
              >
                {error}
              </div>
            ) : organizationsTotal === 0 && !searchQuery.trim() && statusFilter === "NON_ARCHIVED" ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#75c7ff]/15 bg-gradient-to-br from-[#1b344d] to-[#142033] text-[#9ed5ff]">
                  <Icon name="building" size={26} />
                </div>
                <h3 className="mt-4 font-semibold text-[#f8fafc]">
                  No organizations yet
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Create your first organization to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateOrganizationOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#75c7ff]/20 bg-[#21486a] px-4 py-2.5 text-sm font-semibold text-[#eff8ff] transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                >
                  <Icon name="plus" size={17} />
                  Create Organization
                </button>
              </div>
            ) : filteredOrganizations.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                  <Icon name="search" size={22} />
                </div>
                <h3 className="mt-4 font-semibold text-[#f8fafc]">
                  No matching organizations
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Try another search term or choose a different status.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("NON_ARCHIVED");
                    setOrganizationsPage(1);
                  }}
                  className="mt-4 text-sm font-semibold text-[#8bcaff] hover:text-[#c2e7ff]"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent]">
                <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                  <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91a7bf]">
                    <tr>
                      <th className="w-[420px] rounded-l-md px-3 py-3.5 font-semibold">
                        Organization
                      </th>
                      <th className="w-[220px] px-3 py-3.5 font-semibold">
                        Organization Admin
                      </th>
                      <th className="w-[80px] text-center px-3 py-3.5 font-semibold">
                        Users
                      </th>
                      <th className="w-[140px] px-3 py-3.5 font-semibold">Status</th>
                                                                                        <th className="w-[230px] px-3 py-3.5 font-semibold rounded-r-md">Address</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#27384b]/75">
                    {filteredOrganizations.map((organization) => (
                      <tr
                        key={organization.id}
                        className="group transition-colors duration-200 hover:bg-[#14283e]/45 focus-within:bg-[#14283e]/45"
                      >
                        <td className="px-3 py-4 align-middle min-w-0">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <SuperAdminOrganizationLogo
                              organizationId={organization.id}
                              name={organization.name}
                              size="md"
                              className="mt-0.5 transition-colors duration-200 group-hover:border-[#75c7ff]/30"
                            />
                            <span className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openOrganizationPanel(organization, "view")}
                                className="block max-w-[200px] truncate text-left text-sm font-semibold text-[#edf4fb] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                                aria-label={`View ${organization.name} details in side panel`}
                              >
                                {organization.name}
                              </button>
                              <span
                                className="mt-0.5 block max-w-[200px] truncate text-xs text-[#9fb0c4]"
                                title={organization.id}
                              >
                                {organization.slug}
                              </span>
                              <span className="sa-org-row-actions mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-label={`Actions for ${organization.name}`}>
                                <button
                                  type="button"
                                  onClick={() => openOrganizationPanel(organization, "view")}
                                  title="View organization details"
                                  className="sa-organization-view-details inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#75c7ff]/25 bg-[#75c7ff]/[0.07] px-2.5 py-1.5 text-[11px] font-semibold text-[#9ed5ff] transition-all duration-200 hover:border-[#75c7ff]/50 hover:bg-[#75c7ff]/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                                >
                                  View details <Icon name="arrow" size={11} />
                                </button>
                                {organization.status?.toUpperCase() === "ARCHIVED" ? (
                                  <button type="button" onClick={() => void handleRestoreArchivedOrganization(organization)} disabled={statusUpdatingOrganizationId === organization.id} className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50" title="Restore to suspended status">{statusUpdatingOrganizationId === organization.id ? "Restoring…" : "Restore"}</button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openOrganizationPanel(organization, "edit")}
                                    className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] px-2.5 py-1.5 text-[11px] font-semibold text-[#d3deeb] transition-colors hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                                  >
                                    Edit
                                  </button>
                                )}
                                {organization.status === "ACTIVE" || organization.status === "SUSPENDED" ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleOrganizationStatus(organization)}
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
                                    className="inline-flex min-h-8 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-amber-300/15 bg-amber-400/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-amber-200/70"
                                    title="Organization setup must be completed before changing its status."
                                  >
                                    Setup first
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
                              </span>
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-4 align-middle">
                          <div className="flex min-w-0 items-center gap-2">
                            {organization.organization_admin_user_id ? (
                              <SuperAdminUserAvatar
                                organizationId={organization.id}
                                userId={organization.organization_admin_user_id}
                                name={organization.organization_admin_email || "Organization Admin"}
                                size="sm"
                              />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#31445b] bg-[#17263a] text-[10px] text-slate-400">—</span>
                            )}
                            <span
                              className="block max-w-[180px] truncate text-[#cbd5e1]"
                              title={
                                organization.organization_admin_email ||
                                "No linked Organization Admin account"
                              }
                            >
                              {organization.organization_admin_email || "Not assigned"}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-4 align-middle text-center font-medium tabular-nums text-[#cbd5e1]">
                          {organization.user_count == null
                            ? "—"
                            : Number(organization.user_count).toLocaleString()}
                        </td>

                        <td className="px-3 py-4 align-middle">
                          <span
                            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusStyle(organization.status)}`}
                          >
                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStatusDotStyle(organization.status)}`} />
                            {formatStatus(organization.status)}
                          </span>
                        </td>

                        <td className="px-3 py-4 align-middle">
                          <span
                            className="block max-w-[160px] truncate text-slate-300"
                            title={organization.address || "No address"}
                          >
                            {organization.address || "—"}
                          </span>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && !error && organizations.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[#29384b] px-5 py-3 text-xs text-[#8599b1] sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span>
                  Showing {organizationsTotal === 0 ? 0 : (organizationsPage - 1) * 25 + 1}–{Math.min(organizationsPage * 25, organizationsTotal)} of {organizationsTotal} matching organizations.
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setOrganizationsPage((page) => Math.max(1, page - 1))} disabled={organizationsPage <= 1 || loading} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40">Previous</button>
                  <span>Page {organizationsPage} of {organizationsTotalPages}</span>
                  <button type="button" onClick={() => setOrganizationsPage((page) => Math.min(organizationsTotalPages, page + 1))} disabled={organizationsPage >= organizationsTotalPages || loading} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </section>

          <footer className="mt-6 border-t border-[#29384b] py-4 text-xs leading-5 text-[#8b9eb4]">
            HRMS Platform · Super Admin Console
          </footer>
        </div>
      </main>

      {selectedOrganization && (
        <>
          <button
            type="button"
            aria-label="Close organization side panel"
            onClick={requestCloseOrganizationPanel}
            disabled={savingOrganization}
            className="fixed inset-0 z-40 cursor-default bg-black/70 backdrop-blur-md transition-opacity disabled:cursor-wait"
          />

          <aside
            ref={organizationPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="organization-panel-title"
            tabIndex={-1}
            onKeyDown={trapOrganizationPanelTabKey}
            className="organization-slide-over-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-[#29384b] bg-[#111a28] text-[#f8fafc] shadow-[-20px_0_56px_rgba(0,0,0,0.48)] motion-reduce:transition-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#29384b] bg-[#0f1724]/95 px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
                  Organization management
                </p>
                <h2
                  id="organization-panel-title"
                  className="mt-1 text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl"
                >
                  {panelMode === "view"
                    ? "Organization Details"
                    : "Edit Organization"}
                </h2>
                <p className="mt-1 text-sm leading-5 text-[#9eafc4]">
                  {panelMode === "view"
                    ? "Review this organization's profile and account information."
                    : "Update the organization's registration and contact details."}
                </p>
              </div>

              <button
                type="button"
                ref={organizationPanelCloseButtonRef}
                onClick={requestCloseOrganizationPanel}
                disabled={savingOrganization}
                aria-label="Close panel"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#29384b] bg-[#182232]/90 text-xl text-slate-300 transition hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {panelMode === "view" && (
              <>
                <div className="sticky top-0 z-10 shrink-0 border-b border-[#29384b] bg-[#111a28]/95 px-4 py-3 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <SuperAdminOrganizationLogo organizationId={selectedOrganization.id} name={selectedOrganization.name} size="md" />
                      <div className="min-w-0">
                      <p className="max-w-[280px] truncate text-sm font-semibold text-[#f8fafc]">{selectedOrganization.name}</p>
                      <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${getStatusStyle(selectedOrganization.status)}`}>{formatStatus(selectedOrganization.status)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyOrganizationValue("id", selectedOrganization.id)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#29384b] bg-white/[0.025] px-3 text-xs font-semibold text-[#d3deeb] transition hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                      >
                        <Icon name={copyFeedback === "id" ? "check" : "copy"} size={14} />
                        {copyFeedback === "id" ? "Copied!" : "Copy ID"}
                      </button>
                      {selectedOrganization.status === "ACTIVE" || selectedOrganization.status === "SUSPENDED" ? (
                        <button
                          type="button"
                          onClick={() => handleToggleOrganizationStatus(selectedOrganization)}
                          className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${selectedOrganization.status === "ACTIVE" ? "border-rose-400/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" : "border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"}`}
                        >
                          {selectedOrganization.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                        </button>
                      ) : selectedOrganization.status?.toUpperCase() === "ARCHIVED" ? (
                        <button type="button" onClick={() => void handleRestoreArchivedOrganization(selectedOrganization)} disabled={statusUpdatingOrganizationId === selectedOrganization.id} className="inline-flex min-h-9 items-center rounded-lg border border-amber-300/20 bg-amber-400/[0.06] px-3 text-xs font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">{statusUpdatingOrganizationId === selectedOrganization.id ? "Restoring…" : "Restore to Suspended"}</button>
                      ) : (
                        <span className="inline-flex min-h-9 items-center rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200">Setup pending</span>
                      )}
                      {selectedOrganization.status?.toUpperCase() !== "ARCHIVED" && (
                        <button
                          type="button"
                          ref={organizationEditButtonRef}
                          onClick={beginOrganizationEdit}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#75c7ff]/20 bg-[#21486a] px-3.5 text-xs font-semibold text-[#eff8ff] shadow-sm transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                        >
                          <Icon name="building" size={14} /> Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  role="tablist"
                  aria-label="Organization details sections"
                  onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
                    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                    const currentIndex = tabs.indexOf(event.target instanceof HTMLButtonElement ? event.target : document.activeElement as HTMLButtonElement);
                    if (currentIndex < 0 || tabs.length === 0) return;
                    let nextIndex = currentIndex;
                    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
                    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                    if (event.key === "Home") nextIndex = 0;
                    if (event.key === "End") nextIndex = tabs.length - 1;
                    const nextTab = tabs[nextIndex];
                    const nextTabId = nextTab?.dataset.organizationTab as OrganizationViewTab | undefined;
                    if (!nextTab || !nextTabId) return;
                    event.preventDefault();
                    setOrganizationViewTab(nextTabId);
                    nextTab.focus();
                    if (organizationPanelBodyRef.current) organizationPanelBodyRef.current.scrollTop = 0;
                  }}
                  className="sa-organization-detail-tabs flex shrink-0 gap-1 overflow-x-auto border-b border-[#29384b] bg-[#101a28]/90 px-4 sm:px-6"
                >
                  {([
                    { id: "overview", label: "Overview" },
                    { id: "users", label: "Users" },
                    { id: "activity", label: "Invitation Logs" },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`organization-tab-${tab.id}`}
                      aria-selected={organizationViewTab === tab.id}
                      aria-controls={`organization-panel-${tab.id}`}
                      data-organization-tab={tab.id}
                      tabIndex={organizationViewTab === tab.id ? 0 : -1}
                      onClick={() => {
                        setOrganizationViewTab(tab.id);
                        if (organizationPanelBodyRef.current) organizationPanelBodyRef.current.scrollTop = 0;
                      }}
                      className={`min-h-11 shrink-0 border-b-2 px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#75c7ff] sm:px-4 ${organizationViewTab === tab.id ? "border-[#75c7ff] text-[#bfe5ff]" : "border-transparent text-slate-300 hover:text-white"}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div ref={organizationPanelBodyRef} className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {panelMode === "view" && organizationViewTab === "overview" && (
              <section className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                      <span className="truncate">{selectedOrganization.slug || "No slug"}</span>
                      <button
                        type="button"
                        onClick={() => void copyOrganizationValue("slug", selectedOrganization.slug)}
                        aria-label={copyFeedback === "slug" ? "Slug copied to clipboard" : "Copy organization slug"}
                        title={copyFeedback === "slug" ? "Copied to clipboard!" : "Copy slug"}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#29384b] text-slate-300 transition hover:border-[#75c7ff]/40 hover:text-[#bfe5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                      >
                        <Icon name={copyFeedback === "slug" ? "check" : "copy"} size={13} />
                      </button>
                      {copyFeedback === "slug" && <span role="status" className="text-[11px] text-emerald-300">Copied to clipboard!</span>}
                    </div>
                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-slate-300">
                      <span className="min-w-0 truncate" title={selectedOrganization.id}>ID: {selectedOrganization.id}</span>
                      <button
                        type="button"
                        onClick={() => void copyOrganizationValue("id", selectedOrganization.id)}
                        aria-label={copyFeedback === "id" ? "Organization ID copied to clipboard" : "Copy organization ID"}
                        title={copyFeedback === "id" ? "Copied to clipboard!" : "Copy organization ID"}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#29384b] text-slate-300 transition hover:border-[#75c7ff]/40 hover:text-[#bfe5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                      >
                        <Icon name={copyFeedback === "id" ? "check" : "copy"} size={13} />
                      </button>
                      {copyFeedback === "id" && <span role="status" className="text-[11px] text-emerald-300">Copied to clipboard!</span>}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#29384b] pt-4">
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-300">
                    {selectedOrganization.user_count == null
                      ? "User count unavailable"
                      : `${Number(selectedOrganization.user_count).toLocaleString()} user accounts`}
                  </span>
                </div>
              </section>
              )}

              {panelError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300"
                >
                  {panelError}
                </div>
              )}

              {panelSuccess && (
                <div
                  role="status"
                  className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"
                >
                  {panelSuccess}
                </div>
              )}

              {panelMode === "view" ? (
                <>
                  {organizationViewTab === "overview" && (
                  <div id="organization-panel-overview" role="tabpanel" aria-labelledby="organization-tab-overview">
                  <section className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4">
                      <p className="text-xs font-medium text-slate-300">
                        Created At
                      </p>
                      <p className="mt-2 text-base font-bold text-[#f8fafc]">
                        {formatDate(selectedOrganization.created_at)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4">
                      <p className="text-xs font-medium text-slate-300">
                        Organization Admin
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold text-[#f8fafc]">
                        {selectedOrganization.organization_admin_email ||
                          "Not assigned"}
                      </p>
                    </div>
                  </section>

                  <section className="mt-5 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl" aria-labelledby="organization-drawer-license-title">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 id="organization-drawer-license-title" className="text-sm font-bold text-[#f8fafc]">Platform license</h3>
                        <p className="mt-1 text-xs text-slate-300">Read-only subscription and access status</p>
                      </div>
                      {organizationLicense && (
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          organizationLicense.status === "ACTIVE"
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
                            : organizationLicense.status === "EXPIRED"
                              ? "border-rose-400/25 bg-rose-500/10 text-rose-300"
                              : "border-amber-400/25 bg-amber-500/10 text-amber-300"
                        }`}>{organizationLicense.status === "NOT_ACTIVATED" ? "Not activated" : organizationLicense.status === "ACTIVE" ? "Active" : "Expired"}</span>
                      )}
                    </div>
                    {organizationLicenseLoading ? (
                      <p className="mt-4 text-sm text-slate-300" role="status">Loading license information…</p>
                    ) : organizationLicenseError ? (
                      <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{organizationLicenseError}</p>
                    ) : organizationLicense ? (
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-[#29384b] bg-[#101a28]/70 p-3">
                          <dt className="text-xs text-slate-300">License record</dt>
                          <dd className={`mt-1 text-sm font-semibold ${organizationLicense.licenseExists ? "text-emerald-300" : "text-amber-300"}`}>{organizationLicense.licenseExists ? "Present" : "Missing"}</dd>
                        </div>
                        <div className="rounded-lg border border-[#29384b] bg-[#101a28]/70 p-3">
                          <dt className="text-xs text-slate-300">Access</dt>
                          <dd className={`mt-1 text-sm font-semibold ${organizationLicense.canAccess ? "text-emerald-300" : "text-rose-300"}`}>{organizationLicense.canAccess ? "Allowed" : "Restricted"}</dd>
                        </div>
                        <div className="rounded-lg border border-[#29384b] bg-[#101a28]/70 p-3">
                          <dt className="text-xs text-slate-300">Remaining</dt>
                          <dd className="mt-1 text-sm font-semibold text-[#f8fafc]">{organizationLicense.remainingDays == null ? "—" : `${organizationLicense.remainingDays} days`}</dd>
                        </div>
                        <div className="rounded-lg border border-[#29384b] bg-[#101a28]/70 p-3">
                          <dt className="text-xs text-slate-300">Starts</dt>
                          <dd className="mt-1 text-sm font-semibold text-[#f8fafc]">{organizationLicense.startsAt ? formatDate(organizationLicense.startsAt) : "—"}</dd>
                        </div>
                        <div className="rounded-lg border border-[#29384b] bg-[#101a28]/70 p-3">
                          <dt className="text-xs text-slate-300">Expires</dt>
                          <dd className="mt-1 text-sm font-semibold text-[#f8fafc]">{organizationLicense.expiresAt ? formatDate(organizationLicense.expiresAt) : "—"}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-slate-300">Activation source</dt>
                          <dd className="mt-1 text-sm font-medium text-slate-200">{organizationLicense.activationSource === "PAYMENT" ? "Payment" : organizationLicense.activationSource === "LEGACY_GRACE" ? "Legacy grace" : organizationLicense.activationSource === "NONE" ? "None" : "—"}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="mt-4 text-sm text-slate-300">No license information is available.</p>
                    )}
                  </section>

                  <section className="mt-5 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                    <h3 className="text-sm font-bold text-[#f8fafc]">
                      Registration & Contact
                    </h3>
                    <dl className="mt-4 divide-y divide-[#27384b]/75">
                      <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                        <dt className="text-xs font-medium text-slate-300">
                          Contact Email
                        </dt>
                        <dd className="break-words text-sm text-slate-200">
                          {selectedOrganization.contact_email || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                        <dt className="text-xs font-medium text-slate-300">
                          Contact Phone
                        </dt>
                        <dd className="break-words text-sm text-slate-200">
                          {selectedOrganization.contact_phone || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                        <dt className="text-xs font-medium text-slate-300">Country</dt>
                        <dd className="break-words text-sm text-slate-200"><CountryDisplay value={selectedOrganization.country} /></dd>
                      </div>
                      <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                        <dt className="text-xs font-medium text-slate-300">
                          Address
                        </dt>
                        <dd className="whitespace-pre-wrap break-words text-sm text-slate-200">
                          {selectedOrganization.address || "—"}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  </div>
                  )}

                  {organizationViewTab === "activity" && (
                  <div id="organization-panel-activity" role="tabpanel" aria-labelledby="organization-tab-activity">
                  <section
                    aria-labelledby="organization-invitation-history-title"
                    className="mt-5 min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#29384b] px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                          <Icon name="mail" size={19} />
                        </span>
                        <div>
                          <h3
                            id="organization-invitation-history-title"
                            className="text-sm font-bold text-[#f8fafc]"
                          >
                            Invitation History
                          </h3>

                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                          {loadingOrganizationInvitations
                            ? "Loading…"
                            : `${organizationInvitations.length.toLocaleString()} records`}
                        </span>
                      </div>
                    </div>

                    {loadingOrganizationInvitations ? (
                      <div className="flex items-center justify-center gap-3 px-5 py-8 text-sm text-slate-300">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        Loading invitation history…
                      </div>
                    ) : organizationInvitationsError ? (
                      <div
                        role="alert"
                        className="m-4 flex flex-col gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <p>{organizationInvitationsError}</p>
                        <button
                          type="button"
                          onClick={() =>
                            setInvitationHistoryReloadKey((current) => current + 1)
                          }
                          className="shrink-0 font-semibold underline underline-offset-2"
                        >
                          Try again
                        </button>
                      </div>
                    ) : organizationInvitations.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                          <Icon name="mail" size={19} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-200">
                          No invitations yet
                        </p>

                      </div>
                    ) : (
                      <div className="divide-y divide-[#27384b]/75">
                        {organizationInvitations.map((invitation) => (
                          <div
                            key={invitation.id}
                            className="flex flex-col gap-3 px-4 py-4 transition hover:bg-white/[0.045] sm:flex-row sm:items-start sm:justify-between sm:px-5"
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                                <Icon name="mail" size={16} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="break-all text-sm font-semibold text-[#f8fafc]">
                                  {invitation.email}
                                </p>
                                <p className="mt-1 text-xs text-slate-300">
                                  Sent {formatDate(invitation.created_at)}
                                </p>
                                <p className="mt-1 text-xs text-slate-300">
                                  {invitation.status === "ACCEPTED"
                                    ? `Accepted ${formatDate(invitation.accepted_at ?? invitation.created_at)}`
                                    : invitation.status === "REVOKED"
                                      ? `Revoked ${formatDate(invitation.revoked_at ?? invitation.created_at)}`
                                      : invitation.status === "EXPIRED"
                                        ? `Expired ${formatDate(invitation.expires_at)}`
                                        : `Expires ${formatDate(invitation.expires_at)}`}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${getInvitationStatusStyle(invitation.status)}`}
                            >
                              {formatStatus(invitation.status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!loadingOrganizationInvitations &&
                      !organizationInvitationsError &&
                      organizationInvitations.length >= 50 && (
                        <p className="border-t border-[#29384b] bg-[#111a28] px-5 py-3 text-[11px] leading-5 text-slate-300">
                          Showing the 50 most recent invitation records returned by the API.
                        </p>
                      )}
                  </section>
                  </div>
                  )}

                  {organizationViewTab === "users" && (
                  <div id="organization-panel-users" role="tabpanel" aria-labelledby="organization-tab-users">
                  <section className="mt-4 min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                    <div className="border-b border-[#29384b] px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-[#f8fafc]">
                            Organization Users
                          </h3>
                          <p className="mt-1 text-xs text-slate-300">
                            Read-only account directory.
                          </p>
                        </div>

                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
                          <Icon name="users" size={15} />
                          {organizationUsersSummary
                            ? `${organizationUsersSummary.total.toLocaleString()} total`
                            : selectedOrganization.user_count == null
                              ? "Total unavailable"
                              : `${Number(selectedOrganization.user_count).toLocaleString()} total`}
                        </span>
                      </div>
                    </div>

                    {loadingOrganizationUsers && !organizationUsersSummary ? (
                      <div className="flex items-center justify-center gap-3 px-5 py-8 text-sm text-slate-300">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        Loading organization users...
                      </div>
                    ) : organizationUsersError ? (
                      <div
                        role="alert"
                        className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300"
                      >
                        <span>{organizationUsersError}</span>
                        <button
                          type="button"
                          onClick={() => setOrganizationUsersReloadKey((current) => current + 1)}
                          className="shrink-0 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        >
                          Retry
                        </button>
                      </div>
                    ) : organizationUsersSummary &&
                      organizationUsersSummary.total === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-slate-300">
                          <Icon name="users" size={19} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-200">
                          No user accounts yet
                        </p>
                        <p className="mt-1 text-xs text-slate-300">
                          This organization has no linked login accounts.
                        </p>
                      </div>
                    ) : (
                      <>
                        {organizationUsersSummary && (
                          <div className="grid grid-cols-2 gap-2 border-b border-[#29384b] bg-[#111a28] p-3 sm:grid-cols-4">
                            {([
                              { id: "ACTIVE", label: "Active", value: organizationUsersSummary.active, tone: "text-emerald-300" },
                              { id: "INVITED", label: "Invited", value: organizationUsersSummary.invited, tone: "text-amber-300" },
                              { id: "SUSPENDED", label: "Suspended", value: organizationUsersSummary.suspended, tone: "text-rose-300" },
                              { id: "DEACTIVATED", label: "Deactivated", value: organizationUsersSummary.deactivated, tone: "text-slate-200" },
                            ] as const).map((metric) => (
                              <button
                                key={metric.id}
                                type="button"
                                aria-pressed={organizationUserFilter === metric.id}
                                onClick={() => setOrganizationUserFilter(metric.id)}
                                className={`sa-org-user-metric rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${organizationUserFilter === metric.id ? "sa-org-user-metric-selected border-[#75c7ff]/40 bg-[#75c7ff]/[0.09]" : "border-[#29384b] bg-[#141f2e]/90 hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b]"}`}
                              >
                                <span className="block text-[10px] font-medium text-slate-300">{metric.label}</span>
                                <span className={`mt-1 block text-lg font-bold ${metric.tone}`}>{metric.value.toLocaleString()}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 border-b border-[#29384b] px-4 py-3 sm:px-5">
                          {([
                            { id: "ALL", label: "All accounts" },
                            { id: "ACTIVE", label: "Active" },
                            { id: "INVITED", label: "Invited" },
                            { id: "SUSPENDED", label: "Suspended" },
                            { id: "DEACTIVATED", label: "Deactivated" },
                          ] as const).map((filter) => (
                            <button
                              key={filter.id}
                              type="button"
                              aria-pressed={organizationUserFilter === filter.id}
                              onClick={() => setOrganizationUserFilter(filter.id)}
                              className={`sa-org-user-filter rounded-full border px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${organizationUserFilter === filter.id ? "sa-org-user-filter-selected border-[#75c7ff]/40 bg-[#75c7ff]/[0.09] text-[#bfe5ff]" : "border-[#29384b] bg-white/[0.02] text-slate-300 hover:border-[#75c7ff]/20 hover:text-white"}`}
                            >
                              {filter.label}
                            </button>
                          ))}
                          <span className="ml-auto text-[11px] text-slate-300">{filteredOrganizationUsers.length.toLocaleString()} shown</span>
                        </div>

                        <div
                          className="overflow-x-auto overscroll-x-contain px-3 pb-1 sm:px-5 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#75c7ff]/70"
                          role="region"
                          aria-label="Organization user directory"
                          tabIndex={0}
                        >
                          <table className="w-full min-w-[590px] border-collapse text-left text-sm">
                            <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#91a7bf]">
                              <tr>
                                <th scope="col" className="text-[10px] uppercase tracking-[0.15em] rounded-l-md px-3 py-3.5 font-semibold">Account</th>
                                <th scope="col" className="text-[10px] uppercase tracking-[0.15em] px-3 py-3.5 font-semibold">Role</th>
                                <th scope="col" className="text-[10px] uppercase tracking-[0.15em] px-3 py-3.5 font-semibold">Status</th>
                                <th scope="col" className="text-[10px] uppercase tracking-[0.15em] px-3 py-3.5 font-semibold rounded-r-md">Last login</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#27384b]/75">
                              {loadingOrganizationUsers ? (
                                <tr>
                                  <td colSpan={4} className="px-3 text-center text-sm text-slate-300">
                                    <span className="inline-flex items-center gap-2" role="status">
                                      <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
                                      Updating accounts for this filter…
                                    </span>
                                  </td>
                                </tr>
                              ) : filteredOrganizationUsers.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-3 text-center text-sm text-slate-300">No accounts match this status filter.</td>
                                </tr>
                              ) : filteredOrganizationUsers.map((account) => (
                                <tr key={account.id} className="group transition-colors duration-200 hover:bg-[#14283e]/45 focus-within:bg-[#14283e]/45">
                                  <td className="px-3 py-4 align-middle max-w-[250px]">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <SuperAdminUserAvatar
                                        organizationId={selectedOrganization.id}
                                        userId={account.id}
                                        name={account.display_name || account.email}
                                        size="sm"
                                      />
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold text-[#f8fafc]" title={account.display_name || account.email}>{account.display_name || account.email}</span>
                                        <span className="mt-0.5 block truncate text-xs text-slate-300" title={account.email}>{account.email}</span>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-200">{formatStatus(account.role)}</td>
                                  <td className="px-3 py-4 align-middle whitespace-nowrap">
                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                                      account.status === "ACTIVE"
                                        ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20"
                                        : account.status === "INVITED"
                                          ? "bg-amber-500/10 text-amber-300 ring-amber-400/20"
                                          : account.status === "SUSPENDED"
                                            ? "bg-rose-500/10 text-rose-300 ring-rose-400/20"
                                            : "bg-white/[0.06] text-slate-300 ring-white/10"
                                    }`}>
                                      {formatStatus(account.status)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-4 align-middle whitespace-nowrap text-slate-300">
                                    {account.last_login_at ? formatDate(account.last_login_at) : "Never"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {organizationUsersSummary &&
                          organizationUsersSummary.matchingTotal > organizationUsers.length && (
                            <div className="border-t border-[#29384b] bg-[#111a28] px-5 py-3">
                              <p className="text-xs text-slate-300">
                                Showing {filteredOrganizationUsers.length.toLocaleString()} of {organizationUsersSummary.matchingTotal.toLocaleString()} accounts matching this filter.
                              </p>
                              {organizationUsersMoreError && (
                                <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-300">
                                  <span>{organizationUsersMoreError}</span>
                                  <button type="button" onClick={() => void loadMoreOrganizationUsers()} className="font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Try again</button>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => void loadMoreOrganizationUsers()}
                                disabled={loadingMoreOrganizationUsers || loadingOrganizationUsers}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#29384b] bg-white/[0.025] px-3 py-2 text-xs font-semibold text-[#d3deeb] transition hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {loadingMoreOrganizationUsers && <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />}
                                {loadingMoreOrganizationUsers ? "Loading more accounts…" : "Load more accounts"}
                              </button>
                            </div>
                          )}
                      </>
                    )}
                  </section>
                  </div>
                  )}
                </>
              ) : (
                <form
                  noValidate
                  onSubmit={handleSaveOrganization}
                  className="mt-5 space-y-6 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:p-6"
                >
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3">
                    <p className="text-xs leading-5 text-blue-100">Update the fields below. Required fields are marked <span className="text-rose-200">*</span>.</p>
                    <span className="shrink-0 text-[10px] text-blue-200">Status unchanged</span>
                  </div>

                  <section aria-labelledby="org-identity-heading" className="space-y-4">
                    <div className="border-b border-[#29384b] pb-3">
                      <h3 id="org-identity-heading" className="text-sm font-bold text-[#f8fafc]">
                        Organization identity
                      </h3>

                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label htmlFor="panel-org-name" className="block text-sm font-semibold text-slate-200">
                            Organization Name <span className="text-rose-300" aria-hidden="true">*</span>
                          </label>
                          {isEditFieldModified("name") && (
                            <button type="button" onClick={() => revertEditField("name")} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8bcaff] underline decoration-[#75c7ff]/40 underline-offset-2 hover:text-[#c2e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">Revert</button>
                          )}
                        </div>
                        <input
                          id="panel-org-name"
                          ref={organizationEditNameInputRef}
                          name="name"
                          type="text"
                          autoComplete="organization"
                          required
                          minLength={2}
                          maxLength={120}
                          value={editFields.name}
                          onChange={(event) => updateEditField("name", event.target.value)}
                          placeholder="e.g. Acme Ltd"
                          aria-invalid={showEditFieldError("name")}
                          aria-describedby="panel-org-name-help panel-org-name-error"
                          className={`w-full rounded-lg border ${editFieldBorderClass("name")} bg-[#0f1724] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20`}
                        />
                        <div className="mt-1.5 flex items-start justify-between gap-3">
                          <p id="panel-org-name-help" className="text-xs leading-5 text-slate-300">
                            Use the organization's official name.
                          </p>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-300">
                            {editFields.name.length}/120
                          </span>
                        </div>
                        {showEditFieldError("name") && <p id="panel-org-name-error" role="alert" className="mt-1 text-xs text-rose-300">{editFieldErrors.name}</p>}
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label htmlFor="panel-org-slug" className="block text-sm font-semibold text-slate-200">
                            Organization Slug <span className="text-rose-300" aria-hidden="true">*</span>
                          </label>
                          {isEditFieldModified("slug") && (
                            <button type="button" onClick={() => revertEditField("slug")} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8bcaff] underline decoration-[#75c7ff]/40 underline-offset-2 hover:text-[#c2e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">Revert</button>
                          )}
                        </div>
                        <input
                          id="panel-org-slug"
                          name="slug"
                          type="text"
                          autoCapitalize="none"
                          spellCheck={false}
                          required
                          maxLength={80}
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          title="Use lowercase letters, numbers, and single hyphens only."
                          value={editFields.slug}
                          onChange={(event) => updateEditField("slug", event.target.value)}
                          placeholder="acme-ltd"
                          aria-invalid={showEditFieldError("slug") || slugAvailability === "taken"}
                          aria-describedby="panel-org-slug-help panel-org-slug-error panel-org-slug-availability"
                          className={`w-full rounded-lg border ${editFieldBorderClass("slug")} bg-[#0f1724] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20`}
                        />
                        <p id="panel-org-slug-help" className="mt-1.5 text-xs leading-5 text-slate-300">Lowercase letters, numbers and single hyphens only.</p>
                        {(showEditFieldError("slug") || slugAvailability === "taken") && <p id="panel-org-slug-error" role="alert" className="mt-1 text-xs text-rose-300">{slugAvailability === "taken" ? "This slug is already used by another organization." : editFieldErrors.slug}</p>}
                        <p id="panel-org-slug-availability" aria-live="polite" className={`mt-1 text-xs ${slugAvailability === "available" && isEditFieldModified("slug") ? "text-emerald-300" : slugAvailability === "error" ? "text-amber-200" : "text-slate-300"}`}>
                          {slugAvailability === "checking" ? "Checking slug availability…" : slugAvailability === "available" && isEditFieldModified("slug") ? "Slug is available." : slugAvailability === "error" ? "Could not verify now; the server will still validate this slug when saved." : ""}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section aria-labelledby="org-contact-heading" className="space-y-4">
                    <div className="border-b border-[#29384b] pb-3">
                      <h3 id="org-contact-heading" className="text-sm font-bold text-[#f8fafc]">
                        Contact details
                      </h3>

                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label htmlFor="panel-org-email" className="block text-sm font-semibold text-slate-200">
                            Contact Email <span className="text-rose-300" aria-hidden="true">*</span>
                          </label>
                          {isEditFieldModified("contactEmail") && (
                            <button type="button" onClick={() => revertEditField("contactEmail")} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8bcaff] underline decoration-[#75c7ff]/40 underline-offset-2 hover:text-[#c2e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">Revert</button>
                          )}
                        </div>
                        <input
                          id="panel-org-email"
                          name="contactEmail"
                          type="email"
                          autoComplete="email"
                          required
                          maxLength={254}
                          value={editFields.contactEmail}
                          onChange={(event) => updateEditField("contactEmail", event.target.value)}
                          placeholder="contact@example.com"
                          aria-invalid={showEditFieldError("contactEmail")}
                          aria-describedby="panel-org-email-error"
                          className={`w-full rounded-lg border ${editFieldBorderClass("contactEmail")} bg-[#0f1724] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20`}
                        />
                        {showEditFieldError("contactEmail") && <p id="panel-org-email-error" role="alert" className="mt-1 text-xs text-rose-300">{editFieldErrors.contactEmail}</p>}
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label htmlFor="panel-org-phone" className="block text-sm font-semibold text-slate-200">
                            Contact Phone <span className="text-rose-300" aria-hidden="true">*</span>
                          </label>
                          {isEditFieldModified("contactPhone") && (
                            <button type="button" onClick={() => revertEditField("contactPhone")} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8bcaff] underline decoration-[#75c7ff]/40 underline-offset-2 hover:text-[#c2e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">Revert</button>
                          )}
                        </div>
                        <input
                          id="panel-org-phone"
                          name="contactPhone"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          required
                          maxLength={30}
                          value={editFields.contactPhone}
                          onChange={(event) => updateEditField("contactPhone", event.target.value)}
                          placeholder="+250 7XX XXX XXX"
                          aria-invalid={showEditFieldError("contactPhone")}
                          aria-describedby="panel-org-phone-error"
                          className={`w-full rounded-lg border ${editFieldBorderClass("contactPhone")} bg-[#0f1724] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20`}
                        />
                        {showEditFieldError("contactPhone") && <p id="panel-org-phone-error" role="alert" className="mt-1 text-xs text-rose-300">{editFieldErrors.contactPhone}</p>}
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label htmlFor="panel-org-country" className="block text-sm font-semibold text-slate-200">Country</label>
                          {isEditFieldModified("country") && (
                            <button type="button" onClick={() => revertEditField("country")} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8bcaff] underline decoration-[#75c7ff]/40 underline-offset-2 hover:text-[#c2e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">Revert</button>
                          )}
                        </div>
                        <CountrySelect
                          id="panel-org-country"
                          value={editFields.country}
                          disabled={savingOrganization}
                          className={`w-full rounded-lg border ${editFieldBorderClass("country")} bg-[#0f1724] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20`}
                          onChange={(nextCountry) => {
                            const previousCountry = editFields.country;
                            updateEditField("country", nextCountry);
                            updateEditField("contactPhone", replacePhoneCountryCode(editFields.contactPhone, previousCountry, nextCountry));
                          }}
                        />
                        <p className="mt-1 text-xs text-slate-400">Changing country updates the organization's international phone prefix.</p>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label htmlFor="panel-org-address" className="block text-sm font-semibold text-slate-200">
                            Organization Address <span className="text-rose-300" aria-hidden="true">*</span>
                          </label>
                          {isEditFieldModified("address") && (
                            <button type="button" onClick={() => revertEditField("address")} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8bcaff] underline decoration-[#75c7ff]/40 underline-offset-2 hover:text-[#c2e7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">Revert</button>
                          )}
                        </div>
                        <textarea
                          id="panel-org-address"
                          name="address"
                          autoComplete="street-address"
                          required
                          minLength={3}
                          maxLength={255}
                          rows={3}
                          value={editFields.address}
                          onChange={(event) => updateEditField("address", event.target.value)}
                          placeholder="Street, district, city, country"
                          aria-invalid={showEditFieldError("address")}
                          aria-describedby="panel-org-address-error"
                          className={`w-full resize-y rounded-lg border ${editFieldBorderClass("address")} bg-[#0f1724] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20`}
                        />
                        {showEditFieldError("address") && <p id="panel-org-address-error" role="alert" className="mt-1 text-xs text-rose-300">{editFieldErrors.address}</p>}
                      </div>
                    </div>
                  </section>

                  <div className="flex items-start gap-3 rounded-lg border border-[#29384b] bg-[#111a28] px-4 py-3.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-200">
                      <Icon name="shield" size={15} />
                    </span>
                    <p className="text-xs leading-5 text-slate-300">
                      Organization status is shown for reference and will not change when you save this form.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-[#29384b] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-slate-300">
                      {hasOrganizationChanges
                        ? "Your edits are ready to save."
                        : "No changes to save yet."}
                    </p>
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={requestCancelOrganizationEdit}
                        disabled={savingOrganization}
                        className="rounded-lg border border-[#29384b] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-[#29384b] hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={savingOrganization || !hasOrganizationChanges || slugAvailability === "checking" || slugAvailability === "taken"}
                        className="rounded-lg border border-[#75c7ff]/20 bg-[#21486a] px-5 py-3 text-sm font-semibold text-[#eff8ff] shadow-sm shadow-black/20 transition hover:border-[#75c7ff]/35 hover:bg-[#285577] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingOrganization ? "Saving changes…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {panelDiscardIntent && (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"
                role="presentation"
              >
                <div
                  ref={organizationPanelDiscardDialogRef}
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="organization-panel-discard-title"
                  aria-describedby="organization-panel-discard-description"
                  tabIndex={-1}
                  className="w-full max-w-sm rounded-2xl border border-amber-400/25 bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.58)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-200">
                      <Icon name="shield" size={20} />
                    </span>
                    <div>
                      <h3 id="organization-panel-discard-title" className="text-base font-bold text-white">
                        Discard organization edits?
                      </h3>
                      <p id="organization-panel-discard-description" className="mt-2 text-sm leading-5 text-slate-300">
                        {panelDiscardIntent === "close"
                          ? "You have unsaved changes. Close this drawer and discard your edits?"
                          : "You have unsaved changes. Return to organization details and discard your edits?"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      autoFocus
                      onClick={() => setPanelDiscardIntent(null)}
                      className="rounded-lg border border-[#29384b] bg-white/[0.025] px-4 py-2.5 text-sm font-semibold text-[#d3deeb] transition hover:border-[#75c7ff]/25 hover:bg-[#1d2a3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                    >
                      Keep editing
                    </button>
                    <button
                      type="button"
                      onClick={confirmOrganizationPanelDiscard}
                      className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    >
                      {panelDiscardIntent === "close"
                        ? "Discard and close"
                        : "Discard and return to details"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </>
      )}

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandItems}
        onSelect={selectCommandItem}
        blocked={Boolean(statusActionOrganization) || createOrganizationOpen}
      />

      <CreateOrganizationDrawer
        open={createOrganizationOpen}
        onClose={() => setCreateOrganizationOpen(false)}
        onCreated={(organizationName) => {
          setTableActionSuccess(`${organizationName} was created and is now pending setup.`);
          setOrganizationsReloadKey((key) => key + 1);
        }}
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
              className={`w-full max-w-lg rounded-2xl border bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.58)] sm:p-6 ${statusActionOrganization.status === "ACTIVE" ? "border-rose-400/30" : "border-emerald-400/25"}`}
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
                    className="h-11 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-rose-400/60 focus:ring-4 focus:ring-rose-500/10"
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
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
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
    </div>
  );
}
