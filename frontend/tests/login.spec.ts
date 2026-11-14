import { expect, test, type Page } from "@playwright/test";

type RoleCredentials = {
  role: string;
  emailEnv: string;
  passwordEnv: string;
  destination: string;
  sessionCookie: string;
};

const roleCredentials: RoleCredentials[] = [
  {
    role: "SUPER_ADMIN",
    emailEnv: "PW_SUPER_ADMIN_EMAIL",
    passwordEnv: "PW_SUPER_ADMIN_PASSWORD",
    destination: "/dashboard",
    sessionCookie: "crm_admin_session",
  },
  {
    role: "ORGANIZATION_ADMIN",
    emailEnv: "PW_ORG_ADMIN_EMAIL",
    passwordEnv: "PW_ORG_ADMIN_PASSWORD",
    destination: "/org/dashboard",
    sessionCookie: "crm_org_session",
  },
  {
    role: "HR_MANAGER",
    emailEnv: "PW_HR_MANAGER_EMAIL",
    passwordEnv: "PW_HR_MANAGER_PASSWORD",
    destination: "/employee/welcome",
    sessionCookie: "crm_employee_session",
  },
  {
    role: "DEPARTMENT_MANAGER",
    emailEnv: "PW_DEPARTMENT_MANAGER_EMAIL",
    passwordEnv: "PW_DEPARTMENT_MANAGER_PASSWORD",
    destination: "/employee/welcome",
    sessionCookie: "crm_employee_session",
  },
  {
    role: "EMPLOYEE",
    emailEnv: "PW_EMPLOYEE_EMAIL",
    passwordEnv: "PW_EMPLOYEE_PASSWORD",
    destination: "/employee/welcome",
    sessionCookie: "crm_employee_session",
  },
];

async function openLogin(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
}

async function submitLogin(
  page: Page,
  email: string,
  password: string,
) {
  const emailInput = page.getByLabel("Email address");
  const passwordInput = page.getByLabel("Password", { exact: true });

  await emailInput.fill(email);
  await passwordInput.fill(password);

  // Fail early with useful context if browser-side validation prevents submit.
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);
  expect(await emailInput.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/backend/unified-auth/login") &&
      response.request().method() === "POST",
    { timeout: 20_000 },
  );

  const submitButton = page.getByRole("button", {
    name: "Sign in securely",
  });
  await expect(submitButton).toBeEnabled();

  const [response] = await Promise.all([
    responsePromise,
    submitButton.click(),
  ]);

  return response;
}

test.describe("Login page — real backend and PostgreSQL", () => {
  test("LOGIN-001: renders the login page and its essential controls", async ({
    page,
  }) => {
    await openLogin(page);

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

    let loginRequests = 0;
    page.on("request", (request) => {
      if (
        request.url().includes("/api/backend/unified-auth/login") &&
        request.method() === "POST"
      ) {
        loginRequests += 1;
      }
    });

    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("irrelevant");
    await page.getByLabel("Password", { exact: true }).press("Enter");

    await expect(
      page.getByText(
        "Enter a valid email address, such as name@company.com.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(loginRequests).toBe(0);
  });

  test("LOGIN-003: password visibility control reveals and conceals the password", async ({
    page,
  }) => {
    await openLogin(page);
    const password = page.getByLabel("Password", { exact: true });
    const testPassword = "Temporary-password-value";

    await password.fill(testPassword);
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(testPassword);
    await expect(
      page.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue(testPassword);
  });

  test("LOGIN-004: empty credentials are rejected by client-side validation", async ({
    page,
  }) => {
    await openLogin(page);

    let loginRequests = 0;
    page.on("request", (request) => {
      if (
        request.url().includes("/api/backend/unified-auth/login") &&
        request.method() === "POST"
      ) {
        loginRequests += 1;
      }
    });

    await page.getByRole("button", { name: "Sign in securely" }).click();

    await expect(page.getByLabel("Email address")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
    expect(loginRequests).toBe(0);
  });

  test("LOGIN-005: forgot-password view opens and returns to sign-in", async ({
    page,
  }) => {
    await openLogin(page);
    await page.getByRole("button", { name: /forgot password/i }).click();

    // The application heading is "Forgot your password?", not "Forgot password".
    await expect(
      page.getByRole("heading", { name: /forgot your password/i }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();

    await page.getByRole("button", { name: /back to sign in/i }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
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
      const responseText = await response.text();

      expect(
        response.status(),
        `Backend login failed for ${credentials.role}: ${responseText}`,
      ).toBe(200);

      const body = JSON.parse(responseText) as {
        status?: string;
        destination?: string;
        user?: { role?: string; organizationId?: string | null };
      };

      expect(body.status).toBe("ok");
      expect(body.user?.role).toBe(credentials.role);
      expect(body.destination).toBe(credentials.destination);

      await page.waitForURL(
        (url) => url.pathname === credentials.destination,
        { timeout: 15_000 },
      );

      const sessionCookie = (await page.context().cookies()).find(
        (cookie) => cookie.name === credentials.sessionCookie,
      );
      expect(
        sessionCookie,
        `Expected real ${credentials.role} session cookie`,
      ).toBeTruthy();
      expect(sessionCookie?.httpOnly).toBe(true);
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
    const body = await response.json();

    expect(response.status()).toBe(401);
    expect(body.message).toBe("Invalid email or password");

    await expect(
      page.getByText("Invalid email or password", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
