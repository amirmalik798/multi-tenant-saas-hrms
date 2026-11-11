import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  destroyAllRoleSessions,
  getOrganizationAdmin,
  getOrganizationUser,
} from "./auth";
import { pool } from "./db";
import { getOrganizationLicenseAccess } from "./licensing";
import {
  employeeSessionOptions,
  organizationSessionOptions,
} from "./session";

export type WorkforceRoleName =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

export type TenantPermissionActor =
  | {
      kind: "ORGANIZATION_ADMIN";
      userId: string;
      organizationId: string;
      roleName: "ORGANIZATION_ADMIN";
      permissions: string[];
    }
  | {
      kind: "ORGANIZATION_USER";
      userId: string;
      organizationId: string;
      employeeId: string;
      roleName: WorkforceRoleName;
      permissions: string[];
    };

export type TenantPermissionResult =
  | { ok: true; actor: TenantPermissionActor }
  | { ok: false; response: NextResponse };

function authorizationResponse(
  status: 401 | 403,
  message: string,
) {
  return NextResponse.json(
    { message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function loadOrganizationAdminPermissions(
  userId: string,
  organizationId: string,
): Promise<string[] | null> {
  const result = await pool.query<{ permissions: string[] }>(
    `SELECT
       COALESCE(
         ARRAY_AGG(DISTINCT p.permission_key)
           FILTER (WHERE p.permission_key IS NOT NULL),
         ARRAY[]::text[]
       ) AS permissions
     FROM public.users AS u
     JOIN public.roles AS r
       ON r.id = u.role_id
      AND r.organization_id = u.organization_id
     JOIN public.organizations AS o
       ON o.id = u.organization_id
     LEFT JOIN public.role_permissions AS rp
       ON rp.role_id = r.id
      AND rp.scope = r.scope
      AND rp.scope = 'ORGANIZATION'
     LEFT JOIN public.permissions AS p
       ON p.id = rp.permission_id
      AND p.scope = rp.scope
      AND p.scope = 'ORGANIZATION'
     WHERE u.id = $1
       AND u.organization_id = $2
       AND u.account_scope = 'ORGANIZATION'
       AND u.status = 'ACTIVE'
       AND r.name = 'ORGANIZATION_ADMIN'
       AND r.scope = 'ORGANIZATION'
       AND o.status = 'ACTIVE'
     GROUP BY u.id`,
    [userId, organizationId],
  );

  if (result.rows.length !== 1) {
    return null;
  }

  const permissions = result.rows[0]?.permissions;

  return Array.isArray(permissions)
    ? permissions.filter(
        (permission): permission is string =>
          typeof permission === "string",
      )
    : [];
}

export async function getTenantPermissionActor():
  Promise<TenantPermissionActor | null> {
  const cookieStore = await cookies();

  const hasOrganizationAdminCookie = Boolean(
    cookieStore.get(organizationSessionOptions.cookieName)?.value,
  );

  const hasWorkforceCookie = Boolean(
    cookieStore.get(employeeSessionOptions.cookieName)?.value,
  );

  if (hasOrganizationAdminCookie && hasWorkforceCookie) {
    await destroyAllRoleSessions();
    return null;
  }

  if (hasOrganizationAdminCookie) {
    const admin = await getOrganizationAdmin();

    if (!admin) {
      return null;
    }

    // Organization Admin retains direct access to authentication, setup,
    // support, and future licensing endpoints through getOrganizationAdmin.
    // This shared tenant-permission boundary blocks normal HRMS operations
    // while the organization's subscription is unavailable.
    const licenseAccess = await getOrganizationLicenseAccess(
      admin.organizationId,
    );

    if (!licenseAccess?.canAccess) {
      return null;
    }

    const permissions = await loadOrganizationAdminPermissions(
      admin.id,
      admin.organizationId,
    );

    if (permissions === null) {
      return null;
    }

    return {
      kind: "ORGANIZATION_ADMIN",
      userId: admin.id,
      organizationId: admin.organizationId,
      roleName: "ORGANIZATION_ADMIN",
      permissions,
    };
  }

  if (hasWorkforceCookie) {
    const user = await getOrganizationUser();

    if (!user) {
      return null;
    }

    if (
      user.roleName !== "HR_MANAGER" &&
      user.roleName !== "DEPARTMENT_MANAGER" &&
      user.roleName !== "EMPLOYEE"
    ) {
      return null;
    }

    const licenseAccess = await getOrganizationLicenseAccess(
      user.organizationId,
    );

    if (!licenseAccess?.canAccess) {
      return null;
    }

    return {
      kind: "ORGANIZATION_USER",
      userId: user.id,
      organizationId: user.organizationId,
      employeeId: user.employeeId,
      roleName: user.roleName,
      permissions: user.permissions,
    };
  }

  return null;
}

/**
 * Organization Admin has full permissions within the authenticated tenant.
 *
 * This does not grant access to other organizations or platform-level
 * Super Admin functions. Each route must still enforce record-level scope.
 */
export function hasTenantPermission(
  actor: TenantPermissionActor,
  permission: string,
): boolean {
  if (
    typeof permission !== "string" ||
    permission.trim().length === 0
  ) {
    return false;
  }

  if (actor.kind === "ORGANIZATION_ADMIN") {
    return true;
  }

  return actor.permissions.includes(permission);
}

export async function requireTenantPermission(
  permission: string,
): Promise<TenantPermissionResult> {
  const actor = await getTenantPermissionActor();

  if (!actor) {
    return {
      ok: false,
      response: authorizationResponse(
        401,
        "Authentication required",
      ),
    };
  }

  if (!hasTenantPermission(actor, permission)) {
    return {
      ok: false,
      response: authorizationResponse(
        403,
        "You do not have permission to perform this action",
      ),
    };
  }

  return { ok: true, actor };
}