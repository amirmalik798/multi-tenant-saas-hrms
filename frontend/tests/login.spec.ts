import { expect, test, type Page } from "@playwright/test";

type RoleCredentials = {
  role: string;
  emailEnv: string;
  passwordEnv: string;
  destination: string;
};

const roleCredentials: RoleCredentials[] = [
  {
    role: "SUPER_ADMIN",
    emailEnv: "PW_SUPER_ADMIN_EMAIL",
    passwordEnv: "PW_SUPER_ADMIN_PASSWORD",
    destination: "/dashboard",
  },
  {
    role: "ORGANIZATION_ADMIN",
    emailEnv: "PW_ORG_ADMIN_EMAIL",
    passwordEnv: "PW_ORG_ADMIN_PASSWORD",
    destination: "/org/dashboard",
  },
  {
    role: "HR_MANAGER",
    emailEnv: "PW_HR_MANAGER_EMAIL",
    passwordEnv: "PW_HR_MANAGER_PASSWORD",
    destination: "/employee/welcome",
  },
  {
    role: "DEPARTMENT_MANAGER",
    emailEnv: "PW_DEPARTMENT_MANAGER_EMAIL",
    passwordEnv: "PW_DEPARTMENT_MANAGER_PASSWORD",
    destination: "/employee/welcome",
  },
  {
    role: "EMPLOYEE",
    emailEnv: "PW_EMPLOYEE_EMAIL",
    passwordEnv: "PW_EMPLOYEE_PASSWORD",
    destination: "/employee/welcome",
  },
];

async function openLogin(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
}

async function submitLogin(
  page: Page,
  email: string,
  password: string,
) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);

  const responsePromise = page.waitForResponse((response) => {
    return (
      response.url().includes("/api/backend/unified-auth/login") &&
      response.request().method() === "POST"
    );
  });

  await page.getByRole("button", { name: "Sign in securely" }).click();
  return responsePromise;
}

test.describe("Login page — real backend and PostgreSQL", () => {
  test("LOGIN-001: renders the login page and its essential controls", async ({
    page,
  }) => {
    await openLogin(page);

    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in securely" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /forgot password/i }),
    ).toBeVisible();
  });

  test("LOGIN-002: validates an invalid email before contacting the backend", async ({
    page,
  }) => {
    await openLogin(page);
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("irrelevant");
    await page.getByLabel("Password", { exact: true }).press("Enter");

    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("LOGIN-003: password visibility control reveals and conceals the password", async ({
    page,
  }) => {
    await openLogin(page);
    const password = page.getByLabel("Password", { exact: true });

    await password.fill("Temporary-password-value");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("LOGIN-004: empty credentials are rejected by client-side validation", async ({
    page,
  }) => {
    await openLogin(page);
    await page.getByRole("button", { name: "Sign in securely" }).click();

    await expect(page.getByLabel("Email address")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  });

  test("LOGIN-005: forgot-password view opens and returns to sign-in", async ({
    page,
  }) => {
    await openLogin(page);
    await page.getByRole("button", { name: /forgot password/i }).click();

    await expect(
      page.getByRole("heading", { name: /forgot password/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();

    await page.getByRole("button", { name: /back to sign in/i }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  for (const credentials of roleCredentials) {
    test(`LOGIN-ROLE-${credentials.role}: authenticates against PostgreSQL and opens the correct workspace`, async ({
      page,
    }) => {
      const email = process.env[credentials.emailEnv]?.trim();
      const password = process.env[credentials.passwordEnv];

      test.skip(
        !email || !password,
        `Set ${credentials.emailEnv} and ${credentials.passwordEnv} to enable this real-account test.`,
      );

      await openLogin(page);

      const response = await submitLogin(page, email!, password!);
      expect(
        response.status(),
        `Backend login failed for ${credentials.role}: ${await response.text()}`,
      ).toBe(200);

      const body = await response.json();
      expect(body.status).toBe("ok");
      expect(body.user?.role).toBe(credentials.role);
      expect(body.destination).toBe(credentials.destination);

      await expect(page).toHaveURL(
        new RegExp(`${credentials.destination.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:[/?#]|$)`),
        { timeout: 15_000 },
      );
    });
  }

  test("LOGIN-INVALID-001: real backend rejects an incorrect password", async ({
    page,
  }) => {
    const email = process.env.PW_INVALID_LOGIN_EMAIL?.trim();
    const password = process.env.PW_INVALID_LOGIN_PASSWORD;

    test.skip(
      !email || !password,
      "Set PW_INVALID_LOGIN_EMAIL and PW_INVALID_LOGIN_PASSWORD to a dedicated test account and an intentionally incorrect password.",
    );

    await openLogin(page);
    const response = await submitLogin(page, email!, password!);

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBe("Invalid email or password");

    await expect(
      page.getByText("Invalid email or password", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
