"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { OrganizationAdminSidebar, OrganizationAdminHeader, useOrganizationAdminAutoRefresh } from "../../components/org-admin/OrganizationAdminChrome";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";
import Link from "next/link";

type OrgAdminUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type EmployeeResponse = {
  pagination?: { total?: number; totalPages?: number; page?: number; limit?: number };
  employees?: Array<Record<string, unknown>>;
  message?: string;
};

type DepartmentResponse = {
  status?: string;
  message?: string;
  departments?: Department[];
  pagination?: { total?: number; totalPages?: number; page?: number; limit?: number };
};

type Department = {
  id: string;
  name: string;
  status: string | null;
  employee_count?: number;
  total_employee_count?: number;
  active_employee_count?: number;
  inactive_employee_count?: number;
  former_employee_count?: number;
  manager_id?: string | null;
  manager_name?: string | null;
  manager_employee_code?: string | null;
  manager_role?: string | null;
  manager_employment_status?: string | null;
  manager_account_status?: string | null;
  manager_eligible?: boolean;
};

type OrgDashboardStats = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  formerEmployees: number;
  assignedEmployees: number;
  unassignedEmployees: number;
  totalDepartments: number;
  activeDepartments: number;
  inactiveDepartments: number;
  departmentsWithEligibleManager: number;
  departmentsWithoutEligibleManager: number;
  departmentStaffingRate: number;
  healthScore: number;
  healthLabel: string;
  hrManagerProfiles: number;
  departmentManagerProfiles: number;
  employeeProfiles: number;
  activeHrManagers: number;
  activeDepartmentManagers: number;
  activePrimaryHrManagers: number;
  pendingInvitations: number;
  expiredPendingInvitations: number;
};

type OrgDashboardResponse = {
  status?: string;
  message?: string;
  organization?: { id: string; name: string; status: string };
  stats?: OrgDashboardStats;
  departmentDistribution?: Department[];
};

type OrganizationActivity = {
  id: string;
  actorEmail: string | null;
  actionKey: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

type OrganizationActivityResponse = {
  status?: string;
  message?: string;
  activities?: OrganizationActivity[];
};

type ActivityFilter = "all" | "created" | "updated" | "removed" | "other";
type ActivityGroup = { label: string; items: OrganizationActivity[] };

type IconName =
  | "dashboard"
  | "building"
  | "users"
  | "layers"
  | "search"
  | "command"
  | "logout"
  | "arrow"
  | "shield"
  | "mail"
  | "close"
  | "chevron"
  | "calendar"
  | "clock"
  | "check"
  | "briefcase"
  | "activity"
  | "userCheck"
  | "alert"
  | "download"
  | "sparkles";

function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const artwork: Record<IconName, ReactNode> = {
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
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    command: <path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7Z" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    userCheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></>,
    alert: <><path d="M10.3 3.9 1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    sparkles: <><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></>,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} {...shared}>
      {artwork[name]}
    </svg>
  );
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatActivityLabel(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatActivityTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getActivityCategory(value: string): Exclude<ActivityFilter, "all"> {
  const action = value.toLowerCase();
  if (["create", "invite", "add", "register", "provision"].some((part) => action.includes(part))) return "created";
  if (["delete", "remove", "suspend", "deactivate", "revoke"].some((part) => action.includes(part))) return "removed";
  if (["update", "edit", "status", "change", "assign", "approve", "reject"].some((part) => action.includes(part))) return "updated";
  return "other";
}

function getActivityGroupLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayDifference = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
}

export default function OrganizationDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [organizationLogoVersion, setOrganizationLogoVersion] = useState(0);
  const [employeeTotal, setEmployeeTotal] = useState<number | null>(null);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState("");
  const [reportExporting, setReportExporting] = useState(false);
  const [reportExportError, setReportExportError] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departmentsError, setDepartmentsError] = useState("");
  const [dashboardStats, setDashboardStats] = useState<OrgDashboardStats | null>(null);
  const [activities, setActivities] = useState<OrganizationActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const hasLoadedDashboardRef = useRef(false);
  const hasLoadedActivityRef = useRef(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);

  // Keyboard shortcut listener for Command Palette (Cmd+K) and Escape key modal closure
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setSelectedDepartment(null);
        setCommandPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const refreshLogo = () => setOrganizationLogoVersion(Date.now());
    window.addEventListener("hrms:organization-logo-updated", refreshLogo);
    return () => window.removeEventListener("hrms:organization-logo-updated", refreshLogo);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function verifySession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || data?.authenticated !== true || data?.user?.role !== "ORGANIZATION_ADMIN" || !data?.user?.organizationId) {
          router.replace("/");
          return;
        }

        if (isActive) setUser(data.user as OrgAdminUser);
      } catch (error) {
        console.error("Organization dashboard session check failed:", error);
        router.replace("/");
      } finally {
        if (isActive) setChecking(false);
      }
    }

    void verifySession();
    return () => { isActive = false; };
  }, [router]);

  // Load the tenant-scoped dashboard summary from one repeatable-read API
  // snapshot. Employee and department totals therefore agree with the same
  // backend calculation instead of being recomputed from a partial page.
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadDashboardData() {
      if (!hasLoadedDashboardRef.current) {
        setEmployeesLoading(true);
        setDepartmentsLoading(true);
      }
      setEmployeesError("");
      setDepartmentsError("");

      try {
        const response = await fetch("/api/backend/org/dashboard/stats", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null) as OrgDashboardResponse | null;

        if (response.status === 401) {
          router.replace("/");
          throw new Error("Your session has expired. Please sign in again.");
        }
        if (!response.ok) {
          throw new Error(data?.message || "Unable to load organization dashboard statistics.");
        }
        if (
          data?.status !== "ok" ||
          !data.stats ||
          typeof data.stats.totalEmployees !== "number" ||
          typeof data.stats.totalDepartments !== "number" ||
          !Array.isArray(data.departmentDistribution)
        ) {
          throw new Error("The organization dashboard response was incomplete.");
        }

        if (active) {
          setDashboardStats(data.stats);
          setEmployeeTotal(data.stats.totalEmployees);
          setDepartments(data.departmentDistribution);
          hasLoadedDashboardRef.current = true;
        }
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Unable to load organization dashboard statistics.";
        if (active) {
          if (!hasLoadedDashboardRef.current) setDashboardStats(null);
          setEmployeesError(message);
          setDepartmentsError(message);
        }
      } finally {
        if (active) {
          setEmployeesLoading(false);
          setDepartmentsLoading(false);
        }
      }
    }

    void loadDashboardData();
    return () => { active = false; };
  }, [user, router, refreshKey]);

  // Activity is limited by the server to the authenticated organization's audit records.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const controller = new AbortController();

    async function loadRecentActivity() {
      if (!hasLoadedActivityRef.current) setActivitiesLoading(true);
      setActivitiesError("");
      try {
        const response = await fetch("/api/backend/org/dashboard/activity?limit=10", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null) as OrganizationActivityResponse | null;
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error(data?.message || "Unable to load recent organization activity.");
        if (data?.status !== "ok" || !Array.isArray(data.activities)) {
          throw new Error("The recent activity response was incomplete.");
        }
        if (active) {
          setActivities(data.activities);
          hasLoadedActivityRef.current = true;
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          if (!hasLoadedActivityRef.current) setActivities([]);
          setActivitiesError(error instanceof Error ? error.message : "Unable to load recent organization activity.");
        }
      } finally {
        if (active && !controller.signal.aborted) setActivitiesLoading(false);
      }
    }

    void loadRecentActivity();
    return () => { active = false; controller.abort(); };
  }, [user, router, refreshKey]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", { method: "POST", credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Organization Admin logout failed:", error);
      setLogoutError(error instanceof Error ? error.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  // Fetch every employee page before exporting so the report cannot silently
  // claim a total that exceeds the number of employee records it contains.
  async function handleExportReport() {
    if (!user || reportExporting) return;
    setReportExporting(true);
    setReportExportError("");
    try {
      const [firstResponse, departmentResponse] = await Promise.all([
        fetch("/api/backend/employees?page=1&limit=100", {
          method: "GET", credentials: "same-origin", cache: "no-store",
        }),
        fetch("/api/backend/departments?includeInactive=true", {
          method: "GET", credentials: "same-origin", cache: "no-store",
        }),
      ]);
      const [firstData, departmentData] = await Promise.all([
        firstResponse.json().catch(() => null) as Promise<EmployeeResponse | null>,
        departmentResponse.json().catch(() => null) as Promise<DepartmentResponse | null>,
      ]);
      if (firstResponse.status === 401 || departmentResponse.status === 401) {
        router.replace("/");
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (!firstResponse.ok) throw new Error(firstData?.message || "Could not load employees for the report.");
      if (!firstData?.pagination || typeof firstData.pagination.total !== "number" || !Array.isArray(firstData.employees)) {
        throw new Error("The employee response was incomplete; no report was exported.");
      }
      if (!departmentResponse.ok) throw new Error(departmentData?.message || "Could not load departments for the report.");
      if (!departmentData || !Array.isArray(departmentData.departments)) {
        throw new Error("The department response was incomplete; no report was exported.");
      }

      const totalEmployeesForReport = firstData.pagination.total;
      const totalPagesForReport = Math.max(1, Number(firstData.pagination.totalPages) || 1);
      const allEmployees = [...firstData.employees];
      const pageSize = 100;
      // Use small parallel batches to avoid one request per page serially while
      // keeping the workload predictable for larger organizations.
      for (let page = 2; page <= totalPagesForReport; page += 5) {
        const pages = Array.from(
          { length: Math.min(5, totalPagesForReport - page + 1) },
          (_, index) => page + index,
        );
        const results = await Promise.all(pages.map(async (pageNumber) => {
          const response = await fetch(`/api/backend/employees?page=${pageNumber}&limit=${pageSize}`, {
            method: "GET", credentials: "same-origin", cache: "no-store",
          });
          const data = await response.json().catch(() => null) as EmployeeResponse | null;
          if (response.status === 401) {
            router.replace("/");
            throw new Error("Your session has expired. Please sign in again.");
          }
          if (!response.ok || !Array.isArray(data?.employees)) {
            throw new Error(data?.message || `Could not load employee page ${pageNumber}. No partial report was exported.`);
          }
          return data.employees;
        }));
        results.forEach((employees) => allEmployees.push(...employees));
      }

      if (allEmployees.length !== totalEmployeesForReport) {
        throw new Error(`The report loaded ${allEmployees.length} of ${totalEmployeesForReport} employee records. No partial report was exported; try again.`);
      }

      const reportData = {
        organization: user.organizationName,
        generatedAt: new Date().toISOString(),
        totalEmployees: totalEmployeesForReport,
        totalDepartments: departmentData.departments.length,
        departments: departmentData.departments,
        employees: allEmployees,
      };
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${user.organizationName.toLowerCase().replace(/\s+/g, "-")}-report.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setReportExportError(error instanceof Error ? error.message : "Could not export the report.");
    } finally {
      setReportExporting(false);
    }
  }

  const activeDepartments = dashboardStats?.activeDepartments ?? departments.filter((department) => (department.status ?? "").toUpperCase() === "ACTIVE").length;
  const totalEmployeesInDepts = dashboardStats?.assignedEmployees ?? departments.reduce((acc, dept) => acc + Number(dept.total_employee_count ?? dept.employee_count ?? 0), 0);
  const totalEmployees = dashboardStats?.totalEmployees ?? employeeTotal ?? 0;
  const unassignedEmployees = dashboardStats?.unassignedEmployees ?? Math.max(0, totalEmployees - totalEmployeesInDepts);
  const staffingRate = dashboardStats?.departmentStaffingRate ?? (totalEmployees > 0 ? Math.round((totalEmployeesInDepts / totalEmployees) * 100) : 0);
  const activeEmployees = dashboardStats?.activeEmployees ?? 0;
  const inactiveEmployees = dashboardStats?.inactiveEmployees ?? 0;
  const formerEmployees = dashboardStats?.formerEmployees ?? 0;
  const statusTotal = activeEmployees + inactiveEmployees + formerEmployees;
  const statusCountsReconcile = statusTotal === totalEmployees;
  const unclassifiedEmployees = Math.max(0, totalEmployees - statusTotal);
  const activeShare = totalEmployees > 0 ? (activeEmployees / totalEmployees) * 100 : 0;
  const inactiveShare = totalEmployees > 0 ? (inactiveEmployees / totalEmployees) * 100 : 0;
  const formerShare = totalEmployees > 0 ? (formerEmployees / totalEmployees) * 100 : 0;
  const unclassifiedShare = totalEmployees > 0 ? (unclassifiedEmployees / totalEmployees) * 100 : 0;
  const statusChartBackground = totalEmployees > 0 && statusTotal <= totalEmployees
    ? `conic-gradient(#34d399 0% ${activeShare}%, #60a5fa ${activeShare}% ${activeShare + inactiveShare}%, #fbbf24 ${activeShare + inactiveShare}% ${activeShare + inactiveShare + formerShare}%, #64748b ${activeShare + inactiveShare + formerShare}% 100%)`
    : "conic-gradient(#334155 0% 100%)";
  const departmentAssignedSum = departments.reduce((sum, department) => sum + Math.max(0, Number(department.total_employee_count ?? department.employee_count ?? 0)), 0);
  const departmentTotalsReconcile = departmentAssignedSum === totalEmployeesInDepts;
  const managementCoverage = (dashboardStats?.totalDepartments ?? departments.length) > 0
    ? Math.round(((dashboardStats?.departmentsWithEligibleManager ?? 0) / (dashboardStats?.totalDepartments ?? departments.length)) * 100)
    : 0;

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => Number(b.total_employee_count ?? b.employee_count ?? 0) - Number(a.total_employee_count ?? a.employee_count ?? 0)),
    [departments],
  );
  const topDepartments = sortedDepartments;
  const isRefreshing = employeesLoading || departmentsLoading;

  useOrganizationAdminAutoRefresh(
    () => setRefreshKey((current) => current + 1),
    { enabled: Boolean(user), shouldRefresh: () => !isRefreshing },
  );

  const filteredActivities = useMemo(() => activities.filter((activity) => activityFilter === "all" || getActivityCategory(activity.actionKey) === activityFilter), [activities, activityFilter]);
  const groupedActivities = useMemo<ActivityGroup[]>(() => {
    const groups = new Map<string, OrganizationActivity[]>();
    filteredActivities.forEach((activity) => {
      const label = getActivityGroupLabel(activity.createdAt);
      const items = groups.get(label) ?? [];
      items.push(activity);
      groups.set(label, items);
    });
    return Array.from(groups, ([label, items]) => ({ label, items }));
  }, [filteredActivities]);

  const metrics = [
    {
      label: "Total Team Members",
      value: employeesLoading ? "…" : employeesError ? "—" : totalEmployees.toLocaleString(),
      description: "All employment statuses",
      icon: "users" as IconName,
      iconStyle: "border-[#35465b] bg-[#182232] text-slate-200",
    },
    {
      label: "Active Departments",
      value: departmentsLoading ? "…" : departmentsError ? "—" : activeDepartments.toLocaleString(),
      description: `Out of ${(dashboardStats?.totalDepartments ?? departments.length).toLocaleString()} total departments`,
      icon: "building" as IconName,
      iconStyle: "border-[#35465b] bg-[#182232] text-emerald-300",
    },
    {
      label: "Department Staffing Rate",
      value: employeesLoading || departmentsLoading ? "…" : employeesError || departmentsError ? "—" : `${staffingRate}%`,
      description: "Workforce assigned to departments",
      icon: "activity" as IconName,
      iconStyle: "border-[#35465b] bg-[#182232] text-[#9ed8ff]",
    },
    {
      label: "Unassigned Members",
      value: employeesLoading || departmentsLoading ? "…" : employeesError || departmentsError ? "—" : unassignedEmployees.toLocaleString(),
      description: "Awaiting department assignment",
      icon: "alert" as IconName,
      iconStyle: "border-[#35465b] bg-[#182232] text-amber-200",
    },
  ];

  if (checking) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f17] px-6 text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,132,196,0.14),transparent_44%)]" />
        <div className="relative flex items-center gap-3 rounded-2xl border border-[#29384b] bg-[#111a28]/90 px-6 py-5 shadow-2xl backdrop-blur-xl">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#75c7ff] shadow-[0_0_14px_rgba(117,199,255,0.6)]" />
          <p className="text-sm font-medium text-slate-200">Verifying your organization session…</p>
        </div>
      </main>
    );
  }
  if (!user) return null;

  return (
    <div
      className="org-admin-workspace relative min-h-screen bg-[#0b0f17] text-[#f8fafc] font-sans scheme-dark selection:bg-[#75c7ff]/25 selection:text-white"
      style={{
        backgroundImage: "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)",
        backgroundSize: "auto, 42px 42px, 42px 42px",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(35,91,130,0.07),transparent_42%)]" />

      <OrganizationAdminSidebar activePage="dashboard" />

      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="dashboard"
          organizationName={user.organizationName}
          loggingOut={loggingOut}
          onLogout={() => void handleLogout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
        />

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
              <div className="flex items-start gap-3"><Icon name="shield" size={18} className="mt-0.5 shrink-0" /><p>{logoutError}</p></div>
              <button type="button" onClick={() => setLogoutError("")} className="shrink-0 text-xs font-bold underline underline-offset-4">Dismiss</button>
            </div>
          )}
          {reportExportError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
              <p>{reportExportError}</p>
              <button type="button" onClick={() => setReportExportError("")} className="shrink-0 text-xs font-bold underline underline-offset-4">Dismiss</button>
            </div>
          )}

          {/* Minimalist Header Info Bar with Quick Actions & Report Export */}
          <div id="organization-context" className="mb-6 flex flex-col gap-4 rounded-xl border border-[#29384b] bg-[#141f2e]/80 px-6 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between shadow-sm">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#75c7ff]/30 bg-[#75c7ff]/10 text-[#75c7ff] font-extrabold text-sm">
                <Icon name="building" size={21} />
                <img
                  key={organizationLogoVersion}
                  src={`/api/backend/org/logo?v=${organizationLogoVersion}`}
                  alt={`${user.organizationName} logo`}
                  className="absolute inset-0 h-full w-full object-contain"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-white truncate">{user.organizationName}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleExportReport()}
                disabled={reportExporting}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-60"
                title="Download a complete JSON report including all employee records"
              >
                <Icon name="download" size={14} /> {reportExporting ? "Preparing report…" : "Export Report"}
              </button>
              <Link href="/org/employees" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#75c7ff]/30 bg-[#75c7ff]/15 px-3.5 text-xs font-bold text-[#bfe5ff] transition hover:bg-[#75c7ff]/25">
                <Icon name="users" size={14} /> Employees
              </Link>
              <Link href="/org/departments" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] hover:text-white">
                <Icon name="layers" size={14} /> Departments
              </Link>
              <Link href="/org/support" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#75c7ff]/25 bg-[#75c7ff]/10 px-3.5 text-xs font-bold text-[#d8efff] transition hover:bg-[#75c7ff]/20">
                <Icon name="mail" size={14} /> Platform Support
              </Link>
            </div>
          </div>

          {/* Metrics Grid with Shimmer Skeleton Loaders */}
          {employeesLoading || departmentsLoading ? (
            <div role="status" aria-live="polite" aria-busy="true" className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6" aria-label="Loading organization metrics">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-36 rounded-xl border border-[#29384b] bg-[#141f2e]/50 p-5 animate-pulse" />
              ))}
            </div>
          ) : (
            <section aria-label="Organization metrics" className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              {metrics.map((metric) => (
                <article key={metric.label} className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm backdrop-blur-xl transition-colors hover:border-[#52657d]">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{metric.label}</p>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${metric.iconStyle}`}>
                        <Icon name={metric.icon} size={20} />
                      </span>
                    </div>
                    <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{metric.value}</p>
                    <p className="mt-1 text-xs font-medium text-slate-300">{metric.description}</p>
                  </div>
                </article>
              ))}
            </section>
          )}

          {/* Analytics use only the authenticated tenant's current backend snapshot; no synthetic history is shown. */}
          {!employeesLoading && !departmentsLoading && !employeesError && !departmentsError && dashboardStats && (
            <section aria-label="Workforce analytics" className="mb-6 grid min-w-0 gap-4 xl:grid-cols-12">
              <article className="relative min-w-0 overflow-hidden rounded-2xl border border-[#29384b] bg-gradient-to-br from-[#17283a] via-[#141f2e] to-[#111827] p-5 shadow-lg shadow-black/10 xl:col-span-5">
                <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#75c7ff]/[0.07] blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9ed8ff]">People analytics</p>
                    <h2 className="mt-1 text-base font-bold text-white">Workforce composition</h2>
                    
                  </div>
                  <span className="oa-workforce-icon-button rounded-xl border border-[#35465b] bg-[#0b1421]/70 p-2.5 text-[#9ed8ff]"><Icon name="users" size={18} /></span>
                </div>
                <div className="relative mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around">
                  <div className="relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full" style={{ background: statusChartBackground }} role="img" aria-label={`Employment status composition: ${activeEmployees} active, ${inactiveEmployees} inactive, ${formerEmployees} former employees`}>
                    <div className="oa-workforce-chart-center flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full border border-[#334155]/60 bg-[#111c2b] shadow-inner">
                      <span className="text-3xl font-extrabold tracking-tight text-white">{totalEmployees.toLocaleString()}</span>
                      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total people</span>
                    </div>
                  </div>
                  <div className="w-full min-w-0 space-y-4 sm:max-w-[220px]">
                    {[
                      { label: "Active", count: activeEmployees, color: "bg-emerald-400", share: activeShare },
                      { label: "Inactive", count: inactiveEmployees, color: "bg-blue-400", share: inactiveShare },
                      { label: "Former", count: formerEmployees, color: "bg-amber-400", share: formerShare },
                      ...(unclassifiedEmployees > 0 && statusTotal <= totalEmployees ? [{ label: "Unclassified", count: unclassifiedEmployees, color: "bg-slate-500", share: unclassifiedShare }] : []),
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="flex items-center gap-2 text-slate-300"><span className={`h-2.5 w-2.5 rounded-sm ${item.color}`} />{item.label}</span>
                          <span className="font-semibold tabular-nums text-white">{item.count.toLocaleString()} <span className="font-normal text-slate-500">({statusCountsReconcile || statusTotal < totalEmployees ? `${Math.round(item.share)}%` : "—"})</span></span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#29384b]"><div className={`h-full rounded-full ${item.color} transition-[width] duration-500`} style={{ width: `${statusTotal <= totalEmployees ? Math.max(0, Math.min(100, item.share)) : 0}%` }} /></div>
                      </div>
                    ))}
                    {statusTotal > totalEmployees ? <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/[0.06] p-2.5 text-[10px] leading-4 text-rose-200">Status counts ({statusTotal.toLocaleString()}) exceed total employees ({totalEmployees.toLocaleString()}). The chart is suppressed to avoid misleading proportions; review the underlying records.</p> : !statusCountsReconcile && <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2.5 text-[10px] leading-4 text-amber-100">{unclassifiedEmployees.toLocaleString()} employee records have a status outside the three categories shown. They are included as unclassified so the breakdown reconciles to the workforce total.</p>}
                    {totalEmployees === 0 && <p className="text-[10px] leading-4 text-slate-500">No employee records are available for this snapshot.</p>}
                  </div>
                </div>
                
              </article>

              <article className="min-w-0 rounded-2xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-lg shadow-black/10 xl:col-span-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9ed8ff]">Team structure</p>
                    <h2 className="mt-1 text-base font-bold text-white">Department size & allocation</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Ranked by team size. Select a department for details.</p>
                  </div>
                  <Link href="/org/departments" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#35465b] bg-[#0f1724] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#75c7ff]/40 hover:text-white">Manage <Icon name="arrow" size={13} /></Link>
                </div>
                {sortedDepartments.length === 0 ? (
                  <div className="mt-5 flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-[#35465b] bg-[#0f1724]/45 px-4 text-center">
                    <Icon name="layers" size={22} className="text-slate-500" />
                    <p className="mt-2 text-sm font-semibold text-slate-200">No department data yet</p>
                    <p className="mt-1 text-xs text-slate-400">Create a department to begin viewing team allocation.</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {sortedDepartments.slice(0, 6).map((dept) => {
                      const count = Math.max(0, Number(dept.total_employee_count ?? dept.employee_count ?? 0));
                      const activeCount = Math.max(0, Number(dept.active_employee_count ?? 0));
                      const inactiveCount = Math.max(0, Number(dept.inactive_employee_count ?? 0));
                      const formerCount = Math.max(0, Number(dept.former_employee_count ?? 0));
                      const denominator = Math.max(1, count);
                      const classifiedCount = activeCount + inactiveCount + formerCount;
                      const unclassifiedCount = Math.max(0, count - classifiedCount);
                      const departmentStatusReconciles = classifiedCount <= count;
                      const maxDepartmentCount = Math.max(1, ...sortedDepartments.map((item) => Number(item.total_employee_count ?? item.employee_count ?? 0)));
                      return (
                        <button key={dept.id} type="button" onClick={() => setSelectedDepartment(dept)} className="group block w-full rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-[#35465b] hover:bg-[#0f1724]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/60">
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              {dept.manager_id && <EmployeeProfilePhoto employeeId={dept.manager_id} name={dept.manager_name || "Department Manager"} className="h-7 w-7 shrink-0 rounded-md border border-[#35465b] bg-[#182232] text-[9px]" />}
                              <span className="truncate text-xs font-semibold text-slate-200 group-hover:text-white">{dept.name}</span>
                            </span>
                            <span className="shrink-0 text-right text-xs font-bold tabular-nums text-white">{count.toLocaleString()} <span className="font-normal text-slate-500">people</span>{totalEmployeesInDepts > 0 && <span className="ml-1 block text-[10px] font-medium text-slate-500">{Math.round((count / totalEmployeesInDepts) * 100)}% of assigned</span>}</span>
                          </span>
                          <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#29384b]">
                            <span className="flex h-full overflow-hidden rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, (count / maxDepartmentCount) * 100)}%` }}>
                              {departmentStatusReconciles ? <><span className="h-full bg-emerald-400" style={{ width: `${(activeCount / denominator) * 100}%` }} /><span className="h-full bg-blue-400" style={{ width: `${(inactiveCount / denominator) * 100}%` }} /><span className="h-full bg-amber-400" style={{ width: `${(formerCount / denominator) * 100}%` }} /><span className="h-full bg-slate-500" style={{ width: `${(unclassifiedCount / denominator) * 100}%` }} /></> : <span className="h-full w-full bg-rose-400/70" />}
                            </span>
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                            <span>{activeCount} active</span><span>{inactiveCount} inactive</span><span>{formerCount} former</span>{unclassifiedCount > 0 && departmentStatusReconciles && <span>{unclassifiedCount} unclassified</span>}
                            <span className={`ml-auto ${dept.manager_eligible === true ? "text-emerald-300" : "text-amber-200"}`}>{dept.manager_eligible === true ? "Manager eligible" : "Manager review"}</span>
                          </span>
                          {!departmentStatusReconciles && <p className="mt-1 text-[10px] leading-4 text-rose-200">Department status counts exceed its recorded headcount; the bar is neutralized to avoid a misleading breakdown.</p>}
                        </button>
                      );
                    })}
                    {sortedDepartments.length > 6 && <p className="pt-1 text-[10px] text-slate-500">Showing the 6 largest departments. Open Manage departments to see the complete list.</p>}
                  </div>
                )}
                <div className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${departmentTotalsReconcile ? "border-[#29384b] bg-[#0f1724]/60 text-slate-400" : "border-amber-400/20 bg-amber-400/[0.05] text-amber-100"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><span>Department headcount total</span><strong className="tabular-nums">{departmentAssignedSum.toLocaleString()} / {totalEmployeesInDepts.toLocaleString()} assigned employees</strong></div>
                  {!departmentTotalsReconcile && <p className="mt-1 leading-5">Department headcounts do not match the assigned-employee KPI. Review the underlying assignments before relying on this comparison.</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500" aria-label="Department chart legend"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-400" />Active</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-blue-400" />Inactive</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-amber-400" />Former</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-slate-500" />Unclassified</span></div>
                </div>
                <div className="mt-5 grid gap-3 border-t border-[#29384b] pt-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#29384b] bg-[#0f1724]/75 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Staffing rate</p>
                    <p className="mt-1 text-xl font-extrabold text-white">{staffingRate}%</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#29384b]"><div className="h-full rounded-full bg-[#75c7ff]" style={{ width: `${Math.max(0, Math.min(100, staffingRate))}%` }} /></div>
                  </div>
                  <div className="rounded-xl border border-[#29384b] bg-[#0f1724]/75 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Manager coverage</p>
                    <p className="mt-1 text-xl font-extrabold text-white">{managementCoverage}%</p>
                    <p className="mt-1 text-[10px] text-slate-500">{dashboardStats.departmentsWithEligibleManager} of {dashboardStats.totalDepartments} departments</p>
                  </div>
                  <div className="rounded-xl border border-[#29384b] bg-[#0f1724]/75 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pending invitations</p>
                    <p className="mt-1 text-xl font-extrabold text-white">{dashboardStats.pendingInvitations.toLocaleString()}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{dashboardStats.expiredPendingInvitations.toLocaleString()} expired pending</p>
                  </div>
                </div>
              </article>
            </section>
          )}

          {/* Actionable insights are derived only from the current backend snapshot. */}
          {!employeesLoading && !departmentsLoading && dashboardStats && (
            <section aria-label="Executive summary and recent activity" className="mb-6 grid min-w-0 gap-4 xl:grid-cols-2">
              <article className="min-w-0 rounded-xl border border-[#29384b] bg-[#141f2e]/85 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="text-sm font-semibold text-white">Executive insights</h2><p className="mt-1 text-xs text-slate-400">Priorities based on the latest available workforce snapshot</p></div>
                  <span className="rounded-md border border-[#35465b] bg-[#0f1724] px-2 py-1 text-[10px] font-medium text-slate-300">Current data</span>
                </div>
                <ul className="mt-4 space-y-3">
                  {dashboardStats.departmentsWithoutEligibleManager > 0 && <li className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" /><p className="text-sm leading-5 text-slate-200"><strong className="font-semibold text-white">{dashboardStats.departmentsWithoutEligibleManager} {dashboardStats.departmentsWithoutEligibleManager === 1 ? "department" : "departments"}</strong> without an eligible manager. <Link href="/org/departments" className="ml-1 text-xs font-semibold text-[#9ed8ff] hover:text-white">Review departments</Link></p></li>}
                  {unassignedEmployees > 0 && <li className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" /><p className="text-sm leading-5 text-slate-200"><strong className="font-semibold text-white">{unassignedEmployees} {unassignedEmployees === 1 ? "team member" : "team members"}</strong> without department allocation. <Link href="/org/employees" className="ml-1 text-xs font-semibold text-[#9ed8ff] hover:text-white">Review employees</Link></p></li>}
                  {dashboardStats.expiredPendingInvitations > 0 && <li className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" /><p className="text-sm leading-5 text-slate-200"><strong className="font-semibold text-white">{dashboardStats.expiredPendingInvitations} pending {dashboardStats.expiredPendingInvitations === 1 ? "invitation has" : "invitations have"}</strong> expired and may need to be reissued.</p></li>}
                  {dashboardStats.pendingInvitations > 0 && <li className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" /><p className="text-sm leading-5 text-slate-200"><strong className="font-semibold text-white">{dashboardStats.pendingInvitations} pending {dashboardStats.pendingInvitations === 1 ? "invitation" : "invitations"}</strong> have not expired yet.</p></li>}
                  {dashboardStats.departmentsWithoutEligibleManager === 0 && unassignedEmployees === 0 && dashboardStats.expiredPendingInvitations === 0 && dashboardStats.pendingInvitations === 0 && <li className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" /><p className="text-sm leading-5 text-slate-200">No department-manager, allocation, or invitation issues were detected in the available dashboard snapshot.</p></li>}
                </ul>
                <p className="mt-4 border-t border-[#29384b] pt-3 text-[11px] leading-5 text-slate-500">This summary reflects current counts. No historical trend is shown because this endpoint does not provide time-series data.</p>
              </article>

              <article className="min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-gradient-to-br from-[#172538] via-[#141f2e]/95 to-[#111a28] p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-[#75c7ff]/10 text-[#9ed8ff]"><Icon name="activity" size={18} /></span>
                    <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-white">Recent activity</h2><span className="rounded-full border border-[#35465b] bg-[#0f1724]/80 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{activitiesLoading ? "Loading" : activityFilter === "all" ? `${activities.length} ${activities.length === 1 ? "event" : "events"}` : `${filteredActivities.length} of ${activities.length} events`}</span></div><p className="mt-1 text-xs leading-5 text-slate-400">A traceable view of the latest changes recorded in your organization.</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="activity-filter">Filter recent activity</label><select id="activity-filter" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)} className="h-8 max-w-[170px] rounded-lg border border-[#35465b] bg-[#0f1724] px-2.5 text-xs text-slate-200 outline-none transition focus:border-[#75c7ff]/60 focus:ring-2 focus:ring-[#75c7ff]/20"><option value="all">All activity</option><option value="created">Created / invited</option><option value="updated">Updated / changed</option><option value="removed">Removed / suspended</option><option value="other">Other events</option></select></div>
                </div>
                {activitiesLoading ? (
                  <div className="mt-5 space-y-3" role="status" aria-live="polite"><span className="sr-only">Loading recent activity</span>{[1, 2, 3].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-xl border border-[#29384b] bg-[#0f1724]/70" />)}</div>
                ) : activitiesError ? (
                  <div role="alert" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-4"><p className="text-xs leading-5 text-rose-200">{activitiesError}</p></div>
                ) : filteredActivities.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-dashed border-[#35465b] bg-[#0f1724]/45 px-4 py-8 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-[#35465b] bg-[#172538] text-slate-400"><Icon name="activity" size={18} /></span><p className="mt-3 text-sm font-semibold text-slate-200">{activities.length === 0 ? "No activity recorded yet" : "No matching activity"}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{activities.length === 0 ? "When organization changes are written to the audit log, they will appear here with the actor and time." : "Try another event type to see more of the organization audit trail."}</p></div>
                ) : (
                  <div className="mt-5 space-y-5" aria-label="Latest organization audit events">
                    {groupedActivities.map((group) => <section key={group.label} aria-label={group.label}><h3 className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500"><span className="h-px flex-1 bg-[#29384b]" />{group.label}<span className="h-px flex-1 bg-[#29384b]" /></h3><ol className="space-y-2">
                    {group.items.map((activity) => {
                      const action = activity.actionKey.toLowerCase();
                      const eventIcon: IconName = action.includes("delete") || action.includes("remove") || action.includes("suspend") ? "alert" : action.includes("create") || action.includes("invite") || action.includes("add") ? "users" : action.includes("update") || action.includes("edit") || action.includes("status") ? "check" : "activity";
                      const eventTone = eventIcon === "alert" ? "border-rose-400/20 bg-rose-500/10 text-rose-200" : eventIcon === "users" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : eventIcon === "check" ? "border-sky-400/20 bg-sky-500/10 text-sky-200" : "border-[#35465b] bg-[#0f1724] text-slate-300";
                      return (
                        <li key={activity.id} className="rounded-xl border border-[#29384b] bg-[#0f1724]/55 p-3.5 transition-colors hover:border-[#40536b] hover:bg-[#0f1724]/85 sm:p-4">
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${eventTone}`}><Icon name={eventIcon} size={16} /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"><p className="break-words text-sm font-semibold leading-5 text-slate-100">{formatActivityLabel(activity.actionKey)}</p><time dateTime={activity.createdAt} className="shrink-0 text-[11px] text-slate-500">{formatActivityTimestamp(activity.createdAt)}</time></div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#35465b] bg-[#182232] px-2 py-1 text-[11px] font-medium text-slate-300"><Icon name="layers" size={11} />{activity.targetType ? formatActivityLabel(activity.targetType) : "Record"}</span>
                                {activity.targetId && <span className="max-w-full truncate rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-400" title={activity.targetId}>ID: {activity.targetId}</span>}
                              </div>
                              <p className="mt-2 flex min-w-0 items-center gap-1.5 break-all text-xs text-slate-400"><Icon name="users" size={12} className="shrink-0" /><span className="text-slate-500">Actor</span><span>{activity.actorEmail || "System / unavailable"}</span></p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol></section>)}
                  </div>
                )}
                <div className="mt-4 flex items-start gap-2 border-t border-[#29384b] pt-3"><Icon name="shield" size={13} className="mt-0.5 shrink-0 text-slate-500" /><p className="text-[11px] leading-5 text-slate-500">Only persisted audit records are shown. Actions that are not recorded by the backend will not appear in this feed.</p></div>
              </article>
            </section>
          )}

          {employeesError && departmentsError && (
            <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-rose-100">Dashboard metrics are unavailable: {employeesError}</p>
              
            </div>
          )}

          {/* Workforce Distribution Section with Drill-down Interactivity */}
          <section className="min-w-0" aria-labelledby="department-overview-title">
            <article className="min-w-0 overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 shadow-sm backdrop-blur-xl">
              <header className="flex flex-col gap-3 border-b border-[#29384b] px-6 py-4.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#35465b] bg-[#182232] text-slate-200">
                    <Icon name="layers" size={20} />
                  </span>
                  <div>
                    <h2 id="department-overview-title" className="text-base font-bold text-white">Workforce Distribution by Department</h2>
                    <p className="text-xs font-medium text-slate-300">Select a department to inspect its allocation and manager status.</p>
                  </div>
                </div>
                <Link href="/org/departments" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#75c7ff] hover:text-white transition">
                  Manage departments <Icon name="arrow" size={14} />
                </Link>
              </header>

              <div className="p-6 space-y-6">
                {departmentsLoading ? (
                  <div className="space-y-4 py-8 text-center text-sm font-medium text-slate-400" role="status" aria-live="polite">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent mr-2 align-middle" />
                    Loading workforce distribution…
                  </div>
                ) : departmentsError ? (
                  <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
                    {departmentsError}
                  </div>
                ) : topDepartments.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm font-bold text-white">No departments found</p>
                    <p className="text-xs mt-1 text-slate-300">Create departments to visualize team allocations here.</p>
                  </div>
                ) : (
                  <>
                    {/* Detailed Department Cards List (Clickable Drill-down) */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {topDepartments.map((dept) => {
                        const count = Number(dept.total_employee_count ?? dept.employee_count ?? 0);
                        const isDeptActive = (dept.status ?? "").toUpperCase() === "ACTIVE";

                        return (
                          <button
                            type="button"
                            key={dept.id}
                            onClick={() => setSelectedDepartment(dept)}
                            className="w-full text-left rounded-xl border border-[#29384b] bg-[#0f1724]/70 p-4 space-y-3 transition-colors hover:border-[#52657d] hover:bg-[#111c2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141f2e] cursor-pointer shadow-sm group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-bold text-white group-hover:text-[#75c7ff] transition">{dept.name}</h3>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                                  Status: <span className={isDeptActive ? "text-emerald-300" : "text-white"}>{formatStatus(dept.status)}</span>
                                </p>
                              </div>
                              <span className="rounded-lg border border-[#29384b] bg-[#141f2e] px-2.5 py-1 text-xs font-extrabold text-white font-mono">
                                {count} Staff
                              </span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 border-t border-[#29384b]/75 pt-3 text-xs">
                              <span className="text-slate-400">Department manager:</span>
                              {dept.manager_eligible === true ? <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-200">Eligible</span> : <span className="rounded-md bg-amber-500/10 px-2 py-1 font-medium text-amber-200">Needs review</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </article>
          </section>

          {/* Interactive Department Inspection Modal / Drawer (Closable via ESC key) */}
          {selectedDepartment && (
            <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/70 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="org-dashboard-department-dialog-title"
                className="relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#29384b] bg-[#141f2e] p-4 shadow-2xl text-slate-100 sm:max-h-[calc(100dvh-2rem)] sm:p-6"
              >
                <div className="flex items-start justify-between border-b border-[#29384b] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#75c7ff]/15 text-[#75c7ff] border border-[#75c7ff]/30 font-bold">
                      {selectedDepartment.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 id="org-dashboard-department-dialog-title" className="text-lg font-bold text-white">{selectedDepartment.name}</h3>
                      <p className="text-xs text-slate-300">Department Inspector & Quick Actions</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDepartment(null)}
                    aria-label="Close department details"
                    title="Close (Esc)"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>

                <div className="py-6 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                      <p className="text-xs text-slate-400 font-semibold uppercase">Allocated Staff</p>
                      <p className="text-2xl font-extrabold text-white mt-1 font-mono">{Number(selectedDepartment.total_employee_count ?? selectedDepartment.employee_count ?? 0)}</p>
                    </div>
                    <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                      <p className="text-xs text-slate-400 font-semibold uppercase">Department Status</p>
                      <p className={`text-lg font-bold mt-1 ${(selectedDepartment.status ?? "").toUpperCase() === "ACTIVE" ? "text-emerald-300" : "text-white"}`}>
                        {formatStatus(selectedDepartment.status)}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4 text-xs text-slate-300 space-y-2">
                    <p className="font-bold text-white">Quick Management Options:</p>
                    <p>• Review team rosters or reassign members directly through the main departments page.</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[#29384b] pt-4">
                  <button
                    type="button"
                    onClick={() => setSelectedDepartment(null)}
                    className="rounded-xl border border-[#29384b] bg-[#0f1724] px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5 transition"
                  >
                    Close
                  </button>
                  <Link
                    href="/org/departments"
                    className="rounded-xl bg-[#75c7ff] px-4 py-2 text-xs font-bold text-[#0b0f17] hover:bg-[#8fd1ff] transition"
                  >
                    Manage in Departments Page
                  </Link>
                </div>
              </div>
            </div>
          )}

          <footer className="mt-8 flex flex-col gap-2 border-t border-[#29384b] py-5 text-xs font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>Metrics reflect the latest successful dashboard snapshot.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}