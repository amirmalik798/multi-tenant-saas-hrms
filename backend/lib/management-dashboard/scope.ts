import type { TenantPermissionActor } from "../permissions";

/**
 * Server-derived access scope for management dashboard reads.
 *
 * This type deliberately excludes EMPLOYEE and platform-level roles.
 * Department Manager scope is anchored to the authenticated employee ID;
 * callers must never construct it from request parameters.
 */
export type ManagementDashboardScope =
  | {
      kind: "ORGANIZATION";
      roleName: "ORGANIZATION_ADMIN" | "HR_MANAGER";
      organizationId: string;
      actorEmployeeId: string | null;
    }
  | {
      kind: "ASSIGNED_DEPARTMENTS";
      roleName: "DEPARTMENT_MANAGER";
      organizationId: string;
      managerEmployeeId: string;
    };

export function createManagementDashboardScope(
  actor: TenantPermissionActor,
): ManagementDashboardScope | null {
  if (!actor.organizationId) {
    return null;
  }

  if (actor.kind === "ORGANIZATION_ADMIN") {
    return {
      kind: "ORGANIZATION",
      roleName: "ORGANIZATION_ADMIN",
      organizationId: actor.organizationId,
      actorEmployeeId: null,
    };
  }

  if (actor.kind !== "ORGANIZATION_USER") {
    return null;
  }

  if (actor.roleName === "HR_MANAGER") {
    if (!actor.employeeId) {
      return null;
    }

    return {
      kind: "ORGANIZATION",
      roleName: "HR_MANAGER",
      organizationId: actor.organizationId,
      actorEmployeeId: actor.employeeId,
    };
  }

  if (actor.roleName === "DEPARTMENT_MANAGER") {
    if (!actor.employeeId) {
      return null;
    }

    return {
      kind: "ASSIGNED_DEPARTMENTS",
      roleName: "DEPARTMENT_MANAGER",
      organizationId: actor.organizationId,
      managerEmployeeId: actor.employeeId,
    };
  }

  // Employees and every unrecognized role fail closed.
  return null;
}
