# Management Dashboard KPI and Access Contract

**Status:** Step 2 of 14 — metric dictionary and access contract  
**Applies to:** Organization Admin, HR Manager, Department Manager  
**Implementation rule:** Additive dashboard work only. Existing HRMS behavior remains authoritative unless a future step explicitly documents and approves a separate business-rule change.

## 1. Non-negotiable preservation rules

1. Do not replace, rename, remove, or silently change existing API routes, response fields, permissions, workflow transitions, or business rules.
2. Do not change the completed Employee My Day experience or the personal My Day section shown to HR Managers and Department Managers.
3. Keep each role's existing management pages, review queues, approval actions, payroll workflows, reports, and navigation destinations working.
4. Do not change database schemas or introduce migrations merely to make a dashboard chart possible. First use existing authoritative data and calculations. Record a genuine data gap when the current model cannot support a trustworthy metric.
5. Do not duplicate attendance, overtime, leave, or payroll calculations in React. Reuse the existing server-side domain calculations and authoritative endpoints.
6. All tenant and role/department scoping is enforced server-side from the authenticated actor. Frontend filtering is presentation-only and never an authorization boundary.
7. Build new dashboard services additively. Existing endpoints remain available to their current consumers; new aggregate fields or endpoints must not break existing response contracts.
8. Maintain existing database transaction boundaries and read/write behavior. Dashboard aggregations are read-only. Where multiple queries form one snapshot, use a consistent read transaction.
9. Do not turn unavailable data into zero. A genuine zero, unavailable metric, incomplete source, and not-applicable state must be distinguishable.
10. Do not run the full regression campaign until the user explicitly asks to test. Use narrow, task-specific verification during implementation.

## 2. Role and data-scope contract

| Role | Authorized dashboard population | Management purpose |
|---|---|---|
| Organization Admin | The authenticated organization only | Organization structure, workforce health, administration, licensing and organization-wide oversight |
| HR Manager | The authenticated organization only, within existing HR permissions | Organization-wide people operations, HR review workload and workforce trends |
| Department Manager | Employees in departments whose `departments.manager_id` matches the authenticated manager's employee ID, within existing permissions | Team operations, availability and decisions for assigned departments |

### Scope invariants

- Derive the organization from the authenticated session. Never accept an organization ID from the browser as authority.
- Derive a Department Manager's department scope from the authenticated manager identity and the department-manager relationship in the database. A browser-supplied department ID may only narrow an already authorized scope; it must never widen it.
- Use a unique employee population when a manager owns multiple departments. A person assigned to more than one authorized grouping must not be double-counted.
- Workforce managers are employees too. Include an HR Manager or Department Manager in workforce/attendance measures when their employee record, employment status, schedule and the metric definition qualify. Their personal My Day remains separate from aggregate management statistics.
- Organization Admin accounts are not automatically workforce members. Use the canonical organization/workforce role and existing account-linkage rules; do not infer employee status from a display label.
- The shared workforce KPI population excludes employees whose organization-scoped workforce role is `ORGANIZATION_ADMIN`, `ORG_ADMIN`, or `ORGANIZATION_ADMINISTRATOR`. A missing linked role continues to use the established `EMPLOYEE` fallback. Existing dashboard endpoints retain their historical definitions and must not be silently changed.
- Management review counts must follow the same eligibility rules as the corresponding review workflow. Never count an actor's own request as an item they can approve.
- An HR Manager's own personal requests and an HR Manager's authorized review queue are different datasets. Do not mix them.
- Department Manager team metrics may include the manager's own workforce record when that record belongs to an assigned department and the metric is a team-population metric. The manager's own requests are excluded from their actionable review queue.
- Preserve existing exclusions for HR Manager leave review and other review queues. A dashboard count must not imply a manager can approve a request that the current workflow does not allow them to approve.

## 3. Canonical metric dictionary

The definitions below are the intended definitions for new management-dashboard surfaces. When an existing field uses a different historical definition, retain that field for its existing consumers and introduce a separately named metric rather than silently changing its meaning.

| Metric | Definition / calculation | Source and current readiness | Visibility |
|---|---|---|---|
| Total workforce | Count of distinct employee records in the selected scope, with employment-status breakdown. Exclude organization-administrator role records (`ORGANIZATION_ADMIN`, `ORG_ADMIN`, `ORGANIZATION_ADMINISTRATOR`) from the shared workforce population; do not mix invitation records with employees. | New `GET /api/management-dashboard/workforce-summary`; role and tenant scope come from the authenticated actor, and Department Manager scope uses an `EXISTS` relationship to assigned departments. | All three, role-scoped |
| Active workforce | Distinct in-scope employee records with `employment_status = 'ACTIVE'`. | Existing employee records and overview APIs. | All three, role-scoped |
| Inactive workforce | Distinct in-scope employee records with `employment_status = 'INACTIVE'`. | Existing employee records and overview APIs. | All three, role-scoped |
| Former workforce | Distinct in-scope employee records with `employment_status = 'FORMER'`. This is a headcount status, not a termination rate. | Existing employee records and overview APIs. | All three, role-scoped |
| Department count | Distinct departments in the manager's authorized scope; active and inactive counts remain separate. | Existing departments and current overview APIs. | Organization Admin and HR Manager: organization; Department Manager: assigned departments |
| Unassigned workforce | Active in-scope employees with no valid department assignment. Do not treat an inactive/former employee as an active staffing gap. | Existing employee/department records and Org Admin/HR overview fields. | Organization Admin and HR Manager; Department Manager only for their authorized team where meaningful |
| Department distribution | Distinct in-scope workforce by department, with active/inactive breakdown. | Existing department overview queries. | Organization Admin and HR Manager: organization; Department Manager: assigned departments |
| Pending invitations | Valid, unexpired invitations with pending status. Expired pending invitations are separate. Accepted/revoked invitations are not pending. | Existing employee invitation table and current overview APIs. | Organization Admin and HR Manager, subject to existing invitation permissions |
| Present today | Distinct eligible scheduled employees with at least one effective CLOCK_IN for the work date. Include approved correction events in the effective event stream. A person counts once even with multiple events. | Existing schedules, attendance events, correction records and `calculateDailyAttendance`; requires a new scope-aware aggregate. | All three, role-scoped |
| Scheduled workforce today | Distinct active employees with an effective active schedule assignment whose schedule contains the organization's current weekday. | Existing schedule assignment and work-schedule tables; requires shared aggregation. | All three, role-scoped |
| Attendance-eligible workforce | Scheduled workforce excluding employees on approved leave for the date and organization public holidays where the existing attendance rules prohibit clock-in. | Existing schedule, approved leave, public holiday and attendance rules; requires shared aggregation. | All three, role-scoped |
| Attendance rate | `present eligible employees / attendance-eligible workforce × 100`. If the denominator is zero, show N/A, not 0%. | Derived from the preceding canonical metrics; requires new aggregate. | All three, role-scoped |
| Not yet due | Scheduled employees whose assigned shift has not started in organization-local time. Do not classify these employees as absent. | Existing schedules and organization time zone; requires shared aggregation. | All three, role-scoped |
| No clock-in recorded | Eligible employees whose shift has started but who have not recorded an effective clock-in. Until the shift ends, label this as a live exception rather than a confirmed absence. | Existing schedules and effective attendance events; requires shared aggregation. | All three, role-scoped |
| Completed attendance / clocked out | Distinct employees with a valid effective attendance session that has a closing punch. | Existing event stream and shared attendance calculation; requires shared aggregation. | All three, role-scoped |
| Open attendance session | Distinct employees with an effective clock-in not yet closed by an effective clock-out. | Existing effective event stream and `calculateDailyAttendance`. | All three, role-scoped |
| Late arrival | First effective clock-in later than assigned shift start plus an explicit, configured grace threshold. Do not invent a threshold or label a raw post-start punch as late if no policy exists. | Schedule and attendance data exist; a verified grace-policy source must be identified before exposing this metric. | All three, role-scoped, only when policy is available |
| Confirmed absence | An eligible scheduled employee with no effective attendance after the assigned shift has ended, after any configured grace/exception rules are applied. Keep approved leave and holidays out of the denominator. | Requires agreed absence finalization rules and shared aggregation. Do not infer from a missing punch during an active shift. | All three, role-scoped |
| Regular worked hours | Sum of server-calculated regular worked minutes for unique employees and selected work dates, converted to hours for display. | Existing attendance calculation and employee earnings/day data; new team/org aggregation required. | All three, role-scoped |
| Potential overtime | Sum of calculated time beyond normal scheduled hours before authorization/payability rules. Clearly label it as potential, not approved or payable overtime. | Existing `calculateDailyAttendance` outputs. | All three, role-scoped |
| Approved overtime requests | Count of approved preauthorization requests for the period. This is a request count, not hours worked. | Existing overtime request records. | All three, role-scoped |
| Payable overtime hours | Sum of server-calculated overtime minutes that qualify as payable after actual attendance and advance-approval rules. Never substitute requested or approved minutes for actual payable minutes. | Existing `calculateDailyAttendance` and approved overtime data; new scoped aggregation required. | All three, role-scoped, subject to existing compensation visibility |
| Unapproved/excess overtime | Sum of calculated excess minutes not covered by the applicable approved overtime rules. Display separately from payable overtime. | Existing attendance calculation outputs. | HR Manager and authorized Department Manager; Organization Admin where its existing oversight permissions allow |
| Approved leave today | Count of distinct in-scope employees with an approved leave request overlapping the work date. This is people-on-leave, not number of requests or leave days. | Existing leave request records. | All three, role-scoped |
| Pending leave requests | Count of requests awaiting a decision in the current actor's authorized review workflow. Exclude the actor's own request from their actionable queue. | Existing leave request endpoint and role-specific review conditions. Must use review-authorized scope, not a generic organization count. | Organization Admin/HR Manager/Department Manager, respecting current approval workflow |
| Upcoming leave | Distinct employees and date ranges with approved leave in a selected future horizon. Show request counts separately from employee counts and leave days. | Existing approved leave records; requires shared aggregation and date filtering. | All three, role-scoped |
| Workforce availability | Count of active employees expected to be available on a date after approved leave and non-working public holidays are considered. | Existing schedules, leave and public holiday data; requires shared aggregation. | All three, role-scoped |
| Staffing coverage | Available workforce compared with an approved required-headcount target for that department/date. | Required staffing targets are not confirmed in the current model. Do not calculate or label a team understaffed until an authoritative staffing target exists. | Department Manager, HR Manager and Organization Admin only after the required data exists |
| Pending correction requests | Count of pending requests in the actor's actionable review scope. A manager's own request must not be counted as actionable by that same manager. | Existing correction requests and review scope rules. | All three, role-scoped and permission-aware |
| Pending overtime requests | Count of pending preauthorization requests in the actor's actionable review scope. | Existing overtime requests and review scope rules. | All three, role-scoped and permission-aware |
| Review backlog age | Age from the authoritative submitted/requested timestamp to now, grouped into agreed age bands. Show overdue only if an actual SLA/target exists. | Existing request timestamps; requires aggregate. SLA breach requires an explicit policy. | All three, role-scoped |
| Salary payment status | Counts/amounts of salary records by pay period and payment status, using the authoritative payroll/payment records. | Salary payment and payroll records exist; exact common reporting source and role-specific permission must be verified before use. | Organization Admin and HR Manager; Department Manager only if current permissions explicitly allow the aggregate |
| Payroll amount / labor cost | Sum of finalized or explicitly identified payroll amounts for a defined pay period and currency. Never label an estimated earnings figure as paid payroll or actual payroll cost. Do not sum different currencies. | Existing payroll/payment and pay-rate data; source, finalization state and role visibility require verification. | Organization Admin and HR Manager; Department Manager only where currently authorized |
| Workforce movement | Hires, reactivations, status changes and departures based on authoritative effective-dated history events. Define each event type before calculating. | `employee_history` exists and appears in HR overview activity; event-type semantics need verification before deriving hire/termination rates. | Organization Admin and HR Manager; Department Manager for assigned team only |
| Turnover / retention | Use a documented period formula and authoritative employee separation dates. State the denominator (for example average active headcount) and exclusions. | Not ready until employee-history event meanings and effective separation dates are verified. | Organization Admin and HR Manager; Department Manager only for sufficiently sized authorized team if policy permits |
| Manager/department eligibility | Count active departments with an eligible, active, correctly linked manager; show missing/ineligible manager separately. | Existing Org Admin/HR overview logic. Preserve the current eligibility checks. | Organization Admin and HR Manager; Department Manager may see their own assigned department metadata only |

### Metric presentation rules

- Every metric shows its reporting period or "as of" date, population/scope, and last successful update.
- Where relevant, show both count and rate. A percentage without its denominator is insufficient.
- Clearly distinguish people, requests, workdays, hours and currency amounts.
- Use organization-local date boundaries and configured time zone/week-start settings.
- For a selected historical period, use the same definition and role scope as the current period.
- A zero denominator produces N/A. A failed query produces unavailable/error, never a zero.
- Do not expose employee-level pay or sensitive personal details in aggregate charts.
- Drill-downs must open existing authorized routes or newly authorized server-filtered views; a chart click must never grant additional access.

## 4. Role-specific dashboard sections

| Shared section | Organization Admin | HR Manager | Department Manager |
|---|---|---|---|
| Workforce overview | Organization headcount, status, structure and staffing assignments | Organization headcount, HR workforce composition | Team headcount and assigned-department composition |
| Attendance and hours | Organization attendance pulse and trends | Organization attendance operations and exceptions | Assigned-team attendance and schedule adherence |
| Leave and availability | Organization-wide leave/availability overview | Leave workload and workforce availability | Team leave calendar and availability |
| Overtime | Organization-level exposure and trends | Organization overtime oversight | Team overtime and requests |
| Payroll | Administrative payroll/payment oversight under current permissions | Payroll operations and payment readiness | Team payroll only under existing permissions |
| Action Center | Organization setup, invitations, manager eligibility, administrative attention | Authorized HR review queues and HR operational attention | Assigned-team review queue and staffing attention |
| Workforce trends | Organization structure and movement | Organization-wide people trends | Assigned-team trends where data is reliable |
| Audit and licensing | Organization administrative oversight | Only HR-relevant operational insight permitted by current role | No organization-wide administrative or licensing data |

The personal My Day section is not part of this shared management aggregation. It remains its own personal-data experience.

## 5. Chart and visualization contract

| Visualization | Required data | Rules |
|---|---|---|
| Workforce composition | Active/inactive/former counts; department grouping | Use consistent workforce-population rules; chart must reconcile to KPI totals |
| Attendance trend | Daily eligible scheduled, present, not-yet-due and post-shift unrecorded counts | Rate denominator and exclusions must be consistent; don't imply a live-day absence |
| Scheduled vs actual hours | Scheduled, regular worked, payable overtime and potential/unapproved overtime minutes | Use server-calculated minutes; separate approved/payable from potential |
| Leave and availability calendar | Approved leave intervals, work schedules and holidays | Distinguish requests, people and days; do not infer coverage gaps without staffing targets |
| Review backlog | Pending request type, submitted timestamp and status | Only actionable items for the signed-in role; SLA labels require a configured target |
| Workforce movement trend | Verified effective-dated history event types | Do not ship hire/termination/turnover charts until event semantics are confirmed |
| Payroll status trend | Authoritative pay-period payment records and currency | No mixing currencies; no estimated earnings labelled as final payroll |

Charts must be keyboard accessible, have text alternatives/legends, support empty and unavailable states, and provide an authorized drill-down. Avoid decorative charts that cannot be reconciled to source data.

## 6. Data source map already present in the application

These existing sources should be reused and preserved:

- Organization Admin overview: `/api/org/dashboard/stats`.
- HR Manager overview: `/api/hr-manager/overview`.
- Department Manager overview: `/api/department-manager/overview`.
- Attendance calendar: `/api/attendance/calendar`.
- Attendance events: `/api/attendance/events`.
- Leave requests: `/api/leave/requests`.
- Attendance corrections: `/api/attendance/corrections`.
- Overtime requests: `/api/attendance/overtime`.
- Personal earnings: `/api/employee/earnings` (personal employee scope only; do not repurpose as an organization/team payroll endpoint).
- Notifications summary: `/api/notifications/summary` (preserve existing manager review behavior; personal My Day uses explicit self scope).
- Shared domain attendance calculation: `calculateDailyAttendance` in the backend attendance-calculation library.
- Organization time zone and week-start settings: `organization_settings`.

This map is not permission to change an endpoint's existing contract. New dashboards should call a new aggregate service or add strictly backward-compatible fields where that is safer.

## 7. Preservation and rollout plan

1. Before changing a dashboard, record the current role's cards, source endpoint, displayed label, navigation link, and existing workflow.
2. Keep the completed Personal My Day component and its API calls untouched by management-dashboard work.
3. Keep the existing Organization Admin, HR Manager and Department Manager management endpoints functional. Do not remove a field until every current consumer has been identified and migrated safely.
4. Prefer new shared, server-side aggregate functions/endpoints over rewriting existing business routes.
5. Reuse the existing `calculateDailyAttendance` logic; do not create a second attendance/overtime formula for charts.
6. Preserve existing review eligibility, approval rights, role permissions, tenant isolation, transaction semantics, and no-store behavior.
7. Implement shared UI components with role-specific configuration, not role-specific copies of the same card/chart.
8. A selected period or department filter may narrow the current authorized data scope only. Backend authorization remains in force for every request.
9. Roll out one dashboard section at a time. Keep the previous section or a safe fallback until the replacement is verified.
10. Verify Employee My Day, HR Manager My Day, Department Manager My Day, all three management dashboards, review queues, existing drill-down routes and organization-admin workflows after relevant changes. Full regression remains explicitly gated by the user's instruction.

## 8. Step 2 completion criteria

- Each metric has an agreed definition and source.
- Role scope and review eligibility are explicit.
- Existing fields with legacy meanings are not silently redefined.
- Metrics with missing policy/data dependencies are marked not ready instead of guessed.
- Personal data and management aggregates remain separate.
- The next step can design shared data aggregation without changing existing functionality.

