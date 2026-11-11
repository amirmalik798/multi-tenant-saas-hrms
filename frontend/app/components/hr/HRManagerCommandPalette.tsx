"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgeDollarSign,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  FileBarChart,
  KeyRound,
  Mail,
  Network,
  Search,
  ShieldCheck,
  Users,
  UserRound,
  X,
  RefreshCw,
  MapPin,
  Phone,
  BriefcaseBusiness,
  CircleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCountryWithFlag } from "../workforce/CountryPhoneFields";

import type { HRActivePage } from "./HRManagerChrome";

type EmployeeSearchResult = {
  id: string;
  employee_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  designation?: string | null;
  employment_status?: string | null;
  workforce_role?: string | null;
  department_name?: string | null;
  manager_name?: string | null;
};

type DepartmentSearchResult = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  manager_employee_code?: string | null;
  manager_email?: string | null;
  employee_count?: number | null;
  total_employee_count?: number | null;
  active_employee_count?: number | null;
  inactive_employee_count?: number | null;
  former_employee_count?: number | null;
};

type ApiResponse<T> = {
  status?: string;
  message?: string;
  employee?: T;
  department?: T;
  employees?: T[];
  departments?: T[];
};

type EntityType = "employee" | "department";
type PaletteSection =
  | "Workspace"
  | "People management"
  | "Attendance & time"
  | "Leave & holidays"
  | "Pay & policies"
  | "Performance & development"
  | "Employee experience"
  | "Reports & governance"
  | "Account"
  | "Employees"
  | "Departments";

type PaletteItem = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  section: PaletteSection;
  icon: LucideIcon;
  href?: string;
  entityType?: EntityType;
  entityId?: string;
};

type HRManagerCommandPaletteProps = {
  context: HRActivePage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type EmployeeDetails = EmployeeSearchResult & {
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  joining_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  department_id?: string | null;
  manager_id?: string | null;
  is_primary_hr_manager?: boolean;
  managed_departments?: Array<{
    id: string;
    name: string;
    status?: string;
  }>;
};

type DepartmentEmployee = {
  id: string;
  employee_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  designation?: string | null;
  employment_status?: string | null;
};

type DepartmentDetails = DepartmentSearchResult & {
  employees?: DepartmentEmployee[];
  manager_first_name?: string | null;
  manager_last_name?: string | null;
  manager_role?: string | null;
  manager_employment_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SelectedEntity = {
  type: EntityType;
  id: string;
  label: string;
};

const workspaceItems: PaletteItem[] = [
  {
    id: "dashboard",
    label: "People operations overview",
    description: "Workforce health, priorities and recent people activity",
    keywords: "home dashboard overview metrics command center people operations",
    section: "Workspace",
    icon: Activity,
    href: "/hr/dashboard",
  },
  {
    id: "profile",
    label: "My Profile",
    description: "Review your HR Manager details and update your profile photo",
    keywords: "my profile personal details account photo picture avatar",
    section: "Workspace",
    icon: UserRound,
    href: "/hr/profile",
  },
  {
    id: "work-queue",
    label: "Work queue",
    description: "Find attendance reviews and other open HR decisions",
    keywords: "work queue tasks pending reviews corrections overtime",
    section: "Workspace",
    icon: ClipboardCheck,
    href: "/hr/work-queue",
  },
  {
    id: "employees-page",
    label: "Employees",
    description: "Browse employee profiles, status and workforce history",
    keywords: "employees people staff directory employee records search profiles",
    section: "People management",
    icon: Users,
    href: "/hr/employees",
  },
  {
    id: "departments-page",
    label: "Departments",
    description: "Review department structure, assigned managers and headcount",
    keywords: "departments teams structure staffing managers",
    section: "People management",
    icon: Building2,
    href: "/hr/departments",
  },
  {
    id: "organization-chart",
    label: "Organization chart",
    description: "Explore workforce reporting relationships",
    keywords: "organization chart hierarchy reporting manager supervisor tree",
    section: "People management",
    icon: Network,
    href: "/hr/organization-chart",
  },
  {
    id: "invitations",
    label: "Invitations",
    description: "Track pending, accepted, expired and revoked invitations",
    keywords: "invitation onboarding activation pending accepted expired revoked access",
    section: "People management",
    icon: Mail,
    href: "/hr/invitations",
  },
  {
    id: "communications",
    label: "Messages",
    description: "Communicate privately with your Organization Admin and reply to your team",
    keywords: "messages communication inbox chat organization admin",
    section: "Employee experience",
    icon: Mail,
    href: "/hr/communications",
  },
  {
    id: "attendance",
    label: "Attendance & time",
    description: "Open attendance records, correction review and timekeeping settings",
    keywords: "attendance clock in clock out corrections overtime policy",
    section: "Attendance & time",
    icon: CheckCircle2,
    href: "/hr/modules/attendance",
  },
  {
    id: "time-schedules",
    label: "Schedules & time",
    description: "Manage schedule definitions and effective-dated assignments",
    keywords: "schedules shifts roster working hours time schedule assignment",
    section: "Attendance & time",
    icon: CalendarClock,
    href: "/hr/modules/time-schedules",
  },
  {
    id: "leave-holidays",
    label: "Leave & public holidays",
    description: "Review leave requests and manage the organization holiday calendar",
    keywords: "leave holiday absence annual sick vacation approval",
    section: "Leave & holidays",
    icon: CalendarDays,
    href: "/hr/modules/leave",
  },
  {
    id: "salary-payments",
    label: "Salary payments",
    description: "Review calculated monthly pay and record payment status",
    keywords: "payroll salary payments monthly earnings paid unpaid",
    section: "Pay & policies",
    icon: BadgeDollarSign,
    href: "/hr/modules/payroll",
  },
  {
    id: "employee-pay-rates",
    label: "Employee pay rates",
    description: "Manage hourly and overtime rates by effective date",
    keywords: "hourly rate overtime rate compensation pay rate",
    section: "Pay & policies",
    icon: BadgeDollarSign,
    href: "/hr/modules/pay-rates",
  },
  {
    id: "daily-attendance-report",
    label: "Daily attendance report",
    description: "Generate the existing organization-scoped attendance PDF",
    keywords: "reports analytics daily attendance pdf report records",
    section: "Reports & governance",
    icon: FileBarChart,
    href: "/hr/reports",
  },
  {
    id: "change-password",
    label: "Change password",
    description: "Update your HR Manager account password",
    keywords: "account password credentials security sign-in",
    section: "Account",
    icon: KeyRound,
    href: "/account/change-password",
  },
];

function readName(value: {
  first_name?: string | null;
  last_name?: string | null;
  employee_code?: string | null;
}): string {
  return (
    `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim() ||
    value.employee_code ||
    "Unnamed employee"
  );
}

function displayDate(value?: string | null): string {
  if (!value) return "Not provided";

  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "Not provided";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusTone(value?: string | null): string {
  switch ((value ?? "").toUpperCase()) {
    case "ACTIVE":
    case "ACCEPTED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

    case "PENDING":
    case "INACTIVE":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";

    case "FORMER":
    case "REVOKED":
    case "EXPIRED":
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";

    default:
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
  }
}

function statusText(value?: string | null): string {
  if (!value) return "Unknown";

  const normalized = value.toLowerCase().replace(/_/g, " ");

  return normalized.replace(/\b\w/g, (character) =>
    character.toUpperCase(),
  );
}

function roleText(value?: string | null): string {
  switch ((value ?? "").toUpperCase()) {
    case "HR_MANAGER":
      return "HR Manager";

    case "DEPARTMENT_MANAGER":
      return "Department Manager";

    case "EMPLOYEE":
      return "Employee";

    default:
      return value || "Role not specified";
  }
}

function DetailLine({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: string | number | null;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-[#344D68] bg-[#111827]/80 p-3.5">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#9AA8BA]">
        {Icon && <Icon size={14} aria-hidden="true" />}
        <span>{label}</span>
      </div>

      <div className="mt-1.5 break-words text-sm font-medium text-[#F8FAFC]">
        {value === null || value === undefined || value === ""
          ? "Not provided"
          : String(value)}
      </div>
    </div>
  );
}

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export function HRManagerCommandPalette({
  context,
  open,
  onOpenChange,
}: HRManagerCommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const [employeeResults, setEmployeeResults] = useState<
    EmployeeSearchResult[]
  >([]);

  const [departmentResults, setDepartmentResults] = useState<
    DepartmentSearchResult[]
  >([]);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selectedEntity, setSelectedEntity] =
    useState<SelectedEntity | null>(null);

  const [entityDetails, setEntityDetails] = useState<
    EmployeeDetails | DepartmentDetails | null
  >(null);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeDetailsRef = useRef<HTMLButtonElement | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const normalizedQuery = query
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);

  const overlayOpen = open || selectedEntity !== null;

  const contextHrefs: Record<HRActivePage, string> = {
    dashboard: "/hr/dashboard",
    profile: "/hr/profile",
    employees: "/hr/employees",
    departments: "/hr/departments",
    invitations: "/hr/invitations",
    "organization-chart": "/hr/organization-chart",
    "work-queue": "/hr/work-queue",
    reports: "/hr/reports",
    communications: "/hr/communications",
    modules: pathname ?? "/hr/modules",
  };

  const currentHref = pathname ?? contextHrefs[context];

  const filteredWorkspaceItems = useMemo(() => {
    const normalized = normalizedQuery.toLowerCase();

    if (!normalized) return workspaceItems;

    return workspaceItems.filter((item) =>
      `${item.label} ${item.description} ${item.keywords}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [normalizedQuery]);

  const entityItems = useMemo<PaletteItem[]>(() => {
    const employeeItems: PaletteItem[] = employeeResults.map(
      (employee) => {
        const employeeName = readName(employee);
        const role = roleText(employee.workforce_role);

        return {
          id: `employee-${employee.id}`,
          label: employeeName,
          description: [
            employee.employee_code || "No employee code",
            role,
            employee.department_name || "No department",
          ].join(" · "),
          keywords: `${employee.employee_code ?? ""} ${
            employee.email ?? ""
          } ${employee.designation ?? ""} ${role}`,
          section: "Employees",
          icon: Users,
          entityType: "employee",
          entityId: employee.id,
        };
      },
    );

    const departmentItems: PaletteItem[] = departmentResults.map(
      (department) => ({
        id: `department-${department.id}`,
        label: department.name,
        description: `${
          department.manager_name || "No manager assigned"
        } · ${
          department.total_employee_count ??
          department.employee_count ??
          0
        } employee(s) · ${statusText(department.status)}`,
        keywords: `${department.description ?? ""} ${
          department.manager_name ?? ""
        } ${department.manager_employee_code ?? ""} ${
          department.manager_email ?? ""
        }`,
        section: "Departments",
        icon: Building2,
        entityType: "department",
        entityId: department.id,
      }),
    );

    return [...employeeItems, ...departmentItems];
  }, [employeeResults, departmentResults]);

  const filteredItems = useMemo(() => {
    const normalized = normalizedQuery.toLowerCase();
    const matchedWorkspace = filteredWorkspaceItems;
    const matchedEntities = normalized.length >= 2 ? entityItems : [];

    return [...matchedEntities, ...matchedWorkspace];
  }, [entityItems, filteredWorkspaceItems, normalizedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (activeIndex >= filteredItems.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, filteredItems.length]);

  useEffect(() => {
    function handleGlobalShortcuts(
      event: globalThis.KeyboardEvent,
    ) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }

      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", handleGlobalShortcuts);

    return () => {
      window.removeEventListener("keydown", handleGlobalShortcuts);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const previousActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setQuery("");
    setEmployeeResults([]);
    setDepartmentResults([]);
    setSearchError("");

    const focusFrame = window.requestAnimationFrame(() =>
      inputRef.current?.focus(),
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);

      if (previousActive?.isConnected) {
        previousActive.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) {
      setEmployeeResults([]);
      setDepartmentResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

    setEmployeeResults([]);
    setDepartmentResults([]);
    setSearchError("");

    const timeout = window.setTimeout(() => {
      void (async () => {
        setSearchLoading(true);

        try {
          const employeeParams = new URLSearchParams({
            q: normalizedQuery,
            page: "1",
            limit: "10",
            sortBy: "name",
            sortOrder: "asc",
          });

          const departmentParams = new URLSearchParams({
            q: normalizedQuery,
            page: "1",
            limit: "10",
            includeInactive: "true",
          });

          const [employeeResponse, departmentResponse] =
            await Promise.all([
              fetch(
                `/api/backend/employees?${employeeParams.toString()}`,
                {
                  method: "GET",
                  credentials: "same-origin",
                  cache: "no-store",
                  signal: controller.signal,
                },
              ).catch(() => null),

              fetch(
                `/api/backend/departments?${departmentParams.toString()}`,
                {
                  method: "GET",
                  credentials: "same-origin",
                  cache: "no-store",
                  signal: controller.signal,
                },
              ).catch(() => null),
            ]);

          if (controller.signal.aborted) return;

          if (
            employeeResponse?.status === 401 ||
            departmentResponse?.status === 401
          ) {
            router.replace("/");
            return;
          }

          const [employeeData, departmentData] = await Promise.all([
            employeeResponse
              ? readJson<ApiResponse<EmployeeSearchResult>>(
                  employeeResponse,
                )
              : Promise.resolve(null),

            departmentResponse
              ? readJson<ApiResponse<DepartmentSearchResult>>(
                  departmentResponse,
                )
              : Promise.resolve(null),
          ]);

          if (controller.signal.aborted) return;

          const employeeOk = Boolean(
            employeeResponse?.ok &&
              Array.isArray(employeeData?.employees),
          );

          const departmentOk = Boolean(
            departmentResponse?.ok &&
              Array.isArray(departmentData?.departments),
          );

          setEmployeeResults(
            employeeOk && Array.isArray(employeeData?.employees)
              ? employeeData.employees.slice(0, 10)
              : [],
          );

          setDepartmentResults(
            departmentOk && Array.isArray(departmentData?.departments)
              ? departmentData.departments.slice(0, 10)
              : [],
          );

          if (!employeeOk && !departmentOk) {
            const message =
              employeeData?.message || departmentData?.message;

            setSearchError(
              message || "Entity search is temporarily unavailable.",
            );
          } else if (!employeeOk || !departmentOk) {
            setSearchError(
              "Some search results could not be loaded. You can still use the available results.",
            );
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setSearchError(
              error instanceof Error
                ? error.message
                : "Unable to search employees and departments.",
            );
          }
        } finally {
          if (!controller.signal.aborted) {
            setSearchLoading(false);
          }
        }
      })();
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, normalizedQuery, router]);

  useEffect(() => {
    if (!selectedEntity) {
      setEntityDetails(null);
      setDetailsError("");
      setDetailsLoading(false);
      return;
    }

    const controller = new AbortController();

    setEntityDetails(null);
    setDetailsError("");
    setDetailsLoading(true);

    const endpoint =
      selectedEntity.type === "employee"
        ? `/api/backend/employees/${encodeURIComponent(
            selectedEntity.id,
          )}`
        : `/api/backend/departments/${encodeURIComponent(
            selectedEntity.id,
          )}`;

    void (async () => {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await readJson<
          ApiResponse<EmployeeDetails | DepartmentDetails>
        >(response);

        if (controller.signal.aborted) return;

        if (response.status === 401) {
          router.replace("/");
          return;
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
              `Unable to load ${selectedEntity.type} details.`,
          );
        }

        const details =
          selectedEntity.type === "employee"
            ? data?.employee
            : data?.department;

        if (!details) {
          throw new Error(
            `No ${selectedEntity.type} details were returned.`,
          );
        }

        setEntityDetails(details);
      } catch (error) {
        if (!controller.signal.aborted) {
          setDetailsError(
            error instanceof Error
              ? error.message
              : `Unable to load ${selectedEntity.type} details.`,
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailsLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [selectedEntity, router]);

  useEffect(() => {
    if (!overlayOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [overlayOpen]);

  useEffect(() => {
    if (!selectedEntity) return;

    const focusFrame = window.requestAnimationFrame(() =>
      closeDetailsRef.current?.focus(),
    );

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedEntity(null);

        window.requestAnimationFrame(() => {
          if (openerRef.current?.isConnected) {
            openerRef.current.focus();
          }
        });
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedEntity]);

  function activate(item: PaletteItem) {
    if (item.entityType && item.entityId) {
      openerRef.current =
        searchTriggerRef.current ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);

      setSelectedEntity({
        type: item.entityType,
        id: item.entityId,
        label: item.label,
      });

      onOpenChange(false);
      return;
    }

    if (item.href) {
      onOpenChange(false);

      if (item.href !== currentHref) {
        router.push(item.href);
      }
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex((index) =>
        filteredItems.length
          ? (index + 1) % filteredItems.length
          : 0,
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((index) =>
        filteredItems.length
          ? (index - 1 + filteredItems.length) %
            filteredItems.length
          : 0,
      );

      return;
    }

    if (event.key === "Enter" && filteredItems[activeIndex]) {
      event.preventDefault();
      activate(filteredItems[activeIndex]);
      return;
    }

    if (event.key === "Tab" && dialogRef.current) {
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => element.getAttribute("aria-hidden") !== "true",
      );

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const closeDetails = useCallback(() => {
    setSelectedEntity(null);

    window.requestAnimationFrame(() => {
      if (openerRef.current?.isConnected) {
        openerRef.current.focus();
      }
    });
  }, []);

  function renderDetailDrawer() {
    if (!selectedEntity) return null;

    const isEmployee = selectedEntity.type === "employee";

    const employee = isEmployee
      ? (entityDetails as EmployeeDetails | null)
      : null;

    const department = !isEmployee
      ? (entityDetails as DepartmentDetails | null)
      : null;

    const employeeName = employee
      ? readName(employee)
      : selectedEntity.label;

    const departmentManagerName = department
      ? department.manager_name ||
        [
          department.manager_first_name,
          department.manager_last_name,
        ]
          .filter(Boolean)
          .join(" ") ||
        "No manager assigned"
      : "";

    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex justify-end bg-black/65 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeDetails();
          }
        }}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="hr-entity-drawer-title"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;

            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            ).filter(
              (element) =>
                element.getAttribute("aria-hidden") !== "true",
            );

            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (
              event.shiftKey &&
              document.activeElement === first
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === last
            ) {
              event.preventDefault();
              first.focus();
            }
          }}
          className="flex h-full w-full max-w-2xl flex-col border-l border-[#46607B] bg-[#151C28] text-[#F8FAFC] shadow-[-24px_0_80px_rgba(0,0,0,0.5)]"
        >
          <header className="flex items-start gap-3 border-b border-[#344D68] px-5 py-5 sm:px-7">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#60A5FA]/25 bg-[#60A5FA]/[0.08] text-[#DBEAFE]">
              {isEmployee ? (
                <UserRound size={20} />
              ) : (
                <Building2 size={20} />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9AA8BA]">
                {isEmployee ? "Employee profile" : "Department details"}
              </p>

              <h2
                id="hr-entity-drawer-title"
                className="mt-1 break-words text-lg font-bold text-white"
              >
                {isEmployee
                  ? employeeName
                  : department?.name || selectedEntity.label}
              </h2>

              <p className="mt-1 text-xs text-[#C5D0DE]">
                {isEmployee
                  ? employee?.employee_code || selectedEntity.id
                  : department?.manager_name ||
                    (department
                      ? departmentManagerName
                      : "Loading department…")}
              </p>
            </div>

            <button
              ref={closeDetailsRef}
              type="button"
              aria-label="Close entity details"
              onClick={closeDetails}
              className="rounded-lg border border-white/10 p-2 text-[#C5D0DE] transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA]"
            >
              <X size={17} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {detailsLoading && (
              <div className="flex items-center gap-3 rounded-xl border border-[#344D68] bg-[#111827] p-5 text-sm text-[#E8EEF5]">
                <RefreshCw
                  size={17}
                  className="animate-spin text-[#60A5FA]"
                />
                Loading {isEmployee ? "employee" : "department"} details…
              </div>
            )}

            {detailsError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
              >
                <CircleAlert
                  size={17}
                  className="mt-0.5 shrink-0 text-rose-300"
                />
                <span>{detailsError}</span>
              </div>
            )}

            {!detailsLoading && !detailsError && employee && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#344D68] bg-[#111827] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#46607B] bg-[#24354A] text-sm font-bold text-[#DBEAFE]">
                      {employeeName
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join("") || "EM"}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-white">
                        {employeeName}
                      </p>
                      <p className="mt-1 text-xs text-[#C5D0DE]">
                        {employee.designation ||
                          roleText(employee.workforce_role)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(
                      employee.employment_status,
                    )}`}
                  >
                    {statusText(employee.employment_status)}
                  </span>
                </div>

                <section>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#9AA8BA]">
                    Personal and employment details
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailLine
                      label="Employee code"
                      value={employee.employee_code}
                      icon={Users}
                    />
                    <DetailLine
                      label="Workforce role"
                      value={roleText(employee.workforce_role)}
                      icon={ShieldCheck}
                    />
                    <DetailLine
                      label="Email"
                      value={employee.email}
                      icon={Mail}
                    />
                    <DetailLine
                      label="Phone"
                      value={employee.phone}
                      icon={Phone}
                    />
                    <DetailLine
                      label="Department"
                      value={employee.department_name}
                      icon={Building2}
                    />
                    <DetailLine
                      label="Reporting manager"
                      value={employee.manager_name}
                      icon={Users}
                    />
                    <DetailLine
                      label="Country"
                      value={formatCountryWithFlag(employee.country)}
                      icon={MapPin}
                    />
                    <DetailLine
                      label="City"
                      value={employee.city}
                      icon={MapPin}
                    />
                    <DetailLine
                      label="Joining date"
                      value={displayDate(employee.joining_date)}
                      icon={CalendarDays}
                    />
                    <DetailLine
                      label="Job title"
                      value={employee.designation}
                      icon={BriefcaseBusiness}
                    />
                  </div>
                </section>

                {employee.managed_departments &&
                  employee.managed_departments.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#9AA8BA]">
                        Managed departments
                      </h3>

                      <div className="space-y-2">
                        {employee.managed_departments.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[#344D68] bg-[#111827] px-3.5 py-3"
                          >
                            <span className="text-sm font-medium text-[#F8FAFC]">
                              {item.name}
                            </span>

                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] ${statusTone(
                                item.status,
                              )}`}
                            >
                              {statusText(item.status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                <p className="text-[11px] text-[#9AA8BA]">
                  Profile created: {displayDate(employee.created_at)} · Last
                  updated: {displayDate(employee.updated_at)}
                </p>
              </div>
            )}

            {!detailsLoading && !detailsError && department && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#344D68] bg-[#111827] p-4">
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold text-white">
                      {department.name}
                    </p>
                    <p className="mt-1 text-xs text-[#C5D0DE]">
                      {department.description ||
                        "No department description provided."}
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(
                      department.status,
                    )}`}
                  >
                    {statusText(department.status)}
                  </span>
                </div>

                <section>
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#9AA8BA]">
                    Department overview
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailLine
                      label="Assigned manager"
                      value={departmentManagerName}
                      icon={Users}
                    />
                    <DetailLine
                      label="Manager employee code"
                      value={department.manager_employee_code}
                      icon={ShieldCheck}
                    />
                    <DetailLine
                      label="Manager email"
                      value={department.manager_email}
                      icon={Mail}
                    />
                    <DetailLine
                      label="Total employees"
                      value={
                        department.total_employee_count ??
                        department.employee_count ??
                        department.employees?.length ??
                        0
                      }
                      icon={Users}
                    />
                    <DetailLine
                      label="Active employees"
                      value={department.active_employee_count ?? 0}
                      icon={CheckCircle2}
                    />
                    <DetailLine
                      label="Inactive employees"
                      value={department.inactive_employee_count ?? 0}
                      icon={Users}
                    />
                    <DetailLine
                      label="Former employees"
                      value={department.former_employee_count ?? 0}
                      icon={Users}
                    />
                    <DetailLine
                      label="Department ID"
                      value={department.id}
                      icon={Building2}
                    />
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9AA8BA]">
                      Department employees
                    </h3>
                    <span className="text-[11px] text-[#9AA8BA]">
                      {department.employees?.length ?? 0} shown
                    </span>
                  </div>

                  {department.employees?.length ? (
                    <div className="space-y-2">
                      {department.employees.map((person) => (
                        <div
                          key={person.id}
                          className="flex items-center gap-3 rounded-xl border border-[#344D68] bg-[#111827] p-3"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#46607B] bg-[#24354A] text-[11px] font-bold text-[#DBEAFE]">
                            {readName(person)
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase())
                              .join("") || "EM"}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#F8FAFC]">
                              {readName(person)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[#9AA8BA]">
                              {person.employee_code || "No employee code"}
                              {person.designation
                                ? ` · ${person.designation}`
                                : ""}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusTone(
                              person.employment_status,
                            )}`}
                          >
                            {statusText(person.employment_status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#46607B] px-4 py-8 text-center">
                      <Users size={22} className="mx-auto text-[#9AA8BA]" />
                      <p className="mt-2 text-sm font-semibold text-[#E8EEF5]">
                        No employees listed
                      </p>
                      <p className="mt-1 text-xs text-[#9AA8BA]">
                        This department has no employee records to display in
                        this view.
                      </p>
                    </div>
                  )}
                </section>

                <p className="text-[11px] text-[#9AA8BA]">
                  Department created: {displayDate(department.created_at)} ·
                  Last updated: {displayDate(department.updated_at)}
                </p>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-[#344D68] bg-[#111827] px-5 py-3.5 sm:px-7">
            <span className="text-[10px] text-[#9AA8BA]">
              HR Manager workspace · organization-scoped results
            </span>
            <button
              type="button"
              onClick={closeDetails}
              className="rounded-lg border border-[#46607B] px-3 py-2 text-xs font-semibold text-[#F8FAFC] transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA]"
            >
              Close details
            </button>
          </footer>
        </aside>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <button
        ref={searchTriggerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label="Search HR workspace, employees, and departments"
        className="flex h-10.5 w-full min-w-0 items-center gap-3 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 text-left text-xs font-medium text-[#E8EEF5] outline-none transition hover:border-blue-500/50 hover:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus-visible:ring-2 focus-visible:ring-blue-500/30 shadow-inner"
      >
        <Search size={17} className="shrink-0 text-[#C5D0DE]" />
        <span className="min-w-0 flex-1 truncate">
          Search employees, departments, or actions…
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-[8vh] backdrop-blur-md sm:p-5 sm:pt-[10vh]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                onOpenChange(false);
              }
            }}
          >
            <section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="hr-command-title"
              aria-describedby="hr-command-description"
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              className="hr-manager-command-palette w-full max-w-2xl overflow-hidden rounded-2xl border border-[#46607B] bg-[#151C28] text-[#F8FAFC] shadow-[0_28px_90px_rgba(0,0,0,0.65)]"
            >
              <div className="flex items-center gap-3 border-b border-[#344D68] px-4 py-4 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-blue-500/[0.08] text-blue-300">
                  <Search size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="hr-command-title"
                    className="text-sm font-semibold text-white"
                  >
                    HR command palette
                  </h2>
                  <p
                    id="hr-command-description"
                    className="mt-0.5 text-[11px] text-[#9AA8BA]"
                  >
                    Search employees and departments, or navigate your HR
                    workspace.
                  </p>
                </div>
                <kbd className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-[#9AA8BA]">
                  ESC
                </kbd>
                <button
                  type="button"
                  aria-label="Close command palette"
                  onClick={() => onOpenChange(false)}
                  className="rounded-md border border-white/[0.08] p-1.5 text-[#C5D0DE] transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="border-b border-[#344D68] px-4 py-3 sm:px-5">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-3 text-[#9AA8BA]"
                  />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value.slice(0, 100))
                    }
                    placeholder="Type an employee name, email, code, department, or action…"
                    className="h-10 w-full rounded-lg border border-white/10 bg-[#0B0F17] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#9AA8BA] focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
                    aria-label="Search HR workspace"
                    aria-controls="hr-command-results"
                    aria-activedescendant={
                      filteredItems[activeIndex]
                        ? `hr-command-option-${filteredItems[activeIndex].id}`
                        : undefined
                    }
                    autoComplete="off"
                  />
                </div>
                <p className="mt-2 text-[10px] text-[#9AA8BA]">
                  Enter at least two characters to search employee and department
                  records.
                </p>
              </div>

              <div
                id="hr-command-results"
                role="listbox"
                aria-label="HR workspace results"
                className="max-h-[min(58vh,520px)] overflow-y-auto p-2"
              >
                {searchLoading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-[#C5D0DE]">
                    <RefreshCw
                      size={14}
                      className="animate-spin text-blue-400"
                    />
                    Searching your organization…
                  </div>
                )}

                {searchError && (
                  <p
                    role="status"
                    className="mx-2 my-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200"
                  >
                    {searchError}
                  </p>
                )}

                {filteredItems.length
                  ? filteredItems.map((item, index) => {
                      const Icon = item.icon;
                      const previous = filteredItems[index - 1];
                      const sectionLabel =
                        item.section === "Workspace"
                          ? "Workspace navigation"
                          : item.section;
                      const previousSection =
                        previous?.section === "Workspace"
                          ? "Workspace navigation"
                          : previous?.section;

                      return (
                        <div key={item.id}>
                          {(index === 0 ||
                            previousSection !== sectionLabel) && (
                            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9AA8BA]">
                              {sectionLabel}
                            </p>
                          )}

                          <button
                            id={`hr-command-option-${item.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === activeIndex}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => activate(item)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                              index === activeIndex
                                ? "border-blue-500/25 bg-blue-500/[0.08]"
                                : "border-transparent hover:bg-white/[0.035]"
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                index === activeIndex
                                  ? "bg-blue-500/10 text-blue-300"
                                  : "bg-white/[0.04] text-[#C5D0DE]"
                              }`}
                            >
                              <Icon size={17} />
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[#F8FAFC]">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block truncate text-xs leading-5 text-[#C5D0DE]">
                                {item.description}
                              </span>
                            </span>

                            {item.href === currentHref && (
                              <span className="rounded-full border border-cyan-400/25 bg-blue-500/[0.07] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-blue-200">
                                Current
                              </span>
                            )}

                            {item.entityType && (
                              <span className="hidden items-center gap-1 text-[10px] text-blue-300 sm:inline-flex">
                                View details <ArrowUpRight size={12} />
                              </span>
                            )}

                            {!item.entityType &&
                              index === activeIndex && (
                                <kbd className="hidden text-[10px] text-blue-200 sm:inline">
                                  Enter ↵
                                </kbd>
                              )}

                            {!item.entityType &&
                              item.href &&
                              item.href !== currentHref && (
                                <ChevronRight
                                  size={14}
                                  className="shrink-0 text-[#8A9AAF]"
                                />
                              )}
                          </button>
                        </div>
                      );
                    })
                  : !searchLoading && (
                      <div className="px-4 py-10 text-center">
                        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-[#C5D0DE]">
                          <Search size={20} />
                        </span>
                        <p className="mt-3 text-sm font-semibold text-[#F8FAFC]">
                          No matching results
                        </p>
                        <p className="mt-1 text-xs text-[#9AA8BA]">
                          Try an employee name, employee code, department name,
                          Dashboard, Invitations, or Reports.
                        </p>
                      </div>
                    )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#344D68] bg-[#111827] px-4 py-3 text-[10px] text-[#9AA8BA] sm:px-5">
                <span>
                  <kbd className="rounded border border-white/10 px-1.5 py-0.5">
                    ↑
                  </kbd>{" "}
                  <kbd className="rounded border border-white/10 px-1.5 py-0.5">
                    ↓
                  </kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd className="rounded border border-white/10 px-1.5 py-0.5">
                    Enter
                  </kbd>{" "}
                  select
                </span>
                <span className="ml-auto">
                  HR Manager · Current organization
                </span>
              </div>
            </section>
          </div>,
          document.body,
        )}

      {renderDetailDrawer()}
    </>
  );
}