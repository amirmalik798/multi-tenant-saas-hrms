# Real-backend login regression suite

This is the single login regression suite for the HRMS frontend. It runs against the real Next.js frontend, the real backend API routes, and the PostgreSQL database configured by the backend. There are no Playwright route mocks, intercepted API responses, or database stubs.

## 1. Install Playwright and dotenv

Run in PowerShell:

```powershell
cd <project>\frontend
npm install -D @playwright/test dotenv
npx playwright install chromium
```

## 2. Configure frontend test credentials

Create `frontend/.env.playwright` (keep it local; never commit it):

```dotenv
# Frontend URL used by the browser. Keep localhost for local browser testing.
PLAYWRIGHT_BASE_URL=http://localhost:3001
PLAYWRIGHT_HEADLESS=false

# Configure only roles that exist in your PostgreSQL database.
PW_SUPER_ADMIN_EMAIL=super.admin@example.com
PW_SUPER_ADMIN_PASSWORD=replace-with-real-password

PW_ORG_ADMIN_EMAIL=org.admin@example.com
PW_ORG_ADMIN_PASSWORD=replace-with-real-password

PW_HR_MANAGER_EMAIL=hr.manager@example.com
PW_HR_MANAGER_PASSWORD=replace-with-real-password

PW_DEPARTMENT_MANAGER_EMAIL=department.manager@example.com
PW_DEPARTMENT_MANAGER_PASSWORD=replace-with-real-password

PW_EMPLOYEE_EMAIL=employee@example.com
PW_EMPLOYEE_PASSWORD=replace-with-real-password

# Dedicated existing account + intentionally incorrect password.
# Do not use an important administrator account for this negative test.
PW_INVALID_LOGIN_EMAIL=dedicated.login.test@example.com
PW_INVALID_LOGIN_PASSWORD=intentionally-wrong-password
```

Remove or leave blank any role credentials you do not want to run. Those role tests will be reported as skipped. The suite does not provision accounts: each configured account must already exist, be active, have the expected role/scope, and satisfy the application's organization/employment eligibility rules.

Playwright's config loads this file automatically. Process environment variables override values in the file.

## 3. Start PostgreSQL and backend

Start PostgreSQL 18 using your normal local service. Confirm it is the same database configured by the backend's `DATABASE_URL`.

In PowerShell window 1:

```powershell
cd <project>\backend

# Use the same backend environment file/settings as normal development.
# Ensure DATABASE_URL and all three distinct session secrets are configured.
# SESSION_PASSWORD, ORGANIZATION_SESSION_PASSWORD, EMPLOYEE_SESSION_PASSWORD
# must each be at least 32 characters and must be different.

npm run dev -- --port 3000
```

Wait for the backend to start successfully. Its login route queries PostgreSQL directly. Workforce-role login also updates `users.last_login_at`, as normal application behavior.

## 4. Start frontend

In PowerShell window 2:

```powershell
cd <project>\frontend
npm run dev -- --port 3001
```

The existing rewrite in `frontend/next.config.ts` sends browser requests to `/api/backend/*` through the local backend at `http://localhost:3000/api/*`. Do not change the rewrite to point at ngrok.

For local testing, use `PLAYWRIGHT_BASE_URL=http://localhost:3001`.

### Optional ngrok browser access

When your browser must go through ngrok, set the current HTTPS origin in the backend environment before starting the backend:

```powershell
$env:NGROK_ORIGIN = "https://your-current-host.ngrok-free.dev"
```

Set `PLAYWRIGHT_BASE_URL` in `frontend/.env.playwright` to that same origin and make sure the current hostname is allowed by `frontend/next.config.ts`. Restart the backend/frontend after changing these settings. The backend's exact-origin checks must allow the browser origin.

## 5. Run the complete suite

From `frontend`:

```powershell
npx playwright test --project=chromium --workers=1
```

The config deliberately selects only `tests/login-regression.spec.ts`. You can also run it explicitly:

```powershell
npx playwright test tests/login-regression.spec.ts --project=chromium --workers=1
```

Show the HTML report:

```powershell
npx playwright show-report
```

## What the single suite covers

- Login page render, accessible controls, and native required/email validation.
- Invalid email and empty credentials blocked before the login API is called.
- Password visibility and keyboard interaction.
- Forgot-password navigation, email normalization, and returning to sign-in.
- Recovery form native validation.
- Real password-reset request response for a deliberately nonexistent `.invalid` address (generic response; safe for user accounts, but still reaches the backend).
- Reset-token URL cleanup, independent visibility controls, and client-side password validation.
- A syntactically valid but unknown reset token sent to the real backend and rejected.
- Successful authentication for each configured role, validating response role/destination, the actual role-specific session verification API, workspace redirect, and HTTP-only session cookie.
- Incorrect password rejection using a dedicated existing test account.

## Important safety and interpretation notes

- A successful login test is a real database integration test, not a mock. For workforce users the normal `last_login_at` field is updated.
- The unknown-address password-reset request calls the real endpoint but should not create a token for a nonexistent account. Do not replace it with a real user's email unless you intentionally want to create/reset token state and potentially send email.
- The invalid-password test consumes one rate-limit attempt for the dedicated test email. Avoid running it repeatedly.
- The unknown-token completion test calls the real route, exercises token validation/rate limiting, and should not mutate a real account.
- Missing credentials are skipped, not counted as passing role-login tests. Review the Playwright summary and make sure every expected role test actually ran.
- Tests that inspect the UI/perform client-side validation do not need backend requests. Tests explicitly marked as real backend integration wait for the actual API response.
- The test runner cannot connect to the user's machine/database from this GitHub source-editing environment. Run the commands above locally to verify your backend and PostgreSQL.

---

# Super Admin workspace end-to-end regression suite

The Super Admin suite lives in `tests/super-admin-workspace-regression.spec.ts` and runs independently from the login suite. It exercises the real frontend, backend routes, email provider and PostgreSQL database. Its fixtures are provisioned by the suite itself; payment IDs and support-conversation IDs are not entered manually.

## Required local setup

Use a **dedicated disposable PostgreSQL test database**. The suite creates organizations and administrator accounts, sends invitations, submits payment proofs, approves and rejects payments, creates a support conversation, and deliberately expires one of its own invitations. Do not point it at production or a database containing important customer data.

Create or update `frontend/.env.playwright`:

```dotenv
PLAYWRIGHT_BASE_URL=http://localhost:3001
PLAYWRIGHT_HEADLESS=false

PW_SUPER_ADMIN_EMAIL=your-active-super-admin@example.com
PW_SUPER_ADMIN_PASSWORD=your-real-super-admin-password

# Must exactly match DB_NAME in the backend environment.
# This must be a dedicated disposable test database.
PW_TEST_DATABASE_NAME=hrms_playwright_test
```

Do not add database passwords, session secrets, Mailtrap tokens, or Google Apps Script secrets to this file. The Playwright config loads the backend environment from `backend/.env.local` or `backend/.env` before the test imports the backend PostgreSQL pool. Keep those backend secrets in the backend environment file, which is already git-ignored.

The following backend settings must be configured in the backend environment and must point to the same test database used by the running backend:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
- `SESSION_PASSWORD`, `ORGANIZATION_SESSION_PASSWORD`, and `EMPLOYEE_SESSION_PASSWORD`, each at least 32 characters and all different.
- A working email delivery provider. The suite creates and delivers several Yopmail test invitations and expects the real invitation endpoint to return `201` with `emailSent: true`.
- The normal frontend/backend origin and request-security settings required by local development.

The suite checks `SELECT current_database()` against `PW_TEST_DATABASE_NAME` before it creates test records. It also rejects database names that look like production names. This is a guard, not a substitute for configuring a dedicated test database correctly.

## Start the application

PowerShell window 1:

```powershell
cd <project>\backend
npm run dev -- --port 3000
```

PowerShell window 2:

```powershell
cd <project>\frontend
npm run dev -- --port 3001
```

Wait until both servers are ready. The Playwright config uses the existing frontend rewrite to reach the backend at port 3000.

## Run the suite

From `frontend`:

```powershell
npm run test:super-admin
```

Or run the Playwright command directly:

```powershell
npx playwright test --config=playwright.super-admin.config.ts --project=chromium --workers=1
```

The suite opens Chromium visibly when `PLAYWRIGHT_HEADLESS=false`. To run headless, set `PLAYWRIGHT_HEADLESS=true`.

Open the HTML report:

```powershell
npx playwright show-report
```

## Workflows provisioned and exercised

The suite now builds its own fixtures from the real application flows:

- Creates a PENDING_SETUP organization and sends an initial Organization Admin invitation.
- Creates another organization, delivers an Organization Admin invitation, accepts it, and verifies the activated organization and administrator.
- Creates a second active Organization Admin so suspension can be tested without bypassing the last-active-admin safeguard.
- Submits a real payment proof through the Organization Admin licensing API, approves it in the Super Admin workspace, then submits a second proof and rejects it with an audit reason.
- Creates a support conversation through the Organization Admin support API so Super Admin can open it, reply, close it, and reopen it.
- Creates a further invitation and advances only that test invitation's `expires_at` in PostgreSQL. It then exercises the actual invitation-preview endpoint and verifies the record becomes `EXPIRED`.

No `PW_SUPER_ADMIN_PAYMENT_REVIEW_ID`, `PW_SUPER_ADMIN_APPROVE_PAYMENT_ID`, `PW_SUPER_ADMIN_REJECT_PAYMENT_ID`, or `PW_SUPER_ADMIN_TEST_SUPPORT_CONVERSATION_ID` settings are required.

## Interpreting skips and failures

The Super Admin spec contains no intentional `test.skip()` or `test.fixme()` statements. Missing credentials, the wrong database, failed invitation delivery, inaccessible fixtures, or an unexpected record state fail the setup/test rather than silently skipping the workflow. A run with no skipped tests is not automatically a passing run: review failures and verify that the end-to-end transactions completed and persisted correctly.

Fixtures are uniquely named per run. They are created in the dedicated test database and are not automatically deleted, so use that database only for automated testing and reset it when appropriate.

