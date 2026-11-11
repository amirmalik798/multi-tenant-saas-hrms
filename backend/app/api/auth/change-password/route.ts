import { isIP } from "node:net";

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import {
  getOrganizationAdmin,
  getOrganizationUser,
  getPlatformSuperAdmin,
} from "../../../../lib/auth";
import {
  getNewPasswordValidationError,
  hashNewPassword,
  verifyPassword,
} from "../../../../lib/password";
import {
  clearRateLimit,
  consumeRateLimit,
} from "../../../../lib/rate-limit";
import { sendPasswordChangedNotificationEmail } from "../../../../lib/email";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import {
  employeeSessionOptions,
  organizationSessionOptions,
  sessionOptions,
  type SessionData,
} from "../../../../lib/session";

type JsonObject = Record<string, unknown>;

type SessionKind = "platform" | "organization" | "workforce";

type AuthenticatedIdentity = {
  id: string;
  email: string;
  roleName: string;
  organizationId?: string;
  employeeId?: string;
};

const APPROVED_WORKFORCE_ROLES: ReadonlySet<string> = new Set([
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
]);

const MAX_PASSWORD_CHANGE_ATTEMPTS_PER_USER = 5;
const MAX_PASSWORD_CHANGE_ATTEMPTS_PER_IP = 30;
const PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function isObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      status: "error",
      message:
        "Your session is invalid or expired. Please sign in again.",
    },
    { status: 401 },
  );
}

function rateLimitedResponse(
  retryAfterSeconds: number,
) {
  return NextResponse.json(
    {
      status: "error",
      message:
        "Too many password-change attempts. Please wait before trying again.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, retryAfterSeconds),
        ),
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Reads an IP only from an explicitly configured trusted proxy header.
 *
 * The proxy must overwrite the configured header on incoming requests.
 * Never configure this to a header that clients can freely control.
 *
 * In local development, if no trusted header is configured, IP limiting
 * is skipped. The per-user rate limit still applies.
 */
function getTrustedClientIp(
  request: Request,
): string | null {
  const trustedHeaderName =
    process.env.RATE_LIMIT_TRUSTED_IP_HEADER
      ?.trim()
      .toLowerCase();

  if (!trustedHeaderName) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RATE_LIMIT_TRUSTED_IP_HEADER must be configured in production.",
      );
    }

    return null;
  }

  if (!/^[a-z0-9-]+$/.test(trustedHeaderName)) {
    throw new Error(
      "RATE_LIMIT_TRUSTED_IP_HEADER has an invalid header name.",
    );
  }

  const candidate =
    request.headers.get(trustedHeaderName)?.trim();

  // Accept exactly one IP, not an arbitrary forwarding chain.
  if (!candidate || candidate.includes(",")) {
    return null;
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

export async function POST(request: Request) {
  // Reject untrusted requests before parsing the body,
  // accessing sessions, or consuming rate-limit counters.
  const originError = validateSameOriginRequest(request);
  if (originError) {
    return originError;
  }

  // Require application/json and enforce the shared request-body limit.
  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  if (
    !isObject(body) ||
    typeof body.currentPassword !== "string" ||
    typeof body.newPassword !== "string" ||
    typeof body.confirmPassword !== "string" ||
    !body.currentPassword ||
    !body.newPassword ||
    !body.confirmPassword
  ) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Current password, new password, and password confirmation are required.",
      },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword, confirmPassword } = body;

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      {
        status: "error",
        message: "The new passwords do not match.",
      },
      { status: 400 },
    );
  }

  const passwordValidationError =
    getNewPasswordValidationError(newPassword);

  if (passwordValidationError) {
    return NextResponse.json(
      { status: "error", message: passwordValidationError },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();

  const platformSession = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );

  const organizationSession = await getIronSession<SessionData>(
    cookieStore,
    organizationSessionOptions,
  );

  const workforceSession = await getIronSession<SessionData>(
    cookieStore,
    employeeSessionOptions,
  );

  const activeSessions = [
    { kind: "platform" as const, session: platformSession },
    { kind: "organization" as const, session: organizationSession },
    { kind: "workforce" as const, session: workforceSession },
  ].filter(({ session }) => Boolean(session.userId));

  // An account must have exactly one active role session in this browser.
  if (activeSessions.length !== 1) {
    if (activeSessions.length > 1) {
      for (const entry of activeSessions) {
        await entry.session.destroy();
      }
    }

    return unauthorizedResponse();
  }

  const sessionKind: SessionKind = activeSessions[0].kind;
  const activeSession = activeSessions[0].session;

  let identity: AuthenticatedIdentity | null = null;

  // Use the application's existing role-specific authentication helpers.
  if (sessionKind === "platform") {
    const admin = await getPlatformSuperAdmin();

    if (admin) {
      identity = {
        id: admin.id,
        email: admin.email,
        roleName: admin.roleName,
      };
    }
  } else if (sessionKind === "organization") {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });

    if (admin) {
      identity = {
        id: admin.id,
        email: admin.email,
        roleName: admin.roleName,
        organizationId: admin.organizationId,
      };
    }
  } else {
    const workforceUser = await getOrganizationUser();

    if (workforceUser) {
      identity = {
        id: workforceUser.id,
        email: workforceUser.email,
        roleName: workforceUser.roleName,
        organizationId: workforceUser.organizationId,
        employeeId: workforceUser.employeeId,
      };
    }
  }

  if (!identity) {
    return unauthorizedResponse();
  }

  // Rate-limit authenticated password-change attempts.
  // The user-specific bucket applies even during local development.
  // IP limiting activates only when a trusted IP header is configured.
  try {
    const clientIp = getTrustedClientIp(request);

    if (clientIp) {
      const ipLimit = await consumeRateLimit({
        scope: "password-change:ip",
        identifier: clientIp,
        limit: MAX_PASSWORD_CHANGE_ATTEMPTS_PER_IP,
        windowMs: PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS,
      });

      if (!ipLimit.allowed) {
        return rateLimitedResponse(
          ipLimit.retryAfterSeconds,
        );
      }
    }

    const userLimit = await consumeRateLimit({
      scope: "password-change:user",
      identifier: identity.id,
      limit: MAX_PASSWORD_CHANGE_ATTEMPTS_PER_USER,
      windowMs: PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS,
    });

    if (!userLimit.allowed) {
      return rateLimitedResponse(
        userLimit.retryAfterSeconds,
      );
    }
  } catch {
    // Fail closed if rate-limit infrastructure is unavailable.
    console.error("Password-change rate limiting failed.");

    return NextResponse.json(
      {
        status: "error",
        message: "Unable to change your password right now.",
      },
      { status: 500 },
    );
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Revalidate the account under a row lock before changing credentials.
    const userResult = await client.query(
      `SELECT
         u.id,
         u.email,
         u.password_hash,
         u.account_scope,
         u.organization_id,
         u.employee_id,
         u.status AS user_status,
         u.session_version,
         r.name AS role_name,
         r.scope AS role_scope,
         r.organization_id AS role_organization_id,
         o.status AS organization_status,
         e.employment_status
       FROM public.users AS u
       JOIN public.roles AS r
         ON r.id = u.role_id
       LEFT JOIN public.organizations AS o
         ON o.id = u.organization_id
       LEFT JOIN public.employees AS e
         ON e.id = u.employee_id
        AND e.organization_id = u.organization_id
       WHERE u.id = $1
       FOR UPDATE OF u`,
      [identity.id],
    );

    const user = userResult.rows[0];

    const baseAccountValid =
      Boolean(user) &&
      user.user_status === "ACTIVE" &&
      user.role_name === identity.roleName &&
      typeof user.password_hash === "string" &&
      typeof user.email === "string";

    let roleAndScopeValid = false;

    if (baseAccountValid && sessionKind === "platform") {
      roleAndScopeValid =
        user.account_scope === "PLATFORM" &&
        user.organization_id === null &&
        user.employee_id === null &&
        user.role_name === "SUPER_ADMIN" &&
        user.role_scope === "PLATFORM" &&
        user.role_organization_id === null;
    } else if (
      baseAccountValid &&
      sessionKind === "organization"
    ) {
      roleAndScopeValid =
        user.account_scope === "ORGANIZATION" &&
        typeof identity.organizationId === "string" &&
        user.organization_id === identity.organizationId &&
        user.role_name === "ORGANIZATION_ADMIN" &&
        user.role_scope === "ORGANIZATION" &&
        user.role_organization_id === user.organization_id &&
        user.organization_status === "ACTIVE";
    } else if (
      baseAccountValid &&
      sessionKind === "workforce"
    ) {
      roleAndScopeValid =
        APPROVED_WORKFORCE_ROLES.has(user.role_name) &&
        user.account_scope === "ORGANIZATION" &&
        typeof identity.organizationId === "string" &&
        typeof identity.employeeId === "string" &&
        user.organization_id === identity.organizationId &&
        user.employee_id === identity.employeeId &&
        user.role_scope === "ORGANIZATION" &&
        user.role_organization_id === user.organization_id &&
        user.organization_status === "ACTIVE" &&
        user.employment_status === "ACTIVE";
    }

    if (!baseAccountValid || !roleAndScopeValid) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return unauthorizedResponse();
    }

    const currentPasswordIsValid = await verifyPassword(
      currentPassword,
      user.password_hash,
    );

    if (!currentPasswordIsValid) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return NextResponse.json(
        {
          status: "error",
          message: "Your current password is incorrect.",
        },
        { status: 400 },
      );
    }

    const newPasswordIsUnchanged = await verifyPassword(
      newPassword,
      user.password_hash,
    );

    if (newPasswordIsUnchanged) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return NextResponse.json(
        {
          status: "error",
          message:
            "Your new password must be different from your current password.",
        },
        { status: 400 },
      );
    }

    const newPasswordHash = await hashNewPassword(newPassword);

    const updateResult = await client.query(
      `UPDATE public.users
       SET password_hash = $1,
           password_changed_at = NOW(),
           session_version = session_version + 1,
           updated_at = NOW()
       WHERE id = $2
         AND status = 'ACTIVE'
       RETURNING email, password_changed_at`,
      [newPasswordHash, identity.id],
    );

    if (updateResult.rowCount !== 1) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return unauthorizedResponse();
    }

    const updatedUser = updateResult.rows[0];

    await client.query("COMMIT");
    transactionStarted = false;

    // Clear only this user's password-change bucket following success.
    // Never clear the shared IP bucket on an individual success.
    try {
      await clearRateLimit(
        "password-change:user",
        identity.id,
      );
    } catch {
      // The password change is already committed; a counter-cleanup
      // failure must not falsely report that the change itself failed.
      console.error(
        "Failed to clear the user password-change rate-limit bucket.",
      );
    }

    // Clear this browser's sessions for all roles.
    // Other-device sessions are invalidated by session_version checks
    // in the protected authentication helpers.
    try {
      await activeSession.destroy();
      await platformSession.destroy();
      await organizationSession.destroy();
      await workforceSession.destroy();
    } catch {
      console.error(
        "One or more session cookies could not be cleared after a password change.",
      );
    }

    // A notification failure must not undo a completed password change.
    try {
      await sendPasswordChangedNotificationEmail({
        to: updatedUser.email,
        changedAt: updatedUser.password_changed_at,
      });
    } catch {
      console.error(
        "Password-change security notification delivery failed.",
      );
    }

    return NextResponse.json({
      status: "ok",
      message: "Password changed successfully. Please sign in again.",
    });
  } catch {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("Password-change transaction rollback failed.");
      }
    }

    console.error("Authenticated password change failed.");

    return NextResponse.json(
      {
        status: "error",
        message: "Unable to change your password right now.",
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}