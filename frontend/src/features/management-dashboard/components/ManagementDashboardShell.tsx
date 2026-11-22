"use client";

import { useId, useState, type ReactNode } from "react";
import type { WorkspaceRole } from "@/types/workspace";

export type ManagementDashboardRole = Exclude<WorkspaceRole, "EMPLOYEE">;
export type ManagementDashboardPeriod =
  | "today"
  | "last-7-days"
  | "last-30-days"
  | "this-month"
  | "custom";

export type ManagementDashboardDateRange = {
  /** Inclusive YYYY-MM-DD date in the organization's local calendar. */
  startDate: string;
  /** Inclusive YYYY-MM-DD date in the organization's local calendar. */
  endDate: string;
};

export type ManagementDashboardFilterState = {
  period: ManagementDashboardPeriod;
  dateRange: ManagementDashboardDateRange;
  /** Null means all departments already inside the authenticated scope. */
  departmentId: string | null;
  timeZone: string;
};

export type ManagementDashboardDepartmentOption = {
  id: string;
  name: string;
};

export type ManagementDashboardShellProps = {
  role: ManagementDashboardRole;
  title: string;
  description?: string;
  eyebrow?: string;
  scopeLabel?: string;
  timeZone?: string;
  /** Optional authoritative organization-local date from the server context. */
  asOfDate?: string;
  /** Must contain only departments already authorized by the server. */
  departments?: ManagementDashboardDepartmentOption[];
  initialPeriod?: ManagementDashboardPeriod;
  initialDateRange?: ManagementDashboardDateRange;
  initialDepartmentId?: string | null;
  onFiltersChange?: (filters: ManagementDashboardFilterState) => void;
  headerAction?: ReactNode;
  children: ReactNode;
  showControls?: boolean;
  /** Optional maximum inclusive calendar-day span enforced by the parent metrics. */
  maxRangeDays?: number;
  className?: string;
};

const PERIOD_OPTIONS: Array<{
  value: ManagementDashboardPeriod;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "last-7-days", label: "Last 7 days" },
  { value: "last-30-days", label: "Last 30 days" },
  { value: "this-month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

function isValidDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function localDateInTimeZone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return String(values.year) + "-" + String(values.month) + "-" + String(values.day);
  } catch {
    const now = new Date();
    return [
      String(now.getFullYear()).padStart(4, "0"),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  }
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function rangeForPeriod(
  period: ManagementDashboardPeriod,
  today: string,
): ManagementDashboardDateRange {
  if (period === "today") {
    return { startDate: today, endDate: today };
  }

  if (period === "last-7-days") {
    return { startDate: shiftDate(today, -6), endDate: today };
  }

  if (period === "last-30-days") {
    return { startDate: shiftDate(today, -29), endDate: today };
  }

  if (period === "this-month") {
    return { startDate: today.slice(0, 8) + "01", endDate: today };
  }

  return { startDate: today, endDate: today };
}

function inclusiveRangeDays(range: ManagementDashboardDateRange): number {
  const from = new Date(range.startDate + "T00:00:00.000Z").getTime();
  const to = new Date(range.endDate + "T00:00:00.000Z").getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

function formatDateOnly(value: string): string {
  if (!isValidDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Shared, opt-in shell for the three management workspaces.
 *
 * This component owns presentation state only. It does not fetch data, grant
 * access, apply filters to API requests, or change any existing dashboard.
 * Consumers receive inclusive organization-local date filters and may use
 * them only with a server endpoint that revalidates the authenticated scope.
 */
export function ManagementDashboardShell({
  role,
  title,
  description,
  eyebrow,
  scopeLabel,
  timeZone = "Africa/Kigali",
  asOfDate,
  departments = [],
  initialPeriod = "today",
  initialDateRange,
  initialDepartmentId,
  onFiltersChange,
  headerAction,
  children,
  showControls = true,
  maxRangeDays,
  className = "",
}: ManagementDashboardShellProps) {
  const ids = useId();
  const today = asOfDate && isValidDate(asOfDate)
    ? asOfDate
    : localDateInTimeZone(timeZone);

  const [period, setPeriod] = useState<ManagementDashboardPeriod>(initialPeriod);
  const [dateRange, setDateRange] = useState<ManagementDashboardDateRange>(
    initialDateRange ?? rangeForPeriod(initialPeriod, today),
  );
  const [departmentId, setDepartmentId] = useState(
    initialDepartmentId ?? "",
  );

  const rangeTooLong = Boolean(
    maxRangeDays &&
    Number.isSafeInteger(maxRangeDays) &&
    maxRangeDays > 0 &&
    isValidDate(dateRange.startDate) &&
    isValidDate(dateRange.endDate) &&
    dateRange.startDate <= dateRange.endDate &&
    inclusiveRangeDays(dateRange) > maxRangeDays,
  );
  const rangeWithinLimit = !maxRangeDays ||
    (Number.isSafeInteger(maxRangeDays) && maxRangeDays > 0 && !rangeTooLong);

  const validRange =
    isValidDate(dateRange.startDate) &&
    isValidDate(dateRange.endDate) &&
    dateRange.startDate <= dateRange.endDate &&
    dateRange.endDate <= today &&
    rangeWithinLimit;

  function notifyFilterChange(
    nextPeriod: ManagementDashboardPeriod,
    nextRange: ManagementDashboardDateRange,
    nextDepartmentId: string,
  ) {
    const valid =
      isValidDate(nextRange.startDate) &&
      isValidDate(nextRange.endDate) &&
      nextRange.startDate <= nextRange.endDate &&
      nextRange.endDate <= today &&
      (!maxRangeDays ||
        (Number.isSafeInteger(maxRangeDays) && maxRangeDays > 0 &&
          inclusiveRangeDays(nextRange) <= maxRangeDays));

    if (!valid) return;

    const permittedDepartmentId =
      nextDepartmentId &&
      departments.some((department) => department.id === nextDepartmentId)
        ? nextDepartmentId
        : null;

    onFiltersChange?.({
      period: nextPeriod,
      dateRange: nextRange,
      departmentId: permittedDepartmentId,
      timeZone,
    });
  }

  const rangeSummary = validRange
    ? dateRange.startDate === dateRange.endDate
      ? formatDateOnly(dateRange.startDate)
      : formatDateOnly(dateRange.startDate) + " – " + formatDateOnly(dateRange.endDate)
    : "Choose a valid date range";

  function handlePeriodChange(nextPeriod: ManagementDashboardPeriod) {
    setPeriod(nextPeriod);
    const nextRange = nextPeriod === "custom"
      ? dateRange
      : rangeForPeriod(nextPeriod, today);
    setDateRange(nextRange);
    notifyFilterChange(nextPeriod, nextRange, departmentId);
  }

  function handleDateChange(field: keyof ManagementDashboardDateRange, value: string) {
    const nextRange = { ...dateRange, [field]: value };
    setPeriod("custom");
    setDateRange(nextRange);
    notifyFilterChange("custom", nextRange, departmentId);
  }

  function handleDepartmentChange(value: string) {
    setDepartmentId(value);
    notifyFilterChange(period, dateRange, value);
  }

  const periodId = ids + "-period";
  const departmentIdLabel = ids + "-department";
  const startDateId = ids + "-start-date";
  const endDateId = ids + "-end-date";
  const departmentFilterAvailable = departments.length > 0;
  const allDepartmentsLabel = role === "DEPARTMENT_MANAGER"
    ? "All assigned departments"
    : "All departments in organization";

  return (
    <div
      className={("md-dashboard-shell " + className).trim()}
      data-management-role={role}
    >
      <header className="md-dashboard-header">
        <div className="md-dashboard-header-copy">
          <p className="md-dashboard-eyebrow">{eyebrow ?? "Management overview"}</p>
          <h1>{title}</h1>
          {description ? <p className="md-dashboard-description">{description}</p> : null}
        </div>

        <div className="md-dashboard-header-meta">
          <span className="md-dashboard-scope" title="Data scope is determined by your authenticated role">
            <span className="md-dashboard-scope-mark" aria-hidden="true" />
            {scopeLabel ?? defaultScopeLabel(role)}
          </span>
          {headerAction ? <div className="md-dashboard-header-action">{headerAction}</div> : null}
        </div>
      </header>

      {showControls ? (
        <section className="md-reporting-toolbar" aria-label="Reporting period and scope filters">
          <div className="md-reporting-toolbar-heading">
            <span className="md-reporting-kicker">Reporting view</span>
            <strong>{departmentFilterAvailable ? "Choose the period and department" : "Choose the reporting period"}</strong>
            <span className="md-reporting-summary" aria-live="polite">{rangeSummary}</span>
          </div>

          <div className="md-reporting-controls">
            <div className="md-reporting-control">
              <label htmlFor={periodId}>Reporting period</label>
              <select
                id={periodId}
                className="filter-select md-reporting-select"
                value={period}
                onChange={(event) =>
                  handlePeriodChange(event.target.value as ManagementDashboardPeriod)
                }
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {period === "custom" ? (
              <div className="md-custom-range" aria-label="Custom date range">
                <div className="md-reporting-control">
                  <label htmlFor={startDateId}>From</label>
                  <input
                    id={startDateId}
                    className="text-input md-reporting-date"
                    type="date"
                    value={dateRange.startDate}
                    max={isValidDate(dateRange.endDate) && dateRange.endDate <= today ? dateRange.endDate : today}
                    aria-invalid={!isValidDate(dateRange.startDate) || dateRange.startDate > dateRange.endDate || dateRange.startDate > today}
                    onChange={(event) => handleDateChange("startDate", event.target.value)}
                  />
                </div>
                <div className="md-reporting-control">
                  <label htmlFor={endDateId}>To</label>
                  <input
                    id={endDateId}
                    className="text-input md-reporting-date"
                    type="date"
                    value={dateRange.endDate}
                    min={isValidDate(dateRange.startDate) ? dateRange.startDate : undefined}
                    max={today}
                    aria-invalid={!isValidDate(dateRange.endDate) || dateRange.endDate > today || dateRange.startDate > dateRange.endDate}
                    onChange={(event) => handleDateChange("endDate", event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {departmentFilterAvailable ? (
              <div className="md-reporting-control md-reporting-department">
                <label htmlFor={departmentIdLabel}>Department</label>
                <select
                  id={departmentIdLabel}
                  className="filter-select md-reporting-select"
                  value={departmentId}
                  onChange={(event) => handleDepartmentChange(event.target.value)}
                >
                  <option value="">{allDepartmentsLabel}</option>
                  {departments.map((department) => (
                    <option value={department.id} key={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="md-reporting-timezone" title="Dates follow your organization's configured time zone">
              <span>Organization time</span>
              <strong>{timeZone}</strong>
            </div>
          </div>

          {!validRange ? (
            <p className="md-reporting-validation" role="alert">
              {rangeTooLong && maxRangeDays
                ? `This reporting view supports up to ${maxRangeDays} calendar days. Choose a shorter range to refresh attendance and leave metrics.`
                : "The start date must be on or before the end date, and the reporting range cannot end in the future. Select a valid date range to update the reporting view."}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="md-dashboard-content">{children}</div>
    </div>
  );
}

function defaultScopeLabel(role: ManagementDashboardRole): string {
  return role === "DEPARTMENT_MANAGER"
    ? "Assigned departments"
    : role === "HR_MANAGER"
      ? "Organization-wide HR scope"
      : "Organization-wide scope";
}
