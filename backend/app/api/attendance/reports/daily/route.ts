import { connection } from "next/server";
import { pool } from "../../../../../lib/db";
import { calculateDailyAttendance } from "../../../../../lib/attendance-calculations";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import {
  isValidDateString,
  jsonResponse,
  organizationIsActive,
} from "../../../../../lib/schedule-utils";
import {
  createDailyAttendancePdf,
  type DailyAttendanceRecord,
  type DailyAttendanceReport,
} from "../../../../../lib/daily-attendance-pdf";


function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function filenameDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "attendance";
}

export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    const isOrganizationAdmin = actor.kind === "ORGANIZATION_ADMIN";
    const isHrManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER";
    const isDepartmentManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";

    if (!isOrganizationAdmin && !isHrManager && !isDepartmentManager) {
      return jsonResponse(
        { message: "You do not have permission to generate a daily attendance report" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse({ message: "This organization is not active" }, 403);
    }

    const url = new URL(request.url);
    const reportDate = url.searchParams.get("date");

    if (!isValidDateString(reportDate)) {
      return jsonResponse(
        { message: "Provide a valid date value in YYYY-MM-DD format" },
        400,
      );
    }

    const scope: "ALL" | "DEPARTMENT" =
      isDepartmentManager ? "DEPARTMENT" : "ALL";

    const metadataResult = await pool.query<{
      organizationName: string;
      timeZone: string;
      generatedBy: string;
      absenceAfterMinutes: number | string;
    }>(
      `SELECT
         o.name AS "organizationName",
         COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
         COALESCE(policy.absence_after_minutes, 120) AS "absenceAfterMinutes",
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', actor_employee.first_name, actor_employee.last_name)), ''),
           NULLIF(actor_user.email, ''),
           'Authenticated manager'
         ) AS "generatedBy"
       FROM public.organizations AS o
       LEFT JOIN public.organization_settings AS os
         ON os.organization_id = o.id
       LEFT JOIN public.attendance_policy_settings AS policy
         ON policy.organization_id = o.id
       LEFT JOIN public.users AS actor_user
         ON actor_user.id = $2::uuid
        AND actor_user.organization_id = o.id
       LEFT JOIN public.employees AS actor_employee
         ON actor_employee.id = $3::uuid
        AND actor_employee.organization_id = o.id
       WHERE o.id = $1::uuid
       LIMIT 1`,
      [
        actor.organizationId,
        actor.userId,
        actor.kind === "ORGANIZATION_USER" ? actor.employeeId : null,
      ],
    );

    const metadata = metadataResult.rows[0];
    if (!metadata) {
      return jsonResponse({ message: "Organization details could not be loaded" }, 404);
    }

    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: metadata.timeZone });
    } catch {
      return jsonResponse(
        { message: "The organization's configured time zone is invalid" },
        500,
      );
    }

    let reportScope = "Organization-wide";
    if (isDepartmentManager && actor.kind === "ORGANIZATION_USER") {
      const departments = await pool.query<{ name: string }>(
        `SELECT d.name
         FROM public.departments AS d
         WHERE d.organization_id = $1::uuid
           AND d.manager_id = $2::uuid
         ORDER BY d.name`,
        [actor.organizationId, actor.employeeId],
      );

      reportScope = departments.rows.length
        ? `Assigned departments: ${departments.rows.map((row) => row.name).join(", ")}`
        : "Assigned departments: none currently assigned";
    }

    // Start from the active employee list, then LEFT JOIN today's schedule,
    // attendance and timesheet. This deliberately retains active
    // employees and Department Managers who have no schedule and no punches.
    // Department Managers are workforce records and use the same attendance
    // calculations as employees; include them in HR reports and their own scope.
    const reportResult = await pool.query<DailyAttendanceRecord>(
      `WITH scoped_employees AS (
         SELECT
           e.id AS employee_id,
           e.employee_code,
           e.first_name,
           e.last_name,
           e.department_id,
           d.name AS department_name,
           e.employment_status
         FROM public.employees AS e
         LEFT JOIN public.departments AS d
           ON d.id = e.department_id
          AND d.organization_id = e.organization_id
         LEFT JOIN public.roles AS workforce_role
           ON workforce_role.id = e.workforce_role_id
          AND workforce_role.organization_id = e.organization_id
         LEFT JOIN public.users AS workforce_account
           ON workforce_account.employee_id = e.id
          AND workforce_account.organization_id = e.organization_id
          AND workforce_account.account_scope = 'ORGANIZATION'
         LEFT JOIN public.roles AS account_role
           ON account_role.id = workforce_account.role_id
         WHERE e.organization_id = $1::uuid
           AND e.employment_status = 'ACTIVE'
           AND regexp_replace(UPPER(COALESCE(workforce_role.name, account_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') IN ('EMPLOYEE', 'DEPARTMENT_MANAGER')
           -- Exclude organization administrators independently of the
           -- workforce role, which may be stale or incorrectly assigned.
           AND NOT EXISTS (
             SELECT 1
             FROM public.users AS admin_account
             JOIN public.roles AS linked_account_role
               ON linked_account_role.id = admin_account.role_id
             WHERE admin_account.employee_id = e.id
               AND admin_account.organization_id = e.organization_id
               AND admin_account.account_scope = 'ORGANIZATION'
               AND regexp_replace(UPPER(linked_account_role.name), '[^A-Z0-9]+', '_', 'g')
                 IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR', 'ORG_ADMINISTRATOR')
           )
           AND (
             $3::text = 'ALL'
             OR e.id = $4::uuid
             OR EXISTS (
               SELECT 1
               FROM public.departments AS managed_department
               WHERE managed_department.organization_id = e.organization_id
                 AND managed_department.id = e.department_id
                 AND managed_department.manager_id = $4::uuid
             )
           )
       ),

       effective_events AS (
         SELECT
           ae.id::text AS source_id,
           ae.employee_id,
           ae.work_date,
           ae.event_type,
           COALESCE(c.requested_at, ae.recorded_at) AS recorded_at,
           ae.time_zone,
           CASE
             WHEN c.id IS NOT NULL THEN 'APPROVED_CORRECTION'
             ELSE 'ATTENDANCE_EVENT'
           END AS source
         FROM public.attendance_events AS ae
         JOIN scoped_employees AS e
           ON e.employee_id = ae.employee_id
         LEFT JOIN LATERAL (
           SELECT cr.id, cr.requested_at
           FROM public.attendance_correction_requests AS cr
           WHERE cr.organization_id = ae.organization_id
             AND cr.employee_id = ae.employee_id
             AND cr.original_event_id = ae.id
             AND cr.status = 'APPROVED'
           ORDER BY cr.decision_at DESC
           LIMIT 1
         ) AS c ON TRUE
         WHERE ae.organization_id = $1::uuid
           AND ae.work_date = $2::date

         UNION ALL

         SELECT
           ('CORRECTION:' || cr.id::text) AS source_id,
           cr.employee_id,
           cr.work_date,
           cr.event_type,
           cr.requested_at AS recorded_at,
           cr.time_zone,
           'APPROVED_MISSING_PUNCH' AS source
         FROM public.attendance_correction_requests AS cr
         JOIN scoped_employees AS e
           ON e.employee_id = cr.employee_id
         WHERE cr.organization_id = $1::uuid
           AND cr.original_event_id IS NULL
           AND cr.status = 'APPROVED'
           AND cr.work_date = $2::date
       ),

       event_summary AS (
         SELECT
           employee_id,
           MIN(recorded_at) FILTER (WHERE event_type = 'CLOCK_IN') AS first_clock_in,
           MAX(recorded_at) FILTER (WHERE event_type = 'CLOCK_OUT') AS last_clock_out,
           COUNT(*)::int AS event_count,
           (ARRAY_AGG(event_type ORDER BY recorded_at DESC, source_id DESC))[1] AS latest_event_type,
           COALESCE(
             JSONB_AGG(
               JSONB_BUILD_OBJECT(
                 'id', source_id,
                 'eventType', event_type,
                 'recordedAt', recorded_at,
                 'timeZone', time_zone,
                 'source', source
               ) ORDER BY recorded_at, source_id
             ),
             '[]'::jsonb
           ) AS events
         FROM effective_events
         GROUP BY employee_id
       )

       SELECT
         e.employee_id AS "employeeId",
         e.employee_code AS "employeeCode",
         e.first_name AS "firstName",
         e.last_name AS "lastName",
         e.department_id AS "departmentId",
         e.department_name AS "departmentName",
         e.employment_status AS "employmentStatus",

         schedule.schedule_name AS "scheduleName",
         schedule.time_zone AS "timeZone",
         schedule.expected_start AS "expectedStart",
         schedule.expected_end AS "expectedEnd",
         schedule.break_minutes AS "scheduledBreakMinutes",

         events.first_clock_in AS "firstClockIn",
         events.last_clock_out AS "lastClockOut",
         COALESCE(events.event_count, 0)::int AS "eventCount",
         COALESCE(events.events, '[]'::jsonb) AS events,

         0::int AS "openExceptionCount",
         '[]'::jsonb AS exceptions,
          NULL::text AS "timesheetStatus",
          NULL::uuid AS "timesheetId",
          COALESCE(overtime.approved_minutes, 0)::int AS "approvedOvertimeMinutes"

       FROM scoped_employees AS e
       LEFT JOIN LATERAL (
         SELECT
           a.id AS assignment_id,
           s.name AS schedule_name,
           COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone,
           (
             ($2::date + sd.start_time)
             AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')
           ) AS expected_start,
           (
             (
               $2::date
               + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END
               + sd.end_time
             ) AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')
           ) AS expected_end,
           sd.break_minutes AS break_minutes
         FROM public.employee_schedule_assignments AS a
         JOIN public.work_schedules AS s
           ON s.id = a.schedule_id
          AND s.organization_id = a.organization_id
         JOIN public.work_schedule_days AS sd
           ON sd.schedule_id = s.id
          AND sd.organization_id = s.organization_id
         LEFT JOIN public.organization_settings AS os
           ON os.organization_id = $1::uuid
         WHERE a.organization_id = $1::uuid
           AND a.employee_id = e.employee_id
           AND a.effective_from <= $2::date
           AND (a.effective_to IS NULL OR a.effective_to >= $2::date)
           AND sd.day_of_week = EXTRACT(ISODOW FROM $2::date)::int
         ORDER BY a.effective_from DESC, a.created_at DESC
         LIMIT 1
       ) AS schedule ON TRUE
       LEFT JOIN event_summary AS events
         ON events.employee_id = e.employee_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ot.approved_minutes), 0)::int AS approved_minutes
         FROM public.attendance_overtime_requests AS ot
         WHERE ot.organization_id = $1::uuid
           AND ot.employee_id = e.employee_id
           AND ot.work_date = $2::date
           AND ot.request_type = 'PREAUTHORIZATION'
           AND ot.status = 'APPROVED'
       ) AS overtime ON TRUE
       ORDER BY e.department_name NULLS LAST, e.last_name, e.first_name
       LIMIT 5001`,
      [
        actor.organizationId,
        reportDate,
        scope,
        isDepartmentManager && actor.kind === "ORGANIZATION_USER"
          ? actor.employeeId
          : null,
      ],
    );

    if (reportResult.rows.length > 5000) {
      return jsonResponse(
        { message: "This daily report contains more than 5,000 employees. Narrow the report scope before downloading." },
        413,
      );
    }

    const generatedAt = new Date();
    const rows: DailyAttendanceRecord[] = reportResult.rows.map((row) => {
      const events = jsonArray<NonNullable<DailyAttendanceRecord["events"]>[number]>(row.events);
      const calculation = calculateDailyAttendance({
        events,
        expectedStart: row.expectedStart,
        expectedEnd: row.expectedEnd,
        scheduledBreakMinutes: row.scheduledBreakMinutes,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes,
        asOf: generatedAt,
      });
      return { ...row, events, ...calculation };
    });

    // The manager roll-call view uses the same permission-scoped query as the
    // downloadable PDF. Keeping one query prevents the on-screen totals from
    // drifting away from the exported report. The default response remains PDF
    // for backwards compatibility; JSON is opt-in via format=json.
    if (url.searchParams.get("format") === "json") {
      return jsonResponse({
        status: "ok",
        organizationName: metadata.organizationName,
        reportDate,
        timeZone: metadata.timeZone,
        reportScope,
        generatedAt: generatedAt.toISOString(),
        serverNow: generatedAt.toISOString(),
        absenceAfterMinutes: Number(metadata.absenceAfterMinutes) || 0,
        rows,
      });
    }

    const report: DailyAttendanceReport = {
      organizationName: metadata.organizationName,
      reportDate,
      timeZone: metadata.timeZone,
      reportScope,
      generatedAt,
      generatedBy: metadata.generatedBy,
      rows,
    };

    const pdf = createDailyAttendancePdf(report);
    const filename = `daily-attendance-${filenameDate(reportDate)}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Daily attendance PDF generation failed:", error);
    return jsonResponse(
      { message: "Unable to generate the daily attendance report right now" },
      500,
    );
  }
}
