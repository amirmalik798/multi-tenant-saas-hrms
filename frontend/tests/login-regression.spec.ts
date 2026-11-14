import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * Unified login and password-recovery regression suite.
 *
 * UI assertions use the actual accessible labels and button names in
 * frontend/app/page.tsx. No route interception, API mocking, or DB stubs
 * are used. Tests requiring service calls wait for the real proxied API.
 *
 * Run from frontend:
 *   npx playwright test tests/login-regression.spec.ts --project=chromium --workers=1
 */

const API = {
  login: "/api/backend/unified-auth/login",
  resetRequest: "/api/backend/password-reset/request",
  resetComplete: "/api/backend/password-reset/complete",
} as const;

type RoleCredentials = {
  role: "SUPER_ADMIN" | "ORGANIZATION_ADMIN" | "HR_MANAGER" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
  emailEnv: string;
  passwordEnv: string;
  destination: string;
  sessionCookie: string;
  sessionCheck: string;
};

const roleCredentials: RoleCredentials[] = [
  {
    role: "SUPER_ADMIN",
    emailEnv: "PW_SUPER_ADMIN_EMAIL",
    passwordEnv: "PW_SUPER_ADMIN_PASSWORD",
    destination: "/dashboard",
    sessionCookie: "crm_admin_session",
    sessionCheck: "/api/backend/auth/me",
  },
  {
    role: "ORGANIZATION_ADMIN",
    emailEnv: "PW_ORG_ADMIN_EMAIL",
    passwordEnv: "PW_ORG_ADMIN_PASSWORD",
    destination: "/org/dashboard",
    sessionCookie: "crm_org_session",
    sessionCheck: "/api/backend/org/auth/me",
  },
  {
    role: "HR_MANAGER",
    emailEnv: "PW_HR_MANAGER_EMAIL",
    passwordEnv: "PW_HR_MANAGER_PASSWORD",
    destination: "/employee/welcome",
    sessionCookie: "crm_employee_session",
    sessionCheck: "/api/backend/employee-auth/me",
  },
  {
    role: "DEPARTMENT_MANAGER",
    emailEnv: "PW_DEPARTMENT_MANAGER_EMAIL",
    passwordEnv: "PW_DEPARTMENT_MANAGER_PASSWORD",
    destination: "/employee/welcome",
    sessionCookie: "crm_employee_session",
    sessionCheck: "/api/backend/employee-auth/me",
  },
  {
    role: "EMPLOYEE",
    emailEnv: "PW_EMPLOYEE_EMAIL",
    passwordEnv: "PW_EMPLOYEE_PASSWORD",
    destination: "/employee/welcome",
    sessionCookie: "crm_employee_session",
    sessionCheck: "/api/backend/employee-auth/me",
  },
];

const loginEmail = (page: Page) => page.locator("#email");
const loginPassword = (page: Page) => page.locator("#password");
const recoveryEmail = (page: Page) => page.locator("#reset-email");
const newPassword = (page: Page) => page.locator("#new-password");
const confirmNewPassword = (page: Page) => page.locator("#confirm-new-password");

async function openLogin(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(loginEmail(page)).toBeVisible();
  await expect(loginPassword(page)).toBeVisible();
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
  await expect(loginPassword(page)).toHaveValue(password);
  expect(await loginEmail(page).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  const submit = page.getByRole("button", { name: "Sign in securely", exact: true });
  await expect(submit).toBeEnabled();
  return waitForRealPost(page, API.login, () => submit.click());
}

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
    await loginPassword(page).fill(value);
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(loginPassword(page)).toHaveAttribute("type", "text");
    await expect(loginPassword(page)).toHaveValue(value);
    await expect(page.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hide password", exact: true }).click();
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
    await expect(loginPassword(page)).toHaveValue(value);
  });

  test("LOGIN-006: password field remains usable with keyboard modifiers", async ({ page }) => {
    await loginPassword(page).focus();
    await loginPassword(page).press("Shift+A");
    await expect(loginPassword(page)).toHaveValue("A");
  });

  test("LOGIN-007: forgot-password navigation opens recovery form without submitting login", async ({ page }) => {
    const requests = observeRequests(page, API.login);
    await loginEmail(page).fill("person@example.com");
    await loginPassword(page).fill("not-submitted");
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
    await expect(recoveryEmail(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset instructions", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to sign in", exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-008: recovery email is populated in normalized lowercase form", async ({ page }) => {
    await loginEmail(page).fill(" User.Name@Example.com ");
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await expect(recoveryEmail(page)).toHaveValue("user.name@example.com");
  });

  test("LOGIN-009: return to sign-in retains email and clears password", async ({ page }) => {
    await loginEmail(page).fill("person@example.com");
    await loginPassword(page).fill("temporary-secret");
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(loginEmail(page)).toHaveValue("person@example.com");
    await expect(loginPassword(page)).toHaveValue("");
    await expect(loginPassword(page)).toHaveAttribute("type", "password");
  });

  test("LOGIN-010: empty recovery email is blocked before backend request", async ({ page }) => {
    const requests = observeRequests(page, API.resetRequest);
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    await expect(recoveryEmail(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-011: malformed recovery email is blocked before backend request", async ({ page }) => {
    const requests = observeRequests(page, API.resetRequest);
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await recoveryEmail(page).fill("bad-address");
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    await expect(recoveryEmail(page)).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-012: unknown recovery email receives the backend's generic response", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await recoveryEmail(page).fill("pw-regression-no-account-2026@example.invalid");
    const response = await waitForRealPost(page, API.resetRequest, () =>
      page.getByRole("button", { name: "Send reset instructions", exact: true }).click(),
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    await expect(page.getByRole("status")).toContainText(/if an account with that email address exists/i);
  });

  test("LOGIN-013: reset token opens reset form and is removed from visible URL", async ({ page }) => {
    await page.goto("/?token=playwright-regression-token&source=test");
    await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
    await expect(newPassword(page)).toBeVisible();
    await expect(confirmNewPassword(page)).toBeVisible();
    await expect(page).toHaveURL(/\/\?source=test$/);
    await expect(page).not.toHaveURL(/token=/);
  });

  test("LOGIN-014: reset password visibility controls operate independently", async ({ page }) => {
    await page.goto("/?token=playwright-regression-token");
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
    await newPassword(page).fill("First-Password-12345!");
    await confirmNewPassword(page).fill("Different-Password-12345!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("The passwords do not match.");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-016: too-short reset password is rejected client-side", async ({ page }) => {
    const requests = observeRequests(page, API.resetComplete);
    await page.goto("/?token=playwright-regression-token");
    await newPassword(page).fill("Short1!");
    await confirmNewPassword(page).fill("Short1!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("at least 15 characters");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-017: whitespace-only reset password is rejected client-side", async ({ page }) => {
    const requests = observeRequests(page, API.resetComplete);
    await page.goto("/?token=playwright-regression-token");
    const whitespace = "               ";
    await newPassword(page).fill(whitespace);
    await confirmNewPassword(page).fill(whitespace);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("cannot consist only of whitespace");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-018: well-formed unknown reset token reaches backend and is rejected", async ({ page }) => {
    await page.goto("/?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await newPassword(page).fill("Valid-Regression-Password-2026!");
    await confirmNewPassword(page).fill("Valid-Regression-Password-2026!");
    const response = await waitForRealPost(page, API.resetComplete, () =>
      page.getByRole("button", { name: "Reset password", exact: true }).click(),
    );
    expect(response.status()).toBe(400);
    await expect(page.getByRole("alert")).toContainText(/invalid or expired/i);
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
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await recoveryEmail(page).fill("  PW-REGRESSION-MISSING-2026@EXAMPLE.INVALID  ");
    const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === API.resetRequest && request.method() === "POST");
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === API.resetRequest && response.request().method() === "POST");
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(request.postDataJSON()).toEqual({ email: "pw-regression-missing-2026@example.invalid" });
    expect(response.status()).toBe(200);
    await expect(page.getByRole("status")).toContainText(/if an account with that email address exists/i);
  });

  for (const credentials of roleCredentials) {
    test(`LOGIN-ROLE-${credentials.role}: real credential is checked by backend database and workspace session`, async ({ page }) => {
      const email = process.env[credentials.emailEnv]?.trim();
      const password = process.env[credentials.passwordEnv];
      test.skip(!email || !password, `Set ${credentials.emailEnv} and ${credentials.passwordEnv} to enable this real database-backed login test.`);

      const response = await submitLogin(page, email!, password!);
      const responseText = await response.text();
      expect(response.status(), `Real login endpoint response for ${credentials.role}: ${responseText}`).toBe(200);
      const body = JSON.parse(responseText) as {
        status?: string;
        destination?: string;
        user?: { role?: string; organizationId?: string | null; employeeId?: string | null };
      };
      expect(body.status).toBe("ok");
      expect(body.user?.role).toBe(credentials.role);
      expect(body.destination).toBe(credentials.destination);

      // The page independently verifies the role-specific session with the real API.
      const sessionResponse = await page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === credentials.sessionCheck &&
          candidate.request().method() === "GET",
        { timeout: 15_000 },
      );
      expect(sessionResponse.status()).toBe(200);
      const sessionBody = await sessionResponse.json();
      expect(sessionBody.authenticated).toBe(true);
      expect(sessionBody.user?.role).toBe(credentials.role);
      if (credentials.role !== "SUPER_ADMIN") {
        expect(sessionBody.user?.organizationId).toBe(body.user?.organizationId);
      }
      if (["HR_MANAGER", "DEPARTMENT_MANAGER", "EMPLOYEE"].includes(credentials.role)) {
        expect(sessionBody.user?.employeeId).toBe(body.user?.employeeId);
      }

      await page.waitForURL((url) => url.pathname === credentials.destination, { timeout: 20_000 });
      const cookie = (await page.context().cookies()).find((item) => item.name === credentials.sessionCookie);
      expect(cookie, `Expected the actual ${credentials.role} session cookie`).toBeTruthy();
      expect(cookie?.httpOnly).toBe(true);
    });
  }

  test("LOGIN-NEGATIVE-001: dedicated invalid password is rejected by real backend", async ({ page }) => {
    const email = process.env.PW_INVALID_LOGIN_EMAIL?.trim();
    const password = process.env.PW_INVALID_LOGIN_PASSWORD;
    test.skip(!email || !password, "Configure a dedicated PW_INVALID_LOGIN_EMAIL and intentionally incorrect PW_INVALID_LOGIN_PASSWORD.");

    const response = await submitLogin(page, email!, password!);
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBe("Invalid email or password");
    await expect(page.getByRole("alert")).toContainText("Invalid email or password");
    await expect(page).toHaveURL(/\/$/);
  });
});
