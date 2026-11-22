import type { PoolClient } from "pg";

import { calculateOrganizationMonthlyPay } from "../monthly-salary-calculation";
import { loadManagementDashboardAttendanceSummary } from "./attendance-summary";
import type { ManagementDashboardScope } from "./scope";

const MAX_PAYROLL_EMPLOYEES = 500;

export class ManagementDashboardPayrollOvertimeResultLimitError extends Error {
  constructor() {
    super("The selected payroll period exceeds the dashboard's safe workforce limit. Narrow the report scope or contact support.");
    this.name = "ManagementDashboardPayrollOvertimeResultLimitError";
  }
}

export type ManagementDashboardMoneyBreakdown = {
  currencyCode: string;
  amount: string;
  employees: number;
};

export type ManagementDashboardPayrollOvertimeSummary = {
  generatedAt: string;
  month: string;
  payroll: {
    eligibleEmployees: number;
    employeesWithPayableEarnings: number;
    employeesWithoutPayableHours: number;
    estimateReadyEmployees: number;
    employeesMissingRates: number;
    employeesWithCurrencyMismatch: number;
    recordedPaymentCount: number;
    paidPaymentCount: number;
    unpaidPaymentCount: number;
    employeesWithoutPaymentRecord: number;
    estimatedPayableByCurrency: ManagementDashboardMoneyBreakdown[];
    recordedPaidByCurrency: ManagementDashboardMoneyBreakdown[];
    recordedUnpaidByCurrency: ManagementDashboardMoneyBreakdown[];
  };
  overtime: {
    scheduledEmployees: number;
    preauthorization: {
      pendingRequests: number;
      approvedRequests: number;
      rejectedRequests: number;
      pendingRequestedMinutes: number;
      approvedMinutes: number;
      rejectedRequestedMinutes: number;
    };
    worked: {
      actualOvertimeMinutes: number;
      payableOvertimeMinutes: number;
      unapprovedExcessMinutes: number;
    };
    excessReviewCases: {
      openCases: number;
      reviewedNoPayCases: number;
      followUpCases: number;
      recordedExcessMinutes: number;
    };
  };
};

type PayrollRosterRow = { employeeId: string };
type PaymentLedgerRow = {
  employeeId: string;
  amount: string | number;
  currencyCode: string;
  status: "PAID" | "UNPAID";
};
type OvertimeAggregateRow = {
  status: string;
  requestCount: number | string;
  requestedMinutes: number | string;
  approvedMinutes: number | string;
};
type ExcessReviewAggregateRow = {
  status: string;
  reviewCount: number | string;
  excessMinutes: number | string;
};
type GenerationRow = { generatedAt: Date | string };
type MoneyAccumulator = { cents: number; employees: Set<string> };

function countValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The payroll and overtime summary returned an invalid " + field);
  }
  return parsed;
}

function moneyCents(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("The payroll and overtime summary returned an invalid " + field);
  }
  const cents = Math.round((parsed + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("The payroll and overtime summary returned an unsafe " + field);
  }
  return cents;
}

function timestampValue(value: Date | string | undefined): Date {
  const parsed = value instanceof Date ? value : new Date(value ?? "");
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("The payroll and overtime summary returned an invalid generation timestamp");
  }
  return parsed;
}

function addMoney(
  target: Map<string, MoneyAccumulator>,
  currencyValue: unknown,
  amountValue: unknown,
  employeeId: string,
  label: string,
): void {
  if (typeof currencyValue !== "string") {
    throw new Error("The payroll and overtime summary returned a missing " + label + " currency");
  }
  const currencyCode = currencyValue.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("The payroll and overtime summary returned an invalid " + label + " currency");
  }
  const cents = moneyCents(amountValue, label + " amount");
  const current = target.get(currencyCode) ?? { cents: 0, employees: new Set<string>() };
  current.cents += cents;
  if (!Number.isSafeInteger(current.cents)) {
    throw new Error("The payroll and overtime summary exceeded the safe " + label + " total");
  }
  current.employees.add(employeeId);
  target.set(currencyCode, current);
}

function moneyBreakdown(source: Map<string, MoneyAccumulator>): ManagementDashboardMoneyBreakdown[] {
  return [...source.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, value]) => ({
      currencyCode,
      amount: (value.cents / 100).toFixed(2),
      employees: value.employees.size,
    }));
}

function monthDates(month: string): {
  fromDate: string;
  toDate: string;
  nextMonthStart: string;
} {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    fromDate: month + "-01",
    toDate: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
    nextMonthStart: new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10),
  };
}

/**
 * Mirrors GET /api/payroll/payments for management roles. Organization Admin
 * can view employee and workforce-manager payroll records; HR Manager sees
 * Employee and Department Manager records except their own; Department
 * Manager sees Employee-role records in assigned departments only.
 *
 * This does not grant team payslip access to Department Managers.
 */
async function loadAuthorizedPayrollEmployees(
  client: PoolClient,
  scope: ManagementDashboardScope,
  month: string,
): Promise<string[]> {
  const dates = monthDates(month);
  const isOrganizationAdmin = scope.roleName === "ORGANIZATION_ADMIN";
  const isHrManager = scope.roleName === "HR_MANAGER";
  const isDepartmentManager = scope.kind === "ASSIGNED_DEPARTMENTS";
  const actorEmployeeId = scope.kind === "ORGANIZATION"
    ? scope.actorEmployeeId
    : scope.managerEmployeeId;
  const allowedWorkforceRoles = isOrganizationAdmin
    ? ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER", "HR_MANAGER", "HRMANAGER"]
    : isHrManager
      ? ["EMPLOYEE", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER"]
      : ["EMPLOYEE"];

  const result = await client.query<PayrollRosterRow>(
    [
      "WITH payroll_candidates AS (",
      "  SELECT",
      "    e.id,",
      "    e.employment_status,",
      "    e.organization_id,",
      "    e.department_id,",
      "    regexp_replace(",
      "      UPPER(COALESCE(account_role.name, workforce_role.name, 'EMPLOYEE')),",
      "      '[^A-Z0-9]+', '_', 'g'",
      "    ) AS normalized_role",
      "  FROM public.employees AS e",
      "  LEFT JOIN public.roles AS workforce_role",
      "    ON workforce_role.id = e.workforce_role_id",
      "   AND workforce_role.organization_id = e.organization_id",
      "  LEFT JOIN LATERAL (",
      "    SELECT linked_role.name",
      "    FROM public.users AS workforce_account",
      "    JOIN public.roles AS linked_role",
      "      ON linked_role.id = workforce_account.role_id",
      "     AND linked_role.organization_id = workforce_account.organization_id",
      "     AND linked_role.scope = 'ORGANIZATION'",
      "    WHERE workforce_account.employee_id = e.id",
      "      AND workforce_account.organization_id = e.organization_id",
      "      AND workforce_account.account_scope = 'ORGANIZATION'",
      "    ORDER BY",
      "      CASE WHEN workforce_account.status = 'ACTIVE' THEN 0 ELSE 1 END,",
      "      workforce_account.updated_at DESC NULLS LAST,",
      "      workforce_account.created_at DESC NULLS LAST,",
      "      workforce_account.id",
      "    LIMIT 1",
      "  ) AS account_role ON TRUE",
      "  WHERE e.organization_id = $1::uuid",
      "),",
      "authorized_payroll_workforce AS (",
      "  SELECT candidate.id",
      "  FROM payroll_candidates AS candidate",
      "  WHERE candidate.normalized_role = ANY($2::text[])",
      "    AND candidate.normalized_role NOT LIKE 'ORGANIZATION_ADMIN%'",
      "    AND candidate.normalized_role NOT LIKE 'ORGANIZATIONADMIN%'",
      "    AND candidate.normalized_role NOT LIKE 'ORG_ADMIN%'",
      "    AND candidate.normalized_role NOT LIKE 'ORGANIZATION_OWNER%'",
      "    AND candidate.normalized_role NOT LIKE 'ORG_OWNER%'",
      "    AND candidate.normalized_role NOT LIKE 'TENANT_ADMIN%'",
      "    AND candidate.normalized_role NOT LIKE 'ADMINISTRATOR%'",
      "    AND NOT EXISTS (",
      "      SELECT 1",
      "      FROM public.users AS target_account",
      "      JOIN public.roles AS target_account_role",
      "        ON target_account_role.id = target_account.role_id",
      "       AND target_account_role.organization_id = target_account.organization_id",
      "      WHERE target_account.organization_id = candidate.organization_id",
      "        AND target_account.employee_id = candidate.id",
      "        AND target_account.account_scope = 'ORGANIZATION'",
      "        AND (",
      "          regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g')",
      "            IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR', 'ORG_ADMINISTRATOR', 'ORGANIZATION_OWNER', 'ORG_OWNER', 'TENANT_ADMIN', 'ADMINISTRATOR')",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_ADMIN_%'",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATIONADMIN_%'",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_ADMIN_%'",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_OWNER_%'",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_OWNER_%'",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'TENANT_ADMIN_%'",
      "          OR regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ADMINISTRATOR_%'",
      "        )",
      "    )",
      "    AND (",
      "      candidate.employment_status = 'ACTIVE'",
      "      OR EXISTS (",
      "        SELECT 1 FROM public.monthly_salary_payments AS payment",
      "        WHERE payment.organization_id = candidate.organization_id",
      "          AND payment.employee_id = candidate.id",
      "          AND payment.pay_month = $7::date",
      "      )",
      "      OR EXISTS (",
      "        SELECT 1 FROM public.attendance_events AS attendance",
      "        WHERE attendance.organization_id = candidate.organization_id",
      "          AND attendance.employee_id = candidate.id",
      "          AND attendance.work_date >= $7::date",
      "          AND attendance.work_date < $8::date",
      "      )",
      "      OR EXISTS (",
      "        SELECT 1 FROM public.employee_pay_rates AS rate",
      "        WHERE rate.organization_id = candidate.organization_id",
      "          AND rate.employee_id = candidate.id",
      "          AND rate.effective_from < $8::date",
      "          AND (rate.effective_to IS NULL OR rate.effective_to >= $7::date)",
      "      )",
      "      OR EXISTS (",
      "        SELECT 1 FROM public.leave_requests AS leave_request",
      "        WHERE leave_request.organization_id = candidate.organization_id",
      "          AND leave_request.employee_id = candidate.id",
      "          AND leave_request.status = 'APPROVED'",
      "          AND leave_request.start_date < $8::date",
      "          AND leave_request.end_date >= $7::date",
      "      )",
      "    )",
      "    AND (",
      "      $3::boolean",
      "      OR (",
      "        $4::boolean",
      "        AND candidate.id <> $5::uuid",
      "        AND candidate.normalized_role NOT LIKE 'HR_MANAGER%'",
      "        AND candidate.normalized_role NOT LIKE 'HRMANAGER%'",
      "      )",
      "      OR (",
      "        $6::boolean",
      "        AND candidate.normalized_role = 'EMPLOYEE'",
      "        AND EXISTS (",
      "          SELECT 1",
      "          FROM public.departments AS managed_department",
      "          WHERE managed_department.organization_id = candidate.organization_id",
      "            AND managed_department.id = candidate.department_id",
      "            AND managed_department.manager_id = $5::uuid",
      "        )",
      "      )",
      "    )",
      ")",
      "SELECT id AS \"employeeId\"",
      "FROM authorized_payroll_workforce",
      "ORDER BY id",
      "LIMIT " + (MAX_PAYROLL_EMPLOYEES + 1),
    ].join("\n"),
    [
      scope.organizationId,
      allowedWorkforceRoles,
      isOrganizationAdmin,
      isHrManager,
      actorEmployeeId,
      isDepartmentManager,
      dates.fromDate,
      dates.nextMonthStart,
    ],
  );

  if (result.rows.length > MAX_PAYROLL_EMPLOYEES) {
    throw new ManagementDashboardPayrollOvertimeResultLimitError();
  }

  const ids = result.rows.map((row) => row.employeeId);
  if (ids.some((id) => typeof id !== "string" || !id)) {
    throw new Error("The payroll summary returned an invalid workforce identifier");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("The payroll summary returned duplicate workforce identifiers");
  }
  return ids;
}

export async function loadManagementDashboardPayrollOvertimeSummary(
  client: PoolClient,
  scope: ManagementDashboardScope,
  input: { month: string; organizationToday: string },
): Promise<ManagementDashboardPayrollOvertimeSummary> {
  const generationResult = await client.query<GenerationRow>(
    "SELECT CURRENT_TIMESTAMP AS \"generatedAt\"",
  );
  const generatedAt = timestampValue(generationResult.rows[0]?.generatedAt);
  const dates = monthDates(input.month);
  const overtimeToDate = dates.toDate > input.organizationToday
    ? input.organizationToday
    : dates.toDate;
  const attendanceSummary = await loadManagementDashboardAttendanceSummary(
    client,
    scope,
    {
      fromDate: dates.fromDate,
      toDate: overtimeToDate,
      organizationToday: input.organizationToday,
    },
  );

  const employeeIds = await loadAuthorizedPayrollEmployees(client, scope, input.month);

  const monthlyPay: Awaited<ReturnType<typeof calculateOrganizationMonthlyPay>> =
    employeeIds.length > 0
      ? await calculateOrganizationMonthlyPay(
          client,
          scope.organizationId,
          input.month,
          undefined,
          employeeIds,
        )
      : new Map();

  const estimatedPayableByCurrency = new Map<string, MoneyAccumulator>();
  let employeesWithPayableEarnings = 0;
  let employeesWithoutPayableHours = 0;
  let employeesMissingRates = 0;
  let employeesWithCurrencyMismatch = 0;
  let estimateReadyEmployees = 0;

  for (const employeeId of employeeIds) {
    const estimate = monthlyPay.get(employeeId);
    if (!estimate) {
      throw new Error("The monthly payroll calculation is missing an authorized workforce record");
    }

    const payableMinutes = countValue(estimate.payableMinutes, "payable minutes");
    if (payableMinutes === 0) {
      employeesWithoutPayableHours += 1;
      continue;
    }

    employeesWithPayableEarnings += 1;

    if (estimate.currencyMismatch) {
      employeesWithCurrencyMismatch += 1;
      continue;
    }

    if (estimate.amount === null) {
      employeesMissingRates += 1;
      continue;
    }

    if (!estimate.currencyCode) {
      throw new Error("The monthly payroll calculation returned an amount without a currency");
    }

    addMoney(
      estimatedPayableByCurrency,
      estimate.currencyCode,
      estimate.amount,
      employeeId,
      "estimated payable",
    );
    estimateReadyEmployees += 1;
  }

  const paymentRows = employeeIds.length > 0
    ? await client.query<PaymentLedgerRow>(
        [
          "SELECT",
          "  employee_id AS \"employeeId\",",
          "  amount::text AS amount,",
          "  currency_code AS \"currencyCode\",",
          "  status",
          "FROM public.monthly_salary_payments",
          "WHERE organization_id = $1::uuid",
          "  AND employee_id = ANY($2::uuid[])",
          "  AND pay_month = $3::date",
          "ORDER BY employee_id",
        ].join("\n"),
        [scope.organizationId, employeeIds, dates.fromDate],
      )
    : { rows: [] as PaymentLedgerRow[] };

  const recordedPaidByCurrency = new Map<string, MoneyAccumulator>();
  const recordedUnpaidByCurrency = new Map<string, MoneyAccumulator>();
  const seenPaymentEmployees = new Set<string>();
  let paidPaymentCount = 0;
  let unpaidPaymentCount = 0;

  for (const row of paymentRows.rows) {
    if (
      typeof row.employeeId !== "string" ||
      !employeeIds.includes(row.employeeId) ||
      seenPaymentEmployees.has(row.employeeId)
    ) {
      throw new Error("The payroll ledger returned an unauthorized or duplicate payment record");
    }
    seenPaymentEmployees.add(row.employeeId);

    if (row.status === "PAID") {
      addMoney(recordedPaidByCurrency, row.currencyCode, row.amount, row.employeeId, "recorded paid");
      paidPaymentCount += 1;
    } else if (row.status === "UNPAID") {
      addMoney(recordedUnpaidByCurrency, row.currencyCode, row.amount, row.employeeId, "recorded unpaid");
      unpaidPaymentCount += 1;
    } else {
      throw new Error("The payroll ledger returned an unsupported payment status");
    }
  }

  const departmentManagerId = scope.kind === "ASSIGNED_DEPARTMENTS"
    ? scope.managerEmployeeId
    : null;
  const overtimeRows = await client.query<OvertimeAggregateRow>(
    [
      "SELECT",
      "  request.status,",
      "  COUNT(*)::int AS \"requestCount\",",
      "  COALESCE(SUM(request.requested_minutes), 0)::bigint AS \"requestedMinutes\",",
      "  COALESCE(SUM(request.approved_minutes) FILTER (WHERE request.status = 'APPROVED'), 0)::bigint AS \"approvedMinutes\"",
      "FROM public.attendance_overtime_requests AS request",
      "JOIN public.employees AS employee",
      "  ON employee.id = request.employee_id",
      " AND employee.organization_id = request.organization_id",
      "WHERE request.organization_id = $1::uuid",
      "  AND request.request_type = 'PREAUTHORIZATION'",
      "  AND request.work_date >= $2::date",
      "  AND request.work_date <= $3::date",
      "  AND (",
      "    $4::uuid IS NULL",
      "    OR request.employee_id = $4::uuid",
      "    OR EXISTS (",
      "      SELECT 1",
      "      FROM public.departments AS managed_department",
      "      WHERE managed_department.organization_id = employee.organization_id",
      "        AND managed_department.id = employee.department_id",
      "        AND managed_department.manager_id = $4::uuid",
      "    )",
      "  )",
      "GROUP BY request.status",
    ].join("\n"),
    [scope.organizationId, dates.fromDate, dates.toDate, departmentManagerId],
  );

  let pendingRequests = 0;
  let approvedRequests = 0;
  let rejectedRequests = 0;
  let pendingRequestedMinutes = 0;
  let approvedMinutes = 0;
  let rejectedRequestedMinutes = 0;

  for (const row of overtimeRows.rows) {
    const requestCount = countValue(row.requestCount, "overtime request count");
    const requestedMinutes = countValue(row.requestedMinutes, "requested overtime minutes");
    const rowApprovedMinutes = countValue(row.approvedMinutes, "approved overtime minutes");

    if (row.status === "PENDING") {
      pendingRequests += requestCount;
      pendingRequestedMinutes += requestedMinutes;
    } else if (row.status === "APPROVED") {
      approvedRequests += requestCount;
      approvedMinutes += rowApprovedMinutes;
    } else if (row.status === "REJECTED") {
      rejectedRequests += requestCount;
      rejectedRequestedMinutes += requestedMinutes;
    } else {
      throw new Error("The overtime summary returned an unsupported preauthorization status");
    }
  }

  const excessReviewRows = await client.query<ExcessReviewAggregateRow>(
    [
      "SELECT",
      "  review.status,",
      "  COUNT(*)::int AS \"reviewCount\",",
      "  COALESCE(SUM(review.excess_minutes), 0)::bigint AS \"excessMinutes\"",
      "FROM public.attendance_excess_overtime_reviews AS review",
      "JOIN public.employees AS employee",
      "  ON employee.id = review.employee_id",
      " AND employee.organization_id = review.organization_id",
      "WHERE review.organization_id = $1::uuid",
      "  AND review.work_date >= $2::date",
      "  AND review.work_date <= $3::date",
      "  AND (",
      "    $4::uuid IS NULL",
      "    OR EXISTS (",
      "      SELECT 1",
      "      FROM public.departments AS managed_department",
      "      WHERE managed_department.organization_id = employee.organization_id",
      "        AND managed_department.id = employee.department_id",
      "        AND managed_department.manager_id = $4::uuid",
      "    )",
      "  )",
      "GROUP BY review.status",
      "ORDER BY review.status",
      "LIMIT 4",
    ].join("\n"),
    [scope.organizationId, dates.fromDate, overtimeToDate, departmentManagerId],
  );

  let openCases = 0;
  let reviewedNoPayCases = 0;
  let followUpCases = 0;
  let recordedExcessMinutes = 0;

  for (const row of excessReviewRows.rows) {
    const reviewCount = countValue(row.reviewCount, "excess-time review count");
    const excessMinutes = countValue(row.excessMinutes, "recorded excess-time minutes");
    recordedExcessMinutes += excessMinutes;

    if (row.status === "OPEN") {
      openCases += reviewCount;
    } else if (row.status === "REVIEWED_NO_PAY") {
      reviewedNoPayCases += reviewCount;
    } else if (row.status === "FOLLOW_UP") {
      followUpCases += reviewCount;
    } else {
      throw new Error("The excess-time review summary returned an unsupported status");
    }
  }

  const recordedPaymentCount = paidPaymentCount + unpaidPaymentCount;

  return {
    generatedAt: generatedAt.toISOString(),
    month: input.month,
    payroll: {
      eligibleEmployees: employeeIds.length,
      employeesWithPayableEarnings,
      employeesWithoutPayableHours,
      estimateReadyEmployees,
      employeesMissingRates,
      employeesWithCurrencyMismatch,
      recordedPaymentCount,
      paidPaymentCount,
      unpaidPaymentCount,
      employeesWithoutPaymentRecord: employeeIds.length - recordedPaymentCount,
      estimatedPayableByCurrency: moneyBreakdown(estimatedPayableByCurrency),
      recordedPaidByCurrency: moneyBreakdown(recordedPaidByCurrency),
      recordedUnpaidByCurrency: moneyBreakdown(recordedUnpaidByCurrency),
    },
    overtime: {
      preauthorization: {
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        pendingRequestedMinutes,
        approvedMinutes,
        rejectedRequestedMinutes,
      },
      scheduledEmployees: attendanceSummary.period.uniqueScheduledEmployees,
      worked: {
        actualOvertimeMinutes: attendanceSummary.period.potentialOvertimeMinutes,
        payableOvertimeMinutes: attendanceSummary.period.payableOvertimeMinutes,
        unapprovedExcessMinutes: attendanceSummary.period.excessUnapprovedOvertimeMinutes,
      },
      excessReviewCases: {
        openCases,
        reviewedNoPayCases,
        followUpCases,
        recordedExcessMinutes,
      },
    },
  };
}
