"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";

import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

import { HRManagerDrawerTheme } from "../../components/hr/HRManagerDrawerTheme";
import { formatCountryWithFlag } from "../../components/workforce/CountryPhoneFields";
import { WorkforceContactDetails } from "../../components/workforce/WorkforceContactDetails";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

type EmploymentStatus = "ACTIVE" | "INACTIVE" | "FORMER";
type StatusFilter = "ALL" | EmploymentStatus;

type SortBy =
  | "created_at"
  | "employee_code"
  | "name"
  | "department"
  | "designation"
  | "workforce_role"
  | "employment_status"
  | "joining_date";

type Department = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  total_employee_count?: number;
  active_employee_count?: number;
  employee_count?: number;
};


type Employee = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_status: EmploymentStatus;
  department_id: string | null;
  department_name: string | null;
  manager_id?: string | null;
  manager_name: string | null;
  manager_email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  workforce_role?: string | null;
  is_primary_hr_manager?: boolean;
  created_at?: string;
  updated_at?: string;
};

type HistoryEntry = {
  id: string;
  event_type: string;
  reason?: string | null;
  effective_at?: string | null;
  created_at: string;
  actor_display_name?: string | null;
  actor_role_label?: string | null;
};

type TeamCalendarEvent = {
  id: string;
  eventType: string;
  recordedAt: string;
  timeZone?: string | null;
  source?: string | null;
};

type TeamCalendarEntry = {
  employeeId: string;
  workDate: string;
  timeZone?: string | null;
  departmentName?: string | null;
  scheduleName?: string | null;
  expectedStart?: string | null;
  expectedEnd?: string | null;
  scheduledBreakMinutes?: number | null;
  firstClockIn?: string | null;
  lastClockOut?: string | null;
  eventCount: number;
  events: TeamCalendarEvent[];
};

type TeamCalendarResponse = {
  message?: string;
  workDate?: string;
  timeZone?: string;
  entries?: TeamCalendarEntry[];
  hasMore?: boolean;
};

type DrawerTab = "overview" | "attendance" | "schedule" | "history";

type Pagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasMore?: boolean;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
};

type ApiResponse<T> = {
  status?: string;
  message?: string;
  employee?: T;
  employees?: T[];
  departments?: T[];
  history?: HistoryEntry[];
  pagination?: Pagination;
};

type EmployeeSummary = {
  total: number;
  active: number;
  inactive: number;
  former: number;
  departments: number;
};

function dateOffset(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateOnlyValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimeInZone(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
}

function formatWorkDate(value: string, _timeZone?: string | null): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return value;
  }
}

const PAGE_SIZE = 10;

const SORT_OPTIONS: {
  label: string;
  value: SortBy;
}[] = [
  { label: "Name", value: "name" },
  { label: "Employee code", value: "employee_code" },
  { label: "Department", value: "department" },
  { label: "Job title", value: "designation" },
  { label: "Employment status", value: "employment_status" },
  { label: "Joining date", value: "joining_date" },
];

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function employeeName(employee: Employee): string {
  return (
    `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() ||
    employee.employee_code ||
    "Unnamed employee"
  );
}

function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "E"
  );
}

function numberLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat().format(value);
}

function statusLabel(value: string | null | undefined): string {
  switch ((value ?? "").toUpperCase()) {
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
  switch ((value ?? "").toUpperCase()) {
    case "ACTIVE":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "INACTIVE":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "FORMER":
      return "border-slate-700 bg-slate-800 text-slate-300";
    default:
      return "border-slate-700 bg-slate-800 text-slate-400";
  }
}

function roleLabel(value: string | null | undefined): string {
  switch ((value ?? "").toUpperCase()) {
    case "HR_MANAGER":
      return "HR Manager";
    case "DEPARTMENT_MANAGER":
      return "Department Manager";
    case "EMPLOYEE":
      return "Employee";
    default:
      return value || "Unknown";
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function fieldValue(value: string | null | undefined): string {
  return value?.trim() || "Not provided";
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Users;
  tone: "sky" | "emerald" | "amber" | "indigo";
}) {
  const toneClasses = {
    sky: "border-sky-500/20 bg-sky-500/[0.07] text-sky-300",
    emerald:
      "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300",
    amber:
      "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
    indigo:
      "border-indigo-500/20 bg-indigo-500/[0.07] text-indigo-300",
  };

  return (
    <section className="min-w-0 rounded-2xl border border-slate-800/90 bg-[#131a24] p-5 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-400">
            {title}
          </p>

          <p className="mt-3 text-3xl font-bold tracking-tight text-white">
            {value}
          </p>
        </div>

        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl border ${toneClasses[tone]}`}
        >
          <Icon size={20} />
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </section>
  );
}

function DetailField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Users;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800/80 bg-slate-900/45 p-3.5">
      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {Icon && <Icon size={13} />}
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-medium text-slate-200">
        {value}
      </p>
    </div>
  );
}

export default function DepartmentManagerTeamPage() {
  const auth = useDepartmentManagerSession();
  const user = auth.user;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  const [loading, setLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [employeeCalendarEntries, setEmployeeCalendarEntries] = useState<TeamCalendarEntry[]>([]);
  const [employeeCalendarError, setEmployeeCalendarError] = useState("");
  const [employeeCalendarErrorKey, setEmployeeCalendarErrorKey] = useState("");
  const [employeeCalendarLoadingKey, setEmployeeCalendarLoadingKey] = useState("");
  const [employeeCalendarLoadedKey, setEmployeeCalendarLoadedKey] = useState("");
  const [employeeCalendarDataKey, setEmployeeCalendarDataKey] = useState("");
  const [employeeCalendarHasMore, setEmployeeCalendarHasMore] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyLoadedFor, setHistoryLoadedFor] = useState("");

  const [pendingStatus, setPendingStatus] =
    useState<EmploymentStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const canChangeStatus = Boolean(
  user?.role === "DEPARTMENT_MANAGER" ||
    user?.permissions.includes("employee.status.change"),
);

  const canViewHistory = Boolean(
    user?.permissions.includes("employee.history.view"),
  );

  const activeFilters = Boolean(
    debouncedSearch ||
      statusFilter !== "ALL" ||
      departmentFilter !== "ALL",
  );

  const searchHasText = search.trim().length > 0;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, departmentFilter, sortBy, sortOrder]);

  const loadDepartments = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch(
        "/api/backend/departments?page=1&limit=100&includeInactive=true",
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

      if (!response.ok || !Array.isArray(data?.departments)) {
        throw new Error(
          data?.message || "Unable to load your assigned departments.",
        );
      }

      setDepartments(data.departments);
    } catch {
      // Keep the directory usable. Its own request will expose errors.
      setDepartments([]);
    }
  }, [user, auth.reload]);

  const loadSummary = useCallback(async () => {
    if (!user) return;

    setSummaryLoading(true);
    setSummaryError("");

    const options: RequestInit = {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    };

    try {
      const requests = [
        fetch(
          "/api/backend/employees?page=1&limit=1&sortBy=name&sortOrder=asc",
          options,
        ),
        fetch(
          "/api/backend/employees?page=1&limit=1&sortBy=name&sortOrder=asc&status=ACTIVE",
          options,
        ),
        fetch(
          "/api/backend/employees?page=1&limit=1&sortBy=name&sortOrder=asc&status=INACTIVE",
          options,
        ),
        fetch(
          "/api/backend/employees?page=1&limit=1&sortBy=name&sortOrder=asc&status=FORMER",
          options,
        ),
      ];

      const responses = await Promise.all(requests);
      const payloads = await Promise.all(
        responses.map((response) =>
          readJson<ApiResponse<Employee>>(response),
        ),
      );

      if (responses.some((response) => response.status === 401)) {
        await auth.reload();
        return;
      }

      const failedIndex = responses.findIndex(
        (response) => !response.ok,
      );

      if (failedIndex !== -1) {
        throw new Error(
          payloads[failedIndex]?.message ||
            "Unable to load team summary information.",
        );
      }

      setSummary({
        total: Number(payloads[0]?.pagination?.total ?? 0),
        active: Number(payloads[1]?.pagination?.total ?? 0),
        inactive: Number(payloads[2]?.pagination?.total ?? 0),
        former: Number(payloads[3]?.pagination?.total ?? 0),
        departments: departments.length,
      });
    } catch (caught) {
      setSummaryError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the team summary.",
      );
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [user, auth.reload, departments.length, refreshKey]);

  const loadDirectory = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setDirectoryError("");

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sortBy,
      sortOrder,
    });

    if (debouncedSearch) {
      params.set("q", debouncedSearch);
    }

    if (statusFilter !== "ALL") {
      params.set("status", statusFilter);
    }

    if (departmentFilter !== "ALL") {
      params.set("departmentId", departmentFilter);
    }

    try {
      const response = await fetch(
        `/api/backend/employees?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data = await readJson<ApiResponse<Employee>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok || !Array.isArray(data?.employees)) {
        throw new Error(
          data?.message || "Unable to load your team directory.",
        );
      }

      setEmployees(data.employees);
      setTotal(Number(data.pagination?.total ?? data.employees.length));
      setTotalPages(
        Math.max(1, Number(data.pagination?.totalPages ?? 1)),
      );
    } catch (caught) {
      setDirectoryError(
        caught instanceof Error
          ? caught.message
          : "Unable to load employee records.",
      );
      setEmployees([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    user,
    auth.reload,
    page,
    sortBy,
    sortOrder,
    debouncedSearch,
    statusFilter,
    departmentFilter,
    refreshKey,
  ]);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const departmentOptions = useMemo(
    () =>
      [...departments].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [departments],
  );

  const closeDrawer = useCallback(() => {
    if (savingStatus) return;

    setDrawerOpen(false);
    setSelectedEmployeeId("");
    setSelectedEmployee(null);
    setDetailError("");
    setDetailLoading(false);
    setDrawerTab("overview");
    setEmployeeCalendarEntries([]);
    setEmployeeCalendarError("");
    setEmployeeCalendarErrorKey("");
    setEmployeeCalendarLoadingKey("");
    setEmployeeCalendarLoadedKey("");
    setEmployeeCalendarDataKey("");
    setEmployeeCalendarHasMore(false);
    setHistory([]);
    setHistoryError("");
    setHistoryLoadedFor("");
    setPendingStatus(null);
    setActionError("");
    setActionSuccess("");
  }, [savingStatus]);

  useEffect(() => {
    if (!drawerOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [drawerOpen, closeDrawer]);

  const loadEmployeeDetails = useCallback(
    async (employeeId: string) => {
      if (!user || !employeeId) return;

      setDetailLoading(true);
      setDetailError("");
      setActionError("");
      setActionSuccess("");

      try {
        const response = await fetch(
          `/api/backend/employees/${encodeURIComponent(employeeId)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        const data = await readJson<ApiResponse<Employee>>(response);

        if (response.status === 401) {
          await auth.reload();
          return;
        }

        if (!response.ok || !data?.employee) {
          throw new Error(
            data?.message ||
              "Unable to load this employee's permitted details.",
          );
        }

        setSelectedEmployee(data.employee);
      } catch (caught) {
        setDetailError(
          caught instanceof Error
            ? caught.message
            : "Unable to load employee details.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [user, auth.reload],
  );

  const openEmployee = useCallback(
    async (employee: Employee) => {
      setSelectedEmployeeId(employee.id);
      setSelectedEmployee(null);
      setDrawerOpen(true);
      setDrawerTab("overview");
      setEmployeeCalendarEntries([]);
      setEmployeeCalendarError("");
      setEmployeeCalendarErrorKey("");
      setEmployeeCalendarLoadingKey("");
      setEmployeeCalendarLoadedKey("");
      setEmployeeCalendarDataKey("");
      setEmployeeCalendarHasMore(false);
      setHistory([]);
      setHistoryError("");
      setHistoryLoadedFor("");
      setPendingStatus(null);
      setActionError("");
      setActionSuccess("");

      await loadEmployeeDetails(employee.id);
    },
    [loadEmployeeDetails],
  );

  const loadHistory = useCallback(
    async (employeeId: string, force = false) => {
      if (!user || !canViewHistory || !employeeId) return;
      if (!force && historyLoadedFor === employeeId) return;

      setHistoryLoading(true);
      setHistoryError("");

      try {
        const response = await fetch(
          `/api/backend/employees/${encodeURIComponent(employeeId)}/history?limit=50&offset=0`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        const data = await readJson<ApiResponse<HistoryEntry>>(response);

        if (response.status === 401) {
          await auth.reload();
          return;
        }

        if (!response.ok || !Array.isArray(data?.history)) {
          throw new Error(
            data?.message ||
              "Unable to load permitted employee history.",
          );
        }

        setHistory(data.history);
        setHistoryLoadedFor(employeeId);
      } catch (caught) {
        setHistoryError(
          caught instanceof Error
            ? caught.message
            : "Unable to load employee history.",
        );
      } finally {
        setHistoryLoading(false);
      }
    },
    [user, canViewHistory, historyLoadedFor, auth.reload],
  );

  useEffect(() => {
    if (
      drawerOpen &&
      drawerTab === "history" &&
      selectedEmployeeId &&
      canViewHistory
    ) {
      void loadHistory(selectedEmployeeId);
    }
  }, [
    drawerOpen,
    drawerTab,
    selectedEmployeeId,
    canViewHistory,
    loadHistory,
  ]);

  const loadEmployeeCalendar = useCallback(
    async (employeeId: string, mode: "attendance" | "schedule", force = false) => {
      if (!user || !employeeId) return;
      const key = `${employeeId}:${mode}`;
      if (!force && employeeCalendarLoadedKey === key) return;
      setEmployeeCalendarLoadingKey(key);
      setEmployeeCalendarError("");
      setEmployeeCalendarErrorKey("");
      try {
        const summaryResponse = await fetch("/api/backend/department-manager/overview", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const summaryData = await readJson<{ workDate?: string; timeZone?: string; message?: string }>(summaryResponse);
        if (summaryResponse.status === 401) {
          await auth.reload();
          return;
        }
        if (!summaryResponse.ok || !summaryData?.workDate) {
          throw new Error(summaryData?.message || "Unable to establish the organization's current work date.");
        }
        const workDate = summaryData.workDate || dateOnlyValue(new Date());
        const fromDate = mode === "attendance" ? dateOffset(workDate, -6) : workDate;
        const toDate = mode === "attendance" ? workDate : dateOffset(workDate, 13);
        const calendarResponse = await fetch(
          `/api/backend/attendance/calendar?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
          { method: "GET", credentials: "same-origin", cache: "no-store" },
        );
        const calendarData = await readJson<TeamCalendarResponse>(calendarResponse);
        if (calendarResponse.status === 401) {
          await auth.reload();
          return;
        }
        if (!calendarResponse.ok || !Array.isArray(calendarData?.entries)) {
          throw new Error(calendarData?.message || "Unable to load permitted attendance and schedule records.");
        }
        setEmployeeCalendarEntries(calendarData.entries.filter((entry) => entry.employeeId === employeeId));
        setEmployeeCalendarHasMore(Boolean(calendarData.hasMore));
        setEmployeeCalendarErrorKey("");
        setEmployeeCalendarDataKey(key);
        setEmployeeCalendarLoadedKey(key);
      } catch (caught) {
        setEmployeeCalendarEntries([]);
        setEmployeeCalendarError(caught instanceof Error ? caught.message : "Unable to load this employee's calendar records.");
        setEmployeeCalendarErrorKey(key);
        setEmployeeCalendarDataKey(key);
      } finally {
        setEmployeeCalendarLoadingKey((current) => current === key ? "" : current);
      }
    },
    [user, employeeCalendarLoadedKey, auth.reload],
  );

  useEffect(() => {
    if (drawerOpen && selectedEmployeeId && (drawerTab === "attendance" || drawerTab === "schedule")) {
      void loadEmployeeCalendar(selectedEmployeeId, drawerTab);
    }
  }, [drawerOpen, selectedEmployeeId, drawerTab, loadEmployeeCalendar]);

  function toggleSort(field: SortBy) {
    if (field === sortBy) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }

    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
    setPage(1);
  }

  async function changeEmployeeStatus() {
    if (!user || !selectedEmployee || !pendingStatus || savingStatus) {
      return;
    }

    if (
      !canChangeStatus ||
      selectedEmployee.workforce_role !== "EMPLOYEE"
    ) {
      setActionError(
        "This action is not available for your current role or this employee.",
      );
      return;
    }

    setSavingStatus(true);
    setActionError("");
    setActionSuccess("");

    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(selectedEmployee.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employment_status: pendingStatus,
          }),
        },
      );

      const data = await readJson<ApiResponse<Employee>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to change the employee's status.",
        );
      }

      const verb = pendingStatus === "ACTIVE" ? "reactivated" : "deactivated";

      setActionSuccess(`Employee ${verb} successfully.`);
      setPendingStatus(null);

      setSelectedEmployee((current) =>
        current
          ? { ...current, employment_status: pendingStatus }
          : current,
      );

      await loadDirectory();
      await loadSummary();
      await loadEmployeeDetails(selectedEmployee.id);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Unable to change employee status.",
      );
    } finally {
      setSavingStatus(false);
    }
  }

  if (auth.checking) {
    return <DepartmentManagerLoading />;
  }

  if (!user) {
    return (
      <DepartmentManagerUnavailable
        message={
          auth.error ||
          "Your Department Manager session could not be verified."
        }
        onRetry={() => void auth.reload()}
      />
    );
  }

  const noAssignedDepartments =
    !summaryLoading &&
    !summaryError &&
    departments.length === 0;

  const hasNoEmployees =
    !loading &&
    !directoryError &&
    employees.length === 0;

  const canActOnSelectedEmployee = Boolean(
    canChangeStatus &&
      selectedEmployee?.workforce_role === "EMPLOYEE" &&
      (selectedEmployee.employment_status === "ACTIVE" ||
        selectedEmployee.employment_status === "INACTIVE"),
  );

  return (
    <DepartmentManagerShell
      user={user}
      title="My Team"
      description="Search, filter, and review employees across your assigned departments. Your accessible team scope is enforced by the existing backend."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      actions={
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading || summaryLoading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-[#151b24] px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loading || summaryLoading ? "animate-spin" : ""}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      <HRManagerDrawerTheme />

      {(auth.error || summaryError) && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] p-4"
        >
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0 text-rose-300"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rose-200">
              Team summary needs attention
            </p>
            <p className="mt-1 text-sm leading-5 text-rose-200/80">
              {summaryError || auth.error}
            </p>
          </div>
        </div>
      )}

      {noAssignedDepartments && (
        <section className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
              <Building2 size={19} />
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-100">
                No department assigned
              </h2>

              <p className="mt-1 text-sm leading-6 text-amber-100/75">
                Your account is active, but no departments are currently
                assigned to it. Ask your HR Manager or Organization Admin
                to assign your department. The directory will show your
                permitted employees once that assignment is saved.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          title="Team members"
          value={
            summaryLoading && !summary
              ? "…"
              : numberLabel(summary?.total)
          }
          description="Records within your assigned department scope"
          icon={Users}
          tone="sky"
        />

        <StatCard
          title="Active"
          value={
            summaryLoading && !summary
              ? "…"
              : numberLabel(summary?.active)
          }
          description="Employees currently marked active"
          icon={CheckCircle2}
          tone="emerald"
        />

        <StatCard
          title="Inactive"
          value={
            summaryLoading && !summary
              ? "…"
              : numberLabel(summary?.inactive)
          }
          description="Employees currently marked inactive"
          icon={Activity}
          tone="amber"
        />

        <StatCard
          title="Assigned departments"
          value={
            summaryLoading && !summary
              ? "…"
              : numberLabel(departments.length)
          }
          description="Departments assigned to your account"
          icon={Building2}
          tone="indigo"
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800/90 bg-[#131a24] shadow-lg shadow-black/10">
        <div className="border-b border-slate-800/80 px-5 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-white">
                Employee directory
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {loading
                  ? "Loading employees…"
                  : `${numberLabel(total)} matching record${total === 1 ? "" : "s"}`}
                {activeFilters ? " · Filters applied" : ""}
              </p>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
              <ShieldCheck size={14} className="text-sky-300" />
              Assigned-team scope
            </span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(240px,1.5fr)_minmax(150px,0.7fr)_minmax(190px,0.9fr)_minmax(165px,0.7fr)_auto]">
            <label className="relative block min-w-0">
              <span className="sr-only">Search team members</span>
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, code, email…"
                maxLength={100}
                className="h-11 w-full rounded-xl border border-slate-800 bg-[#0e141c] pl-10 pr-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10"
              />
            </label>

            <label className="block min-w-0">
              <span className="sr-only">Filter by employment status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                className="h-11 w-full rounded-xl border border-slate-800 bg-[#0e141c] px-3 text-sm text-slate-300 outline-none transition focus:border-sky-500/50"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="FORMER">Former</option>
              </select>
            </label>

            <label className="block min-w-0">
              <span className="sr-only">Filter by assigned department</span>
              <select
                value={departmentFilter}
                onChange={(event) => {
                  setDepartmentFilter(event.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-800 bg-[#0e141c] px-3 text-sm text-slate-300 outline-none transition focus:border-sky-500/50"
              >
                <option value="ALL">All my departments</option>
                {departmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0">
              <span className="sr-only">Sort employees by</span>
              <select
                value={sortBy}
                onChange={(event) =>
                  toggleSort(event.target.value as SortBy)
                }
                className="h-11 w-full rounded-xl border border-slate-800 bg-[#0e141c] px-3 text-sm text-slate-300 outline-none transition focus:border-sky-500/50"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort: {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!searchHasText && !activeFilters}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 px-3 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <X size={14} />
              Clear
            </button>
          </div>
        </div>

        {directoryError && (
          <div
            role="alert"
            className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4 sm:mx-6"
          >
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-rose-300"
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rose-200">
                Directory request failed
              </p>
              <p className="mt-1 text-sm leading-5 text-rose-200/80">
                {directoryError}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              className="shrink-0 rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/10"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div
            className="space-y-3 p-5 sm:p-6"
            aria-label="Loading employees"
          >
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-800/60 p-3.5"
              >
                <div className="size-10 rounded-xl bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-slate-800" />
                  <div className="h-2.5 w-56 max-w-full rounded bg-slate-800/70" />
                </div>
              </div>
            ))}
          </div>
        ) : hasNoEmployees ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 text-slate-500">
              {noAssignedDepartments ? (
                <Building2 size={21} />
              ) : (
                <Users size={21} />
              )}
            </div>

            <h3 className="mt-4 text-sm font-semibold text-slate-200">
              {noAssignedDepartments
                ? "Your assigned team is not configured yet"
                : activeFilters
                  ? "No employees match these filters"
                  : "No team members to show"}
            </h3>

            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
              {noAssignedDepartments
                ? "Ask your HR Manager or Organization Admin to assign the appropriate department."
                : activeFilters
                  ? "Try a different search, status, or department, or clear your filters."
                  : "Employee records belonging to your assigned departments will appear here."}
            </p>

            {activeFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-black/10 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold sm:px-6">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="inline-flex items-center gap-2 hover:text-slate-200"
                    >
                      Employee
                      <ArrowDownUp size={12} />
                    </button>
                  </th>

                  <th className="px-4 py-3.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("department")}
                      className="inline-flex items-center gap-2 hover:text-slate-200"
                    >
                      Department
                      <ArrowDownUp size={12} />
                    </button>
                  </th>

                  <th className="px-4 py-3.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("designation")}
                      className="inline-flex items-center gap-2 hover:text-slate-200"
                    >
                      Job title
                      <ArrowDownUp size={12} />
                    </button>
                  </th>

                  <th className="px-4 py-3.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("employment_status")}
                      className="inline-flex items-center gap-2 hover:text-slate-200"
                    >
                      Status
                      <ArrowDownUp size={12} />
                    </button>
                  </th>

                  <th className="px-5 py-3.5 font-semibold sm:px-6">
                    <button
                      type="button"
                      onClick={() => toggleSort("joining_date")}
                      className="inline-flex items-center gap-2 hover:text-slate-200"
                    >
                      Joined
                      <ArrowDownUp size={12} />
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/70">
                {employees.map((employee) => {
                  const name = employeeName(employee);

                  return (
                    <tr
                      key={employee.id}
                      className="transition hover:bg-white/[0.025]"
                    >
                      <td className="px-5 py-3.5 sm:px-6">
                        <button
                          type="button"
                          onClick={() => void openEmployee(employee)}
                          className="group flex min-w-0 items-center gap-3 text-left"
                        >
                          <EmployeeProfilePhoto
                            employeeId={employee.id === auth.user?.employeeId ? undefined : employee.id}
                            name={name}
                            className="size-10 rounded-xl border border-slate-700 bg-slate-800/80 text-[11px] transition group-hover:border-sky-500/30"
                            textClassName="text-[11px] font-bold text-slate-300"
                          />

                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-200 group-hover:text-sky-200">
                              {name}
                            </span>
                            <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">
                              {employee.employee_code}
                            </span>
                          </span>
                        </button>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {employee.department_name || "—"}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {employee.designation || "—"}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClasses(
                            employee.employment_status,
                          )}`}
                        >
                          {statusLabel(employee.employment_status)}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-xs text-slate-500 sm:px-6">
                        {formatDate(employee.joining_date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 border-t border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <p className="text-[11px] text-slate-500">
            {loading
              ? "Loading directory…"
              : `Showing ${
                  employees.length ? (page - 1) * PAGE_SIZE + 1 : 0
                }–${(page - 1) * PAGE_SIZE + employees.length} of ${numberLabel(total)}`}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || page <= 1}
              aria-label="Previous page"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-800 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft size={14} />
              Previous
            </button>

            <span className="min-w-[82px] text-center text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1),
                )
              }
              disabled={loading || page >= totalPages}
              aria-label="Next page"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-800 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {drawerOpen && (
        <div className="hrms-attendance-drawer-backdrop fixed inset-0 z-[80] flex justify-end bg-slate-950/40 backdrop-blur-md">
          <button
            type="button"
            aria-label="Close employee details"
            onClick={closeDrawer}
            className="absolute inset-0 cursor-default"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Employee details"
            className="relative z-[81] flex h-full w-full max-w-2xl flex-col border-l border-slate-700/70 bg-[#111821] text-slate-100 shadow-2xl shadow-black/60"
          >
            <header className="flex items-start gap-3 border-b border-slate-800/80 px-5 py-5 sm:px-7">
              {selectedEmployee ? (
                <EmployeeProfilePhoto
                  employeeId={selectedEmployee.id === auth.user?.employeeId ? undefined : selectedEmployee.id}
                  name={employeeName(selectedEmployee)}
                  className="size-11 rounded-xl border border-sky-500/25 bg-sky-500/10"
                  textClassName="text-xs font-bold text-sky-200"
                />
              ) : (
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-200">
                  <UserRound size={19} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold tracking-tight text-white">
                  {selectedEmployee
                    ? employeeName(selectedEmployee)
                    : "Employee details"}
                </h2>

                <p className="mt-1 truncate text-xs text-slate-500">
                  {selectedEmployee?.employee_code || "Loading profile…"}
                </p>

                {selectedEmployee && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClasses(
                        selectedEmployee.employment_status,
                      )}`}
                    >
                      {statusLabel(selectedEmployee.employment_status)}
                    </span>

                    <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[10px] font-medium text-slate-300">
                      {roleLabel(selectedEmployee.workforce_role)}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                disabled={savingStatus}
                aria-label="Close employee details drawer"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </header>

            {selectedEmployee && !detailLoading && !detailError && (
              <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800/80 px-5 pt-3 sm:px-7">
                <button
                  type="button"
                  onClick={() => setDrawerTab("overview")}
                  className={`rounded-t-lg border-b-2 px-3 py-3 text-xs font-semibold transition ${
                    drawerTab === "overview"
                      ? "border-sky-400 text-sky-300"
                      : "border-transparent text-slate-500 hover:text-slate-200"
                  }`}
                >
                  Overview
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerTab("attendance")}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-3 text-xs font-semibold transition ${drawerTab === "attendance" ? "border-sky-400 text-sky-300" : "border-transparent text-slate-500 hover:text-slate-200"}`}
                >
                  <Clock3 size={14} />
                  Attendance
                </button>

                <button
                  type="button"
                  onClick={() => setDrawerTab("schedule")}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-3 text-xs font-semibold transition ${drawerTab === "schedule" ? "border-sky-400 text-sky-300" : "border-transparent text-slate-500 hover:text-slate-200"}`}
                >
                  <CalendarRange size={14} />
                  Schedule
                </button>

                {canViewHistory && (
                  <button
                    type="button"
                    onClick={() => setDrawerTab("history")}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-3 text-xs font-semibold transition ${
                      drawerTab === "history"
                        ? "border-sky-400 text-sky-300"
                        : "border-transparent text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    <History size={14} />
                    History
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {detailLoading ? (
                <div className="space-y-4" aria-label="Loading employee details">
                  <div className="h-20 animate-pulse rounded-2xl bg-slate-800/70" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 8 }, (_, index) => (
                      <div
                        key={index}
                        className="h-20 animate-pulse rounded-xl bg-slate-800/60"
                      />
                    ))}
                  </div>
                </div>
              ) : detailError ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-5"
                >
                  <AlertCircle
                    size={21}
                    className="text-rose-300"
                  />
                  <p className="mt-3 text-sm font-semibold text-rose-200">
                    Employee details unavailable
                  </p>
                  <p className="mt-2 text-sm leading-6 text-rose-200/80">
                    {detailError}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void loadEmployeeDetails(selectedEmployeeId)
                    }
                    className="mt-4 rounded-xl border border-rose-400/20 px-3.5 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/10"
                  >
                    Try again
                  </button>
                </div>
              ) : selectedEmployee && drawerTab === "overview" ? (
                <div className="space-y-5">
                  <section className="rounded-2xl border border-slate-800/90 bg-[#131a24] p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                        <UserRound size={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Employment overview
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Current profile information returned by your HRMS.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <DetailField
                        label="Employee code"
                        value={fieldValue(selectedEmployee.employee_code)}
                      />
                      <DetailField
                        label="Job title"
                        value={fieldValue(selectedEmployee.designation)}
                      />
                      <DetailField
                        label="Role"
                        value={roleLabel(selectedEmployee.workforce_role)}
                      />
                      <DetailField
                        label="Employment status"
                        value={statusLabel(selectedEmployee.employment_status)}
                      />
                      <DetailField
                        label="Department"
                        value={fieldValue(selectedEmployee.department_name)}
                        icon={Building2}
                      />
                      <DetailField
                        label="Reporting manager"
                        value={fieldValue(selectedEmployee.manager_name)}
                        icon={Users}
                      />
                      <DetailField
                        label="Joining date"
                        value={formatDate(selectedEmployee.joining_date)}
                        icon={CalendarDays}
                      />
                      <DetailField
                        label="Last updated"
                        value={formatDateTime(selectedEmployee.updated_at)}
                        icon={Clock3}
                      />
                    </div>
                  </section>

                  <WorkforceContactDetails
                    email={selectedEmployee.email}
                    phone={selectedEmployee.phone}
                    city={selectedEmployee.city}
                    country={selectedEmployee.country}
                    emergencyContactName={selectedEmployee.emergency_contact_name}
                    emergencyContactRelationship={selectedEmployee.emergency_contact_relationship}
                    emergencyContactPhone={selectedEmployee.emergency_contact_phone}
                    showEmergencyContact={
                      Object.prototype.hasOwnProperty.call(selectedEmployee, "emergency_contact_name") ||
                      Object.prototype.hasOwnProperty.call(selectedEmployee, "emergency_contact_relationship") ||
                      Object.prototype.hasOwnProperty.call(selectedEmployee, "emergency_contact_phone")
                    }
                  />

                  {canActOnSelectedEmployee && (
                    <section className="rounded-2xl border border-slate-800/90 bg-[#131a24] p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                          <ShieldCheck size={18} />
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-100">
                            Employee status
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            This action is shown only when your current session has the status-change permission. The backend rechecks authorization and assigned-department scope on submission.
                          </p>
                        </div>
                      </div>

                      {!pendingStatus ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingStatus(
                              selectedEmployee.employment_status === "ACTIVE"
                                ? "INACTIVE"
                                : "ACTIVE",
                            )
                          }
                          className={`mt-4 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                            selectedEmployee.employment_status === "ACTIVE"
                              ? "border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                          }`}
                        >
                          {selectedEmployee.employment_status === "ACTIVE"
                            ? "Deactivate employee"
                            : "Reactivate employee"}
                        </button>
                      ) : (
                        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                          <p className="text-sm font-semibold text-slate-200">
                            {pendingStatus === "ACTIVE"
                              ? "Reactivate this employee?"
                              : "Deactivate this employee?"}
                          </p>

                          <p className="mt-2 text-xs leading-5 text-slate-400">
                            {pendingStatus === "ACTIVE"
                              ? "The employee account and employment state will be handled by the existing backend workflow."
                              : "The employee's current employment state will be changed. The record will not be deleted."}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void changeEmployeeStatus()}
                              disabled={savingStatus}
                              className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingStatus
                                ? "Saving…"
                                : "Confirm change"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setPendingStatus(null)}
                              disabled={savingStatus}
                              className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {actionSuccess && (
                    <div
                      role="status"
                      className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 text-sm text-emerald-200"
                    >
                      {actionSuccess}
                    </div>
                  )}

                  {actionError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4 text-sm leading-5 text-rose-200"
                    >
                      {actionError}
                    </div>
                  )}
                </div>
              ) : selectedEmployee && (drawerTab === "attendance" || drawerTab === "schedule") ? (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-slate-800/90 bg-[#131a24] p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                        {drawerTab === "attendance" ? <Clock3 size={18} /> : <CalendarRange size={18} />}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-100">{drawerTab === "attendance" ? "Recent attendance" : "Upcoming schedule"}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{drawerTab === "attendance" ? "The last seven organization-local work dates, using recorded calendar events." : "The next fourteen organization-local dates with assigned shifts, where returned calendar records exist."}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href="/dm/attendance" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.04]"><Clock3 size={13} />Open attendance workspace</Link>
                      <Link href="/dm/schedule" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.04]"><CalendarRange size={13} />Open team schedule</Link>
                    </div>
                  </div>
                  {employeeCalendarLoadingKey === `${selectedEmployee.id}:${drawerTab}` ? (
                    <div className="space-y-3" aria-label="Loading employee calendar records">{[1, 2, 3].map((index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-800/60" />)}</div>
                  ) : employeeCalendarDataKey === `${selectedEmployee.id}:${drawerTab}` && employeeCalendarErrorKey === `${selectedEmployee.id}:${drawerTab}` && employeeCalendarError ? (
                    <div role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4"><p className="text-sm leading-6 text-rose-200">{employeeCalendarError}</p><button type="button" onClick={() => void loadEmployeeCalendar(selectedEmployee.id, drawerTab, true)} className="mt-3 rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/10">Try again</button></div>
                  ) : employeeCalendarDataKey !== `${selectedEmployee.id}:${drawerTab}` ? (
                    <div className="rounded-xl border border-slate-800 bg-[#131a24] p-5 text-sm text-slate-400">Preparing {drawerTab === "attendance" ? "attendance history" : "schedule"}…</div>
                  ) : employeeCalendarEntries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-[#131a24] px-5 py-10 text-center"><CalendarDays size={23} className="mx-auto text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-300">No calendar records returned</p><p className="mt-1 text-xs leading-5 text-slate-500">This calendar endpoint returns dates with a schedule or attendance event. No record does not prove absence or that the employee has no schedule.</p></div>
                  ) : (
                    <div className="space-y-3">
                      {employeeCalendarEntries.filter((entry) => drawerTab === "attendance" ? entry.eventCount > 0 : Boolean(entry.expectedStart && entry.scheduleName)).sort((a, b) => a.workDate.localeCompare(b.workDate)).map((entry) => (
                        <article key={`${entry.employeeId}-${entry.workDate}`} className="rounded-xl border border-slate-800/90 bg-[#131a24] p-4">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-100">{formatWorkDate(entry.workDate, entry.timeZone)}</p><p className="mt-1 text-xs text-slate-500">{entry.scheduleName || "No schedule attached to this record"}</p></div><div className="flex flex-wrap justify-end gap-1.5">{entry.eventCount > 0 && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">{entry.eventCount} event{entry.eventCount === 1 ? "" : "s"}</span>}</div></div>
                          {entry.expectedStart && <p className="mt-3 text-xs text-slate-400">Scheduled: {formatTimeInZone(entry.expectedStart, entry.timeZone)} – {formatTimeInZone(entry.expectedEnd, entry.timeZone)}{entry.scheduledBreakMinutes !== null && entry.scheduledBreakMinutes !== undefined ? ` · ${entry.scheduledBreakMinutes} min scheduled break` : ""}</p>}
                          {(entry.firstClockIn || entry.lastClockOut) && <p className="mt-1 text-xs text-slate-400">Recorded: {entry.firstClockIn ? `first clock-in ${formatTimeInZone(entry.firstClockIn, entry.timeZone)}` : "no clock-in returned"}{entry.lastClockOut ? ` · last clock-out ${formatTimeInZone(entry.lastClockOut, entry.timeZone)}` : ""}</p>}
                          {entry.events?.length > 0 && <div className="mt-3 space-y-1 border-t border-slate-800/70 pt-3">{[...entry.events].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-400">{event.eventType.replace(/_/g, " ")}</span><span className="tabular-nums text-slate-300">{formatTimeInZone(event.recordedAt, event.timeZone || entry.timeZone)}</span></div>)}</div>}
                        </article>
                      ))}
                      {employeeCalendarHasMore && <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs leading-5 text-amber-100">The calendar response was capped. Use the full attendance or schedule workspace to refine the date range.</p>}
                      {employeeCalendarEntries.filter((entry) => drawerTab === "attendance" ? entry.eventCount > 0 : Boolean(entry.expectedStart && entry.scheduleName)).length === 0 && <div className="rounded-xl border border-slate-800 bg-[#131a24] p-4 text-xs leading-5 text-slate-500">No {drawerTab === "attendance" ? "recorded attendance" : "scheduled shifts"} were returned for this employee in the selected period.</div>}
                    </div>
                  )}
                </section>
              ) : selectedEmployee && drawerTab === "history" ? (
                <section>
                  <div className="rounded-2xl border border-slate-800/90 bg-[#131a24] p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-white">
                      Employee history
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Events returned by the existing history endpoint. Snapshot values and sensitive fields are not rendered here.
                    </p>
                  </div>

                  {historyLoading ? (
                    <div className="mt-4 space-y-3">
                      {[1, 2, 3].map((item) => (
                        <div
                          key={item}
                          className="h-20 animate-pulse rounded-xl bg-slate-800/60"
                        />
                      ))}
                    </div>
                  ) : historyError ? (
                    <div
                      role="alert"
                      className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-4"
                    >
                      <p className="text-sm text-rose-200">
                        {historyError}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void loadHistory(selectedEmployee.id, true)
                        }
                        className="mt-3 rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/10"
                      >
                        Try again
                      </button>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-slate-800/90 bg-[#131a24] px-5 py-12 text-center">
                      <History
                        size={23}
                        className="mx-auto text-slate-600"
                      />
                      <p className="mt-3 text-sm font-semibold text-slate-300">
                        No history events returned
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        The history endpoint did not return any records for this employee.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {history.map((entry) => (
                        <article
                          key={entry.id}
                          className="rounded-xl border border-slate-800/90 bg-[#131a24] p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-sky-300">
                              <History size={16} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-semibold text-slate-200">
                                {entry.event_type.replace(/_/g, " ")}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTime(
                                  entry.effective_at || entry.created_at,
                                )}
                              </p>

                              <p className="mt-2 text-xs leading-5 text-slate-400">
                                Actor: {fieldValue(entry.actor_display_name)}
                                {entry.actor_role_label
                                  ? ` · ${entry.actor_role_label}`
                                  : ""}
                              </p>

                              {entry.reason && (
                                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-400">
                                  {entry.reason}
                                </p>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800/80 bg-[#0e151e]/95 px-5 py-4 sm:px-7">
              <p className="min-w-0 truncate text-[11px] text-slate-500">
                {selectedEmployee
                  ? `${selectedEmployee.department_name || "No department"} · ${selectedEmployee.employee_code}`
                  : "Employee profile"}
              </p>

              <button
                type="button"
                onClick={closeDrawer}
                disabled={savingStatus}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                Close
              </button>
            </footer>
          </aside>
        </div>
      )}
    </DepartmentManagerShell>
  );
}