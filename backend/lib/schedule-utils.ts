import { NextResponse } from "next/server";

import type { TenantPermissionActor } from "./permissions";

export type ScheduleDayInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

export type ScheduleDayResult =
  | { ok: true; days: ScheduleDayInput[] }
  | { ok: false; message: string };

export function jsonResponse(
  body: unknown,
  init: number | ResponseInit = 200,
) {
  const responseInit =
    typeof init === "number" ? { status: init } : init;

  const headers = new Headers(responseInit.headers);

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return NextResponse.json(body, {
    ...responseInit,
    headers,
  });
}

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function canManageScheduleDefinitions(
  actor: TenantPermissionActor,
): boolean {
  return (
    actor.kind === "ORGANIZATION_ADMIN" ||
    (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "HR_MANAGER"
    )
  );
}

export function parseScheduleDays(
  value: unknown,
): ScheduleDayResult {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) {
    return {
      ok: false,
      message: "Provide between 1 and 7 scheduled weekdays",
    };
  }

  const days: ScheduleDayInput[] = [];
  const seenDays = new Set<number>();
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  for (const item of value) {
    if (!isRecord(item)) {
      return {
        ok: false,
        message: "Each schedule day must be an object",
      };
    }

    const { dayOfWeek, startTime, endTime, breakMinutes } = item;

    if (
      typeof dayOfWeek !== "number" ||
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 1 ||
      dayOfWeek > 7
    ) {
      return {
        ok: false,
        message: "dayOfWeek must be an integer from 1 (Monday) to 7 (Sunday)",
      };
    }

    if (seenDays.has(dayOfWeek)) {
      return {
        ok: false,
        message: `Weekday ${dayOfWeek} was provided more than once`,
      };
    }

    if (
      typeof startTime !== "string" ||
      !timePattern.test(startTime) ||
      typeof endTime !== "string" ||
      !timePattern.test(endTime)
    ) {
      return {
        ok: false,
        message: "Start and end times must use HH:MM in 24-hour format",
      };
    }

    if (startTime === endTime) {
      return {
        ok: false,
        message: "Start and end times cannot be identical",
      };
    }

    if (
      typeof breakMinutes !== "number" ||
      !Number.isInteger(breakMinutes) ||
      breakMinutes < 0 ||
      breakMinutes > 1439
    ) {
      return {
        ok: false,
        message: "breakMinutes must be an integer from 0 to 1439",
      };
    }

    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    const startTotal = startHour * 60 + startMinute;
    let endTotal = endHour * 60 + endMinute;

    // An end time earlier than the start time represents an overnight shift.
    if (endTotal <= startTotal) {
      endTotal += 24 * 60;
    }

    if (breakMinutes >= endTotal - startTotal) {
      return {
        ok: false,
        message: `The break must be shorter than the shift on weekday ${dayOfWeek}`,
      };
    }

    seenDays.add(dayOfWeek);

    days.push({
      dayOfWeek,
      startTime,
      endTime,
      breakMinutes,
    });
  }

  return {
    ok: true,
    days: days.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
  };
}

export function isValidDateString(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export const SCHEDULE_SELECT = `
  SELECT
    s.id,
    s.organization_id AS "organizationId",
    s.name,
    s.description,
    s.status,
    s.created_at AS "createdAt",
    s.updated_at AS "updatedAt",
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', d.day_of_week,
          'startTime', TO_CHAR(d.start_time, 'HH24:MI'),
          'endTime', TO_CHAR(d.end_time, 'HH24:MI'),
          'breakMinutes', d.break_minutes
        )
        ORDER BY d.day_of_week
      ) FILTER (WHERE d.day_of_week IS NOT NULL),
      '[]'::jsonb
    ) AS days
  FROM public.work_schedules AS s
  LEFT JOIN public.work_schedule_days AS d
    ON d.organization_id = s.organization_id
   AND d.schedule_id = s.id
`;

export async function organizationIsActive(
  queryable: {
    query: (
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Array<{ status: string }> }>;
  },
  organizationId: string,
): Promise<boolean> {
  const result = await queryable.query(
    `SELECT status
     FROM public.organizations
     WHERE id = $1
     LIMIT 1`,
    [organizationId],
  );

  return result.rows[0]?.status === "ACTIVE";
}