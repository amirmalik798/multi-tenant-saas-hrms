import { randomBytes } from "node:crypto";
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
  await expect(loginPassword(page)).toHaveValue(password);
  expect(await loginEmail(page).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  const submit = page.getByRole("button", { name: "Sign in securely", exact: true });
  await expect(submit).toBeEnabled();
  const response = await waitForRealPost(page, API.login, () => submit.click());
  const currentUrl = new URL(page.url());
  expect(currentUrl.searchParams.has("email")).toBe(false);
  expect(currentUrl.searchParams.has("password")).toBe(false);
  return response;
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

  for (const credentials of roleCredentials) {
    test(`LOGIN-ROLE-${credentials.role}: real credential is checked by backend database and workspace session`, async ({ page }) => {
      const email = process.env[credentials.emailEnv]?.trim();
      const password = process.env[credentials.passwordEnv];
      test.skip(!email || !password, `Set ${credentials.emailEnv} and ${credentials.passwordEnv} to enable this real database-backed login test.`);

      // Register before submitting: the page immediately calls its role-specific
      // session endpoint after the login endpoint succeeds.
      const sessionResponsePromise = page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === credentials.sessionCheck &&
          candidate.request().method() === "GET",
        { timeout: 20_000 },
      );

      const response = await submitLogin(page, email!, password!);
      const loginRequest = response.request();
      const loginPayload = loginRequest.postDataJSON() as {
        email?: string;
        password?: string;
      };
      expect(loginRequest.headers()["content-type"]).toContain("application/json");
      expect(loginPayload.email).toBe(email!.trim().toLowerCase());
      expect(typeof loginPayload.password).toBe("string");
      expect(loginPayload.password?.length).toBe(password!.length);
      // Compare secrets as booleans so a failing assertion never prints a password.
      expect(loginPayload.password === password!).toBe(true);
      const requestUrl = new URL(loginRequest.url());
      expect(requestUrl.searchParams.has("email")).toBe(false);
      expect(requestUrl.searchParams.has("password")).toBe(false);

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
      const sessionResponse = await sessionResponsePromise;
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
      const cookies = await page.context().cookies();
      const roleCookieNames = ["crm_admin_session", "crm_org_session", "crm_employee_session"];
      const issuedRoleCookies = cookies
        .filter((item) => roleCookieNames.includes(item.name))
        .map((item) => item.name);
      expect(issuedRoleCookies).toEqual([credentials.sessionCookie]);

      const cookie = cookies.find((item) => item.name === credentials.sessionCookie);
      expect(cookie, `Expected the actual ${credentials.role} session cookie`).toBeTruthy();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.path).toBe("/");
      expect(cookie?.sameSite).toBe("Lax");

      // Re-check the session through the actual endpoint after the redirect.
      const persistedSessionResponse = await page.request.get(
        new URL(credentials.sessionCheck, page.url()).toString(),
      );
      expect(persistedSessionResponse.status()).toBe(200);
      const persistedSession = await persistedSessionResponse.json();
      expect(persistedSession.authenticated).toBe(true);
      expect(persistedSession.user?.role).toBe(credentials.role);
    });
  }

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

  test("LOGIN-NEGATIVE-001: dedicated invalid password is rejected by real backend", async ({ page }) => {
    const email = process.env.PW_INVALID_LOGIN_EMAIL?.trim();
    const password = process.env.PW_INVALID_LOGIN_PASSWORD;
    test.skip(!email || !password, "Configure a dedicated PW_INVALID_LOGIN_EMAIL and intentionally incorrect PW_INVALID_LOGIN_PASSWORD.");

    const response = await submitLogin(page, email!, password!);
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBe("Invalid email or password");
    await expect(appAlert(page, "Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
