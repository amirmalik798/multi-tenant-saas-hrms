# Real-backend login tests

These Playwright tests use the real Next.js frontend, the real backend login API, and the PostgreSQL database configured by your backend. Authentication requests are not mocked or intercepted.

## Safety

- Use dedicated test accounts where possible.
- The suite does not create, suspend, delete, or change passwords for accounts.
- A successful employee login updates that employee user's `last_login_at` field, as the application normally does.
- The invalid-password test consumes one login rate-limit attempt. Use a dedicated test account and do not repeat it excessively.
- Password-reset submission/completion and account-status mutation tests are intentionally not included in this first real-database suite because they write reset-token/account state or send email. They should be added only with a controlled test workflow.
- Keep `.env.playwright` local and never commit credentials.

## Install

From `frontend`:

```powershell
npm install -D @playwright/test
npx playwright install chromium
```

## Start the application

The frontend is configured to proxy `/api/backend/*` to the backend at `http://localhost:3000/api/*`. This remains a server-to-server local connection; your browser can still open the frontend through ngrok.

For requests opened through ngrok, the backend's exact-origin protection must explicitly allow that public browser origin. Set `NGROK_ORIGIN` in the backend PowerShell window before starting the backend. Use the current HTTPS origin shown by ngrok (no path or trailing route):

```powershell
# Backend window
cd <project>\backend
$env:NGROK_ORIGIN = "https://shifty-maroon-pushpin.ngrok-free.dev"
npm run dev -- --port 3000
```

The backend now includes `NGROK_ORIGIN` in its exact-origin allowlist alongside `APP_ORIGIN` and `FRONTEND_URL`. It does not trust wildcard domains, arbitrary Host headers, or forwarded-host headers. If ngrok gives you a different hostname, update the value and restart the backend.

Start the frontend in a separate PowerShell window:

```powershell
cd <project>\frontend
npm run dev -- --port 3001
```

The frontend Next.js development configuration also permits the currently configured ngrok hostname. If that hostname changes, update `allowedDevOrigins` in `frontend/next.config.ts` to match the new ngrok hostname and restart the frontend.

To make Playwright exercise the public ngrok URL rather than localhost, set this in the PowerShell window where you run the tests:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://shifty-maroon-pushpin.ngrok-free.dev"
```

The local backend rewrite remains pointed at port 3000; do not change it to the public ngrok URL.

## Load test credentials

In the PowerShell window used to run Playwright, load your local `.env.playwright` file. Do not commit this file or put credentials in source files.

```powershell
Get-Content .env.playwright | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}
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
