# Business rules preserved by the frontend

This document records the major non-UI rules found in the source backend and the way the new frontend handles them. Server-side checks remain authoritative.

## Tenant isolation and permissions

- Organization identity is derived from the authenticated session; the browser cannot choose a tenant by sending an organization ID.
- Organization Admin is tenant-scoped and is not a platform Super Admin.
- HR Manager, Department Manager, and Employee are distinct workforce roles. Do not infer permission inheritance from hierarchy labels.
- Department Manager scope comes from departments assigned to that manager in backend queries. Changing a client route, filter, or ID must not reveal another team's data.
- Employee self-service is derived from the authenticated employee relationship.
- The frontend hides or disables actions for usability, but only backend authorization can grant or deny access.

## Session flows

- Organization Admin session: `/api/backend/org/auth/me`, logout `/api/backend/org/auth/logout`.
- Workforce session: `/api/backend/employee-auth/me`, logout `/api/backend/employee-auth/logout`.
- Unified login: `/api/backend/unified-auth/login`; the new frontend routes the returned role to its corresponding new workspace.
- Super Admin uses its independent platform session and protected `/dashboard` workspace in this standalone frontend. The Organization Admin and workforce sessions remain separate.

## Setup and license

- Organization Admin setup completion uses `/api/backend/org/settings/complete` and cannot be replaced by a client-side checkbox.
- Required setup settings are country, timezone, locale, currency, date format, and at least one working day.
- License status uses `/api/backend/license-access`; the server decides whether normal HRMS access is allowed.
- Organization Admin must be able to open License & Payments when setup/license state prevents normal tenant work.
- Submitting proof at `/api/backend/org/license/submissions` submits evidence for verification. It does not itself pay the subscription or activate the license.

## Workforce creation and invitation

- Workforce profile creation uses `/api/backend/employees` and stores a profile that remains inactive until invitation acceptance.
- Employee creation fields follow the backend names (`employee_code`, `first_name`, `last_name`, `email`, `phone`, `country`, `city`, `designation`, `joining_date`, `workforce_role`, and allowed optional profile fields).
- Department creation body only includes `name` and `description`; department manager assignment is a separate update (`manager_id`) and remains subject to server eligibility checks.
- Workforce invitation creation uses `/api/backend/employees/{id}/invitation` with the accepted `roleName` input. Resend/revoke endpoints enforce additional role and invitation-state rules.
- HR Manager cannot create an HR Manager profile. Organization Admin and HR Manager invitation permissions differ; invitation state is displayed as returned by the server.
- Workforce invitation acceptance uses `/api/backend/employee-invitations/accept`; Organization Admin invitation acceptance uses `/api/backend/invitations/accept`. The token preview is safe/read-only; the POST consumes the token and creates the account under backend transaction rules.

## Attendance and working time

- Clock actions use `/api/backend/attendance/events` with `{ "action": "CLOCK_IN" }` or `{ "action": "CLOCK_OUT" }`.
- The backend remains responsible for current punch state, active employment, assigned shift, allowed clock window, schedule eligibility, and concurrency protection.
- The frontend uses `/api/backend/attendance/calendar` and `/api/backend/workspace/context` for organization work date and timezone. Device-local date is not silently treated as the operational work date.
- Attendance calendar filters accept From/To dates. Because the source endpoint accepts a maximum of 31 calendar days in one request, longer selected ranges are divided into consecutive 31-day-or-shorter windows and each window is fully offset-paginated.
- The shared top-bar clock displays organization time. HR Manager, Department Manager and Employee have personal clock-in/out controls; Organization Admin sees the organization clock without a workforce punch action. The backend validates linked employee identity, current punch state and shift eligibility.
- Attendance correction requests use a timezone-offset date/time and either an existing original event reference or a work date for a missing punch, as accepted by the API.
- Overtime requests use `requestType: "PREAUTHORIZATION"`, a future `workDate`, whole `requestedMinutes`, and a reason. The backend validates dates and eligibility.
- Approved overtime is distinct from potential/excess time. Excess overtime reviews can be marked reviewed or sent for follow-up; excess time remains unpaid unless backend payroll rules say otherwise.
- Timesheets are not reintroduced as a user-facing feature.

## Schedules

- Schedule definitions are managed through `/api/backend/schedules` and assignments through `/api/backend/schedule-assignments`.
- Schedule assignment search is a client-side filter over the loaded authorized records and matches employee name, employee code, department and schedule name. It does not widen server-side scope.
- Effective dates, day definitions, overnight shifts, breaks, overlaps, assignment constraints, and manager eligibility remain validated by the backend.

## Leave and holidays

- Leave requests use the supported categories and server validation.
- Decision updates accept `APPROVED`, `REJECTED`, or `CANCELLED` with an optional `reviewerNote` up to the backend limit.
- Users cannot approve or reject their own leave request. Department Manager decisions are limited to their assigned departments. Backend rules prevent overlapping approved leave and exclude HR Manager requests from lower-level review.
- Public holiday create/update/delete is available only where the backend permits it; the frontend does not invent accrual or leave-balance calculations.

## Pay and payroll

- Pay rates are effective-dated and use the configured organization currency. HR Managers cannot update their own pay rates.
- Personal earnings come from `/api/backend/employee/earnings?month=YYYY-MM`; they are backend-calculated estimates, not authoritative payslips or final payroll.
- Organization/team salary payments come from `/api/backend/payroll/payments?month=YYYY-MM`.
- Payment recording uses the existing PUT contract and is limited to Organization Admin/HR Manager. HR Manager cannot record their own payment. Department Manager is read-only and scoped by backend logic.
- Individual employee payslips use `GET /api/backend/payroll/payslips/:employeeId?startMonth=YYYY-MM&endMonth=YYYY-MM`. Combined workforce payslips first retrieve the authorized employee roster from `GET /api/backend/payroll/payslips?startMonth=...&endMonth=...`, then load each statement and verify the roster again before printing. The source API allows no more than 24 months and has combined roster / employee-month limits. Personal payslips request only the authenticated employee's own ID.
- Payslip generation is read-only: it shows recorded attendance, approved corrections, approved overtime, paid leave/holidays, effective pay rates and current PAID/UNPAID status. It never records a payment, changes a payment status or transfers money.
- Workforce activation/deactivation is sent through `PATCH /api/backend/employees/:id` with `employment_status`. The backend validates role/permission, organization, employment and linked user-account state, and increments session versions when required. Former employees cannot be directly reactivated through the status control.
- Department editing and lifecycle transitions use `PATCH /api/backend/departments/:id`. Deactivation also deactivates currently active assigned employees and synchronizes their linked accounts within the backend transaction; reactivation does not reactivate those employees. The inspected source route has no DELETE method, so this frontend does not claim to hard-delete departments.
- Marking a payment paid does not transfer money. It records the payment state. The frontend asks for confirmation and shows the affected employee, period, amount, and reference.
- Missing rates, zero payable time, currency mismatch, approved overtime, and payment status are kept distinct. The browser does not recalculate payroll.

## Messages, profiles, and support

- Workforce messages use `/api/backend/communications`; the server resolves who a user may message and enforces one-to-one conversation access, length limits, and delivery/read timestamps.
- Platform support is separate from workforce messaging and is available to the Organization Admin through `/api/backend/platform-support`.
- Personal profile photo upload uses `/api/backend/employees/me/photo` for workforce users, or `/api/backend/org/profile/photo` for Organization Admin. The backend limits the upload to 25 KB and validates JPEG, PNG, or WebP image bytes.
- Organization logo upload/removal uses `/api/backend/org/logo`, with the existing 100 KB limit and allowed image types.
- Change-password and password-reset rules are server-enforced. New/change passwords must satisfy the backend's minimum length and bcrypt UTF-8 byte limit; the frontend never logs credentials or tokens.
