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

type QueueKey = "invitations" | "corrections" | "overtime" | "leave";

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

async function withQueueSavepoint(
  client: PoolClient,
  key: QueueKey,
  label: string,
  description: string,
  query: () => Promise<ManagementActionQueue>,
): Promise<ManagementActionQueue> {
  // key is a closed union, not user input; only these fixed identifiers enter SQL.
  const savepoint = "management_action_" + key;
  await client.query("SAVEPOINT " + savepoint);

  try {
    const result = await query();
    await client.query("RELEASE SAVEPOINT " + savepoint);
    return result;
  } catch (error) {
    // A PostgreSQL statement error aborts the current transaction until it is
    // rolled back. Roll back only this queue so sibling queues can still load.
    await client.query("ROLLBACK TO SAVEPOINT " + savepoint);
    await client.query("RELEASE SAVEPOINT " + savepoint);
    console.error("Management Action Center queue failed:", key, error);
    return unavailable(label, description);
  }
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
 * Each source has a savepoint inside the same repeatable-read snapshot, so a
 * statement failure does not poison the other queue reads. No approval writes
 * or record-level private data are returned.
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

  let invitations = hasTenantPermission(actor, "invitation.view")
    ? unavailable(labels.invitations, "Invitation status could not be loaded.")
    : notApplicable(labels.invitations, "Invitation management is not available to this role.");

  if (hasTenantPermission(actor, "invitation.view")) {
    invitations = await withQueueSavepoint(
      client,
      "invitations",
      labels.invitations,
      "Invitation status could not be loaded. Retry to refresh this queue.",
      async () => {
        const result = await client.query<{ count: number | string }>(
          "SELECT COUNT(*)::int AS count FROM public.employee_invitations " +
          "WHERE organization_id = $1::uuid " +
          "AND status = 'PENDING' AND expires_at > CURRENT_TIMESTAMP",
          [scope.organizationId],
        );
        return ready(
          parseCount(result.rows[0]?.count, "invitation"),
          orgAdmin ? "/org/invitations" : "/hr/invitations",
          labels.invitations,
          "Pending invitations that have not expired and can still be managed.",
        );
      },
    );
  }

  let corrections = canReviewAttendanceQueues
    ? unavailable(labels.corrections, "Attendance corrections could not be loaded.")
    : notApplicable(labels.corrections, "Attendance correction review is not available to this role.");

  let overtime = canReviewAttendanceQueues
    ? unavailable(labels.overtime, "Overtime requests could not be loaded.")
    : notApplicable(labels.overtime, "Overtime review is not available to this role.");

  if (canReviewAttendanceQueues) {
    corrections = await withQueueSavepoint(
      client,
      "corrections",
      labels.corrections,
      "Attendance corrections could not be loaded. Retry to refresh this queue.",
      async () => {
        const count = await countPendingReview(
          client, scope, "attendance_correction_requests", false,
        );
        return ready(
          count,
          orgAdmin ? "/org/attendance" : dm ? "/dm/reviews" : "/hr/work-queue",
          labels.corrections,
          dm
            ? "Pending correction requests from employees in your assigned departments."
            : "Pending correction requests you are authorized to review.",
        );
      },
    );

    overtime = await withQueueSavepoint(
      client,
      "overtime",
      labels.overtime,
      "Overtime requests could not be loaded. Retry to refresh this queue.",
      async () => {
        const count = await countPendingReview(
          client, scope, "attendance_overtime_requests", false,
        );
        return ready(
          count,
          orgAdmin ? "/org/attendance" : dm ? "/dm/reviews" : "/hr/work-queue",
          labels.overtime,
          dm
            ? "Pending advance overtime requests from employees in your assigned departments."
            : "Pending advance-authorization requests you are authorized to review.",
        );
      },
    );
  }

  const leave = await withQueueSavepoint(
    client,
    "leave",
    labels.leave,
    "Leave requests could not be loaded. Retry to refresh this queue.",
    async () => {
      const count = await countPendingReview(
        client,
        scope,
        "leave_requests",
        scope.roleName === "HR_MANAGER" || dm,
      );
      return ready(
        count,
        orgAdmin ? "/org/leave" : dm ? "/dm/leave" : "/hr/modules/leave",
        labels.leave,
        dm
          ? "Pending leave requests for your assigned departments, excluding your own requests and HR targets."
          : scope.roleName === "HR_MANAGER"
            ? "Pending leave requests within your existing HR review scope, excluding your own requests and HR targets."
            : "Pending leave requests in your organization, excluding your own requests.",
      );
    },
  );

  const queues = { invitations, corrections, overtime, leave };
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
