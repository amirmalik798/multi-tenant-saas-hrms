import { connection } from "next/server";

import {
  InvalidManagementDashboardTimeZoneError,
  loadManagementDashboardContext,
} from "../../../../lib/management-dashboard/context";
import {
  isManagementDashboardDepartmentInScope,
  loadManagementDashboardAttendanceSummary,
  ManagementDashboardAttendanceResultLimitError,
} from "../../../../lib/management-dashboard/attendance-summary";
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
 * GET /api/management-dashboard/attendance-summary
 *
 * Additive, role-scoped attendance and working-hours analytics. Dates and
 * department filters can narrow the authenticated scope only; they cannot
 * supply or change the tenant or manager identity.
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
        {
          status: "error",
          message: "Management dashboard access is required",
        },
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
          message: "Attendance analytics can cover up to 31 calendar days per request.",
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

      if (toDate > context.organization.workDate) {
        return {
          kind: "future-period" as const,
          workDate: context.organization.workDate,
        };
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

      const summary = await loadManagementDashboardAttendanceSummary(
        client,
        scope,
        {
          fromDate,
          toDate,
          departmentId,
          organizationToday: context.organization.workDate,
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

    if (snapshot.kind === "future-period") {
      return jsonResponse(
        {
          status: "error",
          message: "The reporting period cannot end after the organization's current work date (" + snapshot.workDate + ").",
        },
        400,
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
        attendanceUnit: "scheduled employee-days",
        attendanceRate: "Present eligible scheduled employee-days divided by eligible scheduled employee-days.",
        eligibility: "Active scheduled employee-days excluding approved leave and organization public holidays.",
        present: "At least one effective CLOCK_IN event, including approved attendance corrections.",
        noClockInDuringActiveShift: "An eligible employee whose assigned shift has started, is still in progress, and has no effective CLOCK_IN.",
        absence: "Not inferred by this endpoint.",
        overtime: "Potential overtime and payable overtime are returned separately from the server-side attendance calculation.",
      },
      period: snapshot.summary.period,
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

    if (error instanceof ManagementDashboardAttendanceResultLimitError) {
      return jsonResponse(
        { status: "error", message: error.message },
        413,
      );
    }

    console.error("Management dashboard attendance summary failed:", error);
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load the management dashboard attendance summary.",
      },
      500,
    );
  }
}
