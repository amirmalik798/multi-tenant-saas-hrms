import type { PoolClient } from "pg";

import {
  calculateDailyAttendance,
  type AttendanceCalculationEvent,
} from "../attendance-calculations";
import type { ManagementDashboardScope } from "./scope";

const MAX_ATTENDANCE_ROWS = 100_000;

export class ManagementDashboardAttendanceResultLimitError extends Error {
  constructor() {
    super("The selected attendance period exceeds the 100,000 scheduled employee-day limit. Choose a shorter period or narrower department.");
    this.name = "ManagementDashboardAttendanceResultLimitError";
  }
}

export type ManagementDashboardAttendancePeriod = {
  scheduledShiftDays: number;
  uniqueScheduledEmployees: number;
  eligibleShiftDays: number;
  presentShiftDays: number;
  attendanceRate: number | null;
  scheduledMinutes: number;
  workedMinutes: number;
  regularWorkedMinutes: number;
  potentialOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  completedShiftDays: number;
};

export type ManagementDashboardAttendanceToday = {
  scheduledShiftDays: number;
  eligibleShiftDays: number;
  presentEmployees: number;
  attendanceRate: number | null;
  notYetDue: number;
  noClockInDuringActiveShift: number;
  openSessions: number;
  completedSessions: number;
};

export type ManagementDashboardAttendanceTrendDay = {
  workDate: string;
  scheduledShiftDays: number;
  eligibleShiftDays: number;
  presentShiftDays: number;
  attendanceRate: number | null;
  scheduledMinutes: number;
  workedMinutes: number;
  potentialOvertimeMinutes: number;
  payableOvertimeMinutes: number;
};

export type ManagementDashboardAttendanceSummary = {
  generatedAt: string;
  period: ManagementDashboardAttendancePeriod;
  today: ManagementDashboardAttendanceToday;
  dailyTrend: ManagementDashboardAttendanceTrendDay[];
};

type AttendanceSummaryRow = {
  employeeId: string;
  workDate: string;
  expectedStart: string | Date;
  expectedEnd: string | Date;
  scheduledBreakMinutes: number | string;
  eventCount: number | string;
  events: unknown;
  approvedOvertimeMinutes: number | string;
  hasApprovedLeave: boolean;
  publicHolidayName: string | null;
};

type AttendanceDayAccumulator = {
  scheduledShiftDays: number;
  eligibleShiftDays: number;
  presentShiftDays: number;
  scheduledMinutes: number;
  workedMinutes: number;
  regularWorkedMinutes: number;
  potentialOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  completedShiftDays: number;
};

function countValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The attendance summary returned an invalid " + field);
  }

  return parsed;
}

function dateValue(value: string | Date | null | undefined, field: string): Date {
  if (value === null || value === undefined) {
    throw new Error("The attendance summary returned a missing " + field);
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("The attendance summary returned an invalid " + field);
  }

  return parsed;
}

function parseEvents(value: unknown): AttendanceCalculationEvent[] {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Attendance event data returned by the database is malformed");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Attendance event data returned by the database has an invalid structure");
  }

  return parsed.map((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("Attendance event data contains an invalid record");
    }

    const record = event as Record<string, unknown>;

    if (
      record.eventType !== null &&
      record.eventType !== undefined &&
      typeof record.eventType !== "string"
    ) {
      throw new Error("Attendance event data contains an invalid event type");
    }

    if (
      record.recordedAt !== null &&
      record.recordedAt !== undefined &&
      !(record.recordedAt instanceof Date) &&
      typeof record.recordedAt !== "string"
    ) {
      throw new Error("Attendance event data contains an invalid timestamp");
    }

    return {
      id: typeof record.id === "string" ? record.id : undefined,
      eventType: typeof record.eventType === "string" ? record.eventType : null,
      recordedAt: record.recordedAt instanceof Date ||
        typeof record.recordedAt === "string"
        ? record.recordedAt
        : null,
    };
  });
}

function createDayAccumulator(): AttendanceDayAccumulator {
  return {
    scheduledShiftDays: 0,
    eligibleShiftDays: 0,
    presentShiftDays: 0,
    scheduledMinutes: 0,
    workedMinutes: 0,
    regularWorkedMinutes: 0,
    potentialOvertimeMinutes: 0,
    payableOvertimeMinutes: 0,
    completedShiftDays: 0,
  };
}

function hasEffectiveClockIn(events: AttendanceCalculationEvent[]): boolean {
  return events.some((event) => {
    if (String(event.eventType ?? "").toUpperCase() !== "CLOCK_IN") {
      return false;
    }

    if (!event.recordedAt) return false;
    const timestamp = event.recordedAt instanceof Date
      ? event.recordedAt.getTime()
      : new Date(event.recordedAt).getTime();
    return Number.isFinite(timestamp);
  });
}

function percentage(present: number, eligible: number): number | null {
  if (eligible === 0) return null;
  return Math.round((present / eligible) * 1000) / 10;
}

function previousCalendarDate(value: string): string {
  const timestamp = new Date(value + "T00:00:00.000Z").getTime() - 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dateRange(fromDate: string, toDate: string): string[] {
  const from = new Date(fromDate + "T00:00:00.000Z").getTime();
  const to = new Date(toDate + "T00:00:00.000Z").getTime();
  const dates: string[] = [];

  for (let timestamp = from; timestamp <= to; timestamp += 86_400_000) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }

  return dates;
}

/**
 * Checks a requested department against the authenticated dashboard scope.
 * A department filter may narrow the existing scope, never widen it.
 */
export async function isManagementDashboardDepartmentInScope(
  client: PoolClient,
  scope: ManagementDashboardScope,
  departmentId: string,
): Promise<boolean> {
  const managerCondition = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? "AND d.manager_id = $3::uuid"
    : "";

  const values = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? [departmentId, scope.organizationId, scope.managerEmployeeId]
    : [departmentId, scope.organizationId];

  const query = [
    "SELECT 1",
    "FROM public.departments AS d",
    "WHERE d.id = $1::uuid",
    "  AND d.organization_id = $2::uuid",
    "  " + managerCondition,
    "LIMIT 1",
  ].join("\n");

  const result = await client.query(query, values);

  return result.rows.length === 1;
}

/**
 * Builds a scheduled employee-day attendance snapshot.
 *
 * Employee scope is the shared management-dashboard workforce population:
 * active employee records in the authenticated tenant, excluding organization
 * administrator role records. Department Managers are narrowed by an EXISTS
 * relationship to departments managed by the authenticated employee ID.
 *
 * Every daily attendance result is calculated by calculateDailyAttendance.
 * Approved leave and organization public holidays are excluded from the
 * attendance-rate denominator; pending leave is not treated as approved.
 */
export async function loadManagementDashboardAttendanceSummary(
  client: PoolClient,
  scope: ManagementDashboardScope,
  input: {
    fromDate: string;
    toDate: string;
    departmentId?: string | null;
    organizationToday: string;
  },
): Promise<ManagementDashboardAttendanceSummary> {
  const clockResult = await client.query<{ generatedAt: Date | string }>(
    "SELECT CURRENT_TIMESTAMP AS \"generatedAt\"",
  );
  const generatedAt = dateValue(
    clockResult.rows[0]?.generatedAt,
    "generation timestamp",
  );

  const values: unknown[] = [
    scope.organizationId,
    input.fromDate,
    input.toDate,
    generatedAt,
    input.organizationToday,
  ];

  const departmentManagerFilter = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? "AND EXISTS (SELECT 1 FROM public.departments AS managed_department WHERE managed_department.organization_id = e.organization_id AND managed_department.id = e.department_id AND managed_department.manager_id = $6::uuid)"
    : "";

  if (scope.kind === "ASSIGNED_DEPARTMENTS") {
    values.push(scope.managerEmployeeId);
  }

  let departmentFilter = "";
  if (input.departmentId) {
    values.push(input.departmentId);
    departmentFilter = "AND e.department_id = $" + values.length + "::uuid";
  }

  const result = await client.query<AttendanceSummaryRow>(
    [
      "WITH calendar_days AS (",
      "  SELECT generate_series($2::date - CASE WHEN $2::date = $5::date THEN 1 ELSE 0 END, $3::date, INTERVAL '1 day')::date AS work_date",
      "),",
      "scoped_employees AS (",
      "  SELECT e.id, e.organization_id, e.department_id",
      "  FROM public.employees AS e",
      "  LEFT JOIN public.roles AS workforce_role",
      "    ON workforce_role.id = e.workforce_role_id",
      "   AND workforce_role.organization_id = e.organization_id",
      "   AND workforce_role.scope = 'ORGANIZATION'",
      "  WHERE e.organization_id = $1::uuid",
      "    AND e.employment_status = 'ACTIVE'",
      "    AND COALESCE(workforce_role.name, 'EMPLOYEE') NOT IN (",
      "      'ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR'",
      "    )",
      "    AND NOT EXISTS (",
      "      SELECT 1",
      "      FROM public.users AS admin_account",
      "      JOIN public.roles AS linked_account_role",
      "        ON linked_account_role.id = admin_account.role_id",
      "       AND linked_account_role.organization_id = admin_account.organization_id",
      "       AND linked_account_role.scope = 'ORGANIZATION'",
      "      WHERE admin_account.organization_id = e.organization_id",
      "        AND admin_account.employee_id = e.id",
      "        AND admin_account.account_scope = 'ORGANIZATION'",
      "        AND regexp_replace(UPPER(linked_account_role.name), '[^A-Z0-9]+', '_', 'g')",
      "          IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR', 'ORG_ADMINISTRATOR')",
      "    )",
      "    " + departmentManagerFilter,
      "    " + departmentFilter,
      "),",
      "scheduled_days AS (",
      "  SELECT DISTINCT ON (e.id, cd.work_date)",
      "    e.id AS employee_id,",
      "    cd.work_date,",
      "    (",
      "      (cd.work_date + sd.start_time)",
      "      AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')",
      "    ) AS expected_start,",
      "    (",
      "      (cd.work_date + CASE WHEN sd.end_time <= sd.start_time THEN 1 ELSE 0 END + sd.end_time)",
      "      AT TIME ZONE COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali')",
      "    ) AS expected_end,",
      "    sd.break_minutes",
      "  FROM scoped_employees AS e",
      "  CROSS JOIN calendar_days AS cd",
      "  JOIN public.employee_schedule_assignments AS a",
      "    ON a.organization_id = e.organization_id",
      "   AND a.employee_id = e.id",
      "   AND a.effective_from <= cd.work_date",
      "   AND (a.effective_to IS NULL OR a.effective_to >= cd.work_date)",
      "  JOIN public.work_schedules AS s",
      "    ON s.organization_id = a.organization_id",
      "   AND s.id = a.schedule_id",
      "   AND s.status = 'ACTIVE'",
      "  JOIN public.work_schedule_days AS sd",
      "    ON sd.organization_id = a.organization_id",
      "   AND sd.schedule_id = a.schedule_id",
      "   AND sd.day_of_week = EXTRACT(ISODOW FROM cd.work_date)::int",
      "  LEFT JOIN public.organization_settings AS os",
      "    ON os.organization_id = e.organization_id",
      "  ORDER BY e.id, cd.work_date, a.effective_from DESC, a.created_at DESC, a.id DESC",
      "),",
      "effective_events AS (",
      "  SELECT",
      "    ae.id::text AS source_id,",
      "    ae.employee_id,",
      "    ae.work_date,",
      "    ae.event_type,",
      "    COALESCE(c.requested_at, ae.recorded_at) AS recorded_at",
      "  FROM public.attendance_events AS ae",
      "  JOIN scheduled_days AS sd",
      "    ON sd.employee_id = ae.employee_id",
      "   AND sd.work_date = ae.work_date",
      "  LEFT JOIN LATERAL (",
      "    SELECT cr.id, cr.requested_at",
      "    FROM public.attendance_correction_requests AS cr",
      "    WHERE cr.organization_id = ae.organization_id",
      "      AND cr.employee_id = ae.employee_id",
      "      AND cr.original_event_id = ae.id",
      "      AND cr.status = 'APPROVED'",
      "      AND cr.decision_at <= $4::timestamptz",
      "    ORDER BY cr.decision_at DESC, cr.id DESC",
      "    LIMIT 1",
      "  ) AS c ON TRUE",
      "  WHERE ae.organization_id = $1::uuid",
      "    AND ae.work_date BETWEEN ($2::date - CASE WHEN $2::date = $5::date THEN 1 ELSE 0 END) AND $3::date",
      "    AND COALESCE(c.requested_at, ae.recorded_at) <= $4::timestamptz",
      "",
      "  UNION ALL",
      "",
      "  SELECT",
      "    ('CORRECTION:' || cr.id::text) AS source_id,",
      "    cr.employee_id,",
      "    cr.work_date,",
      "    cr.event_type,",
      "    cr.requested_at AS recorded_at",
      "  FROM public.attendance_correction_requests AS cr",
      "  JOIN scheduled_days AS sd",
      "    ON sd.employee_id = cr.employee_id",
      "   AND sd.work_date = cr.work_date",
      "  WHERE cr.organization_id = $1::uuid",
      "    AND cr.original_event_id IS NULL",
      "    AND cr.status = 'APPROVED'",
      "    AND cr.decision_at <= $4::timestamptz",
      "    AND cr.requested_at <= $4::timestamptz",
      "    AND cr.work_date BETWEEN ($2::date - CASE WHEN $2::date = $5::date THEN 1 ELSE 0 END) AND $3::date",
      "),",
      "event_summary AS (",
      "  SELECT",
      "    employee_id,",
      "    work_date,",
      "    COUNT(*)::int AS event_count,",
      "    COALESCE(",
      "      jsonb_agg(",
      "        jsonb_build_object(",
      "          'id', source_id,",
      "          'eventType', event_type,",
      "          'recordedAt', recorded_at",
      "        ) ORDER BY recorded_at, source_id",
      "      ),",
      "      '[]'::jsonb",
      "    ) AS events",
      "  FROM effective_events",
      "  GROUP BY employee_id, work_date",
      "),",
      "approved_overtime AS (",
      "  SELECT",
      "    ot.employee_id,",
      "    ot.work_date,",
      "    LEAST(1440, SUM(ot.approved_minutes))::int AS approved_minutes",
      "  FROM public.attendance_overtime_requests AS ot",
      "  JOIN scheduled_days AS sd",
      "    ON sd.employee_id = ot.employee_id",
      "   AND sd.work_date = ot.work_date",
      "  WHERE ot.organization_id = $1::uuid",
      "    AND ot.status = 'APPROVED'",
      "    AND ot.request_type = 'PREAUTHORIZATION'",
      "    AND ot.decision_at <= $4::timestamptz",
      "    AND ot.work_date BETWEEN ($2::date - CASE WHEN $2::date = $5::date THEN 1 ELSE 0 END) AND $3::date",
      "  GROUP BY ot.employee_id, ot.work_date",
      ")",
      "SELECT",
      "  sd.employee_id AS \"employeeId\",",
      "  TO_CHAR(sd.work_date, 'YYYY-MM-DD') AS \"workDate\",",
      "  sd.expected_start AS \"expectedStart\",",
      "  sd.expected_end AS \"expectedEnd\",",
      "  sd.break_minutes AS \"scheduledBreakMinutes\",",
      "  COALESCE(es.event_count, 0)::int AS \"eventCount\",",
      "  COALESCE(es.events, '[]'::jsonb) AS events,",
      "  COALESCE(ot.approved_minutes, 0)::int AS \"approvedOvertimeMinutes\",",
      "  EXISTS (",
      "    SELECT 1",
      "    FROM public.leave_requests AS lr",
      "    WHERE lr.organization_id = $1::uuid",
      "      AND lr.employee_id = sd.employee_id",
      "      AND lr.status = 'APPROVED'",
      "      AND sd.work_date BETWEEN lr.start_date AND lr.end_date",
      "  ) AS \"hasApprovedLeave\",",
      "  ph.name AS \"publicHolidayName\"",
      "FROM scheduled_days AS sd",
      "LEFT JOIN event_summary AS es",
      "  ON es.employee_id = sd.employee_id",
      " AND es.work_date = sd.work_date",
      "LEFT JOIN approved_overtime AS ot",
      "  ON ot.employee_id = sd.employee_id",
      " AND ot.work_date = sd.work_date",
      "LEFT JOIN public.public_holidays AS ph",
      "  ON ph.organization_id = $1::uuid",
      " AND ph.holiday_date = sd.work_date",
      "WHERE sd.work_date >= $2::date",
      "   OR ($2::date = $5::date",
      "       AND sd.work_date = $2::date - 1",
      "       AND sd.expected_start <= $4::timestamptz",
      "       AND sd.expected_end > $4::timestamptz)",
      "ORDER BY sd.work_date, sd.employee_id",
      "LIMIT " + (MAX_ATTENDANCE_ROWS + 1),
    ].join("\n"),
    values,
  );

  if (result.rows.length > MAX_ATTENDANCE_ROWS) {
    throw new ManagementDashboardAttendanceResultLimitError();
  }

  const dates = dateRange(input.fromDate, input.toDate);
  const trendByDate = new Map<string, AttendanceDayAccumulator>();
  for (const date of dates) {
    trendByDate.set(date, createDayAccumulator());
  }

  const scheduledEmployees = new Set<string>();
  const seenEmployeeDays = new Set<string>();

  let todayScheduledShiftDays = 0;
  let todayEligibleShiftDays = 0;
  let todayNotYetDue = 0;
  let todayNoClockInDuringActiveShift = 0;
  let todayOpenSessions = 0;
  let todayCompletedSessions = 0;
  let todayPresentEmployees = 0;

  for (const row of result.rows) {
    if (typeof row.employeeId !== "string" || row.employeeId.length === 0) {
      throw new Error("The attendance summary returned a row without an employee identifier");
    }

    const isActivePreviousDayShift =
      row.workDate === previousCalendarDate(input.organizationToday) &&
      dateValue(row.expectedStart, "scheduled shift start").getTime() <= generatedAt.getTime() &&
      dateValue(row.expectedEnd, "scheduled shift end").getTime() > generatedAt.getTime();
    const isWithinRequestedPeriod = trendByDate.has(row.workDate);

    if (!isWithinRequestedPeriod && !(
      input.fromDate === input.organizationToday && isActivePreviousDayShift
    )) {
      throw new Error("The attendance summary returned a work date outside the requested period");
    }

    const employeeDayKey = row.employeeId + ":" + row.workDate;
    if (seenEmployeeDays.has(employeeDayKey)) {
      throw new Error("The attendance summary returned a duplicate scheduled employee-day");
    }
    seenEmployeeDays.add(employeeDayKey);

    const events = parseEvents(row.events);
    const eventCount = countValue(row.eventCount, "attendance event count");
    if (eventCount !== events.length) {
      throw new Error("Attendance event count does not match the returned event details");
    }

    const expectedStart = dateValue(row.expectedStart, "scheduled shift start");
    const expectedEnd = dateValue(row.expectedEnd, "scheduled shift end");
    if (expectedEnd.getTime() <= expectedStart.getTime()) {
      throw new Error("The attendance summary returned a scheduled shift with an invalid time range");
    }

    const scheduledBreakMinutes = countValue(
      row.scheduledBreakMinutes,
      "scheduled break duration",
    );
    const approvedOvertimeMinutes = countValue(
      row.approvedOvertimeMinutes,
      "approved overtime minutes",
    );

    if (typeof row.hasApprovedLeave !== "boolean") {
      throw new Error("The attendance summary returned an invalid approved-leave state");
    }

    const hasPublicHoliday = row.publicHolidayName !== null;
    const eligible = !row.hasApprovedLeave && !hasPublicHoliday;
    const hasClockIn = hasEffectiveClockIn(events);

    const calculation = calculateDailyAttendance({
      events,
      expectedStart,
      expectedEnd,
      scheduledBreakMinutes,
      approvedOvertimeMinutes,
      asOf: generatedAt,
      estimateOpenSessionDuration: expectedEnd.getTime() > generatedAt.getTime(),
    });

    const durationMinutes = Math.max(
      0,
      Math.floor((expectedEnd.getTime() - expectedStart.getTime()) / 60_000),
    );
    const scheduledMinutes = Math.max(
      0,
      durationMinutes - scheduledBreakMinutes,
    );

    const day = trendByDate.get(row.workDate);

    if (day) {
      day.scheduledShiftDays += 1;
      day.workedMinutes += calculation.workedMinutes;
      day.regularWorkedMinutes += calculation.regularWorkedMinutes;
      day.potentialOvertimeMinutes += calculation.potentialOvertimeMinutes;
      day.payableOvertimeMinutes += calculation.payableOvertimeMinutes;
      if (events.length > 0 && calculation.calculationStatus === "COMPLETE") {
        day.completedShiftDays += 1;
      }
      if (eligible) {
        day.eligibleShiftDays += 1;
        day.scheduledMinutes += scheduledMinutes;
        if (hasClockIn) {
          day.presentShiftDays += 1;
        }
      }
      scheduledEmployees.add(row.employeeId);
    }

    if (row.workDate === input.organizationToday) {
      todayScheduledShiftDays += 1;

      if (eligible) {
        todayEligibleShiftDays += 1;
        if (hasClockIn) {
          todayPresentEmployees += 1;
        }

        if (!hasClockIn && expectedStart.getTime() > generatedAt.getTime()) {
          todayNotYetDue += 1;
        } else if (
          !hasClockIn &&
          expectedStart.getTime() <= generatedAt.getTime() &&
          expectedEnd.getTime() > generatedAt.getTime()
        ) {
          todayNoClockInDuringActiveShift += 1;
        }
      }

      if (calculation.openSession) {
        todayOpenSessions += 1;
      }

      if (events.length > 0 && calculation.calculationStatus === "COMPLETE") {
        todayCompletedSessions += 1;
      }
    } else if (isActivePreviousDayShift) {
      // Overnight shifts are stored under the local date on which the shift
      // started. Include their live exception/open-session state in today's
      // pulse without adding the previous work date to today's rate.
      if (eligible && !hasClockIn) {
        todayNoClockInDuringActiveShift += 1;
      }
      if (calculation.openSession) {
        todayOpenSessions += 1;
      }
    }
  }

  const dailyTrend = dates.map((workDate) => {
    const day = trendByDate.get(workDate);
    if (!day) {
      throw new Error("The attendance summary is missing a selected date");
    }

    return {
      workDate,
      scheduledShiftDays: day.scheduledShiftDays,
      eligibleShiftDays: day.eligibleShiftDays,
      presentShiftDays: day.presentShiftDays,
      attendanceRate: percentage(day.presentShiftDays, day.eligibleShiftDays),
      scheduledMinutes: day.scheduledMinutes,
      workedMinutes: day.workedMinutes,
      potentialOvertimeMinutes: day.potentialOvertimeMinutes,
      payableOvertimeMinutes: day.payableOvertimeMinutes,
    };
  });

  const period = dailyTrend.reduce<ManagementDashboardAttendancePeriod>(
    (total, day) => {
      const accumulator = trendByDate.get(day.workDate);
      return {
        scheduledShiftDays: total.scheduledShiftDays + day.scheduledShiftDays,
        uniqueScheduledEmployees: 0,
        eligibleShiftDays: total.eligibleShiftDays + day.eligibleShiftDays,
        presentShiftDays: total.presentShiftDays + day.presentShiftDays,
        attendanceRate: null,
        scheduledMinutes: total.scheduledMinutes + day.scheduledMinutes,
        workedMinutes: total.workedMinutes + day.workedMinutes,
        regularWorkedMinutes: total.regularWorkedMinutes +
          (accumulator?.regularWorkedMinutes ?? 0),
        potentialOvertimeMinutes:
          total.potentialOvertimeMinutes + day.potentialOvertimeMinutes,
        payableOvertimeMinutes:
          total.payableOvertimeMinutes + day.payableOvertimeMinutes,
        completedShiftDays: total.completedShiftDays +
          (accumulator?.completedShiftDays ?? 0),
      };
    },
    {
      scheduledShiftDays: 0,
      uniqueScheduledEmployees: 0,
      eligibleShiftDays: 0,
      presentShiftDays: 0,
      attendanceRate: null,
      scheduledMinutes: 0,
      workedMinutes: 0,
      regularWorkedMinutes: 0,
      potentialOvertimeMinutes: 0,
      payableOvertimeMinutes: 0,
      completedShiftDays: 0,
    },
  );

  period.uniqueScheduledEmployees = scheduledEmployees.size;
  period.attendanceRate = percentage(
    period.presentShiftDays,
    period.eligibleShiftDays,
  );

  return {
    generatedAt: generatedAt.toISOString(),
    period,
    today: {
      scheduledShiftDays: todayScheduledShiftDays,
      eligibleShiftDays: todayEligibleShiftDays,
      presentEmployees: todayPresentEmployees,
      attendanceRate: percentage(todayPresentEmployees, todayEligibleShiftDays),
      notYetDue: todayNotYetDue,
      noClockInDuringActiveShift: todayNoClockInDuringActiveShift,
      openSessions: todayOpenSessions,
      completedSessions: todayCompletedSessions,
    },
    dailyTrend,
  };
}
