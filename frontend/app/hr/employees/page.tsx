"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  History,
  Globe2,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { CountrySelect, formatCountryWithFlag, replacePhoneCountryCode, isCallingCodeOnly } from "../../components/workforce/CountryPhoneFields";
import { WorkforceContactDetails } from "../../components/workforce/WorkforceContactDetails";
import { WorkforceEmergencyContactFields } from "../../components/workforce/WorkforceEmergencyContactFields";
import { WorkforceCreationGuide } from "../../components/workforce/WorkforceCreationGuide";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
  useHRManagerAutoRefresh,
  type HRManagerUser,
} from "../../components/hr/HRManagerChrome";

type EmploymentStatus = "ACTIVE" | "INACTIVE" | "FORMER";
type WorkforceRole = "HR_MANAGER" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
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
type DrawerMode = "profile" | "create" | "edit" | null;
type ProfileTab = "overview" | "departments" | "invitations" | "history";

type ManagedDepartment = {
  id: string;
  name: string;
  status: string;
};

type Employee = {
  id: string;
  organization_id?: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  country: string | null;
  city: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_status: EmploymentStatus;
  department_id: string | null;
  department_name: string | null;
  manager_id?: string | null;
  manager_name: string | null;
  workforce_role?: WorkforceRole | null;
  is_primary_hr_manager?: boolean;
  invitation_id?: string | null;
  invitation_status?: string | null;
  invitation_expires_at?: string | null;
  has_pending_invitation?: boolean;
  managed_department_count?: number | null;
  managed_departments?: ManagedDepartment[];
  created_at?: string;
  updated_at?: string;
};

type Department = {
  id: string;
  name: string;
  status: string;
  manager_id?: string | null;
  manager_name?: string | null;
  manager_eligible?: boolean;
};

type ManagerCandidate = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  designation: string | null;
  workforce_role?: WorkforceRole;
  account_status?: string;
  is_primary_hr_manager?: boolean;
};

type Invitation = {
  id: string;
  employee_id: string;
  email: string;
  status: string;
  display_status?: string;
  expires_at?: string | null;
  created_at?: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  invited_by_email?: string | null;
  history?: Array<{
    id: string;
    event_type: string;
    reason?: string | null;
    created_at: string;
    effective_at?: string | null;
  }>;
};

type EmployeeHistoryEntry = {
  id: string;
  event_type: string;
  reason?: string | null;
  effective_at?: string | null;
  created_at: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  actor_display_name?: string | null;
  actor_role_label?: string | null;
};

type ApiResponse<T> = {
  status?: string;
  message?: string;
  employee?: T;
  employees?: T[];
  departments?: Department[];
  invitations?: Invitation[];
  history?: EmployeeHistoryEntry[];
  invitation?: {
    id: string;
    status: string;
    expires_at?: string;
  };
  invitationUrl?: string;
  emailSent?: boolean;
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasMore?: boolean;
  };
};

type EmployeeForm = {
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  phone: string;
  city: string;
  designation: string;
  joining_date: string;
  workforce_role: "EMPLOYEE" | "DEPARTMENT_MANAGER";
  department_id: string;
  manager_id: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
};

const PAGE_SIZE = 10;

const EMPTY_FORM: EmployeeForm = {
  employee_code: "",
  first_name: "",
  last_name: "",
  email: "",
  country: "",
  phone: "",
  city: "",
  designation: "",
  joining_date: "",
  workforce_role: "EMPLOYEE",
  department_id: "",
  manager_id: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
};

const EDITABLE_TEXT_FIELDS = [
  "employee_code",
  "first_name",
  "last_name",
  "email",
  "country",
  "phone",
  "city",
  "designation",
  "joining_date",
] as const;

type EditableTextField = (typeof EDITABLE_TEXT_FIELDS)[number];
type EmployeeFormField = keyof EmployeeForm;

const FIELD_LABELS: Record<EditableTextField, string> = {
  employee_code: "Employee code",
  first_name: "First name",
  last_name: "Last name",
  email: "Email address",
  phone: "Phone number",
  country: "Country",
  city: "City",
  designation: "Job title",
  joining_date: "Joining date",
};

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function fullName(employee: Employee): string {
  return (
    `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() ||
    employee.employee_code ||
    "Unnamed employee"
  );
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "EM";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function currentDateInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function roleLabel(role?: string | null): string {
  switch ((role ?? "").toUpperCase()) {
    case "HR_MANAGER":
      return "HR Manager";
    case "DEPARTMENT_MANAGER":
      return "Department Manager";
    case "EMPLOYEE":
      return "Employee";
    default:
      return "Not specified";
  }
}

function statusLabel(status?: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "Active";
    case "INACTIVE":
      return "Inactive";
    case "FORMER":
      return "Former";
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "EXPIRED":
      return "Expired";
    case "REVOKED":
      return "Revoked";
    case "NONE":
      return "No invitation";
    default:
      return status || "Unknown";
  }
}

function statusClass(status?: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
    case "ACCEPTED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "INACTIVE":
    case "PENDING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "EXPIRED":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "FORMER":
    case "REVOKED":
    case "NONE":
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
    default:
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
  }
}

function employeeToForm(employee: Employee): EmployeeForm {
  return {
    employee_code: employee.employee_code ?? "",
    first_name: employee.first_name ?? "",
    last_name: employee.last_name ?? "",
    email: employee.email ?? "",
    country: employee.country ?? "",
    phone: employee.phone ?? "",
    city: employee.city ?? "",
    designation: employee.designation ?? "",
    joining_date: dateInput(employee.joining_date),
    workforce_role:
      employee.workforce_role === "DEPARTMENT_MANAGER"
        ? "DEPARTMENT_MANAGER"
        : "EMPLOYEE",
    department_id: employee.department_id ?? "",
    manager_id: employee.manager_id ?? "",
    emergency_contact_name: employee.emergency_contact_name ?? "",
    emergency_contact_relationship:
      employee.emergency_contact_relationship ?? "",
    emergency_contact_phone: employee.emergency_contact_phone ?? "",
  };
}

function normalizedField(
  field: EditableTextField,
  value: string,
): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  switch (field) {
    case "employee_code":
      return trimmed.toUpperCase();
    case "email":
      return trimmed.toLowerCase();
    case "first_name":
    case "last_name":
    case "designation":
    case "country":
    case "city":
      return trimmed.replace(/\s+/g, " ");
    default:
      return trimmed;
  }
}

function hasPermission(
  user: HRManagerUser,
  permission: string,
): boolean {
  return user.permissions.includes(permission);
}

function DetailCard({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#344357]/80 bg-[#151C28] p-4 shadow-inner">
      <div className="flex items-center gap-2 text-xs font-medium text-[#C5D0DE]">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-white">
        {value || "Not provided"}
      </p>
    </div>
  );
}

function HRManagerEmployeesPageContent() {
  const auth = useHRManagerSession();
  const user = auth.user;
  const searchParams = useSearchParams();
  const deepLinkCreate = searchParams.get("create") === "1";
  const deepLinkEmployee = searchParams.get("employee") || "";
  const handledDeepLink = useRef("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Record<string, {
    firstClockIn: string | null;
    lastClockOut: string | null;
    eventCount: number;
    scheduleName: string | null;
    leaveRequest: { leaveType?: string | null; status?: string | null } | null;
    publicHoliday: { name?: string | null; isPaid?: boolean } | null;
    approvedOvertimeMinutes: number;
  }>>({});
  const [todayAttendanceLoading, setTodayAttendanceLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managerCandidates, setManagerCandidates] = useState<ManagerCandidate[]>([]);
  const [supportingError, setSupportingError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const directoryLoadedRef = useRef(false);
  const [directoryError, setDirectoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileTab, setProfileTab] = useState<ProfileTab>("overview");
  const [employeeScheduleInfo, setEmployeeScheduleInfo] = useState<Record<string, unknown> | null>(null);
  const [employeeRateInfo, setEmployeeRateInfo] = useState<Record<string, unknown> | null>(null);
  const [employeeWorkSettingsLoading, setEmployeeWorkSettingsLoading] = useState(false);
  const [employeeWorkSettingsError, setEmployeeWorkSettingsError] = useState("");

  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [baselineForm, setBaselineForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [touchedFields, setTouchedFields] = useState<Set<EmployeeFormField>>(() => new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [statusTarget, setStatusTarget] = useState<{
    employee: Employee;
    target: "ACTIVE" | "INACTIVE";
  } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const [profileInvitations, setProfileInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState("");
  const [historyEntries, setHistoryEntries] = useState<EmployeeHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [profileReloadKey, setProfileReloadKey] = useState(0);

  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [invitationError, setInvitationError] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [invitationEmailSent, setInvitationEmailSent] = useState(false);
  const [copiedInvitationLink, setCopiedInvitationLink] = useState(false);

  // Body scroll lock effect when drawer or modal is open
  useEffect(() => {
    const isModalOpen = Boolean(drawerMode || statusTarget || inviteEmployee);
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerMode, statusTarget, inviteEmployee]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTodayAttendance() {
      setTodayAttendanceLoading(true);
      try {
        const date = currentDateInputValue();
        const [response, overtimeResponse, leaveResponse, holidayResponse] = await Promise.all([
          fetch(`/api/backend/attendance/calendar?fromDate=${date}&toDate=${date}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal }),
          fetch("/api/backend/attendance/overtime", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).catch(() => null),
          fetch("/api/backend/leave/requests", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).catch(() => null),
          fetch("/api/backend/leave/holidays", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).catch(() => null),
        ]);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load today's attendance.");
        const [overtimePayload, leavePayload, holidayPayload] = await Promise.all([
          overtimeResponse ? overtimeResponse.json().catch(() => null) : null,
          leaveResponse ? leaveResponse.json().catch(() => null) : null,
          holidayResponse ? holidayResponse.json().catch(() => null) : null,
        ]);
        const approvedOvertime = new Map<string, number>();
        if (overtimeResponse?.ok && Array.isArray(overtimePayload?.requests)) {
          for (const request of overtimePayload.requests) {
            if (request?.status?.toUpperCase() !== "APPROVED" || String(request?.workDate ?? "").slice(0, 10) !== date || typeof request?.employeeId !== "string") continue;
            const minutes = Number(request.approvedMinutes ?? request.requestedMinutes ?? 0);
            if (Number.isFinite(minutes) && minutes > 0) approvedOvertime.set(request.employeeId, (approvedOvertime.get(request.employeeId) ?? 0) + minutes);
          }
        }
        const holiday = holidayResponse?.ok && Array.isArray(holidayPayload?.holidays)
          ? holidayPayload.holidays.find((item: { holidayDate?: string }) => item?.holidayDate === date) ?? null
          : null;
        const approvedLeaveByEmployee = new Map<string, { leaveType?: string | null; status?: string | null }>();
        if (leaveResponse?.ok && Array.isArray(leavePayload?.requests)) {
          for (const request of leavePayload.requests) {
            if (request?.status?.toUpperCase() === "APPROVED" && typeof request.employeeId === "string" && String(request.startDate) <= date && String(request.endDate) >= date && !approvedLeaveByEmployee.has(request.employeeId)) {
              approvedLeaveByEmployee.set(request.employeeId, { leaveType: request.leaveType ?? null, status: request.status });
            }
          }
        }
        const rows = Array.isArray(payload?.entries) ? payload.entries : [];
        const next: Record<string, {
          firstClockIn: string | null; lastClockOut: string | null; eventCount: number; scheduleName: string | null;
          leaveRequest: { leaveType?: string | null; status?: string | null } | null;
          publicHoliday: { name?: string | null; isPaid?: boolean } | null;
          approvedOvertimeMinutes: number;
        }> = {};
        for (const employee of employees) {
          next[employee.id] = {
            firstClockIn: null, lastClockOut: null, eventCount: 0, scheduleName: null,
            leaveRequest: approvedLeaveByEmployee.get(employee.id) ?? null,
            publicHoliday: holiday ? { name: holiday.name ?? null, isPaid: Boolean(holiday.isPaid) } : null,
            approvedOvertimeMinutes: approvedOvertime.get(employee.id) ?? 0,
          };
        }
        for (const row of rows) {
          if (typeof row?.employeeId !== "string") continue;
          next[row.employeeId] = {
            firstClockIn: typeof row.firstClockIn === "string" ? row.firstClockIn : null,
            lastClockOut: typeof row.lastClockOut === "string" ? row.lastClockOut : null,
            eventCount: Number.isFinite(Number(row.eventCount)) ? Number(row.eventCount) : 0,
            scheduleName: typeof row.scheduleName === "string" ? row.scheduleName : null,
            leaveRequest: row.leaveRequest && typeof row.leaveRequest === "object" ? { leaveType: row.leaveRequest.leaveType ?? null, status: row.leaveRequest.status ?? null } : next[row.employeeId]?.leaveRequest ?? null,
            publicHoliday: row.publicHoliday && typeof row.publicHoliday === "object" ? { name: row.publicHoliday.name ?? null, isPaid: Boolean(row.publicHoliday.isPaid) } : next[row.employeeId]?.publicHoliday ?? null,
            approvedOvertimeMinutes: Number(row.approvedOvertimeMinutes) > 0 ? Number(row.approvedOvertimeMinutes) : approvedOvertime.get(row.employeeId) ?? 0,
          };
        }
        for (const [employeeId, minutes] of approvedOvertime) {
          if (!next[employeeId]) next[employeeId] = { firstClockIn: null, lastClockOut: null, eventCount: 0, scheduleName: null, leaveRequest: approvedLeaveByEmployee.get(employeeId) ?? null, publicHoliday: holiday ? { name: holiday.name ?? null, isPaid: Boolean(holiday.isPaid) } : null, approvedOvertimeMinutes: minutes };
          else if (next[employeeId].approvedOvertimeMinutes === 0) next[employeeId].approvedOvertimeMinutes = minutes;
        }
        setTodayAttendance(next);
      } catch {
        if (!controller.signal.aborted) setTodayAttendance({});
      } finally {
        if (!controller.signal.aborted) setTodayAttendanceLoading(false);
      }
    }
    void loadTodayAttendance();
    return () => controller.abort();
  }, [reloadKey, employees]);

  const canCreate = user
    ? hasPermission(user, "employee.create")
    : false;

  const canEditProfile = user
    ? hasPermission(user, "employee.update")
    : false;

  const canChangeStatus = user
    ? canEditProfile &&
      hasPermission(user, "employee.status.change")
    : false;

  const canInvite = user
    ? hasPermission(user, "employee.create") &&
      hasPermission(user, "user.invite")
    : false;

  const canViewInvitations = user
    ? hasPermission(user, "invitation.view")
    : false;

  const canViewHistory = user
    ? hasPermission(user, "employee.history.view")
    : false;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, departmentFilter, sortBy, sortOrder]);

  const loadDirectory = useCallback(async () => {
    if (!user) return;

    if (!directoryLoadedRef.current) setLoading(true);
    setDirectoryError("");

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sortBy,
      sortOrder,
    });

    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    if (departmentFilter === "UNASSIGNED") {
      params.set("unassigned", "true");
    } else if (departmentFilter !== "ALL") {
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
          data?.message || "Unable to load the employee directory.",
        );
      }

      setEmployees(data.employees);
      setTotal(Number(data.pagination?.total ?? data.employees.length));
      setTotalPages(Number(data.pagination?.totalPages ?? 1));
      directoryLoadedRef.current = true;
    } catch (caught) {
      setDirectoryError(
        caught instanceof Error
          ? caught.message
          : "Unable to load employee records.",
      );
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
  ]);

  useEffect(() => {
    if (user) void loadDirectory();
  }, [user, loadDirectory, reloadKey]);

  const refreshEmployeesWorkspace = useCallback(async () => {
    setReloadKey((value) => value + 1);

    // Refresh the open read-only profile without interrupting an edit/create form.
    if (drawerMode === "profile" && selectedEmployeeId) {
      try {
        const response = await fetch(
          `/api/backend/employees/${encodeURIComponent(selectedEmployeeId)}`,
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

        if (response.ok && data?.employee) {
          setSelectedEmployee(data.employee);
          setProfileReloadKey((value) => value + 1);
        }
      } catch {
        // Keep the currently displayed profile if a background request fails.
      }
    }
  }, [drawerMode, selectedEmployeeId, auth.reload]);

  useHRManagerAutoRefresh(refreshEmployeesWorkspace, {
    enabled: Boolean(user),
    intervalMs: 60_000,
  });

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadSupportingLists() {
      setSupportingError("");

      try {
        const [departmentResponse, managerResponse] = await Promise.all([
          fetch("/api/backend/departments?includeInactive=true", {
            credentials: "same-origin",
            cache: "no-store",
          }),
          fetch("/api/backend/employees/managers?role=HR_MANAGER", {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ]);

        const [departmentData, managerData] = await Promise.all([
          readJson<ApiResponse<Department>>(departmentResponse),
          readJson<ApiResponse<ManagerCandidate>>(managerResponse),
        ]);

        if (
          departmentResponse.status === 401 ||
          managerResponse.status === 401
        ) {
          await auth.reload();
          return;
        }

        if (active && departmentResponse.ok) {
          setDepartments(
            Array.isArray(departmentData?.departments)
              ? departmentData.departments
              : [],
          );
        } else if (active && !departmentResponse.ok) {
          setSupportingError(
            departmentData?.message || "Department options are unavailable.",
          );
        }

        if (active && managerResponse.ok) {
          setManagerCandidates(
            Array.isArray(managerData?.employees)
              ? managerData.employees
              : [],
          );
        }
      } catch {
        if (active) {
          setSupportingError(
            "Department or manager options could not be loaded.",
          );
        }
      }
    }

    void loadSupportingLists();

    return () => {
      active = false;
    };
  }, [user, auth.reload, reloadKey]);

  const activeDepartments = useMemo(
    () =>
      departments.filter(
        (department) => department.status?.toUpperCase() === "ACTIVE",
      ),
    [departments],
  );

  const eligibleDepartmentOptions = useMemo(
    () =>
      activeDepartments.filter(
        (department) =>
          department.manager_eligible === true &&
          Boolean(department.manager_id),
      ),
    [activeDepartments],
  );

  const eligibleHRManagers = useMemo(
    () =>
      managerCandidates.filter(
        (manager) =>
          manager.workforce_role === "HR_MANAGER" &&
          manager.account_status === "ACTIVE",
      ),
    [managerCandidates],
  );

  const counts = useMemo(() => {
    return {
      active: employees.filter(
        (employee) => employee.employment_status === "ACTIVE",
      ).length,
      inactive: employees.filter(
        (employee) => employee.employment_status === "INACTIVE",
      ).length,
      former: employees.filter(
        (employee) => employee.employment_status === "FORMER",
      ).length,
    };
  }, [employees]);

  function toggleSort(field: SortBy) {
    if (field === sortBy) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortOrder(
      ["name", "employee_code", "department"].includes(field)
        ? "asc"
        : "desc",
    );
  }

  const openCreateDrawer = useCallback(() => {
    setDrawerMode("create");
    setSelectedEmployeeId(null);
    setSelectedEmployee(null);
    const createForm: EmployeeForm = { ...EMPTY_FORM, joining_date: currentDateInputValue() };
    setForm(createForm);
    setBaselineForm(createForm);
    setProfileError("");
    setProfileNotice("");
    setFormError("");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setProfileTab("overview");
  }, []);

  const openEmployeeProfile = useCallback(async (employeeId: string) => {
    setDrawerMode("profile");
    setSelectedEmployeeId(employeeId);
    setSelectedEmployee(null);
    setProfileLoading(true);
    setProfileError("");
    setProfileNotice("");
    setProfileTab("overview");
    setProfileInvitations([]);
    setHistoryEntries([]);
    setInvitationsError("");
    setHistoryError("");

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
          data?.message || "Unable to load this employee profile.",
        );
      }

      setSelectedEmployee(data.employee);
    } catch (caught) {
      setProfileError(
        caught instanceof Error
          ? caught.message
          : "Unable to load this employee profile.",
      );
    } finally {
      setProfileLoading(false);
    }
  }, [auth.reload]);

  useEffect(() => {
    if (!user) return;
    const key = `${deepLinkCreate ? "create" : ""}:${deepLinkEmployee}`;
    if (key === ":") {
      handledDeepLink.current = "";
      return;
    }
    if (handledDeepLink.current === key) return;
    handledDeepLink.current = key;
    if (deepLinkCreate) {
      openCreateDrawer();
    } else if (deepLinkEmployee) {
      void openEmployeeProfile(deepLinkEmployee);
    }
  }, [user?.id, deepLinkCreate, deepLinkEmployee, openCreateDrawer, openEmployeeProfile]);

  function closeDrawer() {
    if (saving || changingStatus || creatingInvitation) return;

    setDrawerMode(null);
    setSelectedEmployeeId(null);
    setSelectedEmployee(null);
    setProfileError("");
    setProfileNotice("");
    setFormError("");
    setStatusTarget(null);
    setProfileTab("overview");
  }

  function startEditing() {
    if (!selectedEmployee || !canEditProfile) return;

    const nextForm = employeeToForm(selectedEmployee);
    setForm({ ...nextForm });
    setBaselineForm({ ...nextForm });
    setFormError("");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setProfileError("");
    setDrawerMode("edit");
  }

  function updateField<K extends keyof EmployeeForm>(
    field: K,
    value: EmployeeForm[K],
  ) {
    setForm((current) => {
      if (field === "country") {
        const nextCountry = String(value);
        return {
          ...current,
          country: nextCountry,
          phone: replacePhoneCountryCode(current.phone, current.country, nextCountry),
        };
      }
      return { ...current, [field]: value };
    });
    setTouchedFields((current) => {
      const next = new Set(current).add(field as EmployeeFormField);
      if (field === "country") next.add("phone");
      return next;
    });
    setFormError("");
  }

  function getFieldError(field: EmployeeFormField): string | null {
    const value = String(form[field] ?? "").trim();
    switch (field) {
      case "employee_code":
        if (!value) return "Employee code is required.";
        if (value.length > 50 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) return "Use letters, numbers, hyphens or underscores; start with a letter or number.";
        return null;
      case "first_name":
        if (!value) return "First name is required.";
        if (value.length < 2 || value.length > 100 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value)) return "First name must be 2–100 characters and use letters, spaces, apostrophes, periods, or hyphens.";
        return null;
      case "last_name":
        if (drawerMode === "create" && !value) return "Last name is required.";
        if (value.length > 100) return "Last name must be 100 characters or fewer.";
        if (value && (value.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value))) return "Enter a valid last name using letters, spaces, apostrophes, periods, or hyphens.";
        return null;
      case "email":
        if (!value) return "Email is required for a workforce profile and invitation delivery.";
        if (value && (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return "Enter a valid email address.";
        return null;
      case "phone": {
        if (!value || isCallingCodeOnly(value, form.country)) {
          return drawerMode === "create" ? "A complete employee phone number is required." : null;
        }
        const digits = value.replace(/\D/g, "").length;
        if (value.length > 50 || digits < 7 || digits > 15 || !/^\+?[0-9][0-9\s().-]*$/.test(value)) return "Enter an international phone number with 7–15 digits.";
        return null;
      }
      case "country":
        if (!value) return "Country is required.";
        return value.length > 100 ? "Country must be 100 characters or fewer." : null;
      case "city":
        if (!value) return "City is required.";
        return value.length > 100 ? "City must be 100 characters or fewer." : null;
      case "designation":
        if (!value) return "Job title is required.";
        return value.length > 100 ? "Job title must be 100 characters or fewer." : null;
      case "joining_date":
        if (!value) return drawerMode === "create" ? "Joining date is required." : null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid calendar date.";
        { const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "Enter a real calendar date."; }
        return null;
      case "emergency_contact_name": {
        const hasAnyEmergencyField = Boolean(form.emergency_contact_name.trim() || form.emergency_contact_relationship.trim() || form.emergency_contact_phone.trim());
        if (value.length > 120) return "Contact name must be 120 characters or fewer.";
        if (drawerMode === "create" && !value) return "Emergency contact name is required.";
        if (value && (value.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value))) return "Enter a valid contact name using letters, spaces, apostrophes, periods, or hyphens.";
        if (hasAnyEmergencyField && !value) return "Enter the emergency contact name when adding emergency details.";
        return null;
      }
      case "emergency_contact_relationship": {
        if (value.length > 80) return "Relationship must be 80 characters or fewer.";
        if (drawerMode === "create" && !value) return "Emergency contact relationship is required.";
        if (value && (value.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value))) return "Enter a valid relationship, such as parent, spouse, or sibling.";
        return null;
      }
      case "emergency_contact_phone": {
        const hasAnyEmergencyField = Boolean(form.emergency_contact_name.trim() || form.emergency_contact_relationship.trim() || form.emergency_contact_phone.trim());
        const digits = value.replace(/\D/g, "").length;
        if (drawerMode === "create" && !value) return "Emergency contact phone is required.";
        if (hasAnyEmergencyField && !value) return "Enter the emergency contact phone when adding emergency details.";
        if (value && (value.length > 30 || !/^\+?[0-9][0-9\s().-]*$/.test(value) || digits < 7 || digits > 15)) return "Enter a valid emergency phone with 7–15 digits.";
        return null;
      }
      default:
        return null;
    }
  }

  function showFieldError(field: EmployeeFormField): boolean {
    return (submitAttempted || touchedFields.has(field)) && Boolean(getFieldError(field));
  }

  function selectedEligibleDepartment(
    departmentId: string,
  ): Department | null {
    return (
      eligibleDepartmentOptions.find(
        (department) => department.id === departmentId,
      ) ?? null
    );
  }

  function selectedHRManager(
    managerId: string,
  ): ManagerCandidate | null {
    return (
      eligibleHRManagers.find((manager) => manager.id === managerId) ??
      null
    );
  }

  function validateForm(isCreating: boolean): string | null {
    if (
      !form.employee_code.trim() ||
      !form.first_name.trim() ||
      (isCreating && !form.last_name.trim()) ||
      !form.country.trim() ||
      !form.city.trim() ||
      !form.designation.trim() ||
      (isCreating && !form.joining_date.trim())
    ) {
      return "Employee code, first and last name, country, city, job title, and joining date are required.";
    }

    if (
      form.employee_code.trim().length > 50 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(form.employee_code.trim())
    ) {
      return "Employee code must start with a letter or number and contain only letters, numbers, hyphens, or underscores.";
    }

    for (const nameField of ["first_name", "last_name"] as const) {
      const nameValue = form[nameField].trim();
      const nameError = getFieldError(nameField);
      if (nameError && (nameField === "first_name" || nameValue)) return nameError;
    }

    if (isCreating && !form.email.trim()) {
      return "A valid email address is required because new workforce profiles receive an invitation automatically.";
    }

    if (
      form.email.trim() &&
      (form.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    ) {
      return "Enter a valid email address.";
    }

    if (isCreating && (!form.phone.trim() || isCallingCodeOnly(form.phone, form.country))) {
      return "A complete employee phone number is required.";
    }

    if (form.phone.trim() && !isCallingCodeOnly(form.phone, form.country) && (
      form.phone.trim().length > 50 ||
      !/^\+?[0-9][0-9\s().-]*$/.test(form.phone.trim()) ||
      (form.phone.match(/[0-9]/g) ?? []).length < 7 ||
      (form.phone.match(/[0-9]/g) ?? []).length > 15
    )) {
      return "Enter an international phone number with 7–15 digits.";
    }

    if (form.joining_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.joining_date)) return "Enter a valid calendar date.";
      const [year, month, day] = form.joining_date.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "Enter a real calendar date.";
    }

    for (const emergencyField of ["emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone"] as const) {
      const error = getFieldError(emergencyField);
      if (error) return error;
    }

    if (isCreating && form.workforce_role === "EMPLOYEE") {
      if (!selectedEligibleDepartment(form.department_id)) {
        return "Select an active department with an eligible active Department Manager.";
      }
    }

    if (form.workforce_role === "DEPARTMENT_MANAGER") {
      if (!selectedHRManager(form.manager_id)) {
        return "Select an eligible active HR Manager as the reporting manager.";
      }
    }

    if (!isCreating && selectedEmployee) {
      if (
        selectedEmployee.workforce_role === "EMPLOYEE" &&
        form.department_id !== (baselineForm.department_id || "")
      ) {
        if (!selectedEligibleDepartment(form.department_id)) {
          return "The new department must be active and have an eligible active Department Manager.";
        }
      }

      if (
        selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" &&
        form.manager_id !== (baselineForm.manager_id || "")
      ) {
        if (!selectedHRManager(form.manager_id)) {
          return "Select an eligible active HR Manager.";
        }
      }
    }

    return null;
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    const isCreating = drawerMode === "create";
    setSubmitAttempted(true);
    setTouchedFields(new Set(Object.keys(form) as EmployeeFormField[]));

    if (isCreating && !canCreate) {
      setFormError("Your account does not have permission to create workforce profiles.");
      return;
    }
    if (isCreating && !canInvite) {
      setFormError("Your account cannot send workforce invitations. Creating profiles is unavailable until invitation permission is granted, because every new profile must receive an invitation automatically.");
      return;
    }

    if (!isCreating && !canEditProfile) {
      setFormError("Your account does not have permission to edit employee profiles.");
      return;
    }

    const validationError = validateForm(isCreating);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (
      !isCreating &&
      selectedEmployee?.is_primary_hr_manager &&
      selectedEmployee.employment_status !== "ACTIVE"
    ) {
      setFormError("The Primary HR Manager designation must be handled through its authorized workflow.");
      return;
    }

    const payload: Record<string, unknown> = {};

    const normalizedValues: Record<EditableTextField, string | null> = {
      employee_code: normalizedField("employee_code", form.employee_code),
      first_name: normalizedField("first_name", form.first_name),
      last_name: normalizedField("last_name", form.last_name),
      email: normalizedField("email", form.email),
      phone: isCallingCodeOnly(form.phone, form.country) ? null : normalizedField("phone", form.phone),
      country: normalizedField("country", form.country),
      city: normalizedField("city", form.city),
      designation: normalizedField("designation", form.designation),
      joining_date: normalizedField("joining_date", form.joining_date),
    };

    if (isCreating) {
      Object.assign(payload, normalizedValues, {
        workforce_role: form.workforce_role,
        employment_status: "INACTIVE",
        emergency_contact_name: form.emergency_contact_name.trim().replace(/\s+/g, " ") || null,
        emergency_contact_relationship: form.emergency_contact_relationship.trim().replace(/\s+/g, " ") || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      });

      if (form.workforce_role === "EMPLOYEE") {
        const department = selectedEligibleDepartment(form.department_id);
        payload.department_id = department?.id ?? null;
        payload.manager_id = department?.manager_id ?? null;
      } else {
        payload.department_id = null;
        payload.manager_id = form.manager_id || null;
      }
    } else if (selectedEmployee) {
      for (const field of EDITABLE_TEXT_FIELDS) {
        const currentValue = normalizedField(field, baselineForm[field]);
        const nextValue = normalizedValues[field];

        if (currentValue !== nextValue) {
          payload[field] = nextValue;
        }
      }

      if (
        selectedEmployee.workforce_role === "EMPLOYEE" &&
        form.department_id !== (selectedEmployee.department_id || "")
      ) {
        const department = selectedEligibleDepartment(form.department_id);
        payload.department_id = department?.id ?? null;
        payload.manager_id = department?.manager_id ?? null;
      }

      if (
        selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" &&
        form.manager_id !== (selectedEmployee.manager_id || "")
      ) {
        payload.manager_id = form.manager_id || null;
      }

      const emergencyChanged =
        form.emergency_contact_name !== baselineForm.emergency_contact_name ||
        form.emergency_contact_relationship !== baselineForm.emergency_contact_relationship ||
        form.emergency_contact_phone !== baselineForm.emergency_contact_phone;

      if (emergencyChanged) {
        payload.emergency_contact_name =
          form.emergency_contact_name.trim() || null;
        payload.emergency_contact_relationship =
          form.emergency_contact_relationship.trim() || null;
        payload.emergency_contact_phone =
          form.emergency_contact_phone.trim() || null;
      }

      if (!Object.keys(payload).length) {
        setDrawerMode("profile");
        setFormError("");
        setProfileNotice("No changes were needed.");
        return;
      }
    }

    setSaving(true);
    setFormError("");
    setProfileError("");

    try {
      const endpoint = isCreating
        ? "/api/backend/employees"
        : `/api/backend/employees/${encodeURIComponent(selectedEmployee!.id)}`;

      const response = await fetch(endpoint, {
        method: isCreating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const data = await readJson<ApiResponse<Employee>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
            (isCreating
              ? "Unable to create workforce profile."
              : "Unable to update employee profile."),
        );
      }

      if (isCreating) {
        const created = data?.employee ?? null;
        setPage(1);
        setReloadKey((value) => value + 1);
        setFormError("");
        setInvitationUrl("");
        setInvitationEmailSent(false);
        setInviteEmployee(null);

        if (!created?.id || !(created.email || form.email.trim())) {
          setDrawerMode(null);
          setNotice("The workforce profile was created, but its invitation could not be started because the server did not return the employee identity and email. The directory will update automatically. Use the invitation action on the employee row once the record is available.");
          return;
        }

        try {
          const invitationResponse = await fetch(`/api/backend/employees/${encodeURIComponent(created.id)}/invitation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ roleName: created.workforce_role ?? form.workforce_role }),
          });
          const invitationData = await readJson<ApiResponse<Employee>>(invitationResponse);
          if (invitationResponse.status === 401) {
            await auth.reload();
            return;
          }
          if (!invitationResponse.ok || invitationData?.emailSent !== true) {
            throw new Error(invitationData?.message || "The email service did not confirm invitation delivery.");
          }
          setNotice(`Workforce profile created and invitation email sent to ${created.email || form.email.trim()}.`);
        } catch (invitationFailure) {
          setNotice(`The workforce profile was created, but its invitation email could not be confirmed: ${invitationFailure instanceof Error ? invitationFailure.message : "Unknown email delivery error"} The directory will update automatically. Use the invitation action on the employee row once the record is available.`);
        } finally {
          setDrawerMode(null);
        }
        return;
      }

      if (selectedEmployee) {
        const updatedEmployee =
          data?.employee ?? {
            ...selectedEmployee,
            ...payload,
          } as Employee;

        setSelectedEmployee(updatedEmployee);
        setForm(employeeToForm(updatedEmployee));
        setBaselineForm(employeeToForm(updatedEmployee));
        setDrawerMode("profile");
        setProfileNotice("Employee profile updated successfully.");
        setReloadKey((value) => value + 1);
      }
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Unable to save the employee profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  function requestStatusChange(
    employee: Employee,
    target: "ACTIVE" | "INACTIVE",
  ) {
    if (!canChangeStatus) {
      setProfileError("Your account does not have permission to change employee status.");
      return;
    }

    if (employee.is_primary_hr_manager && target !== "ACTIVE") {
      setProfileError(
        "The Primary HR Manager must remain active until the designation is transferred through the authorized workflow.",
      );
      return;
    }

    setProfileError("");
    setStatusTarget({ employee, target });
  }

  async function confirmStatusChange() {
    if (!statusTarget || changingStatus) return;

    const { employee, target } = statusTarget;

    setChangingStatus(true);
    setProfileError("");

    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(employee.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ employment_status: target }),
        },
      );

      const data = await readJson<ApiResponse<Employee>>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to change employment status.",
        );
      }

      const updated = data?.employee ?? {
        ...employee,
        employment_status: target,
      };

      setSelectedEmployee(updated);
      setEmployees((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      setStatusTarget(null);
      setProfileNotice(`Employment status changed to ${statusLabel(target)}.`);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setProfileError(
        caught instanceof Error
          ? caught.message
          : "Unable to change employment status.",
      );
    } finally {
      setChangingStatus(false);
    }
  }

  function openInvitationDialog(employee: Employee) {
    if (!canInvite) {
      setProfileError(
        "Your account does not have permission to manage workforce invitations.",
      );
      return;
    }

    setInviteEmployee(employee);
    setInvitationError(
      employee.has_pending_invitation
        ? "This employee already has a pending invitation. Revoke it or let it expire before creating another."
        : !employee.workforce_role
          ? "This employee profile does not have a workforce role."
          : !employee.email
            ? "Add an email address to the employee profile before creating an invitation."
            : "",
    );
    setInvitationUrl("");
    setInvitationEmailSent(false);
    setCopiedInvitationLink(false);
  }

  async function createInvitation() {
    if (!inviteEmployee || creatingInvitation) return;

    if (!canInvite) {
      setInvitationError("Your account does not have permission to create invitations.");
      return;
    }

    if (
      !inviteEmployee.workforce_role ||
      !inviteEmployee.email ||
      inviteEmployee.has_pending_invitation
    ) {
      setInvitationError(
        "The employee must have an email and workforce role and must not already have a pending invitation.",
      );
      return;
    }

    setCreatingInvitation(true);
    setInvitationError("");
    setInvitationEmailSent(false);

    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(inviteEmployee.id)}/invitation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            roleName: inviteEmployee.workforce_role,
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
          data?.message || "Unable to create the employee invitation.",
        );
      }
      if (data?.emailSent !== true) {
        throw new Error("The email service did not confirm invitation delivery.");
      }

      if (!data?.invitationUrl) {
        throw new Error(
          "The invitation was created, but the API did not return an invitation URL.",
        );
      }

      setInvitationUrl(data.invitationUrl);
      setInvitationEmailSent(true);
      setCopiedInvitationLink(false);
      setNotice("Invitation created successfully.");
      setReloadKey((value) => value + 1);
      setProfileReloadKey((value) => value + 1);

      setInviteEmployee((current) =>
        current
          ? {
              ...current,
              invitation_id: data.invitation?.id ?? current.invitation_id,
              invitation_status: "PENDING",
              invitation_expires_at:
                data.invitation?.expires_at ?? current.invitation_expires_at,
              has_pending_invitation: true,
            }
          : current,
      );
    } catch (caught) {
      setInvitationError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the invitation.",
      );
    } finally {
      setCreatingInvitation(false);
    }
  }

  async function copyInvitationLink() {
    if (!invitationUrl) return;

    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopiedInvitationLink(true);
      return;
    } catch {
      setInvitationError(
        "Clipboard access was blocked. Select and copy the invitation link manually.",
      );
    }
  }

  async function revokeInvitation(
    employee: Employee,
    invitation: Invitation,
  ) {
    if (!canInvite || invitation.display_status !== "PENDING") return;

    const confirmed = window.confirm(
      `Revoke the pending invitation for ${fullName(employee)}?`,
    );

    if (!confirmed) return;

    setInvitationsError("");

    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(employee.id)}/invitation/revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            invitationId: invitation.id,
            reason: "Revoked by an authorized HR Manager",
          }),
        },
      );

      const data = await readJson<{ message?: string }>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok) {
        throw new Error(data?.message || "Unable to revoke invitation.");
      }

      setProfileNotice("Invitation revoked.");
      setProfileReloadKey((value) => value + 1);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setInvitationsError(
        caught instanceof Error
          ? caught.message
          : "Unable to revoke invitation.",
      );
    }
  }

  useEffect(() => {
    const employeeId = selectedEmployee?.id;
    if (!employeeId || selectedEmployee?.workforce_role !== "EMPLOYEE" || !["profile", "edit"].includes(drawerMode || "")) {
      setEmployeeScheduleInfo(null);
      setEmployeeRateInfo(null);
      setEmployeeWorkSettingsError("");
      setEmployeeWorkSettingsLoading(false);
      return;
    }
    const controller = new AbortController();
    setEmployeeWorkSettingsLoading(true);
    setEmployeeWorkSettingsError("");
    Promise.all([
      fetch("/api/backend/schedule-assignments", { credentials: "same-origin", cache: "no-store", signal: controller.signal }),
      fetch(`/api/backend/attendance/pay-rates?employeeId=${encodeURIComponent(employeeId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal }),
    ]).then(async ([scheduleResponse, rateResponse]) => {
      const [schedulePayload, ratePayload] = await Promise.all([
        scheduleResponse.json().catch(() => null), rateResponse.json().catch(() => null),
      ]);
      if (!scheduleResponse.ok) throw new Error(typeof schedulePayload?.message === "string" ? schedulePayload.message : "Unable to load assigned schedule.");
      if (!rateResponse.ok && rateResponse.status !== 403) throw new Error(typeof ratePayload?.message === "string" ? ratePayload.message : "Unable to load pay-rate settings.");
      const assignments = Array.isArray(schedulePayload?.assignments) ? schedulePayload.assignments as Record<string, unknown>[] : [];
      const ownAssignments = assignments.filter((item) => item.employeeId === employeeId || item.employee_id === employeeId)
        .sort((a, b) => String(b.effectiveFrom ?? b.effective_from ?? "").localeCompare(String(a.effectiveFrom ?? a.effective_from ?? "")));
      const rates = Array.isArray(ratePayload?.rates) ? ratePayload.rates as Record<string, unknown>[] : [];
      if (!controller.signal.aborted) {
        setEmployeeScheduleInfo(ownAssignments[0] ?? null);
        setEmployeeRateInfo(rates[0] ?? null);
      }
    }).catch((error) => {
      if (!controller.signal.aborted) setEmployeeWorkSettingsError(error instanceof Error ? error.message : "Unable to load schedule and pay settings.");
    }).finally(() => {
      if (!controller.signal.aborted) setEmployeeWorkSettingsLoading(false);
    });
    return () => controller.abort();
  }, [selectedEmployee?.id, drawerMode]);

  useEffect(() => {
    if (
      !selectedEmployeeId ||
      drawerMode !== "profile" ||
      !user
    ) {
      return;
    }

    let active = true;

    async function loadProfileTab() {
      if (profileTab === "invitations") {
        setInvitationsLoading(true);
        setInvitationsError("");

        if (!canViewInvitations) {
          setInvitationsError(
            "Your account does not have permission to view invitation history.",
          );
          setInvitationsLoading(false);
          return;
        }

        try {
          const params = new URLSearchParams({
            employeeId: selectedEmployeeId!,
            limit: "100",
            page: "1",
          });

          const response = await fetch(
            `/api/backend/org/invitations?${params.toString()}`,
            {
              credentials: "same-origin",
              cache: "no-store",
            },
          );

          const data = await readJson<ApiResponse<Invitation>>(response);

          if (response.status === 401) {
            await auth.reload();
            return;
          }

          if (!response.ok) {
            throw new Error(
              data?.message || "Unable to load invitation history.",
            );
          }

          if (active) {
            setProfileInvitations(data?.invitations ?? []);
          }
        } catch (caught) {
          if (active) {
            setInvitationsError(
              caught instanceof Error
                ? caught.message
                : "Unable to load invitation history.",
            );
          }
        } finally {
          if (active) setInvitationsLoading(false);
        }
      }

      if (profileTab === "history") {
        setHistoryLoading(true);
        setHistoryError("");

        if (!canViewHistory) {
          setHistoryError(
            "Your account does not have permission to view employee history.",
          );
          setHistoryLoading(false);
          return;
        }

        try {
          const response = await fetch(
            `/api/backend/employees/${encodeURIComponent(selectedEmployeeId!)}/history?limit=100&offset=0`,
            {
              credentials: "same-origin",
              cache: "no-store",
            },
          );

          const data =
            await readJson<ApiResponse<EmployeeHistoryEntry>>(response);

          if (response.status === 401) {
            await auth.reload();
            return;
          }

          if (!response.ok) {
            throw new Error(
              data?.message || "Unable to load employee history.",
            );
          }

          if (active) {
            setHistoryEntries(data?.history ?? []);
          }
        } catch (caught) {
          if (active) {
            setHistoryError(
              caught instanceof Error
                ? caught.message
                : "Unable to load employee history.",
            );
          }
        } finally {
          if (active) setHistoryLoading(false);
        }
      }
    }

    void loadProfileTab();

    return () => {
      active = false;
    };
  }, [
    selectedEmployeeId,
    drawerMode,
    user,
    profileTab,
    profileReloadKey,
    canViewInvitations,
    canViewHistory,
    auth.reload,
  ]);

  useEffect(() => {
    if (drawerMode === null) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !statusTarget) {
        closeDrawer();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [drawerMode, statusTarget, saving, changingStatus, creatingInvitation]);

  function toggleEmployeeSelection(employeeId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function toggleCurrentPageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected =
        employees.length > 0 &&
        employees.every((employee) => next.has(employee.id));

      if (allSelected) {
        for (const employee of employees) next.delete(employee.id);
      } else {
        for (const employee of employees) next.add(employee.id);
      }

      return next;
    });
  }

  async function bulkChangeStatus(target: "ACTIVE" | "INACTIVE") {
    if (!canChangeStatus || bulkBusy) return;

    const selected = employees.filter((employee) =>
      selectedIds.has(employee.id),
    );

    if (!selected.length) return;

    if (
      !window.confirm(
        `Change the status of ${selected.length} selected employee(s) to ${target}?`,
      )
    ) {
      return;
    }

    setBulkBusy(true);
    setDirectoryError("");

    let succeeded = 0;
    const failures: string[] = [];

    for (const employee of selected) {
      if (employee.is_primary_hr_manager && target === "INACTIVE") {
        failures.push(`${employee.employee_code}: Primary HR Manager must remain active.`);
        continue;
      }

      try {
        const response = await fetch(
          `/api/backend/employees/${encodeURIComponent(employee.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ employment_status: target }),
          },
        );

        const data = await readJson<{ message?: string }>(response);

        if (!response.ok) {
          failures.push(
            `${employee.employee_code}: ${data?.message || "Update failed"}`,
          );
        } else {
          succeeded += 1;
        }
      } catch {
        failures.push(`${employee.employee_code}: Request failed`);
      }
    }

    setBulkBusy(false);
    setSelectedIds(new Set());
    setNotice(`${succeeded} employee status update(s) completed.`);

    if (failures.length) {
      setDirectoryError(failures.slice(0, 4).join(" · "));
    }

    setReloadKey((value) => value + 1);
  }

  if (auth.checking) {
    return <HRManagerLoading />;
  }

  if (!user) {
    return (
      <HRManagerUnavailable
        message={auth.error || "Your HR Manager session could not be verified."}
        onRetry={() => void auth.reload()}
      />
    );
  }

  const hasFilters =
    search.trim().length > 0 ||
    statusFilter !== "ALL" ||
    departmentFilter !== "ALL";

  return (
    <HRManagerShell
      user={user}
      activePage="employees"
      title="Employees"
      description="Manage employee profiles, roles, and workforce status."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
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

      {directoryError && (
        <div
          role="alert"
          className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-400" />
            <span className="text-rose-200/90">{directoryError}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setDirectoryError("")}
            className="text-rose-400 hover:text-rose-200"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Matching employees",
            value: total,
            description: "Based on current filters",
            accentClass: "border-t-blue-500",
          },
          {
            label: "Active on this page",
            value: counts.active,
            description: "Active records on this page",
            accentClass: "border-t-emerald-500",
          },
          {
            label: "Inactive on this page",
            value: counts.inactive,
            description: "Inactive records on this page",
            accentClass: "border-t-amber-500",
          },
          {
            label: "Former on this page",
            value: counts.former,
            description: "Former records on this page",
            accentClass: "border-t-slate-500",
          },
        ].map((item) => (
          <article
            key={item.label}
            className={`rounded-2xl border border-[#344357]/80 border-t-[3px] ${item.accentClass} bg-[#192333] p-5 shadow-xl transition-all hover:border-[#3A4A60]`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C5D0DE]">
              {item.label}
            </p>
            <p className="mt-2.5 text-3xl font-extrabold tracking-tight text-white">
              {loading ? "…" : directoryError ? "—" : new Intl.NumberFormat().format(item.value)}
            </p>
            <p className="mt-4 border-t border-[#344357]/80 pt-3 text-xs text-[#9AA8BA]">
              {item.description}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#344357]/80 bg-[#192333] shadow-xl">
        <div className="flex flex-col gap-3 border-b border-[#344357]/80 px-6 py-5 bg-[#151C28]/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Workforce directory
            </h2>
            <p className="mt-1 text-sm text-[#C5D0DE]">
              Search, filter, sort, select, and open employee profiles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canChangeStatus && selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[#C5D0DE]">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkChangeStatus("ACTIVE")}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  Activate
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void bulkChangeStatus("INACTIVE")}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
                >
                  Deactivate
                </button>
              </div>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={openCreateDrawer}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-500 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98]"
              >
                <Plus size={16} />
                <span>Add employee</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3.5 border-b border-[#344357]/80 p-5 bg-[#192333] sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_180px_220px_190px]">
          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-[#C5D0DE] pointer-events-none"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Search name, code, email…"
              aria-label="Search employees"
              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#151C28] pl-10 pr-4 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            aria-label="Filter by employment status"
            className="h-10.5 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="FORMER">Former</option>
          </select>

          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            aria-label="Filter by department"
            className="h-10.5 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All departments</option>
            <option value="UNASSIGNED">Unassigned</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>

          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(event) => {
              const [field, order] = event.target.value.split(":");
              setSortBy(field as SortBy);
              setSortOrder(order as "asc" | "desc");
            }}
            aria-label="Sort employees"
            className="h-10.5 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="employee_code:asc">Employee code</option>
            <option value="department:asc">Department</option>
            <option value="designation:asc">Job title</option>
            <option value="workforce_role:asc">Workforce role</option>
            <option value="employment_status:asc">Employment status</option>
            <option value="joining_date:desc">Latest joining date</option>
          </select>
        </div>

        {supportingError && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 text-xs text-amber-300">
            Department or reporting-manager options are partially unavailable:
            {" "}{supportingError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-[#C5D0DE]">
            <RefreshCw size={17} className="animate-spin text-blue-400" />
            Loading employee records…
          </div>
        ) : employees.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#202D40] text-[#C5D0DE]">
              <Users size={24} />
            </div>
            <h3 className="mt-4 text-sm font-bold text-white">
              {hasFilters ? "No matching employees" : "No employee records yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#C5D0DE]">
              {hasFilters
                ? "Try changing your search or filters."
                : "Once workforce profiles exist in your organization, they will appear here."}
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                  setDepartmentFilter("ALL");
                }}
                className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear filters
              </button>
            ) : canCreate ? (
              <button
                type="button"
                onClick={openCreateDrawer}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-400 transition-all"
              >
                <Plus size={16} />
                Add employee
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-left">
              <thead className="bg-[#151C28]/80 text-[11px] font-bold uppercase tracking-[0.1em] text-[#C5D0DE] border-b border-[#344357]/80">
                <tr>
                  <th className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label="Select current page"
                      checked={
                        employees.length > 0 &&
                        employees.every((employee) =>
                          selectedIds.has(employee.id),
                        )
                      }
                      onChange={toggleCurrentPageSelection}
                      className="rounded border-[#3A4A60] bg-[#111827] text-blue-500 focus:ring-blue-500/20"
                    />
                  </th>
                  <th className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                    >
                      Employee <ArrowDownUp size={13} />
                    </button>
                  </th>
                  <th className="px-4 py-3.5">Department</th>
                  <th className="px-4 py-3.5">Workforce role</th>
                  <th className="px-4 py-3.5">Reporting manager</th>
                  <th className="px-4 py-3.5">Today’s attendance</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Invitation</th>
                  <th className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleSort("joining_date")}
                      className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                    >
                      Joining date <ArrowDownUp size={13} />
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60">
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="transition-colors hover:bg-[#202D40]/40"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(employee.id)}
                        onChange={() => toggleEmployeeSelection(employee.id)}
                        aria-label={`Select ${fullName(employee)}`}
                        className="rounded border-[#3A4A60] bg-[#111827] text-blue-500 focus:ring-blue-500/20"
                      />
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex min-w-0 items-start gap-3 text-left group">
                        <EmployeeProfilePhoto
                          employeeId={employee.id}
                          name={fullName(employee)}
                          className="size-10 rounded-xl border border-blue-500/20 bg-blue-500/10"
                          textClassName="text-xs font-bold text-blue-300"
                        />
                        <span className="min-w-0">
                          <button type="button" onClick={() => void openEmployeeProfile(employee.id)} className="block max-w-full truncate text-left text-sm font-semibold text-white transition-colors hover:text-blue-300">
                            {fullName(employee)}
                          </button>
                          <span className="mt-0.5 block truncate text-xs text-[#C5D0DE]">
                            {employee.email || "No email provided"}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[#9AA8BA]">
                            {employee.employee_code}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={() => void openEmployeeProfile(employee.id)} className="inline-flex items-center gap-1 rounded-lg border border-[#344357] bg-[#0F1723] px-2 py-1 text-[10px] font-semibold text-[#DCE6F2] transition hover:border-blue-400/40 hover:text-blue-200" title={`View ${fullName(employee)} profile`}><Eye size={12} aria-hidden="true" /> View</button>
                          {canEditProfile && <button type="button" onClick={() => { void openEmployeeProfile(employee.id); }} className="inline-flex items-center gap-1 rounded-lg border border-[#344357] bg-[#0F1723] px-2 py-1 text-[10px] font-semibold text-[#DCE6F2] transition hover:border-blue-400/40 hover:text-blue-200" title={`Edit ${fullName(employee)} profile`}><Pencil size={11} aria-hidden="true" /> Edit</button>}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <span className="text-sm text-[#E8EEF5]">
                        {employee.department_name || "Unassigned"}
                      </span>
                      {employee.designation && (
                        <p className="mt-1 max-w-[170px] truncate text-xs text-[#C5D0DE]">
                          {employee.designation}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm text-[#C5D0DE]">
                      {roleLabel(employee.workforce_role)}
                    </td>

                    <td className="px-4 py-4 text-sm text-[#C5D0DE]">
                      <div className="flex min-w-0 items-center gap-2">
                        {employee.manager_id && <EmployeeProfilePhoto employeeId={employee.manager_id} name={employee.manager_name || "Reporting manager"} className="size-7 rounded-lg border border-slate-700 bg-[#202D40]" textClassName="text-[10px] font-bold text-slate-200" />}
                        <span className="truncate">{employee.manager_name || "—"}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      {todayAttendanceLoading ? <span className="text-xs text-[#9AA8BA]">Loading…</span> : (() => {
                        const attendance = todayAttendance[employee.id];
                        if (!attendance) return <span className="inline-flex rounded-full border border-slate-600/50 bg-slate-700/20 px-2.5 py-1 text-[11px] font-semibold text-slate-300">No record</span>;
                        const hasClockIn = attendance.eventCount > 0 || Boolean(attendance.firstClockIn);
                        const isApprovedLeave = attendance.leaveRequest?.status?.toUpperCase() === "APPROVED";
                        const isHoliday = Boolean(attendance.publicHoliday);
                        const statusText = isHoliday ? "Public holiday" : isApprovedLeave ? `Approved leave${attendance.leaveRequest?.leaveType ? ` · ${attendance.leaveRequest.leaveType.replaceAll("_", " ")}` : ""}` : hasClockIn ? attendance.lastClockOut ? "Clocked out" : "Clocked in" : attendance.scheduleName ? "Scheduled" : "No record";
                        const statusTone = isHoliday ? "border-amber-400/25 bg-amber-400/10 text-amber-100" : isApprovedLeave ? "border-violet-400/25 bg-violet-400/10 text-violet-100" : hasClockIn ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-sky-400/20 bg-sky-400/10 text-sky-200";
                        return <div className="min-w-[165px] space-y-1.5">
                          <span className={`inline-flex max-w-[200px] rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone}`}>{statusText}</span>
                          {attendance.publicHoliday?.name && <p className="text-[10px] text-amber-100/80">{attendance.publicHoliday.name}{attendance.publicHoliday.isPaid ? " · Paid" : " · Unpaid"}</p>}
                          {attendance.firstClockIn || attendance.lastClockOut ? <p className="text-[11px] leading-4 text-[#9AA8BA]">{attendance.firstClockIn ? `In ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(attendance.firstClockIn))}` : "In —"}{" · "}{attendance.lastClockOut ? `Out ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(attendance.lastClockOut))}` : "Out —"}</p> : null}
                          {attendance.scheduleName && <p className="max-w-[180px] truncate text-[10px] text-[#9AA8BA]">{attendance.scheduleName}</p>}
                          {attendance.approvedOvertimeMinutes > 0 && <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-2 py-1 text-[10px] font-semibold text-cyan-100">Approved overtime · {Math.floor(attendance.approvedOvertimeMinutes / 60)}h {attendance.approvedOvertimeMinutes % 60}m</span>}
                        </div>;
                      })()}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                          employee.employment_status,
                        )}`}
                      >
                        {statusLabel(employee.employment_status)}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                          employee.invitation_status,
                        )}`}
                      >
                        {statusLabel(employee.invitation_status ?? "NONE")}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-sm text-[#C5D0DE]">
                      {formatDate(employee.joining_date)}
                    </td>


                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 border-t border-[#344357]/80 bg-[#151C28]/40 px-6 py-4 text-xs text-[#C5D0DE] sm:flex-row sm:items-center">
          <span>
            Showing {employees.length} of {total.toLocaleString()} employee(s)
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

      {/* Employee profile / create / edit drawer */}
      {drawerMode && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close employee drawer"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
          />

          <aside
            className="absolute inset-y-0 right-0 flex w-full max-w-[760px] flex-col border-l border-[#344357] bg-[#192333] text-[#F8FAFC] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={
              drawerMode === "create"
                ? "Create employee"
                : drawerMode === "edit"
                  ? "Edit employee"
                  : "Employee profile"
            }
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#344357]/80 px-6 py-5 bg-[#151C28]/60 sm:px-8">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                  {drawerMode === "create" ? (
                    <Plus size={22} />
                  ) : drawerMode === "edit" ? (
                    <Pencil size={20} />
                  ) : (
                    <UserRound size={22} />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                    People management
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-white tracking-tight">
                    {drawerMode === "create"
                      ? "Create workforce profile"
                      : drawerMode === "edit"
                        ? "Edit employee profile"
                        : selectedEmployee
                          ? fullName(selectedEmployee)
                          : "Employee profile"}
                  </h2>
                  <p className="mt-1 text-xs text-[#C5D0DE]">
                    {drawerMode === "create"
                      ? "New profiles are created as inactive until account activation is completed."
                      : selectedEmployee
                        ? `${selectedEmployee.employee_code} · ${roleLabel(selectedEmployee.workforce_role)}`
                        : "Loading the latest employee information…"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close drawer"
                disabled={saving || changingStatus}
                onClick={closeDrawer}
                className="rounded-xl p-2 text-[#C5D0DE] transition hover:bg-[#202D40] hover:text-white disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {(drawerMode === "create" || drawerMode === "edit") && (
                <form
                  id="hr-employee-form"
                  onSubmit={(event) => {
                    void saveEmployee(event);
                  }}
                  className="space-y-6"
                >
                  {formError && (
                    <div
                      role="alert"
                      className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
                    >
                      <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-400" />
                      <span className="text-rose-200/90">{formError}</span>
                    </div>
                  )}

                  {drawerMode === "create" && (
                    <WorkforceCreationGuide />
                  )}
                  {drawerMode === "edit" && selectedEmployee && selectedEmployee.workforce_role === "EMPLOYEE" && (
                    <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Assigned schedule & pay-rate settings</h3><p className="mt-1 text-xs leading-5 text-[#9AA8BA]">Review the current shift and compensation settings while editing this employee.</p></div><div className="flex flex-wrap gap-2"><a href="/hr/modules/time-schedules" className="rounded-lg border border-[#3A4A60] px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-white/[0.04]">Manage schedules</a><a href="/hr/modules/pay-rates" className="rounded-lg border border-[#3A4A60] px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-white/[0.04]">Manage pay rates</a></div></div>
                      {employeeWorkSettingsLoading ? <p className="mt-4 text-xs text-[#9AA8BA]">Loading current settings…</p> : employeeWorkSettingsError ? <p role="status" className="mt-4 text-xs text-amber-200">{employeeWorkSettingsError}</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[#344357]/70 bg-black/10 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#9AA8BA]">Assigned schedule</p><p className="mt-1 text-sm font-semibold text-white">{String(employeeScheduleInfo?.scheduleName ?? employeeScheduleInfo?.schedule_name ?? "No schedule assigned")}</p><p className="mt-1 text-xs text-[#9AA8BA]">{employeeScheduleInfo ? `From ${String(employeeScheduleInfo.effectiveFrom ?? employeeScheduleInfo.effective_from ?? "—")}${(employeeScheduleInfo.effectiveTo ?? employeeScheduleInfo.effective_to) ? ` to ${String(employeeScheduleInfo.effectiveTo ?? employeeScheduleInfo.effective_to)}` : " · ongoing"}` : "Assign a shift in Schedules & Time."}</p></div><div className="rounded-xl border border-[#344357]/70 bg-black/10 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#9AA8BA]">Current pay rates</p><p className="mt-1 text-sm font-semibold text-white">{employeeRateInfo ? `${String(employeeRateInfo.currencyCode ?? employeeRateInfo.currency_code ?? "")} ${String(employeeRateInfo.hourlyRate ?? employeeRateInfo.hourly_rate ?? "—")} / hour` : "No rate saved"}</p><p className="mt-1 text-xs text-violet-200">{employeeRateInfo ? `${String(employeeRateInfo.currencyCode ?? employeeRateInfo.currency_code ?? "")} ${String(employeeRateInfo.overtimeRate ?? employeeRateInfo.overtime_rate ?? "—")} overtime / hour` : "Set hourly and overtime rates."}</p><p className="mt-1 text-xs text-[#9AA8BA]">{employeeRateInfo ? `Effective from ${String(employeeRateInfo.effectiveFrom ?? employeeRateInfo.effective_from ?? "—")}` : "Rate history is managed in Employee pay rates."}</p></div></div>}
                    </section>
                  )}
                  <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                    <h3 className="text-sm font-bold text-white">
                      Personal and employment details
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#C5D0DE]">
                      Use accurate workforce information. Required fields are marked.
                    </p>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          ["employee_code", "Employee code", true],
                          ["first_name", "First name", true],
                          ["last_name", "Last name", true],
                          ["country", "Country", true],
                          ["city", "City", true],
                          ["phone", "Phone number", false],
                          ["email", "Email address", true],
                          ["designation", "Job title", true],
                        ] as const
                      ).map(([field, label, required]) => {
                        const fieldRequired = required || (drawerMode === "create" && field === "phone");
                        const fullWidth = ["employee_code", "country", "email", "designation"].includes(field);
                        return (
                        <label key={field} className={`block ${fullWidth ? "sm:col-span-2" : ""}`}>
                          <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                            {label}
                            {fieldRequired ? " *" : ""}
                          </span>
                          {field === "country" ? (
                            <CountrySelect
                              id="country"
                              value={form.country}
                              required={required}
                              invalid={showFieldError("country")}
                              onBlur={() => setTouchedFields((current) => new Set(current).add("country"))}
                              onChange={(value) => updateField("country", value)}
                              className={`h-10.5 w-full rounded-xl border bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${showFieldError("country") ? "border-rose-500/70" : "border-[#344357]"}`}
                            />
                          ) : (
                            <input
                              type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                              required={fieldRequired}
                              maxLength={field === "employee_code" ? 50 : field === "email" ? 254 : field === "phone" ? 50 : 200}
                              value={form[field]}
                              onBlur={() => setTouchedFields((current) => new Set(current).add(field))}
                              onChange={(event) => updateField(field, event.target.value)}
                              autoComplete={field === "email" ? "email" : field === "phone" ? "tel" : "off"}
                              aria-invalid={showFieldError(field)}
                              className={`h-10.5 w-full rounded-xl border bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner ${showFieldError(field) ? "border-rose-500/70" : "border-[#344357]"}`}
                            />
                          )}
                          {field === "phone" && <p className="mt-1 text-[10px] text-[#9AA8BA]">{drawerMode === "create" ? "Required. Country selection pre-fills the international calling code." : "Country selection pre-fills the international calling code."}</p>}
                          {showFieldError(field) && <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-300">{getFieldError(field)}</p>}
                        </label>
                      ); })}

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                          Joining date
                        </span>
                        <input
                          id="joining_date"
                          type="date"
                          value={form.joining_date}
                          onBlur={() => setTouchedFields((current) => new Set(current).add("joining_date"))}
                          onChange={(event) => updateField("joining_date", event.target.value)}
                          aria-invalid={showFieldError("joining_date")}
                          aria-describedby={showFieldError("joining_date") ? "joining-date-error" : undefined}
                          className={`h-10.5 w-full rounded-xl border bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner ${showFieldError("joining_date") ? "border-rose-500/70" : "border-[#344357]"}`}
                        />
                        {showFieldError("joining_date") && <p id="joining-date-error" role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-300">{getFieldError("joining_date")}</p>}
                      </label>
                    </div>
                  </section>

                  {drawerMode === "create" && (
                    <>
                    <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                      <h3 className="text-sm font-bold text-white">
                        Workforce role and reporting
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-[#C5D0DE]">
                        HR Managers can create Employee and Department Manager profiles. The server validates all assignments.
                      </p>

                      <div className="mt-5 space-y-4">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                            Workforce role *
                          </span>
                          <select
                            value={form.workforce_role}
                            onChange={(event) => {
                              const nextRole = event.target.value as EmployeeForm["workforce_role"];
                              setForm((current) => ({
                                ...current,
                                workforce_role: nextRole,
                                department_id: "",
                                manager_id: "",
                              }));
                              setFormError("");
                            }}
                            className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="EMPLOYEE">Employee</option>
                            <option value="DEPARTMENT_MANAGER">
                              Department Manager
                            </option>
                          </select>
                        </label>

                        {form.workforce_role === "EMPLOYEE" ? (
                          <div className="space-y-3">
                            <label className="block">
                              <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                                Department *
                              </span>
                              <select
                                value={form.department_id}
                                onChange={(event) =>
                                  updateField("department_id", event.target.value)
                                }
                                className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              >
                                <option value="">Select eligible department</option>
                                {eligibleDepartmentOptions.map((department) => (
                                  <option
                                    key={department.id}
                                    value={department.id}
                                  >
                                    {department.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {form.department_id && (
                              <p className="rounded-xl border border-[#344357] bg-[#192333] p-3.5 text-xs text-[#E8EEF5]">
                                Reporting manager:{" "}
                                <span className="font-semibold text-white">
                                  {selectedEligibleDepartment(form.department_id)
                                    ?.manager_name || "Assigned by the selected department"}
                                </span>
                              </p>
                            )}

                            {!eligibleDepartmentOptions.length && (
                              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-300">
                                No eligible departments are available. An Employee profile requires an active department with an eligible active Department Manager.
                              </p>
                            )}
                          </div>
                        ) : (
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                              Reporting HR Manager *
                            </span>
                            <select
                              value={form.manager_id}
                              onChange={(event) =>
                                updateField("manager_id", event.target.value)
                              }
                              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            >
                              <option value="">Select active HR Manager</option>
                              {eligibleHRManagers.map((manager) => (
                                <option key={manager.id} value={manager.id}>
                                  {[
                                    manager.first_name,
                                    manager.last_name,
                                  ].filter(Boolean).join(" ")}{" "}
                                  · {manager.employee_code}
                                  {manager.is_primary_hr_manager
                                    ? " · Primary HR Manager"
                                    : ""}
                                </option>
                              ))}
                            </select>
                            {!eligibleHRManagers.length && (
                              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-300">
                                No eligible active HR Manager account is available for this reporting relationship.
                              </p>
                            )}
                          </label>
                        )}
                      </div>
                    </section>
                    </>
                  )}

                  {drawerMode === "edit" &&
                    selectedEmployee?.workforce_role === "EMPLOYEE" && (
                      <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                        <h3 className="text-sm font-bold text-white">
                          Department assignment
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-[#C5D0DE]">
                          Changing an Employee's department also updates the reporting manager according to the selected department.
                        </p>

                        <label className="mt-4 block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                            Department
                          </span>
                          <select
                            value={form.department_id}
                            onChange={(event) =>
                              updateField("department_id", event.target.value)
                            }
                            className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="">Unassigned</option>
                            {eligibleDepartmentOptions.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                            {selectedEmployee.department_id &&
                              !eligibleDepartmentOptions.some(
                                (department) =>
                                  department.id === selectedEmployee.department_id,
                              ) && (
                                <option value={selectedEmployee.department_id}>
                                  {selectedEmployee.department_name || "Current department"} · current assignment
                                </option>
                              )}
                          </select>
                        </label>

                        {form.department_id &&
                          selectedEligibleDepartment(form.department_id) && (
                            <p className="mt-3 rounded-xl border border-[#344357] bg-[#151C28] p-3.5 text-xs text-[#E8EEF5]">
                              Reporting manager after assignment:{" "}
                              <span className="font-semibold text-white">
                                {selectedEligibleDepartment(form.department_id)
                                  ?.manager_name || "Assigned by department"}
                              </span>
                            </p>
                          )}
                      </section>
                    )}

                  {drawerMode === "edit" &&
                    selectedEmployee?.workforce_role === "DEPARTMENT_MANAGER" && (
                      <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                        <h3 className="text-sm font-bold text-white">
                          Reporting relationship
                        </h3>
                        <label className="mt-4 block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#E8EEF5]">
                            Reporting HR Manager
                          </span>
                          <select
                            value={form.manager_id}
                            onChange={(event) =>
                              updateField("manager_id", event.target.value)
                            }
                            className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="">Select active HR Manager</option>
                            {eligibleHRManagers.map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {[
                                  manager.first_name,
                                  manager.last_name,
                                ].filter(Boolean).join(" ")}{" "}
                                · {manager.employee_code}
                                {manager.is_primary_hr_manager
                                  ? " · Primary HR Manager"
                                  : ""}
                              </option>
                            ))}
                            {form.manager_id &&
                              !eligibleHRManagers.some(
                                (manager) => manager.id === form.manager_id,
                              ) && (
                                <option value={form.manager_id}>
                                  Current reporting manager
                                </option>
                              )}
                          </select>
                        </label>
                      </section>
                    )}

                  {(drawerMode === "create" || drawerMode === "edit") && (
                    <WorkforceEmergencyContactFields
                      values={{
                        emergency_contact_name: form.emergency_contact_name,
                        emergency_contact_relationship: form.emergency_contact_relationship,
                        emergency_contact_phone: form.emergency_contact_phone,
                      }}
                      onChange={(field, value) => updateField(field, value)}
                      onBlur={(field) => setTouchedFields((current) => new Set(current).add(field))}
                      showError={(field) => showFieldError(field)}
                      getError={(field) => getFieldError(field)}
                      required={drawerMode === "create"}
                    />
                  )}
                </form>
              )}

              {drawerMode === "profile" && (
                <div>
                  {profileLoading && (
                    <div className="flex items-center gap-3 py-12 text-sm text-[#C5D0DE]">
                      <RefreshCw size={17} className="animate-spin text-blue-400" />
                      Loading employee profile…
                    </div>
                  )}

                  {profileError && (
                    <div
                      role="alert"
                      className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
                    >
                      <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-400" />
                      <span className="text-rose-200/90">{profileError}</span>
                    </div>
                  )}

                  {profileNotice && (
                    <div
                      role="status"
                      className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 shadow-lg"
                    >
                      {profileNotice}
                    </div>
                  )}

                  {selectedEmployee && !profileLoading && (
                    <>
                      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl sm:flex-row sm:items-center">
                        <div className="flex min-w-0 items-center gap-4">
                          <EmployeeProfilePhoto
                            employeeId={selectedEmployee.id}
                            name={fullName(selectedEmployee)}
                            className="size-14 rounded-2xl border border-blue-500/20 bg-blue-500/10"
                            textClassName="text-lg font-extrabold text-blue-300"
                          />
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-bold text-white tracking-tight">
                              {fullName(selectedEmployee)}
                            </h3>
                            <p className="mt-1 truncate text-xs text-[#C5D0DE]">
                              {selectedEmployee.email || "No email provided"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(selectedEmployee.employment_status)}`}>
                                {statusLabel(selectedEmployee.employment_status)}
                              </span>
                              <span className="rounded-full border border-[#344357] bg-[#192333] px-3 py-1 text-xs font-medium text-[#E8EEF5]">
                                {roleLabel(selectedEmployee.workforce_role)}
                              </span>
                              {selectedEmployee.is_primary_hr_manager && (
                                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
                                  Primary HR Manager
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2.5">
                          {canEditProfile && (
                            <button
                              type="button"
                              onClick={startEditing}
                              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#344357] bg-[#192333] px-3.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-white shadow-xs"
                            >
                              <Pencil size={15} className="text-[#C5D0DE]" />
                              Edit profile
                            </button>
                          )}

                          {canInvite && (
                            <button
                              type="button"
                              disabled={selectedEmployee.has_pending_invitation}
                              onClick={() => openInvitationDialog(selectedEmployee)}
                              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-500 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Mail size={15} />
                              {selectedEmployee.has_pending_invitation
                                ? "Invitation pending"
                                : "Create invitation"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-2 border-b border-[#344357]/80">
                        {(
                          [
                            ["overview", "Overview"],
                            ["departments", "Departments"],
                            ["invitations", "Invitations"],
                            ["history", "History"],
                          ] as const
                        ).map(([tab, label]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setProfileTab(tab)}
                            className={`border-b-2 px-4 py-3 text-xs font-semibold transition ${
                              profileTab === tab
                                ? "border-blue-500 text-blue-400"
                                : "border-transparent text-[#C5D0DE] hover:text-[#F8FAFC]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {profileTab === "overview" && (
                        <div className="mt-6 space-y-6">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <DetailCard
                              label="Employee code"
                              value={selectedEmployee.employee_code}
                              icon={<Users size={15} className="text-blue-400" />}
                            />
                            <DetailCard
                              label="Job title"
                              value={selectedEmployee.designation}
                              icon={<BriefcaseBusiness size={15} className="text-blue-400" />}
                            />
                            <DetailCard
                              label="Department"
                              value={selectedEmployee.department_name}
                              icon={<Building2 size={15} className="text-blue-400" />}
                            />
                            <div className="rounded-xl border border-[#344357]/80 bg-[#151C28] p-4">
                              <p className="text-xs font-medium text-[#9AA8BA]">Reporting manager</p>
                              <div className="mt-2 flex min-w-0 items-center gap-3">
                                {selectedEmployee.manager_id && <EmployeeProfilePhoto employeeId={selectedEmployee.manager_id} name={selectedEmployee.manager_name || "Reporting manager"} className="size-9 rounded-xl border border-blue-500/20 bg-blue-500/10" textClassName="text-xs font-bold text-blue-300" />}
                                <p className="min-w-0 truncate text-sm font-semibold text-[#E8EEF5]">{selectedEmployee.manager_name || "Not assigned"}</p>
                              </div>
                            </div>
                            <DetailCard
                              label="Joining date"
                              value={formatDate(selectedEmployee.joining_date)}
                              icon={<CalendarDays size={15} className="text-blue-400" />}
                            />
                          </div>

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

                          {selectedEmployee.workforce_role === "EMPLOYEE" && (
                            <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl">
                              <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-white">Assigned schedule & pay-rate settings</h4><p className="mt-1 text-xs leading-5 text-[#9AA8BA]">Current work schedule and effective-dated compensation.</p></div><div className="flex flex-wrap gap-2"><a href="/hr/modules/time-schedules" className="rounded-lg border border-[#3A4A60] px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-white/[0.04]">Schedules</a><a href="/hr/modules/pay-rates" className="rounded-lg border border-[#3A4A60] px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-white/[0.04]">Pay rates</a></div></div>
                              {employeeWorkSettingsLoading ? <p className="mt-4 text-xs text-[#9AA8BA]">Loading current settings…</p> : employeeWorkSettingsError ? <p role="status" className="mt-4 text-xs text-amber-200">{employeeWorkSettingsError}</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2"><DetailCard label="Assigned schedule" value={String(employeeScheduleInfo?.scheduleName ?? employeeScheduleInfo?.schedule_name ?? "No schedule assigned")} icon={<CalendarDays size={15} className="text-blue-400" />} /><DetailCard label="Hourly rate" value={employeeRateInfo ? `${String(employeeRateInfo.currencyCode ?? employeeRateInfo.currency_code ?? "")} ${String(employeeRateInfo.hourlyRate ?? employeeRateInfo.hourly_rate ?? "—")}` : "No rate saved"} icon={<Clock3 size={15} className="text-blue-400" />} /><DetailCard label="Overtime rate" value={employeeRateInfo ? `${String(employeeRateInfo.currencyCode ?? employeeRateInfo.currency_code ?? "")} ${String(employeeRateInfo.overtimeRate ?? employeeRateInfo.overtime_rate ?? "—")}` : "No rate saved"} icon={<BriefcaseBusiness size={15} className="text-blue-400" />} /><DetailCard label="Rate effective from" value={String(employeeRateInfo?.effectiveFrom ?? employeeRateInfo?.effective_from ?? "Not set")} icon={<CalendarDays size={15} className="text-blue-400" />} /></div>}
                            </section>
                          )}
                          <div className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                            <h4 className="text-sm font-bold text-white">
                              Employment status
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed text-[#C5D0DE]">
                              Status changes are audited by the backend and remain subject to HR Manager permissions and workforce hierarchy rules.
                            </p>

                            {canChangeStatus &&
                              selectedEmployee.employment_status !== "FORMER" && (
                                <div className="mt-5 flex flex-wrap gap-3">
                                  {selectedEmployee.employment_status === "ACTIVE" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        requestStatusChange(
                                          selectedEmployee,
                                          "INACTIVE",
                                        )
                                      }
                                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                                    >
                                      Mark inactive
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        requestStatusChange(
                                          selectedEmployee,
                                          "ACTIVE",
                                        )
                                      }
                                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                                    >
                                      Reactivate employee
                                    </button>
                                  )}
                                </div>
                              )}

                            {selectedEmployee.employment_status === "FORMER" && (
                              <p className="mt-4 text-xs leading-relaxed text-[#C5D0DE]">
                                This employee has former status. The normal activate/inactivate controls are unavailable.
                              </p>
                            )}

                            {!canChangeStatus && (
                              <p className="mt-4 text-xs leading-relaxed text-[#C5D0DE]">
                                Your account does not currently have both employee-update and status-change permissions.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {profileTab === "departments" && (
                        <div className="mt-6 space-y-6">
                          <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                            <h4 className="text-sm font-bold text-white">
                              Current assignment
                            </h4>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <DetailCard
                                label="Department"
                                value={selectedEmployee.department_name}
                                icon={<Building2 size={15} className="text-blue-400" />}
                              />
                              <DetailCard
                                label="Reporting manager"
                                value={selectedEmployee.manager_name}
                                icon={<UserRound size={15} className="text-blue-400" />}
                              />
                            </div>
                          </section>

                          <section className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-6 shadow-xl">
                            <h4 className="text-sm font-bold text-white">
                              Managed departments
                            </h4>
                            <p className="mt-1 text-xs text-[#C5D0DE]">
                              Department assignments returned by the employee API.
                            </p>

                            {selectedEmployee.managed_departments?.length ? (
                              <div className="mt-4 space-y-3">
                                {selectedEmployee.managed_departments.map((department) => (
                                  <div
                                    key={department.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#344357] bg-[#192333] px-4 py-3.5"
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <Building2 size={18} className="shrink-0 text-blue-400" />
                                      <p className="truncate text-sm font-semibold text-white">
                                        {department.name}
                                      </p>
                                    </div>
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(department.status)}`}>
                                      {statusLabel(department.status)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-4 rounded-xl border border-[#344357] bg-[#192333] p-4 text-sm text-[#C5D0DE]">
                                No managed departments were returned for this employee.
                              </p>
                            )}
                          </section>
                        </div>
                      )}

                      {profileTab === "invitations" && (
                        <div className="mt-6">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold text-white">
                                Invitation history
                              </h4>
                              <p className="mt-1 text-xs text-[#C5D0DE]">
                                Invitation records for this employee.
                              </p>
                            </div>

                            {canInvite && (
                              <button
                                type="button"
                                disabled={selectedEmployee.has_pending_invitation}
                                onClick={() => openInvitationDialog(selectedEmployee)}
                                className="inline-flex items-center gap-2 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50 shadow-xs"
                              >
                                <Plus size={14} className="text-blue-400" />
                                New invitation
                              </button>
                            )}
                          </div>

                          {invitationsLoading ? (
                            <div className="flex items-center gap-2 py-12 text-sm text-[#C5D0DE]">
                              <RefreshCw size={16} className="animate-spin text-blue-400" />
                              Loading invitation history…
                            </div>
                          ) : invitationsError ? (
                            <p className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300 shadow-lg">
                              {invitationsError}
                            </p>
                          ) : !profileInvitations.length ? (
                            <div className="mt-6 rounded-2xl border border-[#344357]/80 bg-[#151C28] px-6 py-12 text-center shadow-xl">
                              <Mail size={26} className="mx-auto text-[#9AA8BA]" />
                              <p className="mt-4 text-sm font-semibold text-white">
                                No invitations found
                              </p>
                              <p className="mt-1 text-xs text-[#C5D0DE]">
                                Invitation records will appear here when available.
                              </p>
                            </div>
                          ) : (
                            <div className="mt-6 space-y-4">
                              {profileInvitations.map((invitation) => (
                                <article
                                  key={invitation.id}
                                  className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="break-all text-sm font-semibold text-white">
                                        {invitation.email}
                                      </p>
                                      <p className="mt-1 text-xs text-[#C5D0DE]">
                                        Created {formatDate(invitation.created_at)}
                                      </p>
                                      {invitation.expires_at && (
                                        <p className="mt-1 text-xs text-[#C5D0DE]">
                                          Expires {formatDate(invitation.expires_at)}
                                        </p>
                                      )}
                                    </div>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(invitation.display_status || invitation.status)}`}>
                                      {statusLabel(invitation.display_status || invitation.status)}
                                    </span>
                                  </div>

                                  {canInvite &&
                                    invitation.display_status === "PENDING" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void revokeInvitation(
                                            selectedEmployee,
                                            invitation,
                                          )
                                        }
                                        className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                                      >
                                        Revoke pending invitation
                                      </button>
                                    )}
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {profileTab === "history" && (
                        <div className="mt-6">
                          <div>
                            <h4 className="text-sm font-bold text-white">
                              Employee history
                            </h4>
                            <p className="mt-1 text-xs text-[#C5D0DE]">
                              Audited activity records returned by the backend.
                            </p>
                          </div>

                          {historyLoading ? (
                            <div className="flex items-center gap-2 py-12 text-sm text-[#C5D0DE]">
                              <RefreshCw size={16} className="animate-spin text-blue-400" />
                              Loading employee history…
                            </div>
                          ) : historyError ? (
                            <p className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300 shadow-lg">
                              {historyError}
                            </p>
                          ) : !historyEntries.length ? (
                            <div className="mt-6 rounded-2xl border border-[#344357]/80 bg-[#151C28] px-6 py-12 text-center shadow-xl">
                              <History size={26} className="mx-auto text-[#9AA8BA]" />
                              <p className="mt-4 text-sm font-semibold text-white">
                                No history records found
                              </p>
                              <p className="mt-1 text-xs text-[#C5D0DE]">
                                The API did not return history events for this employee.
                              </p>
                            </div>
                          ) : (
                            <div className="mt-6 space-y-4">
                              {historyEntries.map((entry) => (
                                <article
                                  key={entry.id}
                                  className="relative rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl"
                                >
                                  <div className="flex items-start gap-3.5">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                                      <History size={18} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="break-words text-sm font-semibold text-white">
                                        {entry.event_type.replaceAll("_", " ")}
                                      </p>
                                      <p className="mt-1 text-xs text-[#C5D0DE]">
                                        {formatDate(entry.effective_at || entry.created_at)}
                                        {entry.actor_display_name
                                          ? ` · ${entry.actor_display_name}`
                                          : ""}
                                        {entry.actor_role_label
                                          ? ` (${entry.actor_role_label})`
                                          : ""}
                                      </p>
                                      {entry.reason && (
                                        <p className="mt-3 text-sm leading-relaxed text-[#E8EEF5]">
                                          {entry.reason}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {(drawerMode === "create" || drawerMode === "edit") && (
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#344357]/80 bg-[#151C28]/80 px-6 py-4 sm:px-8 shadow-2xl">
                <p className="text-xs text-[#C5D0DE]">
                  {drawerMode === "create"
                    ? "New profiles are saved as INACTIVE."
                    : "Only changed fields are submitted."}
                </p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (drawerMode === "edit" && selectedEmployee) {
                        setForm(employeeToForm(selectedEmployee));
                        setBaselineForm(employeeToForm(selectedEmployee));
                        setDrawerMode("profile");
                      } else {
                        closeDrawer();
                      }
                    }}
                    className="rounded-xl border border-[#344357] bg-[#151C28] px-4 py-2.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50 shadow-xs"
                  >
                    Cancel
                  </button>

                  {drawerMode === "create" ? (
                    <button
                      type="submit"
                      form="hr-employee-form"
                      disabled={saving || !canInvite}
                      className="rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving ? "Creating & sending invitation…" : "Create & send invitation"}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      form="hr-employee-form"
                      disabled={saving}
                      className="rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  )}
                </div>
              </footer>
            )}
          </aside>
        </div>
      )}

      {/* Status confirmation */}
      {statusTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-status-confirm-title"
            className="w-full max-w-md rounded-2xl border border-[#344357] bg-[#192333] p-6 shadow-2xl text-[#F8FAFC]"
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
              <CircleAlert size={22} />
            </div>
            <h2
              id="employee-status-confirm-title"
              className="mt-5 text-lg font-bold text-white tracking-tight"
            >
              Confirm status change
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#E8EEF5]">
              Change <strong className="text-white">{fullName(statusTarget.employee)}</strong> from{" "}
              <strong className="text-white">{statusLabel(statusTarget.employee.employment_status)}</strong>{" "}
              to <strong className="text-white">{statusLabel(statusTarget.target)}</strong>?
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#C5D0DE]">
              The backend will recheck role permissions and workforce hierarchy before saving the change.
            </p>
            {profileError && (
              <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                {profileError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={changingStatus}
                onClick={() => {
                  setStatusTarget(null);
                  setProfileError("");
                }}
                className="rounded-xl border border-[#344357] bg-[#151C28] px-4 py-2.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={changingStatus}
                onClick={() => void confirmStatusChange()}
                className="rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 disabled:opacity-50"
              >
                {changingStatus ? "Updating…" : "Confirm change"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Invitation creation and link */}
      {inviteEmployee && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-invitation-title"
            className="w-full max-w-lg rounded-2xl border border-[#344357] bg-[#192333] p-6 shadow-2xl text-[#F8FAFC] sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                  <Mail size={22} />
                </div>
                <div>
                  <h2
                    id="employee-invitation-title"
                    className="text-lg font-bold text-white tracking-tight"
                  >
                    Employee invitation
                  </h2>
                  <p className="mt-0.5 text-xs text-[#C5D0DE]">
                    {fullName(inviteEmployee)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={creatingInvitation}
                onClick={() => {
                  setInviteEmployee(null);
                  setInvitationUrl("");
                  setInvitationError("");
                  setCopiedInvitationLink(false);
                }}
                className="rounded-xl p-2 text-[#C5D0DE] transition hover:bg-[#202D40] hover:text-white disabled:opacity-50"
                aria-label="Close invitation dialog"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-[#344357] bg-[#151C28] p-5 shadow-inner">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#C5D0DE]">
                Invitation details
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#C5D0DE]">Email</dt>
                  <dd className="break-all text-right font-medium text-white">
                    {inviteEmployee.email || "No email"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#C5D0DE]">Workforce role</dt>
                  <dd className="text-right font-medium text-white">
                    {roleLabel(inviteEmployee.workforce_role)}
                  </dd>
                </div>
              </dl>
            </div>

            {invitationError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs leading-relaxed text-rose-300"
              >
                {invitationError}
              </div>
            )}

            {invitationUrl ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 shadow-lg">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <Check size={16} />
                  Invitation created
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-emerald-200/90">
                  Copy this invitation link and share it with the employee through your approved channel.
                </p>
                <input
                  readOnly
                  value={invitationUrl}
                  aria-label="Invitation URL"
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-3.5 h-10 w-full rounded-xl border border-emerald-500/30 bg-[#151C28] px-3.5 text-xs text-[#F8FAFC] outline-none"
                />
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => void copyInvitationLink()}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#151C28] px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 shadow-xs"
                  >
                    {copiedInvitationLink ? <Check size={14} /> : <Copy size={14} />}
                    {copiedInvitationLink ? "Copied" : "Copy link"}
                  </button>
                  <a
                    href={invitationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 shadow-sm"
                  >
                    Open invitation
                  </a>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-[#C5D0DE]">
                Creating an invitation uses the backend invitation workflow and its server-side validation. An invitation can only be created when the employee profile has a valid email, a workforce role, and no pending invitation.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={creatingInvitation}
                onClick={() => {
                  setInviteEmployee(null);
                  setInvitationUrl("");
                  setInvitationError("");
                  setCopiedInvitationLink(false);
                }}
                className="rounded-xl border border-[#344357] bg-[#151C28] px-4 py-2.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-50"
              >
                Close
              </button>

              {!invitationUrl && (
                <button
                  type="button"
                  disabled={creatingInvitation || !canInvite}
                  onClick={() => void createInvitation()}
                  className="rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 disabled:opacity-50"
                >
                  {creatingInvitation ? "Creating…" : "Create invitation"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </HRManagerShell>
  );
}

export default function HRManagerEmployeesPage() {
  return (
    <Suspense fallback={<HRManagerLoading message="Loading employee workspace…" />}>
      <HRManagerEmployeesPageContent />
    </Suspense>
  );
}

