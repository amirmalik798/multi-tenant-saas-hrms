"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrganizationAdminSidebar, OrganizationAdminHeader, useOrganizationAdminAutoRefresh } from "../../components/org-admin/OrganizationAdminChrome";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

type OrgAdminUser = {
  id?: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type DepartmentStatus = "ACTIVE" | "INACTIVE" | string;
type DrawerMode = "create" | "view" | "edit" | null;
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type DepartmentPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};
type DrawerEmployeeFilter = "ALL" | "ACTIVE" | "INACTIVE" | "FORMER";

type DepartmentEmployee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  designation: string | null;
  employment_status: "ACTIVE" | "INACTIVE" | "FORMER";
};

type Department = {
  id: string;
  name: string;
  description?: string | null;
  status: DepartmentStatus | null;
  // Department list/detail endpoints already return the assigned manager fields.
  manager_id?: string | null;
  manager_employee_code?: string | null;
  manager_first_name?: string | null;
  manager_last_name?: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
  manager_role?: string | null;
  manager_employment_status?: string | null;
  manager_account_status?: string | null;
  manager_eligible?: boolean;
  employee_count: number;
  total_employee_count?: number;
  active_employee_count?: number;
  inactive_employee_count?: number;
  former_employee_count?: number;
  employees?: DepartmentEmployee[];
};

type DepartmentManagerCandidate = {
  id: string;
  employee_code?: string | null;
  first_name: string;
  last_name?: string | null;
  designation?: string | null;
  workforce_role?: string | null;
  account_status?: string | null;
};

type DepartmentForm = {
  name: string;
  description: string;
  status: "ACTIVE" | "INACTIVE";
  manager_id: string;
};
type DepartmentFormField = keyof DepartmentForm;

type IconName =
  | "dashboard"
  | "users"
  | "building"
  | "layers"
  | "search"
  | "command"
  | "logout"
  | "arrow"
  | "shield"
  | "close"
  | "chevron"
  | "filter"
  | "check"
  | "alert"
  | "plus"
  | "eye"
  | "edit"
  | "briefcase"
  | "calendar"
  | "clock"
  | "code"
  | "more"
  | "download"
  | "table"
  | "grid";

const initialForm: DepartmentForm = { name: "", description: "", status: "ACTIVE", manager_id: "" };

function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    command: <path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7Z" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M10.3 3.9 1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>{paths[name]}</svg>;
}

function getInitials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DP";
}

function getGradientAvatar(name: string, isActive: boolean) {
  if (!isActive) {
    return "from-slate-700/30 to-slate-800/40 text-slate-400 border-slate-600/30 grayscale";
  }
  const gradients = [
    "from-blue-500/20 to-indigo-500/30 text-blue-300 border-blue-400/30",
    "from-emerald-500/20 to-teal-500/30 text-emerald-300 border-emerald-400/30",
    "from-violet-500/20 to-purple-500/30 text-violet-300 border-violet-400/30",
    "from-amber-500/20 to-orange-500/30 text-amber-300 border-amber-400/30",
    "from-sky-500/20 to-cyan-500/30 text-sky-300 border-sky-400/30"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

function normalizeStatus(value: string | null | undefined) {
  return (value ?? "UNKNOWN").toUpperCase();
}

function departmentManagerDisplayName(
  department: Pick<Department, "manager_name" | "manager_first_name" | "manager_last_name">
) {
  const joinedName = [department.manager_first_name, department.manager_last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  return department.manager_name?.trim() || joinedName || "Department Manager";
}

function departmentManagerHref(department: Pick<Department, "manager_id">) {
  return department.manager_id
    ? `/org/employees?employeeId=${encodeURIComponent(department.manager_id)}`
    : null;
}

function statusStyle(status: string | null | undefined) {
  switch (normalizeStatus(status)) {
    case "ACTIVE": return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 font-bold";
    case "INACTIVE": return "bg-slate-500/15 text-slate-400 ring-slate-400/20 font-bold";
    default: return "bg-amber-500/15 text-amber-300 ring-amber-400/30 font-bold";
  }
}

function statusDotStyle(status: string | null | undefined) {
  switch (normalizeStatus(status)) {
    case "ACTIVE": return "bg-emerald-400";
    case "INACTIVE": return "bg-slate-500";
    default: return "bg-amber-400";
  }
}

function humanizeStatus(status: string | null | undefined) {
  return normalizeStatus(status).toLowerCase().replace(/(^|_)([a-z])/g, (_, space, letter: string) => `${space ? " " : ""}${letter.toUpperCase()}`);
}

function toDepartmentForm(department: Department): DepartmentForm {
  return {
    name: department.name ?? "",
    description: department.description ?? "",
    status: normalizeStatus(department.status) === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    manager_id: department.manager_id ?? "",
  };
}

function isDirty(mode: DrawerMode, current: DepartmentForm, baseline: DepartmentForm) {
  if (mode === "create") {
    return current.name !== baseline.name || current.description !== baseline.description || current.manager_id !== baseline.manager_id;
  }
  if (mode === "edit") {
    return current.name !== baseline.name || current.status !== baseline.status || current.manager_id !== baseline.manager_id;
  }
  return false;
}

function validateDepartmentForm(form: DepartmentForm, mode: DrawerMode): Partial<Record<DepartmentFormField, string>> {
  const errors: Partial<Record<DepartmentFormField, string>> = {};
  const name = form.name.trim();

  if (name.length < 2 || name.length > 100) {
    errors.name = "Department name must be between 2 and 100 characters.";
  }
  if (mode === "create" && form.description.trim().length > 1000) {
    errors.description = "Description must be 1,000 characters or fewer.";
  }
  if (form.status !== "ACTIVE" && form.status !== "INACTIVE") {
    errors.status = "Choose a valid department status.";
  }
  return errors;
}

function FieldStatus({ complete, invalid }: { complete: boolean; invalid?: boolean }) {
  if (complete) {
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-200"><Icon name="check" size={13} />Looks good</span>;
  }
  if (invalid) {
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-200"><Icon name="alert" size={13} />Needs attention</span>;
  }
  return null;
}

function DepartmentManagerPhoto({
  employeeId,
  name,
}: {
  employeeId: string | null | undefined;
  name: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUnavailable, setImageUnavailable] = useState(!employeeId);

  useEffect(() => {
    if (!employeeId) {
      setImageUrl(null);
      setImageUnavailable(true);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setImageUrl(null);
    setImageUnavailable(false);

    void (async () => {
      try {
        const response = await fetch(
          `/api/backend/employees/${encodeURIComponent(employeeId)}/photo`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "image/jpeg, image/png, image/webp" },
          },
        );

        if (!response.ok) {
          setImageUnavailable(true);
          return;
        }

        const contentType = response.headers.get("content-type") || "";
const normalizedContentType = contentType
  .split(";")[0]
  .trim()
  .toLowerCase();

if (
  !["image/jpeg", "image/png", "image/webp"].includes(normalizedContentType)
) {
  setImageUnavailable(true);
  return;
}

        const blob = await response.blob();
        if (!blob.size || controller.signal.aborted) return;

        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
        setImageUnavailable(false);
      } catch {
        if (!controller.signal.aborted) setImageUnavailable(true);
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employeeId]);

  return (
    <span
      className="org-department-manager-photo relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#34465d] bg-[#182232] text-xs font-bold text-slate-200"
      aria-label={`${name} profile photo`}
    >
      {imageUrl && !imageUnavailable ? (
        <img
          src={imageUrl}
          alt={`${name}'s profile`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}

export default function DepartmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pagination, setPagination] = useState<DepartmentPagination>({
    page: 1, limit: 10, total: 0, totalPages: 1,
    hasPreviousPage: false, hasNextPage: false,
  });
  const [organizationDepartmentTotal, setOrganizationDepartmentTotal] = useState<number | null>(null);
  const [activeDepartmentTotal, setActiveDepartmentTotal] = useState<number | null>(null);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoadedDepartmentsRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [actionMenuDepartmentId, setActionMenuDepartmentId] = useState<string | null>(null);
  const [exportingDepartments, setExportingDepartments] = useState(false);

  // The directory uses the backend's authoritative, tenant-scoped pagination.
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Bulk Selection State
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerNotice, setDrawerNotice] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [form, setForm] = useState<DepartmentForm>(initialForm);
  const [baselineForm, setBaselineForm] = useState<DepartmentForm>(initialForm);
  const [managerCandidates, setManagerCandidates] = useState<DepartmentManagerCandidate[]>([]);
  const [managerCandidatesLoading, setManagerCandidatesLoading] = useState(false);
  const [managerCandidatesError, setManagerCandidatesError] = useState("");
  const [managerCandidatesReloadKey, setManagerCandidatesReloadKey] = useState(0);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [drawerEmployeeFilter, setDrawerEmployeeFilter] = useState<DrawerEmployeeFilter>("ALL");
  const [touchedFields, setTouchedFields] = useState<Set<DepartmentFormField>>(() => new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const discardDialogRef = useRef<HTMLElement | null>(null);
  const discardKeepEditingRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const drawerRequestIdRef = useRef(0);
  const formIsDirty = isDirty(drawerMode, form, baselineForm);
  const isDrawerOpen = drawerMode !== null;

  useOrganizationAdminAutoRefresh(
    () => setReloadKey((key) => key + 1),
    {
      enabled: Boolean(user),
      shouldRefresh: () => !loading && !saving && !drawerMode && !formIsDirty,
    },
  );
  const departmentFieldErrors = useMemo(() => validateDepartmentForm(form, drawerMode), [form, drawerMode]);
  const departmentNameReady = !departmentFieldErrors.name && form.name.trim().length >= 2;
  const departmentEmployees = selectedDepartment?.employees ?? [];

  // Keep the page-level gate aligned with the backend's authenticated session contract.
  useEffect(() => {
    let active = true;
    async function verifyOrganizationSession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (
          !response.ok ||
          data?.authenticated !== true ||
          data?.user?.role !== "ORGANIZATION_ADMIN" ||
          !data?.user?.organizationId
        ) {
          router.replace("/");
          return;
        }

        const authUser = data.user;

        if (active) {
          setUser({
            id: authUser.id,
            email: authUser.email,
            role: authUser.role,
            organizationId: authUser.organizationId,
            organizationName: authUser.organizationName || "Organization Workspace",
          });
        }
      } catch (sessionError) {
        console.error("Organization department session check failed:", sessionError);
        router.replace("/");
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void verifyOrganizationSession();
    return () => { active = false; };
  }, [router]);

  // Candidate list is organization-scoped and returns only active employees
  // with the DEPARTMENT_MANAGER role and an active organization account.
  useEffect(() => {
    if (drawerMode !== "create" && drawerMode !== "edit") return;

    let active = true;
    async function loadDepartmentManagerCandidates() {
      setManagerCandidatesLoading(true);
      setManagerCandidatesError("");
      try {
        const response = await fetch("/api/backend/employees/managers?role=DEPARTMENT_MANAGER", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok || !Array.isArray(data?.employees)) {
          throw new Error(data?.message || "Unable to load eligible Department Managers.");
        }
        if (active) setManagerCandidates(data.employees as DepartmentManagerCandidate[]);
      } catch (candidateError) {
        if (active) {
          setManagerCandidatesError(candidateError instanceof Error ? candidateError.message : "Unable to load eligible Department Managers.");
        }
      } finally {
        if (active) setManagerCandidatesLoading(false);
      }
    }

    void loadDepartmentManagerCandidates();
    return () => { active = false; };
  }, [drawerMode, managerCandidatesReloadKey, router]);

  // The discard alertdialog receives focus on open, traps Tab navigation, and
  // restores focus to the drawer after it closes.
  useEffect(() => {
    if (!confirmDiscard) return;

    const focusFrame = window.requestAnimationFrame(() => discardKeepEditingRef.current?.focus());
    const trapDialogFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !discardDialogRef.current) return;
      const focusable = Array.from(discardDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        discardDialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !discardDialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !discardDialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapDialogFocus, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", trapDialogFocus, true);
      window.requestAnimationFrame(() => {
        if (drawerCloseButtonRef.current?.isConnected) drawerCloseButtonRef.current.focus();
      });
    };
  }, [confirmDiscard]);

  // Debounce directory search so each keystroke does not issue an API request.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  // Load the current directory page using the backend's verified q/status/page/limit contract.
  // Summary counts come from server-side totals, not just the currently visible page.
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function fetchDepartmentCount(status?: "ACTIVE" | "INACTIVE") {
      const params = new URLSearchParams({ page: "1", limit: "1", includeInactive: "true" });
      if (status) params.set("status", status);
      const response = await fetch(`/api/backend/departments?${params.toString()}`, {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace("/");
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (!response.ok) throw new Error(data?.message || "Unable to load department summary counts.");
      return Number(data?.pagination?.total ?? (Array.isArray(data?.departments) ? data.departments.length : 0));
    }

    async function loadDepartments() {
      if (!hasLoadedDepartmentsRef.current) setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        includeInactive: "true",
      });
      if (debouncedSearchQuery) params.set("q", debouncedSearchQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      try {
        const [response, totalCountResult, activeCountResult] = await Promise.all([
          fetch(`/api/backend/departments?${params.toString()}`, {
            method: "GET", credentials: "same-origin", cache: "no-store",
          }),
          fetchDepartmentCount(),
          fetchDepartmentCount("ACTIVE"),
        ] as const);

        const data = await response.json().catch(() => null);
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error(data?.message || "Unable to load departments.");

        const deptList: Department[] = Array.isArray(data?.departments)
          ? data.departments
          : Array.isArray(data) ? data : [];
        const total = Number(data?.pagination?.total ?? deptList.length);
        const totalPages = Math.max(1, Number(data?.pagination?.totalPages ?? Math.ceil(total / pageSize)));

        if (!active) return;
        setDepartments(deptList);
        hasLoadedDepartmentsRef.current = true;
        setPagination({
          page: Number(data?.pagination?.page ?? currentPage),
          limit: Number(data?.pagination?.limit ?? pageSize),
          total,
          totalPages,
          hasPreviousPage: Boolean(data?.pagination?.hasPreviousPage ?? currentPage > 1),
          hasNextPage: Boolean(data?.pagination?.hasNextPage ?? currentPage < totalPages),
        });
        setOrganizationDepartmentTotal(totalCountResult);
        setActiveDepartmentTotal(activeCountResult);
        if (currentPage > totalPages) setCurrentPage(totalPages);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Something went wrong while loading departments.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDepartments();
    return () => { active = false; };
  }, [reloadKey, router, user, currentPage, pageSize, statusFilter, debouncedSearchQuery]);

  const closeDrawerImmediately = useCallback(() => {
    drawerRequestIdRef.current += 1;
    setDrawerMode(null);
    setSelectedDepartment(null);
    setDrawerLoading(false);
    setDrawerError("");
    setDrawerNotice("");
    setConfirmDiscard(false);
    setForm(initialForm);
    setBaselineForm(initialForm);
    setEmployeeSearchQuery("");
    setDrawerEmployeeFilter("ALL");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    const opener = openerRef.current;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      openerRef.current = null;
    });
  }, []);

  const requestCloseDrawer = useCallback(() => {
    if (saving) return;
    if (formIsDirty) {
      setConfirmDiscard(true);
      return;
    }
    closeDrawerImmediately();
  }, [saving, formIsDirty, closeDrawerImmediately]);

  // Global keyboard shortcut '/' to focus search & ESC to close drawer
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && !commandPaletteOpen && !drawerMode) {
        e.preventDefault();
        document.getElementById("department-search-table")?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [commandPaletteOpen, drawerMode]);

  // Drawer keyboard management (Esc to close & Tab trap)
  useEffect(() => {
    if (!isDrawerOpen) return;
    function handleDrawerKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (commandPaletteOpen) return;
        event.preventDefault();
        event.stopPropagation();
        if (confirmDiscard) setConfirmDiscard(false);
        else requestCloseDrawer();
        return;
      }
      if (event.key !== "Tab" || confirmDiscard || !drawerRef.current) return;
      if (!drawerRef.current.contains(document.activeElement)) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleDrawerKeys, true);
    return () => window.removeEventListener("keydown", handleDrawerKeys, true);
  }, [isDrawerOpen, confirmDiscard, requestCloseDrawer, commandPaletteOpen]);

  // Reset page and selections when search or filters change.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedDepartmentIds(new Set());
    setActionMenuDepartmentId(null);
  }, [searchQuery, statusFilter]);

  // Bulk actions apply only to the currently visible server page.
  useEffect(() => {
    setSelectedDepartmentIds(new Set());
    setActionMenuDepartmentId(null);
  }, [currentPage, viewMode]);

  const filteredDepartmentEmployees = useMemo(() => {
    let list = departmentEmployees;
    if (drawerEmployeeFilter !== "ALL") {
      list = list.filter((emp) => normalizeStatus(emp.employment_status) === drawerEmployeeFilter);
    }
    const query = employeeSearchQuery.trim().toLowerCase();
    if (!query) return list;
    return list.filter((employee) => {
      const fullName = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
      return [fullName, employee.employee_code, employee.designation ?? "", employee.employment_status]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [departmentEmployees, drawerEmployeeFilter, employeeSearchQuery]);

  const showDepartmentFieldError = (field: DepartmentFormField) =>
    (submitAttempted || touchedFields.has(field)) && Boolean(departmentFieldErrors[field]);

  // Search, status filtering, ordering, and pagination are authoritative on the backend.
  // Do not filter or slice the returned page again on the client.
  const sortedAndFilteredDepartments = departments;
  const paginatedDepartments = departments;
  const totalPages = Math.max(1, pagination.totalPages);
  const totalDepartments = organizationDepartmentTotal ?? pagination.total;
  const activeDepartments = activeDepartmentTotal ?? 0;
  const inactiveDepartments = Math.max(0, totalDepartments - activeDepartments);
  const matchingDepartmentCount = pagination.total;

  const toggleSelectAll = () => {
    const pageIds = paginatedDepartments.map((department) => department.id);
    const allPageRowsSelected = pageIds.length > 0 && pageIds.every((id) => selectedDepartmentIds.has(id));
    setSelectedDepartmentIds((current) => {
      const next = new Set(current);
      if (allPageRowsSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleSelectDepartment = (id: string) => {
    const next = new Set(selectedDepartmentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDepartmentIds(next);
  };

  const handleBulkStatusChange = async (targetStatus: "ACTIVE" | "INACTIVE") => {
    if (selectedDepartmentIds.size === 0 || bulkUpdating) return;
    if (
      targetStatus === "INACTIVE" &&
      !window.confirm(
        `Deactivate ${selectedDepartmentIds.size} selected department(s)? All currently active employees assigned to those departments will also be marked inactive. Former employees will remain former.`,
      )
    ) return;

    setBulkUpdating(true);
    setNotice("");
    setNoticeError("");
    try {
      const ids = Array.from(selectedDepartmentIds);
      const outcomes = await Promise.all(ids.map(async (id) => {
        const department = departments.find((item) => item.id === id);
        if (!department) return { id, ok: false, message: "Department is no longer in the loaded directory." };
        try {
          const response = await fetch(`/api/backend/departments/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ name: department.name, status: targetStatus }),
          });
          const data = await response.json().catch(() => null) as { message?: string; employeesDeactivated?: number } | null;
          if (response.status === 401) {
            router.replace("/");
            return { id, ok: false, message: "Session expired." };
          }
          if (!response.ok) return { id, ok: false, message: data?.message || `HTTP ${response.status}` };
          return { id, ok: true, message: "", employeesDeactivated: Number(data?.employeesDeactivated) || 0 };
        } catch (error) {
          return { id, ok: false, message: error instanceof Error ? error.message : "Network request failed." };
        }
      }));

      const succeeded = outcomes.filter((outcome) => outcome.ok);
      const failed = outcomes.filter((outcome) => !outcome.ok);
      const deactivatedEmployeeCount = succeeded.reduce(
  (sum, outcome) =>
    sum +
    ("employeesDeactivated" in outcome
      ? (outcome.employeesDeactivated ?? 0)
      : 0),
  0
);
      if (succeeded.length === ids.length) {
        setNotice(
          targetStatus === "INACTIVE"
            ? `Deactivated ${succeeded.length} department(s) and marked ${deactivatedEmployeeCount} active employee(s) inactive.`
            : `Successfully activated ${succeeded.length} department(s). Employee statuses were not changed.`,
        );
        setSelectedDepartmentIds(new Set());
      } else {
        const failedIds = new Set(failed.map((outcome) => outcome.id));
        setSelectedDepartmentIds(failedIds);
        setNoticeError(
          `Updated ${succeeded.length} of ${ids.length} departments. ${failed.length} failed. ${failed[0]?.message || "Review the remaining selection and try again."}`,
        );
      }
      setReloadKey((key) => key + 1);
    } catch (error) {
      setNoticeError(error instanceof Error ? error.message : "Bulk department update could not be completed.");
    } finally {
      setBulkUpdating(false);
    }
  };

  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => drawerCloseButtonRef.current?.focus());
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isDrawerOpen]);

  async function openDepartmentDrawer(mode: "view" | "edit", department: Department) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestId = ++drawerRequestIdRef.current;
    setDrawerMode(mode);
    setSelectedDepartment(department);
    setDrawerLoading(true);
    setDrawerError("");
    setDrawerNotice("");
    setConfirmDiscard(false);
    setEmployeeSearchQuery("");
    setDrawerEmployeeFilter("ALL");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    const provisional = toDepartmentForm(department);
    setForm(provisional);
    setBaselineForm(provisional);
    try {
      const response = await fetch(`/api/backend/departments/${encodeURIComponent(department.id)}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      const deptDetail = data?.department || data;
      if (!response.ok || !deptDetail) throw new Error(data?.message || "Unable to load department details.");
      if (requestId !== drawerRequestIdRef.current) return;
      const detail: Department = {
        ...department,
        ...deptDetail,
        employees: Array.isArray(deptDetail.employees) ? deptDetail.employees : [],
      };
      setSelectedDepartment(detail);
      const nextForm = toDepartmentForm(detail);
      setForm(nextForm);
      setBaselineForm(nextForm);
    } catch (loadError) {
      if (requestId === drawerRequestIdRef.current) {
        setDrawerError(loadError instanceof Error ? loadError.message : "Unable to load department details.");
      }
    } finally {
      if (requestId === drawerRequestIdRef.current) setDrawerLoading(false);
    }
  }

  const openDepartmentDrawerRef = useRef(openDepartmentDrawer);
  openDepartmentDrawerRef.current = openDepartmentDrawer;
  const requestedDepartmentHandledRef = useRef(false);

  useEffect(() => {
    if (requestedDepartmentHandledRef.current) return;
    const requestedDepartmentId = new URLSearchParams(window.location.search).get("departmentId");
    if (!requestedDepartmentId) return;
    requestedDepartmentHandledRef.current = true;
    window.history.replaceState(window.history.state, "", "/org/departments");
    void openDepartmentDrawerRef.current("view", {
      id: requestedDepartmentId,
      name: "Loading department",
      status: "ACTIVE",
      manager_id: null,
      employee_count: 0,
    });
  }, []);

  function openCreateDrawer() {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRequestIdRef.current += 1;
    setSelectedDepartment(null);
    setDrawerMode("create");
    setDrawerLoading(false);
    setDrawerError("");
    setDrawerNotice("");
    setConfirmDiscard(false);
    setEmployeeSearchQuery("");
    setDrawerEmployeeFilter("ALL");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setForm(initialForm);
    setBaselineForm(initialForm);
  }

  function updateField(field: DepartmentFormField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setTouchedFields((current) => new Set(current).add(field));
    setDrawerError("");
    setDrawerNotice("");
  }

  function beginEdit() {
    if (!selectedDepartment) return;
    const nextForm = toDepartmentForm(selectedDepartment);
    setForm(nextForm);
    setBaselineForm(nextForm);
    setDrawerMode("edit");
    setDrawerError("");
    setDrawerNotice("");
    setConfirmDiscard(false);
    setTouchedFields(new Set());
    setSubmitAttempted(false);
  }

  async function handleExportDepartmentList(selectedIds?: string[]) {
    if (exportingDepartments) return;
    setExportingDepartments(true);
    setNoticeError("");
    setNotice("");
    try {
      const pageLimit = 100;
      const baseParams = new URLSearchParams({ page: "1", limit: String(pageLimit), includeInactive: "true" });
      const query = debouncedSearchQuery.trim();
      if (query) baseParams.set("q", query);
      if (statusFilter !== "ALL") baseParams.set("status", statusFilter);
      const firstResponse = await fetch(`/api/backend/departments?${baseParams.toString()}`, {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      const firstData = await firstResponse.json().catch(() => null);
      if (firstResponse.status === 401) { router.replace("/"); throw new Error("Your session has expired. Please sign in again."); }
      if (!firstResponse.ok || !Array.isArray(firstData?.departments)) throw new Error(firstData?.message || "Could not load departments for export.");
      const totalPagesForExport = Math.max(1, Number(firstData?.pagination?.totalPages) || 1);
      const allDepartments: Department[] = [...firstData.departments];
      for (let exportPage = 2; exportPage <= totalPagesForExport; exportPage += 1) {
        const params = new URLSearchParams(baseParams);
        params.set("page", String(exportPage));
        const response = await fetch(`/api/backend/departments?${params.toString()}`, {
          method: "GET", credentials: "same-origin", cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (response.status === 401) { router.replace("/"); throw new Error("Your session has expired. Please sign in again."); }
        if (!response.ok || !Array.isArray(data?.departments)) throw new Error(data?.message || `Could not load department page ${exportPage}; no file was exported.`);
        allDepartments.push(...data.departments);
      }
      const expectedTotal = Number(firstData?.pagination?.total);
      if (Number.isFinite(expectedTotal) && expectedTotal !== allDepartments.length) {
        throw new Error(`Loaded ${allDepartments.length} of ${expectedTotal} matching departments. No partial file was exported; try again.`);
      }
      const exportDepartments = selectedIds?.length
        ? allDepartments.filter((department) => selectedIds.includes(department.id))
        : allDepartments;
      if (selectedIds?.length && exportDepartments.length !== selectedIds.length) {
        throw new Error("One or more selected departments could not be included in the export. Refresh the directory and try again.");
      }
      const exportPayload = {
        organization: user?.organizationName ?? "Organization",
        generatedAt: new Date().toISOString(),
        filters: { search: query || null, status: statusFilter },
        selection: selectedIds?.length ? "selected departments on current page" : "all matching departments",
        totalDepartments: exportDepartments.length,
        departments: exportDepartments,
      };
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${selectedIds?.length ? "department-selection" : "department-list"}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice(`Exported ${exportDepartments.length} department record${exportDepartments.length === 1 ? "" : "s"}.`);
    } catch (exportError) {
      setNoticeError(exportError instanceof Error ? exportError.message : "Department export failed.");
    } finally {
      setExportingDepartments(false);
    }
  }

  async function handleToggleDepartmentStatus(department: Department) {
    const currentStatus = normalizeStatus(department.status);
    const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (nextStatus === "INACTIVE" && !window.confirm(`Deactivate "${department.name}"? All currently active employees assigned to this department will also be marked inactive. Former employees will remain former.`)) return;
    try {
      const response = await fetch(`/api/backend/departments/${encodeURIComponent(department.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: department.name, status: nextStatus }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) throw new Error(data?.message || "Unable to update department status.");

      const updatedDept = data?.department || data;
      setDepartments((current) =>
        current.map((item) =>
          item.id === department.id ? { ...item, status: nextStatus, ...(updatedDept ?? {}) } : item
        )
      );
      const employeesDeactivated = Number(data?.employeesDeactivated) || 0;
      setNotice(nextStatus === "ACTIVE"
        ? "Department activated successfully. Employee statuses were not changed."
        : `Department deactivated successfully. ${employeesDeactivated} active employee(s) marked inactive.`);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : "Failed to update department status.");
    }
  }

  async function handleSubmitDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDrawerError("");
    setDrawerNotice("");
    setSubmitAttempted(true);
    setTouchedFields(new Set<DepartmentFormField>(["name", "description", "status", "manager_id"]));
    if (drawerMode !== "create" && drawerMode !== "edit") return;
    if (drawerMode === "edit" && !selectedDepartment) return;
    const validationErrors = validateDepartmentForm(form, drawerMode);
    if (Object.keys(validationErrors).length > 0) {
      setDrawerError("Review the highlighted fields and correct the validation errors before saving.");
      window.requestAnimationFrame(() => {
        drawerRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    const name = form.name.trim();
    const creating = drawerMode === "create";
    const managerChanged = !creating && Boolean(selectedDepartment) &&
      (form.manager_id || null) !== (selectedDepartment!.manager_id || null);
    if (managerChanged && form.manager_id && form.status !== "ACTIVE") {
      setDrawerError("Activate the department before assigning a Department Manager. You can remove an existing assignment while the department is inactive.");
      return;
    }
    if (
      !creating &&
      selectedDepartment &&
      normalizeStatus(selectedDepartment.status) === "ACTIVE" &&
      form.status === "INACTIVE" &&
      !window.confirm(`Deactivate "${selectedDepartment.name}"? All currently active employees assigned to this department will also be marked inactive. Former employees will remain former.`)
    ) return;
    setSaving(true);
    try {
      const editPayload: { name: string; status: "ACTIVE" | "INACTIVE"; manager_id?: string | null } = {
        name,
        status: form.status,
      };
      if (managerChanged) editPayload.manager_id = form.manager_id || null;

      const response = await fetch(
        creating ? "/api/backend/departments" : `/api/backend/departments/${encodeURIComponent(selectedDepartment!.id)}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(creating
            ? { name, description: form.description.trim() || null }
            : editPayload),
        },
      );
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      let savedDept = (data?.department || data) as Partial<Department> & { id?: string };
      if (!response.ok || !savedDept) throw new Error(data?.message || (creating ? "Unable to create department." : "Unable to update department."));

      let managerAssignmentError = "";
      if (creating && form.manager_id) {
        // POST /departments intentionally does not accept manager_id. Reuse the
        // existing audited PATCH workflow after the department has been created.
        if (!savedDept.id) {
          managerAssignmentError = "The department was created, but the API did not return its ID, so the manager could not be assigned.";
        } else {
          try {
            const assignmentResponse = await fetch(`/api/backend/departments/${encodeURIComponent(savedDept.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ manager_id: form.manager_id }),
            });
            const assignmentData = await assignmentResponse.json().catch(() => null);
            if (assignmentResponse.status === 401) {
              router.replace("/");
              return;
            }
            if (!assignmentResponse.ok) {
              managerAssignmentError = assignmentData?.message || `The department was created, but its manager could not be assigned (HTTP ${assignmentResponse.status}).`;
            }
          } catch (assignmentError) {
            managerAssignmentError = assignmentError instanceof Error
              ? assignmentError.message
              : "The department was created, but its manager assignment request failed.";
          }
        }
      }

      if (!creating && managerChanged && savedDept?.id) {
        // PATCH returns the changed manager ID; reload detail fields so the drawer
        // immediately shows the new manager name/code and updated reporting lines.
        try {
          const detailResponse = await fetch(`/api/backend/departments/${encodeURIComponent(savedDept.id)}`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          });
          const detailData = await detailResponse.json().catch(() => null);
          if (detailResponse.status === 401) {
            router.replace("/");
            return;
          }
          if (detailResponse.ok && detailData?.department) {
            savedDept = detailData.department;
          } else {
            const selectedCandidate = managerCandidates.find((candidate) => candidate.id === (form.manager_id || ""));
            savedDept = {
              ...savedDept,
              manager_id: form.manager_id || null,
              manager_employee_code: selectedCandidate?.employee_code ?? null,
              manager_first_name: selectedCandidate?.first_name ?? null,
              manager_last_name: selectedCandidate?.last_name ?? null,
              manager_name: selectedCandidate ? [selectedCandidate.first_name, selectedCandidate.last_name].filter(Boolean).join(" ") : null,
            };
          }
        } catch {
          const selectedCandidate = managerCandidates.find((candidate) => candidate.id === (form.manager_id || ""));
          savedDept = {
            ...savedDept,
            manager_id: form.manager_id || null,
            manager_employee_code: selectedCandidate?.employee_code ?? null,
            manager_first_name: selectedCandidate?.first_name ?? null,
            manager_last_name: selectedCandidate?.last_name ?? null,
            manager_name: selectedCandidate ? [selectedCandidate.first_name, selectedCandidate.last_name].filter(Boolean).join(" ") : null,
          };
        }
      }

      if (creating) {
        drawerRequestIdRef.current += 1;
        setDrawerMode(null);
        setSelectedDepartment(null);
        setDrawerLoading(false);
        setDrawerError("");
        setDrawerNotice("");
        setConfirmDiscard(false);
        setForm(initialForm);
        setBaselineForm(initialForm);
        if (managerAssignmentError) {
          setNotice(`Department "${name}" was created, but it remains unassigned.`);
          setNoticeError(`Department created successfully, but manager assignment failed: ${managerAssignmentError}`);
        } else {
          setNotice(form.manager_id ? `Department "${name}" created and its Department Manager assigned.` : "Department created successfully.");
          setNoticeError("");
        }
        setReloadKey((key) => key + 1);
      } else {
        const isDeactivating = form.status === "INACTIVE";
        const priorInactiveCount = Number(selectedDepartment!.inactive_employee_count ?? selectedDepartment!.employees?.filter((employee) => employee.employment_status === "INACTIVE").length ?? 0);
        const priorActiveCount = Number(selectedDepartment!.active_employee_count ?? selectedDepartment!.employees?.filter((employee) => employee.employment_status === "ACTIVE").length ?? selectedDepartment!.employee_count ?? 0);
        const employeesDeactivated = Number(data?.employeesDeactivated) || 0;
        const merged: Department = {
          ...selectedDepartment!,
          ...savedDept,
          employee_count: isDeactivating ? 0 : selectedDepartment!.employee_count ?? 0,
          total_employee_count: Number(selectedDepartment!.total_employee_count ?? selectedDepartment!.employees?.length ?? selectedDepartment!.employee_count ?? 0),
          active_employee_count: isDeactivating ? 0 : priorActiveCount,
          inactive_employee_count: isDeactivating ? priorInactiveCount + employeesDeactivated : priorInactiveCount,
          former_employee_count: selectedDepartment!.former_employee_count ?? 0,
          employees: isDeactivating
            ? (selectedDepartment!.employees ?? []).map((employee) => employee.employment_status === "ACTIVE" ? { ...employee, employment_status: "INACTIVE" } : employee)
            : selectedDepartment!.employees ?? [],
        };
        setDepartments((current) => current.map((item) => item.id === merged.id ? { ...item, ...merged } : item));
        setSelectedDepartment(merged);
        const nextForm = toDepartmentForm(merged);
        setForm(nextForm);
        setBaselineForm(nextForm);
        setDrawerMode("view");
        const successMessage = isDeactivating
          ? `Department updated. ${employeesDeactivated} active employee(s) marked inactive.`
          : managerChanged
            ? (form.manager_id ? "Department and Department Manager assignment updated successfully." : "Department Manager unassigned successfully.")
            : "Department updated successfully.";
        setDrawerNotice(successMessage);
        setNotice(successMessage);
        setReloadKey((key) => key + 1);
      }
    } catch (submitError) {
      setDrawerError(submitError instanceof Error ? submitError.message : "Something went wrong while saving the department.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-6 text-slate-100">
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0e1523] px-6 py-5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#75c7ff]" />
          <p className="text-sm font-medium text-slate-200">Verifying your organization session…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", { method: "POST", credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (logoutFailure) {
      console.error("Organization Admin logout failed:", logoutFailure);
      setLogoutError(logoutFailure instanceof Error ? logoutFailure.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="org-admin-workspace relative min-h-screen bg-[#0b0f17] text-[#f8fafc] font-sans scheme-dark selection:bg-[#75c7ff]/20 selection:text-white">

      <OrganizationAdminSidebar activePage="departments" />

      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="departments"
          organizationName={user.organizationName}
          loggingOut={loggingOut}
          onLogout={() => void handleLogout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
          onCreate={() => {
            if ((drawerMode === "create" || drawerMode === "edit") && formIsDirty) {
              setDrawerError("Save or discard your unsaved department changes before opening another form.");
              return false;
            }
            openCreateDrawer();
            return true;
          }}
          onNavigateRequest={() => {
            if ((drawerMode === "create" || drawerMode === "edit") && formIsDirty) {
              setDrawerError("Save or discard your unsaved department changes before navigating away.");
              return false;
            }
            if (drawerMode) closeDrawerImmediately();
            return true;
          }}
        />

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {(logoutError || noticeError) && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">{logoutError || noticeError}</div>}
          {notice && <div role="status" aria-live="polite" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-4 text-sm font-medium text-emerald-200"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss success message"><Icon name="close" size={16} /></button></div>}

          {/* Metrics Grid */}
          <section aria-label="Department metrics" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total departments</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/15 text-blue-300"><Icon name="layers" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : totalDepartments.toLocaleString()}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">All departments in this organization</p>
              </div>
            </article>

            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active departments</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"><Icon name="building" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : activeDepartments}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">Teams available for current operations</p>
              </div>
            </article>

            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Non-active / other</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-300"><Icon name="alert" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : inactiveDepartments.toLocaleString()}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">Departments not currently active</p>
              </div>
            </article>

            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Matching departments</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 text-violet-300"><Icon name="users" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : matchingDepartmentCount.toLocaleString()}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">Matching the current filters</p>
              </div>
            </article>
          </section>

          {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200"><Icon name="alert" size={18} /><div className="flex-1"><p>{error}</p></div></div>}

          {/* Department directory — dense table by default, optional cards for individual review. */}
          <section className="overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90">
            <div className="flex flex-col gap-3 border-b border-[#29384b] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-bold text-white">Department directory</h2>
                
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-[#29384b] bg-[#0f1724] p-1" aria-label="Directory view">
                  <button type="button" onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === "table" ? "bg-[#26374b] text-white" : "text-slate-400 hover:text-white"}`}>Table</button>
                  <button type="button" onClick={() => setViewMode("cards")} aria-pressed={viewMode === "cards"} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === "cards" ? "bg-[#26374b] text-white" : "text-slate-400 hover:text-white"}`}>Cards</button>
                </div>
                <span className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-300">Page {currentPage} / {Math.max(totalPages, 1)}</span>
                <button type="button" onClick={openCreateDrawer} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#75c7ff] px-3.5 text-xs font-bold text-[#07111d] transition hover:bg-[#a0dcff]"><Icon name="plus" size={14} />Add Department</button>
                <button type="button" onClick={() => void handleExportDepartmentList()} disabled={exportingDepartments || loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#3b536d] hover:text-white disabled:opacity-50"><Icon name="download" size={14} />{exportingDepartments ? "Exporting…" : "Export list"}</button>
                
              </div>
            </div>

            <div className="space-y-3 border-b border-[#29384b] px-4 py-4 sm:px-5">
              <div className="grid gap-3 md:grid-cols-[minmax(260px,1.4fr)_minmax(190px,0.8fr)]">
                <div className="min-w-0">
                  <label htmlFor="department-search-table" className="mb-1.5 block text-xs font-semibold text-slate-300">Search directory</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-3 text-slate-500"><Icon name="search" size={16} /></span>
                    <input id="department-search-table" type="search" maxLength={100} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Department name, description, or manager…" className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-[#75c7ff]/70 focus:ring-2 focus:ring-[#75c7ff]/10" />
                  </div>
                </div>
                <div className="min-w-0">
                  <label htmlFor="department-status-filter" className="mb-1.5 block text-xs font-semibold text-slate-300">Department status</label>
                  <select id="department-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none transition focus:border-[#75c7ff]/70">
                    <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">{loading ? "Loading records…" : `${departments.length} shown on this page · ${matchingDepartmentCount.toLocaleString()} matching in total`}</p>
                {(searchQuery || statusFilter !== "ALL") && <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setCurrentPage(1); }} className="text-xs font-semibold text-[#9ed8ff] underline-offset-4 hover:underline">Reset all filters</button>}
              </div>
            </div>

            {/* Bulk actions — selection is limited to the visible server page. */}
            {selectedDepartmentIds.size > 0 && !loading && (
              <div className="sticky top-2 z-20 mx-4 mt-3 flex flex-col gap-2 rounded-xl border border-[#3a4d64] bg-[#101a28] p-3 shadow-md sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-white">{selectedDepartmentIds.size} selected <span className="font-normal text-slate-400">(this page)</span></p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={bulkUpdating} onClick={() => void handleExportDepartmentList(Array.from(selectedDepartmentIds))} className="h-9 rounded-lg border border-[#34465d] bg-[#172334] px-3 text-xs font-semibold text-slate-200 hover:bg-[#1c2b40] disabled:opacity-50">Export selected</button>
                  <button type="button" disabled={bulkUpdating} onClick={() => void handleBulkStatusChange("ACTIVE")} className="h-9 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-50">{bulkUpdating ? "Updating…" : "Activate selected"}</button>
                  <button type="button" disabled={bulkUpdating} onClick={() => void handleBulkStatusChange("INACTIVE")} className="h-9 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-50">{bulkUpdating ? "Updating…" : "Deactivate selected"}</button>
                  <button type="button" disabled={bulkUpdating} onClick={() => setSelectedDepartmentIds(new Set())} className="h-9 rounded-lg border border-[#34465d] px-3 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50">Clear selection</button>
                </div>
              </div>
            )}

            {loading ? (
              <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse divide-y divide-[#29384b]/75 px-5 py-3">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-[#29384b]" />
                      <div className="space-y-2">
                        <div className="h-3.5 w-32 rounded bg-[#29384b]" />
                        <div className="h-3 w-48 rounded bg-[#29384b]/60" />
                      </div>
                    </div>
                    <div className="hidden sm:block"><div className="h-3.5 w-24 rounded bg-[#29384b]" /></div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="px-5 py-10 text-center text-sm text-slate-300">Department records could not be loaded.</div>
            ) : sortedAndFilteredDepartments.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] text-slate-400"><Icon name="layers" size={22} /></span>
                <h3 className="mt-3 text-base font-bold text-white">{totalDepartments === 0 ? "No departments yet" : "No matching departments"}</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{totalDepartments === 0 ? "Create your first department record to start organizing your organization structure." : "No departments match the current search and status filters. Try another term or clear the filters."}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={openCreateDrawer} className="inline-flex items-center gap-2 rounded-lg bg-[#75c7ff] px-4 py-2 text-sm font-bold text-[#07111d] transition hover:bg-[#a0dcff]"><Icon name="plus" size={15} />Add Department</button>
                  {(searchQuery || statusFilter !== "ALL") && <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); }} className="inline-flex items-center gap-2 rounded-lg border border-[#34465d] bg-[#0b0f17] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05]">Reset filters</button>}
                </div>
              </div>
            ) : (
              viewMode === "table" ? (
                <div className="overflow-x-auto overscroll-x-contain px-4 pb-3 sm:px-5">
                  <table className="w-full min-w-[1080px] text-left text-sm">
                    <thead className="border-b border-[#29384b] bg-[#111a28]/85 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a2b8cc]">
                      <tr>
                        <th scope="col" className="w-10 px-3 py-3"><span className="sr-only">Select all</span><input type="checkbox" aria-label="Select all departments on page" checked={paginatedDepartments.length > 0 && paginatedDepartments.every((department) => selectedDepartmentIds.has(department.id))} onChange={toggleSelectAll} disabled={bulkUpdating} className="h-4 w-4 rounded border-[#526277] bg-[#0b0f17] accent-[#75c7ff]" /></th>
                        <th scope="col" className="px-3 py-3">Department</th>
                        <th scope="col" className="px-3 py-3">Department Manager</th>
                        <th scope="col" className="px-3 py-3">Employee distribution</th>
                        <th scope="col" className="px-3 py-3">Status</th>
                        <th scope="col" className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#29384b]">
                      {paginatedDepartments.map((department) => {
                        const totalEmp = Number(department.total_employee_count ?? department.employees?.length ?? department.employee_count ?? 0);
                        const activeEmp = Number(department.active_employee_count ?? department.employees?.filter((emp) => emp.employment_status === "ACTIVE").length ?? department.employee_count ?? 0);
                        const inactiveEmp = Number(department.inactive_employee_count ?? department.employees?.filter((emp) => emp.employment_status === "INACTIVE").length ?? 0);
                        const formerEmp = Number(department.former_employee_count ?? department.employees?.filter((emp) => emp.employment_status === "FORMER").length ?? 0);
                        const isDeptActive = normalizeStatus(department.status) === "ACTIVE";
                        const isSelected = selectedDepartmentIds.has(department.id);
                        return (
                          <tr key={department.id} className={`transition-colors hover:bg-white/[0.025] ${isSelected ? "bg-[#75c7ff]/[0.04]" : ""}`}>
                            <td className="w-10 px-3 py-3 align-top"><input type="checkbox" aria-label={`Select ${department.name}`} checked={isSelected} onChange={() => toggleSelectDepartment(department.id)} disabled={bulkUpdating} className="mt-1 h-4 w-4 rounded border-[#526277] bg-[#0b0f17] accent-[#75c7ff] disabled:opacity-50" /></td>
                            <td className="max-w-[300px] px-3 py-3 align-top">
                              <div className="flex min-w-0 items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${isDeptActive ? "border-[#34465d] bg-[#182232] text-slate-100" : "border-[#29384b] bg-[#111827] text-slate-500"}`}>{getInitials(department.name)}</span><div className="min-w-0 flex-1"><button type="button" onClick={() => void openDepartmentDrawer("view", department)} className={`block max-w-full truncate text-left text-sm font-semibold ${isDeptActive ? "text-white hover:text-[#9ed8ff]" : "text-slate-400 hover:text-slate-200"}`}>{department.name}</button><p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{department.id}</p>{department.description && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{department.description}</p>}</div></div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              {departmentManagerHref(department) ? (
                                <div className="flex items-center gap-2">
                                <EmployeeProfilePhoto employeeId={department.manager_id} name={departmentManagerDisplayName(department)} className="h-8 w-8 shrink-0 rounded-lg border border-[#34465d] bg-[#182232] text-[10px]" />
                                <Link
                                  href={departmentManagerHref(department)!}
                                  title={`Open ${departmentManagerDisplayName(department)} in employee details`}
                                  className="group inline-flex max-w-[220px] flex-col rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141f2e]"
                                >
                                  <span className="truncate text-xs font-semibold text-[#9ed8ff] group-hover:text-white group-hover:underline group-hover:underline-offset-4">{departmentManagerDisplayName(department)}</span>
                                  <span className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{department.manager_employee_code || "Employee code unavailable"}</span>
                                </Link>
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-slate-400">Unassigned</span>
                                  <span className="mt-0.5 text-[11px] text-slate-500">No manager assigned</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 align-top"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-mono text-sm font-bold tabular-nums text-white">{totalEmp} <span className="font-sans text-xs font-medium text-slate-400">total</span></span><span className="text-[11px] text-emerald-300">{activeEmp} active</span><span className="text-[11px] text-slate-400">{inactiveEmp} inactive</span><span className="text-[11px] text-amber-200">{formerEmp} former</span></div><div className="mt-2 flex h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-[#243144]" title={`${activeEmp} active, ${inactiveEmp} inactive, ${formerEmp} former employees`}><span className="bg-emerald-400" style={{ width: `${totalEmp ? activeEmp / totalEmp * 100 : 0}%` }} /><span className="bg-slate-500" style={{ width: `${totalEmp ? inactiveEmp / totalEmp * 100 : 0}%` }} /><span className="bg-amber-400" style={{ width: `${totalEmp ? formerEmp / totalEmp * 100 : 0}%` }} /></div></td>
                            <td className="px-3 py-3 align-top"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle(department.status)}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDotStyle(department.status)}`} />{humanizeStatus(department.status)}</span></td>
                            <td className="px-3 py-3 align-top"><div className="flex items-center gap-1.5"><button type="button" onClick={() => void openDepartmentDrawer("view", department)} aria-label={`View ${department.name}`} className="rounded-md border border-[#34465d] px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.05]">View</button><button type="button" onClick={() => void openDepartmentDrawer("edit", department)} aria-label={`Edit ${department.name}`} className="rounded-md border border-[#34465d] px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.05]">Edit</button><div className="relative"><button type="button" aria-label={`More actions for ${department.name}`} aria-expanded={actionMenuDepartmentId === department.id} onClick={() => setActionMenuDepartmentId((current) => current === department.id ? null : department.id)} className="rounded-md border border-[#34465d] p-1.5 text-slate-300 hover:bg-white/[0.05] hover:text-white"><Icon name="more" size={15} /></button>{actionMenuDepartmentId === department.id && <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-[#34465d] bg-[#101a28] p-1.5 shadow-lg"><button type="button" onClick={() => { setActionMenuDepartmentId(null); void handleToggleDepartmentStatus(department); }} className={`w-full rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-white/[0.06] ${isDeptActive ? "text-amber-200" : "text-emerald-200"}`}>{isDeptActive ? "Deactivate department" : "Activate department"}</button></div>}</div></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {paginatedDepartments.map((department) => {
                    const totalEmp = Number(department.total_employee_count ?? department.employees?.length ?? department.employee_count ?? 0);
                    const activeEmp = Number(department.active_employee_count ?? department.employees?.filter((emp) => emp.employment_status === "ACTIVE").length ?? department.employee_count ?? 0);
                    const inactiveEmp = Number(department.inactive_employee_count ?? department.employees?.filter((emp) => emp.employment_status === "INACTIVE").length ?? 0);
                    const formerEmp = Number(department.former_employee_count ?? department.employees?.filter((emp) => emp.employment_status === "FORMER").length ?? 0);
                    const isDeptActive = normalizeStatus(department.status) === "ACTIVE";
                    const isSelected = selectedDepartmentIds.has(department.id);
                    return <article key={department.id} className={`rounded-xl border p-4 transition-colors ${isSelected ? "border-[#75c7ff]/50 bg-[#75c7ff]/[0.035]" : "border-[#29384b] bg-[#0f1724]/55 hover:border-[#3b536d]"}`}>
                      <div className="flex items-start gap-3"><input aria-label={`Select ${department.name}`} type="checkbox" checked={isSelected} onChange={() => toggleSelectDepartment(department.id)} disabled={bulkUpdating} className="mt-1 h-4 w-4 rounded border-[#526277] bg-[#0b0f17] accent-[#75c7ff]" /><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#34465d] bg-[#182232] text-xs font-bold text-slate-100">{getInitials(department.name)}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-white">{department.name}</h3><p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{department.id}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle(department.status)}`}>{humanizeStatus(department.status)}</span></div>
                      {department.description && <p className="mt-3 line-clamp-2 text-xs text-slate-400">{department.description}</p>}
                      <div className="mt-3 rounded-lg border border-[#29384b] bg-[#111a28]/70 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Department manager</p>
                        {departmentManagerHref(department) ? (
                          <div className="mt-1 flex items-center gap-2">
                          <EmployeeProfilePhoto employeeId={department.manager_id} name={departmentManagerDisplayName(department)} className="h-8 w-8 shrink-0 rounded-lg border border-[#34465d] bg-[#182232] text-[10px]" />
                          <Link href={departmentManagerHref(department)!} title={`Open ${departmentManagerDisplayName(department)} in employee details`} className="inline-flex max-w-full flex-col rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]">
                            <span className="truncate text-xs font-semibold text-[#9ed8ff] hover:text-white hover:underline hover:underline-offset-4">{departmentManagerDisplayName(department)}</span>
                            <span className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{department.manager_employee_code || "Employee code unavailable"}</span>
                          </Link>
                          </div>
                        ) : <p className="mt-1 text-xs text-slate-400">No manager assigned</p>}
                      </div>
                      <dl className="mt-4 space-y-2 border-t border-[#29384b] pt-3 text-xs"><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Total employees</dt><dd className="font-mono font-semibold text-white">{totalEmp}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Active / Inactive / Former</dt><dd className="font-mono font-medium"><span className="text-emerald-300">{activeEmp}</span><span className="text-slate-500"> / </span><span className="text-slate-300">{inactiveEmp}</span><span className="text-slate-500"> / </span><span className="text-amber-200">{formerEmp}</span></dd></div></dl>
                      <div className="mt-4 flex items-center gap-2 border-t border-[#29384b] pt-3"><button type="button" onClick={() => void openDepartmentDrawer("view", department)} className="flex-1 rounded-lg border border-[#34465d] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]">View</button><button type="button" onClick={() => void openDepartmentDrawer("edit", department)} className="flex-1 rounded-lg border border-[#34465d] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]">Edit</button><div className="relative"><button type="button" onClick={() => setActionMenuDepartmentId((current) => current === department.id ? null : department.id)} aria-label={`More actions for ${department.name}`} aria-expanded={actionMenuDepartmentId === department.id} className="rounded-lg border border-[#34465d] p-2 text-slate-300 hover:bg-white/[0.05]"><Icon name="more" size={15} /></button>{actionMenuDepartmentId === department.id && <div className="absolute bottom-full right-0 z-30 mb-1 w-44 rounded-lg border border-[#34465d] bg-[#101a28] p-1.5 shadow-lg"><button type="button" onClick={() => { setActionMenuDepartmentId(null); void handleToggleDepartmentStatus(department); }} className={`w-full rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-white/[0.06] ${isDeptActive ? "text-amber-200" : "text-emerald-200"}`}>{isDeptActive ? "Deactivate department" : "Activate department"}</button></div>}</div></div>
                    </article>;
                  })}
                </div>
              )
            )}

            {/* Pagination footer */}
            {!loading && !error && sortedAndFilteredDepartments.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-[#29384b] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs text-slate-400">Showing {departments.length} records on this page · <span className="font-semibold text-slate-200">{matchingDepartmentCount.toLocaleString()}</span> matching records total</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#3b536d] disabled:opacity-35">Previous</button>
                  <span className="min-w-[90px] text-center text-xs font-semibold text-slate-300">Page {currentPage} of {totalPages}</span>
                  <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#3b536d] disabled:opacity-35">Next</button>
                </div>
              </div>
            )}
          </section>

          <footer className="mt-8 flex flex-col gap-2 border-t border-[#29384b] py-5 text-xs font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>{totalDepartments.toLocaleString()} departments</span>
          </footer>
        </div>
      </main>

      {/* Slide-Over Drawer */}
      {isDrawerOpen && <>
        <button type="button" aria-label="Close department drawer" onClick={requestCloseDrawer} disabled={saving} className="fixed inset-0 z-40 cursor-default bg-black/70 backdrop-blur-md transition-opacity disabled:cursor-wait" />
        <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="department-drawer-title" aria-describedby="department-drawer-description" tabIndex={-1} className="organization-department-drawer organization-slide-over-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[#29384b] bg-[#111a28] text-white shadow-2xl">
          
          <header className="shrink-0 border-b border-[#29384b] bg-[#0f1724]/95 px-6 py-5 backdrop-blur-xl sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/30 bg-[#75c7ff]/15 text-[#75c7ff]">
                  <Icon name={drawerMode === "create" ? "plus" : drawerMode === "edit" ? "edit" : "layers"} size={21} />
                </span>
                <div className="min-w-0">
                  <h2 id="department-drawer-title" className="text-xl font-bold tracking-tight text-white">
                    {drawerMode === "create" ? "Create new department" : drawerMode === "edit" ? "Edit department profile" : "Department profile"}
                  </h2>
                  <p id="department-drawer-description" className="mt-1 text-xs font-medium text-slate-300">
                    {drawerMode === "create" ? "Add a department and optionally assign its Department Manager." : drawerMode === "edit" ? "Update department details, operational status, and manager assignment." : "Comprehensive department records and assigned personnel."}
                  </p>
                </div>
              </div>
              <button ref={drawerCloseButtonRef} type="button" onClick={requestCloseDrawer} disabled={saving} aria-label="Close department drawer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] text-slate-300 transition hover:border-[#3b536d] hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
                <Icon name="close" size={18} />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-7 space-y-6">
            {drawerLoading ? (
              <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 rounded-xl border border-[#29384b] bg-[#0f1724]/75 px-5 py-16 text-sm font-medium text-slate-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent" />
                Loading department record…
              </div>
            ) : drawerError && drawerMode === "view" && !selectedDepartment ? (
              <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
                {drawerError}
                <button type="button" onClick={closeDrawerImmediately} className="mt-3 block font-bold underline">Close drawer</button>
              </div>
            ) : drawerMode === "view" && selectedDepartment ? (
              <>
                {drawerNotice && <div role="status" aria-live="polite" className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-3.5 text-sm font-medium text-emerald-200">{drawerNotice}</div>}
                
                <div className={`relative overflow-hidden rounded-xl border p-5 shadow-sm ${normalizeStatus(selectedDepartment.status) === "ACTIVE" ? "border-[#29384b] bg-gradient-to-br from-[#142133] to-[#0f1724]" : "border-slate-700/50 bg-slate-950/40 opacity-75"}`}>
                  <div className="flex items-center gap-4">
                    <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br text-xl font-extrabold ${getGradientAvatar(selectedDepartment.name, normalizeStatus(selectedDepartment.status) === "ACTIVE")}`}>{getInitials(selectedDepartment.name)}</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">{selectedDepartment.name}</h3>
                      <p className="mt-0.5 font-mono text-xs font-medium text-slate-400">{selectedDepartment.id}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-0.5 text-xs ring-1 ring-inset ${statusStyle(selectedDepartment.status)}`}>
                          <span className={`h-2 w-2 rounded-full ${statusDotStyle(selectedDepartment.status)}`} />
                          {humanizeStatus(selectedDepartment.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {selectedDepartment.description && (
                    <div className="mt-4 border-t border-[#29384b] pt-3 text-xs leading-relaxed text-slate-300">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Description</p>
                      {selectedDepartment.description}
                    </div>
                  )}
                </div>

                <section aria-labelledby="department-manager-title" className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h4 id="department-manager-title" className="text-xs font-bold uppercase tracking-wider text-slate-400">Department Manager</h4>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${selectedDepartment.manager_id ? "bg-emerald-500/10 text-emerald-200" : "bg-slate-500/10 text-slate-400"}`}>
                      {selectedDepartment.manager_id ? "Assigned" : "Unassigned"}
                    </span>
                  </div>
                  {departmentManagerHref(selectedDepartment) ? (
                    <Link
                      href={departmentManagerHref(selectedDepartment)!}
                      title={`Open ${departmentManagerDisplayName(selectedDepartment)} in employee details`}
                      className="mt-3 inline-flex max-w-full items-center gap-3 rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-3 transition-colors hover:border-[#75c7ff]/50 hover:bg-[#111d2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                    >
                      <DepartmentManagerPhoto
                        employeeId={selectedDepartment.manager_id}
                        name={departmentManagerDisplayName(selectedDepartment)}
                      />
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-sm font-semibold text-[#9ed8ff] hover:text-white">{departmentManagerDisplayName(selectedDepartment)}</span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">{selectedDepartment.manager_employee_code || "Employee code unavailable"}</span>
                      </span>
                      <Icon name="arrow" size={14} className="ml-1 text-slate-500" />
                    </Link>
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-[#34465d] px-3 py-4 text-sm text-slate-400">No Department Manager is assigned to this department.</p>
                  )}
                </section>

                <div className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#75c7ff]">
                      <Icon name="users" size={16} /> Employee Distribution
                    </h4>
                    {drawerEmployeeFilter !== "ALL" && (
                      <button type="button" onClick={() => setDrawerEmployeeFilter("ALL")} className="text-xs font-bold text-[#75c7ff] underline hover:text-white">Clear filter</button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <button type="button" onClick={() => setDrawerEmployeeFilter("ALL")} className={`text-left rounded-xl border p-4 transition ${drawerEmployeeFilter === "ALL" ? "border-[#75c7ff] bg-[#18314a]" : "border-[#29384b] bg-[#0f1724] hover:border-[#3b536d]"}`}>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Assigned</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tabular-nums">{Number(selectedDepartment.total_employee_count ?? selectedDepartment.employee_count) || 0}</p>
                    </button>
                    <button type="button" onClick={() => setDrawerEmployeeFilter("ACTIVE")} className={`text-left rounded-xl border p-4 transition ${drawerEmployeeFilter === "ACTIVE" ? "border-emerald-400 bg-emerald-950/40" : "border-[#29384b] bg-[#0f1724] hover:border-[#3b536d]"}`}>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-emerald-300 tabular-nums">{Number(selectedDepartment.active_employee_count ?? selectedDepartment.employees?.filter((employee) => employee.employment_status === "ACTIVE").length ?? selectedDepartment.employee_count ?? 0)}</p>
                    </button>
                    <button type="button" onClick={() => setDrawerEmployeeFilter("INACTIVE")} className={`text-left rounded-xl border p-4 transition ${drawerEmployeeFilter === "INACTIVE" ? "border-amber-400 bg-amber-950/40" : "border-[#29384b] bg-[#0f1724] hover:border-[#3b536d]"}`}>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inactive</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-amber-300 tabular-nums">{Number(selectedDepartment.inactive_employee_count ?? selectedDepartment.employees?.filter((employee) => employee.employment_status === "INACTIVE").length ?? 0)}</p>
                    </button>
                    <button type="button" onClick={() => setDrawerEmployeeFilter("FORMER")} className={`text-left rounded-xl border p-4 transition ${drawerEmployeeFilter === "FORMER" ? "border-violet-400 bg-violet-950/40" : "border-[#29384b] bg-[#0f1724] hover:border-[#3b536d]"}`}>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Former</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-violet-300 tabular-nums">{Number(selectedDepartment.former_employee_count ?? selectedDepartment.employees?.filter((employee) => employee.employment_status === "FORMER").length ?? 0)}</p>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#75c7ff]">
                      <Icon name="users" size={16} /> Assigned Employees ({filteredDepartmentEmployees.length})
                      {drawerEmployeeFilter !== "ALL" && <span className="text-xs text-amber-300 lowercase font-medium">(filtered by {drawerEmployeeFilter})</span>}
                    </h4>
                    <div className="relative w-full sm:w-56">
                      <span className="pointer-events-none absolute left-3.5 top-3 text-slate-400"><Icon name="search" size={15} /></span>
                      <input type="search" value={employeeSearchQuery} onChange={(e) => setEmployeeSearchQuery(e.target.value)} placeholder="Search employees…" className="h-10 w-full rounded-xl border border-[#29384b] bg-[#0f1724] pl-10 pr-3 text-xs font-medium text-white placeholder:text-slate-400 outline-none focus:border-[#75c7ff]" />
                    </div>
                  </div>
                  {departmentEmployees.length === 0 ? (
                    <p className="text-xs font-medium text-slate-400 py-6 text-center">No employees are currently assigned to this department.</p>
                  ) : filteredDepartmentEmployees.length === 0 ? (
                    <p className="text-xs font-medium text-slate-400 py-6 text-center">No employees match your search query or status filter.</p>
                  ) : (
                    <div className="divide-y divide-[#29384b] max-h-72 overflow-y-auto pr-1">
                      {filteredDepartmentEmployees.map((emp) => (
                        <div key={emp.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <EmployeeProfilePhoto employeeId={emp.id} name={[emp.first_name, emp.last_name].filter(Boolean).join(" ")} className="h-9 w-9 shrink-0 rounded-lg border border-[#34465d] bg-[#182232] text-[10px]" />
                            <div className="min-w-0">
                            <Link href={`/org/employees?employeeId=${encodeURIComponent(emp.id)}`} className="text-xs font-bold text-white hover:text-[#75c7ff] transition">
                              {[emp.first_name, emp.last_name].filter(Boolean).join(" ")}
                            </Link>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-300">{emp.employee_code}{emp.designation ? ` · ${emp.designation}` : ""}</p>
                            </div>
                          </div>
                          <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${statusStyle(emp.employment_status)}`}>{emp.employment_status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (drawerMode === "create" || drawerMode === "edit") && (
              <form id="department-drawer-form" noValidate onSubmit={handleSubmitDepartment} className="space-y-4">
                {drawerError && (
                  <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
                    <div className="flex items-start gap-2.5"><Icon name="alert" size={18} /><span>{drawerError}</span></div>
                  </div>
                )}

                <div className="space-y-4 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm">
                  <div className="border-b border-[#29384b] pb-3.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Icon name="layers" size={17} className="text-[#75c7ff]" /> Department Information
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-300">Set the department details and, when eligible, assign its Department Manager.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="department-name-input" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                        <span>Department name <span className="text-rose-400">*</span></span>
                        <FieldStatus complete={departmentNameReady} invalid={showDepartmentFieldError("name")} />
                      </label>
                      <input autoFocus id="department-name-input" name="name" autoComplete="off" required minLength={2} maxLength={100} value={form.name} onBlur={() => setTouchedFields((current) => new Set(current).add("name"))} onChange={(event) => updateField("name", event.target.value)} placeholder="e.g. Human Resources" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showDepartmentFieldError("name") ? "border-rose-400/60" : departmentNameReady ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                      {showDepartmentFieldError("name") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{departmentFieldErrors.name}</p>}
                    </div>

                    {drawerMode === "create" ? (
                      <div>
                        <label htmlFor="department-description-input" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                          <span>Description <span className="font-normal text-slate-400">(optional)</span></span>
                          <FieldStatus complete={Boolean(form.description.trim()) && !departmentFieldErrors.description} invalid={showDepartmentFieldError("description")} />
                        </label>
                        <textarea id="department-description-input" name="description" maxLength={1000} rows={4} value={form.description} onBlur={() => setTouchedFields((current) => new Set(current).add("description"))} onChange={(event) => updateField("description", event.target.value)} placeholder="Brief description of responsibilities…" className={`mt-2 w-full rounded-xl border bg-[#0f1724] p-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showDepartmentFieldError("description") ? "border-rose-400/60" : "border-[#29384b]"}`} />
                        {showDepartmentFieldError("description") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{departmentFieldErrors.description}</p>}
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="department-status-input" className="text-xs font-bold text-slate-200">Department status</label>
                        <select id="department-status-input" name="status" value={form.status} onChange={(event) => updateField("status", event.target.value as "ACTIVE" | "INACTIVE")} className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff]">
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </div>
                    )}

                    <div className="border-t border-[#29384b] pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="department-manager-input" className="text-xs font-bold text-slate-200">Department Manager <span className="font-normal text-slate-400">(optional)</span></label>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${form.manager_id ? "bg-emerald-500/10 text-emerald-200" : "bg-slate-500/10 text-slate-400"}`}>
                          {form.manager_id ? "Selected" : "Unassigned"}
                        </span>
                      </div>
                      <select
                        id="department-manager-input"
                        name="manager_id"
                        value={form.manager_id}
                        onChange={(event) => updateField("manager_id", event.target.value)}
                        disabled={managerCandidatesLoading || Boolean(managerCandidatesError)}
                        className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] disabled:cursor-wait disabled:opacity-60"
                      >
                        <option value="">No Department Manager</option>
                        {selectedDepartment && form.manager_id && !managerCandidatesLoading && !managerCandidates.some((candidate) => candidate.id === form.manager_id) && (
                          <option value={form.manager_id}>{departmentManagerDisplayName(selectedDepartment)} — current assignment not eligible</option>
                        )}
                        {managerCandidates.map((candidate) => {
                          const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ").trim();
                          const candidateLabel = [fullName || "Department Manager", candidate.employee_code, candidate.designation].filter(Boolean).join(" · ");
                          return <option key={candidate.id} value={candidate.id} disabled={form.status !== "ACTIVE"}>{candidateLabel}</option>;
                        })}
                      </select>
                      {managerCandidatesLoading ? (
                        <p role="status" className="mt-2 text-xs text-slate-400">Loading eligible Department Managers…</p>
                      ) : managerCandidatesError ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-3">
                          <p role="alert" className="text-xs text-rose-200">{managerCandidatesError}</p>
                          <button type="button" onClick={() => setManagerCandidatesReloadKey((key) => key + 1)} className="text-xs font-bold text-[#9ed8ff] underline">Retry</button>
                        </div>
                      ) : managerCandidates.length === 0 ? (
                        <p className="mt-2 text-xs leading-relaxed text-amber-200">No eligible Department Managers were found. You can save this department as unassigned and assign a manager later.</p>
                      ) : (
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">Only active Department Managers with an active organization account are listed. Assignments are validated again by the server.</p>
                      )}
                      {form.status !== "ACTIVE" && <p className="mt-2 text-xs leading-relaxed text-amber-200">Activate this department before assigning a manager. You can clear an existing assignment while it is inactive.</p>}
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>

          <footer className="shrink-0 border-t border-[#29384b] bg-[#0f1724]/95 px-6 py-4.5 backdrop-blur-xl sm:px-7">
            {drawerMode === "view" ? (
              <div className="flex justify-between gap-3">
                <button type="button" onClick={requestCloseDrawer} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] px-4.5 text-sm font-bold text-slate-200 hover:bg-white/[0.08]">Close</button>
                <button type="button" onClick={beginEdit} disabled={!selectedDepartment || drawerLoading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#75c7ff] px-4.5 text-sm font-bold text-[#07111d] hover:bg-[#a0dcff] disabled:opacity-50 shadow-sm"><Icon name="edit" size={16} />Edit Department</button>
              </div>
            ) : (drawerMode === "create" || drawerMode === "edit") && (
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={requestCloseDrawer} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" form="department-drawer-form" disabled={saving || drawerLoading || (drawerMode === "edit" && !formIsDirty)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-5 text-xs font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:opacity-50 shadow-sm">
                  {saving ? "Saving…" : drawerMode === "create" ? "Create Department" : "Save Changes"}
                </button>
              </div>
            )}
          </footer>
        </aside>

        {confirmDiscard && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <section ref={discardDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-department-title" aria-describedby="discard-department-description" tabIndex={-1} className="w-full max-w-md rounded-2xl border border-[#34465d] bg-[#111a28] p-6 text-white shadow-2xl outline-none">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15 text-amber-300"><Icon name="alert" size={22} /></span>
              <h3 id="discard-department-title" className="mt-4 text-lg font-bold text-white">Discard unsaved changes?</h3>
              <p id="discard-department-description" className="mt-2 text-sm leading-relaxed text-slate-300">Your {drawerMode === "create" ? "new department details" : "department edits"} have not been saved. You can continue editing or discard those changes.</p>
              <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button ref={discardKeepEditingRef} type="button" onClick={() => setConfirmDiscard(false)} className="h-10 rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]">Keep editing</button>
                <button type="button" onClick={closeDrawerImmediately} className="h-10 rounded-xl border border-rose-400/35 bg-rose-500/15 px-4.5 text-sm font-bold text-rose-200 transition hover:bg-rose-500/25">Discard changes</button>
              </div>
            </section>
          </div>
        )}
      </>}
    </div>
  );
}