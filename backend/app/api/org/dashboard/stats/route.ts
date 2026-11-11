import { connection, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { pool } from "../../../../../lib/db";
import { getOrganizationAdmin } from "../../../../../lib/auth";
import { getOrganizationLicenseAccess } from "../../../../../lib/licensing";

/**
 * GET /api/org/dashboard/stats
 *
 * Returns a consistent, tenant-scoped workforce summary for the Organization
 * Admin dashboard. Tenant identity comes only from the authenticated server
 * session; the client cannot choose an organization ID.
 */
export async function GET() {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    const admin = await getOrganizationAdmin();

    if (!admin) {
      return NextResponse.json(
        { status: "error", message: "Authentication required" },
        { status: 401 },
      );
    }

    // The Organization Admin may still authenticate for licensing, payment,
    // setup, and account-security workflows. The normal HRMS dashboard must
    // remain unavailable unless the tenant has a currently valid license.
    const licenseAccess = await getOrganizationLicenseAccess(
      admin.organizationId,
    );

    if (!licenseAccess?.canAccess) {
      return NextResponse.json(
        {
          status: "error",
          message: "Organization license is not active",
          code: "LICENSE_REQUIRED",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }

    client = await pool.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;

    const organizationResult = await client.query<{
      id: string;
      name: string;
      status: string;
    }>(
      `SELECT id, name, status
       FROM public.organizations
       WHERE id = $1 AND status = 'ACTIVE'
       LIMIT 1`,
      [admin.organizationId],
    );

    const organization = organizationResult.rows[0];
    if (!organization) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { status: "error", message: "Organization is not active" },
        { status: 403 },
      );
    }

    const employeeResult = await client.query(
      `SELECT
         COUNT(e.id) AS total_employees,
         COUNT(e.id) FILTER (WHERE e.employment_status = 'ACTIVE') AS active_employees,
         COUNT(e.id) FILTER (WHERE e.employment_status = 'INACTIVE') AS inactive_employees,
         COUNT(e.id) FILTER (WHERE e.employment_status = 'FORMER') AS former_employees,
         COUNT(e.id) FILTER (WHERE d.id IS NOT NULL) AS assigned_employees,
         COUNT(e.id) FILTER (WHERE d.id IS NULL) AS unassigned_employees,
         COUNT(e.id) FILTER (
           WHERE r.name = 'HR_MANAGER' AND r.scope = 'ORGANIZATION'
         ) AS hr_manager_profiles,
         COUNT(e.id) FILTER (
           WHERE r.name = 'DEPARTMENT_MANAGER' AND r.scope = 'ORGANIZATION'
         ) AS department_manager_profiles,
         COUNT(e.id) FILTER (
           WHERE r.name = 'EMPLOYEE' AND r.scope = 'ORGANIZATION'
         ) AS employee_profiles,
         COUNT(e.id) FILTER (
           WHERE e.employment_status = 'ACTIVE'
             AND r.name = 'HR_MANAGER'
             AND r.scope = 'ORGANIZATION'
             AND account.status = 'ACTIVE'
         ) AS active_hr_managers,
         COUNT(e.id) FILTER (
           WHERE e.employment_status = 'ACTIVE'
             AND r.name = 'DEPARTMENT_MANAGER'
             AND r.scope = 'ORGANIZATION'
             AND account.status = 'ACTIVE'
         ) AS active_department_managers,
         COUNT(e.id) FILTER (
           WHERE e.employment_status = 'ACTIVE'
             AND e.is_primary_hr_manager IS TRUE
             AND r.name = 'HR_MANAGER'
             AND r.scope = 'ORGANIZATION'
             AND account.status = 'ACTIVE'
         ) AS active_primary_hr_managers
       FROM public.employees AS e
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS r
         ON r.id = e.workforce_role_id
        AND r.organization_id = e.organization_id
        AND r.scope = 'ORGANIZATION'
       LEFT JOIN LATERAL (
         SELECT u.status
         FROM public.users AS u
         WHERE u.employee_id = e.id
           AND u.organization_id = e.organization_id
           AND u.role_id = e.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
         ORDER BY CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
                  u.updated_at DESC NULLS LAST,
                  u.created_at DESC NULLS LAST
         LIMIT 1
       ) AS account ON TRUE
       WHERE e.organization_id = $1`,
      [admin.organizationId],
    );

    const departmentResult = await client.query(
      `SELECT
         d.id,
         d.name,
         d.status,
         d.manager_id,
         NULLIF(TRIM(CONCAT_WS(' ', manager.first_name, manager.last_name)), '') AS manager_name,
         manager.employee_code AS manager_employee_code,
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
         COUNT(e.id) AS total_employee_count,
         COUNT(e.id) FILTER (WHERE e.employment_status = 'ACTIVE') AS active_employee_count,
         COUNT(e.id) FILTER (WHERE e.employment_status = 'INACTIVE') AS inactive_employee_count,
         COUNT(e.id) FILTER (WHERE e.employment_status = 'FORMER') AS former_employee_count
       FROM public.departments AS d
       LEFT JOIN public.employees AS manager
         ON manager.id = d.manager_id
        AND manager.organization_id = d.organization_id
       LEFT JOIN public.roles AS manager_role
         ON manager_role.id = manager.workforce_role_id
        AND manager_role.organization_id = manager.organization_id
        AND manager_role.scope = 'ORGANIZATION'
       LEFT JOIN LATERAL (
         SELECT u.status, u.account_scope
         FROM public.users AS u
         WHERE u.employee_id = manager.id
           AND u.organization_id = manager.organization_id
           AND u.role_id = manager.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
         ORDER BY CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
                  u.updated_at DESC NULLS LAST,
                  u.created_at DESC NULLS LAST
         LIMIT 1
       ) AS manager_account ON TRUE
       LEFT JOIN public.employees AS e
         ON e.department_id = d.id
        AND e.organization_id = d.organization_id
       WHERE d.organization_id = $1
       GROUP BY
         d.id, d.organization_id, d.name, d.status, d.manager_id,
         manager.id, manager.first_name, manager.last_name, manager.employee_code,
         manager.employment_status, manager_role.name, manager_role.scope,
         manager_role.organization_id, manager_account.status,
         manager_account.account_scope
       ORDER BY COUNT(e.id) DESC, LOWER(d.name) ASC, d.id ASC`,
      [admin.organizationId],
    );

    const invitationResult = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE status = 'PENDING' AND expires_at > NOW()
         ) AS pending_invitations,
         COUNT(*) FILTER (
           WHERE status = 'PENDING' AND expires_at <= NOW()
         ) AS expired_pending_invitations
       FROM public.employee_invitations
       WHERE organization_id = $1`,
      [admin.organizationId],
    );

    const employees = employeeResult.rows[0] ?? {};
    const invitations = invitationResult.rows[0] ?? {};
    const departments = departmentResult.rows.map((row) => ({
      ...row,
      total_employee_count: Number(row.total_employee_count ?? 0),
      active_employee_count: Number(row.active_employee_count ?? 0),
      inactive_employee_count: Number(row.inactive_employee_count ?? 0),
      former_employee_count: Number(row.former_employee_count ?? 0),
    }));

    const totalEmployees = Number(employees.total_employees ?? 0);
    const assignedEmployees = Number(employees.assigned_employees ?? 0);
    const unassignedEmployees = Math.max(0, totalEmployees - assignedEmployees);
    const activeDepartments = departments.filter(
      (department) => String(department.status).toUpperCase() === "ACTIVE",
    ).length;
    const inactiveDepartments = departments.length - activeDepartments;
    const departmentStaffingRate = totalEmployees > 0
      ? Math.round((assignedEmployees / totalEmployees) * 100)
      : 0;
    const activeDepartmentRate = departments.length > 0
      ? (activeDepartments / departments.length) * 100
      : 0;
    const healthScore = Math.min(
      100,
      Math.round((departmentStaffingRate * 0.7) + (activeDepartmentRate * 0.3)),
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      status: "ok",
      generatedAt: new Date().toISOString(),
      organization: {
        id: organization.id,
        name: organization.name,
        status: organization.status,
      },
      stats: {
        totalEmployees,
        activeEmployees: Number(employees.active_employees ?? 0),
        inactiveEmployees: Number(employees.inactive_employees ?? 0),
        formerEmployees: Number(employees.former_employees ?? 0),
        assignedEmployees,
        unassignedEmployees,
        totalDepartments: departments.length,
        activeDepartments,
        inactiveDepartments,
        departmentsWithEligibleManager: departments.filter(
          (department) => department.manager_eligible === true,
        ).length,
        departmentsWithoutEligibleManager: departments.filter(
          (department) => department.manager_eligible !== true,
        ).length,
        departmentStaffingRate,
        healthScore,
        healthLabel: healthScore >= 85 ? "Healthy" : healthScore >= 70 ? "Monitor" : "Needs attention",
        hrManagerProfiles: Number(employees.hr_manager_profiles ?? 0),
        departmentManagerProfiles: Number(employees.department_manager_profiles ?? 0),
        employeeProfiles: Number(employees.employee_profiles ?? 0),
        activeHrManagers: Number(employees.active_hr_managers ?? 0),
        activeDepartmentManagers: Number(employees.active_department_managers ?? 0),
        activePrimaryHrManagers: Number(employees.active_primary_hr_managers ?? 0),
        pendingInvitations: Number(invitations.pending_invitations ?? 0),
        expiredPendingInvitations: Number(invitations.expired_pending_invitations ?? 0),
      },
      departmentDistribution: departments,
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Organization dashboard stats rollback failed:", rollbackError);
      }
    }

    console.error("Organization dashboard stats error:", error);
    return NextResponse.json(
      { status: "error", message: "Unable to load organization dashboard statistics" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
