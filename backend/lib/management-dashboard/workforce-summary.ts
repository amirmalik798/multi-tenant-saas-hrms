import type { PoolClient } from "pg";

import type { ManagementDashboardScope } from "./scope";

export type ManagementDashboardWorkforceSummary = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  formerEmployees: number;
  assignedEmployees: number;
  activeUnassignedEmployees: number;
  activeDepartments: number;
  inactiveDepartments: number;
};

type WorkforceAggregateRow = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  formerEmployees: number;
  assignedEmployees: number;
  activeUnassignedEmployees: number;
};

type DepartmentAggregateRow = {
  activeDepartments: number;
  inactiveDepartments: number;
};

function countValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The workforce summary returned an invalid " + field + " count");
  }

  return parsed;
}

/**
 * Loads one canonical, distinct employee population for the three management
 * roles. Organization Admin and HR Manager read the authenticated tenant.
 * Department Manager reads only employees assigned to departments managed by
 * the authenticated manager employee ID.
 *
 * Organization-administrator role records are excluded from this new shared
 * workforce population. Existing overview endpoints are intentionally left
 * unchanged and continue to retain their historical population definitions.
 */
export async function loadManagementDashboardWorkforceSummary(
  client: PoolClient,
  scope: ManagementDashboardScope,
): Promise<ManagementDashboardWorkforceSummary> {
  const departmentManagerFilter = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? "AND EXISTS (SELECT 1 FROM public.departments AS managed_department WHERE managed_department.organization_id = e.organization_id AND managed_department.id = e.department_id AND managed_department.manager_id = $2::uuid)"
    : "";

  const queryValues = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? [scope.organizationId, scope.managerEmployeeId]
    : [scope.organizationId];

  const workforceSql = [
    "WITH scoped_workforce AS (",
    "  SELECT",
    "    e.id,",
    "    e.employment_status,",
    "    (d.id IS NOT NULL) AS has_valid_department",
    "  FROM public.employees AS e",
    "  LEFT JOIN public.departments AS d",
    "    ON d.id = e.department_id",
    "   AND d.organization_id = e.organization_id",
    "  LEFT JOIN public.roles AS r",
    "    ON r.id = e.workforce_role_id",
    "   AND r.organization_id = e.organization_id",
    "   AND r.scope = 'ORGANIZATION'",
    "  WHERE e.organization_id = $1::uuid",
    "    AND COALESCE(r.name, 'EMPLOYEE') NOT IN (",
    "      'ORGANIZATION_ADMIN',",
    "      'ORG_ADMIN',",
    "      'ORGANIZATION_ADMINISTRATOR'",
    "    )",
    "    " + departmentManagerFilter,
    ")",
    "SELECT",
    "  COUNT(*)::int AS \"totalEmployees\",",
    "  COUNT(*) FILTER (WHERE employment_status = 'ACTIVE')::int AS \"activeEmployees\",",
    "  COUNT(*) FILTER (WHERE employment_status = 'INACTIVE')::int AS \"inactiveEmployees\",",
    "  COUNT(*) FILTER (WHERE employment_status = 'FORMER')::int AS \"formerEmployees\",",
    "  COUNT(*) FILTER (WHERE has_valid_department)::int AS \"assignedEmployees\",",
    "  COUNT(*) FILTER (WHERE employment_status = 'ACTIVE' AND NOT has_valid_department)::int AS \"activeUnassignedEmployees\"",
    "FROM scoped_workforce",
  ].join("\n");

  const departmentManagerDepartmentFilter = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? "AND manager_id = $2::uuid"
    : "";

  const departmentSql = [
    "SELECT",
    "  COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS \"activeDepartments\",",
    "  COUNT(*) FILTER (WHERE status = 'INACTIVE')::int AS \"inactiveDepartments\"",
    "FROM public.departments",
    "WHERE organization_id = $1::uuid",
    "  " + departmentManagerDepartmentFilter,
  ].join("\n");

  const [workforceResult, departmentResult] = await Promise.all([
    client.query<WorkforceAggregateRow>(workforceSql, queryValues),
    client.query<DepartmentAggregateRow>(departmentSql, queryValues),
  ]);

  const workforce = workforceResult.rows[0];
  const departments = departmentResult.rows[0];

  if (!workforce || !departments) {
    throw new Error("The workforce summary could not be calculated");
  }

  const activeDepartments = countValue(
    departments.activeDepartments,
    "active department",
  );
  const inactiveDepartments = countValue(
    departments.inactiveDepartments,
    "inactive department",
  );

  return {
    totalEmployees: countValue(workforce.totalEmployees, "total workforce"),
    activeEmployees: countValue(workforce.activeEmployees, "active workforce"),
    inactiveEmployees: countValue(workforce.inactiveEmployees, "inactive workforce"),
    formerEmployees: countValue(workforce.formerEmployees, "former workforce"),
    assignedEmployees: countValue(workforce.assignedEmployees, "assigned workforce"),
    activeUnassignedEmployees: countValue(
      workforce.activeUnassignedEmployees,
      "active unassigned workforce",
    ),
    activeDepartments,
    inactiveDepartments,
  };
}
