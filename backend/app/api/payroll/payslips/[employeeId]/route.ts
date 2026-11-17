import { connection, NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { organizationIsActive } from "../../../../../lib/schedule-utils";
import { calculateDailyAttendance, type AttendanceCalculationEvent } from "../../../../../lib/attendance-calculations";
import { normalizeWorkforceRole } from "../../../../../lib/workforce-eligibility";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

type PayslipDayRow = {
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
  timeZone: string;
  isPaidLeave: boolean;
  isPaidHoliday: boolean;
  excessOvertimeReviewStatus: string | null;
  paymentStatus: string | null;
  paidAt: Date | string | null;
  paymentReference: string | null;
};

type EmployeeTarget = {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  departmentName: string | null;
  workforceRole: string | null;
  employmentStatus: string;
  organizationName: string;
  timeZone: string;
  isOrganizationAdmin: boolean;
};

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

function monthOrdinal(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function asEvents(value: PayslipDayRow["events"]): AttendanceCalculationEvent[] {
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

function amountForMinutes(minutes: number, hourlyRate: number): number {
  return Math.round((minutes / 60) * hourlyRate * 100) / 100;
}

function validRate(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * GET /api/payroll/payslips/:employeeId?startMonth=YYYY-MM&endMonth=YYYY-MM
 *
 * Payslips are restricted to tenant payroll administrators. The target role
 * is checked here, independently of the frontend employee list, so changing
 * the URL cannot bypass HR Manager / Organization Admin eligibility rules.
 */
export async function GET(request: Request, context: RouteContext) {
  await connection();

  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);

    const isOrganizationAdmin = actor.kind === "ORGANIZATION_ADMIN";
    const isHrManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER";
    if (!isOrganizationAdmin && !isHrManager) {
      return json({ message: "Only an Organization Admin or HR Manager can print workforce salary slips" }, 403);
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return json({ message: "This organization is not active" }, 403);
    }

    const { employeeId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId)) {
      return json({ message: "Provide a valid workforce member ID" }, 400);
    }

    if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER" && employeeId === actor.employeeId) {
      return json({ message: "HR Managers cannot print their own salary slips" }, 403);
    }

    const url = new URL(request.url);
    const startMonth = url.searchParams.get("startMonth");
    const endMonth = url.searchParams.get("endMonth");
    if (!validMonth(startMonth) || !validMonth(endMonth)) {
      return json({ message: "Provide startMonth and endMonth in YYYY-MM format" }, 400);
    }
    if (monthOrdinal(startMonth) > monthOrdinal(endMonth)) {
      return json({ message: "The start month must be before or equal to the end month" }, 400);
    }
    if (monthOrdinal(endMonth) - monthOrdinal(startMonth) + 1 > 24) {
      return json({ message: "A salary slip can cover at most 24 months at a time" }, 400);
    }

    const targetResult = await pool.query<EmployeeTarget>(
      `SELECT
         e.id,
         e.employee_code AS "employeeCode",
         e.first_name AS "firstName",
         e.last_name AS "lastName",
         e.email,
         d.name AS "departmentName",
         workforce_role.name AS "workforceRole",
         e.employment_status AS "employmentStatus",
         o.name AS "organizationName",
         COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
         EXISTS (
           SELECT 1
           FROM public.users AS target_account
           JOIN public.roles AS target_account_role
             ON target_account_role.id = target_account.role_id
            AND target_account_role.organization_id = target_account.organization_id
           WHERE target_account.organization_id = e.organization_id
             AND target_account.employee_id = e.id
             AND target_account.account_scope = 'ORGANIZATION'
             AND (
               regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g')
                 IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR',
                     'ORGANIZATION_OWNER', 'ORG_OWNER', 'TENANT_ADMIN', 'ADMINISTRATOR')
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_ADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATIONADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_ADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_OWNER_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_OWNER_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'TENANT_ADMIN_%'
               OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ADMINISTRATOR_%'
             )
         ) AS "isOrganizationAdmin"
       FROM public.employees AS e
       JOIN public.organizations AS o
         ON o.id = e.organization_id
       LEFT JOIN public.organization_settings AS os
         ON os.organization_id = e.organization_id
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS workforce_role
         ON workforce_role.id = e.workforce_role_id
        AND workforce_role.organization_id = e.organization_id
       WHERE e.id = $1::uuid
         AND e.organization_id = $2::uuid
       LIMIT 1`,
      [employeeId, actor.organizationId],
    );

    const target = targetResult.rows[0];
    if (!target) return json({ message: "Workforce member not found in this organization" }, 404);
    const targetRole = normalizeWorkforceRole(target.workforceRole || "EMPLOYEE");
    const isHrManagerTarget = targetRole === "HR_MANAGER" || targetRole === "HRMANAGER";
    const isDepartmentManagerTarget = targetRole === "DEPARTMENT_MANAGER" || targetRole === "DEPARTMENTMANAGER";
    const isEmployeeTarget = targetRole === "EMPLOYEE";
    const roleIsEligible = isDepartmentManagerTarget || isEmployeeTarget ||
      (isOrganizationAdmin && isHrManagerTarget);

    if (target.isOrganizationAdmin || !roleIsEligible) {
      return json({
        message: isHrManager
          ? "HR Managers can print salary slips for Department Managers and Employees only"
          : "Organization Admins can print salary slips for HR Managers, Department Managers and Employees only",
      }, 403);
    }

    const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
    const fromDate = `${startMonth}-01`;
    const toDate = new Date(Date.UTC(endYear, endMonthNumber, 0)).toISOString().slice(0, 10);

    const dayResult = await pool.query<PayslipDayRow>(
      `WITH calendar_days AS (
         SELECT generate_series($3::date, $4::date, interval '1 day')::date AS work_date
       ),
       employee_context AS (
         SELECT e.id, e.organization_id,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), e.employee_code, 'Workforce member') AS employee_name,
                COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS time_zone
         FROM public.employees AS e
         JOIN public.organizations AS o
           ON o.id = e.organization_id AND o.status = 'ACTIVE'
         LEFT JOIN public.organization_settings AS os
           ON os.organization_id = e.organization_id
         WHERE e.id = $1::uuid
           AND e.organization_id = $2::uuid
       ),
       scheduled_days AS (
         SELECT DISTINCT ON (cd.work_date)
           cd.work_date,
           s.name AS schedule_name,
           ((cd.work_date + sd.start_time) AT TIME ZONE ec.time_zone) AS expected_start,
           ((cd.work_date + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END + sd.end_time)
             AT TIME ZONE ec.time_zone) AS expected_end,
           sd.break_minutes
         FROM calendar_days AS cd
         CROSS JOIN employee_context AS ec
         JOIN public.employee_schedule_assignments AS a
           ON a.organization_id = ec.organization_id
          AND a.employee_id = ec.id
          AND a.effective_from <= cd.work_date
          AND (a.effective_to IS NULL OR a.effective_to >= cd.work_date)
         JOIN public.work_schedules AS s
           ON s.organization_id = a.organization_id
          AND s.id = a.schedule_id
         JOIN public.work_schedule_days AS sd
           ON sd.organization_id = a.organization_id
          AND sd.schedule_id = a.schedule_id
          AND sd.day_of_week = EXTRACT(ISODOW FROM cd.work_date)::int
         ORDER BY cd.work_date, a.effective_from DESC, a.created_at DESC
       ),
       effective_events AS (
         SELECT ae.work_date, ae.event_type,
                COALESCE(c.requested_at, ae.recorded_at) AS recorded_at,
                ae.id::text AS source_id
         FROM public.attendance_events AS ae
         CROSS JOIN employee_context AS ec
         LEFT JOIN LATERAL (
           SELECT cr.id, cr.requested_at
           FROM public.attendance_correction_requests AS cr
           WHERE cr.organization_id = ae.organization_id
             AND cr.employee_id = ae.employee_id
             AND cr.original_event_id = ae.id
             AND cr.status = 'APPROVED'
           ORDER BY cr.decision_at DESC
           LIMIT 1
         ) AS c ON TRUE
         WHERE ae.organization_id = $2::uuid
           AND ae.employee_id = $1::uuid
           AND ae.work_date BETWEEN $3::date AND $4::date
         UNION ALL
         SELECT cr.work_date, cr.event_type, cr.requested_at,
                ('CORRECTION:' || cr.id::text)
         FROM public.attendance_correction_requests AS cr
         WHERE cr.organization_id = $2::uuid
           AND cr.employee_id = $1::uuid
           AND cr.original_event_id IS NULL
           AND cr.status = 'APPROVED'
           AND cr.work_date BETWEEN $3::date AND $4::date
       ),
       event_days AS (
         SELECT work_date,
                jsonb_agg(
                  jsonb_build_object('id', source_id, 'eventType', event_type, 'recordedAt', recorded_at)
                  ORDER BY recorded_at, source_id
                ) AS events
         FROM effective_events
         GROUP BY work_date
       ),
       approved_overtime AS (
         SELECT work_date, LEAST(1440, SUM(approved_minutes))::int AS approved_minutes
         FROM public.attendance_overtime_requests
         WHERE organization_id = $2::uuid
           AND employee_id = $1::uuid
           AND status = 'APPROVED'
           AND request_type = 'PREAUTHORIZATION'
           AND work_date BETWEEN $3::date AND $4::date
         GROUP BY work_date
       )
       SELECT
         cd.work_date::text AS "workDate",
         sd.schedule_name AS "scheduleName",
         sd.expected_start AS "expectedStart",
         sd.expected_end AS "expectedEnd",
         sd.break_minutes AS "scheduledBreakMinutes",
         COALESCE(ed.events, '[]'::jsonb) AS events,
         COALESCE(ot.approved_minutes, 0)::int AS "approvedOvertimeMinutes",
         rate.hourly_rate::text AS "hourlyRate",
         rate.overtime_rate::text AS "overtimeRate",
         rate.currency_code AS "currencyCode",
         ec.time_zone AS "timeZone",
         EXISTS (
           SELECT 1
           FROM public.leave_requests AS lr
           WHERE lr.organization_id = ec.organization_id
             AND lr.employee_id = ec.id
             AND lr.status = 'APPROVED'
             AND lr.is_paid = TRUE
             AND cd.work_date <= (now() AT TIME ZONE ec.time_zone)::date
             AND cd.work_date BETWEEN lr.start_date AND lr.end_date
         ) AS "isPaidLeave",
         EXISTS (
           SELECT 1
           FROM public.public_holidays AS ph
           WHERE ph.organization_id = ec.organization_id
             AND ph.holiday_date = cd.work_date
             AND ph.is_paid = TRUE
             AND cd.work_date <= (now() AT TIME ZONE ec.time_zone)::date
         ) AS "isPaidHoliday",
         excess_review.status AS "excessOvertimeReviewStatus",
         payment.status AS "paymentStatus",
         payment.paid_at AS "paidAt",
         payment.payment_reference AS "paymentReference"
       FROM calendar_days AS cd
       CROSS JOIN employee_context AS ec
       LEFT JOIN scheduled_days AS sd
         ON sd.work_date = cd.work_date
       LEFT JOIN event_days AS ed
         ON ed.work_date = cd.work_date
       LEFT JOIN approved_overtime AS ot
         ON ot.work_date = cd.work_date
       LEFT JOIN public.attendance_excess_overtime_reviews AS excess_review
         ON excess_review.organization_id = ec.organization_id
        AND excess_review.employee_id = ec.id
        AND excess_review.work_date = cd.work_date
       LEFT JOIN LATERAL (
         SELECT pr.hourly_rate, pr.overtime_rate, pr.currency_code
         FROM public.employee_pay_rates AS pr
         WHERE pr.organization_id = ec.organization_id
           AND pr.employee_id = ec.id
           AND pr.effective_from <= cd.work_date
           AND (pr.effective_to IS NULL OR pr.effective_to >= cd.work_date)
         ORDER BY pr.effective_from DESC, pr.created_at DESC
         LIMIT 1
       ) AS rate ON TRUE
       LEFT JOIN public.monthly_salary_payments AS payment
         ON payment.organization_id = ec.organization_id
        AND payment.employee_id = ec.id
        AND payment.pay_month = date_trunc('month', cd.work_date)::date
       ORDER BY cd.work_date`,
      [employeeId, actor.organizationId, fromDate, toDate],
    );

    if (dayResult.rows.length === 0) {
      return json({ message: "No attendance calendar could be generated for this workforce member" }, 404);
    }

    const days = dayResult.rows.map((row) => {
      const events = asEvents(row.events);
      const hourlyRate = validRate(row.hourlyRate);
      const overtimeRate = validRate(row.overtimeRate);
      const calculation = calculateDailyAttendance({
        events,
        expectedStart: row.expectedStart,
        expectedEnd: row.expectedEnd,
        scheduledBreakMinutes: row.scheduledBreakMinutes,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes,
      });
      const startMs = row.expectedStart == null
        ? NaN
        : row.expectedStart instanceof Date
          ? row.expectedStart.getTime()
          : Date.parse(row.expectedStart);
      const endMs = row.expectedEnd == null
        ? NaN
        : row.expectedEnd instanceof Date
          ? row.expectedEnd.getTime()
          : Date.parse(row.expectedEnd);
      const scheduledMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.max(0, Math.floor((endMs - startMs) / 60000) - Number(row.scheduledBreakMinutes ?? 0))
        : 0;

      // Match the employee earnings and monthly payroll calculations:
      // paid leave/holiday credits only apply to an unworked scheduled day,
      // and paid holiday takes precedence so scheduled time is never credited twice.
      const paidHolidayMinutes = calculation.workedMinutes === 0 && events.length === 0 && scheduledMinutes > 0 && row.isPaidHoliday
        ? scheduledMinutes
        : 0;
      const paidLeaveMinutes = calculation.workedMinutes === 0 && events.length === 0 && scheduledMinutes > 0 && !row.isPaidHoliday && row.isPaidLeave
        ? scheduledMinutes
        : 0;
      const payableRegularMinutes = calculation.regularWorkedMinutes + paidLeaveMinutes + paidHolidayMinutes;
      const payableMinutes = payableRegularMinutes + calculation.payableOvertimeMinutes;

      const regularPay = payableRegularMinutes === 0
        ? 0
        : hourlyRate === null
          ? null
          : amountForMinutes(payableRegularMinutes, hourlyRate);
      const overtimePay = calculation.payableOvertimeMinutes === 0
        ? 0
        : overtimeRate === null
          ? null
          : amountForMinutes(calculation.payableOvertimeMinutes, overtimeRate);
      const estimatedPay = regularPay === null || overtimePay === null
        ? null
        : Math.round((regularPay + overtimePay) * 100) / 100;

      const dayStatus = calculation.calculationStatus === "REVIEW_REQUIRED"
        ? "REVIEW_REQUIRED"
        : calculation.calculationStatus === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : calculation.workedMinutes > 0
            ? "WORKED"
            : paidHolidayMinutes > 0
              ? "PAID_HOLIDAY"
              : paidLeaveMinutes > 0
                ? "PAID_LEAVE"
                : row.scheduleName
                  ? "NO_ATTENDANCE"
                  : "NON_WORKDAY";

      return {
        workDate: row.workDate,
        scheduleName: row.scheduleName,
        dayStatus,
        calculationStatus: calculation.calculationStatus,
        workedMinutes: calculation.workedMinutes,
        regularWorkedMinutes: calculation.regularWorkedMinutes,
        potentialOvertimeMinutes: calculation.potentialOvertimeMinutes,
        payableOvertimeMinutes: calculation.payableOvertimeMinutes,
        excessUnapprovedOvertimeMinutes: calculation.excessUnapprovedOvertimeMinutes,
        paidLeaveMinutes,
        paidHolidayMinutes,
        payableRegularMinutes,
        payableMinutes,
        hourlyRate,
        overtimeRate,
        currencyCode: row.currencyCode,
        regularPay,
        overtimePay,
        estimatedPay,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt,
        paymentReference: row.paymentReference,
      };
    });

    const months = [];
    for (let ordinal = monthOrdinal(startMonth); ordinal <= monthOrdinal(endMonth); ordinal += 1) {
      const year = Math.floor(ordinal / 12);
      const monthNumber = ordinal % 12 + 1;
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const monthDays = days.filter((day) => day.workDate.startsWith(month));
      const totals = {
        workedMinutes: monthDays.reduce((sum, day) => sum + day.workedMinutes, 0),
        regularWorkedMinutes: monthDays.reduce((sum, day) => sum + day.regularWorkedMinutes, 0),
        payableOvertimeMinutes: monthDays.reduce((sum, day) => sum + day.payableOvertimeMinutes, 0),
        potentialOvertimeMinutes: monthDays.reduce((sum, day) => sum + day.potentialOvertimeMinutes, 0),
        excessUnapprovedOvertimeMinutes: monthDays.reduce((sum, day) => sum + day.excessUnapprovedOvertimeMinutes, 0),
        paidLeaveMinutes: monthDays.reduce((sum, day) => sum + day.paidLeaveMinutes, 0),
        paidHolidayMinutes: monthDays.reduce((sum, day) => sum + day.paidHolidayMinutes, 0),
        payableMinutes: monthDays.reduce((sum, day) => sum + day.payableMinutes, 0),
        daysWorked: monthDays.filter((day) => day.workedMinutes > 0).length,
        daysWithMissingRates: monthDays.filter((day) =>
          day.payableMinutes > 0 && (day.regularPay === null || day.overtimePay === null)
        ).length,
      };

      const totalsByCurrency = new Map<string, { currencyCode: string; amount: number; incomplete: boolean }>();
      for (const day of monthDays) {
        if (day.payableMinutes <= 0) continue;
        const key = day.currencyCode || "UNCONFIGURED";
        const entry = totalsByCurrency.get(key) ?? {
          currencyCode: key,
          amount: 0,
          incomplete: false,
        };
        if (day.estimatedPay === null) entry.incomplete = true;
        else entry.amount += day.estimatedPay;
        totalsByCurrency.set(key, entry);
      }

      const ratePeriods: Array<{
        fromDate: string;
        toDate: string;
        hourlyRate: number | null;
        overtimeRate: number | null;
        currencyCode: string | null;
      }> = [];
      for (const day of monthDays) {
        const current = {
          hourlyRate: day.hourlyRate,
          overtimeRate: day.overtimeRate,
          currencyCode: day.currencyCode,
        };
        const last = ratePeriods[ratePeriods.length - 1];
        const previousDate = (() => {
          const [year, monthNumber, dayNumber] = day.workDate.split("-").map(Number);
          return new Date(Date.UTC(year, monthNumber - 1, dayNumber - 1)).toISOString().slice(0, 10);
        })();
        const isConsecutive = Boolean(last && last.toDate === previousDate);
        if (
          last &&
          isConsecutive &&
          last.hourlyRate === current.hourlyRate &&
          last.overtimeRate === current.overtimeRate &&
          last.currencyCode === current.currencyCode
        ) {
          last.toDate = day.workDate;
        } else if (current.hourlyRate !== null || current.overtimeRate !== null || current.currencyCode !== null) {
          ratePeriods.push({
            fromDate: day.workDate,
            toDate: day.workDate,
            ...current,
          });
        }
      }

      const currencyRows = [...totalsByCurrency.values()].map((entry) => ({
        currencyCode: entry.currencyCode === "UNCONFIGURED" ? null : entry.currencyCode,
        amount: entry.incomplete ? null : Math.round(entry.amount * 100) / 100,
        incomplete: entry.incomplete,
      }));
      const paymentRow = monthDays.find((day) => day.paymentStatus || day.paidAt || day.paymentReference);
      months.push({
        month,
        totals,
        totalsByCurrency: currencyRows,
        currencyMismatch: currencyRows.filter((entry) => entry.currencyCode).length > 1,
        ratePeriods,
        payment: {
          status: paymentRow?.paymentStatus ?? "UNRECORDED",
          paidAt: paymentRow?.paidAt ?? null,
          reference: paymentRow?.paymentReference ?? null,
        },
        days: monthDays,
      });
    }

    return json({
      status: "ok",
      generatedAt: new Date().toISOString(),
      startMonth,
      endMonth,
      organization: {
        name: target.organizationName,
        timeZone: target.timeZone,
      },
      employee: {
        id: target.id,
        employeeCode: target.employeeCode,
        firstName: target.firstName,
        lastName: target.lastName,
        email: target.email,
        departmentName: target.departmentName,
        workforceRole: target.workforceRole,
        employmentStatus: target.employmentStatus,
      },
      months,
      disclaimer: "This salary statement is calculated from recorded attendance, approved attendance corrections, pre-authorized overtime, approved paid leave, paid public holidays and the pay rates effective on each work date. Unapproved overtime is excluded from payable overtime. Unresolved attendance or missing pay-rate data may require payroll review.",
    });
  } catch (error) {
    console.error("Failed to generate workforce salary payslip:", error);
    return json({ message: "Unable to generate this salary slip right now" }, 500);
  }
}
