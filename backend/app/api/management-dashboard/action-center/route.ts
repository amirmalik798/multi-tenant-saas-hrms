import { connection } from "next/server";

import { loadManagementActionCenterSummary } from "../../../../lib/management-dashboard/action-center";
import {
  InvalidManagementDashboardTimeZoneError,
  loadManagementDashboardContext,
} from "../../../../lib/management-dashboard/context";
import { createManagementDashboardScope } from "../../../../lib/management-dashboard/scope";
import { withManagementDashboardSnapshot } from "../../../../lib/management-dashboard/snapshot";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse } from "../../../../lib/schedule-utils";

/**
 * GET /api/management-dashboard/action-center
 *
 * A read-only, role-aware summary of actionable management queues. Each
 * queue is independently resilient inside one consistent database snapshot.
 */
export async function GET() {
  await connection();

  try {
    const actor = await getTenantPermissionActor();
    if (!actor) {
      return jsonResponse({ status: "error", message: "Authentication required" }, 401);
    }

    const scope = createManagementDashboardScope(actor);
    if (!scope) {
      return jsonResponse({ status: "error", message: "Management dashboard access is required" }, 403);
    }

    const snapshot = await withManagementDashboardSnapshot(async (client) => {
      const context = await loadManagementDashboardContext(client, scope);
      if (!context) return { kind: "organization-unavailable" as const };

      const summary = await loadManagementActionCenterSummary(client, scope, actor);
      return { kind: "ok" as const, context, summary };
    });

    if (snapshot.kind === "organization-unavailable") {
      return jsonResponse({ status: "error", message: "The organization is not active or is unavailable." }, 403);
    }

    return jsonResponse({
      status: "ok",
      schemaVersion: 1,
      generatedAt: snapshot.summary.generatedAt,
      scope: { roleName: scope.roleName, kind: scope.kind },
      organization: snapshot.context.organization,
      total: snapshot.summary.total,
      queues: snapshot.summary.queues,
      definitions: {
        invitations: "Pending employee invitations with expires_at later than the database snapshot time. Requires invitation.view permission.",
        corrections: "Pending attendance correction requests in the authenticated role's review scope, excluding the actor's own employee record.",
        overtime: "Pending advance preauthorization requests in the authenticated role's review scope, excluding the actor's own employee record.",
        leave: "Pending leave requests in the authenticated role's existing review scope, excluding the actor's own employee record and HR Manager target roles where the current leave list excludes them.",
        age: "Age bands and overdue labels are intentionally omitted because no authoritative service-level agreement was found.",
      },
    });
  } catch (error) {
    if (error instanceof InvalidManagementDashboardTimeZoneError) {
      return jsonResponse({ status: "error", message: "The organization's configured time zone is invalid." }, 500);
    }

    console.error("Management dashboard action center failed:", error);
    return jsonResponse({ status: "error", message: "Unable to load the management dashboard action center." }, 500);
  }
}
