import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { pool } from "../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../lib/auth";

export async function GET() {
  try {
    // Only an authenticated Platform Super Admin may access these stats.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        { status: "error", message: "Unauthorized" },
        { status: 401 },
      );
    }

    // Group by the stored organization lifecycle status so Archived is explicit,
    // rather than inferred as a remainder that could include future statuses.
    const organizationResult = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM organizations
      GROUP BY status
    `);

    const organizationCounts: Record<string, number> = {};
    for (const row of organizationResult.rows) {
      organizationCounts[String(row.status)] = Number(row.count);
    }

    // Return a complete six-month registration series, including zero-count
    // months. This avoids deriving historical totals from a paginated list.
    const monthlyRegistrationResult = await pool.query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS month_start
      )
      SELECT
        TO_CHAR(months.month_start, 'YYYY-MM') AS month,
        COUNT(organizations.id)::int AS count
      FROM months
      LEFT JOIN public.organizations AS organizations
        ON organizations.created_at >= months.month_start
        AND organizations.created_at < months.month_start + INTERVAL '1 month'
      GROUP BY months.month_start
      ORDER BY months.month_start
    `);
    const monthlyRegistrations = monthlyRegistrationResult.rows.map((row) => ({
      month: String(row.month),
      count: Number(row.count ?? 0),
    }));

    const userResult = await pool.query(`
      SELECT
        COUNT(u.id) AS total_users,
        COUNT(u.id) FILTER (WHERE u.status = 'ACTIVE') AS active_users,
        COUNT(u.id) FILTER (
          WHERE u.account_scope = 'PLATFORM'
            AND u.organization_id IS NULL
            AND u.employee_id IS NULL
            AND r.name = 'SUPER_ADMIN'
            AND r.scope = 'PLATFORM'
            AND r.organization_id IS NULL
        ) AS platform_admin_users,
        COUNT(u.id) FILTER (
          WHERE u.account_scope = 'ORGANIZATION'
            AND u.organization_id IS NOT NULL
            AND r.name = 'ORGANIZATION_ADMIN'
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = u.organization_id
        ) AS organization_admin_users,
        COUNT(u.id) FILTER (
          WHERE u.account_scope = 'ORGANIZATION'
            AND u.organization_id IS NOT NULL
            AND u.employee_id IS NOT NULL
            AND r.name = 'EMPLOYEE'
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = u.organization_id
        ) AS employee_users,
        COUNT(u.id) FILTER (
          WHERE u.account_scope = 'ORGANIZATION'
            AND u.organization_id IS NOT NULL
            AND u.employee_id IS NOT NULL
            AND r.name = 'HR_MANAGER'
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = u.organization_id
        ) AS hr_manager_users,
        COUNT(u.id) FILTER (
          WHERE u.account_scope = 'ORGANIZATION'
            AND u.organization_id IS NOT NULL
            AND u.employee_id IS NOT NULL
            AND r.name = 'DEPARTMENT_MANAGER'
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = u.organization_id
        ) AS department_manager_users
      FROM users AS u
      LEFT JOIN roles AS r ON r.id = u.role_id
    `);

    const userCounts = userResult.rows[0] ?? {};
    const employeeResult = await pool.query(`
      SELECT
        COUNT(*) AS total_employees,
        COUNT(*) FILTER (WHERE employment_status = 'ACTIVE') AS active_employees,
        COUNT(*) FILTER (WHERE employment_status = 'INACTIVE') AS inactive_employees,
        COUNT(*) FILTER (WHERE employment_status = 'FORMER') AS former_employees
      FROM public.employees
    `);
    const employeeCounts = employeeResult.rows[0] ?? {};
    const totalEmployees = Number(employeeCounts.total_employees ?? 0);

    const invitationResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM public.organization_invitations WHERE status = 'PENDING' AND expires_at > NOW()) AS pending_organization_invitations,
        (SELECT COUNT(*) FROM public.employee_invitations WHERE status = 'PENDING' AND expires_at > NOW()) AS pending_employee_invitations
    `);
    const invitationCounts = invitationResult.rows[0] ?? {};
    const pendingOrganizationInvitations = Number(invitationCounts.pending_organization_invitations ?? 0);
    const pendingEmployeeInvitations = Number(invitationCounts.pending_employee_invitations ?? 0);
    const pendingInvitations = pendingOrganizationInvitations + pendingEmployeeInvitations;

    const stats = {
      totalOrganizations: Object.values(organizationCounts).reduce((total, count) => total + count, 0),
      activeOrganizations: organizationCounts.ACTIVE ?? 0,
      pendingSetupOrganizations: organizationCounts.PENDING_SETUP ?? 0,
      suspendedOrganizations: organizationCounts.SUSPENDED ?? 0,
      archivedOrganizations: organizationCounts.ARCHIVED ?? 0,
      totalUsers: Number(userCounts.total_users ?? 0),
      activeUsers: Number(userCounts.active_users ?? 0),
      platformAdminUsers: Number(userCounts.platform_admin_users ?? 0),
      organizationAdminUsers: Number(userCounts.organization_admin_users ?? 0),
      employeeUsers: Number(userCounts.employee_users ?? 0),
      hrManagerUsers: Number(userCounts.hr_manager_users ?? 0),
      departmentManagerUsers: Number(userCounts.department_manager_users ?? 0),
      totalEmployees,
      activeEmployees: Number(employeeCounts.active_employees ?? 0),
      inactiveEmployees: Number(employeeCounts.inactive_employees ?? 0),
      formerEmployees: Number(employeeCounts.former_employees ?? 0),
      pendingInvitations,
      pendingOrganizationInvitations,
      pendingEmployeeInvitations,
      monthlyRegistrations,
    };

    return NextResponse.json({ status: "ok", stats });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { status: "error", message: "Failed to load dashboard statistics" },
      { status: 500 },
    );
  }
}
