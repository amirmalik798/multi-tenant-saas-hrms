# API integration catalogue

All routes below are served by the existing backend and reached from the browser through the new frontend's same-origin `/api/backend/*` rewrite. This catalogue records the frontend's known calls; the backend remains the contract authority.

| Feature | Method | Backend route | Frontend usage / contract notes |
|---|---|---|---|
| Platform login | POST | `/api/unified-auth/login` | Existing credentials contract; frontend routes `SUPER_ADMIN` to `/dashboard` and other roles to their own workspaces. Backend establishes the correct independent role session. |
| Platform session | GET/POST | `/api/auth/me`, `/api/auth/logout` | `GET` confirms a database-backed `SUPER_ADMIN` platform session; `POST` clears all role sessions. |
| Platform readiness | GET | `/api/health/ready` | Reports PostgreSQL connectivity and whether the configured email mode has required settings; it does not send a test message. Can return HTTP 503 with a degraded/unavailable result payload. |
| Payment proof | GET | `/api/payment-submissions/{id}/proof` | Authenticated Super Admin or owning Organization Admin only; private, non-cacheable image response. Tenant authorization remains backend-derived. |
| Platform overview | GET | `/api/dashboard/stats` | Platform Super Admin only; organization, account, employee, invitation and monthly-registration metrics. |
| Organization directory | GET/POST | `/api/organizations` | Platform Super Admin only. GET supports server-side search, status filters, and pagination. POST requires name, slug, contact email/phone and address; optional country. Creation initializes approved organization roles and permissions atomically. |
| Organization record | GET/PATCH/DELETE | `/api/organizations/{id}` | Platform-level organization record operations. Destructive deletion is not exposed in the new UI. |
| Organization lifecycle | PATCH | `/api/organizations/{id}/status` | Permitted transitions are backend-enforced; archive and restore require a reason. Archived organizations restore into suspended status for review. |
| Organization Admin invitation registry | GET/POST | `/api/organizations/{id}/invitations` | Read organization invitations; create an administrator invitation with `{email}` (optional profile fields must be supplied together). Email delivery and invitation state remain backend-owned. |
| Organization Admin directory/status | GET/PATCH | `/api/organization-admins`, `/api/organization-admins/{id}/status` | Platform-wide admin list; status changes accept `ACTIVE` or `SUSPENDED` plus a 3–500 character audit reason. Backend protects the last active administrator and increments the session version. |
| Platform invitations | GET | `/api/platform-invitations` | Paginated and filterable platform-wide organization invitation registry. |
| Platform payments | GET/PATCH | `/api/platform-payments`, `/api/platform-payments/{id}/review` | Paginated payment queue. Review accepts `APPROVE` or `REJECT` with a rejection reason when rejecting; approval/license mutation and audit logging are atomic in the backend. |
| Platform support | GET | `/api/platform-support` | Platform support inbox; organization scope is selected by backend authorization. |
| Support conversation | GET/POST/PATCH | `/api/platform-support/{id}` | Read messages, send `{message}`, and set `{status:"OPEN"|"CLOSED",reason?}`. |
| Platform audit logs | GET | `/api/audit-logs` | Platform-wide audit list; supports pagination and filters for action, target type, actor, organization, target ID and date range. |
| Organization Admin session | GET | `/api/org/auth/me` | Distinct admin cookie; returns `user` and authenticated flag. |
| Workforce session | GET | `/api/employee-auth/me` | Distinct workforce cookie; returns role, org, employee ID, permissions. |
| Admin logout | POST | `/api/org/auth/logout` | Used only for Organization Admin. |
| Workforce logout | POST | `/api/employee-auth/logout` | Used for HR Manager, Department Manager, Employee. |
| Context | GET | `/api/workspace/context` | Organization timezone and currency. |
| License access | GET | `/api/license-access` | License access and setup completion. |
| Org dashboard | GET | `/api/org/dashboard/stats`, `/api/org/dashboard/activity` | Organization Admin only. |
| HR dashboard | GET | `/api/hr-manager/overview` | HR Manager only. |
| Department dashboard | GET | `/api/department-manager/overview` | Department Manager only; assigned department scope. |
| Employees | GET/POST | `/api/employees` | Search/pagination and accepted snake_case workforce creation fields. |
| Employee detail | GET/PATCH | `/api/employees/{id}` | Existing read/update allowlist and permission checks. The PATCH body can include `employment_status: "ACTIVE"|"INACTIVE"`; the backend applies role/department restrictions, linked account synchronization and session-version invalidation. `FORMER` is not directly reactivated through this control. |
| Own employee profile | GET | `/api/employees/me` | Employee-only self endpoint. HR/DM read their own linked profile by authenticated ID route. |
| Departments | GET/POST | `/api/departments` | POST `{name, description}`; ownership is not accepted in create body. |
| Department detail | GET/PATCH | `/api/departments/{id}` | PATCH accepted fields include `name`, `description`, `status`, `manager_id`; server validates manager eligibility. Deactivation also marks current active department members inactive and synchronizes linked accounts in the backend transaction. The inspected route has no DELETE handler; the frontend therefore offers deactivation, not hard deletion. |
| Invitations | GET | `/api/org/invitations` | Tenant registry: `page`, `limit`, `q`, `status`, optional `employeeId`; returns `invitations`, `summary`, `pagination`. |
| Create workforce invite | POST | `/api/employees/{id}/invitation` | Existing accepted role input (`roleName` or role ID); backend validates hierarchy. |
| Resend/revoke invite | POST | `/api/employees/{id}/invitation/resend`, `/api/employees/{id}/invitation/revoke` | Existing state/role restrictions remain server-enforced. |
| Admin invite acceptance | GET/POST | `/api/invitations/accept` | GET preview with `token`; POST uses token, first/last name, phone, country, city, password. |
| Workforce invite acceptance | GET/POST | `/api/employee-invitations/accept` | GET preview with token; POST `{token,password}`. |
| Attendance calendar | GET | `/api/attendance/calendar` | Requires `fromDate`/`toDate`; returns authoritative `today` and `timeZone` with scoped calendar data. Each request is limited to 31 calendar days and supports `offset` pagination (up to 2,000 rows per response); the frontend chunks longer selected ranges and follows `nextOffset`. |
| Clock events | GET/POST | `/api/attendance/events` | POST body only `{action:"CLOCK_IN"|"CLOCK_OUT"}`. |
| Correction requests | GET/POST/PATCH | `/api/attendance/corrections`, `/api/attendance/corrections/{id}` | POST accepted event/time/reason fields; PATCH `{decision:"APPROVE"|"REJECT", reviewerNote?}`. HR self-list uses `scope=self`. |
| Overtime requests | GET/POST/PATCH | `/api/attendance/overtime`, `/api/attendance/overtime/{id}` | POST `{requestType:"PREAUTHORIZATION",workDate,requestedMinutes,reason}`; PATCH decision and optional approved minutes/note. |
| Excess-time review | GET/PATCH | `/api/attendance/excess-overtime`, `/api/attendance/excess-overtime/{id}` | GET requires `fromDate`,`toDate` (61-day max), response key `cases`; PATCH `{decision:"MARK_REVIEWED"|"FOLLOW_UP",reviewerNote?}`. |
| Schedules | GET/POST/PATCH | `/api/schedules`, `/api/schedules/{id}` | Existing schedule definition payload/day validation. |
| Schedule assignments | GET/POST | `/api/schedule-assignments` | POST `{employeeId,scheduleId,effectiveFrom,effectiveTo?}`; role/employee eligibility enforced server-side. |
| Leave requests | GET/POST/PATCH | `/api/leave/requests`, `/api/leave/requests/{id}` | POST own request; PATCH `{status:"APPROVED"|"REJECTED"|"CANCELLED",reviewerNote?}`. |
| Public holidays | GET/POST/DELETE | `/api/leave/holidays`, `/api/leave/holidays/{id}` | Admin/HR maintenance permissions unchanged. |
| Pay rates | GET/PUT | `/api/attendance/pay-rates` | GET uses employeeId; PUT uses effective-dated rate fields. |
| Payroll payments | GET/PUT | `/api/payroll/payments` | GET uses `month=YYYY-MM`; PUT records existing payment state/reference/notes; backend does calculation. |
| Own earnings | GET | `/api/employee/earnings` | `month=YYYY-MM`; backend-calculated personal estimate and daily breakdown. |
| Payslip roster | GET | `/api/payroll/payslips` | `startMonth=YYYY-MM&endMonth=YYYY-MM`; returns the authenticated role's authorized employee roster for combined report generation, with backend roster/range limit metadata. |
| Individual payslip | GET | `/api/payroll/payslips/{employeeId}` | `startMonth=YYYY-MM&endMonth=YYYY-MM`; backend-authorized monthly statements with attendance, rates, currencies and current payment status. Maximum 24 months; generation is read-only and does not mutate payment records. |
| Reports | GET | `/api/attendance/reports/monthly` | Existing targets/JSON/PDF modes and date-range validation. |
| Workforce messages | GET/POST | `/api/communications`, `/api/communications/{id}` | Recipient and conversation scope resolved by backend. |
| Notifications | GET | `/api/notifications/summary` | Role-specific counts/deep links. |
| Org settings | GET/PATCH | `/api/org/settings` | PATCH accepted timezone, locale, currency, date, week, days, country, legal entity fields. |
| Complete setup | POST | `/api/org/settings/complete` | Body `{}`; backend revalidates required settings. |
| Org profile | GET/PATCH | `/api/org/profile` | Own admin profile only. |
| Admin profile photo | GET/PUT | `/api/org/profile/photo` | Multipart field `photo`, maximum 25 KB; JPEG/PNG/WebP. |
| Workforce profile photo | GET/PUT | `/api/employees/me/photo` | Multipart field `photo`, maximum 25 KB; JPEG/PNG/WebP. |
| Org logo | GET/PUT/DELETE | `/api/org/logo` | Multipart field `logo`, maximum 100 KB; JPEG/PNG/WebP. |
| License | GET | `/api/org/license` | License state and bounded payment history. |
| Payment proof | POST | `/api/org/license/submissions` | Multipart `proofImage`; headers `X-Payment-Amount`, `X-Payment-Currency`, optional `X-Transaction-Reference`; 5 MB max. |
| Platform support | GET/POST | `/api/platform-support` | Organization Admin support inbox and create `{subject,message}`. |
| Support thread | GET/POST/PATCH | `/api/platform-support/{id}` | Reply `{message}`; status `{status:"OPEN"|"CLOSED",reason?}`. |
| Change password | POST | `/api/auth/change-password` | Existing current/new/confirmation contract and backend password policy. |
| Password reset request | POST | `/api/password-reset/request` | `{email}`; generic response to avoid account enumeration. |
| Password reset completion | POST | `/api/password-reset/complete` | `{token,password,confirmPassword}`; server validates token/password. |

## Request conventions

- All authenticated requests use `credentials: "same-origin"` and `cache: "no-store"`.
- `Content-Type: application/json` is added only for JSON bodies. `FormData` uploads keep browser-generated multipart boundaries.
- Mutations preserve same-origin protections; do not automatically retry non-idempotent writes.
- API errors retain HTTP status and the backend's human-readable message.
- Do not log passwords, cookies, reset/invitation tokens, message bodies, payment proof bytes, or sensitive profile data.

## Super Admin implementation caveats

The standalone platform workspace currently implements the platform overview, organization directory/detail/create, initial Organization Admin invitations, permitted organization lifecycle changes, Organization Admin directory with reasoned suspend/reactivate controls, platform invitation list, payment approval/rejection, support threads/replies/status, and audit-log listing. The readiness screen and authenticated payment-proof image viewing use their existing backend endpoints. Invitation resend/revoke controls, the full organization-user action set, and advanced audit filter controls are not yet at full legacy-screen parity.

## Contract caveat

The table is the observed inventory used by this implementation, not a replacement for source route handlers. Before any release against a newer backend commit, re-check the precise current handlers, field allowlists, status codes, permission checks, and deployment cookie/origin setup.
