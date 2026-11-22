import { connection } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import {
  canManageScheduleDefinitions,
  jsonResponse,
  organizationIsActive,
} from "../../../../lib/schedule-utils";

const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;

export async function GET(request: Request) {
  // This authenticated endpoint must run with a live request context.
  // Do not let Cache Components attempt to evaluate session-cookie access
  // while producing the build-time static shell.
  await connection();

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to view schedule-eligible workforce members" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse({ message: "This organization is not active" }, 403);
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "100");

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAGE_SIZE
    ) {
      return jsonResponse(
        { message: "Invalid pagination. Page must be positive and limit must be between 1 and 100." },
        400,
      );
    }

    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) {
      return jsonResponse({ message: "Requested page is out of range" }, 400);
    }

    const allowedRoles =
      actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER"
        ? ["EMPLOYEE", "DEPARTMENT_MANAGER"]
        : ["EMPLOYEE", "DEPARTMENT_MANAGER", "HR_MANAGER"];

    const roleName = "regexp_replace(UPPER(COALESCE(workforce_role.name, '')), '[^A-Z0-9]+', '_', 'g')";
    const adminRoleName = "regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g')";

    const fromAndWhere = `
      FROM public.employees AS e
      JOIN public.roles AS workforce_role
        ON workforce_role.id = e.workforce_role_id
       AND workforce_role.organization_id = e.organization_id
       AND workforce_role.scope = 'ORGANIZATION'
      LEFT JOIN public.departments AS d
        ON d.id = e.department_id
       AND d.organization_id = e.organization_id
      WHERE e.organization_id = $1
        AND e.employment_status = 'ACTIVE'
        AND ${roleName} = ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM public.users AS target_account
          JOIN public.roles AS target_account_role
            ON target_account_role.id = target_account.role_id
           AND target_account_role.organization_id = target_account.organization_id
          WHERE target_account.organization_id = e.organization_id
            AND target_account.employee_id = e.id
            AND target_account.account_scope = 'ORGANIZATION'
            AND (
              ${adminRoleName} IN (
                'ORGANIZATION_ADMIN',
                'ORGANIZATIONADMIN',
                'ORG_ADMIN',
                'ORGANIZATION_ADMINISTRATOR',
                'ORGANIZATION_OWNER',
                'ORG_OWNER',
                'TENANT_ADMIN',
                'ADMINISTRATOR'
              )
              OR ${adminRoleName} LIKE 'ORG_ADMIN_%'
              OR ${adminRoleName} LIKE 'ORGANIZATION_ADMIN_%'
              OR ${adminRoleName} LIKE 'ORGANIZATIONADMIN_%'
              OR ${adminRoleName} LIKE 'ORGANIZATION_OWNER_%'
              OR ${adminRoleName} LIKE 'ORG_OWNER_%'
              OR ${adminRoleName} LIKE 'TENANT_ADMIN_%'
            )
        )
    `;

    const values = [actor.organizationId, allowedRoles];
    const [countResult, employeesResult] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total ${fromAndWhere}`,
        values,
      ),
      pool.query(
        `SELECT
           e.id,
           e.employee_code,
           e.first_name,
           e.last_name,
           workforce_role.name AS workforce_role,
           e.employment_status,
           e.department_id,
           d.name AS department_name
         ${fromAndWhere}
         ORDER BY
           LOWER(TRIM(CONCAT_WS(' ', e.first_name, e.last_name))) ASC,
           e.employee_code ASC,
           e.id ASC
         LIMIT $3
         OFFSET $4`,
        [...values, limit, offset],
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);

    return jsonResponse({
      status: "ok",
      employees: employeesResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasPreviousPage: page > 1,
        hasNextPage: offset + employeesResult.rows.length < total,
      },
    });
  } catch (error) {
    console.error("Failed to load schedule-eligible workforce:", error);
    return jsonResponse(
      { message: "Unable to load schedule-eligible workforce right now" },
      500,
    );
  }
}
