# HRMS Google Apps Script Email Gateway

This folder contains the Google Apps Script web-app gateway used by
`backend/lib/email.ts` when `EMAIL_MODE=live`.

## Backend contract

The backend sends a JSON POST request with:

- `token`: the value of `HRMS_EMAIL_SECRET`
- `category`: one of the four categories below
- `to`: one recipient address
- `subject`: email subject
- `text`: plain-text message
- `html`: HTML message

Accepted categories:

- `Organization Admin Invitation`
- `Employee Invitation`
- `Password Reset`
- `Password Changed Security Notification`

Successful response:

```json
{"ok":true}
```

Failures return JSON with `ok:false` and an `error` message. The backend checks
both the HTTP response and this JSON result.

## Create the Apps Script project

1. Open https://script.google.com/home while signed into the Google account
   that should send HRMS emails.
2. Create a new standalone project, for example **HRMS Live Email Gateway**.
3. Replace the contents of `Code.gs` with the contents of this folder's
   `Code.gs`.
4. In Project Settings, show the manifest file and replace `appsscript.json`
   with the contents of this folder's manifest.

## Configure the shared secret

1. In Render, open the `hrms-backend-production` environment group.
2. Copy the value of `HRMS_EMAIL_SECRET` without changing it.
3. In Apps Script, open **Project Settings → Script Properties**.
4. Add a property named exactly `HRMS_EMAIL_SECRET`.
5. Paste the exact same value from Render.
6. Do not put the secret in source code, GitHub, or the web-app URL.

The gateway requires a secret of at least 32 characters.

## Authorize mail sending

1. In the Apps Script editor, select `authorizeMailSending` in the function
   selector.
2. Click **Run**.
3. Review and approve the Google permission to send email.
4. This function checks the secret and remaining quota; it does not send a
   message.

## Deploy as a web app

1. Click **Deploy → New deployment**.
2. Select deployment type **Web app**.
3. Set **Execute as** to **Me** (the deploying Google account).
4. Set **Who has access** to **Anyone** (including unauthenticated callers).
   Render cannot complete an interactive Google sign-in. Access is protected
   by the shared secret in the POST body. If your Google Workspace administrator
   blocks anonymous web apps, use an account/policy that permits this setting.
5. Deploy and copy the web-app URL ending in `/exec`.

Do not use the `/dev` test URL. The backend validates the deployed
`https://script.google.com/macros/s/.../exec` format.

## Connect Render

In Render → Environment Groups → `hrms-backend-production`, set:

- `EMAIL_MODE=live`
- `GOOGLE_APPS_SCRIPT_URL=<the new deployed /exec URL>`
- `HRMS_EMAIL_SECRET=<the same secret stored in Apps Script Script Properties>`

Save and redeploy `hrms-backend` if Render does not redeploy automatically.
Do not put these values in the frontend service.

## Verify

1. Open the deployed `/exec` URL in a browser. GET should return JSON with
   `ok:true`, service name, and `status:"active"`. This is only a web-app
   health check; it does not send an email.
2. Open Render's backend readiness endpoint:
   `https://hrms-backend-usm8.onrender.com/api/health/ready`.
   It should report database `ok` and email delivery `configured`.
3. Send an invitation or password-reset email to an inbox you control. Confirm
   actual receipt. The readiness endpoint does not prove delivery.

## Operational notes

- Messages are sent using `MailApp` as the Google account that deployed the
  web app. The sender display name is **HRMS Platform**.
- The gateway sends one recipient per request and does not allow the caller to
  set CC, BCC, attachments, or the sender address.
- Daily email recipient quotas are imposed by Google and may change. The
  gateway checks `MailApp.getRemainingDailyQuota()` before sending.
- To publish code changes later, update the deployment to a new version under
  **Deploy → Manage deployments**. The existing `/exec` deployment URL can
  remain the same when that deployment is updated.
