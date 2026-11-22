"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarClock,
  Clock3,
  RefreshCw,
  Timer,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
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

type AttendancePeriod = {
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

type AttendanceToday = {
  scheduledShiftDays: number;
  eligibleShiftDays: number;
  presentEmployees: number;
  attendanceRate: number | null;
  notYetDue: number;
  noClockInDuringActiveShift: number;
  openSessions: number;
  completedSessions: number;
};

type AttendanceTrendDay = {
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

type AttendanceSummaryResponse = {
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
  period: AttendancePeriod;
  today: AttendanceToday;
  dailyTrend: AttendanceTrendDay[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AttendanceSummaryResponse };

export type ManagementDashboardAttendanceAnalyticsProps = {
  /** Inclusive organization-local reporting dates, supplied by the dashboard shell. */
  fromDate: string;
  toDate: string;
  /** Optional department filter. The API revalidates it against the actor's scope. */
  departmentId?: string | null;
};

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

function isPeriod(value: unknown): value is AttendancePeriod {
  if (!isRecord(value)) return false;

  const countFields = [
    "scheduledShiftDays",
    "uniqueScheduledEmployees",
    "eligibleShiftDays",
    "presentShiftDays",
    "scheduledMinutes",
    "workedMinutes",
    "regularWorkedMinutes",
    "potentialOvertimeMinutes",
    "payableOvertimeMinutes",
    "completedShiftDays",
  ] as const;

  return countFields.every((field) => isCount(value[field])) &&
    isRate(value.attendanceRate);
}

function isToday(value: unknown): value is AttendanceToday {
  if (!isRecord(value)) return false;

  const countFields = [
    "scheduledShiftDays",
    "eligibleShiftDays",
    "presentEmployees",
    "notYetDue",
    "noClockInDuringActiveShift",
    "openSessions",
    "completedSessions",
  ] as const;

  return countFields.every((field) => isCount(value[field])) &&
    isRate(value.attendanceRate);
}

function isTrendDay(value: unknown): value is AttendanceTrendDay {
  if (!isRecord(value)) return false;

  const countFields = [
    "scheduledShiftDays",
    "eligibleShiftDays",
    "presentShiftDays",
    "scheduledMinutes",
    "workedMinutes",
    "potentialOvertimeMinutes",
    "payableOvertimeMinutes",
  ] as const;

  return typeof value.workDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.workDate) &&
    countFields.every((field) => isCount(value[field])) &&
    isRate(value.attendanceRate);
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isAttendanceSummaryResponse(
  value: unknown,
): value is AttendanceSummaryResponse {
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
    typeof value.organization.workDate !== "string" ||
    typeof value.organization.weekStartsOn !== "number" ||
    !isRecord(value.filters) ||
    !isDateString(value.filters.fromDate) ||
    !isDateString(value.filters.toDate) ||
    value.filters.fromDate > value.filters.toDate ||
    !(value.filters.departmentId === null ||
      typeof value.filters.departmentId === "string") ||
    !isCount(value.filters.maxRangeDays) ||
    !isPeriod(value.period) ||
    !isToday(value.today) ||
    !Array.isArray(value.dailyTrend) ||
    !value.dailyTrend.every(isTrendDay)
  ) {
    return false;
  }

  return true;
}

function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return formatNumber(hours) + "h " + String(minutes).padStart(2, "0") + "m";
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

/**
 * Opt-in attendance and working-hours analytics section.
 *
 * Reporting dates and the optional department are supplied by the shared
 * dashboard shell. The API remains the authority for tenant and role scope.
 * This section is intentionally exported but is not mounted into the current
 * role dashboards until the later composition step.
 */
export function ManagementDashboardAttendanceAnalytics({
  fromDate,
  toDate,
  departmentId = null,
}: ManagementDashboardAttendanceAnalyticsProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setState({ status: "loading" });

    try {
      const params = new URLSearchParams({
        fromDate,
        toDate,
      });

      if (departmentId) {
        params.set("departmentId", departmentId);
      }

      const result = await apiRequest<unknown>(
        "/management-dashboard/attendance-summary?" + params.toString(),
      );

      if (!isAttendanceSummaryResponse(result)) {
        throw new Error("The server returned an invalid attendance summary.");
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
            : "Unable to load attendance analytics.",
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

  return (
    <section className="md-attendance-section">
      <ManagementDashboardSectionHeading
        eyebrow="Attendance & working hours"
        title="Attendance performance"
        description="Scheduled attendance, worked time and overtime calculated from effective attendance records."
        action={
          state.status === "ready" ? (
            <span className="md-workforce-asof">
              As of {formatDate(state.data.generatedAt, state.data.organization.timeZone)}
            </span>
          ) : null
        }
        className="md-attendance-heading"
      />

      {state.status === "loading" ? (
        <>
          <ManagementDashboardSkeleton
            variant="metrics"
            count={8}
            columns={4}
            label="Loading attendance analytics"
          />
          <ManagementDashboardSkeleton
            variant="charts"
            count={2}
            label="Loading attendance trend and current shift pulse"
          />
        </>
      ) : null}

      {state.status === "error" ? (
        <ManagementDashboardErrorState
          title="Attendance analytics unavailable"
          description={state.message}
          icon={Activity}
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
          <div className="md-attendance-period-meta">
            <span>
              {formatDate(state.data.filters.fromDate, state.data.organization.timeZone)}
              {" – "}
              {formatDate(state.data.filters.toDate, state.data.organization.timeZone)}
            </span>
            <span>{roleScopeLabel(state.data.scope.roleName)}</span>
          </div>

          <ManagementDashboardMetricGrid columns={4}>
            <ManagementDashboardMetricCard
              label="Attendance rate"
              value={formatRate(state.data.period.attendanceRate)}
              state={state.data.period.attendanceRate === null ? "not-applicable" : "ready"}
              description="Present eligible scheduled employee-days ÷ eligible scheduled employee-days."
              context="Weighted across the selected period"
              icon={Activity}
              tone="accent"
            />
            <ManagementDashboardMetricCard
              label="Eligible shift-days"
              value={formatNumber(state.data.period.eligibleShiftDays)}
              description="Scheduled employee-days after approved leave and public holidays are excluded."
              icon={CalendarClock}
              tone="neutral"
            />
            <ManagementDashboardMetricCard
              label="Present shift-days"
              value={formatNumber(state.data.period.presentShiftDays)}
              description="Eligible scheduled days with at least one effective clock-in."
              icon={UserCheck}
              tone="success"
            />
            <ManagementDashboardMetricCard
              label="Scheduled hours"
              value={formatMinutes(state.data.period.scheduledMinutes)}
              description="Expected hours on attendance-eligible scheduled days."
              icon={Clock3}
              tone="neutral"
            />
            <ManagementDashboardMetricCard
              label="Worked hours"
              value={formatMinutes(state.data.period.workedMinutes)}
              description="Total server-calculated work time, including any recorded work on leave or holiday dates."
              icon={Timer}
              tone="accent"
            />
            <ManagementDashboardMetricCard
              label="Regular worked hours"
              value={formatMinutes(state.data.period.regularWorkedMinutes)}
              description="Calculated worked time excluding potential overtime."
              icon={Clock3}
              tone="neutral"
            />
            <ManagementDashboardMetricCard
              label="Potential overtime"
              value={formatMinutes(state.data.period.potentialOvertimeMinutes)}
              description="Time calculated beyond assigned shift end, before authorization."
              icon={Activity}
              tone="warning"
            />
            <ManagementDashboardMetricCard
              label="Payable overtime"
              value={formatMinutes(state.data.period.payableOvertimeMinutes)}
              description="Actual overtime minutes covered by approved advance authorization."
              icon={UserCheck}
              tone="success"
            />
          </ManagementDashboardMetricGrid>

          <ManagementDashboardGrid columns={2} className="md-attendance-panels">
            <ManagementDashboardChartPanel
              heading="Daily attendance trend"
              eyebrow="Selected period"
              description="Daily attendance rate uses eligible scheduled employee-days; N/A means no eligible shifts that day."
              chartHeight="tall"
              legend={[
                { label: "Attendance rate", tone: "accent" },
              ]}
            >
              {state.data.dailyTrend.every((day) => day.scheduledShiftDays === 0) ? (
                <div className="md-attendance-no-data">
                  No scheduled employee shifts were found in this period.
                </div>
              ) : (
                <div
                  className="md-attendance-trend"
                  role="list"
                  aria-label="Daily attendance rates"
                >
                  {state.data.dailyTrend.map((day) => (
                    <div
                      className="md-attendance-trend-item"
                      role="listitem"
                      aria-label={shortDate(day.workDate) + ": " + formatRate(day.attendanceRate) + ", " + formatNumber(day.presentShiftDays) + " of " + formatNumber(day.eligibleShiftDays) + " eligible shifts present"}
                      key={day.workDate}
                    >
                      <div className="md-attendance-trend-track" aria-hidden="true">
                        <span
                          className="md-attendance-trend-fill"
                          style={{
                            height: day.attendanceRate === null
                              ? "0%"
                              : String(day.attendanceRate) + "%",
                          }}
                        />
                      </div>
                      <strong className="md-attendance-trend-rate">
                        {formatRate(day.attendanceRate)}
                      </strong>
                      <time
                        className="md-attendance-trend-date"
                        dateTime={day.workDate}
                      >
                        {shortDate(day.workDate)}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </ManagementDashboardChartPanel>

            <ManagementDashboardPanel
              heading="Today's shift pulse"
              eyebrow="Live attendance"
              description="Current-day counters use the organization's local date; live exceptions and open sessions also include overnight shifts still running from the previous work date."
              className="md-attendance-live-panel"
            >
              <div className="md-attendance-live-grid">
                <div className="md-attendance-live-stat">
                  <span>Scheduled shifts</span>
                  <strong>{formatNumber(state.data.today.scheduledShiftDays)}</strong>
                  <small>Active workforce with a shift today</small>
                </div>
                <div className="md-attendance-live-stat">
                  <span>Present</span>
                  <strong>{formatNumber(state.data.today.presentEmployees)}</strong>
                  <small>At least one effective clock-in</small>
                </div>
                <div className="md-attendance-live-stat">
                  <span>Not yet due</span>
                  <strong>{formatNumber(state.data.today.notYetDue)}</strong>
                  <small>Assigned shift has not started</small>
                </div>
                <div className="md-attendance-live-stat md-attendance-live-warning">
                  <span>No clock-in during active shift</span>
                  <strong>{formatNumber(state.data.today.noClockInDuringActiveShift)}</strong>
                  <small>Live exception; not a confirmed absence</small>
                </div>
                <div className="md-attendance-live-stat">
                  <span>Open sessions</span>
                  <strong>{formatNumber(state.data.today.openSessions)}</strong>
                  <small>Clock-in without a closing clock-out</small>
                </div>
                <div className="md-attendance-live-stat">
                  <span>Completed sessions</span>
                  <strong>{formatNumber(state.data.today.completedSessions)}</strong>
                  <small>Valid attendance sequence with a closing punch</small>
                </div>
              </div>
              <p className="md-attendance-live-rate">
                Today's attendance rate: <strong>{formatRate(state.data.today.attendanceRate)}</strong>
                <span>
                  {formatNumber(state.data.today.presentEmployees)} present of{" "}
                  {formatNumber(state.data.today.eligibleShiftDays)} eligible shifts
                </span>
              </p>
            </ManagementDashboardPanel>
          </ManagementDashboardGrid>

          <p className="md-attendance-definition">
            {formatNumber(state.data.period.uniqueScheduledEmployees)} distinct employees were scheduled during this period. Attendance excludes approved leave and public holidays; potential overtime is not the same as payable overtime. This view does not infer lateness or confirmed absence.
          </p>
        </>
      ) : null}
    </section>
  );
}
