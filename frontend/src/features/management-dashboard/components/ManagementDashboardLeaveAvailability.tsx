"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarClock,
  CalendarDays,
  Clock3,
  RefreshCw,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useSmartRefresh } from "@/lib/smart-refresh";
import type { WorkspaceRole } from "@/types/workspace";

import {
  ManagementDashboardChartPanel,
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

type LeavePeriod = {
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

type UpcomingLeave = {
  approvedRequests: number;
  employees: number;
  calendarDays: number;
};

type LeaveToday = {
  employeesOnApprovedLeave: number;
  scheduledEmployees: number;
  eligibleScheduledEmployees: number;
  scheduledEmployeesOnApprovedLeave: number;
  publicHolidayScheduledEmployees: number;
  availableEmployees: number;
  availabilityRate: number | null;
};

type LeaveTrendDay = {
  workDate: string;
  scheduledShiftDays: number;
  publicHolidayShiftDays: number;
  eligibleShiftDays: number;
  approvedLeaveShiftDays: number;
  availableShiftDays: number;
  availabilityRate: number | null;
};

type LeaveAvailabilityResponse = {
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
    fromDate: string;
    toDate: string;
    departmentId: string | null;
    maxRangeDays: number;
  };
  period: LeavePeriod;
  upcoming: UpcomingLeave;
  today: LeaveToday;
  dailyTrend: LeaveTrendDay[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LeaveAvailabilityResponse };

export type ManagementDashboardLeaveAvailabilityProps = {
  /** Inclusive organization-local dates supplied by the shared dashboard shell. */
  fromDate: string;
  toDate: string;
  /** Optional department filter. The API revalidates it against the actor's scope. */
  departmentId?: string | null;
};

const PERIOD_COUNT_FIELDS = [
  "approvedRequests",
  "approvedEmployees",
  "approvedCalendarDays",
  "actionablePendingRequests",
  "uniqueScheduledEmployees",
  "scheduledShiftDays",
  "publicHolidayShiftDays",
  "eligibleShiftDays",
  "approvedLeaveShiftDays",
  "availableShiftDays",
] as const;

const TODAY_COUNT_FIELDS = [
  "employeesOnApprovedLeave",
  "scheduledEmployees",
  "eligibleScheduledEmployees",
  "scheduledEmployeesOnApprovedLeave",
  "publicHolidayScheduledEmployees",
  "availableEmployees",
] as const;

function isCount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

function isRate(value: unknown): value is number | null {
  return value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

function isManagementRole(value: unknown): value is ManagementRole {
  return value === "ORGANIZATION_ADMIN" ||
    value === "HR_MANAGER" ||
    value === "DEPARTMENT_MANAGER";
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isLeavePeriod(value: unknown): value is LeavePeriod {
  if (
    !isRecord(value) ||
    !PERIOD_COUNT_FIELDS.every((field) => isCount(value[field]))
  ) {
    return false;
  }

  const scheduled = value.scheduledShiftDays as number;
  const holidays = value.publicHolidayShiftDays as number;
  const eligible = value.eligibleShiftDays as number;
  const leave = value.approvedLeaveShiftDays as number;
  const available = value.availableShiftDays as number;
  const rate = value.availabilityRate;

  return isRate(rate) &&
    scheduled === holidays + eligible &&
    eligible === leave + available &&
    (eligible === 0 ? rate === null : typeof rate === "number");
}

function isUpcomingLeave(value: unknown): value is UpcomingLeave {
  return isRecord(value) &&
    isCount(value.approvedRequests) &&
    isCount(value.employees) &&
    isCount(value.calendarDays);
}

function isLeaveToday(value: unknown): value is LeaveToday {
  if (
    !isRecord(value) ||
    !TODAY_COUNT_FIELDS.every((field) => isCount(value[field]))
  ) {
    return false;
  }

  const scheduled = value.scheduledEmployees as number;
  const holiday = value.publicHolidayScheduledEmployees as number;
  const eligible = value.eligibleScheduledEmployees as number;
  const onLeave = value.scheduledEmployeesOnApprovedLeave as number;
  const available = value.availableEmployees as number;
  const rate = value.availabilityRate;

  return isRate(rate) &&
    scheduled === holiday + eligible &&
    onLeave <= scheduled &&
    available <= eligible &&
    (eligible === 0 ? rate === null : typeof rate === "number");
}

function isLeaveTrendDay(value: unknown): value is LeaveTrendDay {
  if (
    !isRecord(value) ||
    !isDateString(value.workDate) ||
    ![
      "scheduledShiftDays",
      "publicHolidayShiftDays",
      "eligibleShiftDays",
      "approvedLeaveShiftDays",
      "availableShiftDays",
    ].every((field) => isCount(value[field]))
  ) {
    return false;
  }

  const scheduled = value.scheduledShiftDays as number;
  const holiday = value.publicHolidayShiftDays as number;
  const eligible = value.eligibleShiftDays as number;
  const leave = value.approvedLeaveShiftDays as number;
  const available = value.availableShiftDays as number;
  const rate = value.availabilityRate;

  return isRate(rate) &&
    scheduled === holiday + eligible &&
    eligible === leave + available &&
    (eligible === 0 ? rate === null : typeof rate === "number");
}

function isLeaveAvailabilityResponse(
  value: unknown,
): value is LeaveAvailabilityResponse {
  if (
    !isRecord(value) ||
    value.status !== "ok" ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(new Date(value.generatedAt).getTime()) ||
    !isRecord(value.scope) ||
    !isManagementRole(value.scope.roleName) ||
    (value.scope.kind !== "ORGANIZATION" &&
      value.scope.kind !== "ASSIGNED_DEPARTMENTS") ||
    ((value.scope.roleName === "DEPARTMENT_MANAGER") !==
      (value.scope.kind === "ASSIGNED_DEPARTMENTS")) ||
    !isRecord(value.organization) ||
    typeof value.organization.name !== "string" ||
    typeof value.organization.timeZone !== "string" ||
    !isDateString(value.organization.workDate) ||
    typeof value.organization.weekStartsOn !== "number" ||
    !isRecord(value.filters) ||
    !isDateString(value.filters.fromDate) ||
    !isDateString(value.filters.toDate) ||
    value.filters.fromDate > value.filters.toDate ||
    !(value.filters.departmentId === null ||
      typeof value.filters.departmentId === "string") ||
    !isCount(value.filters.maxRangeDays) ||
    !isLeavePeriod(value.period) ||
    !isUpcomingLeave(value.upcoming) ||
    !isLeaveToday(value.today) ||
    !Array.isArray(value.dailyTrend) ||
    !value.dailyTrend.every(isLeaveTrendDay)
  ) {
    return false;
  }

  return true;
}

function formatRate(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(1) + "%";
}

function shortDate(value: string): string {
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function roleScopeLabel(role: ManagementRole): string {
  if (role === "DEPARTMENT_MANAGER") return "Assigned-department workforce";
  if (role === "HR_MANAGER") return "Organization-wide HR workforce";
  return "Organization-wide workforce";
}

function segmentWidth(value: number, total: number): string {
  if (total <= 0 || value <= 0) return "0%";
  return String((value / total) * 100) + "%";
}

/**
 * Opt-in leave and workforce availability analytics.
 *
 * It uses the new scoped endpoint, not the personal leave-request feed. The
 * section is exported for Step 12 composition but is not mounted in live
 * dashboards in this step.
 */
export function ManagementDashboardLeaveAvailability({
  fromDate,
  toDate,
  departmentId = null,
}: ManagementDashboardLeaveAvailabilityProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const requestSequence = useRef(0);

  const load = useCallback(async (silent = false) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    if (!silent) setState({ status: "loading" });

    try {
      const params = new URLSearchParams({ fromDate, toDate });
      if (departmentId) params.set("departmentId", departmentId);

      const result = await apiRequest<unknown>(
        "/management-dashboard/leave-availability?" + params.toString(),
      );

      if (!isLeaveAvailabilityResponse(result)) {
        throw new Error("The server returned an invalid leave and availability summary.");
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
            : "Unable to load leave and availability analytics.",
        });
      }
    }
  }, [fromDate, toDate, departmentId]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  useSmartRefresh(() => load(true), true, 60_000);

  return (
    <section className="md-leave-section">
      <ManagementDashboardSectionHeading
        eyebrow="Leave & workforce availability"
        title="Leave and availability"
        description="Approved leave, actionable pending reviews and scheduled workforce availability from the existing leave and schedule records."
        action={
          state.status === "ready" ? (
            <span className="md-workforce-asof">
              As of {formatDate(state.data.generatedAt, state.data.organization.timeZone)}
            </span>
          ) : null
        }
      />

      {state.status === "loading" ? (
        <>
          <ManagementDashboardSkeleton
            variant="metrics"
            count={6}
            columns={3}
            label="Loading leave and availability metrics"
          />
          <ManagementDashboardSkeleton
            variant="charts"
            count={2}
            label="Loading leave and workforce availability"
          />
        </>
      ) : null}

      {state.status === "error" ? (
        <ManagementDashboardErrorState
          title="Leave and availability unavailable"
          description={state.message}
          icon={CalendarClock}
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
          <div className="md-leave-meta">
            <span>
              {formatDate(state.data.filters.fromDate, state.data.organization.timeZone)}
              {" – "}
              {formatDate(state.data.filters.toDate, state.data.organization.timeZone)}
            </span>
            <span>{roleScopeLabel(state.data.scope.roleName)}</span>
          </div>

          <ManagementDashboardMetricGrid columns={3}>
            <ManagementDashboardMetricCard
              label="Actionable pending reviews"
              value={formatNumber(state.data.period.actionablePendingRequests)}
              description="Pending requests this role is permitted to decide in the selected period."
              icon={CalendarClock}
              tone={state.data.period.actionablePendingRequests > 0 ? "warning" : "neutral"}
            />
            <ManagementDashboardMetricCard
              label="Approved leave requests"
              value={formatNumber(state.data.period.approvedRequests)}
              description="Approved requests overlapping the selected date range."
              icon={CalendarDays}
            />
            <ManagementDashboardMetricCard
              label="People with approved leave"
              value={formatNumber(state.data.period.approvedEmployees)}
              description="Distinct active workforce members with leave in this period."
              icon={Users}
            />
            <ManagementDashboardMetricCard
              label="Approved calendar days"
              value={formatNumber(state.data.period.approvedCalendarDays)}
              description="Inclusive calendar days within the selected period; not leave entitlement or paid days."
              icon={Clock3}
            />
            <ManagementDashboardMetricCard
              label="Upcoming people on leave"
              value={formatNumber(state.data.upcoming.employees)}
              description={
                formatNumber(state.data.upcoming.approvedRequests) +
                " approved requests · " +
                formatNumber(state.data.upcoming.calendarDays) +
                " future calendar days in this period."
              }
              icon={CalendarClock}
              tone="accent"
            />
            <ManagementDashboardMetricCard
              label="Scheduled availability"
              value={formatRate(state.data.period.availabilityRate)}
              state={state.data.period.availabilityRate === null ? "not-applicable" : "ready"}
              description="Available scheduled employee-days ÷ scheduled employee-days excluding public holidays."
              icon={UserCheck}
              tone="success"
              context={
                formatNumber(state.data.period.availableShiftDays) +
                " available of " +
                formatNumber(state.data.period.eligibleShiftDays) +
                " eligible scheduled employee-days"
              }
            />
          </ManagementDashboardMetricGrid>

          <ManagementDashboardGrid columns={2} className="md-leave-panels">
            <ManagementDashboardChartPanel
              heading="Daily workforce availability"
              eyebrow="Selected period"
              description="Each bar separates available scheduled days, approved-leave scheduled days and public-holiday scheduled days."
              chartHeight="tall"
              legend={[
                { label: "Available", tone: "success" },
                { label: "Approved leave", tone: "warning" },
                { label: "Public holiday", tone: "neutral" },
              ]}
            >
              {state.data.dailyTrend.every((day) => day.scheduledShiftDays === 0) ? (
                <div className="md-leave-empty">
                  No active scheduled employee shifts were found in this period.
                </div>
              ) : (
                <div
                  className="md-leave-trend-list"
                  role="list"
                  aria-label="Daily scheduled workforce availability"
                >
                  {state.data.dailyTrend.map((day) => (
                    <div
                      className="md-leave-trend-item"
                      role="listitem"
                      key={day.workDate}
                      aria-label={
                        shortDate(day.workDate) +
                        ": " + formatRate(day.availabilityRate) +
                        " availability, " + formatNumber(day.availableShiftDays) +
                        " available, " + formatNumber(day.approvedLeaveShiftDays) +
                        " on approved leave, " + formatNumber(day.publicHolidayShiftDays) +
                        " public-holiday scheduled shifts"
                      }
                    >
                      <div className="md-leave-trend-heading">
                        <time dateTime={day.workDate}>{shortDate(day.workDate)}</time>
                        <strong>{formatRate(day.availabilityRate)}</strong>
                      </div>
                      {day.scheduledShiftDays === 0 ? (
                        <p className="md-leave-no-shifts">No scheduled shifts</p>
                      ) : (
                        <div
                          className="md-leave-trend-track"
                          aria-hidden="true"
                        >
                          <span
                            className="md-leave-trend-segment md-leave-segment-available"
                            style={{ width: segmentWidth(day.availableShiftDays, day.scheduledShiftDays) }}
                          />
                          <span
                            className="md-leave-trend-segment md-leave-segment-leave"
                            style={{ width: segmentWidth(day.approvedLeaveShiftDays, day.scheduledShiftDays) }}
                          />
                          <span
                            className="md-leave-trend-segment md-leave-segment-holiday"
                            style={{ width: segmentWidth(day.publicHolidayShiftDays, day.scheduledShiftDays) }}
                          />
                        </div>
                      )}
                      <div className="md-leave-trend-counts">
                        <span>{formatNumber(day.availableShiftDays)} available</span>
                        <span>{formatNumber(day.approvedLeaveShiftDays)} leave</span>
                        <span>{formatNumber(day.publicHolidayShiftDays)} holiday</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ManagementDashboardChartPanel>

            <ManagementDashboardPanel
              heading="Today's workforce availability"
              eyebrow="Organization-local work date"
              description="People on approved leave are counted separately from the employees who have an active scheduled shift today."
              className="md-leave-today-panel"
            >
              <div className="md-leave-today-grid">
                <div className="md-leave-today-stat">
                  <span>People on approved leave</span>
                  <strong>{formatNumber(state.data.today.employeesOnApprovedLeave)}</strong>
                  <small>Active workforce, whether scheduled today or not</small>
                </div>
                <div className="md-leave-today-stat">
                  <span>Scheduled employees</span>
                  <strong>{formatNumber(state.data.today.scheduledEmployees)}</strong>
                  <small>Active schedule assignment and matching weekday</small>
                </div>
                <div className="md-leave-today-stat">
                  <span>Available employees</span>
                  <strong>{formatNumber(state.data.today.availableEmployees)}</strong>
                  <small>Scheduled, not on approved leave or a public holiday</small>
                </div>
                <div className="md-leave-today-stat">
                  <span>Scheduled on leave</span>
                  <strong>{formatNumber(state.data.today.scheduledEmployeesOnApprovedLeave)}</strong>
                  <small>Scheduled employee-days covered by approved leave</small>
                </div>
                <div className="md-leave-today-stat">
                  <span>Public-holiday shifts</span>
                  <strong>{formatNumber(state.data.today.publicHolidayScheduledEmployees)}</strong>
                  <small>Excluded from the availability-rate denominator</small>
                </div>
                <div className="md-leave-today-stat md-leave-today-rate">
                  <span>Today's availability</span>
                  <strong>{formatRate(state.data.today.availabilityRate)}</strong>
                  <small>
                    {formatNumber(state.data.today.availableEmployees)} available of{" "}
                    {formatNumber(state.data.today.eligibleScheduledEmployees)} eligible scheduled
                  </small>
                </div>
              </div>
            </ManagementDashboardPanel>
          </ManagementDashboardGrid>

          <p className="md-leave-definition">
            Approved leave calendar days are inclusive date counts, not entitlement or payroll calculations. Availability includes only active employees with an effective active schedule and matching weekday. Public holidays are excluded from its denominator; employees without a qualifying schedule are not assumed available. No absence is inferred.
          </p>
        </>
      ) : null}
    </section>
  );
}
