import {
  getTenantPermissionActor,
} from "../../../../lib/permissions";
import { pool } from "../../../../lib/db";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import {
  isRecord,
  jsonResponse,
  organizationIsActive,
} from "../../../../lib/schedule-utils";

type AttendanceEventType = "CLOCK_IN" | "CLOCK_OUT";

function isAttendanceEventType(
  value: unknown,
): value is AttendanceEventType {
  return value === "CLOCK_IN" || value === "CLOCK_OUT";
}

const ATTENDANCE_EVENT_SELECT = `
  SELECT
    ae.id,
    ae.organization_id AS "organizationId",
    ae.employee_id AS "employeeId",
    ae.schedule_assignment_id AS "scheduleAssignmentId",
    ae.event_type AS "eventType",
    ae.recorded_at AS "recordedAt",
    TO_CHAR(ae.work_date, 'YYYY-MM-DD') AS "workDate",
    ae.time_zone AS "timeZone",
    ae.source,

    e.employee_code AS "employeeCode",
    e.first_name AS "firstName",
    e.last_name AS "lastName",
    e.department_id AS "departmentId",
    d.name AS "departmentName"

  FROM public.attendance_events AS ae

  JOIN public.employees AS e
    ON e.id = ae.employee_id
   AND e.organization_id = ae.organization_id

  LEFT JOIN public.departments AS d
    ON d.id = e.department_id
   AND d.organization_id = e.organization_id
`;

export async function GET() {
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

    const conditions = ["ae.organization_id = $1"];
    const values: unknown[] = [actor.organizationId];

    if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "EMPLOYEE"
    ) {
      values.push(actor.employeeId);

      conditions.push(`ae.employee_id = $${values.length}::uuid`);
    } else if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER"
    ) {
      values.push(actor.employeeId);

      conditions.push(`
        (
          ae.employee_id = $${values.length}::uuid
          OR EXISTS (
            SELECT 1
            FROM public.departments AS managed_department
            WHERE managed_department.organization_id = e.organization_id
              AND managed_department.id = e.department_id
              AND managed_department.manager_id = $${values.length}::uuid
          )
        )
      `);
    } else if (
      !(
        actor.kind === "ORGANIZATION_ADMIN" ||
        (
          actor.kind === "ORGANIZATION_USER" &&
          actor.roleName === "HR_MANAGER"
        )
      )
    ) {
      return jsonResponse(
        { message: "You do not have permission to view attendance events" },
        403,
      );
    }

    const result = await pool.query(
      `${ATTENDANCE_EVENT_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY ae.recorded_at DESC, ae.id DESC
       LIMIT 100`,
      values,
    );

    let clockStatus: "CLOCKED_IN" | "CLOCKED_OUT" | undefined;
    let personalEvents: typeof result.rows | undefined;

    if (
      actor.kind === "ORGANIZATION_USER" &&
      (actor.roleName === "EMPLOYEE" || actor.roleName === "DEPARTMENT_MANAGER")
    ) {
      // Keep the personal punch history independent from the 100-row team feed.
      // Otherwise a busy team's recent activity can push an earlier clock-in
      // out of the response and make completed daily time appear to reset.
      const personalResult = await pool.query(
        `${ATTENDANCE_EVENT_SELECT}
         WHERE ae.organization_id = $1::uuid
           AND ae.employee_id = $2::uuid
         ORDER BY ae.recorded_at DESC, ae.id DESC
         LIMIT 1000`,
        [actor.organizationId, actor.employeeId],
      );
      personalEvents = personalResult.rows;
      // Department Managers can see their team's events, but their own
      // clock status must be calculated from their own punches only.
      const ownLatest = await pool.query<{ eventType: AttendanceEventType }>(
        `SELECT event_type AS "eventType"
         FROM public.attendance_events
         WHERE organization_id = $1::uuid AND employee_id = $2::uuid
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1`,
        [actor.organizationId, actor.employeeId],
      );
      clockStatus = ownLatest.rows[0]?.eventType === "CLOCK_IN"
        ? "CLOCKED_IN"
        : "CLOCKED_OUT";
    }

    return jsonResponse({
      status: "ok",
      events: result.rows,
      ...(personalEvents ? { personalEvents } : {}),
      ...(clockStatus ? { clockStatus } : {}),
    });
  } catch (error) {
    console.error("Attendance event list failed:", error);

    return jsonResponse(
      { message: "Unable to load attendance events right now" },
      500,
    );
  }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "action") ||
    !isAttendanceEventType(body.action)
  ) {
    return jsonResponse(
      {
        message:
          'Provide only an "action" field with value "CLOCK_IN" or "CLOCK_OUT"',
      },
      400,
    );
  }

  const action = body.action;

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    // Employees and Department Managers may record only their own punches.
    // All schedule, leave, holiday, overtime and active-employment rules below
    // remain shared and enforced server-side.
    if (
      actor.kind !== "ORGANIZATION_USER" ||
      (actor.roleName !== "EMPLOYEE" && actor.roleName !== "DEPARTMENT_MANAGER") ||
      !actor.employeeId
    ) {
      return jsonResponse(
        {
          message:
            "Clock-in and clock-out are available to employees and Department Managers for their own account",
        },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    // Ensure organizations that have not yet loaded their settings
    // receive the existing organization-settings defaults.
    await pool.query(
      `INSERT INTO public.organization_settings (organization_id)
       VALUES ($1)
       ON CONFLICT (organization_id) DO NOTHING`,
      [actor.organizationId],
    );

    const settingsResult = await pool.query<{
      time_zone: string;
    }>(
      `SELECT time_zone
       FROM public.organization_settings
       WHERE organization_id = $1
       LIMIT 1`,
      [actor.organizationId],
    );

    const timeZone = settingsResult.rows[0]?.time_zone;

    if (!timeZone) {
      return jsonResponse(
        { message: "The organization's time zone is not configured" },
        500,
      );
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return jsonResponse(
        { message: "The organization's configured time zone is invalid" },
        500,
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Serialize clock actions per employee. Concurrent requests for the
      // same employee cannot both create an open punch.
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended($1::text, 0)
         )`,
        [`attendance:${actor.organizationId}:${actor.employeeId}`],
      );

      const employeeResult = await client.query(
        `SELECT id
         FROM public.employees
         WHERE id = $1
           AND organization_id = $2
           AND employment_status = 'ACTIVE'
         LIMIT 1
         FOR SHARE`,
        [actor.employeeId, actor.organizationId],
      );

      if (employeeResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "Your active employee record was not found" },
          403,
        );
      }

      const clockResult = await client.query<{
        current_time: Date;
        local_date: string;
      }>(
        `SELECT
           current_clock.current_time,
           (current_clock.current_time AT TIME ZONE $1)::date AS local_date
         FROM (
           SELECT clock_timestamp() AS current_time
         ) AS current_clock`,
        [timeZone],
      );

      const currentTime = clockResult.rows[0]?.current_time;
      const currentLocalDate = clockResult.rows[0]?.local_date;

      if (!currentTime || !currentLocalDate) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "Unable to determine the current attendance time" },
          500,
        );
      }

      // Get the latest immutable time event, if any.
      const latestResult = await client.query<{
        id: string;
        event_type: AttendanceEventType;
        work_date: string;
        time_zone: string;
        schedule_assignment_id: string | null;
      }>(
        `SELECT
           id,
           event_type,
           work_date,
           time_zone,
           schedule_assignment_id
         FROM public.attendance_events
         WHERE organization_id = $1
           AND employee_id = $2
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1`,
        [actor.organizationId, actor.employeeId],
      );

      const latestEvent = latestResult.rows[0];

      if (action === "CLOCK_IN" && latestEvent?.event_type === "CLOCK_IN") {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "You are already clocked in. Clock out before starting another attendance session.",
          },
          409,
        );
      }

      if (action === "CLOCK_OUT" && latestEvent?.event_type !== "CLOCK_IN") {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "You are not currently clocked in. Record a clock-in event before clocking out.",
          },
          409,
        );
      }

      // Enforce leave and holiday restrictions on the server as well as in the UI.
      // Clock-out is deliberately never blocked here, so an open session can always be closed.
      if (action === "CLOCK_IN") {
        const approvedLeave = await client.query(
          `SELECT leave_type
           FROM public.leave_requests
           WHERE organization_id = $1
             AND employee_id = $2
             AND status = 'APPROVED'
             AND start_date <= $3::date
             AND end_date >= $3::date
           LIMIT 1`,
          [actor.organizationId, actor.employeeId, currentLocalDate],
        );

        if (approvedLeave.rowCount) {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "APPROVED_LEAVE_TODAY",
              message: "You have approved leave for today. Clock-in is unavailable for this date.",
            },
            409,
          );
        }

        const publicHoliday = await client.query(
          `SELECT name
           FROM public.public_holidays
           WHERE organization_id = $1
             AND holiday_date = $2::date
           LIMIT 1`,
          [actor.organizationId, currentLocalDate],
        );

        if (publicHoliday.rowCount) {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "PUBLIC_HOLIDAY_TODAY",
              message: `Today is ${String(publicHoliday.rows[0]?.name || "an organization public holiday")}. Clock-in is unavailable for this date.`,
            },
            409,
          );
        }
      }

      let workDate = currentLocalDate;
      let eventTimeZone = timeZone;
      let scheduleAssignmentId: string | null = null;

      let scheduledStart: Date | null = null;
      let scheduledEnd: Date | null = null;
      let approvedOvertimeMinutes = 0;

      if (action === "CLOCK_IN") {
        // A clock-in must be attached to an active assignment and a scheduled
        // workday. We intentionally do not create unassigned raw punches.
        const assignmentResult = await client.query<{
          id: string;
          schedule_status: string | null;
          expected_start: Date | null;
          expected_end: Date | null;
        }>(
          `SELECT
             a.id,
             ws.status AS schedule_status,
             CASE
               WHEN sd.start_time IS NULL THEN NULL
               ELSE (($3::date + sd.start_time) AT TIME ZONE $4)
             END AS expected_start,
             CASE
               WHEN sd.end_time IS NULL OR sd.start_time IS NULL THEN NULL
               ELSE (
                 ($3::date + sd.end_time +
                   CASE
                     WHEN sd.end_time <= sd.start_time THEN INTERVAL '1 day'
                     ELSE INTERVAL '0 day'
                   END
                 ) AT TIME ZONE $4
               )
             END AS expected_end
           FROM public.employee_schedule_assignments AS a
           LEFT JOIN public.work_schedules AS ws
             ON ws.organization_id = a.organization_id
            AND ws.id = a.schedule_id
           LEFT JOIN public.work_schedule_days AS sd
             ON sd.organization_id = a.organization_id
            AND sd.schedule_id = a.schedule_id
            AND sd.day_of_week = EXTRACT(ISODOW FROM $3::date)::int
           WHERE a.organization_id = $1
             AND a.employee_id = $2
             AND a.effective_from <= $3::date
             AND (a.effective_to IS NULL OR a.effective_to >= $3::date)
           ORDER BY a.effective_from DESC, a.created_at DESC
           LIMIT 1`,
          [
            actor.organizationId,
            actor.employeeId,
            currentLocalDate,
            timeZone,
          ],
        );

        const activeAssignment = assignmentResult.rows[0];

        if (!activeAssignment) {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "ACTIVE_SHIFT_ASSIGNMENT_REQUIRED",
              message: "You cannot clock in because you do not have an active shift assignment for today. Contact your manager.",
            },
            409,
          );
        }

        if (activeAssignment.schedule_status !== "ACTIVE") {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "ACTIVE_SHIFT_REQUIRED",
              message: "Your assigned schedule is not active. Contact your manager before clocking in.",
            },
            409,
          );
        }

        if (!activeAssignment.expected_start || !activeAssignment.expected_end) {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "NO_SHIFT_SCHEDULED_TODAY",
              message: "Your assigned schedule has no shift for today. You cannot clock in without a scheduled shift.",
            },
            409,
          );
        }

        scheduledStart = new Date(activeAssignment.expected_start);
        scheduledEnd = new Date(activeAssignment.expected_end);
        scheduleAssignmentId = activeAssignment.id;

        // Strict shift boundary: employees may clock in only at or after
        // the assigned shift start. Organization policy cannot widen this
        // window because the product requirement prohibits clocking in
        // outside the assigned shift.
        const formatOrgTime = (value: Date) =>
          new Intl.DateTimeFormat("en", {
            hour: "numeric",
            minute: "2-digit",
            timeZone,
          }).format(value);

        if (currentTime.getTime() < scheduledStart.getTime()) {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "EARLY_CLOCK_IN_NOT_ALLOWED",
              message: `Your shift starts at ${formatOrgTime(scheduledStart)}. You can clock in at that time or later, before your shift ends.`,
              scheduledStartAt: scheduledStart.toISOString(),
              scheduledEndAt: scheduledEnd.toISOString(),
              earlyClockInWindowMinutes: 0,
            },
            409,
          );
        }

        if (currentTime.getTime() >= scheduledEnd.getTime()) {
          await client.query("ROLLBACK");
          return jsonResponse(
            {
              code: "SHIFT_ALREADY_ENDED",
              message: `Your assigned shift ended at ${formatOrgTime(scheduledEnd)}. You cannot clock in at or after the shift end. Contact your manager if your schedule needs correction.`,
              scheduledStartAt: scheduledStart.toISOString(),
              scheduledEndAt: scheduledEnd.toISOString(),
            },
            409,
          );
        }
      } else if (latestEvent) {
        // Preserve the original punch's work date, time zone and assignment.
        // This is important for overnight shifts that end on the next date.
        workDate = latestEvent.work_date;
        eventTimeZone = latestEvent.time_zone;
        scheduleAssignmentId = latestEvent.schedule_assignment_id;

        if (scheduleAssignmentId) {
          const shiftResult = await client.query<{
            expected_end: Date | null;
          }>(
            `SELECT
               CASE
                 WHEN sd.start_time IS NULL OR sd.end_time IS NULL THEN NULL
                 ELSE (
                   ($3::date + sd.end_time +
                     CASE
                       WHEN sd.end_time <= sd.start_time THEN INTERVAL '1 day'
                       ELSE INTERVAL '0 day'
                     END
                   ) AT TIME ZONE $4
                 )
               END AS expected_end
             FROM public.employee_schedule_assignments AS a
             LEFT JOIN public.work_schedule_days AS sd
               ON sd.organization_id = a.organization_id
              AND sd.schedule_id = a.schedule_id
              AND sd.day_of_week = EXTRACT(ISODOW FROM $3::date)::int
             WHERE a.organization_id = $1
               AND a.employee_id = $2
               AND a.id = $5
               AND a.effective_from <= $3::date
               AND (a.effective_to IS NULL OR a.effective_to >= $3::date)
             LIMIT 1`,
            [
              actor.organizationId,
              actor.employeeId,
              workDate,
              eventTimeZone,
              scheduleAssignmentId,
            ],
          );

          scheduledEnd = shiftResult.rows[0]?.expected_end
            ? new Date(shiftResult.rows[0].expected_end)
            : null;

          if (scheduledEnd && currentTime.getTime() > scheduledEnd.getTime()) {
            // Only approved preauthorizations decided before the scheduled
            // shift end count as permission to work overtime. The punch itself
            // is never blocked: employees must always be able to clock out.
            const overtimeResult = await client.query<{
              approved_minutes: string | number | null;
            }>(
              `SELECT COALESCE(SUM(o.approved_minutes), 0) AS approved_minutes
               FROM public.attendance_overtime_requests AS o
               WHERE o.organization_id = $1
                 AND o.employee_id = $2
                 AND o.work_date = $3::date
                 AND o.request_type = 'PREAUTHORIZATION'
                 AND o.status = 'APPROVED'
                 AND o.approved_minutes IS NOT NULL
                 AND o.requested_at <= $4::timestamptz
                 AND o.decision_at <= $4::timestamptz`,
              [
                actor.organizationId,
                actor.employeeId,
                workDate,
                scheduledEnd,
              ],
            );

            approvedOvertimeMinutes = Math.max(
              0,
              Number(overtimeResult.rows[0]?.approved_minutes ?? 0),
            );
          }
        }
      }


      const inserted = await client.query(
        `INSERT INTO public.attendance_events (
           organization_id,
           employee_id,
           schedule_assignment_id,
           event_type,
           recorded_at,
           work_date,
           time_zone,
           source,
           created_by_user_id
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6::date,
           $7,
           'EMPLOYEE_WEB',
           $8
         )
         RETURNING
           id,
           organization_id AS "organizationId",
           employee_id AS "employeeId",
           schedule_assignment_id AS "scheduleAssignmentId",
           event_type AS "eventType",
           recorded_at AS "recordedAt",
           TO_CHAR(work_date, 'YYYY-MM-DD') AS "workDate",
           time_zone AS "timeZone",
           source`,
        [
          actor.organizationId,
          actor.employeeId,
          scheduleAssignmentId,
          action,
          currentTime,
          workDate,
          eventTimeZone,
          actor.userId,
        ],
      );

      await client.query("COMMIT");

      return jsonResponse(
        {
          status: "ok",
          message:
            action === "CLOCK_IN"
              ? "Clock-in recorded"
              : "Clock-out recorded",
          event: inserted.rows[0],
        },
        201,
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Attendance event creation failed:", error);

    return jsonResponse(
      { message: "Unable to record your attendance event right now" },
      500,
    );
  }
}