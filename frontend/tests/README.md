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
