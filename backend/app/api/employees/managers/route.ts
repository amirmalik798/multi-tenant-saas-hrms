import { connection, NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../lib/permissions";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ROLES = [
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
] as const;

type CandidateRole = (typeof ALLOWED_ROLES)[number];

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    /*
     * Only Organization Admins and HR Managers can query the manager
     * candidate list. Department Managers and Employees cannot use this
     * endpoint to enumerate workforce management candidates.
     */
    const authorizedRole =
      actor.kind === "ORGANIZATION_ADMIN" ||
      (
        actor.kind === "ORGANIZATION_USER" &&
        actor.roleName === "HR_MANAGER"
      );

    if (!authorizedRole) {
      return jsonResponse(
        {
          message:
            "You do not have permission to view manager candidates",
        },
        403,
      );
    }

    if (
      !hasTenantPermission(actor, "employee.view") ||
      !hasTenantPermission(actor, "department.update")
    ) {
      return jsonResponse(
        {
          message:
            "You do not have permission to view manager candidates",
        },
        403,
      );
    }

    const url = new URL(request.url);
    const excludeId = (
      url.searchParams.get("excludeId") ?? ""
    ).trim();

    const requestedRole = (
      url.searchParams.get("role") ?? ""
    )
      .trim()
      .toUpperCase();

    if (
      excludeId &&
      !UUID_PATTERN.test(excludeId)
    ) {
      return jsonResponse(
        { message: "Invalid employee ID" },
        400,
      );
    }

    if (
      requestedRole &&
      !ALLOWED_ROLES.includes(
        requestedRole as CandidateRole,
      )
    ) {
      return jsonResponse(
        {
          message:
            "role must be HR_MANAGER or DEPARTMENT_MANAGER",
        },
        400,
      );
    }

    /*
     * The tenant scope always comes from the verified session.
     *
     * Eligible HR Managers:
     * - Active employment;
     * - No home department;
     * - No reporting manager;
     * - Exactly one matching active organization account.
     *
     * Eligible Department Managers:
     * - Active employment;
     * - No home department;
     * - Exactly one matching active organization account;
     * - Report to an active HR Manager who has no department or
     *   reporting manager and exactly one matching active account.
     *
     * The account_count checks are intentional: an EXISTS check alone
     * cannot distinguish one valid account from duplicate active accounts.
     */
    const result = await pool.query(
      `SELECT
         e.id,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.designation,
         r.name AS workforce_role,
         e.is_primary_hr_manager,
         'ACTIVE'::text AS account_status
       FROM public.employees AS e
       JOIN public.roles AS r
         ON r.id = e.workforce_role_id
        AND r.organization_id = e.organization_id
        AND r.scope = 'ORGANIZATION'
       JOIN LATERAL (
         SELECT COUNT(*)::int AS active_account_count
         FROM public.users AS u
         WHERE u.employee_id = e.id
           AND u.organization_id = e.organization_id
           AND u.role_id = e.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
       ) AS account_state ON TRUE
       LEFT JOIN public.employees AS supervisor
         ON supervisor.id = e.manager_id
        AND supervisor.organization_id = e.organization_id
       LEFT JOIN public.roles AS supervisor_role
         ON supervisor_role.id = supervisor.workforce_role_id
        AND supervisor_role.organization_id =
            supervisor.organization_id
        AND supervisor_role.scope = 'ORGANIZATION'
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_account_count
         FROM public.users AS u
         WHERE u.employee_id = supervisor.id
           AND u.organization_id = supervisor.organization_id
           AND u.role_id = supervisor.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
       ) AS supervisor_account_state ON TRUE
       WHERE e.organization_id = $1
         AND e.employment_status = 'ACTIVE'
         AND account_state.active_account_count = 1
         AND r.name IN ('HR_MANAGER', 'DEPARTMENT_MANAGER')
         AND (
           $2::text IS NULL
           OR r.name = $2::text
         )
         AND (
           $3::uuid IS NULL
           OR e.id <> $3::uuid
         )
         AND (
           (
             r.name = 'HR_MANAGER'
             AND e.department_id IS NULL
             AND e.manager_id IS NULL
           )
           OR
           (
             r.name = 'DEPARTMENT_MANAGER'
             AND e.department_id IS NULL
             AND supervisor.id IS NOT NULL
             AND supervisor.employment_status = 'ACTIVE'
             AND supervisor.department_id IS NULL
             AND supervisor.manager_id IS NULL
             AND supervisor_role.name = 'HR_MANAGER'
             AND supervisor_account_state.active_account_count = 1
           )
         )
       ORDER BY
         CASE
           WHEN r.name = 'HR_MANAGER'
             AND e.is_primary_hr_manager IS TRUE
           THEN 0
           ELSE 1
         END,
         e.first_name ASC,
         e.last_name ASC,
         e.id ASC`,
      [
        actor.organizationId,
        requestedRole || null,
        excludeId || null,
      ],
    );

    return jsonResponse({
      status: "ok",
      employees: result.rows,
    });
  } catch (error) {
    console.error(
      "Failed to load manager candidates:",
      error,
    );

    return jsonResponse(
      {
        message:
          "Unable to load manager candidates right now",
      },
      500,
    );
  }
}