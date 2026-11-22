"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarCheck,
  ChartNoAxesCombined,
  Users,
} from "lucide-react";

import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { apiRequest, pickArray, stringValue } from "@/lib/api-client";
import { formatDate, humanize } from "@/lib/format";
import { roleLabels } from "@/lib/workspace-config";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { useAttendanceRefresh } from "@/lib/attendance-events";
import type { WorkspaceRole } from "@/types/workspace";
import { EmployeeMyDayWorkspace, PersonalMyDayWorkspace } from "@/features/workspace/EmployeeMyDayWorkspace";
import {
  ManagementDashboardActionCenter,
  ManagementDashboardAttendanceAnalytics,
  ManagementDashboardLeaveAvailability,
  ManagementDashboardPayrollOvertime,
  ManagementDashboardShell,
  ManagementDashboardWorkforceComposition,
  ManagementDashboardWorkforceKpis,
  type ManagementDashboardDateRange,
  type ManagementDashboardFilterState,
} from "@/features/management-dashboard/components";

interface DashboardData {
  stats?: Record<string, unknown>;
  organization?: Record<string, unknown>;
  generatedAt?: string;
  workDate?: string | null;
  timeZone?: string;
  departments?: Record<string, unknown>[];
  recentEmployees?: Record<string, unknown>[];
  recentActivity?: Record<string, unknown>[];
  departmentDistribution?: Record<string, unknown>[];
  pendingInvitations?: number;
  team?: Record<string, unknown>;
  reviewCounts?: Record<string, unknown>;
  clockStatus?: string;
  events?: Record<string, unknown>[];
}

type ManagementRole = Exclude<WorkspaceRole, "EMPLOYEE">;

function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addCalendarDays(value: string, offset: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function initialReportingRange(workDate: string | null | undefined, timeZone: string): ManagementDashboardDateRange {
  let endDate: string;
  if (isISODate(workDate)) {
    endDate = workDate;
  } else {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      endDate = String(values.year) + "-" + String(values.month) + "-" + String(values.day);
    } catch {
      const now = new Date();
      endDate = [
        String(now.getFullYear()).padStart(4, "0"),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
    }
  }
  return { startDate: addCalendarDays(endDate, -29), endDate };
}

export function WorkspaceDashboard({ role }: { role: WorkspaceRole }) {
  const { user, timeZone, workDate } = useWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partialWarning, setPartialWarning] = useState("");
  const [reportingRange, setReportingRange] = useState<ManagementDashboardDateRange>(
    () => initialReportingRange(workDate, timeZone),
  );
  const loadSequenceRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (role === "EMPLOYEE") return;
    const requestId = ++loadSequenceRef.current;

    if (!silent) setLoading(true);
    setError("");
    setPartialWarning("");

    try {
      let result: DashboardData;

      if (role === "ORGANIZATION_ADMIN") {
        const [overview, activityResult] = await Promise.all([
          apiRequest<DashboardData>("/org/dashboard/stats"),
          apiRequest<unknown>("/org/dashboard/activity?limit=8")
            .then((payload) => ({ payload, error: "" }))
            .catch((caught) => ({
              payload: null,
              error: caught instanceof Error
                ? caught.message
                : "The recent activity feed is temporarily unavailable.",
            })),
        ]);

        if (requestId !== loadSequenceRef.current) return;

        if (activityResult.error) {
          setPartialWarning(
            "The organization overview loaded, but recent activity could not be retrieved: " +
            activityResult.error,
          );
          setData((current) => ({
            ...overview,
            recentActivity: current?.recentActivity ?? [],
          }));
          return;
        }

        result = {
          ...overview,
          recentActivity: pickArray(activityResult.payload, "activities"),
        };
      } else if (role === "HR_MANAGER") {
        result = await apiRequest<DashboardData>("/hr-manager/overview");
      } else {
        // Department team data remains sourced from the existing manager overview.
        // Actionable review counts are now supplied by the Step 11 snapshot endpoint.
        result = await apiRequest<DashboardData>("/department-manager/overview");
      }

      if (requestId === loadSequenceRef.current) setData(result);
    } catch (caught) {
      if (requestId === loadSequenceRef.current) {
        setError(caught instanceof Error ? caught.message : "Unable to load your workspace context.");
      }
    } finally {
      if (!silent && requestId === loadSequenceRef.current) setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartRefresh(() => load(true), role !== "EMPLOYEE", 60_000);
  useAttendanceRefresh(() => {
    if (role !== "EMPLOYEE") void load(true);
  });

  const title = role === "DEPARTMENT_MANAGER"
    ? "Your team overview"
    : role === "HR_MANAGER"
      ? "People operations"
      : "Organization overview";

  const description = role === "DEPARTMENT_MANAGER"
    ? "A focused view of your assigned departments, attendance, availability and pending team decisions."
    : role === "HR_MANAGER"
      ? "Bring workforce operations, attendance, leave, overtime and payroll readiness into one clear view."
      : "Understand workforce health, organization readiness and the management work that needs attention.";

  const handleFiltersChange = useCallback((filters: ManagementDashboardFilterState) => {
    setReportingRange(filters.dateRange);
  }, []);

  if (role === "EMPLOYEE") return <EmployeeMyDayWorkspace />;

  const managementRole = role as ManagementRole;

  const hasManagerQuickNavigation = role === "HR_MANAGER" || role === "DEPARTMENT_MANAGER";

  return (
    <>
      {hasManagerQuickNavigation ? (
        <nav className="workspace-dashboard-quick-nav" aria-label="Dashboard quick navigation">
          <div className="workspace-dashboard-quick-nav-copy">
            <span>QUICK NAVIGATION</span>
            <strong>Go directly to a workspace area</strong>
          </div>
          <div className="workspace-dashboard-quick-nav-actions">
            <Link href="#my-day-area" className="workspace-dashboard-quick-link">
              <span className="workspace-dashboard-quick-link-icon"><CalendarCheck size={17} /></span>
              <span className="workspace-dashboard-quick-link-copy">
                <strong>My Day</strong>
                <small>Your attendance and daily activity</small>
              </span>
              <ArrowRight size={15} />
            </Link>
            <Link href="#management-stats-area" className="workspace-dashboard-quick-link">
              <span className="workspace-dashboard-quick-link-icon"><ChartNoAxesCombined size={17} /></span>
              <span className="workspace-dashboard-quick-link-copy">
                <strong>Management stats</strong>
                <small>Workforce, attendance, leave and payroll insights</small>
              </span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </nav>
      ) : null}

      {hasManagerQuickNavigation ? (
        <section id="my-day-area" className="workspace-dashboard-anchor" aria-label="My Day">
          <PersonalMyDayWorkspace key={user.role + ":" + (user.employeeId ?? "none")} />
        </section>
      ) : null}

      <section
        id={hasManagerQuickNavigation ? "management-stats-area" : undefined}
        className="workspace-dashboard-anchor"
        aria-label={hasManagerQuickNavigation ? "Management stats" : undefined}
      >
      <ManagementDashboardShell
        role={managementRole}
        title={title}
        description={description}
        eyebrow={roleLabels[role]}
        scopeLabel={
          role === "DEPARTMENT_MANAGER"
            ? "Assigned departments"
            : role === "HR_MANAGER"
              ? "Organization-wide HR scope"
              : "Organization-wide scope"
        }
        timeZone={timeZone}
        asOfDate={isISODate(workDate) ? workDate : reportingRange.endDate}
        initialPeriod="last-30-days"
        initialDateRange={reportingRange}
        maxRangeDays={31}
        onFiltersChange={handleFiltersChange}
      >
        {error ? (
          <div className="error-state panel" role="alert">
            <div className="state-icon"><AlertCircle size={19} /></div>
            <h3>Workspace context could not be refreshed</h3>
            <p>{error} The management sections below load from their own authorized data sources.</p>
          </div>
        ) : null}

        {partialWarning ? (
          <div className="info-callout" role="status">
            <AlertCircle size={15} />
            {partialWarning}
          </div>
        ) : null}

        <p className="md-reporting-scope-note">
          Reporting dates apply to attendance and leave. Payroll and overtime use the month containing the selected end date. Workforce composition and action queues reflect current records in your authorized scope.
        </p>
        <ManagementDashboardActionCenter role={managementRole} />
        <ManagementDashboardWorkforceKpis />
        <ManagementDashboardWorkforceComposition />
        <ManagementDashboardAttendanceAnalytics
          fromDate={reportingRange.startDate}
          toDate={reportingRange.endDate}
        />
        <ManagementDashboardLeaveAvailability
          fromDate={reportingRange.startDate}
          toDate={reportingRange.endDate}
        />
        <ManagementDashboardPayrollOvertime month={reportingRange.endDate.slice(0, 7)} />

        <div className="page-grid grid-2 md-management-context-grid">
          {role === "ORGANIZATION_ADMIN" ? (
            <>
              <Panel>
                <PanelHeading
                  title="Organization readiness"
                  description="Keep staffing structure, manager eligibility and organization administration moving."
                />
                <div className="task-list">
                  <TaskLink
                    href="/org/employees?filter=unassigned"
                    title="Unassigned workforce"
                    description="Review people who do not have a department assignment."
                  />
                  <TaskLink
                    href="/org/departments"
                    title="Department manager eligibility"
                    description="Review department ownership and manager assignments."
                  />
                  <TaskLink
                    href="/org/settings"
                    title="Organization profile & settings"
                    description="Maintain the organization context used throughout HRMS."
                  />
                  <TaskLink
                    href="/org/license"
                    title="License & payments"
                    description="Review subscription access and payment verification."
                  />
                  <TaskLink
                    href="/org/invitations"
                    title="Invitation management"
                    description="Open the existing invitation registry."
                  />
                </div>
              </Panel>
              <ActivityPanel
                activity={data?.recentActivity ?? []}
                loading={loading}
                timeZone={timeZone}
              />
            </>
          ) : role === "HR_MANAGER" ? (
            <>
              <Panel>
                <PanelHeading
                  title="HR operations"
                  description="Jump directly into the existing workforce and operational workspaces."
                />
                <div className="task-list">
                  <TaskLink href="/hr/employees" title="Workforce directory" description="Manage employee records and workforce details." />
                  <TaskLink href="/hr/departments" title="Departments" description="Review department structure and ownership." />
                  <TaskLink href="/hr/modules/attendance" title="Attendance operations" description="Review attendance records and corrections." />
                  <TaskLink href="/hr/modules/leave" title="Leave & holidays" description="Manage leave decisions and public holidays." />
                  <TaskLink href="/hr/modules/payroll" title="Salary payments" description="Review monthly salary payment records." />
                  <TaskLink href="/hr/reports" title="Workforce reports" description="Generate authorized operational reports." />
                </div>
              </Panel>
              <DepartmentSnapshotPanel
                departments={data?.departments ?? []}
                loading={loading}
                description="Organization departments from the current HR overview."
              />
            </>
          ) : (
            <>
              <Panel>
                <PanelHeading
                  title="Your assigned departments"
                  description="Only departments assigned to your manager account are shown here."
                />
                {loading ? (
                  <div className="loading-state">
                    <div className="skeleton" style={{ height: 14, width: "60%", margin: "0 auto" }} />
                  </div>
                ) : data?.departments?.length ? (
                  <div className="task-list">
                    {data.departments.map((row) => (
                      <TaskLink
                        key={stringValue(row, "id")}
                        href="/dm/team"
                        title={stringValue(row, "name") || "Department"}
                        description={stringValue(row, "description") || "Open your assigned department team."}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="state-icon"><Building2 size={18} /></div>
                    <h3>No assigned departments</h3>
                    <p>Your assigned department list will appear here when it is available.</p>
                  </div>
                )}
              </Panel>
              <Panel>
                <PanelHeading
                  title="Team workspace"
                  description="Your assigned team operations and reporting destinations."
                />
                <div className="task-list">
                  <TaskLink href="/dm/team" title="My team" description="Open the employees in your assigned departments." />
                  <TaskLink href="/dm/attendance" title="Attendance" description="Review your team's attendance records." />
                  <TaskLink href="/dm/schedule" title="Team schedule" description="Review assigned working schedules." />
                  <TaskLink href="/dm/leave" title="Leave & holidays" description="Open the existing team leave workspace." />
                  <TaskLink href="/dm/payroll" title="Team payments" description="Open permitted team payment aggregates and your personal payslip access." />
                  <TaskLink href="/dm/reports" title="Attendance reports" description="Generate reports for your assigned departments." />
                </div>
              </Panel>
            </>
          )}
        </div>
      </ManagementDashboardShell>
      </section>
    </>
  );
}

function ActivityPanel({
  activity,
  loading,
  timeZone,
}: {
  activity: Record<string, unknown>[];
  loading: boolean;
  timeZone: string;
}) {
  return (
    <Panel>
      <PanelHeading
        title="Recent organization activity"
        description="A short timeline of recorded organization changes."
      />
      {loading ? (
        <div className="loading-state">
          <div className="skeleton" style={{ height: 14, width: "60%", margin: "0 auto" }} />
        </div>
      ) : activity.length ? (
        activity.slice(0, 7).map((row, index) => (
          <div className="activity-row" key={stringValue(row, "id") || index}>
            <span className="activity-dot" />
            <div>
              <strong>{humanize(stringValue(row, "actionKey", "eventType") || "Workforce update")}</strong>
              <span>
                {stringValue(row, "actorEmail", "employeeName") || "Organization activity"}
                {" · "}
                {formatDate(stringValue(row, "createdAt", "effectiveAt"), timeZone)}
              </span>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <div className="state-icon"><Activity size={18} /></div>
          <h3>No recent activity</h3>
          <p>When an organization update is recorded, it will appear here.</p>
        </div>
      )}
    </Panel>
  );
}

function DepartmentSnapshotPanel({
  departments,
  loading,
  description,
}: {
  departments: Record<string, unknown>[];
  loading: boolean;
  description: string;
}) {
  return (
    <Panel>
      <PanelHeading title="Department snapshot" description={description} />
      {loading ? (
        <div className="loading-state">
          <div className="skeleton" style={{ height: 14, width: "60%", margin: "0 auto" }} />
        </div>
      ) : departments.length ? (
        <div className="task-list">
          {departments.slice(0, 8).map((row, index) => {
            const managerName = stringValue(row, "manager_name", "managerName");
            return (
              <div className="task-row" key={stringValue(row, "id") || index}>
                <div>
                  <strong>{stringValue(row, "name") || "Department"}</strong>
                  <span>{humanize(stringValue(row, "status") || "Status unavailable")}</span>
                </div>
                <span className="task-count" aria-label="Department manager">
                  {managerName ? "Manager: " + managerName : "No manager assigned"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="state-icon"><Users size={18} /></div>
          <h3>No department data</h3>
          <p>Department information will appear here when it is available.</p>
        </div>
      )}
    </Panel>
  );
}

function TaskLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="task-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <ArrowRight size={14} color="var(--subtle)" />
      </span>
    </Link>
  );
}
