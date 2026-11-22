import { connection } from "next/server";

import {
  InvalidManagementDashboardTimeZoneError,
  loadManagementDashboardContext,
} from "../../../../lib/management-dashboard/context";
import {
  loadManagementDashboardPayrollOvertimeSummary,
  ManagementDashboardPayrollOvertimeResultLimitError,
} from "../../../../lib/management-dashboard/payroll-overtime";
import { createManagementDashboardScope } from "../../../../lib/management-dashboard/scope";
import { withManagementDashboardSnapshot } from "../../../../lib/management-dashboard/snapshot";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { jsonResponse } from "../../../../lib/schedule-utils";

function isValidMonth(value: string | null): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

/**
 * GET /api/management-dashboard/payroll-overtime?month=YYYY-MM
 *
 * Uses the existing monthly pay calculation and payment ledger. Its payroll
 * population mirrors the role-specific GET /api/payroll/payments boundaries:
 * no employee-level pay data is returned, and Department Managers do not gain
 * access to team payslips through this aggregate.
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

    const month = new URL(request.url).searchParams.get("month");
    if (!isValidMonth(month)) {
      return jsonResponse(
        { status: "error", message: "Provide month in YYYY-MM format." },
        400,
      );
    }

    const snapshot = await withManagementDashboardSnapshot(async (client) => {
      const context = await loadManagementDashboardContext(client, scope);
      if (!context) {
        return { kind: "organization-unavailable" as const };
      }

      if (month > context.organization.workDate.slice(0, 7)) {
        return {
          kind: "future-period" as const,
          currentMonth: context.organization.workDate.slice(0, 7),
        };
      }

      const summary = await loadManagementDashboardPayrollOvertimeSummary(
        client,
        scope,
        {
          month,
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
          message: "Future payroll months cannot be included. The current organization month is " +
            snapshot.currentMonth + ".",
        },
        400,
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
        month,
      },
      metricDefinitions: {
        payrollPopulation: "The same role-specific workforce population visible to GET /api/payroll/payments. Organization Admin sees eligible Employees, Department Managers and HR Managers; HR Manager sees eligible Employees and Department Managers excluding self; Department Manager sees eligible Employee-role members in assigned departments only.",
        overtimeRequestPopulation: "Organization Admin and HR Manager see tenant-wide PREAUTHORIZATION requests; Department Manager sees their own requests plus requests for employees in assigned departments, matching GET /api/attendance/overtime.",
        workedOvertimePopulation: "Actual, payable and unapproved minutes use the Step 7 active scheduled workforce population within the authenticated management scope, not the salary-rate population.",
        excessReviewPopulation: "Organization Admin and HR Manager see tenant-wide persisted review cases; Department Manager sees persisted cases in assigned departments only, matching GET /api/attendance/excess-overtime. The existing GET discovery side effect is not triggered.",
        estimatedPayable: "Estimated monthly payable amount from the existing attendance and hourly-pay calculation, grouped by each employee's configured currency. Only employees with a complete non-mismatched calculation contribute to the displayed currency estimate.",
        recordedPaid: "Amount and currency stored in monthly_salary_payments with status PAID. This is a recorded payroll status, not independent bank-transfer verification.",
        recordedUnpaid: "Amount and currency stored in monthly_salary_payments with status UNPAID. It is not combined with paid or estimated amounts.",
        actualOvertime: "Worked minutes beyond assigned scheduled end, calculated from effective attendance events through the organization's current local date. Future preauthorization requests remain included for the full selected month.",
        payableOvertime: "Actual overtime minutes covered by approved advance preauthorization under calculateDailyAttendance.",
        unapprovedExcess: "Calculated actual overtime minutes not covered by approved advance preauthorization. It remains separate from recorded excess-time review cases.",
        excessReviewCases: "Persisted attendance_excess_overtime_reviews records for this month. These are only cases discovered and stored by the existing excess-time review workflow, not a substitute for all calculated unapproved excess minutes.",
        currency: "Amounts are never summed across different currency codes.",
        estimates: "Estimated pay is not labelled PAID or finalized. Only the existing monthly_salary_payments PAID ledger status is reported as recorded paid.",
      },
      payroll: snapshot.summary.payroll,
      overtime: snapshot.summary.overtime,
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

    if (error instanceof ManagementDashboardPayrollOvertimeResultLimitError) {
      return jsonResponse(
        { status: "error", message: error.message },
        413,
      );
    }

    console.error("Management dashboard payroll and overtime summary failed:", error);
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load the management dashboard payroll and overtime summary.",
      },
      500,
    );
  }
}
