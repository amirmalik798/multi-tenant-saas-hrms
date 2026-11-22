import type { PoolClient } from "pg";

import { loadManagementDashboardWorkforceSummary } from "./workforce-summary";
import type { ManagementDashboardScope } from "./scope";

export type WorkforceCompositionCounts = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  formerEmployees: number;
};

export type WorkforceDepartmentComposition = WorkforceCompositionCounts & {
  departmentId: string;
  departmentName: string;
  departmentStatus: string;
};

export type WorkforceRoleComposition = {
  roleName: string;
  totalEmployees: number;
};

export type ManagementDashboardWorkforceComposition = {
  generatedAt: string;
  summary: WorkforceCompositionCounts;
  departments: WorkforceDepartmentComposition[];
  unassigned: WorkforceCompositionCounts | null;
  roles: WorkforceRoleComposition[];
};

type CompositionSummaryRow = {
  totalEmployees: number | string;
  activeEmployees: number | string;
  inactiveEmployees: number | string;
  formerEmployees: number | string;
};

type DepartmentCompositionRow = {
  departmentId: string;
  departmentName: string;
  departmentStatus: string;
  totalEmployees: number | string;
  activeEmployees: number | string;
  inactiveEmployees: number | string;
  formerEmployees: number | string;
};

type RoleCompositionRow = {
  roleName: string;
  totalEmployees: number | string;
};

type GenerationRow = {
  generatedAt: Date | string;
};

function countValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The workforce composition returned an invalid " + field + " count");
  }

  return parsed;
}

function mapCounts(
  row: CompositionSummaryRow,
  label: string,
): WorkforceCompositionCounts {
  return {
    totalEmployees: countValue(row.totalEmployees, label + " total workforce"),
    activeEmployees: countValue(row.activeEmployees, label + " active workforce"),
    inactiveEmployees: countValue(row.inactiveEmployees, label + " inactive workforce"),
    formerEmployees: countValue(row.formerEmployees, label + " former workforce"),
  };
}

function validateCountBreakdown(
  counts: WorkforceCompositionCounts,
  label: string,
): void {
  if (
    counts.activeEmployees +
      counts.inactiveEmployees +
      counts.formerEmployees !== counts.totalEmployees
  ) {
    throw new Error("The workforce composition " + label + " status counts do not reconcile to its total");
  }
}

function buildScopedWorkforceCte(
  scope: ManagementDashboardScope,
): { sql: string; values: unknown[] } {
  const departmentManagerFilter = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? "AND EXISTS (SELECT 1 FROM public.departments AS managed_department WHERE managed_department.organization_id = e.organization_id AND managed_department.id = e.department_id AND managed_department.manager_id = $2::uuid)"
    : "";

  const values = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? [scope.organizationId, scope.managerEmployeeId]
    : [scope.organizationId];

  const sql = [
    "WITH scoped_workforce AS (",
    "  SELECT",
    "    e.id,",
    "    e.employment_status,",
    "    COALESCE(r.name, 'EMPLOYEE') AS workforce_role,",
    "    d.id AS department_id",
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
  ].join("\n");

  return { sql, values };
}

/**
 * Builds department, employment-status and workforce-role composition from
 * the exact Step 6 workforce population. Department Managers remain limited
 * to departments owned by their authenticated employee identity.
 *
 * The Step 6 workforce summary is read in the same database snapshot and used
 * as a reconciliation source. No movement or turnover classification is
 * derived from employee_history in this service.
 */
export async function loadManagementDashboardWorkforceComposition(
  client: PoolClient,
  scope: ManagementDashboardScope,
): Promise<ManagementDashboardWorkforceComposition> {
  const [generationResult, workforceSummary] = await Promise.all([
    client.query<GenerationRow>(
      "SELECT CURRENT_TIMESTAMP AS \"generatedAt\"",
    ),
    loadManagementDashboardWorkforceSummary(client, scope),
  ]);

  const generatedAtValue = generationResult.rows[0]?.generatedAt;
  const generatedAt = generatedAtValue instanceof Date
    ? generatedAtValue
    : new Date(generatedAtValue ?? "");

  if (!Number.isFinite(generatedAt.getTime())) {
    throw new Error("The workforce composition generation timestamp is invalid");
  }

  const { sql: scopedCte, values } = buildScopedWorkforceCte(scope);

  const summaryResult = await client.query<CompositionSummaryRow>(
    scopedCte + "\n" + [
      "SELECT",
      "  COUNT(*)::int AS \"totalEmployees\",",
      "  COUNT(*) FILTER (WHERE employment_status = 'ACTIVE')::int AS \"activeEmployees\",",
      "  COUNT(*) FILTER (WHERE employment_status = 'INACTIVE')::int AS \"inactiveEmployees\",",
      "  COUNT(*) FILTER (WHERE employment_status = 'FORMER')::int AS \"formerEmployees\"",
      "FROM scoped_workforce",
    ].join("\n"),
    values,
  );

  const departmentFilter = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? "AND d.manager_id = $2::uuid"
    : "";

  const departmentResult = await client.query<DepartmentCompositionRow>(
    scopedCte + "\n" + [
      ", authorized_departments AS (",
      "  SELECT d.id, d.name, d.status",
      "  FROM public.departments AS d",
      "  WHERE d.organization_id = $1::uuid",
      "    " + departmentFilter,
      ")",
      "SELECT",
      "  d.id AS \"departmentId\",",
      "  d.name AS \"departmentName\",",
      "  d.status AS \"departmentStatus\",",
      "  COUNT(sw.id)::int AS \"totalEmployees\",",
      "  COUNT(sw.id) FILTER (WHERE sw.employment_status = 'ACTIVE')::int AS \"activeEmployees\",",
      "  COUNT(sw.id) FILTER (WHERE sw.employment_status = 'INACTIVE')::int AS \"inactiveEmployees\",",
      "  COUNT(sw.id) FILTER (WHERE sw.employment_status = 'FORMER')::int AS \"formerEmployees\"",
      "FROM authorized_departments AS d",
      "LEFT JOIN scoped_workforce AS sw",
      "  ON sw.department_id = d.id",
      "GROUP BY d.id, d.name, d.status",
      "ORDER BY LOWER(d.name), d.id",
    ].join("\n"),
    values,
  );

  const roleResult = await client.query<RoleCompositionRow>(
    scopedCte + "\n" + [
      "SELECT",
      "  workforce_role AS \"roleName\",",
      "  COUNT(*)::int AS \"totalEmployees\"",
      "FROM scoped_workforce",
      "GROUP BY workforce_role",
      "ORDER BY LOWER(workforce_role)",
    ].join("\n"),
    values,
  );

  const unassignedResult = scope.kind === "ORGANIZATION"
    ? await client.query<CompositionSummaryRow>(
        scopedCte + "\n" + [
          "SELECT",
          "  COUNT(*)::int AS \"totalEmployees\",",
          "  COUNT(*) FILTER (WHERE employment_status = 'ACTIVE')::int AS \"activeEmployees\",",
          "  COUNT(*) FILTER (WHERE employment_status = 'INACTIVE')::int AS \"inactiveEmployees\",",
          "  COUNT(*) FILTER (WHERE employment_status = 'FORMER')::int AS \"formerEmployees\"",
          "FROM scoped_workforce",
          "WHERE department_id IS NULL",
        ].join("\n"),
        values,
      )
    : null;

  const summaryRow = summaryResult.rows[0];
  if (!summaryRow) {
    throw new Error("The workforce composition summary could not be calculated");
  }

  const summary = mapCounts(summaryRow, "overall");
  validateCountBreakdown(summary, "overall");

  if (
    summary.totalEmployees !== workforceSummary.totalEmployees ||
    summary.activeEmployees !== workforceSummary.activeEmployees ||
    summary.inactiveEmployees !== workforceSummary.inactiveEmployees ||
    summary.formerEmployees !== workforceSummary.formerEmployees
  ) {
    throw new Error("The workforce composition does not reconcile with the shared workforce KPI population");
  }

  const departments = departmentResult.rows.map((row) => {
    if (
      typeof row.departmentId !== "string" ||
      typeof row.departmentName !== "string" ||
      typeof row.departmentStatus !== "string"
    ) {
      throw new Error("The workforce composition contains an invalid department record");
    }

    const counts = mapCounts(row, "department");
    validateCountBreakdown(counts, "department " + row.departmentId);

    return {
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      departmentStatus: row.departmentStatus,
      ...counts,
    };
  });

  const assignedEmployees = departments.reduce(
    (total, department) => total + department.totalEmployees,
    0,
  );

  if (assignedEmployees !== workforceSummary.assignedEmployees) {
    throw new Error("Department composition does not reconcile with the shared assigned-workforce count");
  }

  const roles = roleResult.rows.map((row) => {
    if (typeof row.roleName !== "string" || !row.roleName.trim()) {
      throw new Error("The workforce composition contains an invalid workforce role");
    }

    return {
      roleName: row.roleName,
      totalEmployees: countValue(row.totalEmployees, "role workforce"),
    };
  });

  const roleTotal = roles.reduce((total, role) => total + role.totalEmployees, 0);
  if (roleTotal !== summary.totalEmployees) {
    throw new Error("Workforce role composition does not reconcile with the shared workforce total");
  }

  const unassigned = unassignedResult?.rows[0]
    ? mapCounts(unassignedResult.rows[0], "unassigned")
    : null;

  if (unassigned) {
    validateCountBreakdown(unassigned, "unassigned");

    if (
      unassigned.totalEmployees + assignedEmployees !== summary.totalEmployees ||
      unassigned.activeEmployees !== workforceSummary.activeUnassignedEmployees
    ) {
      throw new Error("Unassigned workforce composition does not reconcile with the shared workforce KPI population");
    }
  } else if (assignedEmployees !== summary.totalEmployees) {
    throw new Error("Assigned-department composition does not cover the Department Manager workforce scope");
  }

  return {
    generatedAt: generatedAt.toISOString(),
    summary,
    departments,
    unassigned,
    roles,
  };
}
