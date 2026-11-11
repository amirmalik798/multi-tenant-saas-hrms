import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";

import { pool } from "../../../../lib/db";
import {
  hashNewPassword,
  verifyPassword,
} from "../../../../lib/password";
import {
  clearRateLimit,
  consumeRateLimit,
} from "../../../../lib/rate-limit";
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

const ROLE_DESTINATIONS = {
  SUPER_ADMIN: "/dashboard",
  ORGANIZATION_ADMIN: "/org/dashboard",
  HR_MANAGER: "/employee/welcome",
  DEPARTMENT_MANAGER: "/employee/welcome",
  EMPLOYEE: "/employee/welcome",
} as const;

type LoginRole = keyof typeof ROLE_DESTINATIONS;

type WorkforceRole =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

type LoginKind =
  | "SUPER_ADMIN"
  | "ORGANIZATION_ADMIN"
  | "EMPLOYEE";

const WORKFORCE_ROLES: ReadonlySet<string> =
  new Set<WorkforceRole>([
    "HR_MANAGER",
    "DEPARTMENT_MANAGER",
    "EMPLOYEE",
  ]);

const LOGIN_EMAIL_ATTEMPT_LIMIT = 10;
const LOGIN_IP_ATTEMPT_LIMIT = 120;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const DUMMY_LOGIN_PASSWORD =
  "HRMS-login-dummy-password-for-timing-check-2026!";

let dummyPasswordHashPromise: Promise<string> | null = null;

function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = hashNewPassword(
      DUMMY_LOGIN_PASSWORD,
    ).catch((error: unknown) => {
      dummyPasswordHashPromise = null;
      throw error;
    });
  }

  return dummyPasswordHashPromise;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isLoginRole(value: unknown): value is LoginRole {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      ROLE_DESTINATIONS,
      value,
    )
  );
}

function isWorkforceRole(
  value: unknown,
): value is WorkforceRole {
  return (
    typeof value === "string" &&
    WORKFORCE_ROLES.has(value)
  );
}

/**
 * Read a client IP only from an explicitly configured trusted proxy
 * header. The proxy must overwrite that header on incoming requests.
 *
 * When no trusted IP header is configured, IP limiting is skipped
 * during local development. The per-email limit remains active.
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

  if (!candidate || candidate.includes(",")) {
    return null;
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

function rateLimitedResponse(
  retryAfterSeconds: number,
): NextResponse {
  return NextResponse.json(
    {
      message:
        "Too many sign-in attempts. Please wait before trying again.",
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

export async function POST(request: Request) {
  // Reject untrusted request origins before parsing credentials or
  // consuming rate-limit attempts.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // Enforce application/json and the shared request-body size limit.
  // Parse once; do not call request.json() again later.
  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body: unknown = parsedBody.body;

  if (
    !isObject(body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return NextResponse.json(
      { message: "Email and password are required" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length > 1024
  ) {
    return NextResponse.json(
      { message: "Invalid email or password" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const clientIp = getTrustedClientIp(request);

    if (clientIp) {
      const ipLimit = await consumeRateLimit({
        scope: "login:ip",
        identifier: clientIp,
        limit: LOGIN_IP_ATTEMPT_LIMIT,
        windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      });

      if (!ipLimit.allowed) {
        return rateLimitedResponse(
          ipLimit.retryAfterSeconds,
        );
      }
    }

    const emailLimit = await consumeRateLimit({
      scope: "login:email",
      identifier: email,
      limit: LOGIN_EMAIL_ATTEMPT_LIMIT,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    });

    if (!emailLimit.allowed) {
      return rateLimitedResponse(
        emailLimit.retryAfterSeconds,
      );
    }

    const dummyHashPromise = getDummyPasswordHash();

    const result = await pool.query(
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
         o.name AS organization_name,
         o.status AS organization_status,
         e.employee_code,
         e.employment_status
       FROM users AS u
       JOIN roles AS r
         ON r.id = u.role_id
       LEFT JOIN organizations AS o
         ON o.id = u.organization_id
       LEFT JOIN employees AS e
         ON e.id = u.employee_id
        AND e.organization_id = u.organization_id
       WHERE LOWER(u.email) = $1
       LIMIT 1`,
      [email],
    );

    const user = result.rows[0];
    const dummyPasswordHash = await dummyHashPromise;

    const candidatePasswordHash =
      typeof user?.password_hash === "string"
        ? user.password_hash
        : dummyPasswordHash;

    const passwordIsValid = await verifyPassword(
      password,
      candidatePasswordHash,
    );

    if (!user || !passwordIsValid) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (
      typeof user.session_version !== "number" ||
      !Number.isSafeInteger(user.session_version) ||
      user.session_version < 0
    ) {
      console.error(
        "Unified login found an invalid session_version value.",
      );

      return NextResponse.json(
        { message: "Unable to sign in right now" },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const roleName: unknown = user.role_name;

    let loginKind: LoginKind | null = null;

    if (
      roleName === "SUPER_ADMIN" &&
      user.account_scope === "PLATFORM" &&
      user.organization_id === null &&
      user.employee_id === null &&
      user.role_scope === "PLATFORM" &&
      user.role_organization_id === null
    ) {
      loginKind = "SUPER_ADMIN";
    } else if (
      roleName === "ORGANIZATION_ADMIN" &&
      user.account_scope === "ORGANIZATION" &&
      typeof user.organization_id === "string" &&
      user.role_scope === "ORGANIZATION" &&
      user.role_organization_id === user.organization_id &&
      typeof user.organization_name === "string"
    ) {
      loginKind = "ORGANIZATION_ADMIN";
    } else if (
      isWorkforceRole(roleName) &&
      user.account_scope === "ORGANIZATION" &&
      typeof user.organization_id === "string" &&
      typeof user.employee_id === "string" &&
      typeof user.employee_code === "string" &&
      user.role_scope === "ORGANIZATION" &&
      user.role_organization_id === user.organization_id
    ) {
      loginKind = "EMPLOYEE";
    }

    // Legacy HR_OFFICER and LINE_MANAGER remain excluded.
    if (!loginKind || !isLoginRole(roleName)) {
      return NextResponse.json(
        {
          message:
            "This account is not configured for this sign-in flow",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (user.user_status !== "ACTIVE") {
      return NextResponse.json(
        {
          message:
            "Your account is not active. Please contact your administrator.",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (loginKind !== "SUPER_ADMIN") {
      if (user.organization_status === "SUSPENDED") {
        return NextResponse.json(
          {
            message:
              "Your organization has been suspended. Please contact your platform administrator.",
          },
          {
            status: 403,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }

      if (user.organization_status !== "ACTIVE") {
        return NextResponse.json(
          {
            message:
              "Your organization is not active. Please contact your platform administrator.",
          },
          {
            status: 403,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    }

    if (
      loginKind === "EMPLOYEE" &&
      user.employment_status !== "ACTIVE"
    ) {
      return NextResponse.json(
        {
          message:
            "Your employment status does not permit login. Please contact your organization administrator.",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    // Clear this email's bucket only after eligible authentication.
    // The shared IP counter remains in place.
    await clearRateLimit("login:email", email);

    if (loginKind === "EMPLOYEE") {
      await pool.query(
        `UPDATE users
         SET last_login_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [user.id],
      );
    }

    const cookieStore = await cookies();

    cookieStore.delete("crm_admin_session");
    cookieStore.delete("crm_org_session");
    cookieStore.delete("crm_employee_session");

    const options =
      loginKind === "SUPER_ADMIN"
        ? sessionOptions
        : loginKind === "ORGANIZATION_ADMIN"
          ? organizationSessionOptions
          : employeeSessionOptions;

    const session = await getIronSession<SessionData>(
      cookieStore,
      options,
    );

    session.userId = user.id;
    session.email = user.email;
    session.accountScope = user.account_scope;
    session.roleName = roleName;
    session.sessionVersion = user.session_version;

    if (loginKind !== "SUPER_ADMIN") {
      session.organizationId = user.organization_id;
    }

    if (loginKind === "EMPLOYEE") {
      session.employeeId = user.employee_id;
    }

    await session.save();

    const destination = ROLE_DESTINATIONS[roleName];

    return NextResponse.json(
      {
        status: "ok",
        message: "Login successful",
        destination,
        user: {
          id: user.id,
          email: user.email,
          role: roleName,
          organizationId: user.organization_id ?? null,
          organizationName: user.organization_name ?? null,
          employeeId: user.employee_id ?? null,
          employeeCode: user.employee_code ?? null,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Unified login failed:", error);

    return NextResponse.json(
      { message: "Unable to sign in right now" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}