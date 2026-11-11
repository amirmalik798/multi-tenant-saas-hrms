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

type CorrectionEventType = "CLOCK_IN" | "CLOCK_OUT";

function isCorrectionEventType(
  value: unknown,
): value is CorrectionEventType {
  return value === "CLOCK_IN" || value === "CLOCK_OUT";
}

function isOffsetDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const pattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

  return pattern.test(value) && Number.isFinite(Date.parse(value));
}

const CORRECTION_SELECT = `
  SELECT
    r.id,
    r.organization_id AS "organizationId",
    r.employee_id AS "employeeId",
    r.original_event_id AS "originalEventId",
    original_event.recorded_at AS "originalRecordedAt",
    r.event_type AS "eventType",
    r.requested_at AS "requestedAt",
    r.work_date AS "workDate",
    r.time_zone AS "timeZone",
    r.reason,
    r.status,
    r.requested_at_created AS "createdAt",
    r.decided_by_user_id AS "decidedByUserId",
    r.decision_at AS "decisionAt",
    r.reviewer_note AS "reviewerNote",
    e.employee_code AS "employeeCode",
    e.first_name AS "firstName",
    e.last_name AS "lastName",
    e.department_id AS "departmentId",
    d.name AS "departmentName"
  FROM public.attendance_correction_requests AS r
  JOIN public.employees AS e
    ON e.id = r.employee_id
   AND e.organization_id = r.organization_id
  LEFT JOIN public.departments AS d
    ON d.id = e.department_id
   AND d.organization_id = e.organization_id
  LEFT JOIN public.attendance_events AS original_event
    ON original_event.id = r.original_event_id
   AND original_event.organization_id = r.organization_id
   AND original_event.employee_id = r.employee_id
`;

export async function GET() {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const values: unknown[] = [actor.organizationId];
    const conditions = ["r.organization_id = $1"];

    if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "EMPLOYEE"
    ) {
      values.push(actor.employeeId);
      conditions.push(`r.employee_id = $${values.length}::uuid`);
    } else if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER"
    ) {
      values.push(actor.employeeId);
      conditions.push(`(
        r.employee_id = $${values.length}::uuid
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
        { message: "You do not have permission to view correction requests" },
        403,
      );
    }

    const result = await pool.query(
      `${CORRECTION_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END,
         r.requested_at_created DESC
       LIMIT 200`,
      values,
    );

    return jsonResponse({
      status: "ok",
      requests: result.rows,
    });
  } catch (error) {
    console.error("Attendance correction list failed:", error);

    return jsonResponse(
      { message: "Unable to load attendance correction requests" },
      500,
    );
  }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;

  if (!isRecord(body)) {
    return jsonResponse({ message: "Invalid request body" }, 400);
  }

  const allowedKeys = new Set([
    "eventType",
    "requestedAt",
    "workDate",
    "originalEventId",
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

  if (!isCorrectionEventType(body.eventType)) {
    return jsonResponse(
      { message: "eventType must be CLOCK_IN or CLOCK_OUT" },
      400,
    );
  }

  if (!isOffsetDateTime(body.requestedAt)) {
    return jsonResponse(
      {
        message:
          "requestedAt must be a valid ISO date-time containing a time-zone offset",
      },
      400,
    );
  }

  if (Date.parse(body.requestedAt) > Date.now()) {
    return jsonResponse(
      { message: "A correction cannot request a future attendance time" },
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

  const originalEventId =
    body.originalEventId === undefined || body.originalEventId === null
      ? null
      : body.originalEventId;

  if (originalEventId !== null && !isUuid(originalEventId)) {
    return jsonResponse(
      { message: "originalEventId must be a valid UUID or null" },
      400,
    );
  }

  if (originalEventId !== null && body.workDate !== undefined) {
    return jsonResponse(
      {
        message:
          "Do not supply workDate when correcting an existing event; its original work date is preserved",
      },
      400,
    );
  }

  if (
    originalEventId === null &&
    !isValidDateString(body.workDate)
  ) {
    return jsonResponse(
      {
        message:
          "A valid workDate is required when reporting a missing punch",
      },
      400,
    );
  }

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (
      actor.kind !== "ORGANIZATION_USER" ||
      !(actor.roleName === "EMPLOYEE" || actor.roleName === "DEPARTMENT_MANAGER")
    ) {
      return jsonResponse(
        {
          message:
            "Employees and Department Managers can submit correction requests for their own attendance",
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

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const employee = await client.query(
        `SELECT id
         FROM public.employees
         WHERE id = $1
           AND organization_id = $2
           AND employment_status = 'ACTIVE'
         FOR SHARE`,
        [actor.employeeId, actor.organizationId],
      );

      if (employee.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "Your active employee record was not found" },
          403,
        );
      }

      const settings = await client.query<{ time_zone: string }>(
        `SELECT time_zone
         FROM public.organization_settings
         WHERE organization_id = $1
         LIMIT 1`,
        [actor.organizationId],
      );

      const timeZone = settings.rows[0]?.time_zone;

      if (!timeZone) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "The organization's time zone must be configured before submitting a correction",
          },
          409,
        );
      }

      try {
        new Intl.DateTimeFormat("en-US", { timeZone });
      } catch {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "The organization's configured time zone is invalid" },
          500,
        );
      }

      let workDate: string;
      let storedTimeZone = timeZone;

      if (originalEventId !== null) {
        const original = await client.query<{
          event_type: CorrectionEventType;
          work_date: string;
          time_zone: string;
        }>(
          `SELECT event_type, work_date, time_zone
           FROM public.attendance_events
           WHERE id = $1
             AND organization_id = $2
             AND employee_id = $3
           FOR SHARE`,
          [
            originalEventId,
            actor.organizationId,
            actor.employeeId,
          ],
        );

        if (original.rows.length === 0) {
          await client.query("ROLLBACK");

          return jsonResponse(
            { message: "The attendance event was not found" },
            404,
          );
        }

        if (original.rows[0].event_type !== body.eventType) {
          await client.query("ROLLBACK");

          return jsonResponse(
            {
              message:
                "The correction event type must match the original event",
            },
            400,
          );
        }

        workDate = original.rows[0].work_date;
        storedTimeZone = original.rows[0].time_zone;
      } else {
        workDate = body.workDate as string;
      }

      const inserted = await client.query(
        `INSERT INTO public.attendance_correction_requests (
           organization_id,
           employee_id,
           original_event_id,
           event_type,
           requested_at,
           work_date,
           time_zone,
           reason,
           requested_by_user_id
         )
         VALUES (
           $1, $2, $3, $4, $5::timestamptz,
           $6::date, $7, $8, $9
         )
         RETURNING
           id,
           organization_id AS "organizationId",
           employee_id AS "employeeId",
           original_event_id AS "originalEventId",
           event_type AS "eventType",
           requested_at AS "requestedAt",
           work_date AS "workDate",
           time_zone AS "timeZone",
           reason,
           status,
           requested_at_created AS "createdAt"`,
        [
          actor.organizationId,
          actor.employeeId,
          originalEventId,
          body.eventType,
          body.requestedAt,
          workDate,
          storedTimeZone,
          reason,
          actor.userId,
        ],
      );

      await client.query("COMMIT");

      return jsonResponse(
        {
          status: "ok",
          message: "Attendance correction request submitted for review",
          request: inserted.rows[0],
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
              "A correction request for this event is already pending",
          },
          409,
        );
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Attendance correction request failed:", error);

    return jsonResponse(
      { message: "Unable to submit the correction request" },
      500,
    );
  }
}