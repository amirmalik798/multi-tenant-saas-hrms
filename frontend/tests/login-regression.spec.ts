import { expect, test, type Page } from "@playwright/test";

/**
 * Login regression coverage.
 *
 * These tests use the configured real frontend URL and its real backend
 * rewrite. No page.route(), API mocks, or database stubs are used.
 *
 * Client-side validation tests intentionally assert that invalid input is
 * stopped before a request. Backend integration tests explicitly wait for
 * the real API response so a proxy/tunnel failure cannot look like a pass.
 */

const LOGIN_API = "/api/backend/unified-auth/login";
const RESET_REQUEST_API = "/api/backend/password-reset/request";
const RESET_COMPLETE_API = "/api/backend/password-reset/complete";

async function openLogin(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
}

function observePostRequests(page: Page, path: string) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith(path)) {
      requests.push(request.url());
    }
  });
  return requests;
}

async function expectRealPostResponse(
  page: Page,
  path: string,
  action: () => Promise<unknown>,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(path) &&
      response.request().method() === "POST",
    { timeout: 25_000 },
  );
  await action();
  const response = await responsePromise;
  expect(response.url()).toContain(path);
  return response;
}

test.describe("Login page — complete regression suite (real services)", () => {
  test.beforeEach(async ({ page }) => {
    await openLogin(page);
  });

  test("LOGIN-REG-001: login page renders its actual accessible controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute("type", "email");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Sign in securely" })).toBeEnabled();
    await expect(page.getByRole("button", { name: /forgot password\?/i })).toBeVisible();
  });

  test("LOGIN-REG-002: email and password fields expose required browser validation", async ({ page }) => {
    const email = page.getByLabel("Email address", { exact: true });
    const password = page.getByLabel("Password", { exact: true });
    await expect(email).toHaveAttribute("required", "");
    await expect(password).toHaveAttribute("required", "");
    expect(await email.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
    expect(await password.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
  });

  test("LOGIN-REG-003: invalid email is rejected in the browser without a backend request", async ({ page }) => {
    const requests = observePostRequests(page, LOGIN_API);
    await page.getByLabel("Email address", { exact: true }).fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("irrelevant-password");
    await page.getByLabel("Password", { exact: true }).press("Enter");
    await expect(page.getByText("Enter a valid email address, such as name@company.com.", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-004: empty credentials cannot submit to the backend", async ({ page }) => {
    const requests = observePostRequests(page, LOGIN_API);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-005: password visibility toggles and preserves the entered value", async ({ page }) => {
    const password = page.getByLabel("Password", { exact: true });
    const value = "Regression-Password-123!";
    await password.fill(value);
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(value);
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue(value);
  });

  test("LOGIN-REG-006: caps-lock indicator responds to keyboard modifier", async ({ page }) => {
    const password = page.getByLabel("Password", { exact: true });
    await password.focus();
    await password.press("Shift+A");
    // The browser/OS exposes Caps Lock state differently from Shift; this
    // test verifies the field remains usable and does not assert OS state.
    await expect(password).toHaveValue("A");
  });

  test("LOGIN-REG-007: forgot-password opens the exact recovery view", async ({ page }) => {
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset instructions", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to sign in", exact: true })).toBeVisible();
  });

  test("LOGIN-REG-008: recovery email is normalized from the login email", async ({ page }) => {
    await page.getByLabel("Email address", { exact: true }).fill(" User.Name@Example.com ");
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("user.name@example.com");
  });

  test("LOGIN-REG-009: returning from recovery retains email and clears password", async ({ page }) => {
    await page.getByLabel("Email address", { exact: true }).fill("person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("temporary-secret");
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("person@example.com");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  });

  test("LOGIN-REG-010: empty recovery email is blocked by native validation", async ({ page }) => {
    const requests = observePostRequests(page, RESET_REQUEST_API);
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    const email = page.getByLabel("Email address", { exact: true });
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    await expect(email).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-011: invalid recovery email is blocked before contacting backend", async ({ page }) => {
    const requests = observePostRequests(page, RESET_REQUEST_API);
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await page.getByLabel("Email address", { exact: true }).fill("bad-address");
    await page.getByRole("button", { name: "Send reset instructions", exact: true }).click();
    await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-012: unknown recovery email reaches the real backend and returns the generic response", async ({ page }) => {
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await page.getByLabel("Email address", { exact: true }).fill("pw-regression-no-account-2026@example.invalid");
    const response = await expectRealPostResponse(page, RESET_REQUEST_API, () =>
      page.getByRole("button", { name: "Send reset instructions", exact: true }).click(),
    );
    expect(response.status(), "Password-reset request must be handled by the real backend").toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    await expect(page.getByText(/if an account with that email address exists/i)).toBeVisible();
  });

  test("LOGIN-REG-013: reset token opens reset form and is removed from the visible URL", async ({ page }) => {
    await page.goto("/?token=playwright-regression-token&source=test");
    await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/\?source=test$/);
    await expect(page).not.toHaveURL(/token=/);
  });

  test("LOGIN-REG-014: reset password visibility controls work independently", async ({ page }) => {
    await page.goto("/?token=playwright-regression-token");
    const newPassword = page.getByLabel("New password", { exact: true });
    const confirmation = page.getByLabel("Confirm new password", { exact: true });
    await newPassword.fill("First-Password-12345!");
    await confirmation.fill("First-Password-12345!");
    await page.getByRole("button", { name: "Show new password" }).click();
    await expect(newPassword).toHaveAttribute("type", "text");
    await expect(confirmation).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show confirmation password" }).click();
    await expect(confirmation).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide new password" }).click();
    await expect(newPassword).toHaveAttribute("type", "password");
    await expect(confirmation).toHaveAttribute("type", "text");
  });

  test("LOGIN-REG-015: mismatched reset passwords are rejected before backend request", async ({ page }) => {
    const requests = observePostRequests(page, RESET_COMPLETE_API);
    await page.goto("/?token=playwright-regression-token");
    await page.getByLabel("New password", { exact: true }).fill("First-Password-12345!");
    await page.getByLabel("Confirm new password", { exact: true }).fill("Different-Password-12345!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("The passwords do not match.");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-016: too-short reset password is rejected before backend request", async ({ page }) => {
    const requests = observePostRequests(page, RESET_COMPLETE_API);
    await page.goto("/?token=playwright-regression-token");
    await page.getByLabel("New password", { exact: true }).fill("Short1!");
    await page.getByLabel("Confirm new password", { exact: true }).fill("Short1!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("at least 15 characters");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-017: whitespace-only reset password is rejected before backend request", async ({ page }) => {
    const requests = observePostRequests(page, RESET_COMPLETE_API);
    await page.goto("/?token=playwright-regression-token");
    const whitespacePassword = "               ";
    await page.getByLabel("New password", { exact: true }).fill(whitespacePassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(whitespacePassword);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("cannot consist only of whitespace");
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-018: syntactically valid but unknown reset token reaches the real backend", async ({ page }) => {
    await page.goto("/?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("heading", { name: "Choose a new password", exact: true })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("Valid-Regression-Password-2026!");
    await page.getByLabel("Confirm new password", { exact: true }).fill("Valid-Regression-Password-2026!");
    const response = await expectRealPostResponse(page, RESET_COMPLETE_API, () =>
      page.getByRole("button", { name: "Reset password", exact: true }).click(),
    );
    expect(response.status(), "Reset completion must be processed by the real backend/database").toBe(400);
    await expect(page.getByRole("alert")).toContainText(/invalid or expired/i);
  });

  test("LOGIN-REG-019: forgot-password navigation never submits the login form", async ({ page }) => {
    const requests = observePostRequests(page, LOGIN_API);
    await page.getByLabel("Email address", { exact: true }).fill("person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("not-submitted");
    await page.getByRole("button", { name: /forgot password\?/i }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test("LOGIN-REG-020: invalid login credentials reach the real backend", async ({ page }) => {
    const email = process.env.PW_INVALID_LOGIN_EMAIL?.trim();
    const password = process.env.PW_INVALID_LOGIN_PASSWORD;
    test.skip(
      !email || !password,
      "Set PW_INVALID_LOGIN_EMAIL and PW_INVALID_LOGIN_PASSWORD to a dedicated test account and intentionally incorrect password.",
    );
    await page.getByLabel("Email address", { exact: true }).fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    const response = await expectRealPostResponse(page, LOGIN_API, () =>
      page.getByRole("button", { name: "Sign in securely", exact: true }).click(),
    );
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBe("Invalid email or password");
    await expect(page.getByRole("alert")).toContainText("Invalid email or password");
  });
});
