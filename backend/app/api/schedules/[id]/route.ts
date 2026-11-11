import { NextResponse } from "next/server";

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
  jsonResponse,
  organizationIsActive,
  parseScheduleDays,
  SCHEDULE_SELECT,
} from "../../../../lib/schedule-utils";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to view this schedule" },
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
      return jsonResponse({ message: "Invalid schedule ID" }, 400);
    }

    const result = await pool.query(
      `${SCHEDULE_SELECT}
       WHERE s.organization_id = $1
         AND s.id = $2
       GROUP BY s.id
       LIMIT 1`,
      [actor.organizationId, id],
    );

    if (result.rows.length === 0) {
      return jsonResponse({ message: "Schedule not found" }, 404);
    }

    return jsonResponse({
      status: "ok",
      schedule: result.rows[0],
    });
  } catch (error) {
    console.error("Schedule detail failed:", error);

    return jsonResponse(
      { message: "Unable to load this schedule right now" },
      500,
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to update schedules" },
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
      return jsonResponse({ message: "Invalid schedule ID" }, 400);
    }

    if (!isRecord(body)) {
      return jsonResponse({ message: "Invalid request body" }, 400);
    }

    const allowed = new Set(["name", "description", "status", "days"]);
    const unknownKeys = Object.keys(body).filter((key) => !allowed.has(key));

    if (unknownKeys.length > 0) {
      return jsonResponse(
        { message: `Unsupported field: ${unknownKeys.join(", ")}` },
        400,
      );
    }

    if (Object.keys(body).length === 0) {
      return jsonResponse(
        { message: "Provide at least one field to update" },
        400,
      );
    }

    const updates: Array<{
      column: string;
      value: string | null;
    }> = [];

    if (Object.hasOwn(body, "name")) {
      const name = typeof body.name === "string" ? body.name.trim() : "";

      if (!name || name.length > 100) {
        return jsonResponse(
          { message: "Schedule name is required and cannot exceed 100 characters" },
          400,
        );
      }

      updates.push({ column: "name", value: name });
    }

    if (Object.hasOwn(body, "description")) {
      if (body.description !== null && typeof body.description !== "string") {
        return jsonResponse(
          { message: "Description must be a string or null" },
          400,
        );
      }

      const description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;

      if (description && description.length > 500) {
        return jsonResponse(
          { message: "Description cannot exceed 500 characters" },
          400,
        );
      }

      updates.push({ column: "description", value: description });
    }

    if (Object.hasOwn(body, "status")) {
      const status =
        typeof body.status === "string"
          ? body.status.trim().toUpperCase()
          : "";

      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return jsonResponse(
          { message: "Status must be ACTIVE or INACTIVE" },
          400,
        );
      }

      updates.push({ column: "status", value: status });
    }

    let days:
      | ReturnType<typeof parseScheduleDays> & { ok: true }
      | undefined;

    if (Object.hasOwn(body, "days")) {
      const result = parseScheduleDays(body.days);

      if (!result.ok) {
        return jsonResponse({ message: result.message }, 400);
      }

      days = result;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT id
         FROM public.work_schedules
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [actor.organizationId, id],
      );

      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse({ message: "Schedule not found" }, 404);
      }

      if (days) {
        const assignmentCheck = await client.query(
          `SELECT 1
           FROM public.employee_schedule_assignments
           WHERE organization_id = $1
             AND schedule_id = $2
           LIMIT 1`,
          [actor.organizationId, id],
        );

        if (assignmentCheck.rows.length > 0) {
          await client.query("ROLLBACK");

          return jsonResponse(
            {
              message:
                "This schedule has assignments. Create a new schedule to change its weekday or time pattern so historical assignments remain meaningful.",
            },
            409,
          );
        }
      }

      if (updates.length > 0) {
        const setClause = updates
          .map((item, index) => `${item.column} = $${index + 1}`)
          .join(", ");

        const values = updates.map((item) => item.value);

        values.push(id, actor.organizationId);

        await client.query(
          `UPDATE public.work_schedules
           SET ${setClause},
               updated_at = NOW()
           WHERE id = $${values.length - 1}
             AND organization_id = $${values.length}`,
          values,
        );
      }

      if (days) {
        await client.query(
          `DELETE FROM public.work_schedule_days
           WHERE organization_id = $1
             AND schedule_id = $2`,
          [actor.organizationId, id],
        );

        for (const day of days.days) {
          await client.query(
            `INSERT INTO public.work_schedule_days (
               organization_id,
               schedule_id,
               day_of_week,
               start_time,
               end_time,
               break_minutes
             )
             VALUES ($1, $2, $3, $4::time, $5::time, $6)`,
            [
              actor.organizationId,
              id,
              day.dayOfWeek,
              day.startTime,
              day.endTime,
              day.breakMinutes,
            ],
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return jsonResponse(
          { message: "A schedule with this name already exists in your organization" },
          409,
        );
      }

      throw error;
    } finally {
      client.release();
    }

    const result = await pool.query(
      `${SCHEDULE_SELECT}
       WHERE s.organization_id = $1
         AND s.id = $2
       GROUP BY s.id
       LIMIT 1`,
      [actor.organizationId, id],
    );

    return jsonResponse({
      status: "ok",
      schedule: result.rows[0],
    });
  } catch (error) {
    console.error("Schedule update failed:", error);

    return jsonResponse(
      { message: "Unable to update this schedule right now" },
      500,
    );
  }
}