"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { useAttendanceRefresh } from "@/lib/attendance-events";
import type { WorkspaceRole } from "@/types/workspace";
import { managementDashboardLinks } from "../links";

import {
  ManagementDashboardErrorState,
  ManagementDashboardGrid,
  ManagementDashboardMetricCard,
  ManagementDashboardMetricGrid,
  ManagementDashboardPanel,
  ManagementDashboardSectionHeading,
  ManagementDashboardSkeleton,
} from "./ManagementDashboardPrimitives";

type ManagementRole = Exclude<WorkspaceRole, "EMPLOYEE">;
type ScopeKind = "ORGANIZATION" | "ASSIGNED_DEPARTMENTS";

type MoneyBreakdown = {
  currencyCode: string;
  amount: string;
  employees: number;
};

type PayrollSummary = {
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
  estimatedPayableByCurrency: MoneyBreakdown[];
  recordedPaidByCurrency: MoneyBreakdown[];
  recordedUnpaidByCurrency: MoneyBreakdown[];
};

type OvertimeSummary = {
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

type PayrollOvertimeResponse = {
  status: "ok";
  schemaVersion: 1;
  generatedAt: string;
  scope: {
    roleName: ManagementRole;
    kind: ScopeKind;
  };
  organization: {
    name: string;
    timeZone: string;
    weekStartsOn: number;
    workDate: string;
  };
  filters: {
    month: string;
  };
  payroll: PayrollSummary;
  overtime: OvertimeSummary;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PayrollOvertimeResponse };

export type ManagementDashboardPayrollOvertimeProps = {
  /** One organization-local payroll month in YYYY-MM format. */
  month: string;
};

function isCount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

function isMonth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }
  const [year] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100;
}

function isManagementRole(value: unknown): value is ManagementRole {
  return value === "ORGANIZATION_ADMIN" ||
    value === "HR_MANAGER" ||
    value === "DEPARTMENT_MANAGER";
}

function isMoneyBreakdown(value: unknown): value is MoneyBreakdown {
  return isRecord(value) &&
    typeof value.currencyCode === "string" &&
    /^[A-Z]{3}$/.test(value.currencyCode) &&
    typeof value.amount === "string" &&
    /^\d+(?:\.\d{2})$/.test(value.amount) &&
    isCount(value.employees);
}

function isPayrollSummary(value: unknown): value is PayrollSummary {
  if (!isRecord(value)) return false;
  const countFields = [
    "eligibleEmployees",
    "employeesWithPayableEarnings",
    "employeesWithoutPayableHours",
    "estimateReadyEmployees",
    "employeesMissingRates",
    "employeesWithCurrencyMismatch",
    "recordedPaymentCount",
    "paidPaymentCount",
    "unpaidPaymentCount",
    "employeesWithoutPaymentRecord",
  ] as const;
  if (
    !countFields.every((field) => isCount(value[field])) ||
    !Array.isArray(value.estimatedPayableByCurrency) ||
    !value.estimatedPayableByCurrency.every(isMoneyBreakdown) ||
    !Array.isArray(value.recordedPaidByCurrency) ||
    !value.recordedPaidByCurrency.every(isMoneyBreakdown) ||
    !Array.isArray(value.recordedUnpaidByCurrency) ||
    !value.recordedUnpaidByCurrency.every(isMoneyBreakdown)
  ) {
    return false;
  }

  const eligible = value.eligibleEmployees as number;
  const recorded = value.recordedPaymentCount as number;
  const paid = value.paidPaymentCount as number;
  const unpaid = value.unpaidPaymentCount as number;
  const unrecorded = value.employeesWithoutPaymentRecord as number;

  return paid + unpaid === recorded &&
    recorded + unrecorded === eligible &&
    (value.estimateReadyEmployees as number) <=
      (value.employeesWithPayableEarnings as number) &&
    (value.employeesWithPayableEarnings as number) +
      (value.employeesWithoutPayableHours as number) === eligible;
}

function isOvertimeSummary(value: unknown): value is OvertimeSummary {
  if (!isRecord(value) || !isRecord(value.preauthorization) ||
    !isRecord(value.worked) || !isRecord(value.excessReviewCases)) {
    return false;
  }

  const requestFields = [
    "pendingRequests",
    "approvedRequests",
    "rejectedRequests",
    "pendingRequestedMinutes",
    "approvedMinutes",
    "rejectedRequestedMinutes",
  ];
  const workedFields = [
    "actualOvertimeMinutes",
    "payableOvertimeMinutes",
    "unapprovedExcessMinutes",
  ];
  const reviewFields = [
    "openCases",
    "reviewedNoPayCases",
    "followUpCases",
    "recordedExcessMinutes",
  ];

  if (
    !isCount(value.scheduledEmployees) ||
    !requestFields.every((field) => isCount(value.preauthorization[field])) ||
    !workedFields.every((field) => isCount(value.worked[field])) ||
    !reviewFields.every((field) => isCount(value.excessReviewCases[field]))
  ) {
    return false;
  }

  const actual = value.worked.actualOvertimeMinutes as number;
  const payable = value.worked.payableOvertimeMinutes as number;
  const unapproved = value.worked.unapprovedExcessMinutes as number;

  return actual >= payable && actual - payable === unapproved;
}

function isPayrollOvertimeResponse(
  value: unknown,
): value is PayrollOvertimeResponse {
  return isRecord(value) &&
    value.status === "ok" &&
    value.schemaVersion === 1 &&
    typeof value.generatedAt === "string" &&
    Number.isFinite(new Date(value.generatedAt).getTime()) &&
    isRecord(value.scope) &&
    isManagementRole(value.scope.roleName) &&
    ((value.scope.roleName === "DEPARTMENT_MANAGER") ===
      (value.scope.kind === "ASSIGNED_DEPARTMENTS")) &&
    (value.scope.kind === "ORGANIZATION" ||
      value.scope.kind === "ASSIGNED_DEPARTMENTS") &&
    isRecord(value.organization) &&
    typeof value.organization.name === "string" &&
    typeof value.organization.timeZone === "string" &&
    typeof value.organization.workDate === "string" &&
    typeof value.organization.weekStartsOn === "number" &&
    isRecord(value.filters) &&
    isMonth(value.filters.month) &&
    isPayrollSummary(value.payroll) &&
    isOvertimeSummary(value.overtime);
}

function formatMinutes(value: number): string {
  return formatNumber(Math.floor(value / 60)) + "h " +
    String(value % 60).padStart(2, "0") + "m";
}

function formatMoney(value: MoneyBreakdown): string {
  const amount = Number(value.amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: value.currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return value.amount + " " + value.currencyCode;
  }
}

function payrollAttendanceRange(month: string, workDate: string): { fromDate: string; toDate: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const toDate = workDate.slice(0, 7) === month && workDate < monthEnd ? workDate : monthEnd;
  return { fromDate: month + "-01", toDate };
}

function roleScopeLabel(role: ManagementRole): string {
  if (role === "DEPARTMENT_MANAGER") return "Assigned-department employee payroll";
  if (role === "HR_MANAGER") return "Authorized organization payroll population";
  return "Organization payroll population";
}

function MoneyBreakdownList({
  title,
  description,
  rows,
  empty,
  href,
}: {
  title: string;
  description: string;
  rows: MoneyBreakdown[];
  empty: string;
  href: string;
}) {
  return (
    <ManagementDashboardPanel
      heading={title}
      description={description}
      className="md-payroll-money-panel"
      action={<Link className="md-dashboard-drilldown-link" href={href}>Open monthly payroll</Link>}
    >
      {rows.length === 0 ? (
        <p className="md-payroll-empty">{empty}</p>
      ) : (
        <div className="md-payroll-money-list">
          {rows.map((row) => (
            <div className="md-payroll-money-row" key={row.currencyCode}>
              <div className="md-payroll-money-copy">
                <strong>{formatMoney(row)}</strong>
                <span>{formatNumber(row.employees)} workforce members</span>
              </div>
              <span className="md-payroll-currency">{row.currencyCode}</span>
            </div>
          ))}
        </div>
      )}
    </ManagementDashboardPanel>
  );
}

/**
 * Opt-in monthly overtime and payroll intelligence section.
 *
 * It consumes only the new scoped aggregate. No employee-level pay amount,
 * hourly rate, personal earnings or team payslip content is returned here.
 */
export function ManagementDashboardPayrollOvertime({
  month,
}: ManagementDashboardPayrollOvertimeProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const requestSequence = useRef(0);

  const load = useCallback(async (silent = false) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    if (!silent) setState({ status: "loading" });

    try {
      if (!isMonth(month)) {
        throw new Error("Choose a valid payroll month.");
      }
      const result = await apiRequest<unknown>(
        "/management-dashboard/payroll-overtime?month=" +
          encodeURIComponent(month),
      );
      if (!isPayrollOvertimeResponse(result)) {
        throw new Error("The server returned an invalid payroll and overtime summary.");
      }
      if (requestSequence.current === requestId) {
        setState({ status: "ready", data: result });
      }
    } catch (error) {
      if (requestSequence.current === requestId) {
        setState({
          status: "error",
          message: error instanceof Error
            ? error.message
            : "Unable to load payroll and overtime intelligence.",
        });
      }
    }
  }, [month]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  useSmartRefresh(() => load(true), true, 60_000);
  useAttendanceRefresh(() => { void load(true); });

  return (
    <section className="md-payroll-section">
      <ManagementDashboardSectionHeading
        eyebrow="Overtime & payroll intelligence"
        title="Payroll readiness and overtime"
        description="Actual overtime, advance approvals, calculated payable earnings and recorded salary-payment statuses from the existing payroll sources."
        action={
          state.status === "ready" ? (
            <div className="md-dashboard-drilldown-actions">
              <span className="md-workforce-asof">
                As of {formatDate(state.data.generatedAt, state.data.organization.timeZone)}
              </span>
              <Link className="md-dashboard-drilldown-link" href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}>
                Open monthly payroll
              </Link>
            </div>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <>
          <ManagementDashboardSkeleton
            variant="metrics"
            count={8}
            columns={4}
            label="Loading payroll and overtime metrics"
          />
          <ManagementDashboardSkeleton
            variant="charts"
            count={3}
            label="Loading payroll currency breakdowns and overtime summary"
          />
        </>
      ) : null}

      {state.status === "error" ? (
        <ManagementDashboardErrorState
          title="Payroll and overtime unavailable"
          description={state.message}
          icon={CircleDollarSign}
          action={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leading={<RefreshCw size={14} aria-hidden="true" />}
              onClick={() => void load()}
            >
              Try again
            </Button>
          }
        />
      ) : null}

      {state.status === "ready" ? (
        <>
          <div className="md-payroll-meta">
            <span>
              {new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(state.data.filters.month + "-01T12:00:00.000Z"))}
            </span>
            <span>{roleScopeLabel(state.data.scope.roleName)}</span>
          </div>

          <ManagementDashboardMetricGrid columns={4}>
            <ManagementDashboardMetricCard
              label="Payroll workforce"
              value={formatNumber(state.data.payroll.eligibleEmployees)}
              description="Employees included by the existing role-specific salary-payment access rules."
              icon={Wallet}
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="Payable earnings"
              value={formatNumber(state.data.payroll.employeesWithPayableEarnings)}
              description="Employees with calculated payable hours in this month."
              icon={Banknote}
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="Estimate needs review"
              value={formatNumber(
                state.data.payroll.employeesMissingRates +
                state.data.payroll.employeesWithCurrencyMismatch,
              )}
              description={
                formatNumber(state.data.payroll.employeesMissingRates) +
                " missing/incomplete rates · " +
                formatNumber(state.data.payroll.employeesWithCurrencyMismatch) +
                " currency mismatches"
              }
              icon={ShieldAlert}
              tone={
                state.data.payroll.employeesMissingRates +
                state.data.payroll.employeesWithCurrencyMismatch > 0
                  ? "warning"
                  : "neutral"
              }
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="Estimate ready"
              value={formatNumber(state.data.payroll.estimateReadyEmployees)}
              description="Employees with payable earnings and a complete same-currency calculation."
              icon={BadgeCheck}
              tone="success"
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="Recorded as paid"
              value={formatNumber(state.data.payroll.paidPaymentCount)}
              description="Monthly salary ledger records marked PAID."
              icon={CircleDollarSign}
              tone="success"
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="Recorded as unpaid"
              value={formatNumber(state.data.payroll.unpaidPaymentCount)}
              description="Monthly salary ledger records marked UNPAID."
              icon={Wallet}
              tone="warning"
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="No payment record"
              value={formatNumber(state.data.payroll.employeesWithoutPaymentRecord)}
              description="No monthly salary-payment ledger row has been recorded."
              icon={CalendarClock}
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <ManagementDashboardMetricCard
              label="No payable hours"
              value={formatNumber(state.data.payroll.employeesWithoutPayableHours)}
              description="No payable minutes were calculated for the selected month."
              icon={Clock3}
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
          </ManagementDashboardMetricGrid>

          <ManagementDashboardGrid columns={3} className="md-payroll-money-grid">
            <MoneyBreakdownList
              title="Estimated payable"
              description="Calculated amount for complete-rate employees only. Separate currencies are not combined."
              rows={state.data.payroll.estimatedPayableByCurrency}
              empty="No complete payable estimate is available for this month."
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <MoneyBreakdownList
              title="Recorded paid"
              description="Amounts saved in the monthly salary ledger with status PAID; not independent bank-transfer verification."
              rows={state.data.payroll.recordedPaidByCurrency}
              empty="No salary payment is recorded as PAID for this month."
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
            <MoneyBreakdownList
              title="Recorded unpaid"
              description="Amounts stored in the monthly salary ledger with status UNPAID; kept separate from estimated and paid amounts."
              rows={state.data.payroll.recordedUnpaidByCurrency}
              empty="No UNPAID salary amount is recorded in the monthly ledger."
            
              href={managementDashboardLinks(state.data.scope.roleName).payroll(state.data.filters.month)}/>
          </ManagementDashboardGrid>

          <ManagementDashboardGrid columns={2} className="md-payroll-overtime-grid">
            <ManagementDashboardPanel
              heading="Advance overtime authorization"
              eyebrow="Preauthorization requests"
              description="Requests submitted before the work date are separate from overtime actually worked."
              action={<Link className="md-dashboard-drilldown-link" href={managementDashboardLinks(state.data.scope.roleName).reviewQueue("overtime")}>Open attendance detail</Link>}
            >
              <div className="md-payroll-stats-grid">
                <div className="md-payroll-stat">
                  <span>Pending requests</span>
                  <strong>{formatNumber(state.data.overtime.preauthorization.pendingRequests)}</strong>
                  <small>{formatMinutes(state.data.overtime.preauthorization.pendingRequestedMinutes)} requested</small>
                </div>
                <div className="md-payroll-stat">
                  <span>Approved requests</span>
                  <strong>{formatNumber(state.data.overtime.preauthorization.approvedRequests)}</strong>
                  <small>{formatMinutes(state.data.overtime.preauthorization.approvedMinutes)} authorized</small>
                </div>
                <div className="md-payroll-stat">
                  <span>Rejected requests</span>
                  <strong>{formatNumber(state.data.overtime.preauthorization.rejectedRequests)}</strong>
                  <small>{formatMinutes(state.data.overtime.preauthorization.rejectedRequestedMinutes)} requested</small>
                </div>
              </div>
            </ManagementDashboardPanel>

            <ManagementDashboardPanel
              heading="Worked overtime"
              eyebrow="Attendance calculation"
              description={"Actual overtime is calculated from effective clock events for " + formatNumber(state.data.overtime.scheduledEmployees) + " distinct employees scheduled in the reporting period; payable overtime is capped by approved advance minutes."}
              action={<Link className="md-dashboard-drilldown-link" href={managementDashboardLinks(state.data.scope.roleName).attendance(
                payrollAttendanceRange(state.data.filters.month, state.data.organization.workDate).fromDate,
                payrollAttendanceRange(state.data.filters.month, state.data.organization.workDate).toDate,
              )}>Open attendance detail</Link>}
            >
              <div className="md-payroll-stats-grid">
                <div className="md-payroll-stat">
                  <span>Actual worked overtime</span>
                  <strong>{formatMinutes(state.data.overtime.worked.actualOvertimeMinutes)}</strong>
                  <small>Beyond assigned scheduled end</small>
                </div>
                <div className="md-payroll-stat md-payroll-stat-success">
                  <span>Payable overtime</span>
                  <strong>{formatMinutes(state.data.overtime.worked.payableOvertimeMinutes)}</strong>
                  <small>Covered by advance approval</small>
                </div>
                <div className="md-payroll-stat md-payroll-stat-warning">
                  <span>Unapproved excess</span>
                  <strong>{formatMinutes(state.data.overtime.worked.unapprovedExcessMinutes)}</strong>
                  <small>Actual overtime not covered by approval</small>
                </div>
              </div>
            </ManagementDashboardPanel>
          </ManagementDashboardGrid>

          <ManagementDashboardPanel
            heading="Recorded excess-time review cases"
            description="Existing persisted review cases only. This is separate from the full calculation of unapproved excess overtime."
            className="md-payroll-review-panel"
            action={<Link className="md-dashboard-drilldown-link" href={managementDashboardLinks(state.data.scope.roleName).reviewQueue("excess")}>Open attendance detail</Link>}
          >
            <div className="md-payroll-review-grid">
              <div className="md-payroll-review-stat">
                <span>Open cases</span>
                <strong>{formatNumber(state.data.overtime.excessReviewCases.openCases)}</strong>
              </div>
              <div className="md-payroll-review-stat">
                <span>Reviewed · no pay</span>
                <strong>{formatNumber(state.data.overtime.excessReviewCases.reviewedNoPayCases)}</strong>
              </div>
              <div className="md-payroll-review-stat">
                <span>Follow-up</span>
                <strong>{formatNumber(state.data.overtime.excessReviewCases.followUpCases)}</strong>
              </div>
              <div className="md-payroll-review-stat">
                <span>Recorded excess time</span>
                <strong>{formatMinutes(state.data.overtime.excessReviewCases.recordedExcessMinutes)}</strong>
              </div>
            </div>
          </ManagementDashboardPanel>

          <p className="md-payroll-definition">
            Estimated payable is not a payment confirmation. Only the salary ledger's PAID status is shown as recorded paid. Currency totals remain separate. Department Managers see only payroll-payment aggregates for Employee-role members in their assigned departments; workforce payslip generation remains restricted to the existing Organization Admin and HR Manager permissions.
          </p>
        </>
      ) : null}
    </section>
  );
}
