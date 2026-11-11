import { connection } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse, organizationIsActive } from "../../../../lib/schedule-utils";

/**
 * Department Manager command-center summary.
 *
 * This endpoint deliberately has a single, strict Department Manager audience.
 * The assigned-department scope is derived from the authenticated actor in SQL;
 * no department or employee IDs supplied by the browser can expand that scope.
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
      actor.roleName !== "DEPARTMENT_MANAGER"
    ) {
      return jsonResponse(
        { message: "Only Department Managers can access this overview" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse({ message: "This organization is not active" }, 403);
    }

    const metadataResult = await pool.query<{
      timeZone: string;
      workDate: string;
      weekStartsOn: number;
    }>(
      `SELECT
         COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
         COALESCE(os.week_starts_on, 1)::int AS "weekStartsOn",
         TO_CHAR(
           (NOW() AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali'))::date,
           'YYYY-MM-DD'
         ) AS "workDate"
       FROM public.organizations AS o
       LEFT JOIN public.organization_settings AS os
         ON os.organization_id = o.id
       WHERE o.id = $1::uuid
         AND o.status = 'ACTIVE'
       LIMIT 1`,
      [actor.organizationId],
    );

    const metadata = metadataResult.rows[0];
    if (!metadata) {
      return jsonResponse({ message: "Organization settings could not be loaded" }, 404);
    }

    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: metadata.timeZone });
    } catch {
      return jsonResponse(
        { message: "The organization's configured time zone is invalid" },
        500,
      );
    }

    const [departmentsResult, totalsResult] = await Promise.all([
      pool.query(
        `SELECT
           d.id,
           d.name,
           d.description,
           d.status,
           COUNT(e.id)::int AS "employeeCount",
           COUNT(e.id) FILTER (WHERE e.employment_status = 'ACTIVE')::int AS "activeEmployeeCount",
           COUNT(e.id) FILTER (WHERE e.employment_status = 'INACTIVE')::int AS "inactiveEmployeeCount",
           COUNT(e.id) FILTER (WHERE e.employment_status = 'FORMER')::int AS "formerEmployeeCount"
         FROM public.departments AS d
         LEFT JOIN public.employees AS e
           ON e.organization_id = d.organization_id
          AND e.department_id = d.id
         WHERE d.organization_id = $1::uuid
           AND d.manager_id = $2::uuid
         GROUP BY d.id
         ORDER BY LOWER(d.name), d.id`,
        [actor.organizationId, actor.employeeId],
      ),
      pool.query<{
        total: number;
        active: number;
        inactive: number;
        former: number;
        pendingCorrections: number;
        submittedTimesheets: number;
        pendingOvertime: number;
        openExceptions: number;
      }>(
        `WITH scoped_employees AS (
           SELECT e.id, e.employment_status
           FROM public.employees AS e
           WHERE e.organization_id = $1::uuid
             AND EXISTS (
               SELECT 1
               FROM public.departments AS managed_department
               WHERE managed_department.organization_id = e.organization_id
                 AND managed_department.id = e.department_id
                 AND managed_department.manager_id = $2::uuid
             )
         )
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE employment_status = 'ACTIVE')::int AS active,
           COUNT(*) FILTER (WHERE employment_status = 'INACTIVE')::int AS inactive,
           COUNT(*) FILTER (WHERE employment_status = 'FORMER')::int AS former,
           (
             SELECT COUNT(*)::int
             FROM public.attendance_correction_requests AS r
             JOIN scoped_employees AS e ON e.id = r.employee_id
             WHERE r.organization_id = $1::uuid
               AND r.status = 'PENDING'
               AND e.id <> $2::uuid
           ) AS "pendingCorrections",
            0::int AS "submittedTimesheets",
           (
             SELECT COUNT(*)::int
             FROM public.attendance_overtime_requests AS r
             JOIN scoped_employees AS e ON e.id = r.employee_id
             WHERE r.organization_id = $1::uuid
               AND r.status = 'PENDING'
               AND e.id <> $2::uuid
           ) AS "pendingOvertime",
           0::int AS "openExceptions"
         FROM scoped_employees`,
        [actor.organizationId, actor.employeeId],
      ),
    ]);

    const totals = totalsResult.rows[0] ?? {
      total: 0,
      active: 0,
      inactive: 0,
      former: 0,
      pendingCorrections: 0,
      submittedTimesheets: 0,
      pendingOvertime: 0,
      openExceptions: 0,
    };

    const reviewCounts = {
      corrections: totals.pendingCorrections,
      // Kept as a zero-valued compatibility field for older clients.
      timesheets: 0,
      overtime: totals.pendingOvertime,
      exceptions: totals.openExceptions,
    };

    return jsonResponse({
      status: "ok",
      workDate: metadata.workDate,
      timeZone: metadata.timeZone,
      weekStartsOn: metadata.weekStartsOn,
      departments: departmentsResult.rows,
      team: {
        total: totals.total,
        active: totals.active,
        inactive: totals.inactive,
        former: totals.former,
      },
      reviewCounts: {
        ...reviewCounts,
        total: Object.values(reviewCounts).reduce((sum, count) => sum + count, 0),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Department Manager overview failed:", error);
    return jsonResponse(
      { message: "Unable to load the Department Manager overview right now" },
      500,
    );
  }
}
