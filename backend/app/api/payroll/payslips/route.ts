import { connection, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { organizationIsActive } from "../../../../lib/schedule-utils";

function json(body: unknown, status = 200) {
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

function validMonth(value: string | null): value is string {
  if (!value || !/^\\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function monthOrdinal(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

/**
 * GET /api/payroll/payslips?startMonth=YYYY-MM&endMonth=YYYY-MM
 *
 * Returns only eligible workforce identities. Every slip is subsequently
 * fetched through the employee-specific endpoint, which rechecks authorization.
 */
export async function GET(request: Request) {
  await connection();

  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);

    const isOrganizationAdmin = actor.kind === "ORGANIZATION_ADMIN";
    const isHrManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER";
    if (!isOrganizationAdmin && !isHrManager) {
      return json({ message: "Only an Organization Admin or HR Manager can generate workforce salary slips" }, 403);
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return json({ message: "This organization is not active" }, 403);
    }

    const url = new URL(request.url);
    const startMonth = url.searchParams.get("startMonth");
    const endMonth = url.searchParams.get("endMonth");
    if (!validMonth(startMonth) || !validMonth(endMonth)) {
      return json({ message: "Provide startMonth and endMonth in YYYY-MM format" }, 400);
    }
    if (monthOrdinal(startMonth) > monthOrdinal(endMonth)) {
      return json({ message: "The start month must be before or equal to the end month" }, 400);
    }
    if (monthOrdinal(endMonth) - monthOrdinal(startMonth) + 1 > 24) {
      return json({ message: "A salary-slip report can cover at most 24 months at a time" }, 400);
    }

    const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
    const fromDate = `${startMonth}-01`;
    const toDate = new Date(Date.UTC(endYear, endMonthNumber, 0)).toISOString().slice(0, 10);
    const allowedWorkforceRoles = isOrganizationAdmin
      ? ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER", "HR_MANAGER", "HRMANAGER"]
      : ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER"];

    const result = await pool.query<{
      employeeId: string;
      employeeCode: string | null;
      firstName: string;
      lastName: string;
      departmentName: string | null;
      workforceRole: string | null;
    }>(
      `SELECT
         e.id AS "employeeId",
         e.employee_code AS "employeeCode",
         e.first_name AS "firstName",
         e.last_name AS "lastName",
         d.name AS "departmentName",
         COALESCE(account_role.name, workforce_role.name) AS "workforceRole"
       FROM public.employees AS e
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS workforce_role
         ON workforce_role.id = e.workforce_role_id
        AND workforce_role.organization_id = e.organization_id
       LEFT JOIN LATERAL (
         SELECT linked_role.name
         FROM public.users AS workforce_account
         JOIN public.roles AS linked_role
           ON linked_role.id = workforce_account.role_id
          AND linked_role.organization_id = workforce_account.organization_id
          AND linked_role.scope = 'ORGANIZATION'
         WHERE workforce_account.employee_id = e.id
           AND workforce_account.organization_id = e.organization_id
           AND workforce_account.account_scope = 'ORGANIZATION'
         ORDER BY
           CASE WHEN workforce_account.status = 'ACTIVE' THEN 0 ELSE 1 END,
           workforce_account.updated_at DESC NULLS LAST,
           workforce_account.created_at DESC NULLS LAST,
           workforce_account.id
         LIMIT 1
       ) AS account_role ON TRUE
       WHERE e.organization_id = $1::uuid
         AND regexp_replace(
           UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')),
           '[^A-Z0-9]+',
           '_',
           'g'
         ) = ANY($4::text[])
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'ORGANIZATION_ADMIN%'
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'ORGANIZATIONADMIN%'
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'ORG_ADMIN%'
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'ORGANIZATION_OWNER%'
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'ORG_OWNER%'
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'TENANT_ADMIN%'
         AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'ADMINISTRATOR%'
         AND (
           NOT $5::boolean
           OR (
             e.id <> $6::uuid
             AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, '')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'HR_MANAGER%'
             AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, '')), '[^A-Z0-9]+', '_', 'g') NOT LIKE 'HRMANAGER%'
           )
         )
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
               regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g')
                 IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR',
                     'ORG_ADMINISTRATOR', 'ORGANIZATION_OWNER', 'ORG_OWNER', 'TENANT_ADMIN', 'ADMINISTRATOR')
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_ADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATIONADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_ADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_OWNER_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_OWNER_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'TENANT_ADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ADMINISTRATOR_%'
             )
         )
         AND (
           e.employment_status = 'ACTIVE'
           OR EXISTS (
             SELECT 1
             FROM public.monthly_salary_payments AS payment
             WHERE payment.organization_id = e.organization_id
               AND payment.employee_id = e.id
               AND payment.pay_month BETWEEN $2::date AND date_trunc('month', $3::date)::date
           )
           OR EXISTS (
             SELECT 1
             FROM public.attendance_events AS event
             WHERE event.organization_id = e.organization_id
               AND event.employee_id = e.id
               AND event.work_date BETWEEN $2::date AND $3::date
           )
           OR EXISTS (
             SELECT 1
             FROM public.employee_pay_rates AS rate
             WHERE rate.organization_id = e.organization_id
               AND rate.employee_id = e.id
               AND rate.effective_from <= $3::date
               AND (rate.effective_to IS NULL OR rate.effective_to >= $2::date)
           )
           OR EXISTS (
             SELECT 1
             FROM public.leave_requests AS leave
             WHERE leave.organization_id = e.organization_id
               AND leave.employee_id = e.id
               AND leave.status = 'APPROVED'
               AND leave.start_date <= $3::date
               AND leave.end_date >= $2::date
           )
         )
       ORDER BY
         LOWER(TRIM(CONCAT_WS(' ', e.first_name, e.last_name))) NULLS LAST,
         e.employee_code NULLS LAST,
         e.id`,
      [
        actor.organizationId,
        fromDate,
        toDate,
        allowedWorkforceRoles,
        isHrManager,
        isHrManager ? actor.employeeId : null,
      ],
    );

    return json({
      status: "ok",
      startMonth,
      endMonth,
      scope: isOrganizationAdmin ? "ORGANIZATION" : "HR_DIRECT_REPORTS",
      generatedAt: new Date().toISOString(),
      employees: result.rows.map((row) => ({
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        firstName: row.firstName,
        lastName: row.lastName,
        departmentName: row.departmentName,
        workforceRole: row.workforceRole,
      })),
    });
  } catch (error) {
    console.error("Failed to load workforce salary-slip scope:", error);
    return json({ message: "Unable to load the authorized workforce for this salary-slip report" }, 500);
  }
}
