"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  RefreshCw,
  UserCheck,
  UserMinus,
  Users,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import type { WorkspaceRole } from "@/types/workspace";

import {
  ManagementDashboardErrorState,
  ManagementDashboardMetricCard,
  ManagementDashboardMetricGrid,
  ManagementDashboardSectionHeading,
  ManagementDashboardSkeleton,
} from "./ManagementDashboardPrimitives";

type ManagementRole = Exclude<WorkspaceRole, "EMPLOYEE">;
type ScopeKind = "ORGANIZATION" | "ASSIGNED_DEPARTMENTS";

type WorkforceSummaryResponse = {
  status: "ok";
  schemaVersion: 1;
  generatedAt: string;
  populationDefinition: {
    key: "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN";
    excludedOrganizationRoles: string[];
    countingRule: string;
  };
  scope: {
    roleName: ManagementRole;
    kind: ScopeKind;
    departmentCount: number;
  };
  organization: {
    name: string;
    timeZone: string;
    weekStartsOn: number;
    workDate: string;
  };
  workforce: {
    totalEmployees: number;
    activeEmployees: number;
    inactiveEmployees: number;
    formerEmployees: number;
    assignedEmployees: number;
    activeUnassignedEmployees: number;
  };
  departments: {
    total: number;
    active: number;
    inactive: number;
  };
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: WorkforceSummaryResponse };

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

function isWorkforceSummaryResponse(
  value: unknown,
): value is WorkforceSummaryResponse {
  if (
    !isRecord(value) ||
    value.status !== "ok" ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== "string" ||
    !isRecord(value.populationDefinition) ||
    value.populationDefinition.key !== "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN"
  ) {
    return false;
  }

  if (
    !isRecord(value.scope) ||
    !isManagementRole(value.scope.roleName) ||
    (value.scope.kind !== "ORGANIZATION" &&
      value.scope.kind !== "ASSIGNED_DEPARTMENTS") ||
    !isCount(value.scope.departmentCount)
  ) {
    return false;
  }

  if (
    !isRecord(value.organization) ||
    typeof value.organization.name !== "string" ||
    typeof value.organization.timeZone !== "string" ||
    typeof value.organization.weekStartsOn !== "number" ||
    typeof value.organization.workDate !== "string"
  ) {
    return false;
  }

  if (!isRecord(value.workforce) || !isRecord(value.departments)) {
    return false;
  }

  const workforceFields = [
    "totalEmployees",
    "activeEmployees",
    "inactiveEmployees",
    "formerEmployees",
    "assignedEmployees",
    "activeUnassignedEmployees",
  ] as const;

  const departmentFields = ["total", "active", "inactive"] as const;

  return workforceFields.every((field) => isCount(value.workforce[field])) &&
    departmentFields.every((field) => isCount(value.departments[field]));
}

function roleScopeLabel(role: ManagementRole): string {
  if (role === "DEPARTMENT_MANAGER") return "Assigned-department workforce";
  if (role === "HR_MANAGER") return "Organization-wide HR workforce";
  return "Organization-wide workforce";
}

/**
 * Shared KPI section backed by the authenticated workforce-summary endpoint.
 *
 * It is intentionally opt-in and is not mounted into existing dashboards in
 * this step. The API response, not a client prop, supplies the authoritative
 * role and population scope.
 */
export function ManagementDashboardWorkforceKpis() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const result = await apiRequest<unknown>(
        "/management-dashboard/workforce-summary",
      );

      if (!isWorkforceSummaryResponse(result)) {
        throw new Error("The server returned an invalid workforce summary.");
      }

      setState({ status: "ready", data: result });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Unable to load the workforce summary.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="md-workforce-section">
      <ManagementDashboardSectionHeading
        eyebrow="Workforce overview"
        title="Workforce at a glance"
        description="A consistent headcount snapshot for your authorized management scope."
        action={
          state.status === "ready" ? (
            <span className="md-workforce-asof">
              As of {formatDate(state.data.organization.workDate, state.data.organization.timeZone)}
            </span>
          ) : null
        }
        className="md-workforce-heading"
      />

      {state.status === "loading" ? (
        <ManagementDashboardSkeleton
          variant="metrics"
          count={6}
          columns={3}
          label="Loading workforce summary"
        />
      ) : null}

      {state.status === "error" ? (
        <ManagementDashboardErrorState
          title="Workforce summary unavailable"
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
          <ManagementDashboardMetricGrid columns={3}>
            <ManagementDashboardMetricCard
              label={state.data.scope.roleName === "DEPARTMENT_MANAGER" ? "Team workforce" : "Total workforce"}
              value={formatNumber(state.data.workforce.totalEmployees)}
              description="Distinct workforce employee records in your authorized scope."
              context={roleScopeLabel(state.data.scope.roleName)}
              icon={Users}
              tone="accent"
            />
            <ManagementDashboardMetricCard
              label="Active workforce"
              value={formatNumber(state.data.workforce.activeEmployees)}
              description="Employees with ACTIVE employment status."
              icon={UserCheck}
              tone="success"
            />
            <ManagementDashboardMetricCard
              label="Inactive workforce"
              value={formatNumber(state.data.workforce.inactiveEmployees)}
              description="Employees with INACTIVE employment status."
              icon={UserMinus}
              tone="warning"
            />
            <ManagementDashboardMetricCard
              label="Former workforce"
              value={formatNumber(state.data.workforce.formerEmployees)}
              description="Employees with FORMER employment status."
              icon={UserX}
              tone="neutral"
            />
            <ManagementDashboardMetricCard
              label="Active unassigned"
              value={state.data.scope.roleName === "DEPARTMENT_MANAGER"
                ? "N/A"
                : formatNumber(state.data.workforce.activeUnassignedEmployees)}
              state={state.data.scope.roleName === "DEPARTMENT_MANAGER"
                ? "not-applicable"
                : "ready"}
              description={state.data.scope.roleName === "DEPARTMENT_MANAGER"
                ? "Not applicable to a population already restricted to assigned departments."
                : "Active employees without a valid department assignment."}
              icon={UserMinus}
              tone="warning"
            />
            <ManagementDashboardMetricCard
              label={state.data.scope.roleName === "DEPARTMENT_MANAGER" ? "Assigned departments" : "Departments"}
              value={formatNumber(state.data.departments.total)}
              description="Departments inside your authorized management scope."
              context={
                formatNumber(state.data.departments.active) + " active · " +
                formatNumber(state.data.departments.inactive) + " inactive"
              }
              icon={Building2}
              tone="accent"
            />
          </ManagementDashboardMetricGrid>

          <p className="md-workforce-definition">
            Shared workforce counts exclude organization-administrator role records. Existing role-specific dashboard totals remain unchanged.
          </p>
        </>
      ) : null}
    </section>
  );
}
