# Real-backend login tests

These Playwright tests use the real Next.js frontend, the real backend login API, and the PostgreSQL database configured by your backend. Authentication requests are not mocked or intercepted.

## Safety

- Use dedicated test accounts where possible.
- The suite does not create, suspend, delete, or change passwords for accounts.
- A successful employee login updates that employee user's `last_login_at` field, as the application normally does.
- The invalid-password test consumes one login rate-limit attempt. Use a dedicated test account and do not repeat it excessively.
- Password-reset submission/completion and account-status mutation tests are intentionally not included in this first real-database suite because they write reset-token/account state or send email. They should be added only with a controlled test workflow.

## Install

From `frontend`:

```powershell
npm install -D @playwright/test
npx playwright install chromium
```

## Start the application

In separate PowerShell windows, start the backend and frontend using the project's existing environment configuration:

```powershell
# Backend window
cd <project>\backend
npm run dev -- --port 3000
```

```powershell
# Frontend window
cd <project>\frontend
npm run dev -- --port 3001
```

The frontend's existing rewrite sends `/api/backend/*` requests to `http://localhost:3000/api/*`.

## Configure dedicated account credentials

In the PowerShell window used to run Playwright, set the credentials for existing ACTIVE test accounts. Do not commit these values or put them in source files.

```powershell
$env:PW_SUPER_ADMIN_EMAIL = "..."
$env:PW_SUPER_ADMIN_PASSWORD = "..."

$env:PW_ORG_ADMIN_EMAIL = "..."
$env:PW_ORG_ADMIN_PASSWORD = "..."

$env:PW_HR_MANAGER_EMAIL = "..."
$env:PW_HR_MANAGER_PASSWORD = "..."

$env:PW_DEPARTMENT_MANAGER_EMAIL = "..."
$env:PW_DEPARTMENT_MANAGER_PASSWORD = "..."

$env:PW_EMPLOYEE_EMAIL = "..."
$env:PW_EMPLOYEE_PASSWORD = "..."
```

Role tests without both environment variables are reported as skipped. Use accounts whose organization and employment status permit login.

For the invalid-password test, configure a dedicated account email and an intentionally incorrect password:

```powershell
$env:PW_INVALID_LOGIN_EMAIL = "dedicated-login-test@example.com"
$env:PW_INVALID_LOGIN_PASSWORD = "intentionally-wrong-password"
```

Do not use an important administrator account for the invalid-password test.

## Run

```powershell
cd <project>\frontend
npx playwright test tests/login.spec.ts --project=chromium --workers=1
```

Run with a visible browser (default):

```powershell
$env:PLAYWRIGHT_HEADLESS = "false"
npx playwright test tests/login.spec.ts --project=chromium --workers=1
```

Open the HTML report:

```powershell
npx playwright show-report
```

## What this suite covers

- Login page rendering and required controls
- Client-side invalid/empty email handling
- Password visibility toggle
- Forgot-password view navigation (without submitting a reset request)
- Real login for each configured role
- Real backend response, returned role, destination, and resulting redirect
- Rejection of an incorrect password using a dedicated test account

These are real integration/browser tests, but they do not yet cover every backend security and account-lifecycle case. In particular, password reset, account suspension, organization suspension, rate limiting, and cross-role session invalidation need carefully controlled test data and should be added in a later phase.
