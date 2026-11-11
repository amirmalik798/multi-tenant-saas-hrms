import type { PoolClient } from "pg";
import { pool } from "./db";

export const WORKFORCE_ROLES = [
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
] as const;

export type WorkforceRole =
  (typeof WORKFORCE_ROLES)[number];

export type WorkforceErrorStatus =
  | 400
  | 403
  | 404
  | 409;

export class WorkforceRuleError extends Error {
  public readonly status: WorkforceErrorStatus;
  public readonly code: string;

  constructor(
    message: string,
    status: WorkforceErrorStatus,
    code: string,
  ) {
    super(message);
    this.name = "WorkforceRuleError";
    this.status = status;
    this.code = code;
  }
}

export type WorkforceHistoryState =
  Record<string, unknown>;

export type WorkforceHierarchyInput = {
  organizationId: string;
  roleName: WorkforceRole;
  departmentId?: string | null;
  managerId?: string | null;
};

export type WorkforceHierarchyResult = {
  departmentId: string | null;
  managerId: string | null;
};

type ManagerRow = {
  id: string;
  employee_code: string;
  workforce_role_id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkforceUuid(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    UUID_PATTERN.test(value)
  );
}

/**
 * Execute linked workforce changes in one transaction.
 * Any thrown error causes rollback before the client is released.
 */
export async function withWorkforceTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await work(client);

    await client.query("COMMIT");
    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Workforce transaction rollback failed:",
          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Require an active organization and lock its row for the
 * duration of the caller's transaction.
 */
export async function requireActiveOrganization(
  client: PoolClient,
  organizationId: string,
): Promise<void> {
  if (!isWorkforceUuid(organizationId)) {
    throw new WorkforceRuleError(
      "Invalid organization ID.",
      400,
      "INVALID_ORGANIZATION_ID",
    );
  }

  const result = await client.query<{ status: string }>(
    `SELECT status
     FROM public.organizations
     WHERE id = $1
     FOR SHARE`,
    [organizationId],
  );

  if (result.rows.length === 0) {
    throw new WorkforceRuleError(
      "Organization not found.",
      404,
      "ORGANIZATION_NOT_FOUND",
    );
  }

  if (result.rows[0].status !== "ACTIVE") {
    throw new WorkforceRuleError(
      "The organization is not active.",
      403,
      "ORGANIZATION_NOT_ACTIVE",
    );
  }
}

/**
 * Confirm that the requested role belongs to the current tenant.
 * Never accept a platform role as a workforce role.
 */
export async function requireOrganizationWorkforceRole(
  client: PoolClient,
  organizationId: string,
  roleName: WorkforceRole,
): Promise<{ id: string; name: WorkforceRole }> {
  if (!WORKFORCE_ROLES.includes(roleName)) {
    throw new WorkforceRuleError(
      "Unsupported workforce role.",
      400,
      "INVALID_WORKFORCE_ROLE",
    );
  }

  const result = await client.query<{
    id: string;
    name: WorkforceRole;
  }>(
    `SELECT id, name
     FROM public.roles
     WHERE organization_id = $1
       AND scope = 'ORGANIZATION'
       AND name = $2
     FOR SHARE`,
    [organizationId, roleName],
  );

  if (result.rows.length !== 1) {
    throw new WorkforceRuleError(
      "The requested workforce role is not configured for this organization.",
      409,
      "WORKFORCE_ROLE_NOT_CONFIGURED",
    );
  }

  return result.rows[0];
}

/**
 * Require an eligible active manager with one matching active
 * workforce account, role, and organization.
 */
export async function requireEligibleWorkforceManager(
  client: PoolClient,
  organizationId: string,
  employeeId: string,
  requiredRole: "HR_MANAGER" | "DEPARTMENT_MANAGER",
): Promise<ManagerRow> {
  if (
    !isWorkforceUuid(organizationId) ||
    !isWorkforceUuid(employeeId)
  ) {
    throw new WorkforceRuleError(
      "Invalid organization or manager ID.",
      400,
      "INVALID_MANAGER_REFERENCE",
    );
  }

  const result = await client.query<ManagerRow>(
    `SELECT
       e.id,
       e.employee_code,
       e.workforce_role_id
     FROM public.employees e
     JOIN public.organizations o
       ON o.id = e.organization_id
     JOIN public.roles r
       ON r.id = e.workforce_role_id
      AND r.organization_id = e.organization_id
     JOIN public.users u
       ON u.employee_id = e.id
      AND u.organization_id = e.organization_id
      AND u.role_id = e.workforce_role_id
     WHERE e.id = $1
       AND e.organization_id = $2
       AND e.employment_status = 'ACTIVE'
       AND e.workforce_role_id IS NOT NULL
       AND r.scope = 'ORGANIZATION'
       AND r.name = $3
       AND u.account_scope = 'ORGANIZATION'
       AND u.status = 'ACTIVE'
       AND o.status = 'ACTIVE'
     LIMIT 2
     FOR SHARE OF e, o, r, u`,
    [employeeId, organizationId, requiredRole],
  );

  if (result.rows.length !== 1) {
    throw new WorkforceRuleError(
      `The selected ${requiredRole === "HR_MANAGER" ? "HR Manager" : "Department Manager"} must have an active employment record and exactly one matching active account in this organization.`,
      409,
      "INELIGIBLE_WORKFORCE_MANAGER",
    );
  }

  return result.rows[0];
}

/**
 * Require an active tenant-owned department that has an eligible
 * Department Manager. The department row is locked against
 * concurrent reassignment while this transaction continues.
 */
export async function requireActiveDepartment(
  client: PoolClient,
  organizationId: string,
  departmentId: string,
): Promise<{ id: string; managerId: string }> {
  if (!isWorkforceUuid(departmentId)) {
    throw new WorkforceRuleError(
      "Invalid department ID.",
      400,
      "INVALID_DEPARTMENT_ID",
    );
  }

  const result = await client.query<{
    id: string;
    manager_id: string | null;
  }>(
    `SELECT id, manager_id
     FROM public.departments
     WHERE id = $1
       AND organization_id = $2
       AND status = 'ACTIVE'
     FOR SHARE`,
    [departmentId, organizationId],
  );

  const department = result.rows[0];

  if (!department) {
    throw new WorkforceRuleError(
      "The selected department is not active in this organization.",
      409,
      "DEPARTMENT_NOT_ACTIVE_OR_NOT_FOUND",
    );
  }

  if (!department.manager_id) {
    throw new WorkforceRuleError(
      "The department must have an eligible active Department Manager before employees can be assigned.",
      409,
      "DEPARTMENT_MANAGER_REQUIRED",
    );
  }

  await requireEligibleWorkforceManager(
    client,
    organizationId,
    department.manager_id,
    "DEPARTMENT_MANAGER",
  );

  return {
    id: department.id,
    managerId: department.manager_id,
  };
}

/**
 * Resolve the reporting hierarchy instead of trusting caller-supplied
 * manager IDs.
 *
 * HR Manager:
 *   Organization-wide role; no employee manager or department.
 *
 * Department Manager:
 *   Reports to the selected eligible HR Manager, or the active
 *   Primary HR Manager when no manager ID is supplied.
 *
 * Employee:
 *   Must belong to an active department and automatically reports
 *   to its eligible active Department Manager.
 */
export async function resolveWorkforceHierarchy(
  client: PoolClient,
  input: WorkforceHierarchyInput,
): Promise<WorkforceHierarchyResult> {
  const {
    organizationId,
    roleName,
    departmentId: requestedDepartmentId,
    managerId: requestedManagerId,
  } = input;

  await requireActiveOrganization(client, organizationId);

  await requireOrganizationWorkforceRole(
    client,
    organizationId,
    roleName,
  );

  if (
    requestedDepartmentId != null &&
    !isWorkforceUuid(requestedDepartmentId)
  ) {
    throw new WorkforceRuleError(
      "Invalid department ID.",
      400,
      "INVALID_DEPARTMENT_ID",
    );
  }

  if (
    requestedManagerId != null &&
    !isWorkforceUuid(requestedManagerId)
  ) {
    throw new WorkforceRuleError(
      "Invalid reporting manager ID.",
      400,
      "INVALID_MANAGER_ID",
    );
  }

  if (roleName === "HR_MANAGER") {
    if (
      requestedDepartmentId != null ||
      requestedManagerId != null
    ) {
      throw new WorkforceRuleError(
        "An HR Manager is organization-wide and must not be assigned an employee reporting manager or department through this workflow.",
        400,
        "HR_MANAGER_ASSIGNMENT_NOT_ALLOWED",
      );
    }

    return {
      departmentId: null,
      managerId: null,
    };
  }

  if (roleName === "DEPARTMENT_MANAGER") {
    if (requestedDepartmentId != null) {
      throw new WorkforceRuleError(
        "Department Managers are assigned ownership through departments, not by making them members of the departments they manage.",
        400,
        "DEPARTMENT_MANAGER_HOME_DEPARTMENT_NOT_ALLOWED",
      );
    }

    let hrManagerId: string;

    if (requestedManagerId != null) {
      hrManagerId = requestedManagerId;
    } else {
      const primaryResult = await client.query<{
        id: string;
      }>(
        `SELECT e.id
         FROM public.employees e
         JOIN public.roles r
           ON r.id = e.workforce_role_id
          AND r.organization_id = e.organization_id
         JOIN public.users u
           ON u.employee_id = e.id
          AND u.organization_id = e.organization_id
          AND u.role_id = e.workforce_role_id
         WHERE e.organization_id = $1
           AND e.is_primary_hr_manager IS TRUE
           AND e.employment_status = 'ACTIVE'
           AND r.scope = 'ORGANIZATION'
           AND r.name = 'HR_MANAGER'
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
         LIMIT 2
         FOR SHARE OF e, r, u`,
        [organizationId],
      );

      if (primaryResult.rows.length !== 1) {
        throw new WorkforceRuleError(
          "Select an eligible HR Manager. The organization must have exactly one active Primary HR Manager before a default reporting relationship can be assigned.",
          409,
          "PRIMARY_HR_MANAGER_REQUIRED",
        );
      }

      hrManagerId = primaryResult.rows[0].id;
    }

    await requireEligibleWorkforceManager(
      client,
      organizationId,
      hrManagerId,
      "HR_MANAGER",
    );

    return {
      departmentId: null,
      managerId: hrManagerId,
    };
  }

  // Employee: department is mandatory and its manager determines
  // the reporting line.
  if (!requestedDepartmentId) {
    throw new WorkforceRuleError(
      "An employee must be assigned to an active department.",
      400,
      "EMPLOYEE_DEPARTMENT_REQUIRED",
    );
  }

  const department = await requireActiveDepartment(
    client,
    organizationId,
    requestedDepartmentId,
  );

  if (
    requestedManagerId != null &&
    requestedManagerId !== department.managerId
  ) {
    throw new WorkforceRuleError(
      "An employee's reporting manager must be the assigned Department Manager.",
      400,
      "EMPLOYEE_MANAGER_MUST_MATCH_DEPARTMENT",
    );
  }

  return {
    departmentId: department.id,
    managerId: department.managerId,
  };
}

/**
 * Write an auditable workforce event inside the caller's transaction.
 * Call this before committing a state-changing workflow.
 */
export async function writeEmployeeHistory(
  client: PoolClient,
  input: {
    organizationId: string;
    employeeId: string;
    actorUserId: string | null;
    eventType: string;
    reason: string;
    beforeState: WorkforceHistoryState;
    afterState: WorkforceHistoryState;
    metadata?: WorkforceHistoryState;
  },
): Promise<void> {
  const eventType = input.eventType.trim();
  const reason = input.reason.trim();

  if (
    !isWorkforceUuid(input.organizationId) ||
    !isWorkforceUuid(input.employeeId) ||
    (
      input.actorUserId !== null &&
      !isWorkforceUuid(input.actorUserId)
    ) ||
    !/^[A-Z][A-Z0-9_]{1,59}$/.test(eventType) ||
    !reason ||
    reason.length > 500
  ) {
    throw new WorkforceRuleError(
      "Invalid workforce history event.",
      400,
      "INVALID_WORKFORCE_HISTORY_EVENT",
    );
  }

  await client.query(
    `INSERT INTO public.employee_history (
       organization_id,
       employee_id,
       actor_user_id,
       event_type,
       reason,
       before_state,
       after_state,
       metadata
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6::jsonb, $7::jsonb, $8::jsonb
     )`,
    [
      input.organizationId,
      input.employeeId,
      input.actorUserId,
      eventType,
      reason,
      JSON.stringify(input.beforeState),
      JSON.stringify(input.afterState),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}