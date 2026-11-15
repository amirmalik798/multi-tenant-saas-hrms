import { randomBytes } from "node:crypto";
import { pool as regressionDb } from "../../backend/lib/db";
import {
  expect,
  request,
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

type WorkerFixtures = {
  superAdminApi: APIRequestContext;
  superAdminStorageState: Awaited<ReturnType<APIRequestContext["storageState"]>>;
};

const test = base.extend<{}, WorkerFixtures>({
  superAdminApi: [
    async ({}, use) => {
      const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
      const email = process.env.PW_SUPER_ADMIN_EMAIL?.trim();
      const password = process.env.PW_SUPER_ADMIN_PASSWORD;

      if (!email || !password) {
        throw new Error(
          "Set PW_SUPER_ADMIN_EMAIL and PW_SUPER_ADMIN_PASSWORD in frontend/.env.playwright.",
        );
      }

      const api = await request.newContext({
        baseURL,
        extraHTTPHeaders: {
          origin: baseURL,
          "sec-fetch-site": "same-origin",
          "ngrok-skip-browser-warning": "true",
        },
      });

      const login = await api.post("/api/backend/unified-auth/login", {
        data: { email, password },
      });
      const loginBody = await login.json().catch(() => null) as
        | { status?: string; destination?: string; user?: { role?: string } }
        | null;

      expect(
        login.status(),
        "The configured Super Admin credential must authenticate against the real backend.",
      ).toBe(200);
      expect(loginBody?.status).toBe("ok");
      expect(loginBody?.user?.role).toBe("SUPER_ADMIN");
      expect(loginBody?.destination).toBe("/dashboard");

      await use(api);
      await api.dispose();
    },
    { scope: "worker" },
  ],
  superAdminStorageState: [
    async ({ superAdminApi }, use) => {
      await use(await superAdminApi.storageState());
    },
    { scope: "worker" },
  ],
  storageState: async ({ superAdminStorageState }, use) => {
    await use(superAdminStorageState);
  },
});

const RUN_ID = randomBytes(5).toString("hex");
const seedOrganizationName = "PW SA Regression " + RUN_ID;
const seedOrganizationSlug = "pw-sa-regression-" + RUN_ID;
const seedOrganizationContactEmail = "pw-sa-contact-" + RUN_ID + "@yopmail.com";
const seedOrganizationAdminEmail = "pw-sa-admin-" + RUN_ID + "@yopmail.com";

// A separate tenant is accepted during setup so Organization Admin tests do
// not depend on accounts left behind by previous manual or automated runs.
const activeOrganizationName = "PW SA Active Admin " + RUN_ID;
const activeOrganizationSlug = "pw-sa-active-admin-" + RUN_ID;
const activeOrganizationContactEmail = "pw-sa-active-contact-" + RUN_ID + "@yopmail.com";
const activeOrganizationAdminEmail = "pw-sa-active-admin-" + RUN_ID + "@yopmail.com";
const activeOrganizationAdminPassword = "PW-SuperAdmin-Test!" + RUN_ID;
const secondActiveOrganizationAdminEmail = "pw-sa-second-admin-" + RUN_ID + "@yopmail.com";
const secondActiveOrganizationAdminPassword = "PW-SuperAdmin-Second!" + RUN_ID;

let seedOrganizationId = "";
let seedInvitationId = "";
let activeOrganizationId = "";
let acceptedAdminId = "";
let secondAcceptedAdminId = "";
let paymentReviewId = "";
let supportConversationId = "";
let activeOrganizationAdminApi: APIRequestContext | null = null;

type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  country?: string;
  status?: string;
};

type AdminRecord = {
  id: string;
  email: string;
  account_status: string;
  first_name?: string | null;
  last_name?: string | null;
  organization_id: string;
  organization_name: string;
  organization_status: string;
};

type PaymentRecord = {
  id: string;
  organizationName: string;
  status: string;
};

function sameOriginHeaders(page: Page) {
  return {
    origin: new URL(page.url()).origin,
    "sec-fetch-site": "same-origin",
  };
}

async function openPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

async function openSeedOrganization(page: Page, panel: "view" | "edit" = "view") {
  await page.goto(
    "/dashboard/organizations?organizationId=" +
      encodeURIComponent(seedOrganizationId) +
      "&panel=" +
      panel,
  );
  const heading = panel === "view" ? "Organization Details" : "Edit Organization";
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readOrganizationAdmins(page: Page): Promise<AdminRecord[]> {
  const response = await page.request.get("/api/backend/organization-admins");
  expect(response.status()).toBe(200);
  const body = await response.json() as { organizationAdmins?: AdminRecord[] };
  return Array.isArray(body.organizationAdmins) ? body.organizationAdmins : [];
}

async function readFixtureAdmin(page: Page): Promise<AdminRecord> {
  expect(acceptedAdminId, "beforeAll must provision an accepted Organization Admin.").toBeTruthy();
  const admins = await readOrganizationAdmins(page);
  const admin = admins.find((item) => item.id === acceptedAdminId);
  expect(admin, "The suite-created accepted Organization Admin must remain visible in the directory.").toBeTruthy();
  return admin!;
}

function adminDisplayName(admin: AdminRecord) {
  return [admin.first_name, admin.last_name].filter(Boolean).join(" ").trim() || admin.email;
}

async function readPayments(page: Page): Promise<PaymentRecord[]> {
  const response = await page.request.get(
    "/api/backend/platform-payments?page=1&pageSize=100&status=ALL&sort=NEWEST",
  );
  expect(response.status()).toBe(200);
  const body = await response.json() as {
    payments?: PaymentRecord[];
    submissions?: PaymentRecord[];
    items?: PaymentRecord[];
  };
  return body.payments ?? body.submissions ?? body.items ?? [];
}

async function openPayment(page: Page, paymentId: string) {
  const lookup = await page.request.get(
    "/api/backend/platform-payments?page=1&pageSize=100&status=ALL&sort=NEWEST&search=" +
      encodeURIComponent(paymentId),
  );
  expect(lookup.status()).toBe(200);
  const lookupBody = await lookup.json() as { payments?: PaymentRecord[] };
  const payment = (lookupBody.payments ?? []).find((item) => item.id === paymentId);
  expect(payment, "The suite-created payment must be visible to the Super Admin payment directory.").toBeTruthy();

  await openPage(page, "/dashboard/payments", "Payments & Licenses");
  await page.locator("#payment-status-filter").selectOption("ALL");
  await page.locator("#payment-search").fill(paymentId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const row = page.locator("tbody tr").filter({ hasText: payment!.organizationName }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Review|View details/ }).click();

  const dialog = page.getByRole("dialog").filter({
    has: page.locator("#payment-detail-title"),
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

const PAYMENT_PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64",
);

async function submitTestPayment(
  api: APIRequestContext,
  transactionReference: string,
): Promise<string> {
  const response = await api.post("/api/backend/org/license/submissions", {
    headers: {
      "x-payment-amount": "1250.00",
      "x-payment-currency": "RWF",
      "x-transaction-reference": transactionReference,
    },
    multipart: {
      proofImage: {
        name: "playwright-payment-proof.png",
        mimeType: "image/png",
        buffer: PAYMENT_PROOF_PNG,
      },
    },
  });
  const body = await response.json().catch(() => null) as
    | { status?: string; message?: string; payment?: { id?: string; status?: string } }
    | null;
  expect(response.status(), "The real Organization Admin payment submission workflow must accept the test proof.").toBe(201);
  expect(body?.status).toBe("ok");
  expect(body?.payment?.status).toBe("PENDING_REVIEW");
  expect(body?.payment?.id).toBeTruthy();
  return body!.payment!.id!;
}

test.describe("Super Admin workspace — full workflow regression suite", () => {
  test.setTimeout(60_000);

  test.beforeAll(async ({ superAdminApi }) => {
    test.setTimeout(180_000);

    const configuredTestDatabase = process.env.PW_TEST_DATABASE_NAME?.trim();
    expect(
      configuredTestDatabase,
      "Set PW_TEST_DATABASE_NAME in frontend/.env.playwright to the dedicated test database configured by backend DB_NAME.",
    ).toBeTruthy();
    const databaseCheck = await regressionDb.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    expect(databaseCheck.rows[0]?.database_name).toBe(configuredTestDatabase);
    expect(configuredTestDatabase!.toLowerCase()).not.toMatch(/(^|[-_])prod(uction)?($|[-_])/);
    const createResponse = await superAdminApi.post("/api/backend/organizations", {
      data: {
        name: seedOrganizationName,
        slug: seedOrganizationSlug,
        contactEmail: seedOrganizationContactEmail,
        contactPhone: "+250 788 123 456",
        country: "Rwanda",
        address: "Playwright Test Avenue, Kigali, Rwanda",
      },
    });

    const createBody = await createResponse.json().catch(() => null) as
      | { organization?: OrganizationRecord; message?: string }
      | null;

    expect(
      createResponse.status(),
      "The suite creates one uniquely named PENDING_SETUP test organization through the real Super Admin API.",
    ).toBe(201);
    seedOrganizationId = createBody?.organization?.id ?? "";
    expect(seedOrganizationId).toBeTruthy();

    const invitationResponse = await superAdminApi.post(
      "/api/backend/organizations/" + encodeURIComponent(seedOrganizationId) + "/invitations",
      {
        data: {
          email: seedOrganizationAdminEmail,
          adminFirstName: "Playwright",
          adminLastName: "Admin",
          adminPhone: "+250 788 123 456",
          adminCountry: "Rwanda",
          adminCity: "Kigali",
        },
      },
    );
    const invitationBody = await invitationResponse.json().catch(() => null) as
      | { emailSent?: boolean; invitation?: { id?: string }; message?: string }
      | null;

    expect(invitationResponse.status(), "The initial test Organization Admin invitation must be created successfully.").toBe(201);
    expect(invitationBody?.emailSent, "The configured provider must deliver the test invitation.").toBe(true);
    seedInvitationId = invitationBody?.invitation?.id ?? "";
    expect(seedInvitationId).toBeTruthy();

    // Create a distinct organization for the accepted/active administrator
    // fixture. The original PENDING_SETUP organization above remains intact
    // for lifecycle and pending-invitation regression coverage.
    const activeOrganizationResponse = await superAdminApi.post("/api/backend/organizations", {
      data: {
        name: activeOrganizationName,
        slug: activeOrganizationSlug,
        contactEmail: activeOrganizationContactEmail,
        contactPhone: "+250 788 123 457",
        country: "Rwanda",
        address: "Playwright Active Admin Avenue, Kigali, Rwanda",
      },
    });
    const activeOrganizationBody = await activeOrganizationResponse.json().catch(() => null) as
      | { organization?: OrganizationRecord; message?: string }
      | null;

    expect(
      activeOrganizationResponse.status(),
      "The suite must create a separate PENDING_SETUP organization for its accepted Organization Admin fixture.",
    ).toBe(201);
    activeOrganizationId = activeOrganizationBody?.organization?.id ?? "";
    expect(activeOrganizationId).toBeTruthy();

    const activeInvitationResponse = await superAdminApi.post(
      "/api/backend/organizations/" + encodeURIComponent(activeOrganizationId) + "/invitations",
      {
        data: {
          email: activeOrganizationAdminEmail,
          adminFirstName: "Playwright",
          adminLastName: "Active Admin",
          adminPhone: "+250 788 123 457",
          adminCountry: "Rwanda",
          adminCity: "Kigali",
        },
      },
    );
    const activeInvitationBody = await activeInvitationResponse.json().catch(() => null) as
      | { emailSent?: boolean; invitation?: { id?: string }; invitationUrl?: string; message?: string }
      | null;

    expect(activeInvitationResponse.status(), "The accepted-admin fixture invitation must be created successfully.").toBe(201);
    expect(activeInvitationBody?.emailSent, "The configured provider must deliver the active-admin invitation.").toBe(true);
    expect(activeInvitationBody?.invitation?.id).toBeTruthy();
    expect(activeInvitationBody?.invitationUrl).toBeTruthy();

    const invitationToken = new URL(activeInvitationBody!.invitationUrl!).searchParams.get("token");
    expect(invitationToken, "The delivered invitation URL must contain its one-time token.").toBeTruthy();

    const acceptanceResponse = await superAdminApi.post(
      "/api/backend/invitations/accept",
      {
        data: {
          token: invitationToken,
          firstName: "Playwright",
          lastName: "Active Admin",
          phone: "+250 788 123 457",
          country: "Rwanda",
          city: "Kigali",
          password: activeOrganizationAdminPassword,
        },
      },
    );
    const acceptanceBody = await acceptanceResponse.json().catch(() => null) as
      | {
          status?: string;
          user?: { id?: string; email?: string; status?: string };
          organization?: { id?: string; status?: string };
          message?: string;
        }
      | null;

    expect(
      acceptanceResponse.status(),
      "The suite must accept the invitation through the real backend acceptance workflow.",
    ).toBe(201);
    expect(acceptanceBody?.status).toBe("ok");
    expect(acceptanceBody?.user?.email).toBe(activeOrganizationAdminEmail);
    expect(acceptanceBody?.user?.status).toBe("ACTIVE");
    expect(acceptanceBody?.organization?.id).toBe(activeOrganizationId);
    expect(acceptanceBody?.organization?.status).toBe("ACTIVE");

    const adminDirectoryResponse = await superAdminApi.get("/api/backend/organization-admins");
    expect(adminDirectoryResponse.status()).toBe(200);
    const adminDirectoryBody = await adminDirectoryResponse.json() as {
      organizationAdmins?: AdminRecord[];
    };
    const acceptedAdmin = (adminDirectoryBody.organizationAdmins ?? []).find(
      (item) => item.id === acceptanceBody?.user?.id,
    );

    expect(
      acceptedAdmin,
      "The accepted Organization Admin must appear in the real Super Admin directory.",
    ).toBeTruthy();
    expect(acceptedAdmin?.account_status).toBe("ACTIVE");
    expect(acceptedAdmin?.organization_status).toBe("ACTIVE");
    acceptedAdminId = acceptedAdmin!.id;

    // Provision a second active administrator in the same tenant. This allows
    // the suite to test both successful suspension and the last-active-admin guard.
    const secondInvitationResponse = await superAdminApi.post(
      "/api/backend/organizations/" + encodeURIComponent(activeOrganizationId) + "/invitations",
      {
        data: {
          email: secondActiveOrganizationAdminEmail,
          adminFirstName: "Playwright",
          adminLastName: "Second Admin",
          adminPhone: "+250 788 123 458",
          adminCountry: "Rwanda",
          adminCity: "Kigali",
        },
      },
    );
    const secondInvitationBody = await secondInvitationResponse.json().catch(() => null) as
      | { emailSent?: boolean; invitation?: { id?: string }; invitationUrl?: string; message?: string }
      | null;
    expect(secondInvitationResponse.status()).toBe(201);
    expect(secondInvitationBody?.emailSent).toBe(true);
    expect(secondInvitationBody?.invitation?.id).toBeTruthy();
    expect(secondInvitationBody?.invitationUrl).toBeTruthy();

    const secondInvitationToken = new URL(secondInvitationBody!.invitationUrl!).searchParams.get("token");
    expect(secondInvitationToken).toBeTruthy();
    const secondAcceptanceResponse = await superAdminApi.post(
      "/api/backend/invitations/accept",
      {
        data: {
          token: secondInvitationToken,
          firstName: "Playwright",
          lastName: "Second Admin",
          phone: "+250 788 123 458",
          country: "Rwanda",
          city: "Kigali",
          password: secondActiveOrganizationAdminPassword,
        },
      },
    );
    const secondAcceptanceBody = await secondAcceptanceResponse.json().catch(() => null) as
      | { status?: string; user?: { id?: string; email?: string; status?: string }; organization?: { id?: string; status?: string } }
      | null;
    expect(secondAcceptanceResponse.status()).toBe(201);
    expect(secondAcceptanceBody?.status).toBe("ok");
    expect(secondAcceptanceBody?.user?.email).toBe(secondActiveOrganizationAdminEmail);
    expect(secondAcceptanceBody?.user?.status).toBe("ACTIVE");
    expect(secondAcceptanceBody?.organization?.id).toBe(activeOrganizationId);
    expect(secondAcceptanceBody?.organization?.status).toBe("ACTIVE");
    secondAcceptedAdminId = secondAcceptanceBody?.user?.id ?? "";
    expect(secondAcceptedAdminId).toBeTruthy();

    // Authenticate a separate Organization Admin API context using the newly
    // accepted account; use it to create real payment and support fixtures.
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
    activeOrganizationAdminApi = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        origin: baseURL,
        "sec-fetch-site": "same-origin",
        "ngrok-skip-browser-warning": "true",
      },
    });
    const adminLogin = await activeOrganizationAdminApi.post(
      "/api/backend/unified-auth/login",
      {
        data: {
          email: activeOrganizationAdminEmail,
          password: activeOrganizationAdminPassword,
        },
      },
    );
    const adminLoginBody = await adminLogin.json().catch(() => null) as
      | { status?: string; user?: { id?: string; role?: string; organizationId?: string } }
      | null;
    expect(adminLogin.status()).toBe(200);
    expect(adminLoginBody?.status).toBe("ok");
    expect(adminLoginBody?.user?.role).toBe("ORGANIZATION_ADMIN");
    expect(adminLoginBody?.user?.id).toBe(acceptedAdminId);
    expect(adminLoginBody?.user?.organizationId).toBe(activeOrganizationId);

    paymentReviewId = await submitTestPayment(
      activeOrganizationAdminApi,
      "PW-SA-" + RUN_ID + "-APPROVAL",
    );

    const supportResponse = await activeOrganizationAdminApi.post(
      "/api/backend/platform-support",
      {
        data: {
          subject: "PW Super Admin regression support " + RUN_ID,
          message: "Automated test conversation created by the Super Admin regression suite.",
        },
      },
    );
    const supportBody = await supportResponse.json().catch(() => null) as
      | { status?: string; conversationId?: string; message?: string }
      | null;
    expect(supportResponse.status()).toBe(201);
    expect(supportBody?.status).toBe("ok");
    supportConversationId = supportBody?.conversationId ?? "";
    expect(supportConversationId).toBeTruthy();
  });

  test.afterAll(async () => {
    await activeOrganizationAdminApi?.dispose();
    await regressionDb.end();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard");
    await expect(page.locator("[data-super-admin-dashboard]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Dashboard, workspace navigation, quick commands, and appearance
  // ---------------------------------------------------------------------------

  test("SA-001: dashboard loads inside the authenticated Super Admin workspace", async ({ page }) => {
    await expect(page.locator("[data-super-admin-dashboard]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Super Admin", { exact: true }).first()).toBeVisible();
  });

  test("SA-002: dashboard renders all four platform overview metrics", async ({ page }) => {
    const metrics = page.getByRole("region", { name: "Platform overview metrics" });
    await expect(metrics).toBeVisible();
    for (const label of ["Total Organizations", "Total Users", "Organization Admins", "Pending Invitations"]) {
      await expect(metrics.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("SA-003: dashboard statistics are returned by the real backend", async ({ page }) => {
    const response = await page.request.get("/api/backend/dashboard/stats");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.stats).toBeTruthy();
    for (const key of ["totalOrganizations", "totalUsers", "organizationAdminUsers", "pendingInvitations"]) {
      expect(body.stats).toHaveProperty(key);
      expect(Number.isFinite(Number(body.stats[key]))).toBe(true);
    }
  });

  test("SA-004: organization growth visualization contains the six-month series", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Organization Growth", exact: true })).toBeVisible();
    await expect(page.getByText("Last 6 months", { exact: true })).toBeVisible();
    const monthlyBars = page.locator('[title$="organization registrations"]');
    await expect(monthlyBars).toHaveCount(6, { timeout: 30_000 });
  });

  test("SA-005: user distribution visualization identifies every platform role", async ({ page }) => {
    const chart = page.locator('[role="img"][aria-label^="User distribution:"]');
    await expect(chart).toBeVisible();
    const label = await chart.getAttribute("aria-label");
    for (const role of ["Super Admins", "Organization Admins", "HR Managers", "Department Managers", "Employees"]) {
      expect(label).toContain(role);
    }
  });

  test("SA-006: organization lifecycle visualization exposes active, pending, suspended, and archived totals", async ({ page }) => {
    const chart = page.locator('[role="img"][aria-label^="Organization lifecycle:"]');
    await expect(chart).toBeVisible();
    const label = await chart.getAttribute("aria-label");
    for (const status of ["active", "pending setup", "suspended", "archived"]) {
      expect(label).toContain(status);
    }
  });

  test("SA-007: recent organizations table exposes its accessible region and columns", async ({ page }) => {
    const region = page.getByRole("region", { name: "Recent organizations table" });
    await expect(region).toBeVisible();
    for (const heading of ["Organization", "Organization Admin", "Status", "Users", "Created At"]) {
      await expect(region.getByRole("columnheader", { name: heading, exact: true })).toBeVisible();
    }
  });

  test("SA-008: dashboard View All link opens the complete organization directory", async ({ page }) => {
    await page.getByRole("link", { name: "View All", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/organizations/);
    await expect(page.getByRole("heading", { name: "Organizations", exact: true })).toBeVisible();
  });

  test("SA-009: Super Admin sidebar exposes all eight workspace destinations", async ({ page }) => {
    const nav = page.locator("aside nav");
    const destinations = [
      "Dashboard",
      "Organizations",
      "Organization Admins",
      "Payments",
      "Invitations",
      "Platform Support",
      "System Health",
      "Audit Logs",
    ];
    for (const label of destinations) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("SA-010: dashboard navigation marks the current route as the active page", async ({ page }) => {
    await expect(page.locator('aside nav a[aria-current="page"]')).toHaveText("Dashboard");
    await page.locator("aside nav").getByRole("link", { name: "Invitations", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/invitations$/);
    await expect(page.locator('aside nav a[aria-current="page"]')).toHaveText("Invitations");
  });

  test("SA-011: Ctrl+K opens the shared command palette and focuses its search combobox", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Search commands and organizations" })).toBeFocused();
    await expect(dialog.getByRole("listbox", { name: "Command results" })).toBeVisible();
  });

  test("SA-012: command palette filters navigation commands by text", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    const search = dialog.getByRole("combobox", { name: "Search commands and organizations" });
    await search.fill("organization admins");
    await expect(dialog.getByRole("option", { name: /Organization Admins/ })).toBeVisible();
    await expect(dialog.getByRole("option", { name: "Payments Review payment proofs, verify submissions, and manage organization licenses" })).toHaveCount(0);
  });

  test("SA-013: command palette Enter selects the active navigation result", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const search = page.getByRole("combobox", { name: "Search commands and organizations" });
    await search.fill("Audit Logs");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/audit-logs$/);
    await expect(page.getByRole("heading", { name: "Audit Logs", exact: true })).toBeVisible();
  });

  test("SA-014: Super Admin theme toggle switches light and dark modes and persists the selection", async ({ page }) => {
    const root = page.locator("html");
    const toggle = page.getByRole("button", { name: "Switch to light mode", exact: true });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(root).toHaveAttribute("data-super-admin-theme", "light");
    await expect(page.getByRole("button", { name: "Switch to dark mode", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.localStorage.getItem("hrms-super-admin-theme"))).toBe("light");
    await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    await expect(root).toHaveAttribute("data-super-admin-theme", "dark");
  });

  // ---------------------------------------------------------------------------
  // Organization directory, registration, detail panels, licenses, and status
  // ---------------------------------------------------------------------------

  test("SA-015: Organizations workspace renders its heading and status summary", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    const summary = page.getByRole("region", { name: "Organization status summary" });
    await expect(summary).toBeVisible();
    for (const label of ["Total organizations", "Active", "Pending setup", "Suspended", "Archived"]) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("SA-016: organization directory API returns rows, pagination, and lifecycle summary", async ({ page }) => {
    const response = await page.request.get("/api/backend/organizations?page=1&pageSize=25&status=ALL");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.organizations)).toBe(true);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 25 });
    expect(body.summary).toHaveProperty("total");
    expect(body.summary).toHaveProperty("active");
    expect(body.summary).toHaveProperty("pending");
    expect(body.summary).toHaveProperty("suspended");
    expect(body.summary).toHaveProperty("archived");
  });

  test("SA-017: organization status filter defaults to all operational organizations", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await expect(page.getByLabel("Filter organizations by status")).toHaveValue("NON_ARCHIVED");
  });

  test("SA-018: organization status filter offers all supported lifecycle states", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    const filter = page.getByLabel("Filter organizations by status");
    for (const value of ["NON_ARCHIVED", "ACTIVE", "PENDING_SETUP", "SUSPENDED", "ARCHIVED"]) {
      await expect(filter.locator('option[value="' + value + '"]')).toHaveCount(1);
    }
  });

  test("SA-019: selecting Pending Setup filters the directory to setup-pending organizations", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByLabel("Filter organizations by status").selectOption("PENDING_SETUP");
    await expect(page.locator("tbody tr").filter({ hasText: seedOrganizationName }).first()).toBeVisible();
    await expect(page.getByLabel("Filter organizations by status")).toHaveValue("PENDING_SETUP");
  });

  test("SA-020: organization search matches the unique test organization name", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.locator("#organization-search").fill(seedOrganizationName);
    await expect(page.locator("tbody tr").filter({ hasText: seedOrganizationName }).first()).toBeVisible();
  });

  test("SA-021: organization search also matches the registered contact email", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.locator("#organization-search").fill(seedOrganizationContactEmail);
    await expect(page.locator("tbody tr").filter({ hasText: seedOrganizationName }).first()).toBeVisible();
  });

  test("SA-022: Clear filters resets organization search and status", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByLabel("Filter organizations by status").selectOption("ARCHIVED");
    await page.locator("#organization-search").fill("no-such-organization-" + RUN_ID);
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.locator("#organization-search")).toHaveValue("");
    await expect(page.getByLabel("Filter organizations by status")).toHaveValue("NON_ARCHIVED");
  });

  test("SA-023: organization API clamps excessive page sizes to its maximum", async ({ page }) => {
    const response = await page.request.get("/api/backend/organizations?page=0&pageSize=500&status=ALL");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(100);
  });

  test("SA-024: Create Organization opens an accessible drawer with the real form controls", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Create Organization" });
    await expect(dialog).toBeVisible();
    for (const id of [
      "create-org-name",
      "create-org-slug",
      "create-org-country",
      "create-org-phone",
      "create-org-email",
      "create-org-address",
      "create-org-admin-first-name",
      "create-org-admin-last-name",
      "create-org-admin-country",
      "create-org-admin-city",
      "create-org-admin-phone",
      "create-org-admin-email",
    ]) {
      await expect(dialog.locator("#" + id)).toHaveCount(1);
    }
  });

  test("SA-025: organization creation progressbar declares twelve required fields", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();
    const progress = page.getByRole("progressbar", { name: "Required fields completed" });
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("aria-valuemin", "0");
    await expect(progress).toHaveAttribute("aria-valuemax", "12");
  });

  test("SA-026: organization name automatically produces a normalized slug", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();
    await page.locator("#create-org-name").fill("Playwright Kigali Labs " + RUN_ID);
    await expect(page.locator("#create-org-slug")).toHaveValue("playwright-kigali-labs-" + RUN_ID);
  });

  test("SA-027: editing the suggested slug marks it custom and stops automatic replacement", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();
    await page.locator("#create-org-name").fill("First Suggested Name " + RUN_ID);
    await page.locator("#create-org-slug").fill("pw-custom-" + RUN_ID);
    await page.locator("#create-org-name").fill("Second Suggested Name " + RUN_ID);
    await expect(page.locator("#create-org-slug")).toHaveValue("pw-custom-" + RUN_ID);
    await expect(page.getByText("Custom slug", { exact: true })).toBeVisible();
  });

  test("SA-028: closing a populated creation drawer offers Keep editing", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();
    await page.locator("#create-org-name").fill("Unsaved Organization " + RUN_ID);
    await page.getByRole("button", { name: "Close create organization drawer" }).click();
    const discard = page.getByRole("alertdialog", { name: "Discard organization details?" });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Create Organization" })).toBeVisible();
    await expect(page.locator("#create-org-name")).toHaveValue("Unsaved Organization " + RUN_ID);
  });

  test("SA-029: discarding unsaved organization details closes the drawer without a create request", async ({ page }) => {
    await openPage(page, "/dashboard/organizations", "Organizations");
    const createRequests: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && new URL(req.url()).pathname === "/api/backend/organizations") {
        createRequests.push(req.url());
      }
    });
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();
    await page.locator("#create-org-name").fill("Discarded Organization " + RUN_ID);
    await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
    const discard = page.getByRole("alertdialog", { name: "Discard organization details?" });
    await discard.getByRole("button", { name: "Discard and close", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Create Organization" })).toHaveCount(0);
    expect(createRequests).toHaveLength(0);
  });

  test("SA-030: UI organization creation sends Yopmail contact and admin addresses to the backend", async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page, "/dashboard/organizations", "Organizations");
    await page.getByRole("button", { name: "Create Organization", exact: true }).first().click();

    const name = "PW SA UI Org " + RUN_ID;
    const slug = "pw-sa-ui-org-" + RUN_ID;
    const contactEmail = "pw-sa-ui-contact-" + RUN_ID + "@yopmail.com";
    const adminEmail = "pw-sa-ui-admin-" + RUN_ID + "@yopmail.com";

    await page.locator("#create-org-name").fill(name);
    await page.locator("#create-org-slug").fill(slug);
    await page.locator("#create-org-phone").fill("+250 788 123 456");
    await page.locator("#create-org-email").fill(contactEmail);
    await page.locator("#create-org-address").fill("Playwright Avenue, Kigali, Rwanda");
    await page.locator("#create-org-admin-first-name").fill("Playwright");
    await page.locator("#create-org-admin-last-name").fill("Yopmail");
    await page.locator("#create-org-admin-city").fill("Kigali");
    await page.locator("#create-org-admin-phone").fill("+250 788 123 456");
    await page.locator("#create-org-admin-email").fill(adminEmail);

    expect(contactEmail.endsWith("@yopmail.com")).toBe(true);
    expect(adminEmail.endsWith("@yopmail.com")).toBe(true);
    await expect(page.locator("button.sa-create-org-submit")).toBeEnabled();

    const organizationResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/organizations" &&
      response.request().method() === "POST",
    );
    const invitationResponsePromise = page.waitForResponse((response) =>
      /\/api\/backend\/organizations\/[0-9a-f-]+\/invitations$/i.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
    );

    await page.locator("button.sa-create-org-submit").click();

    const [organizationResponse, invitationResponse] = await Promise.all([
      organizationResponsePromise,
      invitationResponsePromise,
    ]);
    expect(organizationResponse.status()).toBe(201);
    const organizationBody = await organizationResponse.json();
    expect(organizationBody.organization.status).toBe("PENDING_SETUP");
    expect(organizationBody.organization.slug).toBe(slug);

    expect(invitationResponse.status()).toBe(201);
    const invitationBody = await invitationResponse.json();
    expect(invitationBody.emailSent).toBe(true);
    expect(invitationBody.invitation.email).toBe(adminEmail);
    expect(invitationBody.invitation.status).toBe("PENDING");
    await expect(page.getByRole("status").filter({ hasText: name + " was created and is now pending setup." }))
      .toBeVisible();
    await expect(page.getByRole("dialog", { name: "Create Organization" })).toHaveCount(0);
    await expect(page.locator("tbody tr").filter({ hasText: name }).first()).toBeVisible();
  });

  test("SA-031: organization details panel opens from a direct organization query", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "view");
    await expect(dialog.getByRole("heading", { name: "Organization Details", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close panel" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy ID", exact: true })).toBeVisible();
  });

  test("SA-032: organization overview shows its platform license as not activated", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "view");
    const license = dialog.getByRole("region", { name: "Organization license" });
    if (await license.count() === 0) {
      await expect(dialog.getByRole("heading", { name: "Platform license", exact: true })).toBeVisible();
    } else {
      await expect(license).toBeVisible();
    }
    await expect(dialog.getByText("Not activated", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Restricted", { exact: true })).toBeVisible();
  });

  test("SA-033: organization Users tab exposes read-only account metrics and search", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "view");
    const initialUsersResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/users") && url.searchParams.get("q") === "";
    });
    await dialog.locator('[data-organization-tab="users"]').click();
    const initialUsersResponse = await initialUsersResponsePromise;
    expect(initialUsersResponse.status()).toBe(200);
    await expect(dialog.getByRole("heading", { name: "Organization Users", exact: true })).toBeVisible();

    const search = dialog.getByPlaceholder("Search name, email, role or employee code");
    await expect(search).toBeVisible();
    const query = "pw-org-user-search-" + RUN_ID;
    const searchResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/users") && url.searchParams.get("q") === query;
    });
    await search.fill(query);
    const searchResponse = await searchResponsePromise;
    expect(searchResponse.status()).toBe(200);
    const searchBody = await searchResponse.json();
    expect(searchBody.matchingTotal).toBe(0);
  });

  test("SA-034: organization Invitation Logs tab opens its history panel", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "view");
    await dialog.locator('[data-organization-tab="activity"]').click();
    await expect(dialog.getByRole("heading", { name: "Invitation History", exact: true })).toBeVisible();
    await expect(dialog.locator("#organization-panel-activity")).toBeVisible();
  });

  test("SA-035: Edit Organization form exposes the verified registration field IDs", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "edit");
    for (const id of ["panel-org-name", "panel-org-slug", "panel-org-email", "panel-org-phone", "panel-org-country", "panel-org-address"]) {
      await expect(dialog.locator("#" + id)).toHaveCount(1);
    }
    await expect(dialog.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  });

  test("SA-036: invalid organization contact email is associated with inline validation feedback", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "edit");
    const email = dialog.locator("#panel-org-email");
    await email.fill("invalid-email");
    await email.blur();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#panel-org-email-error")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  });

  test("SA-037: organization edit can be saved and its original Yopmail contact address restored", async ({ page, superAdminApi }) => {
    const dialog = await openSeedOrganization(page, "edit");
    const originalEmail = seedOrganizationContactEmail;
    const changedEmail = "pw-sa-edited-contact-" + RUN_ID + "@yopmail.com";
    await dialog.locator("#panel-org-email").fill(changedEmail);
    const patchPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/organizations/" + seedOrganizationId &&
      response.request().method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    const patchResponse = await patchPromise;
    expect(patchResponse.status()).toBe(200);
    const readAfterSave = await superAdminApi.get("/api/backend/organizations/" + seedOrganizationId);
    expect(readAfterSave.status()).toBe(200);
    const savedBody = await readAfterSave.json();
    const savedOrganization = savedBody.organization ?? savedBody;
    expect(savedOrganization.contact_email).toBe(changedEmail);

    const restore = await superAdminApi.patch("/api/backend/organizations/" + seedOrganizationId, {
      data: {
        name: seedOrganizationName,
        slug: seedOrganizationSlug,
        contactEmail: originalEmail,
        contactPhone: "+250 788 123 456",
        country: "Rwanda",
        address: "Playwright Test Avenue, Kigali, Rwanda",
      },
    });
    expect(restore.status()).toBe(200);
  });

  test("SA-038: PENDING_SETUP organization cannot be suspended before setup is completed", async ({ page }) => {
    const response = await page.request.patch(
      "/api/backend/organizations/" + seedOrganizationId + "/status",
      {
        data: { status: "SUSPENDED" },
        headers: sameOriginHeaders(page),
      },
    );
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.message).toMatch(/setup/i);
    const organization = await page.request.get("/api/backend/organizations/" + seedOrganizationId);
    const organizationBody = await organization.json();
    expect((organizationBody.organization ?? organizationBody).status).toBe("PENDING_SETUP");
  });

  test("SA-039: organization slug availability endpoint reports the unique test slug as taken", async ({ page }) => {
    const response = await page.request.get(
      "/api/backend/organization-slug-availability?slug=" + encodeURIComponent(seedOrganizationSlug) +
        "&excludeOrganizationId=00000000-0000-4000-8000-000000000000",
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.available).toBe(false);
  });

  test("SA-040: organization side panel closes through its accessible close control", async ({ page }) => {
    const dialog = await openSeedOrganization(page, "view");
    await dialog.getByRole("button", { name: "Close panel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Organization Details" })).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // Organization Admin account directory and access controls
  // ---------------------------------------------------------------------------

  test("SA-041: Organization Admins workspace renders its heading and summary cards", async ({ page }) => {
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    const summary = page.getByRole("region", { name: "Organization Admin account summary" });
    await expect(summary).toBeVisible();
    for (const label of ["Total Admin Accounts", "Active", "Invited", "Restricted Accounts"]) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("SA-042: Organization Admin directory API returns its account collection", async ({ page }) => {
    const response = await page.request.get("/api/backend/organization-admins");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.organizationAdmins)).toBe(true);
  });

  test("SA-043: Organization Admin directory can explicitly include archived tenants", async ({ page }) => {
    const response = await page.request.get("/api/backend/organization-admins?includeArchived=true");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.organizationAdmins)).toBe(true);
  });

  test("SA-044: Organization Admin search and status filters are available", async ({ page }) => {
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await expect(page.locator("#admin-table-search")).toBeVisible();
    const status = page.getByLabel("Filter Organization Admins by access status");
    for (const value of ["ALL", "ACTIVE", "INVITED", "SUSPENDED", "ARCHIVED", "DEACTIVATED"]) {
      await expect(status.locator("option[value='" + value + "']")).toHaveCount(1);
    }
  });

  test("SA-045: Organization Admin directory search returns a matching accepted administrator", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    const adminEmail = admin.email;
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill(adminEmail);
    await expect(page.locator("#admin-table-search")).toHaveValue(adminEmail);
    await expect(page.locator("tbody tr").filter({ hasText: adminEmail }).first()).toBeVisible();
  });

  test("SA-046: Clear filters restores the Organization Admin directory defaults", async ({ page }) => {
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill("no-admin-" + RUN_ID);
    await page.getByLabel("Filter Organization Admins by access status").selectOption("SUSPENDED");
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.locator("#admin-table-search")).toHaveValue("");
    await expect(page.getByLabel("Filter Organization Admins by access status")).toHaveValue("ALL");
  });

  test("SA-047: selecting an existing Organization Admin opens the details side panel", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    const name = adminDisplayName(admin);
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill(admin.email);
    const adminRow = page.locator("tbody tr").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await adminRow.getByRole("button", { name: "View details for " + name, exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Organization Admin" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(admin.email, { exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Account access controls", exact: true })).toBeVisible();
  });

  test("SA-048: Organization Admin details expose copy-email and organization navigation actions", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill(admin.email);
    const adminRow = page.locator("tbody tr").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await adminRow.getByRole("button", { name: "View details for " + adminDisplayName(admin), exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Organization Admin" });
    await expect(panel.getByRole("button", { name: "Copy email address", exact: true })).toBeVisible();
    await expect(panel.getByRole("link", { name: "View organization details" })).toBeVisible();
  });

  test("SA-049: Organization Admin status dialog requires an audit reason before confirmation", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    expect(admin.account_status.toUpperCase()).toBe("ACTIVE");
    expect(admin.organization_status.toUpperCase()).toBe("ACTIVE");
    const name = adminDisplayName(admin);
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill(admin.email);
    const adminRow = page.locator("tbody tr").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await adminRow.getByRole("button", { name: "View details for " + name, exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Organization Admin" });
    const statusButton = admin.account_status.toUpperCase() === "SUSPENDED"
      ? panel.getByRole("button", { name: "Reactivate Administrator", exact: true })
      : panel.getByRole("button", { name: "Suspend Administrator", exact: true });
    await expect(statusButton).toBeVisible();
    await statusButton.click();
    const modal = page.getByRole("dialog", { name: /Organization Admin\?/ });
    await expect(modal).toBeVisible();
    await expect(modal.getByPlaceholder("Explain why this account status is being changed...")).toHaveAttribute("required", "");
    await expect(modal.getByRole("button", { name: /Confirm (Suspension|Reactivation)/ })).toBeDisabled();
    await expect(modal.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  });

  test("SA-050: Organization Admin status confirmation can be cancelled without changing the account", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    expect(admin.account_status.toUpperCase()).toBe("ACTIVE");
    expect(admin.organization_status.toUpperCase()).toBe("ACTIVE");
    const name = adminDisplayName(admin);
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill(admin.email);
    const adminRow = page.locator("tbody tr").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await adminRow.getByRole("button", { name: "View details for " + name, exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Organization Admin" });
    const statusButton = admin.account_status.toUpperCase() === "SUSPENDED"
      ? panel.getByRole("button", { name: "Reactivate Administrator", exact: true })
      : panel.getByRole("button", { name: "Suspend Administrator", exact: true });
    await statusButton.click();
    const modal = page.getByRole("dialog", { name: /Organization Admin\?/ });
    await modal.getByPlaceholder("Explain why this account status is being changed...").fill("Regression cancellation check");
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /Organization Admin\?/ })).toHaveCount(0);
    const refresh = await page.request.get("/api/backend/organization-admins");
    const body = await refresh.json();
    const current = (body.organizationAdmins as AdminRecord[]).find((item) => item.id === admin.id);
    expect(current?.account_status).toBe(admin.account_status);
  });

  test("SA-051: replacement Organization Admin form accepts a Yopmail address", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    expect(admin.account_status.toUpperCase()).toBe("ACTIVE");
    expect(admin.organization_status.toUpperCase()).toBe("ACTIVE");
    const name = adminDisplayName(admin);
    await openPage(page, "/dashboard/organization-admins", "Organization Admins");
    await page.locator("#admin-table-search").fill(admin.email);
    const adminRow = page.locator("tbody tr").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await adminRow.getByRole("button", { name: "View details for " + name, exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Organization Admin" });
    await panel.getByRole("button", { name: "Invite replacement administrator", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Invite a replacement Organization Admin" });
    await expect(dialog).toBeVisible();
    const replacementEmail = "pw-sa-replacement-" + RUN_ID + "@yopmail.com";
    await dialog.getByPlaceholder("new.admin@example.com").fill(replacementEmail);
    expect(replacementEmail.endsWith("@yopmail.com")).toBe(true);
    await expect(dialog.getByRole("button", { name: "Send invitation", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("SA-052: Organization Admin status API rejects an audit reason shorter than three characters", async ({ page }) => {
    const admin = await readFixtureAdmin(page);
    expect(admin.account_status.toUpperCase()).toBe("ACTIVE");
    expect(admin.organization_status.toUpperCase()).toBe("ACTIVE");
    const nextStatus = "SUSPENDED";
    const response = await page.request.patch(
      "/api/backend/organization-admins/" + admin.id + "/status",
      {
        data: { status: nextStatus, reason: "x" },
        headers: sameOriginHeaders(page),
      },
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/reason/i);
    const after = await page.request.get("/api/backend/organization-admins");
    const afterBody = await after.json();
    const unchanged = (afterBody.organizationAdmins as AdminRecord[]).find((item) => item.id === admin.id);
    expect(unchanged?.account_status).toBe(admin.account_status);
  });

  // ---------------------------------------------------------------------------
  // Global organization invitation management and revocation
  // ---------------------------------------------------------------------------

  test("SA-053: Invitation Management page renders its title and metrics region", async ({ page }) => {
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    await expect(page.getByRole("region", { name: "Invitation metrics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invitation History", exact: true })).toBeVisible();
  });

  test("SA-054: platform invitation API returns paginated invitation history", async ({ page }) => {
    const response = await page.request.get("/api/backend/platform-invitations?page=1&pageSize=25&status=ALL");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.invitations)).toBe(true);
    expect(body.pagination).toBeTruthy();
    expect(body.summary).toBeTruthy();
  });

  test("SA-055: invitation status filter exposes all five invitation states", async ({ page }) => {
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    const filters = page.locator('[aria-label="Filter invitations by status"]');
    for (const label of ["All statuses", "Pending", "Accepted", "Expired", "Revoked"]) {
      await expect(filters.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("SA-056: choosing Pending marks that invitation status filter as selected", async ({ page }) => {
    const initialRequestPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/backend/platform-invitations" &&
        url.searchParams.get("status") === "ALL";
    });
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    const initialResponse = await initialRequestPromise;
    expect(initialResponse.status()).toBe(200);

    const pendingRequestPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/backend/platform-invitations" &&
        url.searchParams.get("status") === "PENDING";
    });
    const filters = page.locator('[aria-label="Filter invitations by status"]');
    const pending = filters.getByRole("button", { name: "Pending", exact: true });
    await pending.click();
    const pendingResponse = await pendingRequestPromise;
    expect(pendingResponse.status()).toBe(200);
    await expect(pending).toHaveAttribute("aria-pressed", "true");
  });

  test("SA-057: global invitation search finds the Yopmail Organization Admin invitation", async ({ page }) => {
    test.skip(!seedInvitationId, invitationSetupError || "Seed Yopmail invitation was not created.");
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    await page.locator("#invitation-search").fill(seedOrganizationAdminEmail);
    await expect(page.locator("tbody tr").filter({ hasText: seedOrganizationAdminEmail }).first()).toBeVisible();
  });

  test("SA-058: pending invitation row exposes the revoke action for the Yopmail admin", async ({ page }) => {
    test.skip(!seedInvitationId, invitationSetupError || "Seed Yopmail invitation was not created.");
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    await page.locator("#invitation-search").fill(seedOrganizationAdminEmail);
    const row = page.locator("tr").filter({ hasText: seedOrganizationAdminEmail });
    await expect(row.first()).toBeVisible();
    await expect(row.first().getByRole("button", { name: "Revoke invitation", exact: true })).toBeVisible();
  });

  test("SA-059: invitation revocation dialog requires a reason and supports cancellation", async ({ page }) => {
    test.skip(!seedInvitationId, invitationSetupError || "Seed Yopmail invitation was not created.");
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    await page.locator("#invitation-search").fill(seedOrganizationAdminEmail);
    const row = page.locator("tr").filter({ hasText: seedOrganizationAdminEmail });
    await row.getByRole("button", { name: "Revoke invitation", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke invitation?" });
    await expect(dialog).toBeVisible();
    const reason = dialog.locator("#global-invitation-revocation-reason");
    await expect(reason).toHaveAttribute("maxlength", "1000");
    await expect(dialog.getByRole("button", { name: "Confirm revocation", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Revoke invitation?" })).toHaveCount(0);
  });

  test("SA-060: invitation API rejects a revocation reason shorter than three characters", async ({ page }) => {
    test.skip(!seedInvitationId, invitationSetupError || "Seed Yopmail invitation was not created.");
    const response = await page.request.patch(
      "/api/backend/organizations/" + seedOrganizationId + "/invitations",
      {
        data: { invitationId: seedInvitationId, reason: "x" },
        headers: sameOriginHeaders(page),
      },
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/reason/i);
  });

  test("SA-061: Super Admin can revoke the dedicated pending Yopmail invitation with an audit reason", async ({ page }) => {
    test.skip(!seedInvitationId, invitationSetupError || "Seed Yopmail invitation was not created.");
    await openPage(page, "/dashboard/invitations", "Invitation Management");
    await page.locator("#invitation-search").fill(seedOrganizationAdminEmail);
    const row = page.locator("tr").filter({ hasText: seedOrganizationAdminEmail });
    await row.getByRole("button", { name: "Revoke invitation", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke invitation?" });
    await dialog.locator("#global-invitation-revocation-reason").fill("Playwright Super Admin regression revocation");
    const patchPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/organizations/" + seedOrganizationId + "/invitations" &&
      response.request().method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "Confirm revocation", exact: true }).click();
    const response = await patchPromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.invitation.status).toBe("REVOKED");
  });

  // ---------------------------------------------------------------------------
  // Payments, payment-proof review, and license activation safeguards
  // ---------------------------------------------------------------------------

  test("SA-062: Payments & Licenses workspace renders review metrics and submissions", async ({ page }) => {
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    const metrics = page.getByRole("region", { name: "Payment overview metrics" });
    await expect(metrics).toBeVisible();
    for (const label of ["All submissions", "Awaiting review", "Approved", "Rejected"]) {
      await expect(metrics.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Payment submissions", exact: true })).toBeVisible();
  });

  test("SA-063: platform payments API returns paginated submissions and summary totals", async ({ page }) => {
    const response = await page.request.get("/api/backend/platform-payments?page=1&pageSize=25&status=ALL&sort=NEWEST");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.pagination).toBeTruthy();
    expect(body.summary).toBeTruthy();
    expect(body.summary).toHaveProperty("total");
    expect(body.summary).toHaveProperty("pending");
    expect(body.summary).toHaveProperty("approved");
    expect(body.summary).toHaveProperty("rejected");
  });

  test("SA-064: payment review list defaults to Pending review", async ({ page }) => {
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    await expect(page.locator("#payment-status-filter")).toHaveValue("PENDING_REVIEW");
  });

  test("SA-065: payment status filter offers pending, all, approved, and rejected", async ({ page }) => {
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    const filter = page.locator("#payment-status-filter");
    for (const value of ["PENDING_REVIEW", "ALL", "APPROVED", "REJECTED"]) {
      await expect(filter.locator("option[value='" + value + "']")).toHaveCount(1);
    }
  });

  test("SA-066: payment sorting offers date and amount orderings", async ({ page }) => {
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    const sort = page.locator("#payment-sort");
    for (const value of ["NEWEST", "OLDEST", "AMOUNT_HIGH", "AMOUNT_LOW"]) {
      await expect(sort.locator("option[value='" + value + "']")).toHaveCount(1);
    }
  });

  test("SA-067: payment search accepts organization, reference, submitter, or payment identifiers", async ({ page }) => {
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    await expect(page.locator("#payment-search")).toHaveAttribute(
      "placeholder",
      "Search organization, reference, submitter or payment ID…",
    );
    await page.locator("#payment-search").fill("PW-SA-" + RUN_ID);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#payment-search")).toHaveValue("PW-SA-" + RUN_ID);
  });

  test("SA-068: payment directory supports approved and rejected history filters", async ({ page }) => {
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    await page.locator("#payment-status-filter").selectOption("APPROVED");
    await expect(page.locator("#payment-status-filter")).toHaveValue("APPROVED");
    await page.locator("#payment-status-filter").selectOption("REJECTED");
    await expect(page.locator("#payment-status-filter")).toHaveValue("REJECTED");
  });

  test("SA-069: payment detail dialog displays the private proof and license evidence for a configured test submission", async ({ page }) => {
    const paymentId = process.env.PW_SUPER_ADMIN_PAYMENT_REVIEW_ID;
    test.skip(!paymentId, "Set PW_SUPER_ADMIN_PAYMENT_REVIEW_ID to a dedicated test submission before exercising payment details.");
    const dialog = await openPayment(page, paymentId!);
    await expect(dialog.locator("#payment-detail-title")).toBeVisible();
    await expect(dialog.getByText("Payment proof", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Transaction reference", { exact: true })).toBeVisible();
    await expect(dialog.getByText("License status", { exact: true })).toBeVisible();
  });

  test("SA-070: Super Admin approves a disposable pending payment and activates its license", async ({ page }) => {
    const paymentId = process.env.PW_SUPER_ADMIN_APPROVE_PAYMENT_ID;
    const rejectPaymentId = process.env.PW_SUPER_ADMIN_REJECT_PAYMENT_ID;
    test.skip(!paymentId, "Set PW_SUPER_ADMIN_APPROVE_PAYMENT_ID to a disposable PENDING_REVIEW submission. Approval is irreversible and consumes this record.");
    test.skip(paymentId === rejectPaymentId, "Approval and rejection must use two different disposable payment submissions.");

    const lookup = await page.request.get(
      "/api/backend/platform-payments?page=1&pageSize=100&status=ALL&sort=NEWEST&search=" +
        encodeURIComponent(paymentId!),
    );
    expect(lookup.status()).toBe(200);
    const lookupBody = await lookup.json() as { payments?: PaymentRecord[] };
    const payment = (lookupBody.payments ?? []).find((item) => item.id === paymentId);
    test.skip(!payment, "The configured approval payment ID is not visible to the Super Admin.");
    test.skip(payment!.status !== "PENDING_REVIEW", "The approval test record must still be PENDING_REVIEW; use a fresh disposable submission.");

    const dialog = await openPayment(page, paymentId!);
    await dialog.getByRole("button", { name: "Approve payment", exact: true }).click();
    await expect(dialog.getByText("Confirm payment approval", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Confirm approval", exact: true })).toBeEnabled();

    const reviewResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/platform-payments/" + paymentId + "/review" &&
      response.request().method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "Confirm approval", exact: true }).click();
    const reviewResponse = await reviewResponsePromise;
    expect(reviewResponse.status()).toBe(200);

    const result = await reviewResponse.json();
    expect(result.status).toBe("ok");
    expect(result.payment).toMatchObject({ id: paymentId, status: "APPROVED" });
    expect(result.license).toMatchObject({
      status: "ACTIVE",
      activationSource: "PAYMENT",
      lastApprovedPaymentId: paymentId,
    });
    expect(result.license.startsAt).toBeTruthy();
    expect(result.license.expiresAt).toBeTruthy();
    expect(new Date(result.license.expiresAt).getTime())
      .toBeGreaterThan(new Date(result.license.startsAt).getTime());
    await expect(page.getByRole("status").filter({ hasText: "Payment approved." })).toBeVisible();
  });

  test("SA-071: Super Admin rejects a separate disposable pending payment with an audited reason", async ({ page }) => {
    const paymentId = process.env.PW_SUPER_ADMIN_REJECT_PAYMENT_ID;
    const approvePaymentId = process.env.PW_SUPER_ADMIN_APPROVE_PAYMENT_ID;
    test.skip(!paymentId, "Set PW_SUPER_ADMIN_REJECT_PAYMENT_ID to a separate disposable PENDING_REVIEW submission. Rejection is irreversible and consumes this record.");
    test.skip(paymentId === approvePaymentId, "Approval and rejection must use two different disposable payment submissions.");

    const lookup = await page.request.get(
      "/api/backend/platform-payments?page=1&pageSize=100&status=ALL&sort=NEWEST&search=" +
        encodeURIComponent(paymentId!),
    );
    expect(lookup.status()).toBe(200);
    const lookupBody = await lookup.json() as { payments?: PaymentRecord[] };
    const payment = (lookupBody.payments ?? []).find((item) => item.id === paymentId);
    test.skip(!payment, "The configured rejection payment ID is not visible to the Super Admin.");
    test.skip(payment!.status !== "PENDING_REVIEW", "The rejection test record must still be PENDING_REVIEW; use a fresh disposable submission.");

    const dialog = await openPayment(page, paymentId!);
    await dialog.getByRole("button", { name: "Reject payment", exact: true }).click();
    await expect(dialog.getByText("Confirm payment rejection", { exact: true })).toBeVisible();
    const reason = "Playwright Super Admin rejection " + RUN_ID;
    await expect(dialog.locator("#payment-rejection-reason")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Confirm rejection", exact: true })).toBeDisabled();
    await dialog.locator("#payment-rejection-reason").fill(reason);
    await expect(dialog.getByRole("button", { name: "Confirm rejection", exact: true })).toBeEnabled();

    const reviewResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/platform-payments/" + paymentId + "/review" &&
      response.request().method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "Confirm rejection", exact: true }).click();
    const reviewResponse = await reviewResponsePromise;
    expect(reviewResponse.status()).toBe(200);

    const result = await reviewResponse.json();
    expect(result.status).toBe("ok");
    expect(result.payment).toMatchObject({
      id: paymentId,
      status: "REJECTED",
      rejectionReason: reason,
    });
    await expect(page.getByRole("status").filter({ hasText: "Payment rejected." })).toBeVisible();
  });

  test("SA-072: payment review API rejects an unsupported review decision", async ({ page }) => {
    const response = await page.request.patch(
      "/api/backend/platform-payments/00000000-0000-4000-8000-000000000000/review",
      {
        data: { decision: "APPROVE_NOW" },
        headers: sameOriginHeaders(page),
      },
    );
    expect(response.status()).toBe(400);
  });

  test("SA-073: payment review API rejects a rejection without a reason", async ({ page }) => {
    const response = await page.request.patch(
      "/api/backend/platform-payments/00000000-0000-4000-8000-000000000000/review",
      {
        data: { decision: "REJECT" },
        headers: sameOriginHeaders(page),
      },
    );
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/reason/i);
  });

  test("SA-074: private payment proof endpoint validates submission identifiers", async ({ page }) => {
    const response = await page.request.get("/api/backend/payment-submissions/not-a-uuid/proof");
    expect(response.status()).toBe(400);
  });

  test("SA-075: completed payment submissions are exposed as read-only history", async ({ page }) => {
    const payments = await readPayments(page);
    const completed = payments.filter((payment) => ["APPROVED", "REJECTED"].includes(payment.status));
    test.skip(completed.length === 0, "No completed payment submission exists in the current test database.");
    await openPage(page, "/dashboard/payments", "Payments & Licenses");
    await page.locator("#payment-status-filter").selectOption(completed[0].status);
    const row = page.locator("tbody tr").filter({ hasText: completed[0].organizationName });
    await expect(row.getByRole("button", { name: "View details", exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Platform Support inbox, thread reading, reply, and status handling
  // ---------------------------------------------------------------------------

  test("SA-076: Platform Support Inbox renders the organization conversation workspace", async ({ page }) => {
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    await expect(page.getByRole("heading", { name: "Conversations", exact: true })).toBeVisible();
    await expect(page.getByLabel("Search support conversations")).toBeVisible();
    await expect(page.getByLabel("Filter support status")).toBeVisible();
  });

  test("SA-077: platform support API returns paginated conversations and unread totals", async ({ page }) => {
    const response = await page.request.get("/api/backend/platform-support?page=1&pageSize=25&search=&status=ALL");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(body.pagination).toBeTruthy();
    expect(typeof body.unreadTotal).toBe("number");
  });

  test("SA-078: support search submits its debounced query to the backend", async ({ page }) => {
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    const query = "pw-support-search-" + RUN_ID;
    const requestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/backend/platform-support" &&
        url.searchParams.get("search") === query;
    });
    await page.locator("#support-search").fill(query);
    const supportRequest = await requestPromise;
    expect(supportRequest.method()).toBe("GET");
    await expect(page.locator("#support-search")).toHaveValue(query);
  });

  test("SA-079: choosing Closed applies the CLOSED status filter to the support API", async ({ page }) => {
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    const filter = page.locator("#support-status-filter");
    for (const value of ["ALL", "OPEN", "CLOSED"]) {
      await expect(filter.locator('option[value="' + value + '"]')).toHaveCount(1);
    }
    const requestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/backend/platform-support" &&
        url.searchParams.get("status") === "CLOSED";
    });
    await filter.selectOption("CLOSED");
    await requestPromise;
    await expect(filter).toHaveValue("CLOSED");
  });

  test("SA-080: Super Admin inbox does not expose the organization-only New message action", async ({ page }) => {
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    await expect(page.getByRole("button", { name: "New message", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Select an organization conversation", exact: true })).toBeVisible();
  });

  test("SA-081: a configured test support conversation can be opened in the thread pane", async ({ page }) => {
    const conversationId = process.env.PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID;
    test.skip(!conversationId, "Set PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID to a dedicated test conversation.");
    const response = await page.request.get("/api/backend/platform-support/" + conversationId);
    test.skip(!response.ok(), "The configured support conversation is not accessible.");
    const body = await response.json();
    const subject = body.conversation?.subject as string | undefined;
    expect(subject).toBeTruthy();
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    await page.locator("#support-search").fill(subject!);
    await expect(page.locator(".oa-support-conversation-row").filter({ hasText: subject! })).toBeVisible();
    await page.locator(".oa-support-conversation-row").filter({ hasText: subject! }).click();
    await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  });

  test("SA-082: Super Admin can send a reply to an explicitly configured test support thread", async ({ page }) => {
    const conversationId = process.env.PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID;
    test.skip(!conversationId, "Set PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID to a dedicated OPEN test conversation.");
    const threadResponse = await page.request.get("/api/backend/platform-support/" + conversationId);
    test.skip(!threadResponse.ok(), "The configured support conversation is not accessible.");
    const thread = await threadResponse.json();
    test.skip(thread.conversation?.status !== "OPEN", "The configured test support conversation must be OPEN.");
    const subject = thread.conversation.subject as string;
    const reply = "Playwright Super Admin regression reply " + RUN_ID;
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    await page.locator("#support-search").fill(subject);
    await page.locator(".oa-support-conversation-row").filter({ hasText: subject }).click();
    await page.getByPlaceholder("Write a reply…").fill(reply);
    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/platform-support/" + conversationId &&
      response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    await expect(
      page.getByRole("region", { name: "Support conversation messages" }).getByText(reply, { exact: true }),
    ).toBeVisible();
  });

  test("SA-083: Super Admin can close and reopen an explicitly configured test support thread", async ({ page }) => {
    const conversationId = process.env.PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID;
    test.skip(!conversationId, "Set PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID to a dedicated test conversation.");
    const threadResponse = await page.request.get("/api/backend/platform-support/" + conversationId);
    test.skip(!threadResponse.ok(), "The configured support conversation is not accessible.");
    const thread = await threadResponse.json();
    const originalStatus = thread.conversation?.status as string;
    test.skip(!["OPEN", "CLOSED"].includes(originalStatus), "The configured support conversation has an unsupported status.");
    await openPage(page, "/dashboard/support", "Platform Support Inbox");
    await page.locator("#support-search").fill(thread.conversation.subject);
    const conversation = page.locator(".oa-support-conversation-row").filter({ hasText: thread.conversation.subject });
    await expect(conversation).toBeVisible();
    await conversation.click();

    const firstAction = originalStatus === "CLOSED" ? "Reopen" : "Close";
    const restoreAction = originalStatus === "CLOSED" ? "Close" : "Reopen";
    const statusButton = page.getByRole("button", { name: firstAction, exact: true });
    await expect(statusButton).toBeVisible();

    const firstPatch = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/platform-support/" + conversationId &&
      response.request().method() === "PATCH",
    );
    await statusButton.click();
    const firstResponse = await firstPatch;
    expect(firstResponse.status()).toBe(200);
    await expect(page.getByRole("button", { name: restoreAction, exact: true })).toBeVisible();

    const restorePatch = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/backend/platform-support/" + conversationId &&
      response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: restoreAction, exact: true }).click();
    const restoreResponse = await restorePatch;
    expect(restoreResponse.status()).toBe(200);
    await expect(page.getByRole("button", { name: firstAction, exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Platform audit evidence, filters, pagination, and detail inspection
  // ---------------------------------------------------------------------------

  test("SA-084: Audit Logs workspace renders the audit metrics and event register", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    await expect(page.getByRole("region", { name: "Audit log overview metrics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Filter audit data", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Audit event register", exact: true })).toBeVisible();
  });

  test("SA-085: audit API returns read-only records and filter options", async ({ page }) => {
    const response = await page.request.get("/api/backend/audit-logs?page=1&pageSize=25&includeFilters=1");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.logs ?? body.records ?? body.data)).toBe(true);
    expect(body.pagination).toBeTruthy();
  });

  test("SA-086: audit filter form exposes search, actor, target, organization, and date controls", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    await expect(page.getByPlaceholder("Search action, organization, reason, or record ID…")).toBeVisible();
    await expect(page.getByPlaceholder("admin@company.com")).toBeVisible();
    await expect(page.getByPlaceholder("Paste a target ID")).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Apply filters", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset all", exact: true })).toBeVisible();
  });

  test("SA-087: audit filter date inputs constrain the selected range", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    const dates = page.locator('input[type="date"]');
    const from = dates.nth(0);
    const to = dates.nth(1);
    await from.fill("2026-01-10");
    await expect(to).toHaveAttribute("min", "2026-01-10");
    await to.fill("2026-01-20");
    await expect(from).toHaveAttribute("max", "2026-01-20");
  });

  test("SA-088: audit search can retrieve organization creation evidence by its target ID", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    await page.getByPlaceholder("Paste a target ID").fill(seedOrganizationId);
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/backend/audit-logs" &&
        url.searchParams.get("targetId") === seedOrganizationId;
    });
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Audit event register", exact: true })).toBeVisible();
    const directResponse = await page.request.get(
      "/api/backend/audit-logs?targetId=" + encodeURIComponent(seedOrganizationId) + "&page=1&pageSize=25",
    );
    expect(directResponse.status()).toBe(200);
    const body = await directResponse.json();
    const records = body.logs ?? body.records ?? body.data ?? [];
    expect(records.length).toBeGreaterThan(0);
  });

  test("SA-089: audit actor email filter finds actions performed by the signed-in Super Admin", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    const actor = page.getByPlaceholder("admin@company.com");
    const actorEmail = process.env.PW_SUPER_ADMIN_EMAIL!.trim();
    await actor.fill(actorEmail);
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/backend/audit-logs" &&
        url.searchParams.get("actorEmail") === actorEmail;
    });
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(actor).toHaveValue(actorEmail);
  });

  test("SA-090: Reset all clears the active audit filters", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    const search = page.getByPlaceholder("Search action, organization, reason, or record ID…");
    await search.fill(seedOrganizationSlug);
    await page.getByPlaceholder("admin@company.com").fill(process.env.PW_SUPER_ADMIN_EMAIL!.trim());
    await page.getByRole("button", { name: "Reset all", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByPlaceholder("admin@company.com")).toHaveValue("");
    await expect(page.getByPlaceholder("Paste a target ID")).toHaveValue("");
  });

  test("SA-091: audit API rejects malformed date filters", async ({ page }) => {
    const response = await page.request.get("/api/backend/audit-logs?fromDate=not-a-date&page=1&pageSize=25");
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/date/i);
  });

  test("SA-092: audit event register supports 10, 25, 50, and 100 rows per page", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    const pageSize = page.getByLabel("Rows per page");
    for (const value of ["10", "25", "50", "100"]) {
      await expect(pageSize.locator("option[value='" + value + "']")).toHaveCount(1);
    }
  });

  test("SA-093: an audit row can expand its before, after, and metadata evidence", async ({ page }) => {
    await openPage(page, "/dashboard/audit-logs", "Audit Logs");
    await page.getByPlaceholder("Paste a target ID").fill(seedOrganizationId);
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/backend/audit-logs" &&
        url.searchParams.get("targetId") === seedOrganizationId;
    });
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const inspect = page.locator('button[aria-controls^="audit-detail-"]').first();
    await expect(inspect).toBeVisible();
    await inspect.click();
    await expect(page.getByRole("heading", { name: "Audit record details", exact: true })).toBeVisible();
    await expect(page.getByText("Before state", { exact: true })).toBeVisible();
    await expect(page.getByText("After state", { exact: true })).toBeVisible();
    await expect(page.getByText("Metadata", { exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // System readiness, platform authorization, and session lifecycle
  // ---------------------------------------------------------------------------

  test("SA-094: System Health workspace renders readiness status and health checks", async ({ page }) => {
    await openPage(page, "/dashboard/system-health", "System Health");
    await expect(page.getByRole("heading", { name: "Readiness status", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PostgreSQL database", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Email delivery configuration", exact: true })).toBeVisible();
  });

  test("SA-095: readiness endpoint reports database and email delivery checks", async ({ page }) => {
    const response = await page.request.get("/api/backend/health/ready");
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("ready");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("emailDelivery");
    expect(body).toHaveProperty("checkedAt");
  });

  test("SA-096: System Health screen displays the backend readiness result", async ({ page }) => {
    await openPage(page, "/dashboard/system-health", "System Health");
    await expect(page.getByText(/ready|degraded|unavailable|checking/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "PostgreSQL database", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Email delivery configuration", exact: true })).toBeVisible();
  });

  test("SA-097: Super Admin session endpoint confirms the platform role", async ({ page }) => {
    const response = await page.request.get("/api/backend/auth/me");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.role).toBe("SUPER_ADMIN");
  });

  test("SA-098: platform management APIs reject requests without a Super Admin session", async ({ browser }) => {
    const anonymous = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" },
    });
    try {
      expect(await anonymous.cookies()).toHaveLength(0);

      const sessionResponse = await anonymous.request.get("/api/backend/auth/me");
      expect(
        sessionResponse.status(),
        "A fresh context with no cookies must not have a Super Admin session.",
      ).toBe(401);

      const endpoints = [
        "/api/backend/dashboard/stats",
        "/api/backend/organizations",
        "/api/backend/organization-admins",
        "/api/backend/platform-invitations",
        "/api/backend/platform-payments",
        "/api/backend/audit-logs",
        "/api/backend/platform-support",
      ];
      for (const endpoint of endpoints) {
        const response = await anonymous.request.get(endpoint);
        const responseBody = await response.text();
        expect(
          response.status(),
          "Anonymous request must be rejected: " + endpoint + "; response: " + responseBody.slice(0, 500),
        ).toBe(401);
      }
    } finally {
      await anonymous.close();
    }
  });

  test("SA-099: audit log endpoint is read-only and does not accept mutation requests", async ({ page }) => {
    const response = await page.request.post(
      "/api/backend/audit-logs",
      {
        data: { action: "test" },
        headers: sameOriginHeaders(page),
      },
    );
    expect([400, 404, 405]).toContain(response.status());
  });

  test("SA-100: Super Admin logout revokes the session and returns to sign-in", async ({ page }) => {
    await page.getByRole("button", { name: "Logout", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const session = await page.request.get("/api/backend/auth/me");
    expect([401, 403]).toContain(session.status());
  });
});
