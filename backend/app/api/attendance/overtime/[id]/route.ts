import { pool } from "../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../lib/request-security";
import {
  isRecord,
  isUuid,
  jsonResponse,
  organizationIsActive,
} from "../../../../../lib/schedule-utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Decision = "APPROVE" | "REJECT";

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
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

  const unknownKeys = Object.keys(body).filter(
    (key) =>
      !["decision", "approvedMinutes", "reviewerNote"].includes(key),
  );

  if (unknownKeys.length > 0) {
    return jsonResponse(
      { message: `Unsupported field: ${unknownKeys.join(", ")}` },
      400,
    );
  }

  const decision: Decision | null =
    body.decision === "APPROVE"
      ? "APPROVE"
      : body.decision === "REJECT"
        ? "REJECT"
        : null;

  if (!decision) {
    return jsonResponse(
      { message: "decision must be APPROVE or REJECT" },
      400,
    );
  }

  if (
    body.approvedMinutes !== undefined &&
    (
      typeof body.approvedMinutes !== "number" ||
      !Number.isInteger(body.approvedMinutes) ||
      body.approvedMinutes < 1 ||
      body.approvedMinutes > 1440
    )
  ) {
    return jsonResponse(
      {
        message:
          "approvedMinutes must be a whole number from 1 to 1440",
      },
      400,
    );
  }

  if (
    decision === "REJECT" &&
    body.approvedMinutes !== undefined
  ) {
    return jsonResponse(
      {
        message:
          "approvedMinutes cannot be provided when rejecting a request",
      },
      400,
    );
  }

  let reviewerNote: string | null = null;

  if (body.reviewerNote !== undefined && body.reviewerNote !== null) {
    if (typeof body.reviewerNote !== "string") {
      return jsonResponse(
        { message: "reviewerNote must be a string or null" },
        400,
      );
    }

    reviewerNote = body.reviewerNote.trim() || null;

    if (reviewerNote && reviewerNote.length > 500) {
      return jsonResponse(
        { message: "reviewerNote cannot exceed 500 characters" },
        400,
      );
    }
  }

  if (decision === "REJECT" && !reviewerNote) {
    return jsonResponse(
      { message: "A reviewer note is required when rejecting a request" },
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

    const isOrganizationAdmin =
      actor.kind === "ORGANIZATION_ADMIN";

    const isHrManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "HR_MANAGER";

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER";

    if (
      !isOrganizationAdmin &&
      !isHrManager &&
      !isDepartmentManager
    ) {
      return jsonResponse(
        { message: "You do not have permission to review overtime requests" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonResponse(
        { message: "Invalid overtime request ID" },
        400,
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const values: unknown[] = [id, actor.organizationId];
      let scope = "";

      if (
        isDepartmentManager &&
        actor.kind === "ORGANIZATION_USER"
      ) {
        values.push(actor.employeeId);

        scope = `
          AND EXISTS (
            SELECT 1
            FROM public.departments AS managed_department
            WHERE managed_department.organization_id = e.organization_id
              AND managed_department.id = e.department_id
              AND managed_department.manager_id = $${values.length}::uuid
          )
        `;
      }

      const result = await client.query<{
        id: string;
        employee_id: string;
        requested_minutes: number;
        request_type: string;
        status: string;
        work_date: string;
        is_future_work_date: boolean;
      }>(
        `SELECT
           o.id,
           o.employee_id,
           o.requested_minutes,
           o.request_type,
           o.status,
           o.work_date::text AS work_date,
           (o.work_date > (
             NOW() AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')
           )::date) AS is_future_work_date
         FROM public.attendance_overtime_requests AS o
         JOIN public.employees AS e
           ON e.id = o.employee_id
          AND e.organization_id = o.organization_id
         LEFT JOIN public.organization_settings AS os
           ON os.organization_id = o.organization_id
         WHERE o.id = $1
           AND o.organization_id = $2
           ${scope}
         FOR UPDATE OF o`,
        values,
      );

      const overtime = result.rows[0];

      if (!overtime) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "Overtime request not found" },
          404,
        );
      }

      if (
        actor.kind === "ORGANIZATION_USER" &&
        actor.employeeId === overtime.employee_id
      ) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "You cannot approve your own overtime request" },
          403,
        );
      }

      if (overtime.request_type !== "PREAUTHORIZATION") {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "This is a legacy recorded-overtime request and cannot be reviewed in the advance-approval workflow. Submit a new request before the future work date.",
          },
          409,
        );
      }

      if (overtime.status !== "PENDING") {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "Only pending overtime requests can be reviewed",
          },
          409,
        );
      }

      // Approval must happen before the work date in the organization's
      // configured time zone. Rejections remain allowed for stale requests
      // so old pending items can still be resolved safely.
      if (decision === "APPROVE" && !overtime.is_future_work_date) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "This overtime request can no longer be approved because its work date has arrived or passed. Overtime must be approved in advance.",
          },
          409,
        );
      }

      const approvedMinutes =
        decision === "APPROVE"
          ? body.approvedMinutes ?? overtime.requested_minutes
          : null;

      if (
        decision === "APPROVE" &&
        (
          typeof approvedMinutes !== "number" ||
          approvedMinutes < 1 ||
          approvedMinutes > overtime.requested_minutes
        )
      ) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "Approved minutes must be between 1 and the requested minutes",
          },
          400,
        );
      }

      const newStatus =
        decision === "APPROVE" ? "APPROVED" : "REJECTED";

      const updated = await client.query(
        `UPDATE public.attendance_overtime_requests
         SET status = $1,
             approved_minutes = $2,
             decided_by_user_id = $3,
             decision_at = NOW(),
             reviewer_note = $4,
             updated_at = NOW()
         WHERE id = $5
           AND organization_id = $6
           AND status = 'PENDING'
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
           requested_at AS "requestedAt",
           decided_by_user_id AS "decidedByUserId",
           decision_at AS "decisionAt",
           reviewer_note AS "reviewerNote"`,
        [
          newStatus,
          approvedMinutes,
          actor.userId,
          reviewerNote,
          id,
          actor.organizationId,
        ],
      );

      if (updated.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "This overtime request has already been reviewed" },
          409,
        );
      }

      await client.query("COMMIT");

      return jsonResponse({
        status: "ok",
        message:
          decision === "APPROVE"
            ? "Overtime request approved"
            : "Overtime request rejected",
        request: updated.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Overtime decision failed:", error);

    return jsonResponse(
      { message: "Unable to review the overtime request" },
      500,
    );
  }
}