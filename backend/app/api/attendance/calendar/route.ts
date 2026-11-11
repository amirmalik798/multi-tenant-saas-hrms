import { connection } from "next/server";
import { pool } from "../../../../lib/db";
import { calculateDailyAttendance, type AttendanceCalculationEvent } from "../../../../lib/attendance-calculations";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import {
  isValidDateString,
  jsonResponse,
  organizationIsActive,
} from "../../../../lib/schedule-utils";

function parseEvents(value: unknown): AttendanceCalculationEvent[] {
  if (Array.isArray(value)) return value as AttendanceCalculationEvent[];
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

export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const url = new URL(request.url);
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    const offsetValue = url.searchParams.get("offset") ?? "0";
    const offset = Number(offsetValue);
    if (!/^\d+$/.test(offsetValue) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
      return jsonResponse({ message: "Provide a valid attendance pagination offset" }, 400);
    }

    if (
      !isValidDateString(fromDate) ||
      !isValidDateString(toDate) ||
      fromDate > toDate
    ) {
      return jsonResponse(
        {
          message:
            "Provide valid fromDate and toDate values in YYYY-MM-DD format",
        },
        400,
      );
    }

    const days =
      (
        Date.parse(`${toDate}T00:00:00Z`) -
        Date.parse(`${fromDate}T00:00:00Z`)
      ) / 86400000;

    if (days > 30) {
      return jsonResponse(
        { message: "The calendar can display a maximum of 31 days per request" },
        400,
      );
    }

    let scope: "ALL" | "SELF" | "DEPARTMENT";
    let scopeEmployeeId: string | null = null;

    if (actor.kind === "ORGANIZATION_ADMIN") {
      scope = "ALL";
    } else if (actor.kind === "ORGANIZATION_USER") {
      if (actor.roleName === "HR_MANAGER") {
        scope = "ALL";
      } else if (actor.roleName === "DEPARTMENT_MANAGER") {
        scope = "DEPARTMENT";
        scopeEmployeeId = actor.employeeId;
      } else if (actor.roleName === "EMPLOYEE") {
        scope = "SELF";
        scopeEmployeeId = actor.employeeId;
      } else {
        return jsonResponse(
          { message: "You do not have permission to view this attendance calendar" },
          403,
        );
      }
    } else {
      return jsonResponse(
        { message: "You do not have permission to view this attendance calendar" },
        403,
      );
    }

    const organizationClock = await pool.query<{ timeZone: string; today: string }>(
      `SELECT COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
              TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali'))::date, 'YYYY-MM-DD') AS today
       FROM (SELECT 1) seed
       LEFT JOIN public.organization_settings os ON os.organization_id = $1::uuid`,
      [actor.organizationId],
    );
    const organizationToday = organizationClock.rows[0]?.today || new Date().toISOString().slice(0, 10);
    const organizationTimeZone = organizationClock.rows[0]?.timeZone || "Africa/Kigali";

    const result = await pool.query(
      `WITH calendar_days AS (
         SELECT generate_series(
           $4::date,
           $5::date,
           INTERVAL '1 day'
         )::date AS work_date
       ),

       scoped_employees AS (
         SELECT
           e.id,
           e.organization_id,
           e.employee_code,
           e.first_name,
           e.last_name,
           e.department_id,
           d.name AS department_name
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
         WHERE e.organization_id = $1
           AND regexp_replace(UPPER(COALESCE(workforce_role.name, account_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g') IN ('EMPLOYEE', 'DEPARTMENT_MANAGER')
           -- A linked organization account with an admin role must never be
           -- treated as a workforce attendance row, even if the employee
           -- record's workforce_role_id is stale or says EMPLOYEE.
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
             $2::text = 'ALL'
             OR (
               $2::text = 'SELF'
               AND e.id = $3::uuid
             )
             OR (
               $2::text = 'DEPARTMENT'
               AND (e.id = $3::uuid OR EXISTS (
                 SELECT 1
                 FROM public.departments AS managed_department
                 WHERE managed_department.organization_id = e.organization_id
                   AND managed_department.id = e.department_id
                   AND managed_department.manager_id = $3::uuid
               ))
             )
           )
       ),

       scheduled_days AS (
         SELECT DISTINCT ON (e.id, cd.work_date)
           e.id AS employee_id,
           cd.work_date,
           a.id AS schedule_assignment_id,
           s.id AS schedule_id,
           s.name AS schedule_name,
           COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone,

           (
             (cd.work_date + sd.start_time)
             AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')
           ) AS expected_start,

           (
             (
               cd.work_date
               + CASE
                   WHEN sd.end_time <= sd.start_time THEN 1
                   ELSE 0
                 END
               + sd.end_time
             )
             AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')
           ) AS expected_end,

           sd.break_minutes

         FROM scoped_employees AS e

         JOIN public.employee_schedule_assignments AS a
           ON a.organization_id = e.organization_id
          AND a.employee_id = e.id

         JOIN public.work_schedules AS s
           ON s.organization_id = a.organization_id
          AND s.id = a.schedule_id

         JOIN calendar_days AS cd
           ON a.effective_from <= cd.work_date
          AND (
            a.effective_to IS NULL
            OR a.effective_to >= cd.work_date
          )

         JOIN public.work_schedule_days AS sd
           ON sd.organization_id = a.organization_id
          AND sd.schedule_id = a.schedule_id
          AND sd.day_of_week =
            EXTRACT(ISODOW FROM cd.work_date)::int

         LEFT JOIN public.organization_settings AS os
           ON os.organization_id = e.organization_id
         ORDER BY
           e.id,
           cd.work_date,
           a.effective_from DESC,
           a.created_at DESC
       ),

       effective_events AS (
         SELECT
           ae.id::text AS source_id,
           ae.organization_id,
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
           ON e.organization_id = ae.organization_id
          AND e.id = ae.employee_id

         LEFT JOIN LATERAL (
           SELECT
             cr.id,
             cr.requested_at
           FROM public.attendance_correction_requests AS cr
           WHERE cr.organization_id = ae.organization_id
             AND cr.employee_id = ae.employee_id
             AND cr.original_event_id = ae.id
             AND cr.status = 'APPROVED'
           ORDER BY cr.decision_at DESC
           LIMIT 1
         ) AS c ON TRUE

         WHERE ae.organization_id = $1
           AND ae.work_date BETWEEN $4::date AND $5::date

         UNION ALL

         SELECT
           ('CORRECTION:' || cr.id::text) AS source_id,
           cr.organization_id,
           cr.employee_id,
           cr.work_date,
           cr.event_type,
           cr.requested_at AS recorded_at,
           cr.time_zone,
           'APPROVED_MISSING_PUNCH' AS source

         FROM public.attendance_correction_requests AS cr

         JOIN scoped_employees AS e
           ON e.organization_id = cr.organization_id
          AND e.id = cr.employee_id

         WHERE cr.organization_id = $1
           AND cr.original_event_id IS NULL
           AND cr.status = 'APPROVED'
           AND cr.work_date BETWEEN $4::date AND $5::date
       ),

       event_days AS (
         SELECT
           employee_id,
           work_date,

           MIN(recorded_at) FILTER (
             WHERE event_type = 'CLOCK_IN'
           ) AS first_clock_in,

           MAX(recorded_at) FILTER (
             WHERE event_type = 'CLOCK_OUT'
           ) AS last_clock_out,

           COUNT(*)::int AS event_count,

           jsonb_agg(
             jsonb_build_object(
               'id', source_id,
               'eventType', event_type,
               'recordedAt', recorded_at,
               'timeZone', time_zone,
               'source', source
             )
             ORDER BY recorded_at, source_id
           ) AS events

         FROM effective_events
         GROUP BY employee_id, work_date
       ),

       approved_overtime AS (
         SELECT
           ot.employee_id,
           ot.work_date,
           LEAST(1440, SUM(ot.approved_minutes))::int AS approved_minutes
         FROM public.attendance_overtime_requests AS ot
         JOIN scoped_employees AS e
           ON e.organization_id = ot.organization_id
          AND e.id = ot.employee_id
         WHERE ot.organization_id = $1
           AND ot.status = 'APPROVED'
           AND ot.request_type = 'PREAUTHORIZATION'
           AND ot.work_date BETWEEN $4::date AND $5::date
         GROUP BY ot.employee_id, ot.work_date
       ),

       time_off_days AS (
         -- Include leave and organization holiday dates even when the employee
         -- has no shift assignment and no attendance punches on that date.
         SELECT e.id AS employee_id, cd.work_date
         FROM scoped_employees AS e
         JOIN calendar_days AS cd
           ON EXISTS (
             SELECT 1
             FROM public.leave_requests AS lr
             WHERE lr.organization_id = e.organization_id
               AND lr.employee_id = e.id
               AND lr.status IN ('PENDING', 'APPROVED')
               AND cd.work_date BETWEEN lr.start_date AND lr.end_date
           )
           OR EXISTS (
             SELECT 1
             FROM public.public_holidays AS ph
             WHERE ph.organization_id = e.organization_id
               AND ph.holiday_date = cd.work_date
           )
       ),

       day_keys AS (
         SELECT employee_id, work_date
         FROM scheduled_days

         UNION

         SELECT employee_id, work_date
         FROM event_days

         UNION

         SELECT employee_id, work_date
         FROM time_off_days
       )

       SELECT
         e.id AS "employeeId",
         e.employee_code AS "employeeCode",
         e.first_name AS "firstName",
         e.last_name AS "lastName",
         e.department_id AS "departmentId",
         e.department_name AS "departmentName",

         k.work_date::text AS "workDate",

         sd.schedule_assignment_id AS "scheduleAssignmentId",
         sd.schedule_id AS "scheduleId",
         sd.schedule_name AS "scheduleName",
         sd.time_zone AS "timeZone",
         sd.expected_start AS "expectedStart",
         sd.expected_end AS "expectedEnd",
         sd.break_minutes AS "scheduledBreakMinutes",

         ed.first_clock_in AS "firstClockIn",
         ed.last_clock_out AS "lastClockOut",
         COALESCE(ed.event_count, 0)::int AS "eventCount",
         COALESCE(ed.events, '[]'::jsonb) AS events,

         0::int AS "openExceptionCount",
         '[]'::jsonb AS exceptions,
         COALESCE(ot.approved_minutes, 0)::int AS "approvedOvertimeMinutes",
         excess_review.status AS "excessOvertimeReviewStatus",
         (SELECT jsonb_build_object('id', lr.id, 'leaveType', lr.leave_type, 'status', lr.status, 'isPaid', lr.is_paid)
            FROM public.leave_requests lr
           WHERE lr.organization_id = e.organization_id AND lr.employee_id = e.id
             AND lr.status IN ('PENDING', 'APPROVED') AND k.work_date BETWEEN lr.start_date AND lr.end_date
           ORDER BY CASE lr.status WHEN 'APPROVED' THEN 0 ELSE 1 END, lr.created_at DESC LIMIT 1) AS "leaveRequest",
         (SELECT jsonb_build_object('id', ph.id, 'name', ph.name, 'isPaid', ph.is_paid)
            FROM public.public_holidays ph
           WHERE ph.organization_id = e.organization_id AND ph.holiday_date = k.work_date LIMIT 1) AS "publicHoliday",
         NULL::text AS "timesheetStatus",
         NULL::uuid AS "timesheetId"

       FROM day_keys AS k

       JOIN scoped_employees AS e
         ON e.id = k.employee_id

       LEFT JOIN scheduled_days AS sd
         ON sd.employee_id = k.employee_id
        AND sd.work_date = k.work_date

       LEFT JOIN event_days AS ed
         ON ed.employee_id = k.employee_id
        AND ed.work_date = k.work_date
LEFT JOIN approved_overtime AS ot
         ON ot.employee_id = k.employee_id
        AND ot.work_date = k.work_date

       LEFT JOIN public.attendance_excess_overtime_reviews AS excess_review
         ON excess_review.organization_id = e.organization_id
        AND excess_review.employee_id = e.id
        AND excess_review.work_date = k.work_date

       ORDER BY k.work_date DESC, e.last_name, e.first_name
       LIMIT 2001 OFFSET $6`,
      [
        actor.organizationId,
        scope,
        scopeEmployeeId,
        fromDate,
        toDate,
        offset,
      ],
    );

    const hasMore = result.rows.length > 2000;
    const entries = (hasMore ? result.rows.slice(0, 2000) : result.rows).map((row: Record<string, unknown>) => {
      const calculation = calculateDailyAttendance({
        events: parseEvents(row.events),
        expectedStart: row.expectedStart as string | Date | null,
        expectedEnd: row.expectedEnd as string | Date | null,
        scheduledBreakMinutes: row.scheduledBreakMinutes as number | string | null,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes as number | string | null,
      });
      return {
        ...row,
        workedMinutes: calculation.workedMinutes,
        regularWorkedMinutes: calculation.regularWorkedMinutes,
        potentialOvertimeMinutes: calculation.potentialOvertimeMinutes,
        approvedOvertimeMinutes: calculation.approvedOvertimeMinutes,
        payableOvertimeMinutes: calculation.payableOvertimeMinutes,
        excessUnapprovedOvertimeMinutes: calculation.excessUnapprovedOvertimeMinutes,
        calculationStatus: calculation.calculationStatus,
      };
    });

    return jsonResponse({
      status: "ok",
      scope,
      fromDate,
      toDate,
      today: organizationToday,
      timeZone: organizationTimeZone,
      entries,
      hasMore,
      offset,
      nextOffset: hasMore ? offset + entries.length : null,
    });
  } catch (error) {
    console.error("Attendance calendar failed:", error);

    return jsonResponse(
      { message: "Unable to load the attendance calendar right now" },
      500,
    );
  }
}