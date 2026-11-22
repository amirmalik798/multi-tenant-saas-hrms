import { connection } from "next/server";

import {
  loadManagementDashboardContext,
  InvalidManagementDashboardTimeZoneError,
} from "../../../../lib/management-dashboard/context";
import { createManagementDashboardScope } from "../../../../lib/management-dashboard/scope";
import { withManagementDashboardSnapshot } from "../../../../lib/management-dashboard/snapshot";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse } from "../../../../lib/schedule-utils";

/**
 * GET /api/management-dashboard/context
 *
 * Shared bootstrap context for Organization Admin, HR Manager, and
 * Department Manager dashboards. It returns no workforce records or metrics;
 * later dashboard data services build on the same authenticated scope and
 * read-snapshot architecture.
 */
export async function GET() {
  // Force an authenticated, per-request execution boundary.
  await connection();

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ status: "error", message: "Authentication required" }, 401);
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

    const context = await withManagementDashboardSnapshot((client) =>
      loadManagementDashboardContext(client, scope),
    );

    if (!context) {
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
      scope: {
        kind: scope.kind,
        role: scope.roleName,
        departmentCount: context.departmentCount,
        ...(scope.kind === "ASSIGNED_DEPARTMENTS"
          ? { departments: context.departments }
          : {}),
      },
      organization: context.organization,
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

    console.error("Management dashboard context failed:", error);
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load the management dashboard context",
      },
      500,
    );
  }
}
