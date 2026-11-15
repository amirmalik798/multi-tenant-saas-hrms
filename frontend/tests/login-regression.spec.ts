import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import dotenv from "dotenv";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
  type Response,
} from "@playwright/test";

// Load the same database settings used by the backend without overriding
// values explicitly supplied in frontend/.env.playwright.
dotenv.config({ path: path.resolve(process.cwd(), "../backend/.env.local"), override: false });
dotenv.config({ path: path.resolve(process.cwd(), "../backend/.env"), override: false });

const backendRequire = createRequire(path.resolve(process.cwd(), "../backend/package.json"));
const backendPg = backendRequire("pg") as {
  Pool: new (config: Record<string, unknown>) => {
    query: (sql: string, values?: unknown[]) => Promise<{
      rowCount: number | null;
      rows: Array<Record<string, unknown>>;
    }>;
    end: () => Promise<void>;
  };
};

/**
 * Unified login and password-recovery regression suite.
 *
 * UI assertions use the actual accessible controls in frontend/app/page.tsx.
 * Organizations, invitations, administrators, and workforce accounts are
 * created through the real backend APIs. Direct SQL is limited to fixture
 * states with no product-side mutation route: workforce SUSPENDED accounts
 * and an EXPIRED license. No route interception or API mocking is used.
 *
 * Run from frontend:
 *   npx playwright test tests/login-regression.spec.ts --project=chromium --workers=1
 */

const API = {
  login: "/api/backend/unified-auth/login",
  resetRequest: "/api/backend/password-reset/request",
  resetComplete: "/api/backend/password-reset/complete",
} as const;

const loginEmail = (page: Page) => page.locator("#email");
const loginPassword = (page: Page) => page.locator("#password");
const recoveryEmail = (page: Page) => page.locator("#reset-email");
const newPassword = (page: Page) => page.locator("#new-password");
const confirmNewPassword = (page: Page) => page.locator("#confirm-new-password");

async function waitForAuthHydration(page: Page) {
  await expect(page.locator('main[data-auth-hydrated="true"]')).toBeVisible({
    timeout: 15_000,
  });
}


function freshResetToken() {
  return randomBytes(32).toString("base64url");
}

async function openResetForm(page: Page, token = freshResetToken()) {
  await page.goto(`/?token=${token}`);
  await waitForAuthHydration(page);
  await expect(
    page.getByRole("heading", { name: "Choose a new password", exact: true }),
  ).toBeVisible();
  await expect(newPassword(page)).toBeVisible();
  await expect(confirmNewPassword(page)).toBeVisible();
  return token;
}

async function openLogin(page: Page) {
  await page.goto("/");
  await waitForAuthHydration(page);
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(loginEmail(page)).toBeVisible();
  await expect(loginPassword(page)).toBeVisible();
}

async function openRecovery(page: Page) {
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
  await expect(recoveryEmail(page)).toBeVisible();
}

function appAlert(page: Page, text: string | RegExp) {
  return page.locator('[role="alert"]').filter({ hasText: text });
}

function appStatus(page: Page, text: string | RegExp) {
  return page.locator('[role="status"]').filter({ hasText: text });
}

function observeRequests(page: Page, path: string) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === path) requests.push(request.url());
  });
  return requests;
}

async function waitForRealPost(
  page: Page,
  path: string,
  action: () => Promise<unknown>,
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === "POST",
    { timeout: 25_000 },
  );
  await action();
  const response = await responsePromise;
  expect(new URL(response.url()).pathname).toBe(path);
  return response;
}

async function submitLogin(page: Page, email: string, password: string) {
  await loginEmail(page).fill(email);
  await loginPassword(page).fill(password);
  await expect(loginEmail(page)).toHaveValue(email);
  // Avoid echoing a real .env.playwright password in assertion output.
  expect((await loginPassword(page).inputValue()) === password).toBe(true);
  expect(await loginEmail(page).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  const submit = page.getByRole("button", { name: "Sign in securely", exact: true });
  await expect(submit).toBeEnabled();
  const response = await waitForRealPost(page, API.login, () => submit.click());
  const currentUrl = new URL(page.url());
  expect(currentUrl.searchParams.has("email")).toBe(false);
  expect(currentUrl.searchParams.has("password")).toBe(false);
  return response;
}

type LoginFixtureAccount = {
  email: string;
  password: string;
  userId: string;
  employeeId?: string;
};

type LoginNegativeFixtures = {
  organizationId: string;
  primaryAdmin: LoginFixtureAccount;
  suspendedAdmin: LoginFixtureAccount;
  suspendedHrManager: LoginFixtureAccount;
  activeHrManager: LoginFixtureAccount;
  suspendedDepartmentManager: LoginFixtureAccount;
  activeDepartmentManager: LoginFixtureAccount;
  suspendedEmployee: LoginFixtureAccount;
  activeEmployee: LoginFixtureAccount;
  unactivatedAdmin: LoginFixtureAccount;
  expiredOrganizationId: string;
  expiredAdmin: LoginFixtureAccount;
};

type SetupJson = {
  [key: string]: unknown;
  organization?: { id?: string; status?: string };
  user?: { id?: string; email?: string; status?: string; role?: string };
  invitationUrl?: string;
  emailSent?: boolean;
  invitation?: { id?: string };
  employee?: { id?: string };
  organizationAdmins?: Array<{ id?: string; email?: string }>;
  department?: { id?: string };
  payment?: { id?: string; status?: string };
  license?: {
    status?: string;
    activationSource?: string;
    canAccess?: boolean;
  };
  message?: string;
};

const LOGIN_RUN_ID = randomBytes(5).toString("hex");
const LOGIN_TEST_PASSWORD = "PW-Login-Fixture!" + LOGIN_RUN_ID + "Aa";
const LOGIN_BASE_URL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const LOGIN_ORIGIN_HEADERS = {
  origin: LOGIN_BASE_URL,
  "sec-fetch-site": "same-origin",
  "ngrok-skip-browser-warning": "true",
};

let negativeFixtures: LoginNegativeFixtures | null = null;
let negativeFixtureSkipReason = "Login negative fixtures have not been initialized.";
let platformFixtureApi: APIRequestContext | null = null;
let tenantFixtureApi: APIRequestContext | null = null;
let unactivatedTenantFixtureApi: APIRequestContext | null = null;
let expiredTenantFixtureApi: APIRequestContext | null = null;
let fixtureDatabase: ReturnType<typeof createFixturePool> | null = null;

function createFixturePool() {
  const host = process.env.DB_HOST ?? process.env.PGHOST;
  const database = process.env.DB_NAME ?? process.env.PGDATABASE;
  const user = process.env.DB_USER ?? process.env.PGUSER;
  const password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;
  if (!host || !database || !user || !password) return null;

  return new backendPg.Pool({
    host,
    port: Number(process.env.DB_PORT ?? process.env.PGPORT ?? 5432),
    database,
    user,
    password,
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
}

async function setupJson(
  response: { status(): number; text(): Promise<string> },
  expectedStatus: number,
  description: string,
): Promise<SetupJson> {
  const raw = await response.text();
  let body: SetupJson = {};
  try {
    body = raw ? JSON.parse(raw) as SetupJson : {};
  } catch {
    body = { raw };
  }
  if (response.status() !== expectedStatus) {
    throw new Error(
      description + " failed. Expected HTTP " + expectedStatus +
      ", received HTTP " + response.status() + ". Response: " +
      JSON.stringify(body).slice(0, 1200),
    );
  }
  return body;
}

function generatedAccount(emailPrefix: string, password: string): LoginFixtureAccount {
  return {
    email: emailPrefix + "-" + LOGIN_RUN_ID + "@yopmail.com",
    password,
    userId: "",
  };
}

async function createOrganizationWithAdmin(
  nameSuffix: string,
  adminPrefix: string,
): Promise<{ organizationId: string; admin: LoginFixtureAccount }> {
  if (!platformFixtureApi) throw new Error("Platform fixture API is unavailable.");

  const name = "PW Login " + nameSuffix + " " + LOGIN_RUN_ID;
  const slug = "pw-login-" + nameSuffix.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + LOGIN_RUN_ID;
  const admin = generatedAccount(adminPrefix, LOGIN_TEST_PASSWORD);

  const organizationResponse = await platformFixtureApi.post("/api/backend/organizations", {
    data: {
      name,
      slug,
      contactEmail: "pw-login-contact-" + nameSuffix.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + LOGIN_RUN_ID + "@yopmail.com",
      contactPhone: "+250 788 123 450",
      country: "Rwanda",
      address: "Playwright Login Regression Avenue, Kigali, Rwanda",
    },
  });
  const organizationBody = await setupJson(organizationResponse, 201, "Create " + name);
  const organizationId = organizationBody.organization?.id as string | undefined;
  if (!organizationId) throw new Error("Organization creation did not return an organization ID.");

  const invitationResponse = await platformFixtureApi.post(
    "/api/backend/organizations/" + encodeURIComponent(organizationId) + "/invitations",
    {
      data: {
        email: admin.email,
        adminFirstName: "Playwright",
        adminLastName: nameSuffix + " Admin",
        adminPhone: "+250 788 123 450",
        adminCountry: "Rwanda",
        adminCity: "Kigali",
      },
    },
  );
  const invitationBody = await setupJson(invitationResponse, 201, "Invite " + admin.email);
  if (invitationBody.emailSent !== true || typeof invitationBody.invitationUrl !== "string") {
    throw new Error("Invitation for " + admin.email + " was not confirmed as delivered.");
  }

  const token = new URL(invitationBody.invitationUrl).searchParams.get("token");
  if (!token) throw new Error("Invitation URL for " + admin.email + " did not contain its token.");

  const acceptanceResponse = await platformFixtureApi.post("/api/backend/invitations/accept", {
    data: {
      token,
      firstName: "Playwright",
      lastName: nameSuffix + " Admin",
      phone: "+250 788 123 450",
      country: "Rwanda",
      city: "Kigali",
      password: admin.password,
    },
  });
  const acceptanceBody = await setupJson(acceptanceResponse, 201, "Accept " + admin.email);
  if (acceptanceBody.user?.status !== "ACTIVE" || acceptanceBody.organization?.status !== "ACTIVE") {
    throw new Error("Invitation acceptance did not activate the account and organization for " + admin.email);
  }
  admin.userId = acceptanceBody.user.id as string;

  return { organizationId, admin };
}

async function createAdditionalOrganizationAdmin(
  organizationId: string,
  prefix: string,
): Promise<LoginFixtureAccount> {
  if (!platformFixtureApi) throw new Error("Platform fixture API is unavailable.");

  const admin = generatedAccount(prefix, LOGIN_TEST_PASSWORD);
  const invitationResponse = await platformFixtureApi.post(
    "/api/backend/organizations/" + encodeURIComponent(organizationId) + "/invitations",
    {
      data: {
        email: admin.email,
        adminFirstName: "Playwright",
        adminLastName: "Secondary Admin",
        adminPhone: "+250 788 123 451",
        adminCountry: "Rwanda",
        adminCity: "Kigali",
      },
    },
  );
  const invitationBody = await setupJson(invitationResponse, 201, "Invite " + admin.email);
  if (invitationBody.emailSent !== true || typeof invitationBody.invitationUrl !== "string") {
    throw new Error("Invitation for " + admin.email + " was not confirmed as delivered.");
  }
  const token = new URL(invitationBody.invitationUrl).searchParams.get("token");
  if (!token) throw new Error("Invitation URL for " + admin.email + " did not contain its token.");

  const acceptanceResponse = await platformFixtureApi.post("/api/backend/invitations/accept", {
    data: {
      token,
      firstName: "Playwright",
      lastName: "Secondary Admin",
      phone: "+250 788 123 451",
      country: "Rwanda",
      city: "Kigali",
      password: admin.password,
    },
  });
  const body = await setupJson(acceptanceResponse, 201, "Accept " + admin.email);
  if (body.user?.status !== "ACTIVE") throw new Error("Secondary Organization Admin did not become active.");
  admin.userId = body.user.id as string;
  return admin;
}

async function createTenantApi(account: LoginFixtureAccount): Promise<APIRequestContext> {
  const api = await request.newContext({
    baseURL: LOGIN_BASE_URL,
    extraHTTPHeaders: LOGIN_ORIGIN_HEADERS,
  });
  const response = await api.post("/api/backend/unified-auth/login", {
    data: { email: account.email, password: account.password },
  });
  const body = await setupJson(response, 200, "Authenticate fixture " + account.email);
  if (body.user?.email !== account.email || body.user?.role !== "ORGANIZATION_ADMIN") {
    await api.dispose();
    throw new Error("Fixture account did not authenticate as an Organization Admin: " + account.email);
  }
  return api;
}

async function completeOrganizationSetup(api: APIRequestContext, label: string) {
  const settingsResponse = await api.get("/api/backend/org/settings");
  await setupJson(settingsResponse, 200, "Load settings for " + label);

  // Write all setup-required fields explicitly instead of relying on whatever
  // working-day defaults happen to exist in a local database.
  const updateSettingsResponse = await api.patch("/api/backend/org/settings", {
    data: {
      timeZone: "Africa/Kigali",
      locale: "en-RW",
      currencyCode: "RWF",
      dateFormat: "DD/MM/YYYY",
      weekStartsOn: 1,
      workingDays: [1, 2, 3, 4, 5],
      countryCode: "RW",
    },
  });
  await setupJson(updateSettingsResponse, 200, "Save setup-required settings for " + label);

  const completeResponse = await api.post("/api/backend/org/settings/complete", {
    data: {},
  });
  await setupJson(completeResponse, 200, "Complete settings for " + label);
}

async function activateFixtureOrganizationLicense(
  organizationApi: APIRequestContext,
  label: string,
) {
  if (!platformFixtureApi) {
    throw new Error("Platform fixture API is unavailable for license approval.");
  }

  // This tiny PNG is only a synthetic payment-proof fixture. The submission
  // and approval still pass through the real application APIs and audit flow.
  const proofImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/SsAAAAASUVORK5CYII=",
    "base64",
  );

  const submissionResponse = await organizationApi.post(
    "/api/backend/org/license/submissions",
    {
      headers: {
        "x-payment-amount": "1.00",
        "x-payment-currency": "RWF",
        "x-transaction-reference": "PW-LOGIN-" + LOGIN_RUN_ID,
      },
      multipart: {
        proofImage: {
          name: "pw-login-license-proof.png",
          mimeType: "image/png",
          buffer: proofImage,
        },
      },
    },
  );
  const submissionBody = await setupJson(
    submissionResponse,
    201,
    "Submit synthetic license payment for " + label,
  );
  const paymentId = submissionBody.payment?.id;
  if (!paymentId) {
    throw new Error("License payment submission returned no payment ID for " + label);
  }

  const reviewResponse = await platformFixtureApi.patch(
    "/api/backend/platform-payments/" + encodeURIComponent(paymentId) + "/review",
    { data: { decision: "APPROVE" } },
  );
  const reviewBody = await setupJson(
    reviewResponse,
    200,
    "Approve synthetic license payment for " + label,
  );
  if (
    reviewBody.license?.status !== "ACTIVE" ||
    reviewBody.license?.activationSource !== "PAYMENT"
  ) {
    throw new Error("Approved payment did not activate the license for " + label);
  }

  const licenseResponse = await organizationApi.get("/api/backend/org/license");
  const licenseBody = await setupJson(
    licenseResponse,
    200,
    "Verify active license for " + label,
  );
  if (
    licenseBody.license?.status !== "ACTIVE" ||
    licenseBody.license?.canAccess !== true
  ) {
    throw new Error("License access is not active after payment approval for " + label);
  }
}

async function createWorkforceLoginAccount(
  api: APIRequestContext,
  role: "HR_MANAGER" | "DEPARTMENT_MANAGER" | "EMPLOYEE",
  prefix: string,
  managerId?: string,
  departmentId?: string,
): Promise<LoginFixtureAccount> {
  const email = prefix + "-" + LOGIN_RUN_ID + "@yopmail.com";
  const password = "PW-" + role + "-Fixture!" + LOGIN_RUN_ID + "Aa";

  const profileResponse = await api.post("/api/backend/employees", {
    data: {
      employee_code: ("PW-" + prefix + "-" + LOGIN_RUN_ID).toUpperCase().slice(0, 45),
      first_name: "Playwright",
      last_name: prefix.replace(/-/g, " "),
      email,
      phone: "+250 788 123 45" + (role === "HR_MANAGER" ? "2" : role === "DEPARTMENT_MANAGER" ? "3" : "4"),
      emergency_contact_name: "Playwright Emergency Contact",
      emergency_contact_relationship: "Family Member",
      emergency_contact_phone: "+250 788 123 456",
      country: "Rwanda",
      city: "Kigali",
      designation: role.replace(/_/g, " "),
      joining_date: new Date().toISOString().slice(0, 10),
      workforce_role: role,
      ...(managerId ? { manager_id: managerId } : {}),
      ...(departmentId ? { department_id: departmentId } : {}),
    },
  });
  const profileBody = await setupJson(profileResponse, 201, "Create " + role + " profile " + email);
  const employeeId = profileBody.employee?.id as string | undefined;
  if (!employeeId) throw new Error("Workforce profile creation returned no employee ID for " + email);

  const invitationResponse = await api.post(
    "/api/backend/employees/" + encodeURIComponent(employeeId) + "/invitation",
    { data: { roleName: role } },
  );
  const invitationBody = await setupJson(invitationResponse, 201, "Invite " + email);
  if (invitationBody.emailSent !== true || typeof invitationBody.invitationUrl !== "string") {
    throw new Error("Workforce invitation for " + email + " was not confirmed as delivered.");
  }
  const token = new URL(invitationBody.invitationUrl).searchParams.get("token");
  if (!token) throw new Error("Workforce invitation URL for " + email + " did not contain its token.");

  const acceptanceResponse = await api.post("/api/backend/employee-invitations/accept", {
    data: { token, password },
  });
  const acceptanceBody = await setupJson(acceptanceResponse, 201, "Accept " + email);
  if (acceptanceBody.user?.status !== "ACTIVE") {
    throw new Error("Workforce invitation did not create an active account for " + email);
  }

  return {
    email,
    password,
    userId: acceptanceBody.user.id as string,
    employeeId,
  };
}

async function setFixtureUserSuspended(account: LoginFixtureAccount, organizationId: string, roleName: string) {
  if (!fixtureDatabase) throw new Error("Login fixture database connection is unavailable.");
  const result = await fixtureDatabase.query(
    `UPDATE public.users AS u
     SET status = 'SUSPENDED',
         session_version = session_version + 1,
         updated_at = NOW()
     FROM public.roles AS r
     WHERE u.id = $1::uuid
       AND u.organization_id = $2::uuid
       AND u.account_scope = 'ORGANIZATION'
       AND u.role_id = r.id
       AND r.organization_id = u.organization_id
       AND r.scope = 'ORGANIZATION'
       AND r.name = $3
     RETURNING u.id`,
    [account.userId, organizationId, roleName],
  );
  if (result.rowCount !== 1) {
    throw new Error("Could not mark the " + roleName + " fixture account as SUSPENDED.");
  }
}

async function initializeNegativeLoginFixtures() {
  const superAdminEmail = process.env.PW_SUPER_ADMIN_EMAIL?.trim();
  const superAdminPassword = process.env.PW_SUPER_ADMIN_PASSWORD;
  fixtureDatabase = createFixturePool();

  if (!superAdminEmail || !superAdminPassword) {
    negativeFixtureSkipReason = "Set PW_SUPER_ADMIN_EMAIL and PW_SUPER_ADMIN_PASSWORD in frontend/.env.playwright.";
    return;
  }
  if (!fixtureDatabase) {
    negativeFixtureSkipReason =
      "The suite needs DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD (or PG* equivalents) to seed SUSPENDED user and EXPIRED license states. The backend .env.local/.env files are loaded automatically when present.";
    return;
  }

  platformFixtureApi = await request.newContext({
    baseURL: LOGIN_BASE_URL,
    extraHTTPHeaders: LOGIN_ORIGIN_HEADERS,
  });
  const platformLogin = await platformFixtureApi.post("/api/backend/unified-auth/login", {
    data: { email: superAdminEmail, password: superAdminPassword },
  });
  const platformLoginBody = await setupJson(platformLogin, 200, "Authenticate Platform Super Admin");
  if (platformLoginBody.user?.role !== "SUPER_ADMIN") {
    throw new Error("PW_SUPER_ADMIN_EMAIL must belong to an active Platform Super Admin.");
  }

  await fixtureDatabase.query("SELECT 1");

  // This tenant hosts the successful and suspended-role login fixtures.
  // New organizations start unlicensed, so activate its license through the
  // real payment-submission and Super Admin approval workflow before creating
  // any workforce profiles.
  const activeTenant = await createOrganizationWithAdmin("Role Fixtures", "pw-login-primary-admin");
  const suspendedAdmin = await createAdditionalOrganizationAdmin(activeTenant.organizationId, "pw-login-suspended-admin");
  tenantFixtureApi = await createTenantApi(activeTenant.admin);
  await completeOrganizationSetup(tenantFixtureApi, "role-fixture test organization");
  await activateFixtureOrganizationLicense(tenantFixtureApi, "role-fixture test organization");

  // One account per role is suspended after activation; a second remains active
  // for valid-role fixture checks and wrong-password negative cases.
  const suspendedHrManager = await createWorkforceLoginAccount(
    tenantFixtureApi, "HR_MANAGER", "pw-login-suspended-hr",
  );
  const activeHrManager = await createWorkforceLoginAccount(
    tenantFixtureApi, "HR_MANAGER", "pw-login-active-hr",
  );

  const primaryHrResponse = await tenantFixtureApi.patch(
    "/api/backend/employees/" + encodeURIComponent(activeHrManager.employeeId!),
    { data: { is_primary_hr_manager: true } },
  );
  await setupJson(primaryHrResponse, 200, "Set active HR Manager as Primary HR Manager");

  const suspendedDepartmentManager = await createWorkforceLoginAccount(
    tenantFixtureApi, "DEPARTMENT_MANAGER", "pw-login-suspended-dm", activeHrManager.employeeId,
  );
  const activeDepartmentManager = await createWorkforceLoginAccount(
    tenantFixtureApi, "DEPARTMENT_MANAGER", "pw-login-active-dm", activeHrManager.employeeId,
  );

  const departmentResponse = await tenantFixtureApi.post("/api/backend/departments", {
    data: {
      name: "PW Login Department " + LOGIN_RUN_ID,
      description: "Playwright login regression fixtures",
    },
  });
  const departmentBody = await setupJson(departmentResponse, 201, "Create login fixture department");
  const departmentId = departmentBody.department?.id as string | undefined;
  if (!departmentId) throw new Error("Department creation did not return its ID.");

  const assignManagerResponse = await tenantFixtureApi.patch(
    "/api/backend/departments/" + encodeURIComponent(departmentId),
    { data: { manager_id: activeDepartmentManager.employeeId } },
  );
  await setupJson(assignManagerResponse, 200, "Assign active Department Manager to fixture department");

  const suspendedEmployee = await createWorkforceLoginAccount(
    tenantFixtureApi, "EMPLOYEE", "pw-login-suspended-employee", undefined, departmentId,
  );
  const activeEmployee = await createWorkforceLoginAccount(
    tenantFixtureApi, "EMPLOYEE", "pw-login-active-employee", undefined, departmentId,
  );

  // The unified login route rejects every users.status other than ACTIVE.
  // Current workforce workflows do not expose a Suspend action, so these
  // fixtures retain ACTIVE employment and seed the existing account state.
  await setFixtureUserSuspended(suspendedHrManager, activeTenant.organizationId, "HR_MANAGER");
  await setFixtureUserSuspended(suspendedDepartmentManager, activeTenant.organizationId, "DEPARTMENT_MANAGER");
  await setFixtureUserSuspended(suspendedEmployee, activeTenant.organizationId, "EMPLOYEE");

  // Keep a second active Organization Admin so the platform can suspend one
  // account without violating the last-active-administrator safeguard.
  const adminsResponse = await platformFixtureApi.get("/api/backend/organization-admins");
  const adminsBody = await setupJson(adminsResponse, 200, "Read Organization Admin directory");
  const suspendedAdminRecord = (adminsBody.organizationAdmins ?? []).find(
    (item) => item.email?.toLowerCase() === suspendedAdmin.email.toLowerCase(),
  );
  if (!suspendedAdminRecord?.id) throw new Error("Secondary Organization Admin is missing from the directory.");
  const suspendAdminResponse = await platformFixtureApi.patch(
    "/api/backend/organization-admins/" + encodeURIComponent(suspendedAdminRecord.id) + "/status",
    { data: { status: "SUSPENDED", reason: "Playwright negative login regression fixture" } },
  );
  await setupJson(suspendAdminResponse, 200, "Suspend secondary Organization Admin fixture");

  // A separate tenant remains unactivated. It is used only for the
  // NOT_ACTIVATED license-gate test and never receives workforce profiles.
  const unactivatedTenant = await createOrganizationWithAdmin(
    "Unactivated License",
    "pw-login-unactivated-admin",
  );
  unactivatedTenantFixtureApi = await createTenantApi(unactivatedTenant.admin);
  await completeOrganizationSetup(
    unactivatedTenantFixtureApi,
    "unactivated-license test organization",
  );

  // A third tenant provides an independently expired license. Expiry uses
  // database time, so changing the browser clock cannot create this state.
  const expiredTenant = await createOrganizationWithAdmin("Expired License", "pw-login-expired-admin");
  expiredTenantFixtureApi = await createTenantApi(expiredTenant.admin);
  await completeOrganizationSetup(expiredTenantFixtureApi, "expired-license test organization");

  const expiredLicenseUpdate = await fixtureDatabase.query(
    `UPDATE public.organization_licenses
     SET status = 'EXPIRED',
         activation_source = 'LEGACY_GRACE',
         starts_at = NOW() - INTERVAL '31 days',
         expires_at = NOW() - INTERVAL '1 day',
         last_approved_payment_id = NULL,
         updated_at = NOW()
     WHERE organization_id = $1::uuid
     RETURNING status`,
    [expiredTenant.organizationId],
  );
  if (expiredLicenseUpdate.rowCount !== 1 || expiredLicenseUpdate.rows[0]?.status !== "EXPIRED") {
    throw new Error("Could not seed an EXPIRED license for the dedicated test organization.");
  }

  const activeLicense = await fixtureDatabase.query(
    `SELECT status, activation_source FROM public.organization_licenses WHERE organization_id = $1::uuid`,
    [activeTenant.organizationId],
  );
  if (
    activeLicense.rows[0]?.status !== "ACTIVE" ||
    activeLicense.rows[0]?.activation_source !== "PAYMENT"
  ) {
    throw new Error("The role-fixture organization must have an active, payment-backed license.");
  }

  const unactivatedLicense = await fixtureDatabase.query(
    `SELECT status FROM public.organization_licenses WHERE organization_id = $1::uuid`,
    [unactivatedTenant.organizationId],
  );
  if (unactivatedLicense.rows[0]?.status !== "NOT_ACTIVATED") {
    throw new Error("The dedicated unactivated-license organization did not retain NOT_ACTIVATED status.");
  }

  negativeFixtures = {
    organizationId: activeTenant.organizationId,
    primaryAdmin: activeTenant.admin,
    suspendedAdmin,
    suspendedHrManager,
    activeHrManager,
    suspendedDepartmentManager,
    activeDepartmentManager,
    suspendedEmployee,
    activeEmployee,
    unactivatedAdmin: unactivatedTenant.admin,
    expiredOrganizationId: expiredTenant.organizationId,
    expiredAdmin: expiredTenant.admin,
  };
  negativeFixtureSkipReason = "";
}

async function successfulRoleLogin(
  page: Page,
  role: string,
  email: string,
  password: string,
  destination: string,
  sessionCheck: string,
  sessionCookie: string,
) {
  const sessionResponsePromise = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === sessionCheck &&
      candidate.request().method() === "GET",
    { timeout: 20_000 },
  );

  const response = await submitLogin(page, email, password);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.user?.role).toBe(role);
  expect(body.destination).toBe(destination);

  const sessionResponse = await sessionResponsePromise;
  expect(sessionResponse.status()).toBe(200);
  const sessionBody = await sessionResponse.json();
  expect(sessionBody.authenticated).toBe(true);
  expect(sessionBody.user?.role).toBe(role);

  await page.waitForURL((url) => url.pathname === destination, { timeout: 20_000 });
  const cookies = await page.context().cookies();
  const roleCookieNames = ["crm_admin_session", "crm_org_session", "crm_employee_session"];
  const issuedRoleCookies = cookies
    .filter((cookie) => roleCookieNames.includes(cookie.name))
    .map((cookie) => cookie.name);
  expect(issuedRoleCookies).toEqual([sessionCookie]);
  const cookie = cookies.find((item) => item.name === sessionCookie);
  expect(cookie).toBeTruthy();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/");
  expect(cookie?.sameSite).toBe("Lax");
}

function requireNegativeFixtures(): LoginNegativeFixtures {
  test.skip(!negativeFixtures, negativeFixtureSkipReason);
  return negativeFixtures!;
}

function sameOriginLoginHeaders(page: Page) {
  return {
    origin: new URL(page.url()).origin,
    "sec-fetch-site": "same-origin",
  };
}

async function expectLoginFailure(
  page: Page,
  response: Response,
  status: number,
  message: string | RegExp,
) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.message).toMatch(message);
  await expect(appAlert(page, message)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("Login outcomes — successful roles, then 25 negative cases", () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    await initializeNegativeLoginFixtures();
  });

  test.afterAll(async () => {
    await Promise.all([
      platformFixtureApi?.dispose(),
      tenantFixtureApi?.dispose(),
      unactivatedTenantFixtureApi?.dispose(),
      expiredTenantFixtureApi?.dispose(),
      fixtureDatabase?.end(),
    ]);
    platformFixtureApi = null;
    tenantFixtureApi = null;
    unactivatedTenantFixtureApi = null;
    expiredTenantFixtureApi = null;
    fixtureDatabase = null;
  });

  test.beforeEach(async ({ page }) => openLogin(page));

  // Successful login coverage is deliberately first.
  test("LOGIN-SUCCESS-001: Super Admin authenticates and receives its platform session", async ({ page }) => {
    const email = process.env.PW_SUPER_ADMIN_EMAIL?.trim();
    const password = process.env.PW_SUPER_ADMIN_PASSWORD;
    test.skip(!email || !password, "Set PW_SUPER_ADMIN_EMAIL and PW_SUPER_ADMIN_PASSWORD in frontend/.env.playwright.");
    await successfulRoleLogin(page, "SUPER_ADMIN", email!, password!, "/dashboard", "/api/backend/auth/me", "crm_admin_session");
  });

  test("LOGIN-SUCCESS-002: Organization Admin authenticates and receives its organization session", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    await successfulRoleLogin(page, "ORGANIZATION_ADMIN", fixtures.primaryAdmin.email, fixtures.primaryAdmin.password, "/org/dashboard", "/api/backend/org/auth/me", "crm_org_session");
  });

  test("LOGIN-SUCCESS-003: HR Manager authenticates and receives its workforce session", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    await successfulRoleLogin(page, "HR_MANAGER", fixtures.activeHrManager.email, fixtures.activeHrManager.password, "/employee/welcome", "/api/backend/employee-auth/me", "crm_employee_session");
  });

  test("LOGIN-SUCCESS-004: Department Manager authenticates and receives its workforce session", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    await successfulRoleLogin(page, "DEPARTMENT_MANAGER", fixtures.activeDepartmentManager.email, fixtures.activeDepartmentManager.password, "/employee/welcome", "/api/backend/employee-auth/me", "crm_employee_session");
  });

  test("LOGIN-SUCCESS-005: Employee authenticates and receives its workforce session", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    await successfulRoleLogin(page, "EMPLOYEE", fixtures.activeEmployee.email, fixtures.activeEmployee.password, "/employee/welcome", "/api/backend/employee-auth/me", "crm_employee_session");
  });

  // 25 negative login, authentication, and license-access cases follow.

  test("LOGIN-NEGATIVE-001: empty email is blocked by the login form", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginPassword(page).fill("PW-Irrelevant-Password-123!");
    await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
    await expect(loginEmail(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-NEGATIVE-002: empty password is blocked by the login form", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginEmail(page).fill("person@example.com");
    await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
    await expect(loginPassword(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-NEGATIVE-003: malformed email is rejected before the login API request", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginEmail(page).fill("not-an-email");
    await loginPassword(page).fill("PW-Irrelevant-Password-123!");
    await loginPassword(page).press("Tab");
    await expect(page.getByText("Enter a valid email address, such as name@company.com.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-NEGATIVE-004: an unknown account is rejected by the real login endpoint", async ({ page }) => {
    const response = await submitLogin(page, "pw-login-unknown-" + LOGIN_RUN_ID + "@example.invalid", LOGIN_TEST_PASSWORD);
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });

  test("LOGIN-NEGATIVE-005: an incorrect Super Admin password is rejected", async ({ page }) => {
    const email = process.env.PW_SUPER_ADMIN_EMAIL?.trim();
    const password = process.env.PW_SUPER_ADMIN_PASSWORD;
    test.skip(!email || !password, "Configure the real Super Admin credentials to test a wrong-password attempt.");
    const response = await submitLogin(page, email!, password! + "-incorrect");
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });

  test("LOGIN-NEGATIVE-006: an incorrect Organization Admin password is rejected", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.primaryAdmin.email, fixtures.primaryAdmin.password + "-incorrect");
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });

  test("LOGIN-NEGATIVE-007: an incorrect HR Manager password is rejected", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.activeHrManager.email, fixtures.activeHrManager.password + "-incorrect");
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });

  test("LOGIN-NEGATIVE-008: an incorrect Department Manager password is rejected", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.activeDepartmentManager.email, fixtures.activeDepartmentManager.password + "-incorrect");
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });

  test("LOGIN-NEGATIVE-009: an incorrect Employee password is rejected", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.activeEmployee.email, fixtures.activeEmployee.password + "-incorrect");
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });

  test("LOGIN-NEGATIVE-010: the backend rejects a login payload without an email", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { password: LOGIN_TEST_PASSWORD },
      headers: sameOriginLoginHeaders(page),
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/email and password are required/i);
  });

  test("LOGIN-NEGATIVE-011: the backend rejects a login payload without a password", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { email: "person@example.com" },
      headers: sameOriginLoginHeaders(page),
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/email and password are required/i);
  });

  test("LOGIN-NEGATIVE-012: the backend rejects a non-string email value", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { email: 123, password: LOGIN_TEST_PASSWORD },
      headers: sameOriginLoginHeaders(page),
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/email and password are required/i);
  });

  test("LOGIN-NEGATIVE-013: the backend rejects a non-string password value", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { email: "person@example.com", password: 123 },
      headers: sameOriginLoginHeaders(page),
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/email and password are required/i);
  });

  test("LOGIN-NEGATIVE-014: the backend rejects a malformed email without checking credentials", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { email: "not-an-email", password: LOGIN_TEST_PASSWORD },
      headers: sameOriginLoginHeaders(page),
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toBe("Invalid email or password");
  });

  test("LOGIN-NEGATIVE-015: the backend rejects a password longer than its 1024-character input limit", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { email: "person@example.com", password: "x".repeat(1025) },
      headers: sameOriginLoginHeaders(page),
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toBe("Invalid email or password");
  });

  test("LOGIN-NEGATIVE-016: malformed JSON is rejected by the login endpoint", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: "{",
      headers: {
        ...sameOriginLoginHeaders(page),
        "content-type": "application/json",
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/invalid json/i);
  });

  test("LOGIN-NEGATIVE-017: non-JSON login requests are rejected", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: "email=person%40example.com&password=secret",
      headers: {
        ...sameOriginLoginHeaders(page),
        "content-type": "text/plain",
      },
    });
    expect(response.status()).toBe(415);
    expect((await response.json()).message).toMatch(/content-type/i);
  });

  test("LOGIN-NEGATIVE-018: cross-origin login requests are rejected before authentication", async ({ page }) => {
    const response = await page.request.post(API.login, {
      data: { email: "person@example.com", password: LOGIN_TEST_PASSWORD },
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).message).toMatch(/origin/i);
  });

  test("LOGIN-NEGATIVE-019: an active Organization Admin cannot sign in while the organization is suspended", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    if (!platformFixtureApi) throw new Error("Platform fixture API is unavailable.");
    const suspend = await platformFixtureApi.patch(
      "/api/backend/organizations/" + encodeURIComponent(fixtures.organizationId) + "/status",
      { data: { status: "SUSPENDED", reason: "Playwright suspended-organization login test" } },
    );
    await setupJson(suspend, 200, "Suspend organization for login test");
    try {
      const response = await submitLogin(page, fixtures.primaryAdmin.email, fixtures.primaryAdmin.password);
      await expectLoginFailure(
        page,
        response,
        403,
        "Your organization has been suspended. Please contact your platform administrator.",
      );
    } finally {
      const restore = await platformFixtureApi.patch(
        "/api/backend/organizations/" + encodeURIComponent(fixtures.organizationId) + "/status",
        { data: { status: "ACTIVE", reason: "Restore organization after Playwright login test" } },
      );
      await setupJson(restore, 200, "Restore organization after login test");
    }
  });

  test("LOGIN-NEGATIVE-020: a suspended Organization Admin account cannot sign in", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.suspendedAdmin.email, fixtures.suspendedAdmin.password);
    await expectLoginFailure(page, response, 403, "Your account is not active. Please contact your administrator.");
  });

  test("LOGIN-NEGATIVE-021: a suspended HR Manager account cannot sign in", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.suspendedHrManager.email, fixtures.suspendedHrManager.password);
    await expectLoginFailure(page, response, 403, "Your account is not active. Please contact your administrator.");
  });

  test("LOGIN-NEGATIVE-022: a suspended Department Manager account cannot sign in", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.suspendedDepartmentManager.email, fixtures.suspendedDepartmentManager.password);
    await expectLoginFailure(page, response, 403, "Your account is not active. Please contact your administrator.");
  });

  test("LOGIN-NEGATIVE-023: a suspended Employee account cannot sign in", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.suspendedEmployee.email, fixtures.suspendedEmployee.password);
    await expectLoginFailure(page, response, 403, "Your account is not active. Please contact your administrator.");
  });

  test("LOGIN-NEGATIVE-024: an organization without an activated license is locked after successful authentication", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.unactivatedAdmin.email, fixtures.unactivatedAdmin.password);
    expect(response.status()).toBe(200);
    expect((await response.json()).user?.role).toBe("ORGANIZATION_ADMIN");
    await page.waitForURL((url) => url.pathname === "/org/dashboard", { timeout: 20_000 });
    const licenseResponse = await page.request.get("/api/backend/license-access");
    expect(licenseResponse.status()).toBe(200);
    const licenseBody = await licenseResponse.json();
    expect(licenseBody.license?.status).toBe("NOT_ACTIVATED");
    expect(licenseBody.license?.canAccess).toBe(false);
    await expect(page.locator('[data-license-dialog="true"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your organization isn’t licensed yet", exact: true })).toBeVisible();
  });

  test("LOGIN-NEGATIVE-025: an organization with an expired license is locked after successful authentication", async ({ page }) => {
    const fixtures = requireNegativeFixtures();
    const response = await submitLogin(page, fixtures.expiredAdmin.email, fixtures.expiredAdmin.password);
    expect(response.status()).toBe(200);
    expect((await response.json()).user?.role).toBe("ORGANIZATION_ADMIN");
    await page.waitForURL((url) => url.pathname === "/org/dashboard", { timeout: 20_000 });
    const licenseResponse = await page.request.get("/api/backend/license-access");
    expect(licenseResponse.status()).toBe(200);
    const licenseBody = await licenseResponse.json();
    expect(licenseBody.license?.status).toBe("EXPIRED");
    expect(licenseBody.license?.canAccess).toBe(false);
    await expect(page.locator('[data-license-dialog="true"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your organization license has expired", exact: true })).toBeVisible();
  });

  test("LOGIN-NEGATIVE-026: the previously configured invalid-password account is rejected by the real backend", async ({ page }) => {
    const email = process.env.PW_INVALID_LOGIN_EMAIL?.trim();
    const password = process.env.PW_INVALID_LOGIN_PASSWORD;
    test.skip(!email || !password, "Configure a dedicated PW_INVALID_LOGIN_EMAIL and intentionally incorrect PW_INVALID_LOGIN_PASSWORD.");
    const response = await submitLogin(page, email!, password!);
    await expectLoginFailure(page, response, 401, "Invalid email or password");
  });
});

test.describe("Login and password recovery — complete regression suite", () => {
  test.beforeEach(async ({ page }) => openLogin(page));

  test("LOGIN-001: login screen renders the actual accessible controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(loginEmail(page)).toHaveAttribute("type", "email");
    await expect(loginEmail(page)).toHaveAttribute("required", "");
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
    await expect(loginPassword(page)).toHaveAttribute("required", "");
    await expect(page.getByRole("button", { name: "Sign in securely", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Forgot password?", exact: true })).toBeVisible();
    const loginFormMethod = await loginEmail(page).evaluate(
      (input: HTMLInputElement) => input.form?.method,
    );
    expect(loginFormMethod).toBe("post");
  });

  test("LOGIN-002: email and password are required by native form validation", async ({ page }) => {
    expect(await loginEmail(page).evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
    expect(await loginPassword(page).evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
    await expect(loginEmail(page)).toHaveAttribute("required", "");
    await expect(loginPassword(page)).toHaveAttribute("required", "");
  });

  test("LOGIN-003: malformed email is rejected before any login API request", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginEmail(page).fill("not-an-email");
    await loginPassword(page).fill("irrelevant-password");
    await loginPassword(page).press("Enter");
    await expect(page.getByText("Enter a valid email address, such as name@company.com.", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-004: empty credentials do not submit a login request", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
    await expect(loginEmail(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-005: password visibility toggle preserves its value", async ({ page }) => {
    const value = "Regression-Password-123!";
    const password = loginPassword(page);
    await password.fill(value);
    const showToggle = page.getByRole("button", { name: "Show password", exact: true });
    await expect(showToggle).toHaveAttribute("aria-pressed", "false");
    await showToggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(value);
    const hideToggle = page.getByRole("button", { name: "Hide password", exact: true });
    await expect(hideToggle).toHaveAttribute("aria-pressed", "true");
    await hideToggle.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue(value);
  });

  test("LOGIN-006: password field accepts keyboard text and editing", async ({ page }) => {
    const password = loginPassword(page);
    await password.focus();
    await password.pressSequentially("Keyboard-Entry-123!");
    await expect(password).toHaveValue("Keyboard-Entry-123!");
    await password.press("Control+A");
    await password.press("Backspace");
    await expect(password).toHaveValue("");
  });

  test("LOGIN-007: forgot-password navigation opens recovery form without submitting login", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginEmail(page).fill("person@example.com");
    await loginPassword(page).fill("not-submitted");
    await openRecovery(page);
    await expect(page.getByRole("button", { name: "Send reset instructions", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to sign in", exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-008: recovery email is populated in normalized lowercase form", async ({ page }) => {
    await loginEmail(page).fill(" User.Name@Example.com ");
    await openRecovery(page);
    await expect(recoveryEmail(page)).toHaveValue("user.name@example.com");
  });

  test("LOGIN-009: return to sign-in retains email and clears password", async ({ page }) => {
    await loginEmail(page).fill("person@example.com");
    await loginPassword(page).fill("temporary-secret");
    await openRecovery(page);
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(loginEmail(page)).toHaveValue("person@example.com");
    await expect(loginPassword(page)).toHaveValue("");
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
  });

  test("LOGIN-010: empty recovery email is blocked before backend request", async ({ page }) => {
    const requests = observeRequests(page, API.resetRequest);
    await openRecovery(page);
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    await expect(recoveryEmail(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-011: malformed recovery email is blocked before backend request", async ({ page }) => {
    const requests = observeRequests(page, API.resetRequest);
    await openRecovery(page);
    await recoveryEmail(page).fill("bad-address");
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    await expect(recoveryEmail(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-012: unknown recovery email receives the backend's generic response", async ({ page }) => {
    await openRecovery(page);
    await recoveryEmail(page).fill("pw-regression-no-account-2026@example.invalid");
    const response = await waitForRealPost(page, API.resetRequest, () =>
      page.getByRole("button", { name: "Send reset instructions", exact: true }).click(),
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      message: "If an account with that email address exists, password reset instructions will be sent.",
    });
    expect(JSON.stringify(body)).not.toContain("pw-regression-no-account-2026@example.invalid");
    await expect(appStatus(page, /if an account with that email address exists/i)).toBeVisible();
  });

  test("LOGIN-013: reset token opens reset form and is removed from visible URL", async ({ page }) => {
    await page.goto("/?token=playwright-regression-token&source=test");

    await waitForAuthHydration(page);
    await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
    await expect(newPassword(page)).toBeVisible();
    await expect(confirmNewPassword(page)).toBeVisible();
    await expect(page).toHaveURL(/\/\?source=test$/);
    await expect(page).not.toHaveURL(/token=/);
  });

  test("LOGIN-014: reset password visibility controls operate independently", async ({ page }) => {
    await page.goto("/?token=playwright-regression-token");

    await waitForAuthHydration(page);
    await newPassword(page).fill("First-Password-12345!");
    await confirmNewPassword(page).fill("First-Password-12345!");
    await page.getByRole("button", { name: "Show new password", exact: true }).click();
    await expect(newPassword(page)).toHaveAttribute("type", "text");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show confirmation password", exact: true }).click();
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide new password", exact: true }).click();
    await expect(newPassword(page)).toHaveAttribute("type", "password");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "text");
  });

  test("LOGIN-015: mismatched reset passwords are rejected client-side", async ({ page }) => {
    const requests = observeRequests(page, API.resetComplete);
    await page.goto("/?token=playwright-regression-token");

    await waitForAuthHydration(page);
    await newPassword(page).fill("First-Password-12345!");
    await confirmNewPassword(page).fill("Different-Password-12345!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(appAlert(page, "The passwords do not match.")).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-016: too-short reset password is rejected client-side", async ({ page }) => {
    const requests = observeRequests(page, API.resetComplete);
    await page.goto("/?token=playwright-regression-token");

    await waitForAuthHydration(page);
    await newPassword(page).fill("Short1!");
    await confirmNewPassword(page).fill("Short1!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(appAlert(page, "at least 15 characters")).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-017: whitespace-only reset password is rejected client-side", async ({ page }) => {
    const requests = observeRequests(page, API.resetComplete);
    await page.goto("/?token=playwright-regression-token");

    await waitForAuthHydration(page);
    const whitespace = "               ";
    await newPassword(page).fill(whitespace);
    await confirmNewPassword(page).fill(whitespace);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(appAlert(page, "cannot consist only of whitespace")).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-018: well-formed unknown reset token reaches backend and is rejected", async ({ page }) => {
    const token = freshResetToken();
    await page.goto(`/?token=${token}`);

    await waitForAuthHydration(page);
    await newPassword(page).fill("Valid-Regression-Password-2026!");
    await confirmNewPassword(page).fill("Valid-Regression-Password-2026!");
    const response = await waitForRealPost(page, API.resetComplete, () =>
      page.getByRole("button", { name: "Reset password", exact: true }).click(),
    );
    expect(response.status()).toBe(400);
    await expect(appAlert(page, /invalid or expired/i)).toBeVisible();
  });

  test("LOGIN-019: unauthenticated role session endpoints reject requests", async ({ page }) => {
    const endpoints = ["/api/backend/auth/me", "/api/backend/org/auth/me", "/api/backend/employee-auth/me"];
    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      expect([401, 403], `Unauthenticated request to ${endpoint}`).toContain(response.status());
    }
  });

  test("LOGIN-020: Ctrl+Enter uses the login form normal validation flow", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginEmail(page).fill("not-a-valid-email");
    await loginPassword(page).fill("temporary-value");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByText("Enter a valid email address, such as name@company.com.", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-021: recovery submits a normalized email to the actual backend", async ({ page }) => {
    await openRecovery(page);
    await recoveryEmail(page).fill("  PW-REGRESSION-MISSING-2026@EXAMPLE.INVALID  ");
    const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === API.resetRequest && request.method() === "POST");
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === API.resetRequest && response.request().method() === "POST");
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(request.postDataJSON()).toEqual({ email: "pw-regression-missing-2026@example.invalid" });
    expect(response.status()).toBe(200);
    await expect(appStatus(page, /if an account with that email address exists/i)).toBeVisible();
  });

  test("LOGIN-022: login and password-recovery forms use POST", async ({ page }) => {
    const loginMethod = await loginEmail(page).evaluate(
      (input: HTMLInputElement) => input.form?.method,
    );
    expect(loginMethod).toBe("post");

    await openRecovery(page);
    const recoveryMethod = await recoveryEmail(page).evaluate(
      (input: HTMLInputElement) => input.form?.method,
    );
    expect(recoveryMethod).toBe("post");

    await page.goto("/?token=playwright-regression-token");
    await waitForAuthHydration(page);
    const resetMethod = await newPassword(page).evaluate(
      (input: HTMLInputElement) => input.form?.method,
    );
    expect(resetMethod).toBe("post");
  });


  test("LOGIN-023: login fields expose their labels, autocomplete hints, and length limits", async ({ page }) => {
    await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute("id", "email");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("id", "password");
    await expect(loginEmail(page)).toHaveAttribute("name", "email");
    await expect(loginEmail(page)).toHaveAttribute("autocomplete", "username");
    await expect(loginEmail(page)).toHaveAttribute("maxlength", "254");
    await expect(loginPassword(page)).toHaveAttribute("name", "password");
    await expect(loginPassword(page)).toHaveAttribute("autocomplete", "current-password");
    await expect(loginPassword(page)).toHaveAttribute("maxlength", "1024");
  });

  test("LOGIN-024: inline email validation is associated with the field and clears after correction", async ({ page }) => {
    const email = loginEmail(page);
    const feedback = page.getByText(
      "Enter a valid email address, such as name@company.com.",
      { exact: true },
    );

    await email.fill("invalid-email");
    await loginPassword(page).focus();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", "email-feedback");
    await expect(feedback).toBeVisible();

    await email.fill("person@example.com");
    await expect(email).toHaveAttribute("aria-invalid", "false");
    await expect(email).not.toHaveAttribute("aria-describedby", "email-feedback");
    await expect(feedback).toHaveAttribute("aria-hidden", "true");
  });

  test("LOGIN-025: login password visibility controls do not submit the form", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    const password = loginPassword(page);
    await loginEmail(page).fill("person@example.com");
    await password.fill("Visibility-Regression-123!");

    const show = page.getByRole("button", { name: "Show password", exact: true });
    await expect(show).toHaveAttribute("type", "button");
    await show.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("Visibility-Regression-123!");

    const hide = page.getByRole("button", { name: "Hide password", exact: true });
    await expect(hide).toHaveAttribute("type", "button");
    await hide.click();
    await expect(password).toHaveAttribute("type", "password");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-026: opening recovery clears the password and resets password visibility", async ({ page }) => {
    await loginEmail(page).fill("person@example.com");
    await loginPassword(page).fill("Temporary-Visibility-123!");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(loginPassword(page)).toHaveAttribute("type", "text");

    await openRecovery(page);
    await expect(loginPassword(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();

    await expect(loginEmail(page)).toHaveValue("person@example.com");
    await expect(loginPassword(page)).toHaveValue("");
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Show password", exact: true }))
      .toHaveAttribute("aria-pressed", "false");
  });

  test("LOGIN-027: recovery email has an associated label and native email constraints", async ({ page }) => {
    await openRecovery(page);
    const email = page.getByLabel("Email address", { exact: true });
    await expect(email).toHaveAttribute("id", "reset-email");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(email).toHaveAttribute("required", "");
    await expect(email).toHaveAttribute("maxlength", "254");
    expect(await email.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  });

  test("LOGIN-028: recovery form submits when Enter is pressed and sends normalized JSON", async ({ page }) => {
    await openRecovery(page);
    const email = recoveryEmail(page);
    await email.fill("PW-REGRESSION-ENTER-2026@EXAMPLE.INVALID");

    const requestPromise = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === API.resetRequest &&
        request.method() === "POST",
    );
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === API.resetRequest &&
        response.request().method() === "POST",
    );

    await email.press("Enter");
    const [request, response] = await Promise.all([requestPromise, responsePromise]);

    expect(request.postDataJSON()).toEqual({
      email: "pw-regression-enter-2026@example.invalid",
    });
    expect(new URL(request.url()).search).toBe("");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.message).toBe(
      "If an account with that email address exists, password reset instructions will be sent.",
    );
  });

  test("LOGIN-029: reset form controls have the expected accessible labels and browser hints", async ({ page }) => {
    await openResetForm(page);
    await expect(page.getByLabel("New password", { exact: true })).toHaveAttribute("id", "new-password");
    await expect(page.getByLabel("Confirm new password", { exact: true })).toHaveAttribute("id", "confirm-new-password");
    await expect(newPassword(page)).toHaveAttribute("type", "password");
    await expect(newPassword(page)).toHaveAttribute("autocomplete", "new-password");
    await expect(newPassword(page)).toHaveAttribute("required", "");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "password");
    await expect(confirmNewPassword(page)).toHaveAttribute("autocomplete", "new-password");
    await expect(confirmNewPassword(page)).toHaveAttribute("required", "");
    await expect(page.getByRole("button", { name: "Show new password", exact: true })).toHaveAttribute("type", "button");
    await expect(page.getByRole("button", { name: "Show confirmation password", exact: true })).toHaveAttribute("type", "button");
    await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeEnabled();
  });

  test("LOGIN-030: empty reset fields are blocked by native required validation", async ({ page }) => {
    await openResetForm(page);
    const requests = observeRequests(page, API.resetComplete);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(newPassword(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-031: reset password exceeding bcrypt's 72-byte UTF-8 limit is blocked before the API call", async ({ page }) => {
    await openResetForm(page);
    const requests = observeRequests(page, API.resetComplete);
    const oversizedPassword = "😀".repeat(25);
    await newPassword(page).fill(oversizedPassword);
    await confirmNewPassword(page).fill(oversizedPassword);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(appAlert(page, /must not exceed 72 UTF-8 bytes/i)).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-032: backend rejects a common password even when the reset token is syntactically valid", async ({ page }) => {
    const token = freshResetToken();
    await openResetForm(page, token);
    const commonPassword = "passwordpassword";
    await newPassword(page).fill(commonPassword);
    await confirmNewPassword(page).fill(commonPassword);

    const response = await waitForRealPost(page, API.resetComplete, () =>
      page.getByRole("button", { name: "Reset password", exact: true }).click(),
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toBe("Choose a less common password that is harder to guess.");
    await expect(appAlert(page, "Choose a less common password that is harder to guess.")).toBeVisible();
  });

  test("LOGIN-033: backend rejects a malformed reset token", async ({ page }) => {
    await openResetForm(page, "malformed-token");
    const validPassword = "Valid-Regression-Password-2026!";
    await newPassword(page).fill(validPassword);
    await confirmNewPassword(page).fill(validPassword);

    const response = await waitForRealPost(page, API.resetComplete, () =>
      page.getByRole("button", { name: "Reset password", exact: true }).click(),
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/invalid or expired/i);
    await expect(appAlert(page, /invalid or expired/i)).toBeVisible();
  });

  test("LOGIN-034: reset validation feedback clears when the user corrects confirmation", async ({ page }) => {
    await openResetForm(page);
    await newPassword(page).fill("First-Password-12345!");
    await confirmNewPassword(page).fill("Different-Password-12345!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(appAlert(page, "The passwords do not match.")).toBeVisible();

    await confirmNewPassword(page).fill("First-Password-12345!");
    await expect(appAlert(page, "The passwords do not match.")).toHaveCount(0);
  });

  test("LOGIN-035: request-another-link action returns to recovery and discards reset-form state", async ({ page }) => {
    await openResetForm(page);
    await newPassword(page).fill("Temporary-Reset-Password-123!");
    await confirmNewPassword(page).fill("Temporary-Reset-Password-123!");

    await page.getByRole("button", { name: "Request another reset link", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
    await expect(recoveryEmail(page)).toBeVisible();
    await expect(newPassword(page)).toHaveCount(0);
    await expect(confirmNewPassword(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/token=/);
  });

  test("LOGIN-036: auth and password-reset endpoints reject cross-site and non-JSON mutations", async ({ page }) => {
    const origin = new URL(page.url()).origin;
    const endpoints = [
      { path: API.login, body: { email: "person@example.invalid", password: "irrelevant" } },
      { path: API.resetRequest, body: { email: "person@example.invalid" } },
      {
        path: API.resetComplete,
        body: {
          token: freshResetToken(),
          password: "Valid-Regression-Password-2026!",
          confirmPassword: "Valid-Regression-Password-2026!",
        },
      },
    ];

    for (const endpoint of endpoints) {
      const crossSiteResponse = await page.request.post(
        new URL(endpoint.path, page.url()).toString(),
        {
          data: endpoint.body,
          headers: {
            origin: "https://attacker.invalid",
            "sec-fetch-site": "cross-site",
          },
        },
      );
      expect(crossSiteResponse.status(), `Cross-site mutation rejected for ${endpoint.path}`).toBe(403);

      const nonJsonResponse = await page.request.post(
        new URL(endpoint.path, page.url()).toString(),
        {
          data: "{}",
          headers: {
            origin,
            "sec-fetch-site": "same-origin",
            "content-type": "text/plain",
          },
        },
      );
      expect(nonJsonResponse.status(), `Non-JSON mutation rejected for ${endpoint.path}`).toBe(415);
    }
  });



  // Additional UI, accessibility, navigation, and responsive regression cases.
  // Every selector below is based on the current JSX in frontend/app/page.tsx.

  test("LOGIN-037: email field receives focus after the login page hydrates", async ({ page }) => {
    await expect(page.locator('main[data-auth-hydrated="true"]')).toBeVisible();
    await expect(loginEmail(page)).toBeFocused();
  });

  test("LOGIN-038: the main authentication landmark exposes its hydration state", async ({ page }) => {
    await expect(page.locator("main")).toHaveAttribute("data-auth-hydrated", "true");
  });

  test("LOGIN-039: sign-in view renders one form only", async ({ page }) => {
    await expect(page.locator("form")).toHaveCount(1);
    await expect(loginEmail(page)).toBeVisible();
    await expect(loginPassword(page)).toBeVisible();
  });

  test("LOGIN-040: email label resolves to the unique login email input", async ({ page }) => {
    const labelledEmail = page.getByLabel("Email address", { exact: true });
    await expect(labelledEmail).toHaveCount(1);
    await expect(labelledEmail).toHaveAttribute("id", "email");
  });

  test("LOGIN-041: password label resolves to the unique login password input", async ({ page }) => {
    const labelledPassword = page.getByLabel("Password", { exact: true });
    await expect(labelledPassword).toHaveCount(1);
    await expect(labelledPassword).toHaveAttribute("id", "password");
  });

  test("LOGIN-042: login email exposes its placeholder and input-assistance settings", async ({ page }) => {
    await expect(loginEmail(page)).toHaveAttribute("placeholder", "you@company.com");
    await expect(loginEmail(page)).toHaveAttribute("autocapitalize", "none");
    await expect(loginEmail(page)).toHaveAttribute("spellcheck", "false");
  });

  test("LOGIN-043: login password exposes its placeholder and current-password autofill hint", async ({ page }) => {
    await expect(loginPassword(page)).toHaveAttribute("placeholder", "Enter your password");
    await expect(loginPassword(page)).toHaveAttribute("autocomplete", "current-password");
    await expect(loginPassword(page)).toHaveAttribute("maxlength", "1024");
  });

  test("LOGIN-044: sign-in control is an enabled submit button and is initially idle", async ({ page }) => {
    const submit = page.getByRole("button", { name: "Sign in securely", exact: true });
    await expect(submit).toHaveAttribute("type", "submit");
    await expect(submit).toHaveAttribute("aria-busy", "false");
    await expect(submit).toBeEnabled();
  });

  test("LOGIN-045: forgot-password navigation is a non-submitting button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Forgot password?", exact: true }))
      .toHaveAttribute("type", "button");
  });

  test("LOGIN-046: the secure same-origin credential explanation is visible", async ({ page }) => {
    await expect(page.getByText(
      "Your credentials are sent over the secure same-origin session.",
      { exact: false },
    )).toBeVisible();
  });

  test("LOGIN-047: the sign-in footer explains that workspace access depends on the account", async ({ page }) => {
    await expect(page.getByText(
      "Super Admin, Organization Admin, and employee access are determined by your account.",
      { exact: false },
    )).toBeVisible();
  });

  test("LOGIN-048: empty login fields fail their native required constraints", async ({ page }) => {
    expect(await loginEmail(page).evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    expect(await loginPassword(page).evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  });

  test("LOGIN-049: login email and password are attached to the same POST form", async ({ page }) => {
    const sameForm = await loginEmail(page).evaluate((email: HTMLInputElement) => {
      const password = document.querySelector<HTMLInputElement>("#password");
      return Boolean(email.form && password?.form === email.form && email.form.method === "post");
    });
    expect(sameForm).toBe(true);
  });

  test("LOGIN-050: inline email feedback exists but is hidden before validation", async ({ page }) => {
    const feedback = page.getByText(
      "Enter a valid email address, such as name@company.com.",
      { exact: true },
    );
    await expect(feedback).toHaveAttribute("id", "email-feedback");
    await expect(feedback).toHaveAttribute("aria-hidden", "true");
    await expect(loginEmail(page)).not.toHaveAttribute("aria-describedby", "email-feedback");
  });

  test("LOGIN-051: an email without a domain suffix shows accessible inline feedback", async ({ page }) => {
    await loginEmail(page).fill("person@company");
    await loginPassword(page).focus();
    await expect(loginEmail(page)).toHaveAttribute("aria-invalid", "true");
    await expect(loginEmail(page)).toHaveAttribute("aria-describedby", "email-feedback");
    await expect(page.getByText(
      "Enter a valid email address, such as name@company.com.",
      { exact: true },
    )).toBeVisible();
  });

  test("LOGIN-052: an email without a local part shows accessible inline feedback", async ({ page }) => {
    await loginEmail(page).fill("@example.com");
    await loginPassword(page).focus();
    await expect(loginEmail(page)).toHaveAttribute("aria-invalid", "true");
    await expect(loginEmail(page)).toHaveAttribute("aria-describedby", "email-feedback");
  });

  test("LOGIN-053: an email containing internal whitespace shows accessible inline feedback", async ({ page }) => {
    await loginEmail(page).fill("person name@example.com");
    await loginPassword(page).focus();
    await expect(loginEmail(page)).toHaveAttribute("aria-invalid", "true");
    await expect(loginEmail(page)).toHaveAttribute("aria-describedby", "email-feedback");
  });

  test("LOGIN-054: plus-addressed email with a multi-part domain passes local email validation", async ({ page }) => {
    const email = loginEmail(page);
    await email.fill("first.last+hr@example.co.rw");
    await loginPassword(page).focus();
    expect(await email.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
    await expect(email).toHaveAttribute("aria-invalid", "false");
    await expect(email).not.toHaveAttribute("aria-describedby", "email-feedback");
  });

  test("LOGIN-055: correcting an invalid email removes its inline error association", async ({ page }) => {
    const email = loginEmail(page);
    await email.fill("person@");
    await loginPassword(page).focus();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await email.fill("corrected@example.com");
    await expect(email).toHaveAttribute("aria-invalid", "false");
    await expect(email).not.toHaveAttribute("aria-describedby", "email-feedback");
  });

  test("LOGIN-056: email capitalization is preserved while the user edits the field", async ({ page }) => {
    await loginEmail(page).fill("UPPER.CASE@EXAMPLE.COM");
    await expect(loginEmail(page)).toHaveValue("UPPER.CASE@EXAMPLE.COM");
  });

  test("LOGIN-057: password visibility toggle responds to the Enter key", async ({ page }) => {
    const password = loginPassword(page);
    await password.fill("Keyboard-Toggle-Password-123!");
    const show = page.getByRole("button", { name: "Show password", exact: true });
    await show.press("Enter");
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("LOGIN-058: password visibility toggle responds to the Space key", async ({ page }) => {
    const password = loginPassword(page);
    await password.fill("Keyboard-Toggle-Password-123!");
    const show = page.getByRole("button", { name: "Show password", exact: true });
    await show.press("Space");
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("LOGIN-059: Caps Lock warning starts hidden while password guidance remains available", async ({ page }) => {
    await expect(page.getByText("Caps Lock is on", { exact: false }))
      .toHaveAttribute("aria-hidden", "true");
    await expect(page.getByText(
      "Use the password associated with your HRMS account.",
      { exact: false },
    )).toBeVisible();
  });

  test("LOGIN-060: recovery section is programmatically labelled by its heading", async ({ page }) => {
    await openRecovery(page);
    const section = page.locator('section[aria-labelledby="forgot-password-title"]');
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Forgot your password?", exact: true }))
      .toHaveAttribute("id", "forgot-password-title");
  });

  test("LOGIN-061: recovery instructions explain the generic account-recovery process", async ({ page }) => {
    await openRecovery(page);
    await expect(page.getByText(/Enter your work email\./)).toBeVisible();
    await expect(page.getByText(/If an account exists/)).toBeVisible();
  });

  test("LOGIN-062: recovery email shows the expected work-email placeholder", async ({ page }) => {
    await openRecovery(page);
    await expect(recoveryEmail(page)).toHaveAttribute("placeholder", "you@company.com");
  });

  test("LOGIN-063: recovery email exposes its field name and browser input hints", async ({ page }) => {
    await openRecovery(page);
    await expect(recoveryEmail(page)).toHaveAttribute("name", "resetEmail");
    await expect(recoveryEmail(page)).toHaveAttribute("autocomplete", "email");
    await expect(recoveryEmail(page)).toHaveAttribute("autocapitalize", "none");
    await expect(recoveryEmail(page)).toHaveAttribute("spellcheck", "false");
  });

  test("LOGIN-064: Send reset instructions is a submit control", async ({ page }) => {
    await openRecovery(page);
    await expect(page.getByRole("button", { name: "Send reset instructions", exact: true }))
      .toHaveAttribute("type", "submit");
  });

  test("LOGIN-065: recovery submit control starts enabled and not busy", async ({ page }) => {
    await openRecovery(page);
    const submit = page.getByRole("button", { name: "Send reset instructions", exact: true });
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveAttribute("aria-busy", "false");
  });

  test("LOGIN-066: Back to sign in is a non-submitting recovery control", async ({ page }) => {
    await openRecovery(page);
    await expect(page.getByRole("button", { name: "Back to sign in", exact: true }))
      .toHaveAttribute("type", "button");
  });

  test("LOGIN-067: recovery mode announces its initial Account recovery status", async ({ page }) => {
    await openRecovery(page);
    const section = page.locator('section[aria-labelledby="forgot-password-title"]');
    await expect(section.getByRole("status")).toContainText("Account recovery");
  });

  test("LOGIN-068: recovery mode does not render login or reset-password fields", async ({ page }) => {
    await openRecovery(page);
    await expect(recoveryEmail(page)).toBeVisible();
    await expect(loginEmail(page)).toHaveCount(0);
    await expect(loginPassword(page)).toHaveCount(0);
    await expect(newPassword(page)).toHaveCount(0);
    await expect(confirmNewPassword(page)).toHaveCount(0);
  });

  test("LOGIN-069: recovery mode renders exactly one form", async ({ page }) => {
    await openRecovery(page);
    await expect(page.locator("form")).toHaveCount(1);
  });

  test("LOGIN-070: returning from recovery restores login and clears its password", async ({ page }) => {
    await loginEmail(page).fill("person@example.com");
    await loginPassword(page).fill("Temporary-Password-123!");
    await openRecovery(page);
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await expect(loginEmail(page)).toHaveValue("person@example.com");
    await expect(loginPassword(page)).toHaveValue("");
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
  });

  test("LOGIN-071: recovery entry prepopulates a trimmed lowercase login email", async ({ page }) => {
    await loginEmail(page).fill(" User.Name@Example.com ");
    await openRecovery(page);
    await expect(recoveryEmail(page)).toHaveValue("user.name@example.com");
  });

  test("LOGIN-072: opening recovery removes login-only inline email feedback", async ({ page }) => {
    await loginEmail(page).fill("not-an-email");
    await loginPassword(page).focus();
    await expect(page.getByText(
      "Enter a valid email address, such as name@company.com.",
      { exact: true },
    )).toBeVisible();
    await openRecovery(page);
    await expect(page.getByText(
      "Enter a valid email address, such as name@company.com.",
      { exact: true },
    )).toHaveCount(0);
    await expect(recoveryEmail(page)).toHaveValue("not-an-email");
  });

  test("LOGIN-073: reset section is programmatically labelled by its heading", async ({ page }) => {
    await openResetForm(page);
    const section = page.locator('section[aria-labelledby="reset-password-title"]');
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Choose a new password", exact: true }))
      .toHaveAttribute("id", "reset-password-title");
  });

  test("LOGIN-074: reset instructions state the single-use and 30-minute link limits", async ({ page }) => {
    await openResetForm(page);
    await expect(page.getByText(/This link can be used only once/)).toBeVisible();
    await expect(page.getByText(/expires after 30 minutes/)).toBeVisible();
  });

  test("LOGIN-075: new-password field exposes the expected placeholder", async ({ page }) => {
    await openResetForm(page);
    await expect(newPassword(page)).toHaveAttribute("placeholder", "Enter a new password");
  });

  test("LOGIN-076: confirmation field exposes the expected placeholder", async ({ page }) => {
    await openResetForm(page);
    await expect(confirmNewPassword(page)).toHaveAttribute("placeholder", "Re-enter your new password");
  });

  test("LOGIN-077: reset inputs expose the expected form field names", async ({ page }) => {
    await openResetForm(page);
    await expect(newPassword(page)).toHaveAttribute("name", "newPassword");
    await expect(confirmNewPassword(page)).toHaveAttribute("name", "confirmNewPassword");
  });

  test("LOGIN-078: both reset fields request new-password autofill", async ({ page }) => {
    await openResetForm(page);
    await expect(newPassword(page)).toHaveAttribute("autocomplete", "new-password");
    await expect(confirmNewPassword(page)).toHaveAttribute("autocomplete", "new-password");
  });

  test("LOGIN-079: reset fields are required, initially empty, and masked", async ({ page }) => {
    await openResetForm(page);
    await expect(newPassword(page)).toHaveAttribute("required", "");
    await expect(confirmNewPassword(page)).toHaveAttribute("required", "");
    await expect(newPassword(page)).toHaveValue("");
    await expect(confirmNewPassword(page)).toHaveValue("");
    await expect(newPassword(page)).toHaveAttribute("type", "password");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "password");
  });

  test("LOGIN-080: reset form uses POST rather than a query-string submission", async ({ page }) => {
    await openResetForm(page);
    const method = await newPassword(page).evaluate(
      (input: HTMLInputElement) => input.form?.method,
    );
    expect(method).toBe("post");
  });

  test("LOGIN-081: reset submit control starts enabled and not busy", async ({ page }) => {
    await openResetForm(page);
    const submit = page.getByRole("button", { name: "Reset password", exact: true });
    await expect(submit).toHaveAttribute("type", "submit");
    await expect(submit).toHaveAttribute("aria-busy", "false");
    await expect(submit).toBeEnabled();
  });

  test("LOGIN-082: Request another reset link is a non-submitting button", async ({ page }) => {
    await openResetForm(page);
    await expect(page.getByRole("button", { name: "Request another reset link", exact: true }))
      .toHaveAttribute("type", "button");
  });

  test("LOGIN-083: reset Back to sign in is a non-submitting button", async ({ page }) => {
    await openResetForm(page);
    await expect(page.getByRole("button", { name: "Back to sign in", exact: true }))
      .toHaveAttribute("type", "button");
  });

  test("LOGIN-084: reset password policy guidance mentions the character and byte limits", async ({ page }) => {
    await openResetForm(page);
    await expect(page.getByText(/Use at least 15 characters/)).toBeVisible();
    await expect(page.getByText(/bcrypt’s 72-byte UTF-8 limit/)).toBeVisible();
    await expect(page.getByText(/Avoid common passwords/)).toBeVisible();
  });

  test("LOGIN-085: removing a reset token preserves unrelated query parameters and the URL fragment", async ({ page }) => {
    const token = freshResetToken();
    await page.goto("/?keep=1&token=" + token + "#reset");
    await waitForAuthHydration(page);
    await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.get("keep")).toBe("1");
    expect(currentUrl.searchParams.has("token")).toBe(false);
    expect(currentUrl.hash).toBe("#reset");
  });

  test("LOGIN-086: one-time reset token is not rendered in the page body", async ({ page }) => {
    const token = freshResetToken();
    await openResetForm(page, token);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(token);
    expect(new URL(page.url()).searchParams.has("token")).toBe(false);
  });

  test("LOGIN-087: reset view does not render login or recovery email fields", async ({ page }) => {
    await openResetForm(page);
    await expect(newPassword(page)).toBeVisible();
    await expect(confirmNewPassword(page)).toBeVisible();
    await expect(loginEmail(page)).toHaveCount(0);
    await expect(loginPassword(page)).toHaveCount(0);
    await expect(recoveryEmail(page)).toHaveCount(0);
  });

  test("LOGIN-088: reset visibility controls start masked and expose false pressed states", async ({ page }) => {
    await openResetForm(page);
    await expect(newPassword(page)).toHaveAttribute("type", "password");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Show new password", exact: true }))
      .toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Show confirmation password", exact: true }))
      .toHaveAttribute("aria-pressed", "false");
  });

  test("LOGIN-089: new-password visibility responds to the Enter key", async ({ page }) => {
    await openResetForm(page);
    const show = page.getByRole("button", { name: "Show new password", exact: true });
    await show.press("Enter");
    await expect(newPassword(page)).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide new password", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("LOGIN-090: confirmation-password visibility responds to the Space key", async ({ page }) => {
    await openResetForm(page);
    const show = page.getByRole("button", { name: "Show confirmation password", exact: true });
    await show.press("Space");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide confirmation password", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("LOGIN-091: reset field values survive showing and hiding both passwords", async ({ page }) => {
    await openResetForm(page);
    await newPassword(page).fill("First-Unique-Reset-Password-2026!");
    await confirmNewPassword(page).fill("Second-Unique-Reset-Password-2026!");

    await page.getByRole("button", { name: "Show new password", exact: true }).click();
    await page.getByRole("button", { name: "Show confirmation password", exact: true }).click();
    await page.getByRole("button", { name: "Hide new password", exact: true }).click();
    await page.getByRole("button", { name: "Hide confirmation password", exact: true }).click();

    await expect(newPassword(page)).toHaveValue("First-Unique-Reset-Password-2026!");
    await expect(confirmNewPassword(page)).toHaveValue("Second-Unique-Reset-Password-2026!");
    await expect(newPassword(page)).toHaveAttribute("type", "password");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "password");
  });

  test("LOGIN-092: reset visibility toggles remain independent for their respective fields", async ({ page }) => {
    await openResetForm(page);
    await newPassword(page).fill("New-Password-Value-2026!");
    await confirmNewPassword(page).fill("Confirm-Password-Value-2026!");

    await page.getByRole("button", { name: "Show new password", exact: true }).click();
    await expect(newPassword(page)).toHaveAttribute("type", "text");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show confirmation password", exact: true }).click();
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide new password", exact: true }).click();
    await expect(newPassword(page)).toHaveAttribute("type", "password");
    await expect(confirmNewPassword(page)).toHaveAttribute("type", "text");
  });

  test("LOGIN-093: leaving password reset returns to login and clears reset form state", async ({ page }) => {
    await openResetForm(page);
    await newPassword(page).fill("Temporary-New-Password-2026!");
    await confirmNewPassword(page).fill("Temporary-New-Password-2026!");
    await page.getByRole("button", { name: "Show new password", exact: true }).click();

    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(loginEmail(page)).toBeVisible();
    await expect(loginPassword(page)).toHaveValue("");
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
    await expect(newPassword(page)).toHaveCount(0);
    await expect(confirmNewPassword(page)).toHaveCount(0);
  });

  test("LOGIN-094: login, recovery, and reset controls remain usable at a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const noHorizontalOverflow = async () => {
      const dimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    };

    await noHorizontalOverflow();
    await expect(loginEmail(page)).toBeVisible();
    await expect(loginPassword(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in securely", exact: true })).toBeVisible();

    await openRecovery(page);
    await noHorizontalOverflow();
    await expect(recoveryEmail(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset instructions", exact: true })).toBeVisible();

    await openResetForm(page);
    await noHorizontalOverflow();
    await expect(newPassword(page)).toBeVisible();
    await expect(confirmNewPassword(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeVisible();
  });


});
