import { expect, test, type Page } from "@playwright/test";

async function openLogin(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
}

function countPostRequests(page: Page, path: string) {
  let count = 0;

  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(path)) {
      count += 1;
    }
  });

  return () => count;
}

test.describe("Login page — UI regression suite", () => {
  test("LOGIN-REG-001: login form exposes its accessible controls", async ({
    page,
  }) => {
    await openLogin(page);

    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in securely" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: /forgot password/i }),
    ).toBeVisible();
  });

  test("LOGIN-REG-002: password visibility toggles without clearing the value", async ({
    page,
  }) => {
    await openLogin(page);

    const password = page.getByLabel("Password", { exact: true });
    const value = "Regression-Password-123!";

    await password.fill(value);
    await page.getByRole("button", { name: "Show password" }).click();

    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(value);

    await page.getByRole("button", { name: "Hide password" }).click();

    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue(value);
  });

  test("LOGIN-REG-003: forgot-password view opens with the normalized login email", async ({
    page,
  }) => {
    await openLogin(page);

    await page.getByLabel("Email address").fill("User.Name@Example.com");
    await page.getByRole("button", { name: /forgot password/i }).click();

    await expect(
      page.getByRole("heading", { name: /forgot your password/i }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(
      "user.name@example.com",
    );
  });

  test("LOGIN-REG-004: returning from password recovery restores sign-in and clears the password", async ({
    page,
  }) => {
    await openLogin(page);

    await page.getByLabel("Email address").fill("person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("temporary-secret");
    await page.getByRole("button", { name: /forgot password/i }).click();

    await expect(
      page.getByRole("heading", { name: /forgot your password/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /back to sign in/i }).click();

    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(
      "person@example.com",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
  });

  test("LOGIN-REG-005: empty recovery email is blocked by browser validation", async ({
    page,
  }) => {
    await openLogin(page);

    const requestCount = countPostRequests(
      page,
      "/api/backend/password-reset/request",
    );

    await page.getByRole("button", { name: /forgot password/i }).click();
    const recoveryEmail = page.getByLabel("Email address");
    await expect(recoveryEmail).toBeVisible();

    await page.getByRole("button", { name: /send reset instructions/i }).click();

    await expect(recoveryEmail).toBeFocused();
    expect(requestCount()).toBe(0);
  });

  test("LOGIN-REG-006: reset-token URL opens the reset form and removes the token from browser history", async ({
    page,
  }) => {
    await page.goto("/?token=playwright-regression-token&source=test");

    await expect(
      page.getByRole("heading", { name: "Choose a new password", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("New password")).toBeVisible();
    await expect(page.getByLabel("Confirm new password")).toBeVisible();
    await expect(page).toHaveURL(/\/\?source=test$/);
    await expect(page).not.toHaveURL(/token=/);
  });

  test("LOGIN-REG-007: mismatched reset passwords are rejected before an API request", async ({
    page,
  }) => {
    const requestCount = countPostRequests(
      page,
      "/api/backend/password-reset/complete",
    );

    await page.goto("/?token=playwright-regression-token");

    await expect(
      page.getByRole("heading", { name: "Choose a new password", exact: true }),
    ).toBeVisible();

    await page.getByLabel("New password").fill("First-Password-12345!");
    await page
      .getByLabel("Confirm new password")
      .fill("Different-Password-12345!");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "The passwords do not match.",
    );
    expect(requestCount()).toBe(0);
  });

  test("LOGIN-REG-008: reset-password visibility controls work independently", async ({
    page,
  }) => {
    await page.goto("/?token=playwright-regression-token");

    const newPassword = page.getByLabel("New password");
    const confirmation = page.getByLabel("Confirm new password");

    await newPassword.fill("First-Password-12345!");
    await confirmation.fill("First-Password-12345!");

    await page.getByRole("button", { name: "Show new password" }).click();
    await expect(newPassword).toHaveAttribute("type", "text");
    await expect(confirmation).toHaveAttribute("type", "password");

    await page
      .getByRole("button", { name: "Show confirmation password" })
      .click();
    await expect(newPassword).toHaveAttribute("type", "text");
    await expect(confirmation).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Hide new password" }).click();
    await expect(newPassword).toHaveAttribute("type", "password");
    await expect(confirmation).toHaveAttribute("type", "text");
  });

  test("LOGIN-REG-009: forgot-password navigation does not submit the login form", async ({
    page,
  }) => {
    await openLogin(page);

    const loginRequestCount = countPostRequests(
      page,
      "/api/backend/unified-auth/login",
    );

    await page.getByLabel("Email address").fill("person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("not-submitted");
    await page.getByRole("button", { name: /forgot password/i }).click();

    await expect(
      page.getByRole("heading", { name: /forgot your password/i }),
    ).toBeVisible();
    expect(loginRequestCount()).toBe(0);
  });
});
