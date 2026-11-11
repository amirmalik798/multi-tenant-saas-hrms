import { connection, NextResponse } from "next/server";
import type { PoolClient } from "pg";

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

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

/**
 * GET /api/hr-manager/overview
 *
 * One tenant-scoped, read-only snapshot for the HR Manager command center.
 * The tenant and actor are derived from the authenticated workforce session;
 * clients cannot select an organization. Activity rows deliberately expose
 * only a safe event summary, never before/after JSON snapshots.
 */
export async function GET() {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    const user = await getOrganizationUser();

    if (!user) {
      return jsonResponse({ status: "error", message: "Authentication required" }, 401);
    }

    if (user.roleName !== "HR_MANAGER") {
      return jsonResponse({ status: "error", message: "HR Manager access is required" }, 403);
    }

    if (!user.organizationId || !user.employeeId) {
      return jsonResponse({ status: "error", message: "The HR Manager profile is incomplete" }, 403);
    }

    // HR Manager overview data is part of the licensed HRMS workspace.
    // Keep the workforce session and tenant checks above intact, then fail
    // closed when this organization's subscription is missing or inactive.
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

    client = await pool.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;

    const organizationResult = await client.query<{
      id: string;
      name: string;
      status: string;
      time_zone: string;
      week_starts_on: number;
    }>(
      `SELECT
         o.id,
         o.name,
         o.status,
         COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone,
         COALESCE(os.week_starts_on, 1)::int AS week_starts_on
       FROM public.organizations AS o
       LEFT JOIN public.organization_settings AS os
         ON os.organization_id = o.id
       WHERE o.id = $1
       LIMIT 1`,
      [user.organizationId],
    );

    const organization = organizationResult.rows[0];
    if (!organization || organization.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonResponse({ status: "error", message: "The organization is not active" }, 403);
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: organization.time_zone });
    } catch {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonResponse({ status: "error", message: "The organization's configured time zone is invalid" }, 500);
    }

    const [employeeResult, departmentResult, invitationResult, queueResult, recentEmployeesResult, activityResult, todayResult] = await Promise.all([
      client.query(
        `SELECT
           COUNT(*)::int AS total_employees,
           COUNT(*) FILTER (WHERE e.employment_status = 'ACTIVE')::int AS active_employees,
           COUNT(*) FILTER (WHERE e.employment_status = 'INACTIVE')::int AS inactive_employees,
           COUNT(*) FILTER (WHERE e.employment_status = 'FORMER')::int AS former_employees,
           COUNT(*) FILTER (WHERE e.department_id IS NULL AND e.employment_status <> 'FORMER')::int AS unassigned_employees,
           COUNT(*) FILTER (WHERE e.employment_status = 'ACTIVE' AND e.department_id IS NULL)::int AS active_unassigned_employees,
           COUNT(*) FILTER (WHERE r.name = 'HR_MANAGER' AND r.scope = 'ORGANIZATION')::int AS hr_manager_profiles,
           COUNT(*) FILTER (WHERE r.name = 'DEPARTMENT_MANAGER' AND r.scope = 'ORGANIZATION')::int AS department_manager_profiles
         FROM public.employees AS e
         LEFT JOIN public.roles AS r
           ON r.id = e.workforce_role_id
          AND r.organization_id = e.organization_id
          AND r.scope = 'ORGANIZATION'
         WHERE e.organization_id = $1
           AND COALESCE(r.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')`,
        [user.organizationId],
      ),
      client.query(
        `SELECT
           d.id,
           d.name,
           d.status,
           d.manager_id,
           NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), '') AS manager_name,
           COUNT(e.id) FILTER (WHERE COALESCE(employee_role.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR'))::int AS total_employee_count,
           COUNT(e.id) FILTER (WHERE e.employment_status = 'ACTIVE' AND COALESCE(employee_role.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR'))::int AS active_employee_count,
           COUNT(e.id) FILTER (WHERE e.employment_status = 'INACTIVE' AND COALESCE(employee_role.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR'))::int AS inactive_employee_count,
           COUNT(e.id) FILTER (WHERE e.employment_status = 'FORMER' AND COALESCE(employee_role.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR'))::int AS former_employee_count,
           (
             d.manager_id IS NULL
             OR m.id IS NULL
             OR m.employment_status <> 'ACTIVE'
             OR manager_role.name IS DISTINCT FROM 'DEPARTMENT_MANAGER'
             OR manager_account.status IS DISTINCT FROM 'ACTIVE'
             OR manager_account.account_scope IS DISTINCT FROM 'ORGANIZATION'
           ) AS manager_needs_attention
         FROM public.departments AS d
         LEFT JOIN public.employees AS m
           ON m.id = d.manager_id
          AND m.organization_id = d.organization_id
         LEFT JOIN public.roles AS manager_role
           ON manager_role.id = m.workforce_role_id
          AND manager_role.organization_id = m.organization_id
          AND manager_role.scope = 'ORGANIZATION'
         LEFT JOIN LATERAL (
           SELECT u.status, u.account_scope
           FROM public.users AS u
           WHERE u.employee_id = m.id
             AND u.organization_id = m.organization_id
             AND u.role_id = m.workforce_role_id
             AND u.account_scope = 'ORGANIZATION'
           ORDER BY CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
                    u.updated_at DESC NULLS LAST,
                    u.created_at DESC NULLS LAST
           LIMIT 1
         ) AS manager_account ON TRUE
         LEFT JOIN public.employees AS e
           ON e.department_id = d.id
          AND e.organization_id = d.organization_id
         LEFT JOIN public.roles AS employee_role
           ON employee_role.id = e.workforce_role_id
          AND employee_role.organization_id = e.organization_id
          AND employee_role.scope = 'ORGANIZATION'
         WHERE d.organization_id = $1
         GROUP BY
           d.id, d.name, d.status, d.manager_id,
           m.id, m.first_name, m.last_name, m.employment_status,
           manager_role.name, manager_account.status, manager_account.account_scope
         ORDER BY COUNT(e.id) DESC, LOWER(d.name), d.id
         LIMIT 8`,
        [user.organizationId],
      ),
      client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'PENDING' AND expires_at > NOW())::int AS pending_invitations,
           COUNT(*) FILTER (WHERE (status = 'PENDING' AND expires_at <= NOW()) OR status = 'EXPIRED')::int AS expired_invitations,
           COUNT(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted_invitations,
           COUNT(*) FILTER (WHERE status = 'REVOKED')::int AS revoked_invitations
         FROM public.employee_invitations
         WHERE organization_id = $1`,
        [user.organizationId],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*) FROM public.attendance_correction_requests r
             WHERE r.organization_id = $1 AND r.status = 'PENDING'
               AND r.employee_id <> $2) AS pending_corrections,
            0::int AS submitted_timesheets,
           (SELECT COUNT(*) FROM public.attendance_overtime_requests o
             WHERE o.organization_id = $1 AND o.status = 'PENDING'
               AND o.employee_id <> $2) AS pending_overtime,
           0::int AS open_exceptions`,
        [user.organizationId, user.employeeId],
      ),
      client.query(
        `SELECT
           e.id,
           e.employee_code,
           e.first_name,
           e.last_name,
           e.email,
           e.designation,
           e.employment_status,
           e.created_at,
           d.id AS department_id,
           d.name AS department_name,
           r.name AS workforce_role
         FROM public.employees AS e
         LEFT JOIN public.departments AS d
           ON d.id = e.department_id AND d.organization_id = e.organization_id
         LEFT JOIN public.roles AS r
           ON r.id = e.workforce_role_id AND r.organization_id = e.organization_id AND r.scope = 'ORGANIZATION'
         WHERE e.organization_id = $1
           AND COALESCE(r.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT 6`,
        [user.organizationId],
      ),
      client.query(
        `SELECT
           h.id,
           h.event_type,
           h.effective_at,
           e.id AS employee_id,
           e.employee_code,
           NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), '') AS employee_name,
           d.name AS department_name
         FROM public.employee_history AS h
         JOIN public.employees AS e
           ON e.id = h.employee_id AND e.organization_id = h.organization_id
         LEFT JOIN public.departments AS d
           ON d.id = e.department_id AND d.organization_id = e.organization_id
         LEFT JOIN public.roles AS workforce_role
           ON workforce_role.id = e.workforce_role_id
          AND workforce_role.organization_id = e.organization_id
          AND workforce_role.scope = 'ORGANIZATION'
         WHERE h.organization_id = $1
           AND COALESCE(workforce_role.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
         ORDER BY h.effective_at DESC, h.id DESC
         LIMIT 8`,
        [user.organizationId],
      ),
      client.query(
        `SELECT
           (NOW() AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali'))::date::text AS work_date,
           COUNT(*) FILTER (WHERE ev.event_type = 'CLOCK_IN' AND COALESCE(attendance_role.name, 'EMPLOYEE') = 'EMPLOYEE')::int AS clock_ins_recorded,
           COUNT(*) FILTER (WHERE ev.event_type = 'CLOCK_OUT' AND COALESCE(attendance_role.name, 'EMPLOYEE') = 'EMPLOYEE')::int AS clock_outs_recorded
         FROM (SELECT 1) AS seed
         LEFT JOIN public.organization_settings AS os ON os.organization_id = $1
         LEFT JOIN public.attendance_events AS ev
           ON ev.organization_id = $1
          AND ev.work_date = (NOW() AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali'))::date
         LEFT JOIN public.employees AS attendance_employee
           ON attendance_employee.id = ev.employee_id
          AND attendance_employee.organization_id = ev.organization_id
         LEFT JOIN public.roles AS attendance_role
           ON attendance_role.id = attendance_employee.workforce_role_id
          AND attendance_role.organization_id = attendance_employee.organization_id
          AND attendance_role.scope = 'ORGANIZATION'
         GROUP BY COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')`,
        [user.organizationId],
      ),
    ]);

    const employee = employeeResult.rows[0] ?? {};
    const invitations = invitationResult.rows[0] ?? {};
    const queue = queueResult.rows[0] ?? {};
    const today = todayResult.rows[0] ?? {};
    const departments = departmentResult.rows.map((row) => ({
      ...row,
      total_employee_count: integer(row.total_employee_count),
      active_employee_count: integer(row.active_employee_count),
      inactive_employee_count: integer(row.inactive_employee_count),
      former_employee_count: integer(row.former_employee_count),
      manager_needs_attention: row.manager_needs_attention === true,
    }));

    const departmentCounts = await client.query(
      `SELECT
         COUNT(*)::int AS total_departments,
         COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_departments,
         COUNT(*) FILTER (WHERE status = 'INACTIVE')::int AS inactive_departments,
         COUNT(*) FILTER (WHERE manager_id IS NULL)::int AS departments_without_manager
       FROM public.departments
       WHERE organization_id = $1`,
      [user.organizationId],
    );
    const departmentTotals = departmentCounts.rows[0] ?? {};

    await client.query("COMMIT");
    transactionStarted = false;

    return jsonResponse({
      status: "ok",
      generatedAt: new Date().toISOString(),
      organization: {
        id: organization.id,
        name: organization.name,
        status: organization.status,
        timeZone: organization.time_zone,
        weekStartsOn: integer(organization.week_starts_on) || 1,
      },
      stats: {
        totalEmployees: integer(employee.total_employees),
        activeEmployees: integer(employee.active_employees),
        inactiveEmployees: integer(employee.inactive_employees),
        formerEmployees: integer(employee.former_employees),
        unassignedEmployees: integer(employee.unassigned_employees),
        activeUnassignedEmployees: integer(employee.active_unassigned_employees),
        hrManagerProfiles: integer(employee.hr_manager_profiles),
        departmentManagerProfiles: integer(employee.department_manager_profiles),
        totalDepartments: integer(departmentTotals.total_departments),
        activeDepartments: integer(departmentTotals.active_departments),
        inactiveDepartments: integer(departmentTotals.inactive_departments),
        departmentsWithoutManager: integer(departmentTotals.departments_without_manager),
        pendingInvitations: integer(invitations.pending_invitations),
        expiredInvitations: integer(invitations.expired_invitations),
        acceptedInvitations: integer(invitations.accepted_invitations),
        revokedInvitations: integer(invitations.revoked_invitations),
        pendingCorrections: integer(queue.pending_corrections),
        submittedTimesheets: integer(queue.submitted_timesheets),
        pendingOvertime: integer(queue.pending_overtime),
        openExceptions: integer(queue.open_exceptions),
        clockInsRecordedToday: integer(today.clock_ins_recorded),
        clockOutsRecordedToday: integer(today.clock_outs_recorded),
      },
      workDate: typeof today.work_date === "string" ? today.work_date : null,
      recentEmployees: recentEmployeesResult.rows,
      departments,
      recentActivity: activityResult.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        effectiveAt: row.effective_at,
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        departmentName: row.department_name,
      })),
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("HR Manager overview rollback failed:", rollbackError);
      }
    }

    console.error("HR Manager overview failed:", error);
    return jsonResponse({ status: "error", message: "Unable to load the HR Manager overview" }, 500);
  } finally {
    client?.release();
  }
}
