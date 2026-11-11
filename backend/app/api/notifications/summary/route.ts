import { connection, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { organizationIsActive } from "../../../../lib/schedule-utils";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } });
}

export async function GET() {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);

    const isEmployee = actor.kind === "ORGANIZATION_USER" && actor.roleName === "EMPLOYEE";
    const isDepartmentManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";
    const isOrganizationAdmin = actor.kind === "ORGANIZATION_ADMIN";
    const isHrManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER";
    if (!isEmployee && !isDepartmentManager && !isHrManager && !isOrganizationAdmin) return json({ message: "You do not have permission to view alerts" }, 403);

    let unreadMessages = 0;
    try {
      const messagesResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM public.workforce_messages m
         JOIN public.workforce_conversations c
           ON c.id = m.conversation_id AND c.organization_id = m.organization_id
         WHERE c.organization_id = $1::uuid
           AND (c.created_by_user_id = $2::uuid OR c.recipient_user_id = $2::uuid)
           AND m.sender_user_id <> $2::uuid
           AND m.read_at IS NULL`,
        [actor.organizationId, actor.userId],
      );
      unreadMessages = Number(messagesResult.rows[0]?.count ?? 0);
    } catch (error) {
      // This alert remains optional until the communications migration is applied.
      console.warn("Unread communication alert unavailable:", error);
    }

    const values: unknown[] = [actor.organizationId];
    let employeeScope = "";
    if (actor.kind === "ORGANIZATION_USER" && (isEmployee || isDepartmentManager)) {
      values.push(actor.employeeId);
      const idParam = `$${values.length}::uuid`;
      employeeScope = isEmployee
        ? ` AND r.employee_id = ${idParam}`
        : ` AND EXISTS (SELECT 1 FROM public.employees scoped_employee JOIN public.departments scoped_department ON scoped_department.id = scoped_employee.department_id AND scoped_department.organization_id = scoped_employee.organization_id WHERE scoped_employee.id = r.employee_id AND scoped_employee.organization_id = r.organization_id AND scoped_department.manager_id = ${idParam})`;
    }

    const correctionResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.attendance_correction_requests r WHERE r.organization_id = $1::uuid AND r.status = 'PENDING'${employeeScope}`,
      values,
    );
    const overtimeResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.attendance_overtime_requests r WHERE r.organization_id = $1::uuid AND r.status = 'PENDING'${employeeScope}`,
      values,
    );

    const leaveValues: unknown[] = [actor.organizationId];
    let leaveScope = "";
    if (actor.kind === "ORGANIZATION_USER" && isEmployee) {
      leaveValues.push(actor.employeeId);
      leaveScope = ` AND r.employee_id = $${leaveValues.length}::uuid`;
    } else if (actor.kind === "ORGANIZATION_USER" && isDepartmentManager) {
      leaveValues.push(actor.employeeId);
      leaveScope = ` AND EXISTS (SELECT 1 FROM public.employees le JOIN public.departments ld ON ld.id = le.department_id AND ld.organization_id = le.organization_id WHERE le.id = r.employee_id AND le.organization_id = r.organization_id AND ld.manager_id = $${leaveValues.length}::uuid)`;
    }
    const leaveResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.leave_requests r WHERE r.organization_id = $1::uuid AND r.status = 'PENDING'${leaveScope}`,
      leaveValues,
    );
    let recentLeaveDecisions = 0;
    if (isEmployee && actor.kind === "ORGANIZATION_USER") {
      const decisions = await pool.query(
        `SELECT COUNT(*)::int AS count FROM public.leave_requests r WHERE r.organization_id = $1::uuid AND r.employee_id = $2::uuid AND r.status IN ('APPROVED', 'REJECTED') AND r.decision_at >= now() - interval '7 days'`,
        [actor.organizationId, actor.employeeId],
      );
      recentLeaveDecisions = Number(decisions.rows[0]?.count ?? 0);
    }

    let unpaidSalaryPayments = 0;
    if (isHrManager) {
      try {
        const salaryResult = await pool.query(
          `SELECT COUNT(*)::int AS count FROM public.monthly_salary_payments WHERE organization_id = $1::uuid AND status = 'UNPAID' AND pay_month = date_trunc('month', CURRENT_DATE)::date`,
          [actor.organizationId],
        );
        unpaidSalaryPayments = Number(salaryResult.rows[0]?.count ?? 0);
      } catch (error) {
        // Salary tracking is an optional migration for deployments that have not enabled payroll yet.
        console.warn("Salary alert count unavailable:", error);
      }
    }

    const corrections = Number(correctionResult.rows[0]?.count ?? 0);
    const overtime = Number(overtimeResult.rows[0]?.count ?? 0);
    const leave = Number(leaveResult.rows[0]?.count ?? 0);
    const alerts = [] as { id: string; title: string; count: number; href: string; tone: "warning" | "info" }[];
    if (!isOrganizationAdmin && corrections > 0) alerts.push({ id: "corrections", title: isEmployee ? "Your correction requests awaiting review" : "Attendance corrections awaiting review", count: corrections, href: isEmployee ? "/employee/requests" : "/dm/reviews", tone: "warning" });
    if (!isOrganizationAdmin && overtime > 0) alerts.push({ id: "overtime", title: isEmployee ? "Your overtime requests awaiting review" : "Overtime requests awaiting review", count: overtime, href: isEmployee ? "/employee/requests" : "/dm/reviews", tone: "warning" });
    if (!isOrganizationAdmin && leave > 0) alerts.push({ id: "leave", title: isEmployee ? "Your leave requests awaiting review" : "Leave requests awaiting review", count: leave, href: isEmployee ? "/employee/leave" : isDepartmentManager ? "/dm/leave" : "/hr/modules/leave", tone: "warning" });
    if (isEmployee && recentLeaveDecisions > 0) alerts.push({ id: "leave-decisions", title: "Leave requests recently approved or declined", count: recentLeaveDecisions, href: "/employee/leave", tone: "info" });
    if (unpaidSalaryPayments > 0) alerts.push({ id: "salary", title: "Unpaid salary records for this month", count: unpaidSalaryPayments, href: "/hr/modules/payroll", tone: "info" });
    if (unreadMessages > 0) alerts.push({ id: "messages", title: "Unread messages", count: unreadMessages, href: isEmployee ? "/employee/communications" : isDepartmentManager ? "/dm/communications" : isHrManager ? "/hr/communications" : "/org/communications", tone: "info" });

    return json({ status: "ok", alerts, total: alerts.reduce((sum, item) => sum + item.count, 0), unreadMessages, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Failed to load attendance alerts:", error);
    return json({ message: "Unable to load alerts" }, 500);
  }
}
