import type { SessionOptions } from "iron-session";

export interface SessionData {
  userId?: string;
  email?: string;
  accountScope?: "PLATFORM" | "ORGANIZATION";
  roleName?: string;
  organizationId?: string;
  employeeId?: string;

  // Version of the user's account when this session was issued.
  // Missing versions are rejected by the authentication helpers.
  sessionVersion?: number;
}

const MIN_SESSION_PASSWORD_LENGTH = 32;

function getRequiredSessionPassword(
  environmentVariable: string,
): string {
  const password = process.env[environmentVariable];

  if (
    typeof password !== "string" ||
    password.length < MIN_SESSION_PASSWORD_LENGTH ||
    password.trim() !== password
  ) {
    throw new Error(
      `${environmentVariable} must be configured with at least ${MIN_SESSION_PASSWORD_LENGTH} characters and no leading or trailing whitespace.`,
    );
  }

  return password;
}

const adminSessionPassword =
  getRequiredSessionPassword("SESSION_PASSWORD");

const organizationSessionPassword =
  getRequiredSessionPassword("ORGANIZATION_SESSION_PASSWORD");

const employeeSessionPassword =
  getRequiredSessionPassword("EMPLOYEE_SESSION_PASSWORD");

// Each role must have its own independent signing/encryption secret.
if (
  new Set([
    adminSessionPassword,
    organizationSessionPassword,
    employeeSessionPassword,
  ]).size !== 3
) {
  throw new Error(
    "SESSION_PASSWORD, ORGANIZATION_SESSION_PASSWORD, and EMPLOYEE_SESSION_PASSWORD must all be different.",
  );
}

// Super Admin session
export const sessionOptions: SessionOptions = {
  password: adminSessionPassword,
  cookieName: "crm_admin_session",

  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};

// Organization Admin session
export const organizationSessionOptions: SessionOptions = {
  password: organizationSessionPassword,
  cookieName: "crm_org_session",

  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};

// Employee session
export const employeeSessionOptions: SessionOptions = {
  password: employeeSessionPassword,
  cookieName: "crm_employee_session",

  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};