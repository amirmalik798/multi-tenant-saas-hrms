import type { PoolClient } from "pg";
import { pool } from "./db";
import type { TenantPermissionActor } from "./permissions";

export type CommunicationActor = TenantPermissionActor;

export type HigherUpRecipient = {
  userId: string;
  displayName: string;
  roleName: string;
};

export async function resolveHigherUpRecipient(
  actor: CommunicationActor,
  client: PoolClient | typeof pool = pool,
): Promise<HigherUpRecipient | null> {
  if (actor.kind !== "ORGANIZATION_USER") return null;

  let result;
  if (actor.roleName === "HR_MANAGER") {
    result = await client.query(
      `SELECT u.id AS user_id, u.employee_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), u.email) AS display_name,
              r.name AS role_name
       FROM public.users u
       JOIN public.roles r ON r.id = u.role_id AND r.organization_id = u.organization_id
       LEFT JOIN public.employees e ON e.id = u.employee_id AND e.organization_id = u.organization_id
       WHERE u.organization_id = $1::uuid AND u.account_scope = 'ORGANIZATION'
         AND u.status = 'ACTIVE' AND r.scope = 'ORGANIZATION'
         AND r.name = 'ORGANIZATION_ADMIN'
       ORDER BY u.created_at ASC, u.id ASC LIMIT 1`,
      [actor.organizationId],
    );
  } else if (actor.roleName === "DEPARTMENT_MANAGER") {
    result = await client.query(
      `SELECT u.id AS user_id, u.employee_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), u.email) AS display_name,
              r.name AS role_name
       FROM public.users u
       JOIN public.roles r ON r.id = u.role_id AND r.organization_id = u.organization_id
       JOIN public.employees e ON e.id = u.employee_id AND e.organization_id = u.organization_id
       WHERE u.organization_id = $1::uuid AND u.account_scope = 'ORGANIZATION'
         AND u.status = 'ACTIVE' AND e.employment_status = 'ACTIVE'
         AND r.scope = 'ORGANIZATION' AND r.name = 'HR_MANAGER'
       ORDER BY CASE WHEN e.is_primary_hr_manager IS TRUE THEN 0 ELSE 1 END,
                u.created_at ASC, u.id ASC LIMIT 1`,
      [actor.organizationId],
    );
  } else if (actor.roleName === "EMPLOYEE") {
    result = await client.query(
      `SELECT u.id AS user_id, u.employee_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), u.email) AS display_name,
              r.name AS role_name
       FROM public.users u
       JOIN public.roles r ON r.id = u.role_id AND r.organization_id = u.organization_id
       JOIN public.employees e ON e.id = u.employee_id AND e.organization_id = u.organization_id
       WHERE u.organization_id = $1::uuid AND u.account_scope = 'ORGANIZATION'
         AND u.status = 'ACTIVE' AND e.employment_status = 'ACTIVE'
         AND r.scope = 'ORGANIZATION'
         AND (
           (r.name = 'DEPARTMENT_MANAGER' AND e.id = (
             SELECT d.manager_id
             FROM public.employees me
             JOIN public.departments d
               ON d.id = me.department_id AND d.organization_id = me.organization_id
             WHERE me.id = $2::uuid AND me.organization_id = $1::uuid
           ))
           OR r.name = 'HR_MANAGER'
         )
       ORDER BY CASE WHEN r.name = 'DEPARTMENT_MANAGER' THEN 0 ELSE 1 END,
                CASE WHEN e.is_primary_hr_manager IS TRUE THEN 0 ELSE 1 END,
                u.created_at ASC, u.id ASC
       LIMIT 1`,
      [actor.organizationId, actor.employeeId],
    );
  } else {
    return null;
  }

  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name || "Manager"),
    roleName: String(row.role_name),
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
