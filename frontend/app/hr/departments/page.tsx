"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  Filter,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
  useHRManagerAutoRefresh,
} from "../../components/hr/HRManagerChrome";

type DepartmentStatus = "ACTIVE" | "INACTIVE";
type StatusFilter = "ALL" | DepartmentStatus;
type DrawerMode = "create" | "view" | "edit" | null;
type ViewMode = "table" | "cards";

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
  status: string | null;
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
  employee_count?: number;
  total_employee_count?: number;
  active_employee_count?: number;
  inactive_employee_count?: number;
  former_employee_count?: number;
  employees?: DepartmentEmployee[];
  created_at?: string;
  updated_at?: string;
};

type ManagerCandidate = {
  id: string;
  employee_code?: string | null;
  first_name: string;
  last_name?: string | null;
  designation?: string | null;
  workforce_role?: string | null;
  account_status?: string | null;
};

type ApiResponse<T> = {
  status?: string;
  message?: string;
  department?: T;
  departments?: T[];
  employees?: T[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasPreviousPage?: boolean;
    hasNextPage?: boolean;
  };
  employeesDeactivated?: number;
};

type DepartmentForm = {
  name: string;
  description: string;
  status: DepartmentStatus;
  manager_id: string;
};

const PAGE_SIZE = 10;

const EMPTY_FORM: DepartmentForm = {
  name: "",
  description: "",
  status: "ACTIVE",
  manager_id: "",
};

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function normalizeStatus(
  value: string | null | undefined,
): string {
  return (value ?? "UNKNOWN").toUpperCase();
}

function statusLabel(value: string | null | undefined): string {
  switch (normalizeStatus(value)) {
    case "ACTIVE":
      return "Active";
    case "INACTIVE":
      return "Inactive";
    case "FORMER":
      return "Former";
    default:
      return value || "Unknown";
  }
}

function statusClasses(value: string | null | undefined): string {
  switch (normalizeStatus(value)) {
    case "ACTIVE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "INACTIVE":
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  }
}

function employeeName(employee: DepartmentEmployee): string {
  return (
    `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() ||
    employee.employee_code ||
    "Unnamed employee"
  );
}

function managerName(department: Department): string {
  const joinedName = [
    department.manager_first_name,
    department.manager_last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return department.manager_name?.trim() || joinedName || "No manager assigned";
}

function candidateName(candidate: ManagerCandidate): string {
  return [
    candidate.first_name,
    candidate.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || candidate.employee_code || "Unnamed manager";
}

function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "DP"
  );
}

function numberLabel(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat().format(value);
}

function dateLabel(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formFromDepartment(
  department: Department,
): DepartmentForm {
  return {
    name: department.name ?? "",
    description: department.description ?? "",
    status:
      normalizeStatus(department.status) === "INACTIVE"
        ? "INACTIVE"
        : "ACTIVE",
    manager_id: department.manager_id ?? "",
  };
}

export default function HRManagerDepartmentsPage() {
  const auth = useHRManagerSession();
  const user = auth.user;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [managerCandidates, setManagerCandidates] = useState<ManagerCandidate[]>([]);
  const [managerCandidatesError, setManagerCandidatesError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeDepartmentTotal, setActiveDepartmentTotal] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const departmentsLoadedRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<DepartmentForm>(EMPTY_FORM);
  const [baselineForm, setBaselineForm] = useState<DepartmentForm>(EMPTY_FORM);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [statusConfirmation, setStatusConfirmation] = useState<{
    department: Department;
    target: DepartmentStatus;
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  // Body scroll lock effect when drawer or modal is open
  useEffect(() => {
    const isModalOpen = Boolean(drawerMode || statusConfirmation);
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerMode, statusConfirmation]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadDepartments = useCallback(async (silent = false) => {
    if (!user) return;

    if (!silent) setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      includeInactive: "true",
    });

    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    async function loadCount(status?: DepartmentStatus): Promise<number> {
      const countParams = new URLSearchParams({
        page: "1",
        limit: "1",
        includeInactive: "true",
      });

      if (status) countParams.set("status", status);

      const response = await fetch(
        `/api/backend/departments?${countParams.toString()}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data = await readJson<ApiResponse<Department>>(response);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to load department counts.");
      }

      return Number(
        data?.pagination?.total ??
          data?.departments?.length ??
          0,
      );
    }

    try {
      const [response, allCount, activeCount] = await Promise.all([
        fetch(`/api/backend/departments?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        }),
        loadCount(),
        loadCount("ACTIVE"),
      ]);

      const data = await readJson<ApiResponse<Department>>(response);

      if (
        response.status === 401
      ) {
        await auth.reload();
        return;
      }

      if (!response.ok) {
        throw new Error(data?.message || "Unable to load departments.");
      }

      const list = Array.isArray(data?.departments)
        ? data.departments
        : [];

      const countForFilter = Number(
        data?.pagination?.total ?? list.length,
      );

      const computedPages = Math.max(
        1,
        Number(
          data?.pagination?.totalPages ??
            Math.ceil(countForFilter / PAGE_SIZE),
        ),
      );

      setDepartments(list);
      departmentsLoadedRef.current = true;
      setTotal(countForFilter);
      setTotalPages(computedPages);
      setActiveDepartmentTotal(activeCount);

      if (page > computedPages) {
        setPage(computedPages);
      }

      if (statusFilter === "ALL" && allCount !== countForFilter) {
        setTotal(allCount);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong while loading departments.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    user,
    auth.reload,
    page,
    debouncedSearch,
    statusFilter,
  ]);

  useEffect(() => {
    if (user) void loadDepartments();
  }, [user, loadDepartments, reloadKey]);

  async function loadManagerCandidates() {
    setManagerCandidatesError("");

    try {
      const response = await fetch(
        "/api/backend/employees/managers?role=DEPARTMENT_MANAGER",
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data = await readJson<ApiResponse<ManagerCandidate>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok || !Array.isArray(data?.employees)) {
        throw new Error(
          data?.message || "Unable to load eligible Department Managers.",
        );
      }

      setManagerCandidates(data.employees);
    } catch (caught) {
      setManagerCandidatesError(
        caught instanceof Error
          ? caught.message
          : "Unable to load eligible Department Managers.",
      );
    }
  }


  const refreshDepartmentsWorkspace = useCallback(() => {
    void loadDepartments(true);

    // Refresh manager options only while the create/edit drawer is open.
    // The user's in-progress form values are deliberately left untouched.
    if (drawerMode === "create" || drawerMode === "edit") {
      void loadManagerCandidates();
    }
  }, [drawerMode, loadDepartments]);

  useHRManagerAutoRefresh(refreshDepartmentsWorkspace, {
    enabled: Boolean(user),
    intervalMs: 60_000,
  });

  const eligibleManagers = useMemo(
    () =>
      managerCandidates.filter((manager) => {
        if (
          manager.workforce_role &&
          manager.workforce_role !== "DEPARTMENT_MANAGER"
        ) {
          return false;
        }

        if (
          manager.account_status &&
          manager.account_status !== "ACTIVE"
        ) {
          return false;
        }

        return true;
      }),
    [managerCandidates],
  );

  const counts = useMemo(() => {
    const active = departments.filter(
      (department) =>
        normalizeStatus(department.status) === "ACTIVE",
    ).length;

    const inactive = departments.filter(
      (department) =>
        normalizeStatus(department.status) === "INACTIVE",
    ).length;

    return { active, inactive };
  }, [departments]);

  const selectedDepartments = useMemo(
    () =>
      departments.filter((department) =>
        selectedIds.has(department.id),
      ),
    [departments, selectedIds],
  );


  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setBaselineForm({ ...EMPTY_FORM });
    setSubmitAttempted(false);
    setDrawerError("");
  }

  function openCreateDrawer() {
    resetForm();
    setSelectedDepartment(null);
    setDrawerMode("create");
    void loadManagerCandidates();
  }

  async function openDepartmentDrawer(
    mode: "view" | "edit",
    department: Department,
  ) {
    setDrawerMode(mode);
    setSelectedDepartment(null);
    setDrawerLoading(true);
    setDrawerError("");

    if (mode === "edit") {
      void loadManagerCandidates();
    }

    try {
      const response = await fetch(
        `/api/backend/departments/${encodeURIComponent(department.id)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data = await readJson<ApiResponse<Department>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok || !data?.department) {
        throw new Error(
          data?.message || "Unable to load department details.",
        );
      }

      setSelectedDepartment(data.department);
      const nextForm = formFromDepartment(data.department);

      setForm(nextForm);
      setBaselineForm(nextForm);
    } catch (caught) {
      setDrawerError(
        caught instanceof Error
          ? caught.message
          : "Unable to load department details.",
      );
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    if (saving) return;

    setDrawerMode(null);
    setSelectedDepartment(null);
    resetForm();
  }

  function updateField<K extends keyof DepartmentForm>(
    field: K,
    value: DepartmentForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setDrawerError("");
  }

  function validateForm(): string | null {
    const name = form.name.trim();

    if (name.length < 2 || name.length > 100) {
      return "Department name must be between 2 and 100 characters.";
    }

    if (drawerMode === "create" && form.description.trim().length > 1000) {
      return "Description must be 1,000 characters or fewer.";
    }

    if (
      drawerMode === "edit" &&
      normalizeStatus(selectedDepartment?.status) === "ACTIVE" &&
      form.status === "INACTIVE"
    ) {
      return null;
    }

    return null;
  }

  async function saveDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || (drawerMode !== "create" && drawerMode !== "edit")) {
      return;
    }

    setSubmitAttempted(true);
    setDrawerError("");

    const validationError = validateForm();

    if (validationError) {
      setDrawerError(validationError);
      return;
    }

    const creating = drawerMode === "create";

    if (!creating && !selectedDepartment) {
      setDrawerError("The selected department could not be identified.");
      return;
    }

    const name = form.name.trim();
    const managerChanged =
      !creating &&
      (form.manager_id || null) !==
        (selectedDepartment?.manager_id || null);

    if (
      managerChanged &&
      form.manager_id &&
      form.status !== "ACTIVE"
    ) {
      setDrawerError(
        "Activate the department before assigning a Department Manager. You may remove an existing assignment while the department is inactive.",
      );
      return;
    }

    if (
      !creating &&
      selectedDepartment &&
      normalizeStatus(selectedDepartment.status) === "ACTIVE" &&
      form.status === "INACTIVE"
    ) {
      const confirmed = window.confirm(
        `Deactivate "${selectedDepartment.name}"? The backend may also mark currently active employees assigned to this department inactive.`,
      );

      if (!confirmed) return;
    }

    setSaving(true);

    try {
      const payload: Record<string, unknown> = creating
        ? {
            name,
            description: form.description.trim() || null,
          }
        : {
            name,
            status: form.status,
          };

      if (!creating && managerChanged) {
        payload.manager_id = form.manager_id || null;
      }

      const response = await fetch(
        creating
          ? "/api/backend/departments"
          : `/api/backend/departments/${encodeURIComponent(selectedDepartment!.id)}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify(payload),
        },
      );

      const data = await readJson<ApiResponse<Department>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      const savedDepartment =
        data?.department ??
        (data as unknown as Department | null);

      if (!response.ok || !savedDepartment) {
        throw new Error(
          data?.message ||
            (creating
              ? "Unable to create department."
              : "Unable to update department."),
        );
      }

      let managerAssignmentWarning = "";

      if (creating && form.manager_id) {
        if (!savedDepartment.id) {
          managerAssignmentWarning =
            "The department was created, but its ID was not returned, so the manager could not be assigned.";
        } else {
          try {
            const assignmentResponse = await fetch(
              `/api/backend/departments/${encodeURIComponent(savedDepartment.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                body: JSON.stringify({
                  manager_id: form.manager_id,
                }),
              },
            );

            const assignmentData =
              await readJson<ApiResponse<Department>>(assignmentResponse);

            if (assignmentResponse.status === 401) {
              await auth.reload();
              return;
            }

            if (!assignmentResponse.ok) {
              managerAssignmentWarning =
                assignmentData?.message ||
                "The department was created, but the manager assignment failed.";
            }
          } catch (caught) {
            managerAssignmentWarning =
              caught instanceof Error
                ? `The department was created, but manager assignment failed: ${caught.message}`
                : "The department was created, but manager assignment failed.";
          }
        }
      }

      setDrawerMode(null);
      setSelectedDepartment(null);
      resetForm();

      setNotice(
        managerAssignmentWarning ||
          (creating
            ? "Department created successfully."
            : "Department updated successfully."),
      );

      setReloadKey((value) => value + 1);
    } catch (caught) {
      setDrawerError(
        caught instanceof Error
          ? caught.message
          : "Unable to save department.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleDepartmentStatus(department: Department) {
    const currentStatus = normalizeStatus(department.status);
    const target: DepartmentStatus =
      currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    if (
      target === "INACTIVE" &&
      !window.confirm(
        `Deactivate "${department.name}"? The backend may also mark currently active employees in this department inactive.`,
      )
    ) {
      return;
    }

    setChangingStatus(true);
    setError("");

    try {
      const response = await fetch(
        `/api/backend/departments/${encodeURIComponent(department.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            name: department.name,
            status: target,
          }),
        },
      );

      const data = await readJson<ApiResponse<Department>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to update department status.",
        );
      }

      const employeesDeactivated = Number(data?.employeesDeactivated) || 0;

      setNotice(
        target === "ACTIVE"
          ? "Department activated successfully. Employee statuses were not changed."
          : `Department deactivated successfully. ${employeesDeactivated} active employee(s) marked inactive.`,
      );

      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update department status.",
      );
    } finally {
      setChangingStatus(false);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleCurrentPageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);

      const allSelected =
        departments.length > 0 &&
        departments.every((department) => next.has(department.id));

      if (allSelected) {
        for (const department of departments) {
          next.delete(department.id);
        }
      } else {
        for (const department of departments) {
          next.add(department.id);
        }
      }

      return next;
    });
  }

  if (auth.checking) return <HRManagerLoading />;

  if (!user) {
    return (
      <HRManagerUnavailable
        message={auth.error || "Your HR Manager session could not be verified."}
        onRetry={() => void auth.reload()}
      />
    );
  }

  return (
    <HRManagerShell
      user={user}
      activePage="departments"
      title="Departments"
      description="Manage departments and their workforce assignments."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <div className="hr-departments-page">
      <style jsx global>{`
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="bg-[#151C28"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="bg-[#192333"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="bg-[#202D40"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="bg-[#111827"] {
          background-color: #ffffff !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="border-[#344357"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="border-[#3A4A60"] {
          border-color: #d5deea !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="text-white"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="text-[#F8FAFC"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="text-[#E8EEF5"] {
          color: #172033 !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="text-[#C5D0DE"],
        html[data-hr-manager-theme="light"] .hr-departments-page [class*="text-[#9AA8BA"] {
          color: #526176 !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page input,
        html[data-hr-manager-theme="light"] .hr-departments-page select,
        html[data-hr-manager-theme="light"] .hr-departments-page textarea {
          color: #172033 !important;
          background-color: #ffffff !important;
          border-color: #cbd5e1 !important;
          color-scheme: light;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page input::placeholder,
        html[data-hr-manager-theme="light"] .hr-departments-page textarea::placeholder {
          color: #64748b !important;
          opacity: 1;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page button[class*="bg-[#151C28"],
        html[data-hr-manager-theme="light"] .hr-departments-page button[class*="bg-[#192333"] {
          color: #243247 !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page button[class*="bg-blue-500"],
        html[data-hr-manager-theme="light"] .hr-departments-page button[class*="bg-blue-600"] {
          color: #ffffff !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page .divide-slate-800\/60 > :not([hidden]) ~ :not([hidden]) {
          border-color: #e2e8f0 !important;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page tr:hover,
        html[data-hr-manager-theme="light"] .hr-departments-page button:hover {
          --tw-text-opacity: 1;
        }
        html[data-hr-manager-theme="light"] .hr-departments-page input[type="checkbox"] {
          accent-color: #2563eb;
        }
      `}</style>
      {notice && (
        <div
          role="status"
          className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 shadow-lg"
        >
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
        >
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1 text-rose-200/90">{error}</div>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
            className="text-rose-400 hover:text-rose-200"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-[#344357]/80 border-t-[3px] border-t-blue-500 bg-[#192333] p-5 shadow-xl transition-all hover:border-[#3A4A60]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C5D0DE]">
                Total departments
              </p>
              <p className="mt-2.5 text-3xl font-extrabold tracking-tight text-white">
                {numberLabel(
                  statusFilter === "ALL" && !debouncedSearch
                    ? total
                    : total,
                )}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
              <Building2 size={21} />
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-[#344357]/80 border-t-[3px] border-t-emerald-500 bg-[#192333] p-5 shadow-xl transition-all hover:border-[#3A4A60]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C5D0DE]">
                Active departments
              </p>
              <p className="mt-2.5 text-3xl font-extrabold tracking-tight text-white">
                {numberLabel(activeDepartmentTotal)}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <CheckCircle2 size={21} />
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-[#344357]/80 border-t-[3px] border-t-slate-500 bg-[#192333] p-5 shadow-xl transition-all hover:border-[#3A4A60]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C5D0DE]">
                Visible inactive departments
              </p>
              <p className="mt-2.5 text-3xl font-extrabold tracking-tight text-white">
                {numberLabel(counts.inactive)}
              </p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#202D40] text-[#C5D0DE] ring-1 ring-slate-700">
              <Clock3 size={21} />
            </div>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#344357]/80 bg-[#192333] shadow-xl">
        <div className="flex flex-col justify-between gap-4 border-b border-[#344357]/80 px-6 py-5 bg-[#151C28]/60 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Department directory
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selectedIds.size > 0 && (
              <span className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-400">
                {selectedIds.size} selected
              </span>
            )}

            <div className="inline-flex rounded-xl border border-[#344357] bg-[#151C28] p-1 shadow-inner">
              <button
                type="button"
                aria-pressed={viewMode === "table"}
                onClick={() => setViewMode("table")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  viewMode === "table"
                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                    : "text-[#C5D0DE] hover:text-white"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  viewMode === "cards"
                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                    : "text-[#C5D0DE] hover:text-white"
                }`}
              >
                Cards
              </button>
            </div>

            <button
              type="button"
              onClick={openCreateDrawer}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-500 px-3.5 text-xs font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98]"
            >
              <Plus size={15} />
              <span>Add department</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3.5 border-b border-[#344357]/80 p-5 bg-[#192333] sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-[#C5D0DE] pointer-events-none"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Search departments or managers…"
              aria-label="Search departments"
              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#151C28] pl-10 pr-4 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner"
            />
          </label>

          <label className="relative block">
            <Filter
              size={15}
              className="absolute left-3.5 top-3.5 text-[#C5D0DE] pointer-events-none"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              aria-label="Filter by department status"
              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#151C28] pl-10 pr-4 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="h-10.5 rounded-xl border border-[#344357] bg-[#151C28] px-4 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] shadow-xs"
            >
              Clear selection
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-[#C5D0DE]">
            <RefreshCw size={17} className="animate-spin text-blue-400" />
            Loading departments…
          </div>
        ) : error && departments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CircleAlert size={27} className="mx-auto text-rose-400" />
            <p className="mt-3 text-sm font-bold text-white">
              Departments could not be loaded
            </p>
            <p className="mt-1 text-sm text-[#C5D0DE]">{error}</p>
          </div>
        ) : departments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#202D40] text-[#C5D0DE]">
              <Building2 size={24} />
            </div>
            <h3 className="mt-4 text-sm font-bold text-white">
              {debouncedSearch || statusFilter !== "ALL"
                ? "No matching departments"
                : "No departments yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[#C5D0DE]">
              {debouncedSearch || statusFilter !== "ALL"
                ? "Try a different search term or status filter."
                : "Create a department to organize your workforce and reporting relationships."}
            </p>
            {debouncedSearch || statusFilter !== "ALL" ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                }}
                className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                onClick={openCreateDrawer}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-400 transition-all"
              >
                <Plus size={16} />
                Add department
              </button>
            )}
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-[#151C28]/80 text-[11px] font-bold uppercase tracking-[0.12em] text-[#C5D0DE] border-b border-[#344357]/80">
                <tr>
                  <th className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label="Select current page"
                      checked={
                        departments.length > 0 &&
                        departments.every((department) =>
                          selectedIds.has(department.id),
                        )
                      }
                      onChange={toggleCurrentPageSelection}
                      className="rounded border-[#3A4A60] bg-[#111827] text-blue-500 focus:ring-blue-500/20"
                    />
                  </th>
                  <th className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                      Department <ArrowDownUp size={13} />
                    </span>
                  </th>
                  <th className="px-4 py-3.5">Department manager</th>
                  <th className="px-4 py-3.5">Employees</th>
                  <th className="px-4 py-3.5">Active employees</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60">
                {departments.map((department) => {
                  const activeCount = Number(
                    department.active_employee_count ??
                      department.employee_count ??
                      0,
                  );
                  const allCount = Number(
                    department.total_employee_count ??
                      department.employee_count ??
                      0,
                  );

                  return (
                    <tr
                      key={department.id}
                      className="transition hover:bg-[#202D40]/40"
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(department.id)}
                          onChange={() => toggleSelection(department.id)}
                          aria-label={`Select ${department.name}`}
                          className="rounded border-[#3A4A60] bg-[#111827] text-blue-500 focus:ring-blue-500/20"
                        />
                      </td>

                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            void openDepartmentDrawer("view", department)
                          }
                          className="flex items-center gap-3 text-left group"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                            <Building2 size={19} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                              {department.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-[#C5D0DE]">
                              {department.description || "No description"}
                            </span>
                          </span>
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <EmployeeProfilePhoto
                            employeeId={department.manager_id || null}
                            name={managerName(department)}
                            className="size-8 rounded-xl border border-slate-700 bg-[#202D40]"
                            textClassName="text-xs font-bold text-[#E8EEF5]"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#F8FAFC]">
                              {managerName(department)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[#C5D0DE]">
                              {department.manager_employee_code || "Reporting owner"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm font-bold text-white">
                        {numberLabel(allCount)}
                      </td>

                      <td className="px-4 py-4 text-sm font-bold text-white">
                        {numberLabel(activeCount)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                            department.status,
                          )}`}
                        >
                          {statusLabel(department.status)}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            title="View department"
                            aria-label={`View ${department.name}`}
                            onClick={() =>
                              void openDepartmentDrawer("view", department)
                            }
                            className="rounded-xl border border-[#344357] bg-[#151C28] p-2 text-[#C5D0DE] transition hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-blue-400 shadow-xs"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            title="Edit department"
                            aria-label={`Edit ${department.name}`}
                            onClick={() =>
                              void openDepartmentDrawer("edit", department)
                            }
                            className="rounded-xl border border-[#344357] bg-[#151C28] p-2 text-[#C5D0DE] transition hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-blue-400 shadow-xs"
                          >
                            <Pencil size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {departments.map((department) => (
              <article
                key={department.id}
                className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl transition-all hover:border-[#3A4A60]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                      <Building2 size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-white">
                        {department.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-[#C5D0DE]">
                        {department.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(department.id)}
                    onChange={() => toggleSelection(department.id)}
                    aria-label={`Select ${department.name}`}
                    className="rounded border-[#3A4A60] bg-[#111827] text-blue-500 focus:ring-blue-500/20"
                  />
                </div>

                <div className="mt-4 rounded-xl border border-[#344357]/80 bg-[#192333] p-3.5 shadow-inner">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#C5D0DE]">
                    Department manager
                  </p>
                  <div className="mt-2 flex min-w-0 items-center gap-3">
                    <EmployeeProfilePhoto employeeId={department.manager_id || null} name={managerName(department)} className="size-9 rounded-xl border border-slate-700 bg-[#202D40]" textClassName="text-xs font-bold text-[#E8EEF5]" />
                    <p className="min-w-0 truncate text-sm font-semibold text-[#F8FAFC]">{managerName(department)}</p>
                  </div>
                  {department.manager_email && (
                    <p className="mt-0.5 break-all text-xs text-[#C5D0DE]">
                      {department.manager_email}
                    </p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#344357]/80 bg-[#192333] p-3 shadow-inner">
                    <p className="text-xs text-[#C5D0DE]">Total employees</p>
                    <p className="mt-1 text-lg font-black text-white">
                      {numberLabel(
                        department.total_employee_count ??
                          department.employee_count ??
                          0,
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#344357]/80 bg-[#192333] p-3 shadow-inner">
                    <p className="text-xs text-[#C5D0DE]">Active employees</p>
                    <p className="mt-1 text-lg font-black text-white">
                      {numberLabel(
                        department.active_employee_count ??
                          department.employee_count ??
                          0,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#344357]/80 pt-4">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                      department.status,
                    )}`}
                  >
                    {statusLabel(department.status)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void openDepartmentDrawer("view", department)
                      }
                      className="rounded-xl border border-[#344357] bg-[#192333] px-3.5 py-2 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] shadow-xs"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void openDepartmentDrawer("edit", department)
                      }
                      className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-3.5 py-2 text-xs font-semibold text-blue-400 transition hover:bg-blue-500/20 shadow-xs"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 border-t border-[#344357]/80 bg-[#151C28]/40 px-6 py-4 text-xs text-[#C5D0DE] sm:flex-row sm:items-center">
          <span>
            Showing {departments.length} of {total.toLocaleString()} department(s)
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex items-center gap-1 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
            >
              <ChevronLeft size={14} />
              Previous
            </button>

            <span className="px-2 text-[#C5D0DE] font-medium">
              Page {page} of {Math.max(totalPages, 1)}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() =>
                setPage((current) =>
                  Math.min(Math.max(totalPages, 1), current + 1),
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {drawerMode && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close department drawer"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label={
              drawerMode === "create"
                ? "Create department"
                : drawerMode === "edit"
                  ? "Edit department"
                  : "Department details"
            }
            className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col border-l border-[#344357] bg-[#192333] text-[#F8FAFC] shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#344357]/80 px-6 py-5 bg-[#151C28]/60 sm:px-8">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                  <Building2 size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                    People management
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-white tracking-tight">
                    {drawerMode === "create"
                      ? "Create department"
                      : drawerMode === "edit"
                        ? "Edit department"
                        : selectedDepartment?.name || "Department details"}
                  </h2>
                  <p className="mt-1 text-xs text-[#C5D0DE]">
                    {drawerMode === "create"
                      ? "Create an organization department and optionally assign a Department Manager."
                      : selectedDepartment
                        ? `${managerName(selectedDepartment)} · ${statusLabel(selectedDepartment.status)}`
                        : "Loading department details…"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close drawer"
                disabled={saving}
                onClick={closeDrawer}
                className="rounded-xl p-2 text-[#C5D0DE] transition hover:bg-[#202D40] hover:text-white disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {drawerError && (
                <div
                  role="alert"
                  className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
                >
                  <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-400" />
                  <span className="text-rose-200/90">{drawerError}</span>
                </div>
              )}

              {drawerLoading ? (
                <div className="flex items-center gap-3 py-12 text-sm text-[#C5D0DE]">
                  <RefreshCw size={17} className="animate-spin text-blue-400" />
                  Loading department details…
                </div>
              ) : drawerMode === "view" && selectedDepartment ? (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#C5D0DE]">
                          Department status
                        </p>
                        <div className="mt-2.5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
                              selectedDepartment.status,
                            )}`}
                          >
                            {statusLabel(selectedDepartment.status)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            void openDepartmentDrawer("edit", selectedDepartment)
                          }
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-white shadow-xs"
                        >
                          <Pencil size={14} className="text-[#C5D0DE]" />
                          Edit department
                        </button>

                        <button
                          type="button"
                          disabled={changingStatus}
                          onClick={() =>
                            setStatusConfirmation({
                              department: selectedDepartment,
                              target:
                                normalizeStatus(selectedDepartment.status) === "ACTIVE"
                                  ? "INACTIVE"
                                  : "ACTIVE",
                            })
                          }
                          className="h-10 rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50 shadow-xs"
                        >
                          {normalizeStatus(selectedDepartment.status) === "ACTIVE"
                            ? "Deactivate"
                            : "Activate"}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                    <h3 className="text-sm font-bold text-white">
                      Department information
                    </h3>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#344357]/80 bg-[#192333] p-4 shadow-inner">
                        <p className="text-xs font-medium text-[#C5D0DE]">
                          Department name
                        </p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {selectedDepartment.name}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#344357]/80 bg-[#192333] p-4 shadow-inner">
                        <p className="text-xs font-medium text-[#C5D0DE]">
                          Department ID
                        </p>
                        <p className="mt-2 break-all font-mono text-xs text-[#E8EEF5]">
                          {selectedDepartment.id}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#344357]/80 bg-[#192333] p-4 shadow-inner sm:col-span-2">
                        <p className="text-xs font-medium text-[#C5D0DE]">
                          Description
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#E8EEF5]">
                          {selectedDepartment.description || "No description provided."}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                    <h3 className="text-sm font-bold text-white">
                      Department manager
                    </h3>
                    <div className="mt-4 rounded-xl border border-[#344357]/80 bg-[#192333] p-4 shadow-inner">
                      <div className="flex items-center gap-3.5">
                        <EmployeeProfilePhoto employeeId={selectedDepartment.manager_id || null} name={managerName(selectedDepartment)} className="size-11 rounded-xl border border-blue-500/20 bg-blue-500/10" textClassName="text-sm font-bold text-blue-300" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {managerName(selectedDepartment)}
                          </p>
                          <p className="mt-0.5 text-xs text-[#C5D0DE]">
                            {selectedDepartment.manager_employee_code || "No manager code"}
                          </p>
                          {selectedDepartment.manager_email && (
                            <p className="mt-0.5 break-all text-xs text-[#C5D0DE]">
                              {selectedDepartment.manager_email}
                            </p>
                          )}
                        </div>
                      </div>
                      {selectedDepartment.manager_id && (
                        <Link
                          href={`/hr/employees`}
                          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Open employee directory
                          <ChevronRight size={14} />
                        </Link>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Workforce
                        </h3>
                      </div>
                      <span className="text-xs text-[#C5D0DE] font-medium">
                        {numberLabel(selectedDepartment.total_employee_count ??
                          selectedDepartment.employee_count ??
                          selectedDepartment.employees?.length ??
                          0)}{" "}
                        total
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {[
                        {
                          label: "Active",
                          value: selectedDepartment.active_employee_count,
                        },
                        {
                          label: "Inactive",
                          value: selectedDepartment.inactive_employee_count,
                        },
                        {
                          label: "Former",
                          value: selectedDepartment.former_employee_count,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-[#344357]/80 bg-[#192333] p-3.5 shadow-inner"
                        >
                          <p className="text-xs text-[#C5D0DE]">
                            {item.label}
                          </p>
                          <p className="mt-1 text-lg font-black text-white">
                            {numberLabel(item.value)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {!selectedDepartment.employees?.length ? (
                      <p className="mt-4 rounded-xl border border-[#344357] bg-[#192333] p-4 text-sm text-[#C5D0DE]">
                        No employee list was returned for this department.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {selectedDepartment.employees.map((employee) => (
                          <div
                            key={employee.id}
                            className="flex items-center gap-3.5 rounded-xl border border-[#344357] bg-[#192333] p-3.5"
                          >
                            <EmployeeProfilePhoto
                              employeeId={employee.id}
                              name={`${employee.first_name} ${employee.last_name ?? ""}`.trim() || employee.employee_code}
                              className="size-9 rounded-xl border border-blue-500/20 bg-blue-500/10"
                              textClassName="text-xs font-bold text-blue-300"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">
                                {employeeName(employee)}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-[#C5D0DE]">
                                {employee.employee_code}
                                {employee.designation
                                  ? ` · ${employee.designation}`
                                  : ""}
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                                employee.employment_status,
                              )}`}
                            >
                              {statusLabel(employee.employment_status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <form
                  id="hr-department-form"
                  onSubmit={(event) => void saveDepartment(event)}
                  className="space-y-6"
                >
                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                    <h3 className="text-sm font-bold text-white">
                      Department details
                    </h3>

                    <div className="mt-5 space-y-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                          Department name *
                        </span>
                        <input
                          required
                          minLength={2}
                          maxLength={100}
                          value={form.name}
                          onChange={(event) =>
                            updateField("name", event.target.value)
                          }
                          aria-invalid={
                            submitAttempted &&
                            (form.name.trim().length < 2 ||
                              form.name.trim().length > 100)
                          }
                          placeholder="e.g. Human Resources"
                          className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner"
                        />
                      </label>

                      {drawerMode === "create" && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                            Description
                          </span>
                          <textarea
                            maxLength={1000}
                            rows={4}
                            value={form.description}
                            onChange={(event) =>
                              updateField("description", event.target.value)
                            }
                            placeholder="Describe the department's responsibilities…"
                            className="w-full resize-y rounded-xl border border-[#344357] bg-[#192333] p-3.5 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner"
                          />
                          <span className="mt-1.5 block text-right text-[11px] text-[#9AA8BA]">
                            {form.description.length}/1000
                          </span>
                        </label>
                      )}

                      {drawerMode === "edit" && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                            Department status
                          </span>
                          <select
                            value={form.status}
                            onChange={(event) =>
                              updateField(
                                "status",
                                event.target.value as DepartmentStatus,
                              )
                            }
                            className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                          </select>
                          <p className="mt-2 text-xs leading-relaxed text-[#C5D0DE]">
                            Deactivating a department may change the status of active employees assigned to it. The backend validates and performs any related updates.
                          </p>
                        </label>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                    <h3 className="text-sm font-bold text-white">
                      Department manager
                    </h3>

                    <label className="mt-4 block">
                      <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                        Assigned manager
                      </span>
                      <select
                        value={form.manager_id}
                        onChange={(event) =>
                          updateField("manager_id", event.target.value)
                        }
                        className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">No department manager</option>
                        {eligibleManagers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {candidateName(manager)}
                            {manager.employee_code
                              ? ` · ${manager.employee_code}`
                              : ""}
                            {manager.designation
                              ? ` · ${manager.designation}`
                              : ""}
                          </option>
                        ))}
                        {selectedDepartment?.manager_id &&
                          form.manager_id === selectedDepartment.manager_id &&
                          !eligibleManagers.some(
                            (manager) => manager.id === form.manager_id,
                          ) && (
                            <option value={form.manager_id}>
                              {managerName(selectedDepartment)} · current assignment
                            </option>
                          )}
                      </select>
                    </label>

                    {managerCandidatesError && (
                      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-300">
                        {managerCandidatesError}
                        <button
                          type="button"
                          onClick={() => void loadManagerCandidates()}
                          className="ml-2 font-semibold underline text-amber-200"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {drawerMode === "create" &&
                      !eligibleManagers.length &&
                      !managerCandidatesError && (
                        <p className="mt-4 rounded-xl border border-[#344357] bg-[#192333] p-4 text-xs leading-relaxed text-[#C5D0DE]">
                          No eligible Department Manager options were returned. You can create the department without assigning a manager and assign one later.
                        </p>
                      )}
                  </section>
                </form>
              )}
            </div>

            {(drawerMode === "create" || drawerMode === "edit") && (
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#344357]/80 bg-[#151C28]/80 px-6 py-4 sm:px-8 shadow-2xl">
                <p className="text-xs text-[#C5D0DE]">
                  Required fields are marked with *.
                </p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={closeDrawer}
                    className="rounded-xl border border-[#344357] bg-[#151C28] px-4 py-2.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50 shadow-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="hr-department-form"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving && (
                      <RefreshCw size={15} className="animate-spin text-white" />
                    )}
                    {saving
                      ? "Saving…"
                      : drawerMode === "create"
                        ? "Create department"
                        : "Save changes"}
                  </button>
                </div>
              </footer>
            )}
          </aside>
        </div>
      )}

      {statusConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-status-title"
            className="w-full max-w-md rounded-2xl border border-[#344357] bg-[#192333] p-6 shadow-2xl text-[#F8FAFC]"
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
              <CircleAlert size={22} />
            </div>

            <h2
              id="department-status-title"
              className="mt-5 text-lg font-bold text-white tracking-tight"
            >
              Confirm department status
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-[#E8EEF5]">
              Change <strong className="text-white">{statusConfirmation.department.name}</strong> to{" "}
              <strong className="text-white">{statusLabel(statusConfirmation.target)}</strong>?
            </p>

            {statusConfirmation.target === "INACTIVE" && (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-300">
                The backend may also mark active employees assigned to this department inactive.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={changingStatus}
                onClick={() => setStatusConfirmation(null)}
                className="rounded-xl border border-[#344357] bg-[#151C28] px-4 py-2.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={changingStatus}
                onClick={async () => {
                  await toggleDepartmentStatus(statusConfirmation.department);
                  setStatusConfirmation(null);
                }}
                className="rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 disabled:opacity-50"
              >
                {changingStatus ? "Updating…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
      </div>
    </HRManagerShell>
  );
}