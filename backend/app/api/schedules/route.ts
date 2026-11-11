import { NextResponse } from "next/server";

import { pool } from "../../../lib/db";
import {
  getTenantPermissionActor,
} from "../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../lib/request-security";
import {
  canManageScheduleDefinitions,
  jsonResponse,
  isRecord,
  organizationIsActive,
  parseScheduleDays,
  SCHEDULE_SELECT,
} from "../../../lib/schedule-utils";

export async function GET(request: Request) {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to view schedule definitions" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const result = await pool.query(
      `${SCHEDULE_SELECT}
       WHERE s.organization_id = $1
         ${includeInactive ? "" : "AND s.status = 'ACTIVE'"}
       GROUP BY s.id
       ORDER BY LOWER(s.name), s.created_at`,
      [actor.organizationId],
    );

    return jsonResponse({
      status: "ok",
      schedules: result.rows,
    });
  } catch (error) {
    console.error("Schedule list failed:", error);

    return jsonResponse(
      { message: "Unable to load schedules right now" },
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

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to create schedules" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    if (!isRecord(body)) {
      return jsonResponse({ message: "Invalid request body" }, 400);
    }

    const unknownKeys = Object.keys(body).filter(
      (key) =>
        !["name", "description", "status", "days"].includes(key),
    );

    if (unknownKeys.length > 0) {
      return jsonResponse(
        { message: `Unsupported field: ${unknownKeys.join(", ")}` },
        400,
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > 100) {
      return jsonResponse(
        { message: "Schedule name is required and cannot exceed 100 characters" },
        400,
      );
    }

    let description: string | null = null;

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== "string") {
        return jsonResponse(
          { message: "Description must be a string or null" },
          400,
        );
      }

      description = body.description.trim() || null;

      if (description && description.length > 500) {
        return jsonResponse(
          { message: "Description cannot exceed 500 characters" },
          400,
        );
      }
    }

    const status =
      body.status === undefined
        ? "ACTIVE"
        : typeof body.status === "string"
          ? body.status.trim().toUpperCase()
          : "";

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return jsonResponse(
        { message: "Status must be ACTIVE or INACTIVE" },
        400,
      );
    }

    const dayResult = parseScheduleDays(body.days);

    if (!dayResult.ok) {
      return jsonResponse({ message: dayResult.message }, 400);
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const inserted = await client.query(
        `INSERT INTO public.work_schedules (
           organization_id,
           name,
           description,
           status,
           created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING
           id,
           organization_id AS "organizationId",
           name,
           description,
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [
          actor.organizationId,
          name,
          description,
          status,
          actor.userId,
        ],
      );

      const schedule = inserted.rows[0];

      for (const day of dayResult.days) {
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
            schedule.id,
            day.dayOfWeek,
            day.startTime,
            day.endTime,
            day.breakMinutes,
          ],
        );
      }

      await client.query("COMMIT");

      return jsonResponse(
        {
          status: "ok",
          schedule: {
            ...schedule,
            days: dayResult.days,
          },
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
          { message: "A schedule with this name already exists in your organization" },
          409,
        );
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Schedule creation failed:", error);

    return jsonResponse(
      { message: "Unable to create this schedule right now" },
      500,
    );
  }
}