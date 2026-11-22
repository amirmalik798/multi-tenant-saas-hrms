"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  RefreshCw,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useSmartRefresh } from "@/lib/smart-refresh";
import type { WorkspaceRole } from "@/types/workspace";
import { managementDashboardLinks } from "../links";

import {
  ManagementDashboardChartLegend,
  ManagementDashboardChartPanel,
  ManagementDashboardErrorState,
  ManagementDashboardGrid,
  ManagementDashboardPanel,
  ManagementDashboardSectionHeading,
  ManagementDashboardSkeleton,
} from "./ManagementDashboardPrimitives";

type ManagementRole = Exclude<WorkspaceRole, "EMPLOYEE">;
type ScopeKind = "ORGANIZATION" | "ASSIGNED_DEPARTMENTS";

type WorkforceCounts = {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  formerEmployees: number;
};

type DepartmentComposition = WorkforceCounts & {
  departmentId: string;
  departmentName: string;
  departmentStatus: string;
};

type RoleComposition = {
  roleName: string;
  totalEmployees: number;
};

type WorkforceCompositionResponse = {
  status: "ok";
  schemaVersion: 1;
  generatedAt: string;
  populationDefinition: {
    key: "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN";
    source: string;
    countingRule: string;
  };
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
  summary: WorkforceCounts;
  employmentStatus: {
    active: number;
    inactive: number;
    former: number;
    total: number;
  };
  departments: DepartmentComposition[];
  unassigned: WorkforceCounts | null;
  workforceRoles: RoleComposition[];
  movement: {
    status: "DEFERRED";
    reason: string;
  };
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: WorkforceCompositionResponse };

const STATUS_LEGEND = [
  { label: "Active", tone: "success" as const },
  { label: "Inactive", tone: "warning" as const },
  { label: "Former", tone: "danger" as const },
];

function isCount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

function isManagementRole(value: unknown): value is ManagementRole {
  return value === "ORGANIZATION_ADMIN" ||
    value === "HR_MANAGER" ||
    value === "DEPARTMENT_MANAGER";
}

function isWorkforceCounts(value: unknown): value is WorkforceCounts {
  if (!isRecord(value)) return false;

  const totalEmployees = value.totalEmployees;
  const activeEmployees = value.activeEmployees;
  const inactiveEmployees = value.inactiveEmployees;
  const formerEmployees = value.formerEmployees;

  return isCount(totalEmployees) &&
    isCount(activeEmployees) &&
    isCount(inactiveEmployees) &&
    isCount(formerEmployees) &&
    activeEmployees + inactiveEmployees + formerEmployees === totalEmployees;
}

function isDepartmentComposition(value: unknown): value is DepartmentComposition {
  return isRecord(value) &&
    typeof value.departmentId === "string" &&
    typeof value.departmentName === "string" &&
    typeof value.departmentStatus === "string" &&
    isWorkforceCounts(value);
}

function isRoleComposition(value: unknown): value is RoleComposition {
  return isRecord(value) &&
    typeof value.roleName === "string" &&
    value.roleName.trim().length > 0 &&
    isCount(value.totalEmployees);
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isWorkforceCompositionResponse(
  value: unknown,
): value is WorkforceCompositionResponse {
  if (
    !isRecord(value) ||
    value.status !== "ok" ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(new Date(value.generatedAt).getTime()) ||
    !isRecord(value.populationDefinition) ||
    value.populationDefinition.key !== "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN" ||
    typeof value.populationDefinition.source !== "string" ||
    !isRecord(value.scope) ||
    !isManagementRole(value.scope.roleName) ||
    (value.scope.kind !== "ORGANIZATION" &&
      value.scope.kind !== "ASSIGNED_DEPARTMENTS") ||
    ((value.scope.roleName === "DEPARTMENT_MANAGER") !==
      (value.scope.kind === "ASSIGNED_DEPARTMENTS")) ||
    !isRecord(value.organization) ||
    typeof value.organization.name !== "string" ||
    typeof value.organization.timeZone !== "string" ||
    typeof value.organization.weekStartsOn !== "number" ||
    !isDateString(value.organization.workDate) ||
    !isWorkforceCounts(value.summary) ||
    !isRecord(value.employmentStatus) ||
    !isCount(value.employmentStatus.active) ||
    !isCount(value.employmentStatus.inactive) ||
    !isCount(value.employmentStatus.former) ||
    !isCount(value.employmentStatus.total) ||
    value.employmentStatus.active !== value.summary.activeEmployees ||
    value.employmentStatus.inactive !== value.summary.inactiveEmployees ||
    value.employmentStatus.former !== value.summary.formerEmployees ||
    value.employmentStatus.total !== value.summary.totalEmployees ||
    !Array.isArray(value.departments) ||
    !value.departments.every(isDepartmentComposition) ||
    !(value.unassigned === null || isWorkforceCounts(value.unassigned)) ||
    !Array.isArray(value.workforceRoles) ||
    !value.workforceRoles.every(isRoleComposition) ||
    !isRecord(value.movement) ||
    value.movement.status !== "DEFERRED" ||
    typeof value.movement.reason !== "string"
  ) {
    return false;
  }

  const roleTotal = value.workforceRoles.reduce(
    (total, role) => total + role.totalEmployees,
    0,
  );
  const departmentTotal = value.departments.reduce(
    (total, department) => total + department.totalEmployees,
    0,
  );

  return roleTotal === value.summary.totalEmployees &&
    (value.unassigned === null
      ? departmentTotal === value.summary.totalEmployees
      : departmentTotal + value.unassigned.totalEmployees === value.summary.totalEmployees);
}

function percentage(count: number, total: number): string {
  if (total === 0) return "0%";
  return String(Math.round((count / total) * 1000) / 10) + "%";
}

function barWidth(count: number, total: number): string {
  if (count <= 0 || total <= 0) return "0%";
  return String((count / total) * 100) + "%";
}

function humanizeRole(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roleScopeLabel(role: ManagementRole): string {
  if (role === "DEPARTMENT_MANAGER") return "Assigned-department workforce";
  if (role === "HR_MANAGER") return "Organization-wide HR workforce";
  return "Organization-wide workforce";
}

function StatusStack({
  counts,
  label,
}: {
  counts: WorkforceCounts;
  label: string;
}) {
  const total = counts.totalEmployees;

  return (
    <div
      className="md-composition-stack"
      role="img"
      aria-label={
        label + ": " +
        formatNumber(counts.activeEmployees) + " active, " +
        formatNumber(counts.inactiveEmployees) + " inactive, " +
        formatNumber(counts.formerEmployees) + " former"
      }
    >
      {counts.activeEmployees > 0 ? (
        <span
          className="md-composition-segment md-composition-segment-active"
          style={{ width: barWidth(counts.activeEmployees, total) }}
        />
      ) : null}
      {counts.inactiveEmployees > 0 ? (
        <span
          className="md-composition-segment md-composition-segment-inactive"
          style={{ width: barWidth(counts.inactiveEmployees, total) }}
        />
      ) : null}
      {counts.formerEmployees > 0 ? (
        <span
          className="md-composition-segment md-composition-segment-former"
          style={{ width: barWidth(counts.formerEmployees, total) }}
        />
      ) : null}
      {total === 0 ? (
        <span className="md-composition-segment-empty" />
      ) : null}
    </div>
  );
}

function StatusCountDetails({ counts, links }: { counts: WorkforceCounts; links: ReturnType<typeof managementDashboardLinks> }) {
  return (
    <div className="md-composition-counts">
      <Link href={links.workforce({ status: "ACTIVE" })} className="md-composition-detail-link"><i className="md-composition-dot md-composition-dot-active" /> Active {formatNumber(counts.activeEmployees)}</Link>
      <Link href={links.workforce({ status: "INACTIVE" })} className="md-composition-detail-link"><i className="md-composition-dot md-composition-dot-inactive" /> Inactive {formatNumber(counts.inactiveEmployees)}</Link>
      <Link href={links.workforce({ status: "FORMER" })} className="md-composition-detail-link"><i className="md-composition-dot md-composition-dot-former" /> Former {formatNumber(counts.formerEmployees)}</Link>
    </div>
  );
}

/**
 * Opt-in current workforce composition section.
 *
 * Department and status charts use the same canonical population as the Step 6
 * workforce KPIs. Movement and turnover are explicitly deferred until their
 * event timestamps and activation/separation meanings are authoritative.
 */
export function ManagementDashboardWorkforceComposition() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: "loading" });

    try {
      const result = await apiRequest<unknown>(
        "/management-dashboard/workforce-composition",
      );

      if (!isWorkforceCompositionResponse(result)) {
        throw new Error("The server returned an invalid workforce composition.");
      }

      setState({ status: "ready", data: result });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Unable to load workforce composition.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartRefresh(() => load(true), true, 60_000);

  return (
    <section className="md-composition-section">
      <ManagementDashboardSectionHeading
        eyebrow="Workforce composition"
        title="How the workforce is structured"
        description="Department, employment-status and role distribution from the shared management workforce population."
        action={
          state.status === "ready" ? (
            <span className="md-workforce-asof">
              As of {formatDate(state.data.organization.workDate, state.data.organization.timeZone)}
            </span>
          ) : null
        }
        className="md-composition-heading"
      />

      {state.status === "loading" ? (
        <ManagementDashboardSkeleton
          variant="charts"
          count={3}
          label="Loading workforce composition"
        />
      ) : null}

      {state.status === "error" ? (
        <ManagementDashboardErrorState
          title="Workforce composition unavailable"
          description={state.message}
          icon={Users}
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
          {(() => {
            const links = managementDashboardLinks(state.data.scope.roleName);
            return (
              <>
          <div className="md-composition-meta">
            <span>{formatNumber(state.data.summary.totalEmployees)} distinct workforce members</span>
            <span>{roleScopeLabel(state.data.scope.roleName)}</span>
          </div>

          <ManagementDashboardGrid columns={2} className="md-composition-panels">
            <ManagementDashboardChartPanel
              heading="Employment status"
              eyebrow="Current workforce"
              description="Each employee is counted once in the current status recorded on their workforce profile."
              chartHeight="compact"
              legend={STATUS_LEGEND}
            >
              <div className="md-composition-summary">
                <strong>{formatNumber(state.data.summary.totalEmployees)}</strong>
                <span>Total workforce</span>
              </div>
              <StatusStack
                counts={state.data.summary}
                label="Overall employment status composition"
              />
              <StatusCountDetails counts={state.data.summary} links={links} />
            </ManagementDashboardChartPanel>

            <ManagementDashboardChartPanel
              heading="Department distribution"
              eyebrow="Organization structure"
              description="Distinct workforce members by their valid organization-local department assignment."
              chartHeight="standard"
              legend={STATUS_LEGEND}
            >
              <div className="md-composition-department-list">
                {state.data.departments.length === 0 ? (
                  <p className="md-composition-empty">No departments are available in this management scope.</p>
                ) : (
                  state.data.departments.map((department) => (
                    <div className="md-composition-department" key={department.departmentId}>
                      <div className="md-composition-department-heading">
                        <div>
                          <Link className="md-composition-drilldown" href={links.workforce({ departmentId: department.departmentId })}>{department.departmentName}</Link>
                          <span>{department.departmentStatus.replace(/[_-]+/g, " ")}</span>
                        </div>
                        <b>{formatNumber(department.totalEmployees)}</b>
                      </div>
                      <StatusStack
                        counts={department}
                        label={department.departmentName}
                      />
                    </div>
                  ))
                )}

                {state.data.unassigned ? (
                  <div className="md-composition-department md-composition-unassigned">
                    <div className="md-composition-department-heading">
                      <div>
                        <Link className="md-composition-drilldown" href={links.workforce({ unassigned: true })}>Unassigned</Link>
                        <span>No valid department assignment</span>
                      </div>
                      <b>{formatNumber(state.data.unassigned.totalEmployees)}</b>
                    </div>
                    <StatusStack
                      counts={state.data.unassigned}
                      label="Unassigned workforce"
                    />
                  </div>
                ) : (
                  <p className="md-composition-scope-note">
                    Unassigned workforce is N/A for Department Managers because their population is limited to assigned departments.
                  </p>
                )}
              </div>
            </ManagementDashboardChartPanel>

            <ManagementDashboardChartPanel
              heading="Workforce role mix"
              eyebrow="Role composition"
              description="Current organization-scoped workforce roles within the same canonical headcount."
              chartHeight="standard"
            >
              <div className="md-composition-role-list">
                {state.data.workforceRoles.length === 0 ? (
                  <p className="md-composition-empty">No workforce role records are available.</p>
                ) : (
                  state.data.workforceRoles.map((role) => (
                    <div className="md-composition-role" key={role.roleName}>
                      <div className="md-composition-role-heading">
                        <strong>{humanizeRole(role.roleName)}</strong>
                        <b>{formatNumber(role.totalEmployees)}</b>
                      </div>
                      <div
                        className="md-composition-role-track"
                        role="img"
                        aria-label={humanizeRole(role.roleName) + ": " + formatNumber(role.totalEmployees) + " of " + formatNumber(state.data.summary.totalEmployees) + " workforce members"}
                      >
                        <span
                          style={{
                            width: barWidth(role.totalEmployees, state.data.summary.totalEmployees),
                          }}
                        />
                      </div>
                      <small>{percentage(role.totalEmployees, state.data.summary.totalEmployees)} of workforce</small>
                    </div>
                  ))
                )}
              </div>
            </ManagementDashboardChartPanel>

            <ManagementDashboardPanel
              heading="Movement and turnover"
              eyebrow="Data readiness"
              className="md-composition-deferred-panel"
            >
              <div className="md-composition-deferred">
                <span className="md-composition-deferred-icon" aria-hidden="true">
                  <Activity size={18} />
                </span>
                <strong>Movement analytics deferred</strong>
                <p>{state.data.movement.reason}</p>
                <small>Current status counts are available; hires, departures, reactivations and turnover rates are not reported.</small>
              </div>
            </ManagementDashboardPanel>
          </ManagementDashboardGrid>

          <p className="md-composition-definition">
            Composition uses the same population key as the shared workforce KPI cards. Status and department links open the role-authorized directory with the same filter; role distribution remains a summary because the existing directory has no workforce-role filter.
          </p>
              </>
            );
          })()}
        </>
      ) : null}
    </section>
  );
}
