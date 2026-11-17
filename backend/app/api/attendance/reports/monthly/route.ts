import { connection } from "next/server";
import { pool } from "../../../../../lib/db";
import { calculateDailyAttendance, type AttendanceCalculationEvent } from "../../../../../lib/attendance-calculations";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { isValidDateString, jsonResponse, organizationIsActive } from "../../../../../lib/schedule-utils";
import { normalizeWorkforceRole } from "../../../../../lib/workforce-eligibility";

type Actor = NonNullable<Awaited<ReturnType<typeof getTenantPermissionActor>>>;
type TargetRow = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentName: string | null;
  workforceRole: string | null;
  employmentStatus: string | null;
};
type ReportDayRow = TargetRow & {
  organizationName: string;
  timeZone: string;
  workDate: string;
  scheduleName: string | null;
  expectedStart: Date | string | null;
  expectedEnd: Date | string | null;
  scheduledBreakMinutes: number | string | null;
  firstClockIn: Date | string | null;
  lastClockOut: Date | string | null;
  eventCount: number | string;
  events: AttendanceCalculationEvent[] | string | null;
  approvedOvertimeMinutes: number | string | null;
  excessOvertimeReviewStatus: string | null;
  leaveRequest: { leaveType?: string; status?: string; isPaid?: boolean } | null;
  publicHoliday: { name?: string; isPaid?: boolean } | null;
};

function parseEvents(value: ReportDayRow["events"]): AttendanceCalculationEvent[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as AttendanceCalculationEvent[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function monthOrdinal(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function allowedRoles(actor: Actor): string[] {
  if (actor.kind === "ORGANIZATION_ADMIN") {
    return ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER", "HR_MANAGER", "HRMANAGER"];
  }
  if (actor.kind !== "ORGANIZATION_USER") return [];
  if (actor.roleName === "HR_MANAGER") {
    return ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER"];
  }
  if (actor.roleName === "DEPARTMENT_MANAGER") return ["EMPLOYEE"];
  if (actor.roleName === "EMPLOYEE") return ["EMPLOYEE"];
  return [];
}

function permittedTarget(actor: Actor, employeeId: string, roleValue: unknown): boolean {
  const role = normalizeWorkforceRole(roleValue || "EMPLOYEE");
  const admin = actor.kind === "ORGANIZATION_ADMIN";
  if (admin) return ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER", "HR_MANAGER", "HRMANAGER"].includes(role);
  if (actor.kind !== "ORGANIZATION_USER") return false;
  if (actor.roleName === "HR_MANAGER") {
    return employeeId !== actor.employeeId && ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER"].includes(role);
  }
  if (actor.roleName === "DEPARTMENT_MANAGER") return role === "EMPLOYEE";
  if (actor.roleName === "EMPLOYEE") return employeeId === actor.employeeId && role === "EMPLOYEE";
  return false;
}

function json(body: unknown, status = 200) {
  return jsonResponse(body, status);
}

async function resolveTarget(actor: Actor, employeeId: string): Promise<TargetRow | null> {
  const result = await pool.query<TargetRow & { isOrganizationAdmin: boolean }>(
    `SELECT
       e.id AS "employeeId",
       e.employee_code AS "employeeCode",
       e.first_name AS "firstName",
       e.last_name AS "lastName",
       d.name AS "departmentName",
       COALESCE(workforce_role.name, account_role.name, 'EMPLOYEE') AS "workforceRole",
       e.employment_status AS "employmentStatus",
       EXISTS (
         SELECT 1
         FROM public.users AS admin_account
         JOIN public.roles AS admin_role
           ON admin_role.id = admin_account.role_id
          AND admin_role.organization_id = admin_account.organization_id
         WHERE admin_account.organization_id = e.organization_id
           AND admin_account.employee_id = e.id
           AND admin_account.account_scope = 'ORGANIZATION'
           AND (
             regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') IN (
               'ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR',
               'ORGANIZATION_OWNER', 'ORG_OWNER', 'TENANT_ADMIN', 'ADMINISTRATOR'
             )
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_ADMIN_%'
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATIONADMIN_%'
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_ADMIN_%'
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_OWNER_%'
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_OWNER_%'
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'TENANT_ADMIN_%'
             OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ADMINISTRATOR_%'
           )
       ) AS "isOrganizationAdmin"
     FROM public.employees AS e
     LEFT JOIN public.departments AS d
       ON d.id = e.department_id AND d.organization_id = e.organization_id
     LEFT JOIN public.roles AS workforce_role
       ON workforce_role.id = e.workforce_role_id AND workforce_role.organization_id = e.organization_id
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
       AND e.id = $2::uuid
     LIMIT 1`,
    [actor.organizationId, employeeId],
  );
  const target = result.rows[0];
  if (!target || target.isOrganizationAdmin) return null;
  if (!permittedTarget(actor, target.employeeId, target.workforceRole)) return null;
  if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER") {
    const membership = await pool.query(
      `SELECT 1
       FROM public.departments
       WHERE organization_id = $1::uuid
         AND id = (SELECT department_id FROM public.employees WHERE id = $2::uuid AND organization_id = $1::uuid)
         AND manager_id = $3::uuid
       LIMIT 1`,
      [actor.organizationId, employeeId, actor.employeeId],
    );
    if (!membership.rowCount) return null;
  }
  return target;
}

/**
 * GET /api/attendance/reports/monthly?mode=targets
 * GET /api/attendance/reports/monthly?employeeId=...&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * The endpoint enforces the workforce target matrix on the server:
 * Organization Admin -> HR Managers, Department Managers and Employees.
 * HR Manager -> Department Managers and Employees (never their own record).
 * Department Manager -> Employees in assigned departments.
 * Employee -> their own record only.
 */
export async function GET(request: Request) {
  await connection();
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return json({ message: "This organization is not active" }, 403);
    }

    const roles = allowedRoles(actor);
    if (!roles.length) {
      return json({ message: "You do not have permission to access attendance reports" }, 403);
    }

    const url = new URL(request.url);
    if (url.searchParams.get("mode") === "targets") {
      const isEmployee = actor.kind === "ORGANIZATION_USER" && actor.roleName === "EMPLOYEE";
      const isDepartmentManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";
      const isHrManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER";
      const result = await pool.query<TargetRow>(
        `SELECT
           e.id AS "employeeId",
           e.employee_code AS "employeeCode",
           e.first_name AS "firstName",
           e.last_name AS "lastName",
           d.name AS "departmentName",
           COALESCE(workforce_role.name, account_role.name, 'EMPLOYEE') AS "workforceRole",
           e.employment_status AS "employmentStatus"
         FROM public.employees AS e
         LEFT JOIN public.departments AS d
           ON d.id = e.department_id AND d.organization_id = e.organization_id
         LEFT JOIN public.roles AS workforce_role
           ON workforce_role.id = e.workforce_role_id AND workforce_role.organization_id = e.organization_id
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
           ORDER BY CASE WHEN workforce_account.status = 'ACTIVE' THEN 0 ELSE 1 END,
                    workforce_account.updated_at DESC NULLS LAST,
                    workforce_account.created_at DESC NULLS LAST,
                    workforce_account.id
           LIMIT 1
         ) AS account_role ON TRUE
         WHERE e.organization_id = $1::uuid
           AND regexp_replace(UPPER(COALESCE(workforce_role.name, account_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') = ANY($2::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM public.users AS admin_account
             JOIN public.roles AS admin_role
               ON admin_role.id = admin_account.role_id
              AND admin_role.organization_id = admin_account.organization_id
             WHERE admin_account.organization_id = e.organization_id
               AND admin_account.employee_id = e.id
               AND admin_account.account_scope = 'ORGANIZATION'
               AND (
                 regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') IN (
                   'ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR',
                   'ORGANIZATION_OWNER', 'ORG_OWNER', 'TENANT_ADMIN', 'ADMINISTRATOR'
                 )
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_ADMIN_%'
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATIONADMIN_%'
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_ADMIN_%'
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_OWNER_%'
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_OWNER_%'
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'TENANT_ADMIN_%'
                 OR regexp_replace(UPPER(admin_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ADMINISTRATOR_%'
               )
           )
           AND (NOT $3::boolean OR e.id <> $4::uuid)
           AND (NOT $5::boolean OR e.id = $4::uuid)
           AND (
             NOT $6::boolean
             OR EXISTS (
               SELECT 1
               FROM public.departments AS managed_department
               WHERE managed_department.organization_id = e.organization_id
                 AND managed_department.id = e.department_id
                 AND managed_department.manager_id = $4::uuid
             )
           )
         ORDER BY e.last_name NULLS LAST, e.first_name NULLS LAST, e.employee_code NULLS LAST
         LIMIT 5000`,
        [
          actor.organizationId,
          roles,
          isHrManager,
          actor.kind === "ORGANIZATION_USER" ? actor.employeeId : null,
          isEmployee,
          isDepartmentManager,
        ],
      );
      return json({ status: "ok", targets: result.rows });
    }

    const employeeId = url.searchParams.get("employeeId");
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    if (!employeeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId)) {
      return json({ message: "Select a valid workforce member" }, 400);
    }
    if (
      !isValidDateString(fromDate) ||
      !isValidDateString(toDate) ||
      fromDate > toDate
    ) {
      return json({ message: "Choose valid start and end dates in YYYY-MM-DD format, with the start date on or before the end date" }, 400);
    }
    const monthCount = monthOrdinal(toDate) - monthOrdinal(fromDate) + 1;
    if (monthCount > 24) {
      return json({ message: "Attendance PDFs can cover at most 24 calendar months at a time" }, 400);
    }

    const target = await resolveTarget(actor, employeeId);
    if (!target) return json({ message: "You do not have permission to print attendance records for this workforce member" }, 403);

    const metadataResult = await pool.query<{ organizationName: string; timeZone: string; generatedBy: string }>(
      `SELECT
         o.name AS "organizationName",
         COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', actor_employee.first_name, actor_employee.last_name)), ''),
                  NULLIF(actor_user.email, ''), 'Authorized workforce user') AS "generatedBy"
       FROM public.organizations AS o
       LEFT JOIN public.organization_settings AS os ON os.organization_id = o.id
       LEFT JOIN public.users AS actor_user ON actor_user.id = $2::uuid AND actor_user.organization_id = o.id
       LEFT JOIN public.employees AS actor_employee ON actor_employee.id = $3::uuid AND actor_employee.organization_id = o.id
       WHERE o.id = $1::uuid LIMIT 1`,
      [actor.organizationId, actor.userId, actor.kind === "ORGANIZATION_USER" ? actor.employeeId : null],
    );
    const metadata = metadataResult.rows[0];
    if (!metadata) return json({ message: "Organization details could not be loaded" }, 404);

    const generatedAt = new Date();
    const reportResult = await pool.query<ReportDayRow>(
      `WITH calendar_days AS (
         SELECT generate_series($3::date, $4::date, INTERVAL '1 day')::date AS work_date
       ),
       employee_context AS (
         SELECT e.id, e.organization_id,
                e.employee_code, e.first_name, e.last_name, e.employment_status,
                d.name AS department_name,
                COALESCE(workforce_role.name, account_role.name, 'EMPLOYEE') AS workforce_role,
                COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone
         FROM public.employees AS e
         LEFT JOIN public.departments AS d
           ON d.id = e.department_id AND d.organization_id = e.organization_id
         LEFT JOIN public.roles AS workforce_role
           ON workforce_role.id = e.workforce_role_id AND workforce_role.organization_id = e.organization_id
         LEFT JOIN public.organization_settings AS os ON os.organization_id = e.organization_id
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
           ORDER BY CASE WHEN workforce_account.status = 'ACTIVE' THEN 0 ELSE 1 END,
                    workforce_account.updated_at DESC NULLS LAST,
                    workforce_account.created_at DESC NULLS LAST,
                    workforce_account.id
           LIMIT 1
         ) AS account_role ON TRUE
         WHERE e.id = $1::uuid AND e.organization_id = $2::uuid
       ),
       scheduled_days AS (
         SELECT DISTINCT ON (cd.work_date)
           cd.work_date,
           s.name AS schedule_name,
           ((cd.work_date + sd.start_time) AT TIME ZONE ec.time_zone) AS expected_start,
           ((cd.work_date + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END + sd.end_time)
             AT TIME ZONE ec.time_zone) AS expected_end,
           sd.break_minutes
         FROM calendar_days AS cd
         CROSS JOIN employee_context AS ec
         JOIN public.employee_schedule_assignments AS a
           ON a.organization_id = ec.organization_id
          AND a.employee_id = ec.id
          AND a.effective_from <= cd.work_date
          AND (a.effective_to IS NULL OR a.effective_to >= cd.work_date)
         JOIN public.work_schedules AS s
           ON s.organization_id = a.organization_id AND s.id = a.schedule_id
         JOIN public.work_schedule_days AS sd
           ON sd.organization_id = a.organization_id
          AND sd.schedule_id = a.schedule_id
          AND sd.day_of_week = EXTRACT(ISODOW FROM cd.work_date)::int
         ORDER BY cd.work_date, a.effective_from DESC, a.created_at DESC
       ),
       effective_events AS (
         SELECT ae.id::text AS source_id, ae.work_date, ae.event_type,
                COALESCE(c.requested_at, ae.recorded_at) AS recorded_at,
                ae.time_zone,
                CASE WHEN c.id IS NOT NULL THEN 'APPROVED_CORRECTION' ELSE 'ATTENDANCE_EVENT' END AS source
         FROM public.attendance_events AS ae
         LEFT JOIN LATERAL (
           SELECT cr.id, cr.requested_at
           FROM public.attendance_correction_requests AS cr
           WHERE cr.organization_id = ae.organization_id
             AND cr.employee_id = ae.employee_id
             AND cr.original_event_id = ae.id
             AND cr.status = 'APPROVED'
           ORDER BY cr.decision_at DESC, cr.id DESC
           LIMIT 1
         ) AS c ON TRUE
         WHERE ae.organization_id = $2::uuid
           AND ae.employee_id = $1::uuid
           AND ae.work_date BETWEEN $3::date AND $4::date
         UNION ALL
         SELECT ('CORRECTION:' || cr.id::text), cr.work_date, cr.event_type,
                cr.requested_at, cr.time_zone, 'APPROVED_MISSING_PUNCH'
         FROM public.attendance_correction_requests AS cr
         WHERE cr.organization_id = $2::uuid
           AND cr.employee_id = $1::uuid
           AND cr.original_event_id IS NULL
           AND cr.status = 'APPROVED'
           AND cr.work_date BETWEEN $3::date AND $4::date
       ),
       event_days AS (
         SELECT work_date,
                MIN(recorded_at) FILTER (WHERE event_type = 'CLOCK_IN') AS first_clock_in,
                MAX(recorded_at) FILTER (WHERE event_type = 'CLOCK_OUT') AS last_clock_out,
                COUNT(*)::int AS event_count,
                jsonb_agg(
                  jsonb_build_object('id', source_id, 'eventType', event_type,
                                     'recordedAt', recorded_at, 'timeZone', time_zone, 'source', source)
                  ORDER BY recorded_at, source_id
                ) AS events
         FROM effective_events
         GROUP BY work_date
       ),
       approved_overtime AS (
         SELECT work_date, LEAST(1440, SUM(approved_minutes))::int AS approved_minutes
         FROM public.attendance_overtime_requests
         WHERE organization_id = $2::uuid
           AND employee_id = $1::uuid
           AND status = 'APPROVED'
           AND request_type = 'PREAUTHORIZATION'
           AND work_date BETWEEN $3::date AND $4::date
         GROUP BY work_date
       )
       SELECT
         ec.id::text AS "employeeId",
         ec.employee_code AS "employeeCode",
         ec.first_name AS "firstName",
         ec.last_name AS "lastName",
         ec.department_name AS "departmentName",
         ec.workforce_role AS "workforceRole",
         ec.employment_status AS "employmentStatus",
         ec.time_zone AS "timeZone",
         o.name AS "organizationName",
         cd.work_date::text AS "workDate",
         sd.schedule_name AS "scheduleName",
         sd.expected_start AS "expectedStart",
         sd.expected_end AS "expectedEnd",
         sd.break_minutes AS "scheduledBreakMinutes",
         ed.first_clock_in AS "firstClockIn",
         ed.last_clock_out AS "lastClockOut",
         COALESCE(ed.event_count, 0)::int AS "eventCount",
         COALESCE(ed.events, '[]'::jsonb) AS events,
         COALESCE(ot.approved_minutes, 0)::int AS "approvedOvertimeMinutes",
         excess_review.status AS "excessOvertimeReviewStatus",
         (SELECT jsonb_build_object('leaveType', lr.leave_type, 'status', lr.status, 'isPaid', lr.is_paid)
            FROM public.leave_requests AS lr
           WHERE lr.organization_id = ec.organization_id
             AND lr.employee_id = $1::uuid
             AND lr.status IN ('PENDING', 'APPROVED')
             AND cd.work_date BETWEEN lr.start_date AND lr.end_date
           ORDER BY CASE lr.status WHEN 'APPROVED' THEN 0 ELSE 1 END, lr.created_at DESC
           LIMIT 1) AS "leaveRequest",
         (SELECT jsonb_build_object('name', ph.name, 'isPaid', ph.is_paid)
            FROM public.public_holidays AS ph
           WHERE ph.organization_id = ec.organization_id AND ph.holiday_date = cd.work_date
           LIMIT 1) AS "publicHoliday"
       FROM calendar_days AS cd
       CROSS JOIN employee_context AS ec
       CROSS JOIN public.organizations AS o
       LEFT JOIN scheduled_days AS sd ON sd.work_date = cd.work_date
       LEFT JOIN event_days AS ed ON ed.work_date = cd.work_date
       LEFT JOIN approved_overtime AS ot ON ot.work_date = cd.work_date
       LEFT JOIN public.attendance_excess_overtime_reviews AS excess_review
         ON excess_review.organization_id = ec.organization_id
        AND excess_review.employee_id = ec.id
        AND excess_review.work_date = cd.work_date
       WHERE o.id = ec.organization_id
       ORDER BY cd.work_date ASC`,
      [employeeId, actor.organizationId, fromDate, toDate],
    );

    const rows = reportResult.rows;
    const attendanceRecordCount = rows.reduce((sum, row) => sum + Number(row.eventCount || 0), 0);
    if (attendanceRecordCount === 0) {
      return json({
        message: `No attendance records were found for this workforce member between ${fromDate} and ${toDate}. Choose another date range.`,
      }, 404);
    }

    const entries = rows.map((row) => {
      const events = parseEvents(row.events);
      const calculation = calculateDailyAttendance({
        events,
        expectedStart: row.expectedStart,
        expectedEnd: row.expectedEnd,
        scheduledBreakMinutes: row.scheduledBreakMinutes,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes,
        asOf: generatedAt,
      });
      const status = calculation.calculationStatus === "REVIEW_REQUIRED"
        ? "REVIEW_REQUIRED"
        : calculation.calculationStatus === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : Number(row.eventCount) > 0
            ? "RECORDED"
            : row.leaveRequest?.status === "APPROVED"
              ? "APPROVED_LEAVE"
              : row.leaveRequest?.status === "PENDING"
                ? "LEAVE_PENDING"
                : row.publicHoliday
                  ? "PUBLIC_HOLIDAY"
                  : row.scheduleName
                    ? "NO_PUNCHES"
                    : "NOT_SCHEDULED";
      return {
        ...row,
        events,
        status,
        ...calculation,
      };
    });

    const monthMap = new Map<string, {
      month: string;
      days: number;
      daysWithAttendance: number;
      scheduledDays: number;
      workedDays: number;
      workedMinutes: number;
      regularWorkedMinutes: number;
      potentialOvertimeMinutes: number;
      approvedOvertimeMinutes: number;
      payableOvertimeMinutes: number;
      excessUnapprovedOvertimeMinutes: number;
    }>();
    for (const entry of entries) {
      const month = entry.workDate.slice(0, 7);
      const totals = monthMap.get(month) || {
        month,
        days: 0,
        daysWithAttendance: 0,
        scheduledDays: 0,
        workedDays: 0,
        workedMinutes: 0,
        regularWorkedMinutes: 0,
        potentialOvertimeMinutes: 0,
        approvedOvertimeMinutes: 0,
        payableOvertimeMinutes: 0,
        excessUnapprovedOvertimeMinutes: 0,
      };
      totals.days += 1;
      if (Number(entry.eventCount) > 0) totals.daysWithAttendance += 1;
      if (entry.expectedStart) totals.scheduledDays += 1;
      if (entry.workedMinutes > 0) totals.workedDays += 1;
      totals.workedMinutes += entry.workedMinutes;
      totals.regularWorkedMinutes += entry.regularWorkedMinutes;
      totals.potentialOvertimeMinutes += entry.potentialOvertimeMinutes;
      totals.approvedOvertimeMinutes += entry.approvedOvertimeMinutes;
      totals.payableOvertimeMinutes += entry.payableOvertimeMinutes;
      totals.excessUnapprovedOvertimeMinutes += entry.excessUnapprovedOvertimeMinutes;
      monthMap.set(month, totals);
    }
    const months = [...monthMap.values()].map((value) => ({
      ...value,
      workedHours: Math.round((value.workedMinutes / 60) * 100) / 100,
      regularHours: Math.round((value.regularWorkedMinutes / 60) * 100) / 100,
      approvedOvertimeHours: Math.round((value.payableOvertimeMinutes / 60) * 100) / 100,
    }));

    return json({
      status: "ok",
      organization: { name: metadata.organizationName, timeZone: metadata.timeZone },
      generatedBy: metadata.generatedBy,
      generatedAt: generatedAt.toISOString(),
      employee: target,
      fromDate,
      toDate,
      attendanceRecordCount,
      entries,
      months,
    });
  } catch (error) {
    console.error("Monthly attendance report failed:", error);
    return json({ message: "Unable to generate the attendance report right now" }, 500);
  }
}
