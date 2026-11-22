import type { PoolClient } from "pg";

import { isExcludedHrTargetRole } from "../workforce-eligibility";
import type { ManagementDashboardScope } from "./scope";

const MAX_LEAVE_AVAILABILITY_ROWS = 100_000;

export class ManagementDashboardLeaveAvailabilityResultLimitError extends Error {
  constructor() {
    super("The selected leave and availability period exceeds the 100,000 scheduled employee-day or review-request limit. Choose a shorter period or narrower department.");
    this.name = "ManagementDashboardLeaveAvailabilityResultLimitError";
  }
}

export type ManagementDashboardLeaveTrendDay = {
  workDate: string;
  scheduledShiftDays: number;
  publicHolidayShiftDays: number;
  eligibleShiftDays: number;
  approvedLeaveShiftDays: number;
  availableShiftDays: number;
  availabilityRate: number | null;
};

export type ManagementDashboardLeaveAvailabilitySummary = {
  generatedAt: string;
  period: {
    approvedRequests: number;
    approvedEmployees: number;
    approvedCalendarDays: number;
    actionablePendingRequests: number;
    uniqueScheduledEmployees: number;
    scheduledShiftDays: number;
    publicHolidayShiftDays: number;
    eligibleShiftDays: number;
    approvedLeaveShiftDays: number;
    availableShiftDays: number;
    availabilityRate: number | null;
  };
  upcoming: {
    approvedRequests: number;
    employees: number;
    calendarDays: number;
  };
  today: {
    employeesOnApprovedLeave: number;
    scheduledEmployees: number;
    eligibleScheduledEmployees: number;
    scheduledEmployeesOnApprovedLeave: number;
    publicHolidayScheduledEmployees: number;
    availableEmployees: number;
    availabilityRate: number | null;
  };
  dailyTrend: ManagementDashboardLeaveTrendDay[];
};

type LeaveAggregateRow = {
  approvedRequests: number | string;
  approvedEmployees: number | string;
  approvedCalendarDays: number | string;
  upcomingApprovedRequests: number | string;
  upcomingApprovedEmployees: number | string;
  upcomingApprovedCalendarDays: number | string;
  todayEmployeesOnApprovedLeave: number | string;
};

type PendingReviewRow = {
  employeeId: string;
  workforceRole: string;
};

type AvailabilityRow = {
  employeeId: string;
  workDate: string;
  hasApprovedLeave: boolean;
  publicHolidayName: string | null;
};

type AvailabilityAccumulator = {
  scheduledShiftDays: number;
  publicHolidayShiftDays: number;
  eligibleShiftDays: number;
  approvedLeaveShiftDays: number;
  availableShiftDays: number;
};

function countValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The leave and availability summary returned an invalid " + field + " count");
  }
  return parsed;
}

function dateValue(value: unknown, field: string): Date {
  const parsed = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : new Date("");
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("The leave and availability summary returned an invalid " + field);
  }
  return parsed;
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
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

function createAvailabilityAccumulator(): AvailabilityAccumulator {
  return {
    scheduledShiftDays: 0,
    publicHolidayShiftDays: 0,
    eligibleShiftDays: 0,
    approvedLeaveShiftDays: 0,
    availableShiftDays: 0,
  };
}

/**
 * The active workforce CTE intentionally mirrors the Step 6 shared population:
 * tenant-local organization workforce role, EMPLOYEE fallback for a missing
 * role, and authenticated Department Manager EXISTS scope. The department
 * filter can narrow that population only.
 */
function buildScopedActiveWorkforce(
  scope: ManagementDashboardScope,
  input: {
    fromDate: string;
    toDate: string;
    organizationToday: string;
    departmentId?: string | null;
  },
): { sql: string; values: unknown[] } {
  const values: unknown[] = [
    scope.organizationId,
    input.fromDate,
    input.toDate,
    input.organizationToday,
  ];

  let managerFilter = "";
  if (scope.kind === "ASSIGNED_DEPARTMENTS") {
    values.push(scope.managerEmployeeId);
    managerFilter = [
      "AND EXISTS (",
      "  SELECT 1",
      "  FROM public.departments AS managed_department",
      "  WHERE managed_department.organization_id = e.organization_id",
      "    AND managed_department.id = e.department_id",
      "    AND managed_department.manager_id = $" + values.length + "::uuid",
      ")",
    ].join("\n");
  }

  let departmentFilter = "";
  if (input.departmentId) {
    values.push(input.departmentId);
    departmentFilter = "AND e.department_id = $" + values.length + "::uuid";
  }

  const sql = [
    "WITH scoped_active_workforce AS (",
    "  SELECT",
    "    e.id,",
    "    e.department_id,",
    "    COALESCE(workforce_role.name, 'EMPLOYEE') AS workforce_role",
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
    "    " + managerFilter,
    "    " + departmentFilter,
    ")",
  ].join("\n");

  return { sql, values };
}

function buildScopedReviewWorkforce(
  scope: ManagementDashboardScope,
  input: {
    fromDate: string;
    toDate: string;
    organizationToday: string;
    departmentId?: string | null;
  },
): { sql: string; values: unknown[] } {
  const values: unknown[] = [
    scope.organizationId,
    input.fromDate,
    input.toDate,
    input.organizationToday,
  ];

  let managerFilter = "";
  if (scope.kind === "ASSIGNED_DEPARTMENTS") {
    values.push(scope.managerEmployeeId);
    managerFilter = [
      "AND EXISTS (",
      "  SELECT 1",
      "  FROM public.departments AS managed_department",
      "  WHERE managed_department.organization_id = e.organization_id",
      "    AND managed_department.id = e.department_id",
      "    AND managed_department.manager_id = $" + values.length + "::uuid",
      ")",
    ].join("\n");
  }

  let departmentFilter = "";
  if (input.departmentId) {
    values.push(input.departmentId);
    departmentFilter = "AND e.department_id = $" + values.length + "::uuid";
  }

  const sql = [
    "WITH reviewable_workforce AS (",
    "  SELECT",
    "    e.id,",
    "    COALESCE(workforce_role.name, 'EMPLOYEE') AS workforce_role",
    "  FROM public.employees AS e",
    "  LEFT JOIN public.roles AS workforce_role",
    "    ON workforce_role.id = e.workforce_role_id",
    "   AND workforce_role.organization_id = e.organization_id",
    "  WHERE e.organization_id = $1::uuid",
    "    " + managerFilter,
    "    " + departmentFilter,
    ")",
  ].join("\n");

  return { sql, values };
}

/**
 * Calculates leave and schedule availability in one read-only snapshot.
 *
 * Leave calendar days are inclusive date overlap, not paid entitlement or
 * scheduled work days. Availability is based only on an active schedule
 * assignment for the date; public holidays are removed from the denominator.
 */
export async function loadManagementDashboardLeaveAvailabilitySummary(
  client: PoolClient,
  scope: ManagementDashboardScope,
  input: {
    fromDate: string;
    toDate: string;
    organizationToday: string;
    departmentId?: string | null;
  },
): Promise<ManagementDashboardLeaveAvailabilitySummary> {
  const { sql: scopedCte, values } = buildScopedActiveWorkforce(scope, input);

  const [generationResult, leaveResult] = await Promise.all([
    client.query<{ generatedAt: Date | string }>(
      "SELECT CURRENT_TIMESTAMP AS \"generatedAt\"",
    ),
    client.query<LeaveAggregateRow>(
      scopedCte + "\n" + [
        "SELECT",
        "  COUNT(lr.id) FILTER (",
        "    WHERE lr.status = 'APPROVED'",
        "      AND lr.start_date <= $3::date",
        "      AND lr.end_date >= $2::date",
        "  )::int AS \"approvedRequests\",",
        "  COUNT(DISTINCT lr.employee_id) FILTER (",
        "    WHERE lr.status = 'APPROVED'",
        "      AND lr.start_date <= $3::date",
        "      AND lr.end_date >= $2::date",
        "  )::int AS \"approvedEmployees\",",
        "  COALESCE(SUM(",
        "    CASE",
        "      WHEN lr.status = 'APPROVED'",
        "       AND lr.start_date <= $3::date",
        "       AND lr.end_date >= $2::date",
        "      THEN (LEAST(lr.end_date, $3::date) - GREATEST(lr.start_date, $2::date) + 1)::bigint",
        "      ELSE 0",
        "    END",
        "  ), 0)::bigint AS \"approvedCalendarDays\",",
        "  COUNT(lr.id) FILTER (",
        "    WHERE lr.status = 'APPROVED'",
        "      AND lr.start_date <= $3::date",
        "      AND lr.end_date >= GREATEST($2::date, $4::date + 1)",
        "  )::int AS \"upcomingApprovedRequests\",",
        "  COUNT(DISTINCT lr.employee_id) FILTER (",
        "    WHERE lr.status = 'APPROVED'",
        "      AND lr.start_date <= $3::date",
        "      AND lr.end_date >= GREATEST($2::date, $4::date + 1)",
        "  )::int AS \"upcomingApprovedEmployees\",",
        "  COALESCE(SUM(",
        "    CASE",
        "      WHEN lr.status = 'APPROVED'",
        "       AND lr.start_date <= $3::date",
        "       AND lr.end_date >= GREATEST($2::date, $4::date + 1)",
        "      THEN (LEAST(lr.end_date, $3::date) - GREATEST(lr.start_date, $2::date, $4::date + 1) + 1)::bigint",
        "      ELSE 0",
        "    END",
        "  ), 0)::bigint AS \"upcomingApprovedCalendarDays\",",
        "  COUNT(DISTINCT lr.employee_id) FILTER (",
        "    WHERE lr.status = 'APPROVED'",
        "      AND lr.start_date <= $4::date",
        "      AND lr.end_date >= $4::date",
        "  )::int AS \"todayEmployeesOnApprovedLeave\"",
        "FROM scoped_active_workforce AS sw",
        "LEFT JOIN public.leave_requests AS lr",
        "  ON lr.organization_id = $1::uuid",
        " AND lr.employee_id = sw.id",
        " AND lr.status = 'APPROVED'",
        " AND (",
        "   (lr.start_date <= $3::date AND lr.end_date >= $2::date)",
        "   OR (lr.start_date <= $4::date AND lr.end_date >= $4::date)",
        " )",
      ].join("\n"),
      values,
    ),
  ]);

  const generatedAtValue = generationResult.rows[0]?.generatedAt;
  const generatedAt = dateValue(generatedAtValue, "generation timestamp");
  const aggregate = leaveResult.rows[0];
  if (!aggregate) {
    throw new Error("The leave and availability summary could not be calculated");
  }

  const approvedRequests = countValue(aggregate.approvedRequests, "approved request");
  const approvedEmployees = countValue(aggregate.approvedEmployees, "approved employee");
  const approvedCalendarDays = countValue(aggregate.approvedCalendarDays, "approved calendar day");
  const upcomingApprovedRequests = countValue(aggregate.upcomingApprovedRequests, "upcoming approved request");
  const upcomingApprovedEmployees = countValue(aggregate.upcomingApprovedEmployees, "upcoming approved employee");
  const upcomingApprovedCalendarDays = countValue(aggregate.upcomingApprovedCalendarDays, "upcoming approved calendar day");
  const todayEmployeesOnApprovedLeave = countValue(
    aggregate.todayEmployeesOnApprovedLeave,
    "employee on approved leave today",
  );

  const { sql: reviewCte, values: reviewValues } = buildScopedReviewWorkforce(
    scope,
    input,
  );
  const pendingResult = await client.query<PendingReviewRow>(
    reviewCte + "\n" + [
      "SELECT",
      "  lr.employee_id AS \"employeeId\",",
      "  sw.workforce_role AS \"workforceRole\"",
      "FROM reviewable_workforce AS sw",
      "JOIN public.leave_requests AS lr",
      "  ON lr.organization_id = $1::uuid",
      " AND lr.employee_id = sw.id",
      "WHERE lr.status = 'PENDING'",
      "  AND lr.start_date <= $3::date",
      "  AND lr.end_date >= $2::date",
      "ORDER BY lr.created_at, lr.id",
      "LIMIT " + (MAX_LEAVE_AVAILABILITY_ROWS + 1),
    ].join("\n"),
    reviewValues,
  );

  if (pendingResult.rows.length > MAX_LEAVE_AVAILABILITY_ROWS) {
    throw new ManagementDashboardLeaveAvailabilityResultLimitError();
  }

  const actorEmployeeId = scope.kind === "ORGANIZATION"
    ? scope.actorEmployeeId
    : scope.managerEmployeeId;
  const actionablePendingRequests = pendingResult.rows.filter((row) => {
    if (
      typeof row.employeeId !== "string" ||
      typeof row.workforceRole !== "string"
    ) {
      throw new Error("The leave review summary returned an invalid pending request");
    }

    if (scope.roleName === "ORGANIZATION_ADMIN") {
      return true;
    }

    if (actorEmployeeId && row.employeeId === actorEmployeeId) {
      return false;
    }

    return !isExcludedHrTargetRole(row.workforceRole);
  }).length;

  const availabilityResult = await client.query<AvailabilityRow>(
    scopedCte + "\n" + [
      ", calendar_days AS (",
      "  SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS work_date",
      "  UNION",
      "  SELECT $4::date AS work_date",
      "),",
      "scheduled_days AS (",
      "  SELECT DISTINCT ON (sw.id, cd.work_date)",
      "    sw.id AS employee_id,",
      "    cd.work_date,",
      "    EXISTS (",
      "      SELECT 1",
      "      FROM public.leave_requests AS lr",
      "      WHERE lr.organization_id = $1::uuid",
      "        AND lr.employee_id = sw.id",
      "        AND lr.status = 'APPROVED'",
      "        AND cd.work_date BETWEEN lr.start_date AND lr.end_date",
      "    ) AS has_approved_leave,",
      "    ph.name AS public_holiday_name",
      "  FROM scoped_active_workforce AS sw",
      "  CROSS JOIN calendar_days AS cd",
      "  JOIN public.employee_schedule_assignments AS a",
      "    ON a.organization_id = $1::uuid",
      "   AND a.employee_id = sw.id",
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
      "  LEFT JOIN public.public_holidays AS ph",
      "    ON ph.organization_id = $1::uuid",
      "   AND ph.holiday_date = cd.work_date",
      "  ORDER BY sw.id, cd.work_date, a.effective_from DESC, a.created_at DESC, a.id DESC",
      ")",
      "SELECT",
      "  employee_id AS \"employeeId\",",
      "  TO_CHAR(work_date, 'YYYY-MM-DD') AS \"workDate\",",
      "  has_approved_leave AS \"hasApprovedLeave\",",
      "  public_holiday_name AS \"publicHolidayName\"",
      "FROM scheduled_days",
      "WHERE work_date BETWEEN $2::date AND $3::date",
      "   OR work_date = $4::date",
      "ORDER BY work_date, employee_id",
      "LIMIT " + (MAX_LEAVE_AVAILABILITY_ROWS + 1),
    ].join("\n"),
    values,
  );

  if (availabilityResult.rows.length > MAX_LEAVE_AVAILABILITY_ROWS) {
    throw new ManagementDashboardLeaveAvailabilityResultLimitError();
  }

  const selectedDates = dateRange(input.fromDate, input.toDate);
  const trendByDate = new Map<string, AvailabilityAccumulator>();
  for (const date of selectedDates) {
    trendByDate.set(date, createAvailabilityAccumulator());
  }

  const scheduledEmployees = new Set<string>();
  const seenEmployeeDays = new Set<string>();
  let todayScheduledEmployees = 0;
  let todayEligibleScheduledEmployees = 0;
  let todayScheduledEmployeesOnApprovedLeave = 0;
  let todayPublicHolidayScheduledEmployees = 0;
  let todayAvailableEmployees = 0;

  for (const row of availabilityResult.rows) {
    if (
      typeof row.employeeId !== "string" ||
      !row.employeeId ||
      typeof row.workDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.workDate) ||
      typeof row.hasApprovedLeave !== "boolean" ||
      !(row.publicHolidayName === null || typeof row.publicHolidayName === "string")
    ) {
      throw new Error("The leave and availability summary returned an invalid scheduled employee-day");
    }

    const day = trendByDate.get(row.workDate);
    if (!day && row.workDate !== input.organizationToday) {
      throw new Error("The leave and availability summary returned a date outside the requested period");
    }

    const employeeDayKey = row.employeeId + ":" + row.workDate;
    if (seenEmployeeDays.has(employeeDayKey)) {
      throw new Error("The leave and availability summary returned a duplicate scheduled employee-day");
    }
    seenEmployeeDays.add(employeeDayKey);

    const hasPublicHoliday = row.publicHolidayName !== null;

    if (day) {
      day.scheduledShiftDays += 1;
      scheduledEmployees.add(row.employeeId);

      if (hasPublicHoliday) {
        day.publicHolidayShiftDays += 1;
      } else {
        day.eligibleShiftDays += 1;
        if (row.hasApprovedLeave) {
          day.approvedLeaveShiftDays += 1;
        } else {
          day.availableShiftDays += 1;
        }
      }
    }

    if (row.workDate === input.organizationToday) {
      todayScheduledEmployees += 1;
      if (hasPublicHoliday) {
        todayPublicHolidayScheduledEmployees += 1;
      } else {
        todayEligibleScheduledEmployees += 1;
        if (!row.hasApprovedLeave) {
          todayAvailableEmployees += 1;
        }
      }
      if (row.hasApprovedLeave) {
        todayScheduledEmployeesOnApprovedLeave += 1;
      }
    }
  }

  const dailyTrend = selectedDates.map((workDate) => {
    const day = trendByDate.get(workDate);
    if (!day) {
      throw new Error("The leave and availability summary is missing a selected date");
    }

    return {
      workDate,
      scheduledShiftDays: day.scheduledShiftDays,
      publicHolidayShiftDays: day.publicHolidayShiftDays,
      eligibleShiftDays: day.eligibleShiftDays,
      approvedLeaveShiftDays: day.approvedLeaveShiftDays,
      availableShiftDays: day.availableShiftDays,
      availabilityRate: percentage(day.availableShiftDays, day.eligibleShiftDays),
    };
  });

  const periodAvailability = dailyTrend.reduce((total, day) => ({
    scheduledShiftDays: total.scheduledShiftDays + day.scheduledShiftDays,
    publicHolidayShiftDays: total.publicHolidayShiftDays + day.publicHolidayShiftDays,
    eligibleShiftDays: total.eligibleShiftDays + day.eligibleShiftDays,
    approvedLeaveShiftDays: total.approvedLeaveShiftDays + day.approvedLeaveShiftDays,
    availableShiftDays: total.availableShiftDays + day.availableShiftDays,
  }), createAvailabilityAccumulator());

  return {
    generatedAt: generatedAt.toISOString(),
    period: {
      approvedRequests,
      approvedEmployees,
      approvedCalendarDays,
      actionablePendingRequests,
      uniqueScheduledEmployees: scheduledEmployees.size,
      scheduledShiftDays: periodAvailability.scheduledShiftDays,
      publicHolidayShiftDays: periodAvailability.publicHolidayShiftDays,
      eligibleShiftDays: periodAvailability.eligibleShiftDays,
      approvedLeaveShiftDays: periodAvailability.approvedLeaveShiftDays,
      availableShiftDays: periodAvailability.availableShiftDays,
      availabilityRate: percentage(
        periodAvailability.availableShiftDays,
        periodAvailability.eligibleShiftDays,
      ),
    },
    upcoming: {
      approvedRequests: upcomingApprovedRequests,
      employees: upcomingApprovedEmployees,
      calendarDays: upcomingApprovedCalendarDays,
    },
    today: {
      employeesOnApprovedLeave: todayEmployeesOnApprovedLeave,
      scheduledEmployees: todayScheduledEmployees,
      eligibleScheduledEmployees: todayEligibleScheduledEmployees,
      scheduledEmployeesOnApprovedLeave: todayScheduledEmployeesOnApprovedLeave,
      publicHolidayScheduledEmployees: todayPublicHolidayScheduledEmployees,
      availableEmployees: todayAvailableEmployees,
      availabilityRate: percentage(
        todayAvailableEmployees,
        todayEligibleScheduledEmployees,
      ),
    },
    dailyTrend,
  };
}
