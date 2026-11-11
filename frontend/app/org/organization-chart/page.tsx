"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
  useOrganizationAdminAutoRefresh,
} from "../../components/org-admin/OrganizationAdminChrome";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

type OrgAdminUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type EmploymentStatus = "ACTIVE" | "INACTIVE" | "FORMER" | string;
type WorkforceRole = "HR_MANAGER" | "DEPARTMENT_MANAGER" | "EMPLOYEE" | string;

type EmployeeRecord = {
  id: string;
  employee_code: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  manager_id: string | null;
  manager_name: string | null;
  department_id: string | null;
  department_name: string | null;
  workforce_role: WorkforceRole | null;
  employment_status: EmploymentStatus;
  is_primary_hr_manager?: boolean;
  managed_department_count?: number | null;
};

type EmployeePageResponse = {
  status?: string;
  message?: string;
  employees?: EmployeeRecord[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage?: boolean;
    hasNextPage?: boolean;
  };
};

type HierarchyModel = {
  employeesById: Map<string, EmployeeRecord>;
  childrenById: Map<string, string[]>;
  rootIds: string[];
  unresolvedIds: string[];
  cycleCount: number;
};

const PAGE_LIMIT = 100;

function fullName(employee: EmployeeRecord): string {
  return [employee.first_name, employee.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ") || "Unnamed employee";
}

function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "HR_MANAGER":
      return "HR Manager";
    case "DEPARTMENT_MANAGER":
      return "Department Manager";
    case "EMPLOYEE":
      return "Employee";
    default:
      return "Role not assigned";
  }
}

function roleRank(role: string | null | undefined): number {
  switch (role) {
    case "HR_MANAGER":
      return 0;
    case "DEPARTMENT_MANAGER":
      return 1;
    case "EMPLOYEE":
      return 2;
    default:
      return 3;
  }
}

function statusClass(status: string | null | undefined): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-400/40 bg-emerald-500/[0.14] text-emerald-100 font-medium";
    case "INACTIVE":
      return "border-slate-400/40 bg-slate-500/[0.14] text-slate-200 font-medium";
    case "FORMER":
      return "border-amber-400/40 bg-amber-500/[0.14] text-amber-100 font-medium";
    default:
      return "border-slate-500/40 bg-slate-500/[0.10] text-slate-200 font-medium";
  }
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function buildHierarchy(employees: EmployeeRecord[]): HierarchyModel {
  const employeesById = new Map<string, EmployeeRecord>();
  for (const employee of employees) {
    if (employee && typeof employee.id === "string" && employee.id) {
      employeesById.set(employee.id, employee);
    }
  }

  const cycleIds = new Set<string>();
  const completed = new Set<string>();
  for (const employee of employeesById.values()) {
    if (completed.has(employee.id)) continue;
    const path: string[] = [];
    const pathPositions = new Map<string, number>();
    let current: EmployeeRecord | undefined = employee;

    while (current && !completed.has(current.id)) {
      const existingPosition = pathPositions.get(current.id);
      if (existingPosition !== undefined) {
        for (const cyclicId of path.slice(existingPosition)) {
          cycleIds.add(cyclicId);
        }
        break;
      }

      pathPositions.set(current.id, path.length);
      path.push(current.id);
      current = current.manager_id
        ? employeesById.get(current.manager_id)
        : undefined;
    }

    for (const id of path) completed.add(id);
  }

  const invalidIds = new Set<string>(cycleIds);
  for (const employee of employeesById.values()) {
    const role = employee.workforce_role;
    const managerId = employee.manager_id;
    const manager = managerId ? employeesById.get(managerId) : undefined;

    if (managerId && (managerId === employee.id || !manager)) {
      invalidIds.add(employee.id);
    }

    if (!managerId && role !== "HR_MANAGER") {
      invalidIds.add(employee.id);
    }
    if (role === "HR_MANAGER" && managerId) {
      invalidIds.add(employee.id);
    }
    if (manager && role === "DEPARTMENT_MANAGER" && manager.workforce_role !== "HR_MANAGER") {
      invalidIds.add(employee.id);
    }
    if (manager && role === "EMPLOYEE" && manager.workforce_role !== "DEPARTMENT_MANAGER") {
      invalidIds.add(employee.id);
    }
    if (!role) invalidIds.add(employee.id);
  }

  const childrenById = new Map<string, string[]>();
  for (const employee of employeesById.values()) {
    if (!employee.manager_id || invalidIds.has(employee.id)) continue;
    const manager = employeesById.get(employee.manager_id);
    if (!manager || invalidIds.has(manager.id)) continue;

    const children = childrenById.get(manager.id) ?? [];
    children.push(employee.id);
    childrenById.set(manager.id, children);
  }

  const compareEmployees = (leftId: string, rightId: string) => {
    const left = employeesById.get(leftId)!;
    const right = employeesById.get(rightId)!;
    const rankDifference = roleRank(left.workforce_role) - roleRank(right.workforce_role);
    if (rankDifference) return rankDifference;
    return fullName(left).localeCompare(fullName(right), undefined, { sensitivity: "base" });
  };
  for (const children of childrenById.values()) children.sort(compareEmployees);

  const rootIds = Array.from(employeesById.values())
    .filter((employee) => !invalidIds.has(employee.id) && employee.workforce_role === "HR_MANAGER" && !employee.manager_id)
    .map((employee) => employee.id)
    .sort(compareEmployees);

  const reachable = new Set<string>();
  function markReachable(id: string) {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const childId of childrenById.get(id) ?? []) markReachable(childId);
  }
  for (const rootId of rootIds) markReachable(rootId);

  const unresolvedIds = Array.from(employeesById.keys())
    .filter((id) => invalidIds.has(id) || !reachable.has(id))
    .sort(compareEmployees);

  return {
    employeesById,
    childrenById,
    rootIds,
    unresolvedIds,
    cycleCount: cycleIds.size,
  };
}

type EmployeeTreeNodeProps = {
  employeeId: string;
  model: HierarchyModel;
  includedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggle: (employeeId: string) => void;
  depth?: number;
};

function EmployeeTreeNode({
  employeeId,
  model,
  includedIds,
  collapsedIds,
  onToggle,
  depth = 0,
}: EmployeeTreeNodeProps) {
  const employee = model.employeesById.get(employeeId);
  if (!employee) return null;

  const childIds = (model.childrenById.get(employeeId) ?? [])
    .filter((id) => includedIds.has(id));
  const hasChildren = childIds.length > 0;
  const collapsed = collapsedIds.has(employeeId);
  const name = fullName(employee);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "EM";

  const isHrManager = employee.workforce_role === "HR_MANAGER";

  return (
    <li className="relative list-none">
      <div className="flex items-center gap-2">
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${collapsed ? "Expand" : "Collapse"} reports for ${name}`}
            aria-expanded={!collapsed}
            onClick={() => onToggle(employeeId)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#75c7ff]/40 bg-[#111b29] text-[#75c7ff] transition hover:border-[#75c7ff] hover:bg-[#75c7ff]/25 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#75c7ff]"
          >
            <span className="text-xs font-bold">{collapsed ? "+" : "−"}</span>
          </button>
        ) : (
          <span aria-hidden="true" className="block h-6 w-6 shrink-0" />
        )}

        <article className={`relative flex-1 rounded-xl border bg-gradient-to-br from-[#152131] to-[#0f1723] px-3.5 py-2.5 shadow-md transition-all hover:border-[#75c7ff]/50 ${
          isHrManager ? "border-[#75c7ff]/50" : "border-[#32445e]"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <EmployeeProfilePhoto employeeId={employee.id} name={name} className="h-7 w-7 shrink-0 rounded-lg border border-[#75c7ff]/30 bg-[#75c7ff]/[0.12] text-[10px] font-bold tracking-wide text-[#d4efff]" />
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <h3 className="truncate text-xs font-bold text-white">{name}</h3>
                <span className="rounded bg-white/[0.08] border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-[#d4efff]">
                  {roleLabel(employee.workforce_role)}
                </span>
                {employee.employee_code && (
                  <span className="font-mono text-[10px] font-medium text-slate-300">({employee.employee_code})</span>
                )}
                {employee.department_name && (
                  <span className="text-[10px] font-medium text-slate-300">· {employee.department_name}</span>
                )}
                {hasChildren && (
                  <span className="rounded bg-[#75c7ff]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#d4efff] border border-[#75c7ff]/30">
                    {childIds.length} reports
                  </span>
                )}
                {employee.is_primary_hr_manager && (
                  <span className="rounded-full border border-[#75c7ff]/40 bg-[#75c7ff]/20 px-2 py-0.2 text-[9px] font-bold uppercase tracking-wider text-[#d4efff]">
                    Primary HR
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(employee.employment_status)}`}>
                {employee.employment_status || "UNKNOWN"}
              </span>
              <Link
                href={`/org/employees?employeeId=${encodeURIComponent(employee.id)}`}
                className="inline-flex h-6 items-center rounded-lg border border-white/20 bg-[#111b29] px-2.5 text-[10px] font-semibold text-slate-200 transition hover:border-[#75c7ff]/60 hover:text-white"
              >
                Profile
              </Link>
            </div>
          </div>
        </article>
      </div>

      {hasChildren && !collapsed && (
        <ul className="relative ml-4 mt-2 space-y-2 border-l border-[#32445a] pl-4 sm:ml-6 sm:pl-6">
          {childIds.map((childId) => (
            <EmployeeTreeNode
              key={childId}
              employeeId={childId}
              model={model}
              includedIds={includedIds}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrganizationChartPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const hasLoadedRef = useRef(false);

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
        if (active) setUser(data.user as OrgAdminUser);
      } catch (sessionError) {
        console.error("Organization chart session check failed:", sessionError);
        router.replace("/");
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    void verifyOrganizationSession();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const controller = new AbortController();
    setError("");
    setLoading(!hasLoadedRef.current);
    setRefreshing(hasLoadedRef.current);

    async function fetchEmployeePage(page: number): Promise<EmployeePageResponse> {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      const response = await fetch(`/api/backend/employees?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as EmployeePageResponse | null;

      if (response.status === 401) {
        router.replace("/");
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (!response.ok) {
        throw new Error(data?.message || "Unable to load employee records for the organization chart.");
      }
      if (!data || !Array.isArray(data.employees) || !data.pagination) {
        throw new Error("The employee API returned an unexpected response.");
      }
      if (
        !Number.isSafeInteger(data.pagination.total) || data.pagination.total < 0 ||
        !Number.isSafeInteger(data.pagination.totalPages) || data.pagination.totalPages < 0
      ) {
        throw new Error("The employee API returned invalid pagination metadata.");
      }
      return data;
    }

    async function loadAllEmployees() {
      try {
        const first = await fetchEmployeePage(1);
        const allEmployees = [...(first.employees ?? [])];
        const expectedTotal = first.pagination!.total;
        const totalPages = first.pagination!.totalPages;

        for (let page = 2; page <= totalPages; page += 1) {
          const result = await fetchEmployeePage(page);
          if (result.pagination!.total !== expectedTotal || result.pagination!.totalPages !== totalPages) {
            throw new Error("Employee records changed while the chart was loading. Refresh the page to try again.");
          }
          allEmployees.push(...(result.employees ?? []));
        }

        const ids = allEmployees.map((employee) => employee.id);
        if (new Set(ids).size !== ids.length) {
          throw new Error("The employee API returned duplicate records across pages. Chart rendering was stopped to avoid misleading reporting lines.");
        }
        if (allEmployees.length !== expectedTotal) {
          throw new Error("The employee list was incomplete while loading the chart. Refresh the page to try again.");
        }

        if (active) {
          setEmployees(allEmployees);
          if (!hasLoadedRef.current) setCollapsedIds(new Set());
          hasLoadedRef.current = true;
        }
      } catch (loadError) {
        if (active && !(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load organization reporting relationships.");
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadAllEmployees();
    return () => {
      active = false;
      controller.abort();
    };
  }, [user, refreshKey, router]);

  const hierarchy = useMemo(() => buildHierarchy(employees), [employees]);

  useOrganizationAdminAutoRefresh(
    () => setRefreshKey((current) => current + 1),
    { enabled: Boolean(user), shouldRefresh: () => !loading && !refreshing },
  );

  const matchingIds = useMemo(() => {
    const needle = normalized(query);
    if (!needle) return new Set<string>(employees.map((employee) => employee.id));

    const matches = new Set<string>();
    for (const employee of employees) {
      const searchable = [
        fullName(employee),
        employee.employee_code,
        employee.designation,
        employee.department_name,
        roleLabel(employee.workforce_role),
        employee.employment_status,
        employee.manager_name,
      ].map(normalized);
      if (searchable.some((value) => value.includes(needle))) matches.add(employee.id);
    }
    return matches;
  }, [employees, query]);

  const includedIds = useMemo(() => {
    if (!normalized(query)) return new Set<string>(employees.map((employee) => employee.id));
    const included = new Set<string>();

    for (const matchId of matchingIds) {
      let current: EmployeeRecord | undefined = hierarchy.employeesById.get(matchId);
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        included.add(current.id);
        current = current.manager_id
          ? hierarchy.employeesById.get(current.manager_id)
          : undefined;
      }
    }
    return included;
  }, [employees, hierarchy, matchingIds, query]);

  const visibleRoots = useMemo(
    () => hierarchy.rootIds.filter((id) => includedIds.has(id)),
    [hierarchy.rootIds, includedIds],
  );
  const visibleUnresolved = useMemo(
    () => hierarchy.unresolvedIds.filter((id) => includedIds.has(id)),
    [hierarchy.unresolvedIds, includedIds],
  );

  const counts = useMemo(() => ({
    total: employees.length,
    active: employees.filter((employee) => employee.employment_status === "ACTIVE").length,
    hrManagers: employees.filter((employee) => employee.workforce_role === "HR_MANAGER").length,
    departmentManagers: employees.filter((employee) => employee.workforce_role === "DEPARTMENT_MANAGER").length,
    unresolved: hierarchy.unresolvedIds.length,
  }), [employees, hierarchy.unresolvedIds.length]);

  const toggleCollapsed = useCallback((employeeId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }, []);

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseAll() {
    const next = new Set<string>();
    for (const employeeId of hierarchy.employeesById.keys()) {
      if ((hierarchy.childrenById.get(employeeId) ?? []).length > 0) next.add(employeeId);
    }
    setCollapsedIds(next);
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
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

  if (checkingSession || (!user && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080e17] px-6 text-sm text-slate-200">
        <div className="flex items-center gap-3 rounded-xl border border-[#29384b] bg-[#0f1724] px-5 py-4 shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#75c7ff]" />
          Verifying organization access…
        </div>
      </main>
    );
  }

  return (
    <div
      className="org-admin-workspace min-h-screen bg-[#080e17] text-slate-100"
      style={{
        backgroundImage: "radial-gradient(circle at 72% 0%, rgba(36, 105, 160, 0.12), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.02) 1px, transparent 1px)",
        backgroundSize: "auto, 42px 42px, 42px 42px",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(35,91,130,0.06),transparent_42%)]" />
      <OrganizationAdminSidebar activePage="organization-chart" />
      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="organization-chart"
          organizationName={user?.organizationName || "Organization"}
          loggingOut={loggingOut}
          onLogout={() => void handleLogout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
        />

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/[0.12] p-3 text-sm font-medium text-rose-100">{logoutError}</div>}
          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/[0.12] p-4">
              <p className="text-sm font-medium text-rose-100">{error}</p>

            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5">
            <StatCard label="Employee records" value={counts.total} detail="Across this organization" />
            <StatCard label="Active workforce" value={counts.active} detail="Employment status: Active" />
            <StatCard label="HR Managers" value={counts.hrManagers} detail="Organization-level HR" />
            <StatCard label="Department Managers" value={counts.departmentManagers} detail="Department leadership" />
            <StatCard label="Needs review" value={counts.unresolved} detail="Unplaced or invalid reporting links" warning={counts.unresolved > 0} />
          </div>

          <section className="overflow-hidden rounded-2xl border border-[#32445e] bg-[#0d1521]/95 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col gap-4 border-b border-[#32445e] px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-6">
              <div>
                <h2 className="text-sm font-bold text-white">Reporting hierarchy</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-300">HR Manager → Department Manager → Employee</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                <label className="relative block w-full sm:w-64 lg:w-72">
                  <span className="sr-only">Search organization chart</span>
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setCollapsedIds(new Set()); }}
                    placeholder="Search name, code, role, department…"
                    className="h-9 w-full rounded-xl border border-white/20 bg-[#080f19] pl-9 pr-3 text-xs font-medium text-white outline-none placeholder:text-slate-400 focus:border-[#75c7ff]/60 focus:ring-2 focus:ring-[#75c7ff]/20"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAll}
                    disabled={loading || employees.length === 0}
                    className="inline-flex h-9 items-center rounded-xl border border-white/20 bg-[#111b29] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#75c7ff]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    disabled={loading || employees.length === 0}
                    className="inline-flex h-9 items-center rounded-xl border border-white/20 bg-[#111b29] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#75c7ff]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Collapse all
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefreshKey((current) => current + 1)}
                    disabled={loading || refreshing}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#75c7ff]/40 bg-[#75c7ff]/15 px-3 text-xs font-semibold text-[#d4efff] transition hover:bg-[#75c7ff]/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className={refreshing ? "animate-spin" : ""} aria-hidden="true">↻</span>
                    Refresh chart
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-56 items-center justify-center gap-3 px-5 text-sm font-medium text-slate-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#75c7ff]" />
                Loading organization records…
              </div>
            ) : employees.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <h3 className="text-base font-bold text-white">No employee records yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">Create employee profiles and assign valid workforce reporting relationships to populate the organization chart.</p>
                <Link href="/org/employees" className="mt-5 inline-flex min-h-9 items-center rounded-xl border border-[#75c7ff]/40 bg-[#75c7ff]/15 px-4 text-xs font-semibold text-[#d4efff] hover:bg-[#75c7ff]/25">Open Employees</Link>
              </div>
            ) : visibleRoots.length === 0 && visibleUnresolved.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <h3 className="text-sm font-bold text-white">No matching employees</h3>
                <p className="mt-1 text-xs font-medium text-slate-300">Try another name, employee code, role, or department.</p>
                <button type="button" onClick={() => setQuery("")} className="mt-4 text-xs font-semibold text-[#b3e3ff] underline underline-offset-4">Clear search</button>
              </div>
            ) : (
              <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
                {visibleRoots.length > 0 && (
                  <ul className="space-y-3">
                    {visibleRoots.map((rootId) => (
                      <EmployeeTreeNode
                        key={rootId}
                        employeeId={rootId}
                        model={hierarchy}
                        includedIds={includedIds}
                        collapsedIds={collapsedIds}
                        onToggle={toggleCollapsed}
                      />
                    ))}
                  </ul>
                )}

                {visibleUnresolved.length > 0 && (
                  <section className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-4 sm:p-5" aria-labelledby="unresolved-title">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/[0.12] text-amber-100 text-xs font-bold" aria-hidden="true">!</span>
                      <div>
                        <h3 id="unresolved-title" className="text-xs font-bold text-amber-100">Unresolved reporting relationships</h3>
                        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-amber-100/80">These records could not safely be placed in the reporting tree due to isolated structure assignments.</p>
                      </div>
                    </div>
                    <ul className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                      {visibleUnresolved.map((id) => {
                        const employee = hierarchy.employeesById.get(id);
                        if (!employee) return null;
                        const manager = employee.manager_id ? hierarchy.employeesById.get(employee.manager_id) : undefined;
                        return (
                          <li key={id} className="rounded-lg border border-amber-300/20 bg-[#111924] p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-white">{fullName(employee)}</p>
                                <p className="text-[10px] font-medium text-slate-300">{roleLabel(employee.workforce_role)}</p>
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusClass(employee.employment_status)}`}>{employee.employment_status || "UNKNOWN"}</span>
                            </div>
                            <p className="mt-1.5 text-[10px] font-medium text-amber-100/90">
                              {manager ? `Manager: ${fullName(manager)}` : "No manager assigned."}
                            </p>
                            <Link href={`/org/employees?employeeId=${encodeURIComponent(employee.id)}`} className="mt-2 inline-flex text-[10px] font-semibold text-[#b3e3ff] underline underline-offset-2">Review profile</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, detail, warning = false }: { label: string; value: number; detail: string; warning?: boolean }) {
  return (
    <div className={`rounded-xl border bg-[#0e1723]/95 p-4 shadow-sm ${warning ? "border-amber-400/40 bg-amber-500/[0.04]" : "border-[#32445e]"}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${warning ? "text-amber-200" : "text-white"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-300">{detail}</p>
    </div>
  );
}