import { connection } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse, organizationIsActive } from "../../../../lib/schedule-utils";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
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

    const params = new URL(request.url).searchParams;
    const fromDate = params.get("fromDate") || "";
    const toDate = params.get("toDate") || "";
    if (!DATE_PATTERN.test(fromDate) || !DATE_PATTERN.test(toDate) || fromDate > toDate) {
      return jsonResponse({ message: "Provide valid fromDate and toDate values in YYYY-MM-DD format" }, 400);
    }
    const span = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000;
    if (!Number.isFinite(span) || span > 60) {
      return jsonResponse({ message: "Choose a date range of 61 days or fewer" }, 400);
    }

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";
    const scopeEmployeeId = isDepartmentManager ? actor.employeeId : null;

    // Discover real, completed clock-outs that exceed both the scheduled end
    // and any overtime approved before that scheduled end. Existing reviewed
    // cases are never reopened by a refresh.
    await pool.query(
      `WITH work_dates AS (
         SELECT generate_series($2::date, $3::date, interval '1 day')::date AS work_date
       ),
       assigned_shifts AS (
         SELECT
           e.id AS employee_id,
           e.organization_id,
           wd.work_date,
           d.name AS department_name,
           e.first_name,
           e.last_name,
           e.employee_code,
           (
             (wd.work_date
               + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END
               + sd.end_time)
             AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')
           ) AS scheduled_end
         FROM work_dates wd
         JOIN public.employees e
           ON e.organization_id = $1::uuid
          AND e.employment_status = 'ACTIVE'
         JOIN public.roles wr
           ON wr.id = e.workforce_role_id
          AND wr.organization_id = e.organization_id
          AND wr.name = 'EMPLOYEE'
         LEFT JOIN public.departments d
           ON d.id = e.department_id AND d.organization_id = e.organization_id
         LEFT JOIN public.organization_settings os
           ON os.organization_id = e.organization_id
         JOIN public.employee_schedule_assignments a
           ON a.organization_id = e.organization_id
          AND a.employee_id = e.id
          AND a.effective_from <= wd.work_date
          AND (a.effective_to IS NULL OR a.effective_to >= wd.work_date)
         JOIN public.work_schedules s
           ON s.id = a.schedule_id AND s.organization_id = a.organization_id
          AND s.status = 'ACTIVE'
         JOIN public.work_schedule_days sd
           ON sd.schedule_id = s.id
          AND sd.organization_id = s.organization_id
          AND sd.day_of_week = EXTRACT(ISODOW FROM wd.work_date)::int
         WHERE (
           $4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM public.departments md
             WHERE md.organization_id = e.organization_id
               AND md.id = e.department_id
               AND md.manager_id = $4::uuid
           )
         )
       ),
       event_summary AS (
         SELECT
           ae.organization_id, ae.employee_id, ae.work_date,
           MAX(ae.recorded_at) FILTER (WHERE ae.event_type = 'CLOCK_OUT') AS actual_clock_out,
           (ARRAY_AGG(ae.event_type ORDER BY ae.recorded_at DESC, ae.id DESC))[1] AS latest_event_type
         FROM public.attendance_events ae
         WHERE ae.organization_id = $1::uuid
           AND ae.work_date BETWEEN $2::date AND $3::date
         GROUP BY ae.organization_id, ae.employee_id, ae.work_date
       ),
       candidates AS (
         SELECT
           sh.organization_id, sh.employee_id, sh.work_date, sh.scheduled_end,
           ev.actual_clock_out,
           GREATEST(
             0,
             FLOOR(EXTRACT(EPOCH FROM (ev.actual_clock_out - sh.scheduled_end)) / 60)::int
             - COALESCE(ot.approved_minutes, 0)
           ) AS excess_minutes
         FROM assigned_shifts sh
         JOIN event_summary ev
           ON ev.organization_id = sh.organization_id
          AND ev.employee_id = sh.employee_id
          AND ev.work_date = sh.work_date
          AND ev.latest_event_type = 'CLOCK_OUT'
          AND ev.actual_clock_out > sh.scheduled_end
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(o.approved_minutes), 0)::int AS approved_minutes
           FROM public.attendance_overtime_requests o
           WHERE o.organization_id = sh.organization_id
             AND o.employee_id = sh.employee_id
             AND o.work_date = sh.work_date
             AND o.request_type = 'PREAUTHORIZATION'
             AND o.status = 'APPROVED'
             AND o.approved_minutes IS NOT NULL
             AND o.requested_at <= sh.scheduled_end
             AND o.decision_at <= sh.scheduled_end
         ) ot ON TRUE
       )
       INSERT INTO public.attendance_excess_overtime_reviews
         (organization_id, employee_id, work_date, scheduled_end, actual_clock_out,
          excess_minutes, status, created_at, updated_at)
       SELECT organization_id, employee_id, work_date, scheduled_end, actual_clock_out,
              excess_minutes, 'OPEN', NOW(), NOW()
       FROM candidates
       WHERE excess_minutes > 0
       ON CONFLICT (organization_id, employee_id, work_date)
       DO UPDATE SET
         scheduled_end = EXCLUDED.scheduled_end,
         actual_clock_out = EXCLUDED.actual_clock_out,
         excess_minutes = EXCLUDED.excess_minutes,
         updated_at = NOW()
       WHERE attendance_excess_overtime_reviews.status = 'OPEN'`,
      [actor.organizationId, fromDate, toDate, scopeEmployeeId],
    );

    const result = await pool.query(
      `SELECT
         r.id, r.employee_id AS "employeeId", r.work_date::text AS "workDate",
         r.scheduled_end AS "scheduledEnd", r.actual_clock_out AS "actualClockOut",
         r.excess_minutes AS "excessMinutes", r.status,
         r.reviewer_note AS "reviewerNote", r.reviewed_at AS "reviewedAt",
         e.employee_code AS "employeeCode", e.first_name AS "firstName",
         e.last_name AS "lastName", d.name AS "departmentName"
       FROM public.attendance_excess_overtime_reviews r
       JOIN public.employees e
         ON e.id = r.employee_id AND e.organization_id = r.organization_id
       LEFT JOIN public.departments d
         ON d.id = e.department_id AND d.organization_id = e.organization_id
       WHERE r.organization_id = $1::uuid
         AND r.work_date BETWEEN $2::date AND $3::date
         AND ($4::uuid IS NULL OR EXISTS (
           SELECT 1 FROM public.departments md
           WHERE md.organization_id = e.organization_id
             AND md.id = e.department_id
             AND md.manager_id = $4::uuid
         ))
       ORDER BY CASE WHEN r.status = 'OPEN' THEN 0 ELSE 1 END,
                r.work_date DESC, e.last_name, e.first_name
       LIMIT 500`,
      [actor.organizationId, fromDate, toDate, scopeEmployeeId],
    );

    return jsonResponse({ status: "ok", cases: result.rows });
  } catch (error) {
    console.error("Excess overtime review list failed:", error);
    return jsonResponse({ message: "Unable to load excess overtime review cases" }, 500);
  }
}
