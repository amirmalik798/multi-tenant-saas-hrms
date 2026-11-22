import { connection } from "next/server";

import {
  InvalidManagementDashboardTimeZoneError,
  loadManagementDashboardContext,
} from "../../../../lib/management-dashboard/context";
import { loadManagementDashboardWorkforceComposition } from "../../../../lib/management-dashboard/workforce-composition";
import { createManagementDashboardScope } from "../../../../lib/management-dashboard/scope";
import { withManagementDashboardSnapshot } from "../../../../lib/management-dashboard/snapshot";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse } from "../../../../lib/schedule-utils";

/**
 * GET /api/management-dashboard/workforce-composition
 *
 * Current workforce composition, using the same canonical population as
 * /api/management-dashboard/workforce-summary. This endpoint does not infer
 * hire, departure, reactivation or turnover events.
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

      const composition = await loadManagementDashboardWorkforceComposition(
        client,
        scope,
      );

      if (composition.departments.length !== context.departmentCount) {
        throw new Error("The workforce composition department list does not reconcile with the authorized dashboard context");
      }

      return { context, composition };
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
      generatedAt: snapshot.composition.generatedAt,
      populationDefinition: {
        key: "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN",
        source: "GET /api/management-dashboard/workforce-summary",
        countingRule: "The same distinct employee population and role scope as the shared workforce KPIs.",
      },
      scope: {
        roleName: scope.roleName,
        kind: scope.kind,
      },
      organization: snapshot.context.organization,
      summary: snapshot.composition.summary,
      employmentStatus: {
        active: snapshot.composition.summary.activeEmployees,
        inactive: snapshot.composition.summary.inactiveEmployees,
        former: snapshot.composition.summary.formerEmployees,
        total: snapshot.composition.summary.totalEmployees,
      },
      departments: snapshot.composition.departments,
      unassigned: snapshot.composition.unassigned,
      workforceRoles: snapshot.composition.roles,
      movement: {
        status: "DEFERRED",
        reason: "Employee-history effective-date semantics and authoritative activation/separation dates have not been verified. No joiner, departure, reactivation or turnover figures are calculated.",
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

    console.error("Management dashboard workforce composition failed:", error);
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load the management dashboard workforce composition",
      },
      500,
    );
  }
}
