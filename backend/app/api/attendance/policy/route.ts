import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import {
  canManageScheduleDefinitions,
  isRecord,
  jsonResponse,
  organizationIsActive,
} from "../../../../lib/schedule-utils";

const DEFAULT_POLICY = {
  lateGraceMinutes: 5,
  earlyDepartureGraceMinutes: 5,
  earlyClockInWindowMinutes: null as number | null,
  absenceAfterMinutes: 120,
};

async function readPolicy(organizationId: string) {
  const result = await pool.query(
    `SELECT
       os.time_zone AS "timeZone",
       os.week_starts_on AS "weekStartsOn",
       os.working_days AS "workingDays",
       COALESCE(p.late_grace_minutes, $2) AS "lateGraceMinutes",
       COALESCE(p.early_departure_grace_minutes, $3)
         AS "earlyDepartureGraceMinutes",
       COALESCE(p.absence_after_minutes, $4) AS "absenceAfterMinutes",
       COALESCE(p.early_clock_in_window_minutes, $5)
         AS "earlyClockInWindowMinutes",
       p.updated_at AS "updatedAt"
     FROM public.organization_settings AS os
     LEFT JOIN public.attendance_policy_settings AS p
       ON p.organization_id = os.organization_id
     WHERE os.organization_id = $1
     LIMIT 1`,
    [
      organizationId,
      DEFAULT_POLICY.lateGraceMinutes,
      DEFAULT_POLICY.earlyDepartureGraceMinutes,
      DEFAULT_POLICY.absenceAfterMinutes,
      DEFAULT_POLICY.earlyClockInWindowMinutes,
    ],
  );

  return result.rows[0] ?? null;
}

export async function GET() {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to view attendance policy settings" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const policy = await readPolicy(actor.organizationId);

    if (!policy) {
      return jsonResponse(
        { message: "Organization settings were not found" },
        404,
      );
    }

    return jsonResponse({
      status: "ok",
      policy,
    });
  } catch (error) {
    console.error("Attendance policy read failed:", error);

    return jsonResponse(
      { message: "Unable to load attendance policy settings" },
      500,
    );
  }
}

export async function PATCH(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) return originError;

  const parsed = await parseJsonRequestBody(request);

  if (!parsed.ok) return parsed.response;

  const body = parsed.body;

  if (!isRecord(body)) {
    return jsonResponse({ message: "Invalid request body" }, 400);
  }

  const allowedKeys = new Set([
    "lateGraceMinutes",
    "earlyDepartureGraceMinutes",
    "earlyClockInWindowMinutes",
    "absenceAfterMinutes",
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

  if (Object.keys(body).length === 0) {
    return jsonResponse(
      { message: "Provide at least one policy setting to update" },
      400,
    );
  }

  const values: Record<string, number | null> = {};

  for (const [key, value] of Object.entries(body)) {
    // null explicitly disables the optional early clock-in restriction.
    if (key === "earlyClockInWindowMinutes" && value === null) {
      values[key] = null;
      continue;
    }

    if (typeof value !== "number" || !Number.isInteger(value)) {
      return jsonResponse(
        { message: `${key} must be an integer${key === "earlyClockInWindowMinutes" ? " or null to disable the restriction" : ""}` },
        400,
      );
    }

    const maximum = key === "absenceAfterMinutes" ? 720 : 180;

    if (value < 0 || value > maximum) {
      return jsonResponse(
        { message: `${key} must be between 0 and ${maximum}` },
        400,
      );
    }

    values[key] = value;
  }

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to update attendance policy settings" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    if (!(await readPolicy(actor.organizationId))) {
      return jsonResponse(
        { message: "Organization settings were not found" },
        404,
      );
    }

    const current = await pool.query<{
      late_grace_minutes: number;
      early_departure_grace_minutes: number;
      early_clock_in_window_minutes: number | null;
      absence_after_minutes: number;
    }>(
      `SELECT
         late_grace_minutes,
         early_departure_grace_minutes,
         early_clock_in_window_minutes,
         absence_after_minutes
       FROM public.attendance_policy_settings
       WHERE organization_id = $1`,
      [actor.organizationId],
    );

    const before = current.rows[0] ?? {
      late_grace_minutes: DEFAULT_POLICY.lateGraceMinutes,
      early_departure_grace_minutes:
        DEFAULT_POLICY.earlyDepartureGraceMinutes,
      early_clock_in_window_minutes: DEFAULT_POLICY.earlyClockInWindowMinutes,
      absence_after_minutes: DEFAULT_POLICY.absenceAfterMinutes,
    };

    const late =
      values.lateGraceMinutes ?? before.late_grace_minutes;

    const early =
      values.earlyDepartureGraceMinutes ??
      before.early_departure_grace_minutes;

    const earlyClockIn = Object.prototype.hasOwnProperty.call(
      values,
      "earlyClockInWindowMinutes",
    )
      ? values.earlyClockInWindowMinutes
      : before.early_clock_in_window_minutes;

    const absence =
      values.absenceAfterMinutes ?? before.absence_after_minutes;

    await pool.query(
      `INSERT INTO public.attendance_policy_settings (
         organization_id,
         late_grace_minutes,
         early_departure_grace_minutes,
         early_clock_in_window_minutes,
         absence_after_minutes,
         updated_by_user_id,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (organization_id)
       DO UPDATE SET
         late_grace_minutes = EXCLUDED.late_grace_minutes,
         early_departure_grace_minutes =
           EXCLUDED.early_departure_grace_minutes,
         early_clock_in_window_minutes = EXCLUDED.early_clock_in_window_minutes,
         absence_after_minutes = EXCLUDED.absence_after_minutes,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()`,
      [actor.organizationId, late, early, earlyClockIn, absence, actor.userId],
    );

    const policy = await readPolicy(actor.organizationId);

    return jsonResponse({
      status: "ok",
      message: "Attendance policy settings updated",
      policy,
    });
  } catch (error) {
    console.error("Attendance policy update failed:", error);

    return jsonResponse(
      { message: "Unable to update attendance policy settings" },
      500,
    );
  }
}