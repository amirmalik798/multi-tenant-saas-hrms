import { pool } from "../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../../../lib/request-security";
import { isRecord, isUuid, jsonResponse, organizationIsActive } from "../../../../../lib/schedule-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsed = await parseJsonRequestBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!isRecord(body)) return jsonResponse({ message: "Invalid request body" }, 400);

  const unknownKeys = Object.keys(body).filter((key) => !["decision", "reviewerNote"].includes(key));
  if (unknownKeys.length) return jsonResponse({ message: `Unsupported field: ${unknownKeys.join(", ")}` }, 400);

  const decision = body.decision === "MARK_REVIEWED" || body.decision === "FOLLOW_UP" ? body.decision : null;
  if (!decision) return jsonResponse({ message: "decision must be MARK_REVIEWED or FOLLOW_UP" }, 400);

  if (body.reviewerNote !== undefined && body.reviewerNote !== null && typeof body.reviewerNote !== "string") {
    return jsonResponse({ message: "reviewerNote must be a string or null" }, 400);
  }
  const reviewerNote = typeof body.reviewerNote === "string" ? body.reviewerNote.trim() || null : null;
  if (reviewerNote && reviewerNote.length > 500) {
    return jsonResponse({ message: "reviewerNote cannot exceed 500 characters" }, 400);
  }
  if (decision === "FOLLOW_UP" && !reviewerNote) {
    return jsonResponse({ message: "Add a note explaining the follow-up required" }, 400);
  }

  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    const allowed =
      actor.kind === "ORGANIZATION_ADMIN" ||
      (actor.kind === "ORGANIZATION_USER" &&
        (actor.roleName === "HR_MANAGER" || actor.roleName === "DEPARTMENT_MANAGER"));
    if (!allowed) return jsonResponse({ message: "You do not have permission to review excess attendance time" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse({ message: "This organization is not active" }, 403);
    }

    const { id } = await context.params;
    if (!isUuid(id)) return jsonResponse({ message: "Invalid review case ID" }, 400);

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";
    const values: unknown[] = [id, actor.organizationId];
    let scopePredicate = "";
    if (isDepartmentManager) {
      values.push(actor.employeeId);
      scopePredicate = `AND EXISTS (
        SELECT 1 FROM public.departments md
        WHERE md.organization_id = e.organization_id
          AND md.id = e.department_id
          AND md.manager_id = $${values.length}::uuid
      )`;
    }

    const status = decision === "MARK_REVIEWED" ? "REVIEWED_NO_PAY" : "FOLLOW_UP";
    values.push(status, actor.userId, reviewerNote);

    const result = await pool.query(
      `UPDATE public.attendance_excess_overtime_reviews r
       SET status = $${values.length - 2},
           reviewed_by_user_id = $${values.length - 1},
           reviewer_note = $${values.length},
           reviewed_at = NOW(),
           updated_at = NOW()
       FROM public.employees e
       WHERE r.id = $1::uuid
         AND r.organization_id = $2::uuid
         AND e.id = r.employee_id
         AND e.organization_id = r.organization_id
         ${scopePredicate}
         AND r.status = 'OPEN'
       RETURNING r.id, r.status, r.excess_minutes AS "excessMinutes",
                 r.reviewer_note AS "reviewerNote", r.reviewed_at AS "reviewedAt"`,
      values,
    );
    if (!result.rowCount) {
      return jsonResponse({ message: "Open excess-time review case not found, already reviewed, or outside your department scope" }, 404);
    }
    return jsonResponse({
      status: "ok",
      message: decision === "MARK_REVIEWED"
        ? "Excess time reviewed. It remains unpaid because it was not approved in advance."
        : "Follow-up recorded. The excess time remains unpaid unless the existing payroll rules allow it.",
      review: result.rows[0],
    });
  } catch (error) {
    console.error("Excess overtime review decision failed:", error);
    return jsonResponse({ message: "Unable to save excess overtime review decision" }, 500);
  }
}
