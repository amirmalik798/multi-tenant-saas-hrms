import type { Pool } from "pg";
import { calculateDailyAttendance, type AttendanceCalculationEvent } from "./attendance-calculations";

type DayRow = {
  employeeId: string;
  workDate: string;
  expectedStart: Date | string | null;
  expectedEnd: Date | string | null;
  scheduledBreakMinutes: number | string | null;
  events: AttendanceCalculationEvent[] | string | null;
  approvedOvertimeMinutes: number | string | null;
  hourlyRate: string | number | null;
  overtimeRate: string | number | null;
  currencyCode: string | null;
  isPaidLeave: boolean;
  isPaidHoliday: boolean;
};

function asEvents(value: DayRow["events"]): AttendanceCalculationEvent[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as AttendanceCalculationEvent[] : [];
    } catch { return []; }
  }
  return [];
}

function amountForMinutes(minutes: number, rate: number): number {
  return Math.round((minutes / 60) * rate * 100) / 100;
}

/**
 * Calculates estimated monthly pay from effective attendance events, approved paid leave,
 * paid public holidays, approved overtime, and the pay rate active on each work date.
 * Paid absence credits apply only to completed calendar days with a scheduled shift and no
 * attendance events. They never create clock events or double-count a day. This function
 * does not create or mark a payment paid.
 */
export async function calculateOrganizationMonthlyPay(pool: Pool, organizationId: string, month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const fromDate = `${month}-01`;
  const toDate = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const result = await pool.query<DayRow>(
    `WITH calendar_days AS (
       SELECT generate_series($2::date, $3::date, interval '1 day')::date AS work_date
     ),
     employee_context AS (
       SELECT e.id, e.organization_id,
              COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone
       FROM public.employees e
       LEFT JOIN public.organization_settings os ON os.organization_id = e.organization_id
       WHERE e.organization_id = $1::uuid
     ),
     scheduled_days AS (
       SELECT DISTINCT ON (ec.id, cd.work_date)
         ec.id AS employee_id, cd.work_date, s.name AS schedule_name,
         ((cd.work_date + sd.start_time) AT TIME ZONE ec.time_zone) AS expected_start,
         ((cd.work_date + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END + sd.end_time)
           AT TIME ZONE ec.time_zone) AS expected_end,
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
       ORDER BY ec.id, cd.work_date, a.effective_from DESC, a.created_at DESC
     ),
     effective_events AS (
       SELECT ae.employee_id, ae.work_date, ae.event_type,
              COALESCE(c.requested_at, ae.recorded_at) AS recorded_at,
              ae.id::text AS source_id
       FROM public.attendance_events ae
       LEFT JOIN LATERAL (
         SELECT cr.id, cr.requested_at
         FROM public.attendance_correction_requests cr
         WHERE cr.organization_id = ae.organization_id AND cr.employee_id = ae.employee_id
           AND cr.original_event_id = ae.id AND cr.status = 'APPROVED'
         ORDER BY cr.decision_at DESC LIMIT 1
       ) c ON TRUE
       WHERE ae.organization_id = $1::uuid AND ae.work_date BETWEEN $2::date AND $3::date
       UNION ALL
       SELECT cr.employee_id, cr.work_date, cr.event_type, cr.requested_at,
              ('CORRECTION:' || cr.id::text)
       FROM public.attendance_correction_requests cr
       WHERE cr.organization_id = $1::uuid AND cr.original_event_id IS NULL
         AND cr.status = 'APPROVED' AND cr.work_date BETWEEN $2::date AND $3::date
     ),
     event_days AS (
       SELECT employee_id, work_date,
              jsonb_agg(jsonb_build_object('id', source_id, 'eventType', event_type, 'recordedAt', recorded_at)
                        ORDER BY recorded_at, source_id) AS events
       FROM effective_events GROUP BY employee_id, work_date
     ),
     approved_overtime AS (
       SELECT employee_id, work_date, LEAST(1440, SUM(approved_minutes))::int AS approved_minutes
       FROM public.attendance_overtime_requests
       WHERE organization_id = $1::uuid AND status = 'APPROVED'
         AND request_type = 'PREAUTHORIZATION'
         AND work_date BETWEEN $2::date AND $3::date
       GROUP BY employee_id, work_date
     )
     SELECT ec.id::text AS "employeeId", cd.work_date::text AS "workDate",
            sd.expected_start AS "expectedStart", sd.expected_end AS "expectedEnd",
            sd.break_minutes AS "scheduledBreakMinutes",
            COALESCE(ed.events, '[]'::jsonb) AS events,
            COALESCE(ot.approved_minutes, 0)::int AS "approvedOvertimeMinutes",
            rate.hourly_rate::text AS "hourlyRate",
            rate.overtime_rate::text AS "overtimeRate",
            rate.currency_code AS "currencyCode",
            EXISTS (SELECT 1 FROM public.leave_requests lr WHERE lr.organization_id = ec.organization_id AND lr.employee_id = ec.id AND lr.status = 'APPROVED' AND lr.is_paid = TRUE AND cd.work_date <= (now() AT TIME ZONE ec.time_zone)::date AND cd.work_date BETWEEN lr.start_date AND lr.end_date) AS "isPaidLeave",
            EXISTS (SELECT 1 FROM public.public_holidays ph WHERE ph.organization_id = ec.organization_id AND ph.holiday_date = cd.work_date AND ph.is_paid = TRUE AND cd.work_date <= (now() AT TIME ZONE ec.time_zone)::date) AS "isPaidHoliday"
     FROM calendar_days cd
     CROSS JOIN employee_context ec
     LEFT JOIN scheduled_days sd ON sd.employee_id = ec.id AND sd.work_date = cd.work_date
     LEFT JOIN event_days ed ON ed.employee_id = ec.id AND ed.work_date = cd.work_date
     LEFT JOIN approved_overtime ot ON ot.employee_id = ec.id AND ot.work_date = cd.work_date
     LEFT JOIN LATERAL (
       SELECT pr.hourly_rate, pr.overtime_rate, pr.currency_code
       FROM public.employee_pay_rates pr
       WHERE pr.organization_id = ec.organization_id AND pr.employee_id = ec.id
         AND pr.effective_from <= cd.work_date
         AND (pr.effective_to IS NULL OR pr.effective_to >= cd.work_date)
       ORDER BY pr.effective_from DESC, pr.created_at DESC LIMIT 1
     ) rate ON TRUE
     ORDER BY ec.id, cd.work_date`,
    [organizationId, fromDate, toDate],
  );

  const totals = new Map<string, { workedMinutes: number; regularMinutes: number; overtimeMinutes: number; paidLeaveMinutes: number; paidHolidayMinutes: number; payableMinutes: number; amount: number | null; regularAmount: number; overtimeAmount: number; paidAbsenceAmount: number; currencyCode: string | null; hasRate: boolean; currencyMismatch: boolean }>();
  for (const row of result.rows) {
    const calc = calculateDailyAttendance({
      events: asEvents(row.events),
      expectedStart: row.expectedStart,
      expectedEnd: row.expectedEnd,
      scheduledBreakMinutes: row.scheduledBreakMinutes,
      approvedOvertimeMinutes: row.approvedOvertimeMinutes,
    });
    const hourlyRate = row.hourlyRate == null ? null : Number(row.hourlyRate);
    const overtimeRate = row.overtimeRate == null ? null : Number(row.overtimeRate);
    const startMs = row.expectedStart == null ? NaN : row.expectedStart instanceof Date ? row.expectedStart.getTime() : Date.parse(row.expectedStart);
    const endMs = row.expectedEnd == null ? NaN : row.expectedEnd instanceof Date ? row.expectedEnd.getTime() : Date.parse(row.expectedEnd);
    const scheduledMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? Math.max(0, Math.floor((endMs - startMs) / 60000) - Number(row.scheduledBreakMinutes ?? 0))
      : 0;
    // Paid leave/holiday credits are only added when no work was recorded on a scheduled day.
    // A public holiday takes precedence over leave so the same scheduled hours cannot be paid twice.
    const paidHolidayMinutes = calc.workedMinutes === 0 && asEvents(row.events).length === 0 && scheduledMinutes > 0 && row.isPaidHoliday ? scheduledMinutes : 0;
    const paidLeaveMinutes = calc.workedMinutes === 0 && asEvents(row.events).length === 0 && scheduledMinutes > 0 && !row.isPaidHoliday && row.isPaidLeave ? scheduledMinutes : 0;
    const payableRegularMinutes = calc.regularWorkedMinutes + paidLeaveMinutes + paidHolidayMinutes;
    const payableMinutes = payableRegularMinutes + calc.payableOvertimeMinutes;
    const existing = totals.get(row.employeeId) ?? { workedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, paidLeaveMinutes: 0, paidHolidayMinutes: 0, payableMinutes: 0, amount: 0, regularAmount: 0, overtimeAmount: 0, paidAbsenceAmount: 0, currencyCode: null, hasRate: false, currencyMismatch: false };
    if (row.currencyCode && payableMinutes > 0) {
      if (existing.currencyCode && existing.currencyCode !== row.currencyCode) {
        existing.currencyMismatch = true;
        existing.amount = null;
      } else if (!existing.currencyCode) {
        existing.currencyCode = row.currencyCode;
      }
    }
    existing.workedMinutes += calc.workedMinutes;
    existing.regularMinutes += calc.regularWorkedMinutes;
    existing.overtimeMinutes += calc.payableOvertimeMinutes;
    existing.paidLeaveMinutes += paidLeaveMinutes;
    existing.paidHolidayMinutes += paidHolidayMinutes;
    existing.payableMinutes += payableMinutes;
    const missingRegularRate = payableRegularMinutes > 0 && hourlyRate === null;
    const missingOvertimeRate = calc.payableOvertimeMinutes > 0 && overtimeRate === null;
    if (missingRegularRate || missingOvertimeRate) {
      existing.amount = null;
    } else if (existing.amount !== null) {
      if (payableRegularMinutes > 0 && hourlyRate !== null) {
        const regularAmount = amountForMinutes(calc.regularWorkedMinutes, hourlyRate);
        // Allocate any per-day rounding remainder to the paid-absence component so
        // the displayed breakdown always reconciles exactly to payroll's total.
        const payableRegularAmount = amountForMinutes(payableRegularMinutes, hourlyRate);
        const paidAbsenceAmount = payableRegularAmount - regularAmount;
        existing.regularAmount += regularAmount;
        existing.paidAbsenceAmount += paidAbsenceAmount;
        existing.amount += payableRegularAmount;
        existing.hasRate = true;
      }
      if (calc.payableOvertimeMinutes > 0 && overtimeRate !== null) {
        const overtimeAmount = amountForMinutes(calc.payableOvertimeMinutes, overtimeRate);
        existing.overtimeAmount += overtimeAmount;
        existing.amount += overtimeAmount;
        existing.hasRate = true;
      }
    }
    totals.set(row.employeeId, existing);
  }
  for (const value of totals.values()) {
    if (value.currencyMismatch) value.amount = null;
    value.regularAmount = Math.round(value.regularAmount * 100) / 100;
    value.overtimeAmount = Math.round(value.overtimeAmount * 100) / 100;
    value.paidAbsenceAmount = Math.round(value.paidAbsenceAmount * 100) / 100;
    if (value.amount !== null) value.amount = Math.round(value.amount * 100) / 100;
    if (value.payableMinutes === 0 && !value.hasRate) value.amount = null;
  }
  return totals;
}
