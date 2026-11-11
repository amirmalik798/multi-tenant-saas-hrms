import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import {
  canManageScheduleDefinitions,
  isRecord,
  isUuid,
  isValidDateString,
  jsonResponse,
  organizationIsActive,
} from "../../../../lib/schedule-utils";
import { isExcludedHrTargetRole } from "../../../../lib/workforce-eligibility";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

function previousDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function PATCH(request: Request, context: RouteContext) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse({ message: "You do not have permission to correct schedule assignments" }, 403);
    }
    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse({ message: "This organization is not active" }, 403);
    }

    const { id } = await context.params;
    if (!isUuid(id)) return jsonResponse({ message: "Invalid assignment ID" }, 400);
    const body = parsedBody.body;
    if (!isRecord(body)) return jsonResponse({ message: "Invalid request body" }, 400);
    const unknownKeys = Object.keys(body).filter((key) => !["scheduleId", "effectiveFrom"].includes(key));
    if (unknownKeys.length) return jsonResponse({ message: `Unsupported field: ${unknownKeys.join(", ")}` }, 400);
    if (!isUuid(body.scheduleId)) return jsonResponse({ message: "Choose a valid replacement schedule" }, 400);
    if (!isValidDateString(body.effectiveFrom)) return jsonResponse({ message: "Correction date must be a valid YYYY-MM-DD date" }, 400);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assignmentResult = await client.query(
        `SELECT a.id, a.employee_id AS "employeeId", a.schedule_id AS "scheduleId",
                a.effective_from::text AS "effectiveFrom", a.effective_to::text AS "effectiveTo",
                workforce_role.name AS "workforceRole",
                EXISTS (
                  SELECT 1
                  FROM public.users target_account
                  JOIN public.roles target_account_role
                    ON target_account_role.id = target_account.role_id
                   AND target_account_role.organization_id = target_account.organization_id
                  WHERE target_account.organization_id = a.organization_id
                    AND target_account.employee_id = a.employee_id
                    AND target_account.account_scope = 'ORGANIZATION'
                    AND regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g')
                      IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
                ) AS "isOrganizationAdmin"
         FROM public.employee_schedule_assignments a
         JOIN public.employees e
           ON e.id = a.employee_id AND e.organization_id = a.organization_id
         LEFT JOIN public.roles workforce_role
           ON workforce_role.id = e.workforce_role_id
          AND workforce_role.organization_id = e.organization_id
         WHERE a.id = $1 AND a.organization_id = $2
         FOR UPDATE OF a`,
        [id, actor.organizationId],
      );
      if (!assignmentResult.rows.length) {
        await client.query("ROLLBACK");
        return jsonResponse({ message: "Schedule assignment not found in this organization" }, 404);
      }
      const assignment = assignmentResult.rows[0];
      if (
        actor.kind === "ORGANIZATION_USER" &&
        actor.roleName === "HR_MANAGER" &&
        (isExcludedHrTargetRole(assignment.workforceRole) || assignment.isOrganizationAdmin)
      ) {
        await client.query("ROLLBACK");
        return jsonResponse(
          { message: "Organization Admin and HR Manager records are not eligible for HR Manager schedule assignment changes" },
          403,
        );
      }
      const correctionDate = body.effectiveFrom as string;
      if (correctionDate < assignment.effectiveFrom || (assignment.effectiveTo && correctionDate > assignment.effectiveTo)) {
        await client.query("ROLLBACK");
        return jsonResponse({ message: "The correction date must fall within the selected assignment's effective dates" }, 400);
      }

      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        [`employee-schedule:${actor.organizationId}:${assignment.employeeId}`],
      );

      const scheduleResult = await client.query(
        `SELECT id FROM public.work_schedules
         WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE'
         LIMIT 1 FOR SHARE`,
        [body.scheduleId, actor.organizationId],
      );
      if (!scheduleResult.rows.length) {
        await client.query("ROLLBACK");
        return jsonResponse({ message: "Choose an active schedule from this organization" }, 404);
      }

      // A schedule correction changes the effective schedule for every date
      // from correctionDate through the end of this assignment. Protect all
      // recorded attendance and pending/approved corrections in that range,
      // not just events on correctionDate, so historical attendance/pay
      // calculations cannot silently change for later recorded days.
      const attendanceResult = await client.query(
        `SELECT 1
         FROM (
           SELECT ae.work_date
           FROM public.attendance_events AS ae
           WHERE ae.organization_id = $1
             AND ae.employee_id = $2
             AND ae.work_date >= $3::date
             AND ($4::date IS NULL OR ae.work_date <= $4::date)
           UNION ALL
           SELECT cr.work_date
           FROM public.attendance_correction_requests AS cr
           WHERE cr.organization_id = $1
             AND cr.employee_id = $2
             AND cr.status IN ('PENDING', 'APPROVED')
             AND cr.work_date >= $3::date
             AND ($4::date IS NULL OR cr.work_date <= $4::date)
         ) AS recorded_attendance
         LIMIT 1`,
        [
          actor.organizationId,
          assignment.employeeId,
          correctionDate,
          assignment.effectiveTo,
        ],
      );

      if (attendanceResult.rows.length) {
        await client.query("ROLLBACK");
        return jsonResponse({
          message: "Attendance or an active correction request already exists on or after this date within the selected assignment. Choose a later date after the recorded activity, or resolve the correction request first, so existing attendance and pay calculations are not changed retroactively.",
        }, 409);
      }

      if (correctionDate === assignment.effectiveFrom) {
        const updated = await client.query(
          `UPDATE public.employee_schedule_assignments
           SET schedule_id = $1, assigned_by_user_id = $2
           WHERE id = $3 AND organization_id = $4
           RETURNING id, employee_id AS "employeeId", schedule_id AS "scheduleId",
                     effective_from AS "effectiveFrom", effective_to AS "effectiveTo"`,
          [body.scheduleId, actor.userId, id, actor.organizationId],
        );
        await client.query("COMMIT");
        return jsonResponse({ status: "ok", correction: "updated-existing-assignment", assignment: updated.rows[0] });
      }

      const overlap = await client.query(
        `SELECT 1 FROM public.employee_schedule_assignments
         WHERE organization_id = $1 AND employee_id = $2 AND id <> $3
           AND effective_from <= COALESCE($5::date, 'infinity'::date)
           AND COALESCE(effective_to, 'infinity'::date) >= $4::date
         LIMIT 1`,
        [actor.organizationId, assignment.employeeId, id, correctionDate, assignment.effectiveTo],
      );
      if (overlap.rows.length) {
        await client.query("ROLLBACK");
        return jsonResponse({ message: "Another assignment overlaps the correction period. Resolve that assignment first." }, 409);
      }

      await client.query(
        `UPDATE public.employee_schedule_assignments
         SET effective_to = $1::date, assigned_by_user_id = $2
         WHERE id = $3 AND organization_id = $4`,
        [previousDate(correctionDate), actor.userId, id, actor.organizationId],
      );
      const inserted = await client.query(
        `INSERT INTO public.employee_schedule_assignments
           (organization_id, employee_id, schedule_id, effective_from, effective_to, assigned_by_user_id)
         VALUES ($1, $2, $3, $4::date, $5::date, $6)
         RETURNING id, employee_id AS "employeeId", schedule_id AS "scheduleId",
                   effective_from AS "effectiveFrom", effective_to AS "effectiveTo"`,
        [actor.organizationId, assignment.employeeId, body.scheduleId, correctionDate, assignment.effectiveTo, actor.userId],
      );
      await client.query("COMMIT");
      return jsonResponse({ status: "ok", correction: "split-assignment-history-preserved", assignment: inserted.rows[0] }, 201);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Schedule assignment correction failed:", error);
    return jsonResponse({ message: "Unable to correct this schedule assignment right now" }, 500);
  }
}
