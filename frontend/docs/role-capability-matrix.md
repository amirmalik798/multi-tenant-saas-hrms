# Role and workspace matrix

The matrix describes the frontend composition and intended access boundaries. A menu item is never an authorization grant; the source backend remains authoritative for every request.

| Feature | Super Admin | Organization Admin | HR Manager | Department Manager | Employee |
|---|---|---|---|---|---|
| Overview | Platform-wide | Organization-wide | HR operations | Assigned-team overview | Personal day |
| Organization directory | Platform tenant directory and lifecycle | Own organization record | Not exposed | Not exposed | Not exposed |
| Organization Admin accounts | Platform-wide review and permitted suspend/reactivate | Own account | Not exposed | Not exposed | Not exposed |
| Workforce directory | No direct tenant workforce management | Tenant-scoped management | HR management, subject to permissions | Assigned team only | No directory |
| Workforce create/edit | Not exposed | Where backend permits | Where backend permits; HR role creation is restricted | No admin create/edit affordance | No |
| Workforce activate/deactivate | Not exposed | Yes, tenant-scoped; server synchronizes the linked account and session version | Only with `employee.update` + `employee.status.change` | Assigned-department Employee records only; server enforces scope and hierarchy | No |
| Departments | No direct tenant department management | Tenant-scoped management, including edit and activate/deactivate | HR management, subject to permissions, including edit and activate/deactivate | Assigned department context only | No admin directory |
| Organization chart | Not exposed | Tenant-scoped directory view | HR Manager endpoint | Not exposed | Not exposed |
| Invitations | Platform Organization Admin invitation registry and initial invite creation | Tenant invitation registry and permitted actions | Permission-scoped registry and actions | Not exposed | Accept own invitation only |
| Attendance calendar | Not exposed | Tenant scope; selectable From/To range | HR scope; selectable From/To range | Assigned-team scope; selectable From/To range | Own records; selectable From/To range |
| Clock in/out | Not exposed | Organization timezone clock display; no workforce punch action | Own clock actions | Own clock actions | Own clock actions |
| Attendance corrections | Not exposed | Review | Review; own correction request is separate | Own + assigned-team list; own item cannot self-approve | Own requests only |
| Overtime | Not exposed | Review | Review; own requests separate | Own + assigned-team list; backend applies scope | Own requests only |
| Excess overtime review | Not exposed | Review | Review | Assigned-team review | Not exposed |
| Schedules | Not exposed | Tenant schedule management; search by employee name/code/department | HR schedule management; search by employee name/code/department | Team schedule view; search by employee name/code/department | Own schedule |
| Leave | Not exposed | Tenant review and holiday administration | HR review and holiday administration | Managed-team review | Own requests and status |
| Pay rates | Not exposed | Tenant management | HR management, excluding own rate changes | Not exposed | Not exposed |
| Salary payments | Platform payment submission review and license approval; UI does not transfer funds | Tenant payment records; UI does not transfer funds; can generate individual and combined month-range payslips | Team salary payment records; cannot record own payment; can generate individual and combined month-range payslips within authorized payroll scope | Scoped read-only payment visibility | Own payment history |
| Personal earnings and payslips | Not applicable | Not applicable | Own earnings estimate and own month-range payslip | Own earnings estimate and own month-range payslip | Own earnings estimate and own month-range payslip |
| Reports | Not exposed | Organization attendance reports | HR reports | Scoped attendance reports | Own attendance reports |
| Workforce messages | Not exposed | Reporting-line conversations | Reporting-line conversations | Reporting-line conversations | Reporting-line conversations |
| Platform support | Platform-wide support inbox and replies | Private Organization Admin-to-platform conversations | Not exposed | Not exposed | Not exposed |
| Audit logs | Platform-wide audit records | Not exposed | Not exposed | Not exposed | Not exposed |
| Organization setup/settings | Create and review tenants; no organization setup bypass | Yes; server setup gate | No | No | No |
| Organization license/payment proof | Review payments and license state; no proof upload | Yes | No | No | No |
| Personal profile | Platform identity in platform shell | Admin's own details/photo | Own employee details/photo | Own employee details/photo | Own employee details/photo |
| Change password | Password reset is available from the shared sign-in flow | Yes | Yes | Yes | Yes |

## Role responsibilities carried into the workspace

**Organization Admin** owns tenant-wide administration: organization setup/profile and licensing, the workforce and department directory, employee invitations, organization schedules, attendance oversight, leave and holiday administration, reports, pay-rate configuration, and monthly payment records. The admin can view the organization clock in the header but does not receive a personal clock-in/out action because the Organization Admin session is not a workforce employee session.

**HR Manager** runs day-to-day HR operations within assigned permissions: workforce creation/editing and status lifecycle, department administration, invitations, schedules, attendance reviews and corrections, overtime, leave/holidays, pay rates, payroll and reports. The HR Manager also has a separate personal employee identity for their own clock-in/out, attendance and payslips. HR Managers cannot change their own pay rate or record their own salary payment.

**Department Manager** operates within departments assigned by the backend: views their team, team attendance and schedules, reviews eligible team requests, and uses scoped reporting and read-only team payment views. The Department Manager's own workforce record remains a personal identity with clock-in/out and own earnings/payslips. In the workforce directory, the Department Manager cannot create/edit records and may only activate/deactivate Employee-role members that the backend confirms are in their assigned departments.

**Employee** has a self-service workspace: personal dashboard, assigned schedule, clock-in/out, own attendance history, leave/request workflows, own earnings and payslips, communication, and personal profile/password actions. Employees do not receive workforce-directory, department-administration, pay-rate, or payroll-management actions.

## Super Admin notes

- Super Admin uses the platform session, not an organization or workforce session.
- Super Admin can create organizations, send initial Organization Admin invitations, manage permitted organization lifecycle transitions, review Organization Admin accounts, review payment submissions, handle platform support, and inspect platform audit records.
- Opening an organization record does not convert the Super Admin into an Organization Admin. Tenant-scoped HR/workforce actions remain in the organization's authorized workspace and backend.
- The standalone integration does not yet reproduce every legacy screen interaction. Payment-proof viewing, invitation resend/revoke, the complete organization-user action set, and advanced audit filters remain follow-up work.

## Workforce operations added in this patch

- Organization Admin can activate or deactivate tenant workforce members. HR Manager can do so only when both `employee.update` and `employee.status.change` are present. Department Manager may change the status of Employee-role members only within assigned departments; the backend still enforces the assignment relationship.
- Former employees are not offered a direct activation action. Rehire is a separate workflow. Primary HR Manager constraints and linked-account consistency are also enforced by the source API.
- Departments can be edited and their status changed between ACTIVE and INACTIVE when the role has the corresponding permissions. Deactivating a department also marks currently active members assigned to it inactive and synchronizes linked account access in the backend transaction. Activating the department does not reactivate those employees.
- The inspected source `backend/app/api/departments/[id]/route.ts` implements GET and PATCH only. It has no DELETE handler. The new frontend therefore offers deactivation, which preserves department and history data, instead of a nonfunctional hard-delete action.
- Attendance calendar date ranges are split into inclusive windows of at most 31 days because that is the source API's per-request maximum. Offset pagination is followed for every window.
- HR Manager and Organization Admin can generate an individual employee payslip or a combined workforce report for a selected month range. Workforce self-service payslips use the authenticated employee's own ID. Payslip generation reads backend calculations and current payment statuses; it does not create or change payments. The source API supports up to 24 months per employee slip and limits combined generation by authorized roster size / employee-month statements.
- The top-bar clock uses the organization timezone. Clock actions are available only to workforce identities with an employee link; Organization Admin receives the organization clock display without an employee punch control. Clock eligibility, permitted windows and current state remain server-authoritative.

## Notes

- HR Manager and Department Manager have an employee identity. Their personal attendance/earnings and management workflows remain separate in navigation and page composition.
- Department Manager list, review, leave, and report scopes are derived server-side from assigned departments.
- The source invitation endpoints and backend hierarchy checks remain authoritative. The UI must not offer unsupported role/manager combinations as a shortcut.
- Employee pages are intentionally task-focused and mobile-first.
