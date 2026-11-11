import { NextResponse } from "next/server";

import { pool } from "../../../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../../lib/permissions";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1_000_000;

/**
 * Defense-in-depth protection for JSONB history snapshots.
 *
 * History writers must still avoid storing sensitive information.
 * This response-level filter prevents fields with sensitive key names
 * from being returned if a future or legacy writer stores them.
 *
 * Do not use the global flag: the expression is evaluated for every key.
 */
const SENSITIVE_HISTORY_KEY_PATTERN =
  /password|passwd|secret|token|cookie|credential|authorization|api[_-]?key|private[_-]?key|hash|emergency[_-]?contact[_-]?(name|relationship|phone)/i;

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseUnsignedInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Recursively redact sensitive properties from JSON-compatible values.
 *
 * Preserves ordinary lifecycle fields, arrays, primitive values and
 * nested objects. The original database records remain unchanged.
 */
function redactHistoryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactHistoryValue);
  }

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(source)) {
    if (SENSITIVE_HISTORY_KEY_PATTERN.test(key)) {
      continue;
    }

    sanitized[key] = redactHistoryValue(nestedValue);
  }

  return sanitized;
}

/**
 * GET /api/employees/[id]/history?limit=50&offset=0
 *
 * Organization Admin and authorized workforce managers:
 *   Require employee.history.view.
 *
 * Employee self-service and a Department Manager viewing their own record:
 *   Require employee.self.history.view and may access only their own record.
 *
 * Department Managers viewing another employee:
 *   Require employee.history.view and the employee must belong to a department
 *   assigned to the requesting manager.
 *
 * All results are scoped to the authenticated organization.
 */
export async function GET(
  request: Request,
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

    const { id } = await context.params;

    if (!UUID_PATTERN.test(id)) {
      return jsonResponse(
        { message: "Invalid employee ID" },
        400,
      );
    }

    const isOrganizationUser =
      actor.kind === "ORGANIZATION_USER";

    const isEmployee =
      isOrganizationUser &&
      actor.roleName === "EMPLOYEE";

    const isDepartmentManager =
      isOrganizationUser &&
      actor.roleName === "DEPARTMENT_MANAGER";

    const isOwnWorkforceProfile =
      isOrganizationUser &&
      actor.employeeId === id;

    /*
     * Employee accounts are strictly self-only.
     * Department Managers may read their own history through the explicit
     * self-history permission, even though they do not have a home department.
     */
    if (isEmployee) {
      if (!isOwnWorkforceProfile) {
        return jsonResponse(
          { message: "Employee not found" },
          404,
        );
      }

      if (
        !hasTenantPermission(
          actor,
          "employee.self.history.view",
        )
      ) {
        return jsonResponse(
          {
            message:
              "You do not have permission to view your employee history",
          },
          403,
        );
      }
    } else if (
      isDepartmentManager &&
      isOwnWorkforceProfile
    ) {
      if (
        !hasTenantPermission(
          actor,
          "employee.self.history.view",
        )
      ) {
        return jsonResponse(
          {
            message:
              "You do not have permission to view your employee history",
          },
          403,
        );
      }
    } else {
      if (
        !hasTenantPermission(
          actor,
          "employee.history.view",
        )
      ) {
        return jsonResponse(
          {
            message:
              "You do not have permission to view employee history",
          },
          403,
        );
      }
    }

    const url = new URL(request.url);

    const limit = parseUnsignedInteger(
      url.searchParams.get("limit"),
      DEFAULT_LIMIT,
    );

    const offset = parseUnsignedInteger(
      url.searchParams.get("offset"),
      0,
    );

    if (
      limit === null ||
      offset === null ||
      limit < 1 ||
      limit > MAX_LIMIT ||
      offset > MAX_OFFSET
    ) {
      return jsonResponse(
        {
          message:
            `limit must be between 1 and ${MAX_LIMIT}, and offset must be between 0 and ${MAX_OFFSET}`,
        },
        400,
      );
    }

    /*
     * Enforce record-level authorization in SQL as well as in the permission
     * checks above. Do not rely on a client-side filter.
     */
    const departmentManagerPredicate =
      isDepartmentManager && !isOwnWorkforceProfile
        ? `AND EXISTS (
             SELECT 1
             FROM public.departments AS d
             WHERE d.id = e.department_id
               AND d.organization_id = e.organization_id
               AND d.manager_id = $3::uuid
           )`
        : "";

    const targetValues: unknown[] = [
      id,
      actor.organizationId,
    ];

    if (
      isDepartmentManager &&
      !isOwnWorkforceProfile &&
      isOrganizationUser
    ) {
      targetValues.push(actor.employeeId);
    }

    const targetResult = await pool.query<{
      id: string;
    }>(
      `SELECT e.id
       FROM public.employees AS e
       WHERE e.id = $1
         AND e.organization_id = $2
         ${departmentManagerPredicate}
       LIMIT 1`,
      targetValues,
    );

    if (!targetResult.rows.length) {
      return jsonResponse(
        { message: "Employee not found" },
        404,
      );
    }

    /*
     * Tenant and employee conditions are applied independently to both
     * the count and the history retrieval query.
     */
    const countResult = await pool.query<{
      total: number;
    }>(
      `SELECT COUNT(*)::int AS total
       FROM public.employee_history
       WHERE organization_id = $1
         AND employee_id = $2`,
      [actor.organizationId, id],
    );

    const total = Number(
      countResult.rows[0]?.total ?? 0,
    );

    const historyResult = await pool.query(
      `SELECT
         history.id,
         history.event_type,
         history.reason,
         history.effective_at,
         history.before_state,
         history.after_state,
         history.metadata,
         history.actor_user_id,
         history.created_at,
         CASE
           WHEN history.actor_user_id IS NULL
             THEN 'System / automated workflow'
           WHEN NULLIF(
             TRIM(
               CONCAT_WS(
                 ' ',
                 actor_employee.first_name,
                 actor_employee.last_name
               )
             ),
             ''
           ) IS NOT NULL
             THEN TRIM(
               CONCAT_WS(
                 ' ',
                 actor_employee.first_name,
                 actor_employee.last_name
               )
             )
           WHEN NULLIF(BTRIM(actor_user.email), '') IS NOT NULL
             THEN actor_user.email
           WHEN actor_role.name = 'ORGANIZATION_ADMIN'
             THEN 'Organization Admin'
           WHEN actor_role.name = 'HR_MANAGER'
             THEN 'HR Manager'
           WHEN actor_role.name = 'DEPARTMENT_MANAGER'
             THEN 'Department Manager'
           WHEN actor_role.name = 'EMPLOYEE'
             THEN 'Employee'
           ELSE 'Authorized user'
         END AS actor_display_name,
         CASE actor_role.name
           WHEN 'ORGANIZATION_ADMIN'
             THEN 'Organization Admin'
           WHEN 'HR_MANAGER'
             THEN 'HR Manager'
           WHEN 'DEPARTMENT_MANAGER'
             THEN 'Department Manager'
           WHEN 'EMPLOYEE'
             THEN 'Employee'
           ELSE 'Unknown role'
         END AS actor_role_label
       FROM public.employee_history AS history
       LEFT JOIN public.users AS actor_user
         ON actor_user.id = history.actor_user_id
        AND actor_user.organization_id = history.organization_id
        AND actor_user.account_scope = 'ORGANIZATION'
       LEFT JOIN public.employees AS actor_employee
         ON actor_employee.id = actor_user.employee_id
        AND actor_employee.organization_id = actor_user.organization_id
       LEFT JOIN public.roles AS actor_role
         ON actor_role.id = actor_user.role_id
        AND actor_role.organization_id = actor_user.organization_id
       WHERE history.organization_id = $1
         AND history.employee_id = $2
       ORDER BY
         history.effective_at DESC NULLS LAST,
         history.created_at DESC,
         history.id DESC
       LIMIT $3
       OFFSET $4`,
      [
        actor.organizationId,
        id,
        limit,
        offset,
      ],
    );

    /*
     * Redact snapshot and metadata contents immediately before responding.
     * This does not mutate the stored append-only history records.
     * Preserve the response shape and event-level fields consumed by the UI.
     */
    const history = historyResult.rows.map((entry) => ({
      ...entry,
      before_state: redactHistoryValue(entry.before_state),
      after_state: redactHistoryValue(entry.after_state),
      metadata: redactHistoryValue(entry.metadata),
    }));

    return jsonResponse({
      status: "ok",
      employeeId: id,
      history,
      pagination: {
        limit,
        offset,
        total,
        hasMore:
          offset + history.length < total,
      },
    });
  } catch (error) {
    console.error(
      "Failed to load employee history:",
      error,
    );

    return jsonResponse(
      {
        message:
          "Unable to load employee history right now",
      },
      500,
    );
  }
}