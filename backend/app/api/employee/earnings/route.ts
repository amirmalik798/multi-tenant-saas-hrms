import { connection, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { organizationIsActive } from "../../../../lib/schedule-utils";
import { calculateDailyAttendance, type AttendanceCalculationEvent } from "../../../../lib/attendance-calculations";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validMonth(value: string | null): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

type EarningsDayRow = {
  workDate: string;
  scheduleName: string | null;
  expectedStart: Date | string | null;
  expectedEnd: Date | string | null;
  scheduledBreakMinutes: number | string | null;
  events: AttendanceCalculationEvent[] | string | null;
  approvedOvertimeMinutes: number | string | null;
  hourlyRate: string | number | null;
  overtimeRate: string | number | null;
  currencyCode: string | null;
  employeeName: string;
  timeZone: string;
  isPaidLeave: boolean;
  isPaidHoliday: boolean;
  excessOvertimeReviewStatus: string | null;
};

function asEvents(value: EarningsDayRow["events"]): AttendanceCalculationEvent[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as AttendanceCalculationEvent[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function amountForMinutes(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (
      actor.kind !== "ORGANIZATION_USER" ||
      (actor.roleName !== "EMPLOYEE" && actor.roleName !== "DEPARTMENT_MANAGER") ||
      !actor.employeeId
    ) {
      return json({ message: "This endpoint is only available to an authenticated workforce member" }, 403);
    }
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);

    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (!validMonth(month)) return json({ message: "Provide month in YYYY-MM format" }, 400);
    const fromDate = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const toDate = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

    const result = await pool.query<EarningsDayRow>(
      `WITH calendar_days AS (
         SELECT generate_series($3::date, $4::date, interval '1 day')::date AS work_date
       ),
       employee_context AS (
         SELECT e.id, e.organization_id,
                trim(concat_ws(' ', e.first_name, e.last_name)) AS employee_name,
                COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone
         FROM public.employees e
         JOIN public.organizations o ON o.id = e.organization_id AND o.status = 'ACTIVE'
         LEFT JOIN public.organization_settings os ON os.organization_id = e.organization_id
         WHERE e.id = $1::uuid AND e.organization_id = $2::uuid
           AND e.employment_status = 'ACTIVE'
       ),
       scheduled_days AS (
         SELECT DISTINCT ON (cd.work_date)
           cd.work_date,
           s.name AS schedule_name,
           ((cd.work_date + sd.start_time) AT TIME ZONE ec.time_zone) AS expected_start,
           (((cd.work_date + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END + sd.end_time)
              AT TIME ZONE ec.time_zone)) AS expected_end,
           sd.break_minutes
         FROM calendar_days cd
         CROSS JOIN employee_context ec
         JOIN public.employee_schedule_assignments a
           ON a.organization_id = ec.organization_id AND a.employee_id = ec.id
          AND a.effective_from <= cd.work_date
          AND (a.effective_to IS NULL OR a.effective_to >= cd.work_date)
         JOIN public.work_schedules s
           ON s.organization_id = a.organization_id AND s.id = a.schedule_id
         JOIN public.work_schedule_days sd
           ON sd.organization_id = a.organization_id AND sd.schedule_id = a.schedule_id
          AND sd.day_of_week = EXTRACT(ISODOW FROM cd.work_date)::int
         ORDER BY cd.work_date, a.effective_from DESC, a.created_at DESC
       ),
       effective_events AS (
         SELECT ae.work_date, ae.event_type, COALESCE(c.requested_at, ae.recorded_at) AS recorded_at,
                ae.id::text AS source_id
         FROM public.attendance_events ae
         CROSS JOIN employee_context ec
         LEFT JOIN LATERAL (
           SELECT cr.id, cr.requested_at
           FROM public.attendance_correction_requests cr
           WHERE cr.organization_id = ae.organization_id AND cr.employee_id = ae.employee_id
             AND cr.original_event_id = ae.id AND cr.status = 'APPROVED'
           ORDER BY cr.decision_at DESC LIMIT 1
         ) c ON TRUE
         WHERE ae.organization_id = $2::uuid AND ae.employee_id = $1::uuid
           AND ae.work_date BETWEEN $3::date AND $4::date
         UNION ALL
         SELECT cr.work_date, cr.event_type, cr.requested_at, ('CORRECTION:' || cr.id::text)
         FROM public.attendance_correction_requests cr
         WHERE cr.organization_id = $2::uuid AND cr.employee_id = $1::uuid
           AND cr.original_event_id IS NULL AND cr.status = 'APPROVED'
           AND cr.work_date BETWEEN $3::date AND $4::date
       ),
       event_days AS (
         SELECT work_date,
                jsonb_agg(jsonb_build_object('id', source_id, 'eventType', event_type, 'recordedAt', recorded_at)
                          ORDER BY recorded_at, source_id) AS events
         FROM effective_events GROUP BY work_date
       ),
       approved_overtime AS (
         SELECT work_date, LEAST(1440, SUM(approved_minutes))::int AS approved_minutes
         FROM public.attendance_overtime_requests
         WHERE organization_id = $2::uuid AND employee_id = $1::uuid
           AND status = 'APPROVED' AND request_type = 'PREAUTHORIZATION'
           AND work_date BETWEEN $3::date AND $4::date
         GROUP BY work_date
       )
       SELECT cd.work_date::text AS "workDate",
              sd.schedule_name AS "scheduleName",
              sd.expected_start AS "expectedStart",
              sd.expected_end AS "expectedEnd",
              sd.break_minutes AS "scheduledBreakMinutes",
              COALESCE(ed.events, '[]'::jsonb) AS events,
              COALESCE(ot.approved_minutes, 0)::int AS "approvedOvertimeMinutes",
              rate.hourly_rate::text AS "hourlyRate",
              rate.overtime_rate::text AS "overtimeRate",
              rate.currency_code AS "currencyCode",
              ec.employee_name AS "employeeName",
              ec.time_zone AS "timeZone",
              EXISTS (SELECT 1 FROM public.leave_requests lr WHERE lr.organization_id = ec.organization_id AND lr.employee_id = ec.id AND lr.status = 'APPROVED' AND lr.is_paid = TRUE AND cd.work_date <= (now() AT TIME ZONE ec.time_zone)::date AND cd.work_date BETWEEN lr.start_date AND lr.end_date) AS "isPaidLeave",
              EXISTS (SELECT 1 FROM public.public_holidays ph WHERE ph.organization_id = ec.organization_id AND ph.holiday_date = cd.work_date AND ph.is_paid = TRUE AND cd.work_date <= (now() AT TIME ZONE ec.time_zone)::date) AS "isPaidHoliday",
              excess_review.status AS "excessOvertimeReviewStatus"
       FROM calendar_days cd
       CROSS JOIN employee_context ec
       LEFT JOIN scheduled_days sd ON sd.work_date = cd.work_date
       LEFT JOIN event_days ed ON ed.work_date = cd.work_date
       LEFT JOIN approved_overtime ot ON ot.work_date = cd.work_date
       LEFT JOIN public.attendance_excess_overtime_reviews excess_review
         ON excess_review.organization_id = ec.organization_id
        AND excess_review.employee_id = ec.id
        AND excess_review.work_date = cd.work_date
       LEFT JOIN LATERAL (
         SELECT pr.hourly_rate, pr.overtime_rate, pr.currency_code
         FROM public.employee_pay_rates pr
         WHERE pr.organization_id = ec.organization_id AND pr.employee_id = ec.id
           AND pr.effective_from <= cd.work_date
           AND (pr.effective_to IS NULL OR pr.effective_to >= cd.work_date)
         ORDER BY pr.effective_from DESC, pr.created_at DESC
         LIMIT 1
       ) rate ON TRUE
       ORDER BY cd.work_date`,
      [actor.employeeId, actor.organizationId, fromDate, toDate],
    );

    if (result.rows.length === 0) return json({ message: "Active employee profile not found" }, 404);

    const days = result.rows.map((row) => {
      const hourlyRate = row.hourlyRate === null ? null : Number(row.hourlyRate);
      const overtimeRate = row.overtimeRate === null ? null : Number(row.overtimeRate);
      const calculation = calculateDailyAttendance({
        events: asEvents(row.events),
        expectedStart: row.expectedStart,
        expectedEnd: row.expectedEnd,
        scheduledBreakMinutes: row.scheduledBreakMinutes,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes,
      });
      const startMs = row.expectedStart == null ? NaN : row.expectedStart instanceof Date ? row.expectedStart.getTime() : Date.parse(row.expectedStart);
      const endMs = row.expectedEnd == null ? NaN : row.expectedEnd instanceof Date ? row.expectedEnd.getTime() : Date.parse(row.expectedEnd);
      const scheduledMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.max(0, Math.floor((endMs - startMs) / 60000) - Number(row.scheduledBreakMinutes ?? 0))
        : 0;
      const paidHolidayMinutes = calculation.workedMinutes === 0 && asEvents(row.events).length === 0 && scheduledMinutes > 0 && row.isPaidHoliday ? scheduledMinutes : 0;
      const paidLeaveMinutes = calculation.workedMinutes === 0 && asEvents(row.events).length === 0 && scheduledMinutes > 0 && !row.isPaidHoliday && row.isPaidLeave ? scheduledMinutes : 0;
      const payableRegularMinutes = calculation.regularWorkedMinutes + paidLeaveMinutes + paidHolidayMinutes;
      const payableMinutes = payableRegularMinutes + calculation.payableOvertimeMinutes;
      const regularPay = payableRegularMinutes <= 0
        ? 0
        : hourlyRate === null
          ? null
          : amountForMinutes(payableRegularMinutes, hourlyRate);
      const overtimePay = calculation.payableOvertimeMinutes <= 0
        ? 0
        : overtimeRate === null
          ? null
          : amountForMinutes(calculation.payableOvertimeMinutes, overtimeRate);
      const estimate = regularPay === null || overtimePay === null
        ? null
        : Math.round((regularPay + overtimePay) * 100) / 100;
      return {
        workDate: row.workDate,
        scheduleName: row.scheduleName,
        timeZone: row.timeZone,
        isPaidLeave: paidLeaveMinutes > 0,
        isPaidHoliday: paidHolidayMinutes > 0,
        excessOvertimeReviewStatus: row.excessOvertimeReviewStatus,
        paidLeaveMinutes,
        paidHolidayMinutes,
        payableMinutes,
        clockIn: asEvents(row.events).find((event) => event.eventType === "CLOCK_IN")?.recordedAt ?? null,
        clockOut: [...asEvents(row.events)].reverse().find((event) => event.eventType === "CLOCK_OUT")?.recordedAt ?? null,
        workedMinutes: calculation.workedMinutes,
        regularWorkedMinutes: calculation.regularWorkedMinutes,
        potentialOvertimeMinutes: calculation.potentialOvertimeMinutes,
        approvedOvertimeMinutes: calculation.approvedOvertimeMinutes,
        payableOvertimeMinutes: calculation.payableOvertimeMinutes,
        excessUnapprovedOvertimeMinutes: calculation.excessUnapprovedOvertimeMinutes,
        calculationStatus: calculation.calculationStatus,
        hourlyRate,
        hourlyMinuteRate: hourlyRate === null ? null : hourlyRate / 60,
        overtimeRate,
        overtimeMinuteRate: overtimeRate === null ? null : overtimeRate / 60,
        regularPay,
        overtimePay,
        estimatedPay: estimate,
        currencyCode: row.currencyCode,
      };
    });

    const configuredDays = days.filter((day) => day.hourlyRate !== null);
    const hasRates = configuredDays.length > 0;
    const organizationToday = dateInTimeZone(new Date(), result.rows[0].timeZone);
    const currentMonth = organizationToday.slice(0, 7);
    const rateReferenceDate = month === currentMonth ? organizationToday : toDate;
    const rateAtReference = [...configuredDays].reverse().find((day) => day.workDate <= rateReferenceDate);
    const currencyCode = rateAtReference?.currencyCode ?? null;
    const currencyCodes = new Set(days.filter((day) => day.payableMinutes > 0).map((day) => day.currencyCode).filter((value): value is string => Boolean(value)));
    const currencyMismatch = currencyCodes.size > 1;
    const workedDays = days.filter((day) => day.workedMinutes > 0);
    const regularMinutes = days.reduce((sum, day) => sum + day.regularWorkedMinutes, 0);
    const payableOvertimeMinutes = days.reduce((sum, day) => sum + day.payableOvertimeMinutes, 0);
    const potentialOvertimeMinutes = days.reduce((sum, day) => sum + day.potentialOvertimeMinutes, 0);
    const excessMinutes = days.reduce((sum, day) => sum + day.excessUnapprovedOvertimeMinutes, 0);
    const estimatedSalary = hasRates && !currencyMismatch && days.every((day) => day.payableMinutes === 0 || day.estimatedPay !== null)
      ? Math.round(days.reduce((sum, day) => sum + (day.estimatedPay ?? 0), 0) * 100) / 100
      : null;
    const paidLeaveMinutes = days.reduce((sum, day) => sum + day.paidLeaveMinutes, 0);
    const paidHolidayMinutes = days.reduce((sum, day) => sum + day.paidHolidayMinutes, 0);
    const payableMinutes = days.reduce((sum, day) => sum + day.payableMinutes, 0);

    return json({
      status: "ok",
      month,
      timeZone: result.rows[0].timeZone,
      employeeName: result.rows[0].employeeName,
      currencyCode,
      hasRates,
      hourlyRate: rateAtReference?.hourlyRate ?? null,
      hourlyMinuteRate: rateAtReference?.hourlyMinuteRate ?? null,
      overtimeRate: rateAtReference?.overtimeRate ?? null,
      overtimeMinuteRate: rateAtReference?.overtimeMinuteRate ?? null,
      summary: {
        estimatedSalary,
        regularMinutes,
        payableOvertimeMinutes,
        potentialOvertimeMinutes,
        excessUnapprovedOvertimeMinutes: excessMinutes,
        totalWorkedMinutes: regularMinutes + potentialOvertimeMinutes,
        paidLeaveMinutes,
        paidHolidayMinutes,
        payableMinutes,
        daysWorked: workedDays.length,
        daysWithMissingRates: days.filter((day) => day.payableMinutes > 0 && (day.regularPay === null || day.overtimePay === null)).length,
        currencyMismatch,
        currencyCodes: [...currencyCodes],
      },
      days,
      disclaimer: "Estimated earnings from recorded attendance and approved overtime. This is not a payslip or final payroll calculation; incomplete attendance and manager-approved corrections may change the estimate.",
    });
  } catch (error) {
    console.error("Failed to calculate employee earnings:", error);
    return json({ message: "Unable to load your earnings for this month" }, 500);
  }
}
