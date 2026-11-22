import { connection } from "next/server";

import {
  InvalidManagementDashboardTimeZoneError,
  loadManagementDashboardContext,
} from "../../../../lib/management-dashboard/context";
import {
  isManagementDashboardDepartmentInScope,
} from "../../../../lib/management-dashboard/attendance-summary";
import {
  loadManagementDashboardLeaveAvailabilitySummary,
  ManagementDashboardLeaveAvailabilityResultLimitError,
} from "../../../../lib/management-dashboard/leave-availability";
import { createManagementDashboardScope } from "../../../../lib/management-dashboard/scope";
import { withManagementDashboardSnapshot } from "../../../../lib/management-dashboard/snapshot";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import {
  isUuid,
  isValidDateString,
  jsonResponse,
} from "../../../../lib/schedule-utils";

const MAX_RANGE_DAYS = 31;

function inclusiveDays(fromDate: string, toDate: string): number {
  const from = new Date(fromDate + "T00:00:00.000Z").getTime();
  const to = new Date(toDate + "T00:00:00.000Z").getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * GET /api/management-dashboard/leave-availability
 *
 * Additive, role-scoped leave and scheduled-workforce availability analytics.
 * Date and department filters narrow the authenticated scope; they never
 * supply the organization or Department Manager identity.
 */
export async function GET(request: Request) {
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
        { status: "error", message: "Management dashboard access is required" },
        403,
      );
    }

    const url = new URL(request.url);
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    const requestedDepartmentId = url.searchParams.get("departmentId");
    const departmentId = requestedDepartmentId && requestedDepartmentId.trim()
      ? requestedDepartmentId.trim()
      : null;

    if (
      !isValidDateString(fromDate) ||
      !isValidDateString(toDate) ||
      fromDate > toDate
    ) {
      return jsonResponse(
        {
          status: "error",
          message: "Provide valid fromDate and toDate values in YYYY-MM-DD format, with From on or before To.",
        },
        400,
      );
    }

    if (inclusiveDays(fromDate, toDate) > MAX_RANGE_DAYS) {
      return jsonResponse(
        {
          status: "error",
          message: "Leave and availability analytics can cover up to 31 calendar days per request.",
        },
        400,
      );
    }

    if (departmentId && !isUuid(departmentId)) {
      return jsonResponse(
        { status: "error", message: "Provide a valid department identifier." },
        400,
      );
    }

    const snapshot = await withManagementDashboardSnapshot(async (client) => {
      const context = await loadManagementDashboardContext(client, scope);
      if (!context) {
        return { kind: "organization-unavailable" as const };
      }

      if (
        departmentId &&
        !(await isManagementDashboardDepartmentInScope(
          client,
          scope,
          departmentId,
        ))
      ) {
        return { kind: "department-out-of-scope" as const };
      }

      const summary = await loadManagementDashboardLeaveAvailabilitySummary(
        client,
        scope,
        {
          fromDate,
          toDate,
          organizationToday: context.organization.workDate,
          departmentId,
        },
      );

      return {
        kind: "ok" as const,
        context,
        summary,
      };
    });

    if (snapshot.kind === "organization-unavailable") {
      return jsonResponse(
        {
          status: "error",
          message: "The organization is not active or is unavailable.",
        },
        403,
      );
    }

    if (snapshot.kind === "department-out-of-scope") {
      return jsonResponse(
        {
          status: "error",
          message: "The selected department is outside your authorized management scope.",
        },
        403,
      );
    }

    return jsonResponse({
      status: "ok",
      schemaVersion: 1,
      generatedAt: snapshot.summary.generatedAt,
      scope: {
        roleName: scope.roleName,
        kind: scope.kind,
      },
      organization: snapshot.context.organization,
      filters: {
        fromDate,
        toDate,
        departmentId,
        maxRangeDays: MAX_RANGE_DAYS,
      },
      metricDefinitions: {
        populationKey: "WORKFORCE_EXCLUDING_ORGANIZATION_ADMIN",
        populationStatus: "ACTIVE",
        approvedLeave: "Approved leave requests from active workforce members whose inclusive calendar-date interval overlaps the selected period.",
        approvedCalendarDays: "Inclusive calendar days of approved leave within the selected period; this is not scheduled-work-day entitlement or paid-leave calculation.",
        upcomingLeave: "Approved leave days within the selected period that begin after the organization's current local work date.",
        actionablePendingRequests: "Pending requests overlapping the selected period that the authenticated role can decide; own requests and HR-target roles are excluded for HR Managers and Department Managers.",
        availability: "Available scheduled employee-days divided by scheduled employee-days excluding public holidays. Approved leave and public holidays are counted separately.",
        scheduleEligibility: "Only active workforce members with an effective assignment to an active schedule and a matching schedule weekday are included. Employees without an applicable schedule are not assumed available.",
        absence: "Not inferred by this endpoint.",
      },
      period: snapshot.summary.period,
      upcoming: snapshot.summary.upcoming,
      today: snapshot.summary.today,
      dailyTrend: snapshot.summary.dailyTrend,
    });
  } catch (error) {
    if (error instanceof InvalidManagementDashboardTimeZoneError) {
      return jsonResponse(
        {
          status: "error",
          message: "The organization's configured time zone is invalid.",
        },
        500,
      );
    }

    if (error instanceof ManagementDashboardLeaveAvailabilityResultLimitError) {
      return jsonResponse(
        { status: "error", message: error.message },
        413,
      );
    }

    console.error("Management dashboard leave and availability summary failed:", error);
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load the management dashboard leave and availability summary.",
      },
      500,
    );
  }
}
