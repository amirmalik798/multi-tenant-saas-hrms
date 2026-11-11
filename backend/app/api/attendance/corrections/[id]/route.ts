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

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;

  if (!isRecord(body)) {
    return jsonResponse({ message: "Invalid request body" }, 400);
  }

  const unknownKeys = Object.keys(body).filter(
    (key) => !["decision", "reviewerNote"].includes(key),
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
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    const isOrgAdmin = actor.kind === "ORGANIZATION_ADMIN";

    const isHrManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "HR_MANAGER";

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER";

    if (!isOrgAdmin && !isHrManager && !isDepartmentManager) {
      return jsonResponse(
        { message: "You do not have permission to review correction requests" },
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
        { message: "Invalid correction request ID" },
        400,
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const values: unknown[] = [id, actor.organizationId];
      let scopePredicate = "";

      if (isDepartmentManager && actor.kind === "ORGANIZATION_USER") {
        values.push(actor.employeeId);

        scopePredicate = `
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
        status: string;
      }>(
        `SELECT r.id, r.employee_id, r.status
         FROM public.attendance_correction_requests AS r
         JOIN public.employees AS e
           ON e.id = r.employee_id
          AND e.organization_id = r.organization_id
         WHERE r.id = $1
           AND r.organization_id = $2
           ${scopePredicate}
         FOR UPDATE OF r`,
        values,
      );

      const correction = result.rows[0];

      if (!correction) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "Correction request not found" },
          404,
        );
      }

      if (
        actor.kind === "ORGANIZATION_USER" &&
        actor.employeeId === correction.employee_id
      ) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "You cannot review your own attendance correction" },
          403,
        );
      }

      if (correction.status !== "PENDING") {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "This request has already been reviewed and can no longer be changed",
          },
          409,
        );
      }

      const newStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";

      const updated = await client.query(
        `UPDATE public.attendance_correction_requests
         SET status = $1,
             decided_by_user_id = $2,
             decision_at = NOW(),
             reviewer_note = $3
         WHERE id = $4
           AND organization_id = $5
           AND status = 'PENDING'
         RETURNING
           id,
           organization_id AS "organizationId",
           employee_id AS "employeeId",
           original_event_id AS "originalEventId",
           event_type AS "eventType",
           requested_at AS "requestedAt",
           work_date AS "workDate",
           reason,
           status,
           requested_at_created AS "createdAt",
           decided_by_user_id AS "decidedByUserId",
           decision_at AS "decisionAt",
           reviewer_note AS "reviewerNote"`,
        [
          newStatus,
          actor.userId,
          reviewerNote,
          id,
          actor.organizationId,
        ],
      );

      if (updated.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          { message: "The request has already been reviewed" },
          409,
        );
      }

      await client.query("COMMIT");

      return jsonResponse({
        status: "ok",
        message:
          decision === "APPROVE"
            ? "Correction request approved"
            : "Correction request rejected",
        request: updated.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Attendance correction decision failed:", error);

    return jsonResponse(
      { message: "Unable to review the correction request" },
      500,
    );
  }
}