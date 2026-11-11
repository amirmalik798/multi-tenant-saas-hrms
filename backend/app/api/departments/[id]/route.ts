import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { pool } from "../../../../lib/db";
import { writeEmployeeHistory } from "../../../../lib/workforce";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(
  body: unknown,
  init: number | ResponseInit = 200,
) {
  const responseInit =
    typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return NextResponse.json(body, {
    ...responseInit,
    headers,
  });
}

async function organizationIsActive(
  organizationId: string,
): Promise<boolean> {
  const result = await pool.query<{ status: string }>(
    `SELECT status
     FROM public.organizations
     WHERE id = $1
     LIMIT 1`,
    [organizationId],
  );

  return result.rows[0]?.status === "ACTIVE";
}

// GET /api/departments/[id]
export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (!hasTenantPermission(actor, "department.view")) {
      return jsonResponse(
        {
          message:
            "You do not have permission to view this department",
        },
        403,
      );
    }

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER";

    if (!(await organizationIsActive(actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const { id } = await context.params;

    if (!uuidPattern.test(id)) {
      return jsonResponse(
        { message: "Invalid department ID" },
        400,
      );
    }

    const managerEmployeeId =
      isDepartmentManager &&
      actor.kind === "ORGANIZATION_USER"
        ? actor.employeeId
        : null;

    if (isDepartmentManager && !managerEmployeeId) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    const assignmentPredicate = managerEmployeeId
      ? "AND d.manager_id = $3::uuid"
      : "";

    const values = managerEmployeeId
      ? [id, actor.organizationId, managerEmployeeId]
      : [id, actor.organizationId];

    const result = await pool.query(
      `SELECT
         d.id,
         d.organization_id,
         d.name,
         d.description,
         d.status,
         d.manager_id,
         manager.employee_code AS manager_employee_code,
         manager.first_name AS manager_first_name,
         manager.last_name AS manager_last_name,
         NULLIF(
           TRIM(CONCAT_WS(
             ' ',
             manager.first_name,
             manager.last_name
           )),
           ''
         ) AS manager_name,
         manager.email AS manager_email,
         manager_role.name AS manager_role,
         manager.employment_status AS manager_employment_status,
         manager_account.status AS manager_account_status,
         (
           manager.id IS NOT NULL
           AND manager.employment_status = 'ACTIVE'
           AND manager_role.name = 'DEPARTMENT_MANAGER'
           AND manager_role.scope = 'ORGANIZATION'
           AND manager_role.organization_id = d.organization_id
           AND manager_account.status = 'ACTIVE'
           AND manager_account.account_scope = 'ORGANIZATION'
         ) AS manager_eligible,
         (
           SELECT COUNT(*)::int
           FROM public.employees AS e
           WHERE e.department_id = d.id
             AND e.organization_id = d.organization_id
         ) AS total_employee_count,
         (
           SELECT COUNT(*)::int
           FROM public.employees AS e
           WHERE e.department_id = d.id
             AND e.organization_id = d.organization_id
             AND e.employment_status = 'ACTIVE'
         ) AS active_employee_count,
         (
           SELECT COUNT(*)::int
           FROM public.employees AS e
           WHERE e.department_id = d.id
             AND e.organization_id = d.organization_id
             AND e.employment_status = 'INACTIVE'
         ) AS inactive_employee_count,
         (
           SELECT COUNT(*)::int
           FROM public.employees AS e
           WHERE e.department_id = d.id
             AND e.organization_id = d.organization_id
             AND e.employment_status = 'FORMER'
         ) AS former_employee_count
       FROM public.departments AS d
       LEFT JOIN public.employees AS manager
         ON manager.id = d.manager_id
        AND manager.organization_id = d.organization_id
       LEFT JOIN public.roles AS manager_role
         ON manager_role.id = manager.workforce_role_id
        AND manager_role.organization_id = manager.organization_id
       LEFT JOIN LATERAL (
         SELECT u.status, u.account_scope
         FROM public.users AS u
         WHERE u.employee_id = manager.id
           AND u.organization_id = manager.organization_id
           AND u.role_id = manager.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
         ORDER BY
           CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
           u.updated_at DESC NULLS LAST,
           u.created_at DESC NULLS LAST
         LIMIT 1
       ) AS manager_account ON TRUE
       WHERE d.id = $1
         AND d.organization_id = $2
         ${assignmentPredicate}`,
      values,
    );

    if (!result.rows.length) {
      return jsonResponse(
        { message: "Department not found" },
        404,
      );
    }

    const employeesResult = await pool.query(
      `SELECT
         id,
         employee_code,
         first_name,
         last_name,
         designation,
         employment_status
       FROM public.employees
       WHERE department_id = $1
         AND organization_id = $2
       ORDER BY
         CASE employment_status
           WHEN 'ACTIVE' THEN 0
           WHEN 'INACTIVE' THEN 1
           ELSE 2
         END,
         first_name ASC,
         last_name ASC`,
      [id, actor.organizationId],
    );

    return jsonResponse({
      status: "ok",
      department: {
        ...result.rows[0],
        employees: employeesResult.rows,
      },
    });
  } catch (error) {
    console.error("Failed to load department:", error);

    return jsonResponse(
      { message: "Unable to load department right now" },
      500,
    );
  }
}

// PATCH /api/departments/[id]
export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (!hasTenantPermission(actor, "department.update")) {
      return jsonResponse(
        {
          message:
            "You do not have permission to update departments",
        },
        403,
      );
    }

    const { id } = await context.params;

    if (!uuidPattern.test(id)) {
      return jsonResponse(
        { message: "Invalid department ID" },
        400,
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return jsonResponse(
        { message: "Invalid request body" },
        400,
      );
    }

    const input = body as Record<string, unknown>;

    const allowedKeys = new Set([
      "name",
      "description",
      "status",
      "manager_id",
    ]);

    const unsupportedKey = Object.keys(input).find(
      (key) => !allowedKeys.has(key),
    );

    if (unsupportedKey) {
      return jsonResponse(
        {
          message:
            `Unsupported department field: ${unsupportedKey}`,
        },
        400,
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    let requestedName: string | null = null;
    let requestedStatus: "ACTIVE" | "INACTIVE" | null = null;
    const managerIdWasProvided = Object.hasOwn(
      input,
      "manager_id",
    );
    let requestedManagerId: string | null = null;

    if (Object.hasOwn(input, "name")) {
      if (
        typeof input.name !== "string" ||
        !input.name.trim()
      ) {
        return jsonResponse(
          { message: "Department name is required" },
          400,
        );
      }

      requestedName = input.name.trim().replace(/\s+/g, " ");

      if (requestedName.length > 100) {
        return jsonResponse(
          {
            message:
              "Department name cannot exceed 100 characters",
          },
          400,
        );
      }

      values.push(requestedName);
      updates.push(`name = $${values.length}`);
    }

    if (Object.hasOwn(input, "description")) {
      if (
        input.description !== null &&
        typeof input.description !== "string"
      ) {
        return jsonResponse(
          {
            message:
              "Department description must be a string or null",
          },
          400,
        );
      }

      const description =
        typeof input.description === "string"
          ? input.description.trim() || null
          : null;

      if (description && description.length > 2000) {
        return jsonResponse(
          {
            message:
              "Department description cannot exceed 2000 characters",
          },
          400,
        );
      }

      values.push(description);
      updates.push(`description = $${values.length}`);
    }

    if (Object.hasOwn(input, "status")) {
      if (typeof input.status !== "string") {
        return jsonResponse(
          { message: "Invalid department status" },
          400,
        );
      }

      const normalizedStatus = input.status.trim().toUpperCase();

      if (
        normalizedStatus !== "ACTIVE" &&
        normalizedStatus !== "INACTIVE"
      ) {
        return jsonResponse(
          {
            message:
              "Department status must be ACTIVE or INACTIVE",
          },
          400,
        );
      }

      requestedStatus = normalizedStatus;
      values.push(requestedStatus);
      updates.push(`status = $${values.length}`);
    }

    if (managerIdWasProvided) {
      if (
        input.manager_id === null ||
        input.manager_id === ""
      ) {
        requestedManagerId = null;
      } else if (
        typeof input.manager_id === "string" &&
        uuidPattern.test(input.manager_id)
      ) {
        requestedManagerId = input.manager_id;
      } else {
        return jsonResponse(
          {
            message:
              "manager_id must be a valid employee ID or null",
          },
          400,
        );
      }

      values.push(requestedManagerId);
      updates.push(`manager_id = $${values.length}::uuid`);
    }

    if (updates.length === 0) {
      return jsonResponse(
        {
          message:
            "Provide a department name, description, status, or manager assignment to update",
        },
        400,
      );
    }

    if (
      requestedStatus === "INACTIVE" &&
      !hasTenantPermission(actor, "department.deactivate")
    ) {
      return jsonResponse(
        {
          message:
            "You do not have permission to deactivate departments",
        },
        403,
      );
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const organizationResult = await client.query<{
      status: string;
    }>(
      `SELECT status
       FROM public.organizations
       WHERE id = $1
       FOR UPDATE`,
      [actor.organizationId],
    );

    if (organizationResult.rows[0]?.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const currentResult = await client.query<{
      id: string;
      status: string;
      name: string;
      description: string | null;
      manager_id: string | null;
    }>(
      `SELECT id, status, name, description, manager_id
       FROM public.departments
       WHERE id = $1
         AND organization_id = $2
       FOR UPDATE`,
      [id, actor.organizationId],
    );

    if (!currentResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        { message: "Department not found" },
        404,
      );
    }

    const currentDepartment = currentResult.rows[0];
    const effectiveStatus =
      requestedStatus ?? currentDepartment.status;

    const affectedEmployeesResult =
      managerIdWasProvided || requestedStatus === "INACTIVE"
        ? await client.query<{
            id: string;
            employee_code: string;
            employment_status: string;
            department_id: string | null;
            manager_id: string | null;
            workforce_role_id: string | null;
            is_primary_hr_manager: boolean;
          }>(
            `SELECT
               id,
               employee_code,
               employment_status,
               department_id,
               manager_id,
               workforce_role_id,
               is_primary_hr_manager
             FROM public.employees
             WHERE department_id = $1
               AND organization_id = $2
               AND employment_status IN ('ACTIVE', 'INACTIVE')
             ORDER BY id
             FOR UPDATE`,
            [id, actor.organizationId],
          )
        : {
            rows: [] as {
              id: string;
              employee_code: string;
              employment_status: string;
              department_id: string | null;
              manager_id: string | null;
              workforce_role_id: string | null;
              is_primary_hr_manager: boolean;
            }[],
          };

    if (
      managerIdWasProvided &&
      requestedManagerId === null &&
      effectiveStatus === "ACTIVE" &&
      affectedEmployeesResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "An active department with workforce profiles must retain an assigned Department Manager",
        },
        409,
      );
    }

    // A different manager cannot be assigned to an inactive department.
    // Retaining its existing manager while deactivating the department is valid.
    if (
      managerIdWasProvided &&
      requestedManagerId !== null &&
      requestedManagerId !== currentDepartment.manager_id &&
      effectiveStatus !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "A manager can only be assigned to an active department",
        },
        409,
      );
    }

    if (requestedName !== null) {
      const duplicate = await client.query(
        `SELECT 1
         FROM public.departments
         WHERE organization_id = $1
           AND LOWER(name) = LOWER($2)
           AND id <> $3
         LIMIT 1`,
        [actor.organizationId, requestedName, id],
      );

      if (duplicate.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "A department with this name already exists in your organization",
          },
          409,
        );
      }
    }

    if (
      managerIdWasProvided &&
      requestedManagerId !== null
    ) {
      /*
       * The selected Department Manager must:
       * - belong to this organization;
       * - have the DEPARTMENT_MANAGER workforce role;
       * - be active and have no home department;
       * - have exactly one active matching organization account;
       * - report to an active HR Manager with no department or supervisor;
       * - have exactly one active matching organization account for that HR Manager.
       *
       * Both employee profiles are locked during validation.
       * Database hierarchy triggers remain the final integrity safeguard.
       */
      const managerResult = await client.query<{
        id: string;
        active_account_count: number;
        supervisor_id: string;
        supervisor_active_account_count: number;
      }>(
        `SELECT
           e.id,
           (
             SELECT COUNT(*)::int
             FROM public.users AS u
             WHERE u.employee_id = e.id
               AND u.organization_id = e.organization_id
               AND u.role_id = e.workforce_role_id
               AND u.account_scope = 'ORGANIZATION'
               AND u.status = 'ACTIVE'
           ) AS active_account_count,
           supervisor.id AS supervisor_id,
           (
             SELECT COUNT(*)::int
             FROM public.users AS supervisor_user
             WHERE supervisor_user.employee_id = supervisor.id
               AND supervisor_user.organization_id = supervisor.organization_id
               AND supervisor_user.role_id = supervisor.workforce_role_id
               AND supervisor_user.account_scope = 'ORGANIZATION'
               AND supervisor_user.status = 'ACTIVE'
           ) AS supervisor_active_account_count
         FROM public.employees AS e
         JOIN public.roles AS department_manager_role
           ON department_manager_role.id = e.workforce_role_id
          AND department_manager_role.organization_id = e.organization_id
          AND department_manager_role.scope = 'ORGANIZATION'
          AND department_manager_role.name = 'DEPARTMENT_MANAGER'
         JOIN public.employees AS supervisor
           ON supervisor.id = e.manager_id
          AND supervisor.organization_id = e.organization_id
          AND supervisor.employment_status = 'ACTIVE'
          AND supervisor.department_id IS NULL
          AND supervisor.manager_id IS NULL
         JOIN public.roles AS supervisor_role
           ON supervisor_role.id = supervisor.workforce_role_id
          AND supervisor_role.organization_id = supervisor.organization_id
          AND supervisor_role.scope = 'ORGANIZATION'
          AND supervisor_role.name = 'HR_MANAGER'
         WHERE e.id = $1
           AND e.organization_id = $2
           AND e.employment_status = 'ACTIVE'
           AND e.department_id IS NULL
         FOR UPDATE OF e, supervisor`,
        [requestedManagerId, actor.organizationId],
      );

      const selectedManager = managerResult.rows[0];

      if (
        !selectedManager ||
        Number(selectedManager.active_account_count) !== 1 ||
        !selectedManager.supervisor_id ||
        Number(
          selectedManager.supervisor_active_account_count,
        ) !== 1
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Select an active Department Manager who has exactly one active organization account and reports to an active HR Manager with exactly one active organization account. The Department Manager must not have a home department.",
          },
          400,
        );
      }
    }

    values.push(id);
    const idIndex = values.length;

    values.push(actor.organizationId);
    const organizationIndex = values.length;

    const result = await client.query(
      `UPDATE public.departments
       SET ${updates.join(", ")}
       WHERE id = $${idIndex}
         AND organization_id = $${organizationIndex}
       RETURNING
         id,
         organization_id,
         name,
         description,
         status,
         manager_id`,
      values,
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        { message: "Department not found" },
        404,
      );
    }

    // Synchronize employee reporting lines when the assigned manager changes.
    if (
      managerIdWasProvided &&
      requestedManagerId !== currentDepartment.manager_id
    ) {
      const memberUpdate = await client.query<{
        id: string;
        employee_code: string;
        employment_status: string;
        department_id: string | null;
        manager_id: string | null;
        workforce_role_id: string | null;
        is_primary_hr_manager: boolean;
      }>(
        `UPDATE public.employees
         SET manager_id = $1::uuid,
             updated_at = CURRENT_TIMESTAMP
         WHERE department_id = $2
           AND organization_id = $3
           AND employment_status IN ('ACTIVE', 'INACTIVE')
         RETURNING
           id,
           employee_code,
           employment_status,
           department_id,
           manager_id,
           workforce_role_id,
           is_primary_hr_manager`,
        [requestedManagerId, id, actor.organizationId],
      );

      const beforeById = new Map(
        affectedEmployeesResult.rows.map(
          (employee) => [employee.id, employee],
        ),
      );

      for (const employee of memberUpdate.rows) {
        const before = beforeById.get(employee.id);

        if (!before || before.manager_id === employee.manager_id) {
          continue;
        }

        await writeEmployeeHistory(client, {
          organizationId: actor.organizationId,
          employeeId: employee.id,
          actorUserId: actor.userId,
          eventType: "REPORTING_LINE_CHANGED",
          reason:
            "Department Manager assignment changed; employee reporting manager was synchronized with department ownership.",
          beforeState: {
            employee_code: before.employee_code,
            employment_status: before.employment_status,
            department_id: before.department_id,
            manager_id: before.manager_id,
            workforce_role_id: before.workforce_role_id,
            is_primary_hr_manager:
              before.is_primary_hr_manager === true,
          },
          afterState: {
            employee_code: employee.employee_code,
            employment_status: employee.employment_status,
            department_id: employee.department_id,
            manager_id: employee.manager_id,
            workforce_role_id: employee.workforce_role_id,
            is_primary_hr_manager:
              employee.is_primary_hr_manager === true,
          },
          metadata: {
            workflow: "department_manager_assignment",
            department_id: id,
          },
        });
      }
    }

    let employeesDeactivated = 0;

    if (requestedStatus === "INACTIVE") {
      const employeesResult = await client.query<{
        id: string;
        employee_code: string;
        employment_status: string;
        department_id: string | null;
        manager_id: string | null;
        workforce_role_id: string | null;
        is_primary_hr_manager: boolean;
      }>(
        `UPDATE public.employees
         SET employment_status = 'INACTIVE',
             updated_at = CURRENT_TIMESTAMP
         WHERE department_id = $1
           AND organization_id = $2
           AND employment_status = 'ACTIVE'
         RETURNING
           id,
           employee_code,
           employment_status,
           department_id,
           manager_id,
           workforce_role_id,
           is_primary_hr_manager`,
        [id, actor.organizationId],
      );

      employeesDeactivated = employeesResult.rowCount ?? 0;

      const deactivatedEmployeeIds =
        employeesResult.rows.map((employee) => employee.id);

      let linkedAccountsSynchronized = 0;

      if (deactivatedEmployeeIds.length > 0) {
        const accountStatusResult = await client.query(
          `UPDATE public.users AS u
           SET status = CASE
                 WHEN u.status IN ('ACTIVE', 'INVITED')
                   THEN 'DEACTIVATED'
                 ELSE u.status
               END,
               session_version = u.session_version + 1,
               updated_at = CURRENT_TIMESTAMP
           FROM public.employees AS e
           WHERE e.id = ANY($1::uuid[])
             AND e.organization_id = $2
             AND u.employee_id = e.id
             AND u.organization_id = e.organization_id
             AND u.account_scope = 'ORGANIZATION'
             AND u.status <> 'DEACTIVATED'
           RETURNING u.id`,
          [deactivatedEmployeeIds, actor.organizationId],
        );

        linkedAccountsSynchronized =
          accountStatusResult.rowCount ?? 0;
      }

      const beforeById = new Map(
        affectedEmployeesResult.rows.map(
          (employee) => [employee.id, employee],
        ),
      );

      for (const employee of employeesResult.rows) {
        const before = beforeById.get(employee.id);
        if (!before) continue;

        await writeEmployeeHistory(client, {
          organizationId: actor.organizationId,
          employeeId: employee.id,
          actorUserId: actor.userId,
          eventType: "EMPLOYMENT_STATUS_CHANGED",
          reason:
            "Employee was deactivated because their assigned department was deactivated.",
          beforeState: {
            employee_code: before.employee_code,
            employment_status: before.employment_status,
            department_id: before.department_id,
            manager_id: before.manager_id,
            workforce_role_id: before.workforce_role_id,
            is_primary_hr_manager:
              before.is_primary_hr_manager === true,
          },
          afterState: {
            employee_code: employee.employee_code,
            employment_status: employee.employment_status,
            department_id: employee.department_id,
            manager_id: employee.manager_id,
            workforce_role_id: employee.workforce_role_id,
            is_primary_hr_manager:
              employee.is_primary_hr_manager === true,
          },
          metadata: {
            workflow: "department_deactivation",
            department_id: id,
            linked_accounts_synchronized:
              linkedAccountsSynchronized,
          },
        });
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return jsonResponse({
      status: "ok",
      message: "Department updated successfully",
      department: result.rows[0],
      employeesDeactivated,
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Failed to roll back department update:",
          rollbackError,
        );
      }
    }

    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return jsonResponse(
        {
          message:
            "A department with this name already exists in your organization",
        },
        409,
      );
    }

    if (dbError.code === "23503") {
      return jsonResponse(
        {
          message:
            "The selected department manager or department reference is invalid",
        },
        400,
      );
    }

    if (dbError.code === "23514") {
      return jsonResponse(
        {
          message:
            "The department or reporting-line update violates a database validation rule",
        },
        409,
      );
    }

    console.error("Failed to update department:", error);

    return jsonResponse(
      { message: "Unable to update department right now" },
      500,
    );
  } finally {
    client?.release();
  }
}