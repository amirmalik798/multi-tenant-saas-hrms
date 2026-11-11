import { connection, NextResponse } from "next/server";
import { getOrganizationUser } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { getOrganizationLicenseAccess } from "../../../../lib/licensing";

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
 * GET /api/hr-manager/organization-chart
 *
 * Returns the minimal organization-scoped fields needed to construct the HR
 * hierarchy in one request. Never exposes employee history snapshots or
 * accepts a tenant identifier from the browser.
 */
export async function GET() {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const user = await getOrganizationUser();
    if (!user) return jsonResponse({ status: "error", message: "Authentication required" }, 401);
    if (user.roleName !== "HR_MANAGER") return jsonResponse({ status: "error", message: "HR Manager access is required" }, 403);

    // The organization chart is part of the licensed HRMS workspace.
    // Preserve the existing role and tenant checks, and block data access
    // when the organization's license is missing or inactive.
    const licenseAccess = await getOrganizationLicenseAccess(user.organizationId);
    if (!licenseAccess?.canAccess) {
      return jsonResponse(
        {
          status: "error",
          message: "Organization license is not active",
          code: "LICENSE_REQUIRED",
        },
        403,
      );
    }

    const organization = await pool.query<{ status: string }>(
      `SELECT status FROM public.organizations WHERE id = $1 LIMIT 1`,
      [user.organizationId],
    );
    if (!organization.rows[0] || organization.rows[0].status !== "ACTIVE") {
      return jsonResponse({ status: "error", message: "The organization is not active" }, 403);
    }

    const result = await pool.query(
      `SELECT
         e.id,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.designation,
         e.email,
         e.manager_id,
         NULLIF(TRIM(CONCAT_WS(' ', manager.first_name, manager.last_name)), '') AS manager_name,
         e.department_id,
         d.name AS department_name,
         r.name AS workforce_role,
         e.employment_status,
         e.is_primary_hr_manager,
         (SELECT COUNT(*)::int
          FROM public.departments AS managed_department
          WHERE managed_department.organization_id = e.organization_id
            AND managed_department.manager_id = e.id) AS managed_department_count
       FROM public.employees AS e
       LEFT JOIN public.employees AS manager
         ON manager.id = e.manager_id
        AND manager.organization_id = e.organization_id
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS r
         ON r.id = e.workforce_role_id
        AND r.organization_id = e.organization_id
        AND r.scope = 'ORGANIZATION'
       WHERE e.organization_id = $1
       ORDER BY
         CASE r.name
           WHEN 'HR_MANAGER' THEN 0
           WHEN 'DEPARTMENT_MANAGER' THEN 1
           WHEN 'EMPLOYEE' THEN 2
           ELSE 3
         END,
         LOWER(COALESCE(e.last_name, '')),
         LOWER(e.first_name),
         e.employee_code,
         e.id`,
      [user.organizationId],
    );

    return jsonResponse({ status: "ok", employees: result.rows, total: result.rows.length });
  } catch (error) {
    console.error("HR Manager organization chart failed:", error);
    return jsonResponse({ status: "error", message: "Unable to load the organization chart" }, 500);
  }
}
