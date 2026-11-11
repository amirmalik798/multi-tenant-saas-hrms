import { cookies } from "next/headers";
import { getIronSession } from "iron-session";

import { pool } from "./db";
import {
  sessionOptions,
  organizationSessionOptions,
  employeeSessionOptions,
  type SessionData,
} from "./session";

const APPROVED_WORKFORCE_ROLES: ReadonlySet<string> = new Set([
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
]);

/**
 * A session is accepted only when it contains a valid version matching
 * the current database account version.
 *
 * Sessions created before session-version support was introduced do not
 * contain this value and must sign in again.
 */
function hasCurrentSessionVersion(
  session: SessionData,
  databaseVersion: unknown,
): boolean {
  return (
    typeof session.sessionVersion === "number" &&
    Number.isSafeInteger(session.sessionVersion) &&
    typeof databaseVersion === "number" &&
    Number.isSafeInteger(databaseVersion) &&
    session.sessionVersion === databaseVersion
  );
}

type RoleSessionKind = "PLATFORM" | "ORGANIZATION_ADMIN" | "WORKFORCE";

type ManagedRoleSession = SessionData & {
  destroy: () => void | Promise<void>;
};

type RoleSessionBundle = {
  platform: ManagedRoleSession;
  organizationAdmin: ManagedRoleSession;
  workforce: ManagedRoleSession;
};

/**
 * Load all independent role sessions from the same cookie store.
 * All authentication helpers use this common view so no route can
 * accidentally accept one role while another authenticated role session
 * is also present in the browser.
 */
async function loadRoleSessions(): Promise<RoleSessionBundle> {
  const cookieStore = await cookies();

  const platform = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  const organizationAdmin = await getIronSession<SessionData>(
    cookieStore,
    organizationSessionOptions,
  );
  const workforce = await getIronSession<SessionData>(
    cookieStore,
    employeeSessionOptions,
  );

  return { platform, organizationAdmin, workforce };
}

/**
 * Return the single authenticated role session only when exactly one role
 * identity is present. Ambiguous multi-role sessions are cleared together.
 * A single valid session for a different role is left intact and is simply
 * not accepted by the helper for the requested role.
 */
async function getSingleRoleSession(
  expectedKind: RoleSessionKind,
): Promise<ManagedRoleSession | null> {
  const sessions = await loadRoleSessions();
  const active = [
    { kind: "PLATFORM" as const, session: sessions.platform },
    { kind: "ORGANIZATION_ADMIN" as const, session: sessions.organizationAdmin },
    { kind: "WORKFORCE" as const, session: sessions.workforce },
  ].filter(({ session }) => Boolean(session.userId));

  if (active.length > 1) {
    await destroySessionBundle(sessions);
    return null;
  }

  const selected = active[0];
  if (!selected || selected.kind !== expectedKind) {
    return null;
  }

  return selected.session;
}

async function destroySessionBundle(
  sessions: RoleSessionBundle,
): Promise<void> {
  await sessions.platform.destroy();
  await sessions.organizationAdmin.destroy();
  await sessions.workforce.destroy();
}

/** Clear every role cookie, including stale or conflicting sessions. */
export async function destroyAllRoleSessions(): Promise<void> {
  const sessions = await loadRoleSessions();
  await destroySessionBundle(sessions);
}

export async function getPlatformSuperAdmin() {
  const session = await getSingleRoleSession("PLATFORM");

  if (!session) {
    return null;
  }

  if (!session.userId) {
    return null;
  }

  if (session.accountScope !== "PLATFORM") {
    await session.destroy();
    return null;
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.session_version,
       r.name AS role_name
     FROM users AS u
     JOIN roles AS r
       ON r.id = u.role_id
     WHERE u.id = $1
       AND u.account_scope = 'PLATFORM'
       AND u.organization_id IS NULL
       AND u.status = 'ACTIVE'
       AND r.name = 'SUPER_ADMIN'
       AND r.scope = 'PLATFORM'
       AND r.organization_id IS NULL
     LIMIT 1`,
    [session.userId],
  );

  const user = result.rows[0];

  if (!user) {
    await session.destroy();
    return null;
  }

  if (!hasCurrentSessionVersion(session, user.session_version)) {
    await session.destroy();
    return null;
  }

  return {
    id: user.id as string,
    email: user.email as string,
    roleName: user.role_name as string,
  };
}

export async function getOrganizationAdmin(options: { allowIncompleteSetup?: boolean } = {}) {
  const session = await getSingleRoleSession("ORGANIZATION_ADMIN");

  if (!session) {
    return null;
  }

  if (!session.userId) {
    return null;
  }

  if (
    session.accountScope !== "ORGANIZATION" ||
    !session.organizationId
  ) {
    await session.destroy();
    return null;
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.session_version,
       u.status AS user_status,
       r.name AS role_name,
       r.scope AS role_scope,
       r.organization_id AS role_organization_id,
       o.id AS organization_id,
       o.name AS organization_name,
       o.status AS organization_status,
       os.setup_completed_at
     FROM users AS u
     JOIN roles AS r
       ON r.id = u.role_id
     JOIN organizations AS o
       ON o.id = u.organization_id
     LEFT JOIN public.organization_settings AS os
       ON os.organization_id = o.id
     WHERE u.id = $1
       AND u.account_scope = 'ORGANIZATION'
       AND u.organization_id = $2
       AND u.status = 'ACTIVE'
       AND r.name = 'ORGANIZATION_ADMIN'
       AND r.scope = 'ORGANIZATION'
       AND r.organization_id = u.organization_id
       AND o.status = 'ACTIVE'
     LIMIT 1`,
    [session.userId, session.organizationId],
  );

  const user = result.rows[0];

  if (!user) {
    await session.destroy();
    return null;
  }

  if (!hasCurrentSessionVersion(session, user.session_version)) {
    await session.destroy();
    return null;
  }

  if (
    user.role_scope !== "ORGANIZATION" ||
    user.role_organization_id !== user.organization_id
  ) {
    await session.destroy();
    return null;
  }

  // Organization Admin access is locked until the explicit setup review is
  // completed. Only setup/session/security flows may opt into incomplete setup.
  if (!options.allowIncompleteSetup && !user.setup_completed_at) {
    return null;
  }

  return {
    id: user.id as string,
    email: user.email as string,
    roleName: user.role_name as string,
    organizationId: user.organization_id as string,
    organizationName: user.organization_name as string,
    setupCompletedAt: (user.setup_completed_at as string | null) ?? null,
  };
}

/**
 * Authenticates an approved workforce user.
 *
 * Accepted roles:
 * - HR_MANAGER
 * - DEPARTMENT_MANAGER
 * - EMPLOYEE
 *
 * Workforce sessions use the employee session cookie and its independent
 * secret. Organization Admin sessions are handled by getOrganizationAdmin().
 *
 * The user's account version, role, account status, employee relationship,
 * employment status, organization status, and tenant relationship are
 * revalidated against the database on each request.
 */
export async function getOrganizationUser() {
  const session = await getSingleRoleSession("WORKFORCE");

  if (!session) {
    return null;
  }

  if (
    !session.userId ||
    session.accountScope !== "ORGANIZATION" ||
    !session.organizationId ||
    !session.employeeId
  ) {
    await session.destroy();
    return null;
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.employee_id,
       u.session_version,
       u.status AS user_status,
       r.name AS role_name,
       r.scope AS role_scope,
       r.organization_id AS role_organization_id,
       o.id AS organization_id,
       o.name AS organization_name,
       o.status AS organization_status,
       e.employment_status AS employee_employment_status,
       COALESCE(
         ARRAY_AGG(DISTINCT p.permission_key)
           FILTER (WHERE p.permission_key IS NOT NULL),
         ARRAY[]::text[]
       ) AS permissions
     FROM users AS u
     JOIN roles AS r
       ON r.id = u.role_id
     JOIN organizations AS o
       ON o.id = u.organization_id
     JOIN employees AS e
       ON e.id = u.employee_id
      AND e.organization_id = u.organization_id
     LEFT JOIN role_permissions AS rp
       ON rp.role_id = r.id
      AND rp.scope = r.scope
     LEFT JOIN permissions AS p
       ON p.id = rp.permission_id
      AND p.scope = rp.scope
     WHERE u.id = $1
       AND u.account_scope = 'ORGANIZATION'
       AND u.organization_id = $2
       AND u.employee_id = $3::uuid
       AND u.status = 'ACTIVE'
       AND r.name IN (
         'HR_MANAGER',
         'DEPARTMENT_MANAGER',
         'EMPLOYEE'
       )
       AND r.scope = 'ORGANIZATION'
       AND r.organization_id = u.organization_id
       AND o.status = 'ACTIVE'
       AND e.employment_status = 'ACTIVE'
     GROUP BY
       u.id,
       u.email,
       u.employee_id,
       u.session_version,
       u.status,
       r.name,
       r.scope,
       r.organization_id,
       o.id,
       o.name,
       o.status,
       e.employment_status
     LIMIT 1`,
    [
      session.userId,
      session.organizationId,
      session.employeeId,
    ],
  );

  const user = result.rows[0];

  // This also rejects sessions whose account, organization, employment,
  // employee linkage, or role is no longer valid.
  if (!user) {
    await session.destroy();
    return null;
  }

  if (!hasCurrentSessionVersion(session, user.session_version)) {
    await session.destroy();
    return null;
  }

  if (
    !APPROVED_WORKFORCE_ROLES.has(user.role_name) ||
    user.role_scope !== "ORGANIZATION" ||
    user.role_organization_id !== user.organization_id ||
    user.organization_id !== session.organizationId ||
    user.employee_id !== session.employeeId ||
    user.user_status !== "ACTIVE" ||
    user.organization_status !== "ACTIVE" ||
    user.employee_employment_status !== "ACTIVE"
  ) {
    await session.destroy();
    return null;
  }

  return {
    id: user.id as string,
    email: user.email as string,
    employeeId: user.employee_id as string,
    roleName: user.role_name as string,
    organizationId: user.organization_id as string,
    organizationName: user.organization_name as string,
    permissions: (user.permissions ?? []) as string[],
  };
}