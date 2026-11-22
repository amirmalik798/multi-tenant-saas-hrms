import { connection } from "next/server";

import {
  InvalidManagementDashboardTimeZoneError,
  loadManagementDashboardContext,
} from "../../../../lib/management-dashboard/context";
import { loadManagementDashboardWorkforceSummary } from "../../../../lib/management-dashboard/workforce-summary";
import { createManagementDashboardScope } from "../../../../lib/management-dashboard/scope";
import { withManagementDashboardSnapshot } from "../../../../lib/management-dashboard/snapshot";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse } from "../../../../lib/schedule-utils";

/**
 * GET /api/management-dashboard/workforce-summary
 *
 * Additive, shared workforce KPI source. All identity and department filters
 * are derived from the authenticated actor; request parameters cannot widen
 * the data population. Legacy role-specific overview routes remain unchanged.
 */
export async function GET() {
  await connection();

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { status: "error", message: "Authentication required" },
        401,
      );
    }

    const scope = createManagementDashboardScope(actor);

    if (!scope) {
      return jsonResponse(
        {
          status: "error",
          message: "Management dashboard access is required",
        },
        403,
      );
    }

    const snapshot = await withManagementDashboardSnapshot(async (client) => {
      const context = await loadManagementDashboardContext(client, scope);

      if (!context) {
        return null;
      }

      const workforce = await loadManagementDashboardWorkforceSummary(
        client,
        scope,
      );

      return { context, workforce };
    });

    if (!snapshot) {
      return jsonResponse(
        {
          status: "error",
          message: "The organization is not active or is unavailable",
        },
        403,
      );
    }

    return jsonResponse({
      status: "ok",
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      populationDefinition: {
        key: "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN",
        excludedOrganizationRoles: [
          "ORGANIZATION_ADMIN",
          "ORG_ADMIN",
          "ORGANIZATION_ADMINISTRATOR",
        ],
        countingRule: "Distinct employee records in the authenticated organization and authorized role scope.",
      },
      scope: {
        roleName: scope.roleName,
        kind: scope.kind,
        departmentCount: snapshot.context.departmentCount,
      },
      organization: snapshot.context.organization,
      workforce: {
        totalEmployees: snapshot.workforce.totalEmployees,
        activeEmployees: snapshot.workforce.activeEmployees,
        inactiveEmployees: snapshot.workforce.inactiveEmployees,
        formerEmployees: snapshot.workforce.formerEmployees,
        assignedEmployees: snapshot.workforce.assignedEmployees,
        activeUnassignedEmployees:
          snapshot.workforce.activeUnassignedEmployees,
      },
      departments: {
        total: snapshot.context.departmentCount,
        active: snapshot.workforce.activeDepartments,
        inactive: snapshot.workforce.inactiveDepartments,
      },
    });
  } catch (error) {
    if (error instanceof InvalidManagementDashboardTimeZoneError) {
      return jsonResponse(
        {
          status: "error",
          message: "The organization's configured time zone is invalid",
        },
        500,
      );
    }

    console.error("Management dashboard workforce summary failed:", error);
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load the management dashboard workforce summary",
      },
      500,
    );
  }
}
