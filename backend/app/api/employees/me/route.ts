import { connection, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";

function jsonResponse(body: unknown, status = 200) {
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

/**
 * GET /api/employees/me
 *
 * Self-profile endpoint. The target employee ID is derived exclusively from
 * the authenticated workforce session; the caller cannot provide an ID.
 * This lets an employee read their own profile even when an older role record
 * is missing the employee.self.view mapping, without granting cross-employee
 * access. The general /api/employees/:id endpoint retains its normal RBAC checks.
 */
export async function GET() {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (
      actor.kind !== "ORGANIZATION_USER" ||
      actor.roleName !== "EMPLOYEE" ||
      !actor.employeeId ||
      !actor.organizationId
    ) {
      return jsonResponse(
        { message: "This endpoint is only available to an authenticated employee" },
        403,
      );
    }

    const result = await pool.query(
      `SELECT
         e.id,
         e.organization_id,
         o.name AS organization_name,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.email,
         e.phone,
         e.country,
         e.city,
         e.emergency_contact_name,
         e.emergency_contact_relationship,
         e.emergency_contact_phone,
         e.designation,
         e.manager_id,
         e.is_primary_hr_manager,
         workforce_role.name AS workforce_role,
         NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), '') AS manager_name,
         m.employee_code AS manager_employee_code,
         m.first_name AS manager_first_name,
         m.last_name AS manager_last_name,
         m.email AS manager_email,
         m.employment_status AS manager_employment_status,
         manager_role.name AS manager_workforce_role,
         manager_account.status AS manager_account_status,
         e.joining_date::text AS joining_date,
         e.employment_status,
         e.department_id,
         d.name AS department_name,
         d.description AS department_description,
         d.status AS department_status,
         COALESCE((
           SELECT json_agg(
             json_build_object(
               'id', managed_department.id,
               'name', managed_department.name,
               'status', managed_department.status
             )
             ORDER BY managed_department.name ASC, managed_department.id ASC
           )
           FROM public.departments AS managed_department
           WHERE managed_department.organization_id = e.organization_id
             AND managed_department.manager_id = e.id
         ), '[]'::json) AS managed_departments,
         (
           SELECT COUNT(*)::int
           FROM public.departments AS managed_department
           WHERE managed_department.organization_id = e.organization_id
             AND managed_department.manager_id = e.id
         ) AS managed_department_count,
         e.created_at,
         e.updated_at
       FROM public.employees AS e
       JOIN public.organizations AS o
         ON o.id = e.organization_id
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS workforce_role
         ON workforce_role.id = e.workforce_role_id
        AND workforce_role.organization_id = e.organization_id
        AND workforce_role.scope = 'ORGANIZATION'
       LEFT JOIN public.employees AS m
         ON m.id = e.manager_id
        AND m.organization_id = e.organization_id
       LEFT JOIN public.roles AS manager_role
         ON manager_role.id = m.workforce_role_id
        AND manager_role.organization_id = m.organization_id
        AND manager_role.scope = 'ORGANIZATION'
       LEFT JOIN LATERAL (
         SELECT u.status
         FROM public.users AS u
         WHERE u.employee_id = m.id
           AND u.organization_id = m.organization_id
           AND u.role_id = m.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
         ORDER BY
           CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
           u.updated_at DESC NULLS LAST,
           u.created_at DESC NULLS LAST
         LIMIT 1
       ) AS manager_account ON TRUE
       WHERE e.id = $1::uuid
         AND e.organization_id = $2::uuid
         AND e.employment_status = 'ACTIVE'
         AND o.status = 'ACTIVE'
       LIMIT 1`,
      [actor.employeeId, actor.organizationId],
    );

    const employee = result.rows[0];

    if (!employee) {
      return jsonResponse({ message: "Employee profile not found" }, 404);
    }

    return jsonResponse({ status: "ok", employee });
  } catch (error) {
    console.error("Failed to load authenticated employee profile:", error);
    return jsonResponse(
      { message: "Unable to load your employee profile right now" },
      500,
    );
  }
}
