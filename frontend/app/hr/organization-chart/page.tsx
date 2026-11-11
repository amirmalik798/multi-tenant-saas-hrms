"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitBranch,
  Network,
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
  useHRManagerAutoRefresh,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

async function readJson<T = unknown>(
  response: Response,
  fallbackMessage = "The request failed."
): Promise<T> {
  const responseText = await response.text();

  let data: unknown = null;

  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `The server returned an invalid response (HTTP ${response.status}).`
      );
    }
  }

  if (!response.ok) {
    let message = fallbackMessage;

    if (data && typeof data === "object") {
      const body = data as Record<string, unknown>;

      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      } else if (typeof body.error === "string" && body.error.trim()) {
        message = body.error;
      }
    }

    throw new Error(`${message} (HTTP ${response.status})`);
  }

  return data as T;
}

type Employee = {
  id: string;
  employee_code: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  designation: string | null;
  manager_id: string | null;
  manager_name: string | null;
  department_id: string | null;
  department_name: string | null;
  workforce_role: string | null;
  employment_status: string;
  is_primary_hr_manager?: boolean;
  managed_department_count?: number | null;
};

type DepartmentOption = {
  id: string;
  name: string;
};

type EmployeeResponse = {
  status?: string;
  message?: string;
  employees?: Employee[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type HierarchyModel = {
  employeesById: Map<string, Employee>;
  childrenById: Map<string, string[]>;
  parentById: Map<string, string>;
  rootIds: string[];
  reachableIds: Set<string>;
  unresolvedIds: string[];
  reasonsById: Map<string, string[]>;
  cycleCount: number;
};

type TreeNodeProps = {
  employeeId: string;
  model: HierarchyModel;
  includedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
};


function fullName(employee: Employee): string {
  return (
    [employee.first_name, employee.last_name]
      .filter((part) => Boolean(part && part.trim()))
      .join(" ") ||
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
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "EM"
  );
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

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function statusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "Active";
    case "INACTIVE":
      return "Inactive";
    case "FORMER":
      return "Former";
    default:
      return status || "Unknown";
  }
}

function statusClasses(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "INACTIVE":
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
    case "FORMER":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    default:
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
  }
}

function hierarchyRoleClass(role: string | null | undefined): string {
  switch (role) {
    case "HR_MANAGER":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "DEPARTMENT_MANAGER":
      return "border-purple-500/30 bg-purple-500/10 text-purple-400";
    case "EMPLOYEE":
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  }
}

function buildHierarchy(employees: Employee[]): HierarchyModel {
  const employeesById = new Map<string, Employee>();

  for (const employee of employees) {
    if (employee?.id) {
      employeesById.set(employee.id, employee);
    }
  }

  const reasonsById = new Map<string, string[]>();
  const cycleIds = new Set<string>();
  const completed = new Set<string>();

  function addReason(id: string, reason: string) {
    const existing = reasonsById.get(id) ?? [];
    if (!existing.includes(reason)) {
      existing.push(reason);
    }
    reasonsById.set(id, existing);
  }

  for (const employee of employeesById.values()) {
    if (completed.has(employee.id)) continue;

    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: Employee | undefined = employee;

    while (current && !completed.has(current.id)) {
      const existingPosition = positions.get(current.id);

      if (existingPosition !== undefined) {
        for (const cyclicId of path.slice(existingPosition)) {
          cycleIds.add(cyclicId);
          addReason(cyclicId, "Circular reporting relationship detected.");
        }
        break;
      }

      positions.set(current.id, path.length);
      path.push(current.id);

      current = current.manager_id
        ? employeesById.get(current.manager_id)
        : undefined;
    }

    for (const id of path) completed.add(id);
  }

  for (const employee of employeesById.values()) {
    const role = employee.workforce_role;
    const managerId = employee.manager_id;
    const manager = managerId
      ? employeesById.get(managerId)
      : undefined;

    if (managerId && managerId === employee.id) {
      addReason(employee.id, "Employee cannot report to themselves.");
    } else if (managerId && !manager) {
      addReason(employee.id, "Reporting manager was not found in the employee records.");
    }

    if (!role) {
      addReason(employee.id, "Workforce role has not been assigned.");
    }

    if (!managerId && role !== "HR_MANAGER") {
      addReason(employee.id, "No reporting manager assigned.");
    }

    if (role === "HR_MANAGER" && managerId) {
      addReason(employee.id, "HR Managers must be hierarchy roots.");
    }

    if (
      manager &&
      role === "DEPARTMENT_MANAGER" &&
      manager.workforce_role !== "HR_MANAGER"
    ) {
      addReason(employee.id, "Department Managers must report to an HR Manager.");
    }

    if (
      manager &&
      role === "EMPLOYEE" &&
      manager.workforce_role !== "DEPARTMENT_MANAGER"
    ) {
      addReason(employee.id, "Employees must report to a Department Manager.");
    }
  }

  const invalidIds = new Set(reasonsById.keys());
  const childrenById = new Map<string, string[]>();
  const parentById = new Map<string, string>();

  function compareEmployees(leftId: string, rightId: string): number {
    const left = employeesById.get(leftId)!;
    const right = employeesById.get(rightId)!;

    const rankDifference =
      roleRank(left.workforce_role) - roleRank(right.workforce_role);

    if (rankDifference) return rankDifference;

    return fullName(left).localeCompare(
      fullName(right),
      undefined,
      { sensitivity: "base" },
    );
  }

  for (const employee of employeesById.values()) {
    if (!employee.manager_id || invalidIds.has(employee.id)) {
      continue;
    }

    const manager = employeesById.get(employee.manager_id);

    if (!manager || invalidIds.has(manager.id)) {
      continue;
    }

    const children = childrenById.get(manager.id) ?? [];
    children.push(employee.id);
    childrenById.set(manager.id, children);
    parentById.set(employee.id, manager.id);
  }

  for (const children of childrenById.values()) {
    children.sort(compareEmployees);
  }

  const rootIds = Array.from(employeesById.values())
    .filter(
      (employee) =>
        !invalidIds.has(employee.id) &&
        employee.workforce_role === "HR_MANAGER" &&
        !employee.manager_id,
    )
    .map((employee) => employee.id)
    .sort(compareEmployees);

  const reachableIds = new Set<string>();

  function markReachable(id: string) {
    if (reachableIds.has(id)) return;
    reachableIds.add(id);

    for (const childId of childrenById.get(id) ?? []) {
      markReachable(childId);
    }
  }

  for (const rootId of rootIds) {
    markReachable(rootId);
  }

  for (const employee of employeesById.values()) {
    if (!reachableIds.has(employee.id) && !reasonsById.has(employee.id)) {
      addReason(
        employee.id,
        "Employee is not connected to a valid HR Manager hierarchy root.",
      );
    }
  }

  const unresolvedIds = Array.from(employeesById.keys())
    .filter((id) => !reachableIds.has(id))
    .sort(compareEmployees);

  return {
    employeesById,
    childrenById,
    parentById,
    rootIds,
    reachableIds,
    unresolvedIds,
    reasonsById,
    cycleCount: cycleIds.size,
  };
}

function matchesFilters(
  employee: Employee,
  search: string,
  roleFilter: string,
  statusFilter: string,
  departmentFilter: string,
): boolean {
  const query = normalize(search);

  const searchableText = [
    fullName(employee),
    employee.employee_code,
    employee.email,
    employee.designation,
    employee.department_name,
    employee.manager_name,
    roleLabel(employee.workforce_role),
  ]
    .map(normalize)
    .join(" ");

  if (query && !searchableText.includes(query)) return false;

  if (
    roleFilter !== "ALL" &&
    employee.workforce_role !== roleFilter
  ) {
    return false;
  }

  if (
    statusFilter !== "ALL" &&
    employee.employment_status !== statusFilter
  ) {
    return false;
  }

  if (
    departmentFilter !== "ALL" &&
    employee.department_id !== departmentFilter
  ) {
    return false;
  }

  return true;
}

function filteredHierarchyIds(
  model: HierarchyModel,
  search: string,
  roleFilter: string,
  statusFilter: string,
  departmentFilter: string,
): Set<string> {
  const hasFilters =
    Boolean(search.trim()) ||
    roleFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    departmentFilter !== "ALL";

  if (!hasFilters) {
    return new Set(model.reachableIds);
  }

  const included = new Set<string>();

  for (const employee of model.employeesById.values()) {
    if (
      model.reachableIds.has(employee.id) &&
      matchesFilters(
        employee,
        search,
        roleFilter,
        statusFilter,
        departmentFilter,
      )
    ) {
      included.add(employee.id);

      let parentId = model.parentById.get(employee.id);

      while (parentId && !included.has(parentId)) {
        included.add(parentId);
        parentId = model.parentById.get(parentId);
      }
    }
  }

  return included;
}

function TreeNode({
  employeeId,
  model,
  includedIds,
  collapsedIds,
  onToggle,
  depth = 0,
}: TreeNodeProps) {
  const employee = model.employeesById.get(employeeId);

  if (!employee) return null;

  const childIds = (model.childrenById.get(employeeId) ?? [])
    .filter((id) => includedIds.has(id));

  const hasChildren = childIds.length > 0;
  const collapsed = collapsedIds.has(employeeId);

  const name = fullName(employee);

  const childCount = childIds.length;
  const totalManagedEmployees = (() => {
    let count = 0;
    const visited = new Set<string>();

    function visit(id: string) {
      if (visited.has(id)) return;
      visited.add(id);

      for (const childId of model.childrenById.get(id) ?? []) {
        count += 1;
        visit(childId);
      }
    }

    visit(employeeId);
    return count;
  })();

  return (
    <li className="relative list-none">
      <div
        className="relative flex min-w-0 items-start gap-2"
        style={{ marginLeft: Math.min(depth, 8) * 12 }}
      >
        {depth > 0 && (
          <span
            aria-hidden="true"
            className="absolute -left-3 top-0 h-6 w-3 rounded-bl-lg border-b border-l border-[#3A4A60]/80"
          />
        )}

        {hasChildren ? (
          <button
            type="button"
            aria-label={`${collapsed ? "Expand" : "Collapse"} reports for ${name}`}
            aria-expanded={!collapsed}
            onClick={() => onToggle(employeeId)}
            className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-lg border border-[#344357] bg-[#151C28] text-[#C5D0DE] transition hover:border-blue-500/50 hover:bg-[#202D40] hover:text-blue-400 shadow-xs"
          >
            {collapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        ) : (
          <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-lg border border-transparent text-[#8A9AAF]">
            <GitBranch size={13} />
          </span>
        )}

        <article
          className={`min-w-0 flex-1 rounded-xl border bg-[#151C28] p-3 shadow-md transition-all hover:border-[#3A4A60] ${
            employee.workforce_role === "HR_MANAGER"
              ? "border-blue-500/30 border-l-[3px] border-l-blue-500"
              : employee.workforce_role === "DEPARTMENT_MANAGER"
                ? "border-purple-500/30 border-l-[3px] border-l-purple-500"
                : "border-[#344357]/80"
          }`}
        >
          <div className="flex min-w-0 flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <EmployeeProfilePhoto
                employeeId={employee.id}
                name={name}
                className={`size-8 rounded-lg border ${employee.workforce_role === "HR_MANAGER" ? "border-blue-500/20 bg-blue-500/10" : employee.workforce_role === "DEPARTMENT_MANAGER" ? "border-purple-500/20 bg-purple-500/10" : "border-slate-700 bg-[#202D40]"}`}
                textClassName={`text-xs font-bold ${employee.workforce_role === "HR_MANAGER" ? "text-blue-300" : employee.workforce_role === "DEPARTMENT_MANAGER" ? "text-purple-300" : "text-[#E8EEF5]"}`}
              />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-xs font-bold text-white">
                    {name}
                  </h3>

                  {employee.is_primary_hr_manager && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] font-semibold text-blue-400">
                      Primary HR Manager
                    </span>
                  )}
                </div>

                <p className="truncate text-[11px] text-[#C5D0DE]">
                  {employee.designation || roleLabel(employee.workforce_role)}
                  {employee.employee_code
                    ? ` · ${employee.employee_code}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${hierarchyRoleClass(
                    employee.workforce_role,
                  )}`}
                >
                  {roleLabel(employee.workforce_role)}
                </span>

                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${statusClasses(
                    employee.employment_status,
                  )}`}
                >
                  {statusLabel(employee.employment_status)}
                </span>

                {employee.department_name && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#344357] bg-[#111827] px-2 py-0.5 text-[9px] font-medium text-[#E8EEF5]">
                    <Building2 size={10} />
                    {employee.department_name}
                  </span>
                )}
              </div>

              {hasChildren && (
                <div className="flex shrink-0 items-center gap-2 rounded-lg border border-[#344357] bg-[#111827] px-2.5 py-1 text-[10px] text-[#C5D0DE] shadow-inner">
                  <div>
                    <span className="font-bold text-white">
                      {childCount}
                    </span>{" "}
                    direct
                  </div>
                  <div className="h-3 w-px bg-[#202D40]" />
                  <div>
                    <span className="font-bold text-white">
                      {totalManagedEmployees}
                    </span>{" "}
                    total
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>
      </div>

      {hasChildren && !collapsed && (
        <ul className="ml-5 mt-2.5 space-y-2.5 border-l border-[#344357]/80 pl-4 sm:ml-8 sm:pl-4">
          {childIds.map((childId) => (
            <TreeNode
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

export default function HRManagerOrganizationChartPage() {
  const auth = useHRManagerSession();
  const user = auth.user;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [showUnresolved, setShowUnresolved] = useState(false);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    new Set(),
  );

  const loadEmployees = useCallback(async () => {
    if (!user) return;

    if (!hasLoadedRef.current) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/backend/hr-manager/organization-chart", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await readJson<EmployeeResponse>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (!response.ok || !Array.isArray(data?.employees)) {
        throw new Error(data?.message || "Unable to load organization hierarchy.");
      }

      setEmployees(data.employees);
      hasLoadedRef.current = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the organization chart.");
    } finally {
      setLoading(false);
    }
  }, [user, auth.reload]);

  useEffect(() => {
    if (user) void loadEmployees();
  }, [user, loadEmployees]);

  useHRManagerAutoRefresh(loadEmployees, {
    enabled: Boolean(user),
    intervalMs: 60_000,
  });

  const model = useMemo(
    () => buildHierarchy(employees),
    [employees],
  );

  const departments = useMemo<DepartmentOption[]>(() => {
    const map = new Map<string, DepartmentOption>();

    for (const employee of employees) {
      if (employee.department_id && employee.department_name) {
        map.set(employee.department_id, {
          id: employee.department_id,
          name: employee.department_name,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [employees]);

  const includedIds = useMemo(
    () =>
      filteredHierarchyIds(
        model,
        search,
        roleFilter,
        statusFilter,
        departmentFilter,
      ),
    [
      model,
      search,
      roleFilter,
      statusFilter,
      departmentFilter,
    ],
  );

  const filteredRootIds = model.rootIds.filter((id) =>
    includedIds.has(id),
  );

  const unresolvedEmployees = model.unresolvedIds
    .map((id) => model.employeesById.get(id))
    .filter((employee): employee is Employee => Boolean(employee))
    .filter((employee) =>
      matchesFilters(
        employee,
        search,
        roleFilter,
        statusFilter,
        departmentFilter,
      ),
    );

  const activeCount = employees.filter(
    (employee) => employee.employment_status === "ACTIVE",
  ).length;

  const hrManagerCount = employees.filter(
    (employee) => employee.workforce_role === "HR_MANAGER",
  ).length;

  const departmentManagerCount = employees.filter(
    (employee) =>
      employee.workforce_role === "DEPARTMENT_MANAGER",
  ).length;

  function toggleCollapsed(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseAll() {
    const ids = new Set<string>();

    for (const [id, childIds] of model.childrenById) {
      if (childIds.length > 0) ids.add(id);
    }

    setCollapsedIds(ids);
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
    setShowUnresolved(false);
  }

  if (auth.checking) return <HRManagerLoading />;

  if (!user) {
    return (
      <HRManagerUnavailable
        message={
          auth.error ||
          "Your HR Manager session could not be verified."
        }
        onRetry={() => void auth.reload()}
      />
    );
  }

  return (
    <HRManagerShell
      user={user}
      activePage="organization-chart"
      title="Organization chart"
      description="Review reporting relationships across your workforce."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <div className="hr-org-chart-page">
      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
        >
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1 text-rose-200/90">
            <p className="font-semibold">
              Organization chart unavailable
            </p>
            <p className="mt-1 leading-6">{error}</p>
          </div>
        </div>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total workforce",
            value: employees.length,
            icon: Users,
            tone: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
            border: "border-t-blue-500",
          },
          {
            label: "Active employees",
            value: activeCount,
            icon: CheckCircle2,
            tone: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
            border: "border-t-emerald-500",
          },
          {
            label: "HR Managers",
            value: hrManagerCount,
            icon: ShieldCheck,
            tone: "bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20",
            border: "border-t-purple-500",
          },
          {
            label: "Department Managers",
            value: departmentManagerCount,
            icon: Building2,
            tone: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
            border: "border-t-amber-500",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <article
              key={item.label}
              className={`rounded-2xl border border-[#344357]/80 border-t-[3px] ${item.border} bg-[#192333] p-5 shadow-xl transition-all hover:border-[#3A4A60]`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#C5D0DE]">
                    {item.label}
                  </p>
                  <p className="mt-2.5 text-3xl font-extrabold tracking-tight text-white">
                    {loading
                      ? "…"
                      : error
                        ? "—"
                        : new Intl.NumberFormat().format(item.value)}
                  </p>
                </div>
                <div
                  className={`flex size-11 items-center justify-center rounded-xl ${item.tone}`}
                >
                  <Icon size={21} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#344357]/80 bg-[#192333] shadow-xl">
        <div className="flex flex-col justify-between gap-4 border-b border-[#344357]/80 px-6 py-5 bg-[#151C28]/60 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Reporting hierarchy
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={expandAll}
              disabled={loading}
              className="rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-40 shadow-xs"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={loading}
              className="rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:opacity-40 shadow-xs"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={() => setShowUnresolved((current) => !current)}
              disabled={loading || model.unresolvedIds.length === 0}
              className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-40 shadow-xs ${
                showUnresolved
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-[#344357] bg-[#151C28] text-[#E8EEF5] hover:bg-[#202D40] hover:border-[#3A4A60]"
              }`}
            >
              {showUnresolved ? "Hide hierarchy issues" : "Show hierarchy issues"}
              {model.unresolvedIds.length > 0 &&
                ` (${model.unresolvedIds.length})`}
            </button>
          </div>
        </div>

        <div className="grid gap-3.5 border-b border-[#344357]/80 p-5 bg-[#192333] sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_220px]">
          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-[#C5D0DE] pointer-events-none"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Search employees, titles, or codes…"
              aria-label="Search hierarchy"
              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#151C28] pl-10 pr-4 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label="Filter by workforce role"
            className="h-10.5 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All roles</option>
            <option value="HR_MANAGER">HR Manager</option>
            <option value="DEPARTMENT_MANAGER">Department Manager</option>
            <option value="EMPLOYEE">Employee</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
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
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-between gap-2 border-b border-[#344357]/80 bg-[#151C28]/40 px-6 py-3 text-xs text-[#C5D0DE] sm:flex-row sm:items-center">
          <span>
            {loading
              ? "Building reporting hierarchy…"
              : `${includedIds.size.toLocaleString()} employee(s) in the displayed hierarchy`}
          </span>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#C5D0DE]">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-400" />
              HR Manager
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-purple-400" />
              Department Manager
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-slate-500" />
              Employee
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-[#C5D0DE]">
            <RefreshCw
              size={17}
              className="animate-spin text-blue-400"
            />
            Loading organization structure…
          </div>
        ) : employees.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Network size={30} className="mx-auto text-[#9AA8BA]" />
            <h3 className="mt-4 text-sm font-bold text-white">
              No workforce records found
            </h3>
          </div>
        ) : filteredRootIds.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Search size={27} className="mx-auto text-[#9AA8BA]" />
            <h3 className="mt-4 text-sm font-bold text-white">
              No matching hierarchy
            </h3>
            <p className="mt-1 text-sm text-[#C5D0DE]">
              No connected hierarchy records match these filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto p-5 sm:p-6">
            <div className="min-w-[320px]">
              <ul className="space-y-4">
                {filteredRootIds.map((rootId) => (
                  <TreeNode
                    key={rootId}
                    employeeId={rootId}
                    model={model}
                    includedIds={includedIds}
                    collapsedIds={collapsedIds}
                    onToggle={toggleCollapsed}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {showUnresolved && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-[#192333] shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-6 py-4">
            <div className="flex items-start gap-3">
              <CircleAlert
                size={20}
                className="mt-0.5 shrink-0 text-amber-400"
              />
              <div>
                <h2 className="text-sm font-bold text-amber-300">
                  Unresolved hierarchy records
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
                  These employee records are not connected to a valid HR Manager
                  hierarchy root, or have a reporting relationship that needs
                  review. This page is read-only and does not repair assignments.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowUnresolved(false)}
              aria-label="Hide unresolved hierarchy records"
              className="rounded-lg p-1.5 text-amber-400 hover:bg-amber-500/20"
            >
              <X size={16} />
            </button>
          </div>

          {unresolvedEmployees.length === 0 ? (
            <p className="p-5 text-sm text-[#C5D0DE]">
              No unresolved employee records match the current filters.
            </p>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {unresolvedEmployees.map((employee) => (
                <article
                  key={employee.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-6"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <EmployeeProfilePhoto employeeId={employee.id} name={fullName(employee)} className="size-9 rounded-xl border border-amber-500/20 bg-amber-500/10" textClassName="text-xs font-bold text-amber-300" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {fullName(employee)}
                      </p>
                      <p className="mt-0.5 text-xs text-[#C5D0DE]">
                        {employee.employee_code} ·{" "}
                        {roleLabel(employee.workforce_role)}
                      </p>
                      <p className="mt-0.5 text-xs text-[#C5D0DE]">
                        Reporting manager: {employee.manager_name || "Not assigned"}
                      </p>
                    </div>
                  </div>

                  <div className="sm:max-w-[360px]">
                    {(model.reasonsById.get(employee.id) ?? [
                      "Not connected to a valid hierarchy root.",
                    ]).map((reason) => (
                      <p
                        key={reason}
                        className="mb-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-300"
                      >
                        {reason}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <style>{`
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="bg-[#192333]"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="bg-[#151C28]"] {
          background-color: #ffffff !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="bg-[#111827]"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="bg-[#202D40]"] {
          background-color: #f1f5f9 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="border-[#344357]"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="border-[#3A4A60]"] {
          border-color: #d7e0eb !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-white"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-[#F8FAFC]"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-[#E8EEF5]"] {
          color: #172033 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-[#C5D0DE]"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-[#9AA8BA]"] {
          color: #526176 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-blue-400"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-blue-300"] {
          color: #1d4ed8 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-purple-400"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-purple-300"] {
          color: #7e22ce !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-emerald-400"] {
          color: #047857 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-amber-400"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page [class*="text-amber-300"] {
          color: #a16207 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page input,
        :root[data-hr-manager-theme="light"] .hr-org-chart-page select {
          color: #172033 !important;
          background-color: #ffffff !important;
          border-color: #cbd5e1 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page input::placeholder {
          color: #64748b !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page button[class*="bg-blue-500"] {
          color: #ffffff !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page button[class*="bg-[#151C28]"],
        :root[data-hr-manager-theme="light"] .hr-org-chart-page a[class*="bg-[#151C28]"] {
          background-color: #f8fafc !important;
          color: #1e293b !important;
        }
        :root[data-hr-manager-theme="light"] .hr-org-chart-page button:hover {
          filter: brightness(0.97);
        }
      `}</style>
      </div>
    </HRManagerShell>
  );
}