import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import {
  isRecord,
  isUuid,
  isValidDateString,
  jsonResponse,
  organizationIsActive,
} from "../../../../lib/schedule-utils";

type OvertimeRequestType = "PREAUTHORIZATION";

const OVERTIME_SELECT = `
  SELECT
    o.id,
    o.organization_id AS "organizationId",
    o.employee_id AS "employeeId",
    o.timesheet_id AS "timesheetId",
    o.work_date AS "workDate",
    o.request_type AS "requestType",
    o.requested_minutes AS "requestedMinutes",
    o.approved_minutes AS "approvedMinutes",
    o.reason,
    o.status,
    o.requested_at AS "requestedAt",
    o.requested_by_user_id AS "requestedByUserId",
    o.decided_by_user_id AS "decidedByUserId",
    o.decision_at AS "decisionAt",
    o.reviewer_note AS "reviewerNote",
    e.employee_code AS "employeeCode",
    e.first_name AS "firstName",
    e.last_name AS "lastName",
    e.department_id AS "departmentId",
    d.name AS "departmentName"
  FROM public.attendance_overtime_requests AS o
  JOIN public.employees AS e
    ON e.id = o.employee_id
   AND e.organization_id = o.organization_id
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

    const conditions = ["o.organization_id = $1"];
    const values: unknown[] = [actor.organizationId];

    if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "EMPLOYEE"
    ) {
      values.push(actor.employeeId);
      conditions.push(`o.employee_id = $${values.length}::uuid`);
    } else if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER"
    ) {
      values.push(actor.employeeId);
      conditions.push(`(
        o.employee_id = $${values.length}::uuid
        OR EXISTS (
          SELECT 1
          FROM public.departments AS managed_department
          WHERE managed_department.organization_id = e.organization_id
            AND managed_department.id = e.department_id
            AND managed_department.manager_id = $${values.length}::uuid
        )
      )`);
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
        {
          message:
            "You do not have permission to view overtime requests",
        },
        403,
      );
    }

    const result = await pool.query(
      `${OVERTIME_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE WHEN o.status = 'PENDING' THEN 0 ELSE 1 END,
         o.work_date DESC,
         e.last_name,
         e.first_name
       LIMIT 200`,
      values,
    );

    return jsonResponse({
      status: "ok",
      requests: result.rows,
    });
  } catch (error) {
    console.error("Overtime request list failed:", error);

    return jsonResponse(
      { message: "Unable to load overtime requests" },
      500,
    );
  }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) return originError;

  const parsed = await parseJsonRequestBody(request);

  if (!parsed.ok) return parsed.response;

  const body = parsed.body;

  if (!isRecord(body)) {
    return jsonResponse(
      { message: "Invalid request body" },
      400,
    );
  }

  const allowedKeys = new Set([
    "requestType",
    "workDate",
    "requestedMinutes",
    "reason",
  ]);

  const unknownKeys = Object.keys(body).filter(
    (key) => !allowedKeys.has(key),
  );

  if (unknownKeys.length > 0) {
    return jsonResponse(
      { message: `Unsupported field: ${unknownKeys.join(", ")}` },
      400,
    );
  }

  const requestType = body.requestType;

  if (requestType !== "PREAUTHORIZATION") {
    return jsonResponse(
      {
        message:
          "Only advance overtime requests are supported. Request overtime before the work date and wait for approval before working it.",
      },
      400,
    );
  }

  if (!isValidDateString(body.workDate)) {
    return jsonResponse(
      { message: "workDate must be a valid YYYY-MM-DD date" },
      400,
    );
  }

  if (
    typeof body.requestedMinutes !== "number" ||
    !Number.isInteger(body.requestedMinutes) ||
    body.requestedMinutes < 1 ||
    body.requestedMinutes > 1440
  ) {
    return jsonResponse(
      {
        message:
          "requestedMinutes must be a whole number between 1 and 1440",
      },
      400,
    );
  }

  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";

  if (!reason || reason.length > 500) {
    return jsonResponse(
      { message: "A reason is required and cannot exceed 500 characters" },
      400,
    );
  }


  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (
      actor.kind !== "ORGANIZATION_USER" ||
      !(actor.roleName === "EMPLOYEE" || actor.roleName === "DEPARTMENT_MANAGER")
    ) {
      return jsonResponse(
        {
          message:
            "Employees and Department Managers can submit overtime requests for their own record",
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

    const settings = await pool.query<{ time_zone: string }>(
      `SELECT time_zone
       FROM public.organization_settings
       WHERE organization_id = $1
       LIMIT 1`,
      [actor.organizationId],
    );

    const timeZone = settings.rows[0]?.time_zone;

    if (!timeZone) {
      return jsonResponse(
        { message: "The organization's time zone is not configured" },
        409,
      );
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return jsonResponse(
        { message: "The organization's time zone is invalid" },
        500,
      );
    }

    const todayResult = await pool.query<{ local_date: string }>(
      `SELECT (NOW() AT TIME ZONE $1)::date::text AS local_date`,
      [timeZone],
    );

    const localToday = todayResult.rows[0]?.local_date;

    if (!localToday) {
      return jsonResponse(
        { message: "Unable to determine the organization's current date" },
        500,
      );
    }

    if (
      body.workDate <= localToday
    ) {
      return jsonResponse(
        {
          message:
            "Overtime must be requested in advance. Choose a future work date and wait for approval before working overtime.",
        },
        400,
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended($1::text, 0)
         )`,
        [
          `overtime:${actor.organizationId}:${actor.employeeId}:${body.workDate}`,
        ],
      );

      const employeeResult = await client.query(
        `SELECT id
         FROM public.employees
         WHERE id = $1
           AND organization_id = $2
           AND employment_status = 'ACTIVE'
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

      // Overtime is only meaningful for a future date on which this employee
      // has an effective, active shift assignment and that shift is scheduled
      // to work on the requested weekday. Validate this on the server rather
      // than trusting the client-side date picker or employee input.
      const scheduledShiftResult = await client.query<{ assignment_id: string }>(
        `SELECT a.id AS assignment_id
         FROM public.employee_schedule_assignments AS a
         JOIN public.work_schedules AS ws
           ON ws.id = a.schedule_id
          AND ws.organization_id = a.organization_id
         JOIN public.work_schedule_days AS sd
           ON sd.schedule_id = ws.id
          AND sd.organization_id = ws.organization_id
         WHERE a.organization_id = $1
           AND a.employee_id = $2
           AND a.effective_from <= $3::date
           AND (a.effective_to IS NULL OR a.effective_to >= $3::date)
           AND ws.status = 'ACTIVE'
           AND sd.day_of_week = EXTRACT(ISODOW FROM $3::date)::integer
         ORDER BY a.effective_from DESC, a.created_at DESC
         LIMIT 1
         FOR SHARE OF a, ws`,
        [actor.organizationId, actor.employeeId, body.workDate],
      );

      if (scheduledShiftResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "You can only request overtime for a future date when you have an active assigned shift scheduled. Check your assigned shift or contact your HR Manager.",
          },
          409,
        );
      }

      const inserted = await client.query(
        `INSERT INTO public.attendance_overtime_requests (
           organization_id,
           employee_id,
           timesheet_id,
           work_date,
           request_type,
           requested_minutes,
           reason,
           status,
           requested_by_user_id
         )
         VALUES ($1, $2, NULL, $3::date, $4, $5, $6, 'PENDING', $7)
         RETURNING
           id,
           organization_id AS "organizationId",
           employee_id AS "employeeId",
           timesheet_id AS "timesheetId",
           work_date AS "workDate",
           request_type AS "requestType",
           requested_minutes AS "requestedMinutes",
           approved_minutes AS "approvedMinutes",
           reason,
           status,
           requested_at AS "requestedAt"`,
        [
          actor.organizationId,
          actor.employeeId,
          body.workDate,
          requestType,
          body.requestedMinutes,
          reason,
          actor.userId,
        ],
      );

      await client.query("COMMIT");

      return jsonResponse(
        {
          status: "ok",
          message: "Overtime request submitted for review",
          request: inserted.rows[0],
          note:
            "This is an advance request only. Wait for approval before working overtime; approval is not itself a payroll calculation.",
        },
        201,
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return jsonResponse(
          {
            message:
              "A pending request of this type already exists for this date",
          },
          409,
        );
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Overtime request creation failed:", error);

    return jsonResponse(
      { message: "Unable to submit the overtime request" },
      500,
    );
  }
}