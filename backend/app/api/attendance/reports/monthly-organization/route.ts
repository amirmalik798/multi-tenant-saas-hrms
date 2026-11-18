import { connection } from "next/server";
import { pool } from "../../../../../lib/db";
import { calculateDailyAttendance } from "../../../../../lib/attendance-calculations";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { jsonResponse, organizationIsActive } from "../../../../../lib/schedule-utils";
import {
  createMonthlyAttendancePdf,
  type DailyAttendanceRecord,
  type MonthlyDailyAttendanceReport,
} from "../../../../../lib/daily-attendance-pdf";

type ScopeMode = "ALL" | "HR_DIRECT_REPORTS";
type Metadata = { organizationName: string; timeZone: string; generatedBy: string };
type Row = Omit<DailyAttendanceRecord, "events"> & { workDate: string; events: unknown };

function parseArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; }
    catch { return []; }
  }
  return [];
}

function validMonth(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function ordinal(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}
function dateString(year: number, monthIndex: number, day = 1): string {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function safeFilenameMonth(value: string): string { return value.replace(/[^0-9-]/g, ""); }

export async function GET(request: Request) {
  await connection();
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required" }, 401);

    let scopeMode: ScopeMode;
    let reportScope: string;
    let scopeEmployeeId: string | null = null;
    if (actor.kind === "ORGANIZATION_ADMIN") {
      scopeMode = "ALL";
      reportScope = "Organization-wide";
    } else if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER") {
      scopeMode = "HR_DIRECT_REPORTS";
      reportScope = "HR Manager direct reports";
      scopeEmployeeId = actor.employeeId;
    } else {
      return jsonResponse({ message: "Only Organization Admins and HR Managers can generate monthly organization attendance reports" }, 403);
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse({ message: "This organization is not active" }, 403);
    }

    const url = new URL(request.url);
    const fromMonth = url.searchParams.get("fromMonth");
    const toMonth = url.searchParams.get("toMonth");
    if (!validMonth(fromMonth) || !validMonth(toMonth) || ordinal(fromMonth) > ordinal(toMonth)) {
      return jsonResponse({ message: "Choose valid From month and To month values, with From month on or before To month" }, 400);
    }
    const monthsCount = ordinal(toMonth) - ordinal(fromMonth) + 1;
    if (monthsCount > 24) {
      return jsonResponse({ message: "A monthly attendance PDF can cover up to 24 calendar months at a time" }, 400);
    }

    const [fromYear, fromMonthNumber] = fromMonth.split("-").map(Number);
    const [toYear, toMonthNumber] = toMonth.split("-").map(Number);
    const fromDate = dateString(fromYear, fromMonthNumber - 1);
    const toDate = dateString(toYear, toMonthNumber, 0);

    const metadataResult = await pool.query<Metadata>(
      `SELECT
         o.name AS "organizationName",
         COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', actor_employee.first_name, actor_employee.last_name)), ''),
           NULLIF(actor_user.email, ''),
           'Authenticated manager'
         ) AS "generatedBy"
       FROM public.organizations AS o
       LEFT JOIN public.organization_settings AS os ON os.organization_id = o.id
       LEFT JOIN public.users AS actor_user ON actor_user.id = $2::uuid AND actor_user.organization_id = o.id
       LEFT JOIN public.employees AS actor_employee ON actor_employee.id = $3::uuid AND actor_employee.organization_id = o.id
       WHERE o.id = $1::uuid LIMIT 1`,
      [actor.organizationId, actor.userId, actor.kind === "ORGANIZATION_USER" ? actor.employeeId : null],
    );
    const metadata = metadataResult.rows[0];
    if (!metadata) return jsonResponse({ message: "Organization details could not be loaded" }, 404);
    try { new Intl.DateTimeFormat("en-GB", { timeZone: metadata.timeZone }); }
    catch { return jsonResponse({ message: "The organization's configured time zone is invalid" }, 500); }

    // This is intentionally bounded by both date range and result count. Every
    // month is grouped after the query, so all days for month N precede month N+1.
    const reportResult = await pool.query<Row>(
      `WITH report_days AS (
         SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS work_date
       ),
       scoped_employees AS (
         SELECT
           e.id AS employee_id,
           e.employee_code,
           e.first_name,
           e.last_name,
           e.department_id,
           d.name AS department_name,
           e.employment_status
         FROM public.employees AS e
         LEFT JOIN public.departments AS d ON d.id = e.department_id AND d.organization_id = e.organization_id
         LEFT JOIN public.roles AS workforce_role ON workforce_role.id = e.workforce_role_id AND workforce_role.organization_id = e.organization_id
         LEFT JOIN LATERAL (
           SELECT linked_role.name
           FROM public.users AS workforce_account
           JOIN public.roles AS linked_role
             ON linked_role.id = workforce_account.role_id
            AND linked_role.organization_id = workforce_account.organization_id
            AND linked_role.scope = 'ORGANIZATION'
           WHERE workforce_account.employee_id = e.id
             AND workforce_account.organization_id = e.organization_id
             AND workforce_account.account_scope = 'ORGANIZATION'
           ORDER BY CASE WHEN workforce_account.status = 'ACTIVE' THEN 0 ELSE 1 END,
                    workforce_account.updated_at DESC NULLS LAST,
                    workforce_account.created_at DESC NULLS LAST,
                    workforce_account.id
           LIMIT 1
         ) AS account_role ON TRUE
         WHERE e.organization_id = $1::uuid
           AND e.employment_status = 'ACTIVE'
           AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g')
             IN ('EMPLOYEE', 'DEPARTMENT_MANAGER', 'HR_MANAGER')
           AND NOT EXISTS (
             SELECT 1
             FROM public.users AS admin_account
             JOIN public.roles AS linked_role ON linked_role.id = admin_account.role_id
             WHERE admin_account.employee_id = e.id
               AND admin_account.organization_id = e.organization_id
               AND admin_account.account_scope = 'ORGANIZATION'
               AND regexp_replace(UPPER(linked_role.name), '[^A-Z0-9]+', '_', 'g')
                 IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR', 'ORG_ADMINISTRATOR')
           )
           AND (
             $4::text = 'ALL'
             OR (
               $4::text = 'HR_DIRECT_REPORTS'
               AND e.id <> $5::uuid
               AND regexp_replace(UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')), '[^A-Z0-9]+', '_', 'g')
                 IN ('EMPLOYEE', 'DEPARTMENT_MANAGER')
             )
           )
       ),
       effective_events AS (
         SELECT ae.id::text AS source_id, ae.employee_id, ae.work_date, ae.event_type,
                COALESCE(c.requested_at, ae.recorded_at) AS recorded_at, ae.time_zone,
                CASE WHEN c.id IS NOT NULL THEN 'APPROVED_CORRECTION' ELSE 'ATTENDANCE_EVENT' END AS source
         FROM public.attendance_events AS ae
         JOIN scoped_employees AS e ON e.employee_id = ae.employee_id
         LEFT JOIN LATERAL (
           SELECT cr.id, cr.requested_at
           FROM public.attendance_correction_requests AS cr
           WHERE cr.organization_id = ae.organization_id
             AND cr.employee_id = ae.employee_id
             AND cr.original_event_id = ae.id
             AND cr.status = 'APPROVED'
           ORDER BY cr.decision_at DESC, cr.id DESC LIMIT 1
         ) AS c ON TRUE
         WHERE ae.organization_id = $1::uuid
           AND ae.work_date BETWEEN $2::date AND $3::date
         UNION ALL
         SELECT ('CORRECTION:' || cr.id::text), cr.employee_id, cr.work_date, cr.event_type,
                cr.requested_at, cr.time_zone, 'APPROVED_MISSING_PUNCH'
         FROM public.attendance_correction_requests AS cr
         JOIN scoped_employees AS e ON e.employee_id = cr.employee_id
         WHERE cr.organization_id = $1::uuid
           AND cr.original_event_id IS NULL
           AND cr.status = 'APPROVED'
           AND cr.work_date BETWEEN $2::date AND $3::date
       ),
       event_summary AS (
         SELECT employee_id, work_date,
                MIN(recorded_at) FILTER (WHERE event_type = 'CLOCK_IN') AS first_clock_in,
                MAX(recorded_at) FILTER (WHERE event_type = 'CLOCK_OUT') AS last_clock_out,
                COUNT(*)::int AS event_count,
                COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
                  'id', source_id, 'eventType', event_type, 'recordedAt', recorded_at,
                  'timeZone', time_zone, 'source', source
                ) ORDER BY recorded_at, source_id), '[]'::jsonb) AS events
         FROM effective_events
         GROUP BY employee_id, work_date
       )
       SELECT
         e.employee_id AS "employeeId",
         e.employee_code AS "employeeCode",
         e.first_name AS "firstName",
         e.last_name AS "lastName",
         e.department_id AS "departmentId",
         e.department_name AS "departmentName",
         e.employment_status AS "employmentStatus",
         report_days.work_date::text AS "workDate",
         schedule.schedule_name AS "scheduleName",
         schedule.time_zone AS "timeZone",
         schedule.expected_start AS "expectedStart",
         schedule.expected_end AS "expectedEnd",
         schedule.break_minutes AS "scheduledBreakMinutes",
         events.first_clock_in AS "firstClockIn",
         events.last_clock_out AS "lastClockOut",
         COALESCE(events.event_count, 0)::int AS "eventCount",
         COALESCE(events.events, '[]'::jsonb) AS events,
         0::int AS "openExceptionCount",
         '[]'::jsonb AS exceptions,
         NULL::text AS "timesheetStatus",
         NULL::uuid AS "timesheetId",
         COALESCE(overtime.approved_minutes, 0)::int AS "approvedOvertimeMinutes"
       FROM report_days
       CROSS JOIN scoped_employees AS e
       LEFT JOIN LATERAL (
         SELECT
           s.name AS schedule_name,
           COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone,
           ((report_days.work_date + sd.start_time) AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')) AS expected_start,
           ((report_days.work_date + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END + sd.end_time)
             AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')) AS expected_end,
           sd.break_minutes
         FROM public.employee_schedule_assignments AS a
         JOIN public.work_schedules AS s ON s.id = a.schedule_id AND s.organization_id = a.organization_id
         JOIN public.work_schedule_days AS sd ON sd.schedule_id = s.id AND sd.organization_id = s.organization_id
         LEFT JOIN public.organization_settings AS os ON os.organization_id = $1::uuid
         WHERE a.organization_id = $1::uuid
           AND a.employee_id = e.employee_id
           AND a.effective_from <= report_days.work_date
           AND (a.effective_to IS NULL OR a.effective_to >= report_days.work_date)
           AND sd.day_of_week = EXTRACT(ISODOW FROM report_days.work_date)::int
         ORDER BY a.effective_from DESC, a.created_at DESC
         LIMIT 1
       ) AS schedule ON TRUE
       LEFT JOIN event_summary AS events
         ON events.employee_id = e.employee_id AND events.work_date = report_days.work_date
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ot.approved_minutes), 0)::int AS approved_minutes
         FROM public.attendance_overtime_requests AS ot
         WHERE ot.organization_id = $1::uuid
           AND ot.employee_id = e.employee_id
           AND ot.work_date = report_days.work_date
           AND ot.request_type = 'PREAUTHORIZATION'
           AND ot.status = 'APPROVED'
       ) AS overtime ON TRUE
       ORDER BY report_days.work_date, e.department_name NULLS LAST, e.last_name, e.first_name
       LIMIT 120001`,
      [actor.organizationId, fromDate, toDate, scopeMode, scopeEmployeeId],
    );

    if (reportResult.rows.length > 120000) {
      return jsonResponse({ message: "This report exceeds the 120,000 daily workforce-row limit. Reduce the selected month range." }, 413);
    }
    if (reportResult.rows.length === 0) {
      return jsonResponse({ message: "No active workforce members are available in your reporting scope for this period" }, 404);
    }

    const generatedAt = new Date();
    const dailyRows = new Map<string, DailyAttendanceRecord[]>();
    for (const row of reportResult.rows) {
      const { workDate, events: eventSource, ...record } = row;
      const date = String(workDate).slice(0, 10);
      const events = parseArray<NonNullable<DailyAttendanceRecord["events"]>[number]>(eventSource);
      const calculated = calculateDailyAttendance({
        events,
        expectedStart: row.expectedStart,
        expectedEnd: row.expectedEnd,
        scheduledBreakMinutes: row.scheduledBreakMinutes,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes,
        asOf: generatedAt,
      });
      const rowsForDay = dailyRows.get(date) || [];
      rowsForDay.push({ ...record, events, ...calculated });
      dailyRows.set(date, rowsForDay);
    }

    const monthReports = Array.from({ length: monthsCount }, (_, index) => {
      const ordinalMonth = ordinal(fromMonth) + index;
      const year = Math.floor(ordinalMonth / 12);
      const monthIndex = ordinalMonth % 12;
      const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const days = Array.from({ length: daysInMonth }, (_, dayIndex) => {
        const reportDate = `${month}-${String(dayIndex + 1).padStart(2, "0")}`;
        return { reportDate, rows: dailyRows.get(reportDate) || [] };
      });
      return { month, days };
    });

    // A daily report uses ten employees per page. Keep the PDF workload
    // bounded independently from the SQL result-row limit.
    const estimatedPdfPages = monthReports.reduce(
      (total, month) => total + month.days.reduce(
        (dayTotal, day) => dayTotal + Math.max(1, Math.ceil(day.rows.length / 10)),
        0,
      ),
      0,
    );
    if (estimatedPdfPages > 5000) {
      return jsonResponse({
        message: "This selection would produce more than 5,000 PDF pages. Reduce the month range or reporting scope.",
      }, 413);
    }

    const report: MonthlyDailyAttendanceReport = {
      organizationName: metadata.organizationName,
      fromMonth,
      toMonth,
      timeZone: metadata.timeZone,
      reportScope,
      generatedAt,
      generatedBy: metadata.generatedBy,
      months: monthReports,
    };
    const pdf = createMonthlyAttendancePdf(report);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="monthly-attendance-${safeFilenameMonth(fromMonth)}-to-${safeFilenameMonth(toMonth)}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Monthly organization attendance PDF failed:", error);
    return jsonResponse({ message: "Unable to generate the monthly organization attendance report right now" }, 500);
  }
}
