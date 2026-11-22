import type { PoolClient } from "pg";

import { hasTenantPermission, type TenantPermissionActor } from "../permissions";
import type { ManagementDashboardScope } from "./scope";

export type ManagementActionQueueStatus = "ready" | "not-applicable" | "unavailable";

export type ManagementActionQueue = {
  status: ManagementActionQueueStatus;
  count: number | null;
  href: string | null;
  label: string;
  description: string;
};

export type ManagementActionCenterSummary = {
  generatedAt: string;
  total: number | null;
  queues: {
    invitations: ManagementActionQueue;
    corrections: ManagementActionQueue;
    overtime: ManagementActionQueue;
    leave: ManagementActionQueue;
  };
};

function parseCount(value: unknown, label: string): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Management action center returned an invalid " + label + " count");
  }
  return count;
}

function notApplicable(label: string, description: string): ManagementActionQueue {
  return { status: "not-applicable", count: null, href: null, label, description };
}

function unavailable(label: string, description: string): ManagementActionQueue {
  return { status: "unavailable", count: null, href: null, label, description };
}

function ready(count: number, href: string, label: string, description: string): ManagementActionQueue {
  return { status: "ready", count, href, label, description };
}

async function countPendingReview(
  client: PoolClient,
  scope: ManagementDashboardScope,
  table: "attendance_correction_requests" | "attendance_overtime_requests" | "leave_requests",
  includeHrExclusion: boolean,
): Promise<number> {
  const values: unknown[] = [scope.organizationId];
  const conditions = [
    "request.organization_id = $1::uuid",
    "request.status = 'PENDING'",
  ];

  const actorEmployeeId = scope.kind === "ORGANIZATION"
    ? scope.actorEmployeeId
    : scope.managerEmployeeId;

  if (actorEmployeeId) {
    values.push(actorEmployeeId);
    conditions.push("employee.id <> $" + values.length + "::uuid");
  }

  if (scope.kind === "ASSIGNED_DEPARTMENTS") {
    values.push(scope.managerEmployeeId);
    conditions.push(
      "EXISTS (SELECT 1 FROM public.departments AS managed_department " +
      "WHERE managed_department.organization_id = employee.organization_id " +
      "AND managed_department.id = employee.department_id " +
      "AND managed_department.manager_id = $" + values.length + "::uuid)",
    );
  }

  if (includeHrExclusion) {
    conditions.push(
      "NOT EXISTS (SELECT 1 FROM public.roles AS target_role " +
      "WHERE target_role.id = employee.workforce_role_id " +
      "AND target_role.organization_id = employee.organization_id " +
      "AND (regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'HR_MANAGER%' " +
      "OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'HRMANAGER%'))",
    );
  }

  const result = await client.query<{ count: number | string }>(
    "SELECT COUNT(*)::int AS count " +
    "FROM public." + table + " AS request " +
    "JOIN public.employees AS employee " +
    "ON employee.id = request.employee_id " +
    "AND employee.organization_id = request.organization_id " +
    "WHERE " + conditions.join("\n AND "),
    values,
  );

  return parseCount(result.rows[0]?.count, table);
}

function canReviewAttendance(actor: TenantPermissionActor): boolean {
  return actor.kind === "ORGANIZATION_ADMIN" ||
    (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER");
}

/**
 * Reads each actionable queue independently from its existing source table.
 * It returns aggregates only; it does not materialize cases or perform
 * approval writes. The supplied client belongs to a read-only snapshot.
 */
export async function loadManagementActionCenterSummary(
  client: PoolClient,
  scope: ManagementDashboardScope,
  actor: TenantPermissionActor,
): Promise<ManagementActionCenterSummary> {
  const generatedResult = await client.query<{ generatedAt: Date | string }>(
    "SELECT CURRENT_TIMESTAMP AS \"generatedAt\"",
  );
  const generatedValue = generatedResult.rows[0]?.generatedAt;
  const generatedAtDate = generatedValue instanceof Date
    ? generatedValue
    : new Date(String(generatedValue ?? ""));
  if (!Number.isFinite(generatedAtDate.getTime())) {
    throw new Error("Management action center generation timestamp is unavailable");
  }

  const orgAdmin = actor.kind === "ORGANIZATION_ADMIN";
  const dm = scope.kind === "ASSIGNED_DEPARTMENTS";
  const canReviewAttendanceQueues = canReviewAttendance(actor) || dm;

  const labels = {
    invitations: "Invitations",
    corrections: "Attendance corrections",
    overtime: "Overtime requests",
    leave: "Leave requests",
  };

  const queues: ManagementActionCenterSummary["queues"] = {
    invitations: hasTenantPermission(actor, "invitation.view")
      ? unavailable(labels.invitations, "Loading pending invitation status.")
      : notApplicable(labels.invitations, "Invitation management is not available to this role."),
    corrections: canReviewAttendanceQueues
      ? unavailable(labels.corrections, "Loading attendance correction reviews.")
      : notApplicable(labels.corrections, "Attendance correction review is not available to this role."),
    overtime: canReviewAttendanceQueues
      ? unavailable(labels.overtime, "Loading advance overtime reviews.")
      : notApplicable(labels.overtime, "Overtime review is not available to this role."),
    leave: unavailable(labels.leave, "Loading leave reviews."),
  };

  const jobs: Promise<void>[] = [];

  if (hasTenantPermission(actor, "invitation.view")) {
    jobs.push((async () => {
      const result = await client.query<{ count: number | string }>(
        "SELECT COUNT(*)::int AS count FROM public.employee_invitations " +
        "WHERE organization_id = $1::uuid " +
        "AND status = 'PENDING' AND expires_at > CURRENT_TIMESTAMP",
        [scope.organizationId],
      );
      queues.invitations = ready(
        parseCount(result.rows[0]?.count, "invitation"),
        orgAdmin ? "/org/invitations" : "/hr/invitations",
        labels.invitations,
        "Pending invitations that have not expired and can still be managed.",
      );
    })().catch(() => {
      queues.invitations = unavailable(labels.invitations, "Invitation status could not be loaded. Retry to refresh this queue.");
    }));
  }

  if (canReviewAttendanceQueues) {
    jobs.push((async () => {
      const count = await countPendingReview(
        client, scope, "attendance_correction_requests", false,
      );
      queues.corrections = ready(
        count,
        orgAdmin ? "/org/attendance" : dm ? "/dm/reviews" : "/hr/work-queue",
        labels.corrections,
        dm
          ? "Pending correction requests from employees in your assigned departments."
          : "Pending correction requests you are authorized to review.",
      );
    })().catch(() => {
      queues.corrections = unavailable(labels.corrections, "Attendance corrections could not be loaded. Retry to refresh this queue.");
    }));

    jobs.push((async () => {
      const count = await countPendingReview(
        client, scope, "attendance_overtime_requests", false,
      );
      queues.overtime = ready(
        count,
        orgAdmin ? "/org/attendance" : dm ? "/dm/reviews" : "/hr/work-queue",
        labels.overtime,
        dm
          ? "Pending advance overtime requests from employees in your assigned departments."
          : "Pending advance-authorization requests you are authorized to review.",
      );
    })().catch(() => {
      queues.overtime = unavailable(labels.overtime, "Overtime requests could not be loaded. Retry to refresh this queue.");
    }));
  }

  jobs.push((async () => {
    const count = await countPendingReview(
      client,
      scope,
      "leave_requests",
      scope.roleName === "HR_MANAGER" || dm,
    );
    queues.leave = ready(
      count,
      orgAdmin ? "/org/leave" : dm ? "/dm/leave" : "/hr/modules/leave",
      labels.leave,
      dm
        ? "Pending leave requests for your assigned departments, excluding your own requests and HR targets."
        : scope.roleName === "HR_MANAGER"
          ? "Pending leave requests within your existing HR review scope, excluding your own requests and HR targets."
          : "Pending leave requests in your organization, excluding your own requests.",
    );
  })().catch(() => {
    queues.leave = unavailable(labels.leave, "Leave requests could not be loaded. Retry to refresh this queue.");
  }));

  await Promise.all(jobs);

  const allQueues = Object.values(queues);
  const hasUnavailable = allQueues.some((queue) => queue.status === "unavailable");
  const total = hasUnavailable
    ? null
    : allQueues.reduce(
        (sum, queue) => sum + (queue.status === "ready" ? queue.count ?? 0 : 0),
        0,
      );

  return { generatedAt: generatedAtDate.toISOString(), total, queues };
}
