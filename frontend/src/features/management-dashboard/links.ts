import type { WorkspaceRole } from "@/types/workspace";

export type ManagementDashboardRole = Exclude<WorkspaceRole, "EMPLOYEE">;

type WorkforceFilters = {
  status?: "ACTIVE" | "INACTIVE" | "FORMER";
  departmentId?: string;
  unassigned?: boolean;
};

function withQuery(path: string, values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? path + "?" + query : path;
}

/**
 * Role-aware destinations for management-dashboard investigation.
 *
 * These routes reuse their existing authenticated endpoints. Query parameters
 * only narrow their normal results; they never establish tenant or role access.
 */
export function managementDashboardLinks(role: ManagementDashboardRole) {
  const routes = role === "ORGANIZATION_ADMIN"
    ? {
        workforce: "/org/employees",
        departments: "/org/departments",
        attendance: "/org/attendance",
        leave: "/org/leave",
        payroll: "/org/payroll",
        reports: "/org/reports",
      }
    : role === "HR_MANAGER"
      ? {
          workforce: "/hr/employees",
          departments: "/hr/departments",
          attendance: "/hr/modules/attendance",
          leave: "/hr/modules/leave",
          payroll: "/hr/modules/payroll",
          reports: "/hr/reports",
        }
      : {
          workforce: "/dm/team",
          departments: "/dm/team",
          attendance: "/dm/attendance",
          leave: "/dm/leave",
          payroll: "/dm/payroll",
          reports: "/dm/reports",
        };

  return {
    workforce(filters: WorkforceFilters = {}) {
      return withQuery(routes.workforce, {
        status: filters.status,
        departmentId: filters.departmentId,
        unassigned: filters.unassigned ? "true" : undefined,
        managementPopulation: "true",
      });
    },
    departments() {
      return routes.departments;
    },
    attendance(fromDate: string, toDate: string) {
      return withQuery(routes.attendance, {
        fromDate,
        toDate,
        managementDashboard: "true",
      });
    },
    leave(fromDate: string, toDate: string, status?: "PENDING" | "APPROVED") {
      return withQuery(routes.leave, {
        fromDate,
        toDate,
        status,
        excludeOwn: status === "PENDING" && role !== "ORGANIZATION_ADMIN" ? "true" : undefined,
        activeWorkforceOnly: status === "APPROVED" ? "true" : undefined,
      });
    },
    payroll(month: string) {
      return withQuery(routes.payroll, { month });
    },
    reports(fromDate: string, toDate: string) {
      return withQuery(routes.reports, { fromDate, toDate });
    },
    reviewQueue(queue: "corrections" | "overtime" | "excess") {
      const path = role === "ORGANIZATION_ADMIN"
        ? routes.attendance
        : role === "HR_MANAGER"
          ? "/hr/work-queue"
          : "/dm/reviews";
      return withQuery(path, role === "ORGANIZATION_ADMIN" ? {} : { queue });
    },
  };
}
