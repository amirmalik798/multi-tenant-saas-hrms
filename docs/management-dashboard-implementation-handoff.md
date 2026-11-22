# Management Dashboard — Implementation Handoff

**Project:** Multi-Tenant SaaS HRMS  
**Repository:** amirmalik798/multi-tenant-saas-hrms  
**Active branch:** main  
**Roadmap:** 14 steps  
**Current status:** Step 12 complete; Steps 1–12 complete; Steps 13–14 remain

## 1. Objective

Build one professional, role-aware management dashboard experience shared by:

- Organization Admin
- HR Manager
- Department Manager

The product should share visual components, metric definitions, dashboard layout, reporting controls, and data-loading patterns. It must not make the three roles equivalent. Their authority, data populations, review workflows, and permitted drill-downs remain distinct.

The intended result is one consistent dashboard system with content determined by the authenticated role and server-authorized data scope—not three copied dashboard implementations.

## 2. Non-negotiable preservation requirements

Every remaining step must preserve the following:

1. Existing API routes, response fields, authorization checks, tenant isolation, and request/response contracts.
2. Existing HRMS business rules, approval transitions, invitations, payroll workflows, attendance calculations, leave rules, and organization setup workflows.
3. Existing Employee My Day and the personal My Day sections shown to HR Manager and Department Manager.
4. Existing role-specific management links, review queues, actions, reports, and navigation destinations.
5. Existing database transaction semantics and read/write behavior.
6. No migrations unless an actual missing authoritative data source is demonstrated and the schema change is separately justified.
7. No frontend-only authorization. Every data request and drill-down must enforce tenant, role, employee, and department scope on the server.
8. No conversion of unavailable or failed values to zero. A real zero, loading state, unavailable value, and not-applicable value are distinct.
9. Do not invent attendance grace periods, staffing targets, absence rules, payroll finalization, turnover definitions, or service-level deadlines.
10. Do not run the full regression campaign until the user explicitly says **"lets test now"**. Narrow implementation checks are acceptable.

## 3. Role and data scope

| Role | Dashboard population | Boundaries |
|---|---|---|
| Organization Admin | Authenticated organization | Organization-wide administration and oversight; not platform Super Admin |
| HR Manager | Authenticated organization, within current HR permissions | Organization-wide people operations; actionable queues must retain existing workflow exclusions |
| Department Manager | Departments whose `departments.manager_id` equals the authenticated manager employee ID | Never widen beyond assigned departments; employees in multiple authorized departments must be counted once |

Additional rules:

- HR Managers and Department Managers are workforce members; include them in team/workforce metrics only when the metric's workforce definition qualifies.
- Organization Admin is not automatically a workforce member.
- A manager's personal My Day and personal requests remain separate from management aggregates and actionable review counts.
- Exclude the acting manager's own requests from their actionable review queue.
- Department filtering can only narrow an already authorized scope. A browser-supplied department ID is never proof of access.
- Use organization-configured time zone and week-start settings for reporting boundaries.

## 4. How the architecture is being built

The work is deliberately layered and additive:

1. **Metric and permission contract:** define what each metric means, the source of truth, the authorized role population, and when a metric is not ready.
2. **Server data foundation:** derive scope from the authenticated actor, centralize tenant context, and provide consistent read-only snapshots.
3. **Reusable presentation system:** build shared KPI cards, panels, grids, chart frames, legends, loading, empty and error states.
4. **Shared shell and controls:** provide a common page frame and reporting period/date/department controls. Controls are presentation state; APIs still enforce access.
5. **Data and dashboard sections:** connect one verified dataset at a time, reuse authoritative server calculations, and display the same metric in the same way across roles while varying its population and permissions.

The shell and presentation system are not allowed to create new business rules. The backend owns identity, tenant and department scope, metric calculations, period validation, and permission enforcement.

## 5. Completed work

### Step 1 of 14 — Dashboard audit and UX blueprint

**Status:** Complete; analysis and design work, no separate repository commit.

- Reviewed the existing Organization Admin, HR Manager, and Department Manager dashboard structure and overview endpoints.
- Recorded current role-specific KPI cards, activity panels, department lists, and review links.
- Confirmed the separate personal My Day placement for HR Manager and Department Manager and the Employee My Day route.
- Established that the current dashboards must be extended incrementally rather than wholesale replaced.

### Step 2 of 14 — Metric dictionary and access contract

**Status:** Complete.

**File:** `docs/management-dashboard-metric-contract.md`  
**Commit:** `7e86cc8268aac9e811f118dbc995d66ebae03e23`

The document defines workforce, attendance, hours, leave, overtime, payroll, review backlog, department and workforce-movement metrics; their source/readiness; role visibility; exclusions; and presentation rules.

Important decisions recorded:

- Attendance rates require the correct scheduled/eligible denominator.
- An employee whose shift has not ended must not be treated as absent solely because no clock-in exists.
- Approved leave, request counts, people counts and leave days are distinct.
- Approved overtime requests and actual payable overtime are distinct.
- Payroll estimates must not be presented as finalized or paid payroll.
- Turnover/movement metrics remain gated until event semantics and effective dates are verified.
- Staffing coverage remains gated until authoritative required-headcount targets exist.

### Step 3 of 14 — Unified secure data architecture

**Status:** Complete.

**Files:**
- `backend/lib/management-dashboard/scope.ts`
- `backend/lib/management-dashboard/snapshot.ts`
- `backend/lib/management-dashboard/context.ts`
- `backend/app/api/management-dashboard/context/route.ts`
- `docs/management-dashboard-architecture.md`

**Commit:** `01f50863412500148bd9d916cfea2e197a8f2087`

Implemented:

- Typed server-derived scope for Organization Admin/HR Manager and assigned-department scope for Department Manager.
- Employee and unrecognized roles fail closed in the scope mapper.
- A PostgreSQL `REPEATABLE READ READ ONLY` snapshot helper with rollback and connection release.
- A context loader for active organization metadata, timezone validation, local work date, week start and Department Manager assigned departments.
- Additive bootstrap endpoint `GET /api/management-dashboard/context`.

The endpoint is not wired into the current UI and does not replace existing overview endpoints.

### Step 4 of 14 — Reusable presentation component system

**Status:** Complete.

**Files:**
- `frontend/src/features/management-dashboard/components/ManagementDashboardPrimitives.tsx`
- `frontend/src/features/management-dashboard/components/index.ts`
- `frontend/src/features/management-dashboard/management-dashboard.css`
- `docs/management-dashboard-component-system.md`
- One additive import in `frontend/src/app/globals.css`.

**Commit:** `d41a577cfb1a4bcdaa2f7f76ce29ecdc7a393916`

Created shared grid, section heading, KPI card/grid, panel, chart frame/legend, filter bar, skeleton, empty-state and error-state primitives. They use the existing light/dark theme tokens and responsive styles. No chart package was added.

### Step 5 of 14 — Shared management dashboard shell and controls

**Status:** Complete.

**Files:**
- `frontend/src/features/management-dashboard/components/ManagementDashboardShell.tsx`
- Updated `frontend/src/features/management-dashboard/components/index.ts`
- Appended opt-in shell styles to `frontend/src/features/management-dashboard/management-dashboard.css`
- `docs/management-dashboard-implementation-handoff.md`

**Commit:** See the Step 5 commit linked alongside this handoff.

The shell provides:

- Common role-aware title, description, scope label and optional header action.
- Reporting period presets: Today, Last 7 days, Last 30 days, This month and Custom range.
- Inclusive `YYYY-MM-DD` date range values interpreted in the organization's local calendar.
- Organization timezone display and server-provided local as-of date support.
- Optional department filter populated only from caller-provided authorized departments.
- A callback to deliver changed filter state to the parent dashboard.
- Responsive layout using the application's existing theme tokens.

The shell does not fetch data, call any endpoint, decide authorization, or apply a client-side filter as a security boundary. The parent must submit the period and selected department to a backend that validates the authenticated role/scope and date range.

**Crucial preservation choice:** the current `WorkspaceDashboard.tsx`, all role routes, existing dashboard cards/panels, existing overview APIs and My Day components remain unchanged. The new shell is an opt-in component and is not mounted into live dashboards in Step 5. This prevents an unsolicited visual or workflow change before the new data sections are ready.

### Step 6 of 14 — Shared workforce KPI cards

**Status:** Complete.

**Files:**
- `backend/lib/management-dashboard/workforce-summary.ts`
- `backend/app/api/management-dashboard/workforce-summary/route.ts`
- `frontend/src/features/management-dashboard/components/ManagementDashboardWorkforceKpis.tsx`
- Updated `frontend/src/features/management-dashboard/components/index.ts`
- Appended opt-in workforce-section styles to `frontend/src/features/management-dashboard/management-dashboard.css`
- Updated `docs/management-dashboard-metric-contract.md`

**Implementation commit:** [`99d6365ef03ad5cab523319ab7e3d729d64cf80d`](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/99d6365ef03ad5cab523319ab7e3d729d64cf80d)

Implemented:

- New authenticated endpoint `GET /api/management-dashboard/workforce-summary`.
- New shared read service using the server-derived `ManagementDashboardScope` and the existing `withManagementDashboardSnapshot` transaction helper.
- A single canonical workforce population for all three roles. It excludes organization-scoped workforce role names `ORGANIZATION_ADMIN`, `ORG_ADMIN`, and `ORGANIZATION_ADMINISTRATOR`. A missing linked role uses the same `COALESCE(..., 'EMPLOYEE')` fallback already present in the HR Manager overview query.
- Organization Admin and HR Manager receive tenant-wide records. Department Manager receives only employee records whose department is linked to a department managed by the authenticated manager employee ID.
- Department Manager population uses SQL `EXISTS`, so a person cannot be counted more than once through multiple assigned departments.
- Shared counts for total, active, inactive, former, assigned and active-unassigned workforce, plus total/active/inactive department counts.
- A shared `ManagementDashboardWorkforceKpis` UI section using the reusable metric cards, grid, section heading, loading skeleton and error/retry state.
- Active-unassigned workforce is shown as N/A for Department Managers because the population is already restricted to assigned departments; it is not represented as a meaningful zero.
- The metric contract now records the shared workforce population and its role scope.

**Compatibility decision:** The legacy Organization Admin statistics query counts all employee rows, whereas the legacy HR Manager overview excludes organization-administrator role records. The legacy Department Manager team query does not use that same explicit role exclusion. Those endpoints and their existing KPI values are untouched. The new shared KPI population has one explicit definition; do not replace legacy cards until the figures have been compared against actual tenant data and the migration is deliberately performed in a later integration step.

**Crucial preservation choice:** The new KPI section is exported for reuse but is not mounted inside `WorkspaceDashboard.tsx`. Existing dashboard layout, cards, pages, approval actions, navigation, personal My Day and API consumers remain unchanged. The endpoint has no browser-supplied organization or department filter; any future narrowing must first be validated against the server-derived scope.

**Verification:** Source-level checks confirmed role resolution, tenant scoping, administrator-role exclusions, Department Manager `EXISTS` scope, snapshot usage, versioned response, shared component export, loading/error behavior, and that the existing dashboard was not wired to the new section. No build or runtime test was run.

### Step 7 of 14 — Attendance and working-hours analytics

**Status:** Implemented as an additive, opt-in source and component.

**Files:**
- `backend/lib/management-dashboard/attendance-summary.ts`
- `backend/app/api/management-dashboard/attendance-summary/route.ts`
- `frontend/src/features/management-dashboard/components/ManagementDashboardAttendanceAnalytics.tsx`
- Updated `frontend/src/features/management-dashboard/components/index.ts`
- Appended attendance-specific styles to `frontend/src/features/management-dashboard/management-dashboard.css`
- Updated the metric contract, architecture, component-system and implementation-handoff documents.

**Implemented:**
- New authenticated endpoint `GET /api/management-dashboard/attendance-summary` with inclusive organization-local `fromDate` / `toDate` filters (maximum 31 calendar days) and optional department narrowing.
- Role and tenant scope comes from the authenticated actor and the existing management-dashboard scope mapper. Department Manager queries use an `EXISTS` relationship to departments managed by the authenticated manager employee ID. A selected department is revalidated server-side.
- All data is read inside the existing `REPEATABLE READ READ ONLY` snapshot transaction.
- Scheduled employee-days are built from active workforce records, effective schedule assignments, active schedules and the assigned weekday in the organization's configured timezone. Overnight shift end times are supported.
- The effective attendance event stream includes approved correction replacements and approved missing-punch corrections as of the snapshot generation timestamp.
- Each scheduled employee-day uses the existing server-side `calculateDailyAttendance` helper. The service does not reproduce worked-hour or overtime calculations in SQL or React.
- Approved leave and organization public holidays are excluded from the attendance-rate denominator. The existing clock-in route explicitly blocks clock-in on both categories.
- Period attendance is weighted by eligible scheduled employee-days. A zero denominator is returned as `null` and displayed as N/A.
- Period summaries distinguish scheduled hours, worked hours, regular worked hours, potential overtime and payable overtime. Approved preauthorization minutes are passed into the existing calculator.
- The current-day pulse distinguishes scheduled shifts, present employees, not-yet-due shifts, missing clock-in during an active shift, open sessions and completed sessions.
- The endpoint does not infer lateness or confirmed absence. A missing clock-in during an active shift is explicitly labelled a live exception.
- A 100,000 scheduled employee-day result limit fails explicitly with HTTP 413; results are not silently truncated.
- The reusable `ManagementDashboardAttendanceAnalytics` section uses the existing component system, an accessible CSS-based daily trend, loading/error/retry states and theme-aware styles. No charting dependency or migration was added.

**Preservation:** The component is exported for later composition but is not mounted in any live dashboard in Step 7. Existing attendance routes/reports, overview APIs, clocking flows, dashboard layouts and personal My Day remain unchanged.

**Verification:** Source inspection and static source checks only. No frontend/backend build, runtime database/API validation, browser test or full regression suite was run. Live-tenant reconciliation of Step 7 attendance figures remains part of final verification in Step 14.

### Step 8 of 14 — Workforce composition and movement analytics

**Status:** Implemented as additive, current-state composition analytics. Historical movement and turnover are explicitly deferred.

**Files:**
- `backend/lib/management-dashboard/workforce-composition.ts`
- `backend/app/api/management-dashboard/workforce-composition/route.ts`
- `frontend/src/features/management-dashboard/components/ManagementDashboardWorkforceComposition.tsx`
- Updated `frontend/src/features/management-dashboard/components/index.ts`
- Appended workforce-composition styles to `frontend/src/features/management-dashboard/management-dashboard.css`
- Updated the metric contract, architecture and component-system documents.

**Implemented:**
- New authenticated endpoint `GET /api/management-dashboard/workforce-composition`.
- Reuses the exact Step 6 workforce population definition and `loadManagementDashboardWorkforceSummary` inside the same `REPEATABLE READ READ ONLY` snapshot.
- Organization Admin and HR Manager receive tenant-wide composition. Department Manager uses the authenticated manager employee ID and an `EXISTS` relationship to assigned departments.
- Employment-status composition returns active, inactive, former and total counts.
- Department composition includes every authorized department, even when its workforce count is zero, with active/inactive/former/total counts.
- Organization Admin and HR Manager receive an unassigned group for employees without a valid tenant-local department. Department Manager receives N/A because the population already excludes unassigned employees by its assigned-department scope.
- Workforce-role composition groups the same canonical employee population by its organization-scoped role.
- The service reconciles status totals to Step 6 shared workforce KPI totals, department totals to assigned employees, unassigned active employees to the Step 6 active-unassigned count, and role totals to the shared headcount. An inconsistency fails the request; it is not rendered as zero.
- New `ManagementDashboardWorkforceComposition` section uses shared chart panels, legends, loading/error states and theme-aware responsive stacked bars.
- The UI is exported but intentionally not mounted into existing dashboards in this step.

**Movement audit and decision:**
- `writeEmployeeHistory` stores event types and before/after snapshots but its insert does not set `effective_at`. The checked-in source did not establish the table default that supplies this field.
- `PROFILE_CREATED` occurs when the workforce profile is created in `INACTIVE` status pending invitation acceptance. `INVITATION_ACCEPTED` is the later transition to `ACTIVE`.
- Profile status edits write `EMPLOYMENT_STATUS_CHANGED`; the exact effective-date semantics remain unverified.
- `joining_date` is user-entered during profile creation, so it cannot be treated as the actual activation date.
- Former employees cannot be reactivated through the ordinary profile edit route, and no authoritative rehire/separation event contract was verified.
- Joiners, departures, reactivations and turnover are therefore not calculated. The API and UI explicitly mark movement analytics as deferred.

**Preservation:** Existing dashboard pages, workforce-summary/overview APIs, employee history, profile/invitation workflows and personal My Day remain unchanged. No database migration or dependency was introduced.

**Verification:** Source-level inspection and reconciliation-contract checks only. No build, runtime database/API test, browser test or full regression suite was run.

## 6. Current dashboard behavior to preserve during integration

The current dashboard implementation is in `frontend/src/components/features/WorkspaceDashboard.tsx`.

- Organization Admin loads `/org/dashboard/stats` and `/org/dashboard/activity?limit=8`.
- HR Manager loads `/hr-manager/overview`.
- Department Manager loads `/department-manager/overview` and separately loads `/leave/requests` for its current pending leave display.
- HR Manager and Department Manager render `PersonalMyDayWorkspace` before the management overview.
- Employee route renders `EmployeeMyDayWorkspace`.
- The shared workforce KPI section is mounted in all three management dashboards in Step 12. Its data source remains the canonical role-scoped `/management-dashboard/workforce-summary` endpoint.
- The Step 11 Management Action Center is mounted in all three management dashboards in Step 12; its existing approval destinations remain unchanged.
- Existing role-specific KPI labels, departments, attention links, activity panels and review queue destinations must remain functional during the gradual rollout.

Do not replace these data sources until the replacement has been verified against the existing behavior and contracts.

## 7. Remaining implementation roadmap

### Step 9 of 14 — Leave and workforce availability (implemented)

**Goal:** Present approved leave and availability consistently.

**Implementation approach:**
1. Reuse existing leave request workflow and role-specific review exclusions.
2. Distinguish pending requests from approved leave, people on leave and leave days.
3. Build date-overlap calculations using organization-local dates and current approved status.
4. Department Manager aggregates use only assigned departments.
5. Exclude the actor's own requests from their actionable review queue while keeping personal requests in My Day.
6. Do not add a leave entitlement system or change leave policy.

**Acceptance:** team/org metrics reconcile with authorized leave data; personal and management data stay separate; no unauthorized leave records or workflow changes.

### Step 10 of 14 — Overtime and payroll intelligence (implemented)

**Goal:** Provide reliable overtime and permitted payroll summaries.

**Implementation approach:**
1. Separate pre-approved overtime requests, actual worked overtime, payable overtime, and unapproved/excess overtime.
2. Use authoritative attendance/pay calculation services and existing advance-approval rules.
3. Inspect payroll/payment records and permission matrix before exposing any aggregate amounts.
4. Never treat `/employee/earnings` as an organization/team payroll source; it is personal.
5. Never label estimates as paid or finalized payroll; never sum different currencies.
6. Department Manager sees team salary/payslip information only to the extent that current permissions already allow it.

**Acceptance:** each amount is tied to a period, currency, source state and role permission; employee-level salary details do not leak through aggregates.

### Step 11 of 14 — Management Action Center (implemented)

**Goal:** Give Organization Admins, HR Managers and Department Managers one focused place for management work they are authorized to review.

**Implemented:**
- New authenticated endpoint: `GET /api/management-dashboard/action-center`.
- New snapshot-backed service: `loadManagementActionCenterSummary`, using one `REPEATABLE READ READ ONLY` transaction and tenant identity from the authenticated session.
- Four independent queue metrics: unexpired pending invitations, attendance corrections, advance overtime requests and leave requests.
- Invitations use the existing database-backed `invitation.view` permission and the same expiry rule as the invitation registry.
- Organization Admin and HR Manager review scopes follow the existing review pages; Department Manager counts are restricted to assigned departments derived from the authenticated manager employee ID.
- The current actor's own requests are excluded from every actionable review queue.
- Leave review counts preserve the existing HR-target exclusions for HR Managers and Department Managers. Attendance corrections and overtime retain their distinct existing role rules.
- Each source is isolated with its own PostgreSQL savepoint inside the shared read-only snapshot. A failed source is rolled back to its savepoint and renders **Unavailable**, a queue outside the role's authority renders **N/A**, and the overall total becomes unavailable if any permitted queue could not be read. A real zero remains zero.
- Queue links use existing navigation destinations: `/org/invitations`, `/hr/invitations`, `/org/attendance`, `/hr/work-queue`, `/dm/reviews`, `/org/leave`, `/hr/modules/leave`, and `/dm/leave`.
- The component does not implement approval actions; it links to the existing workflows. No SLA or overdue labels are invented because no authoritative SLA policy was found.
- New reusable `ManagementDashboardActionCenter` component, exported from the shared component entry point, with loading, retry/error, unavailable, not-applicable, accurate-zero and all-caught-up states.
- The component is mounted in the three role dashboards in Step 12. Existing approval workflows and personal My Day remain unchanged.

**Files:** `backend/lib/management-dashboard/action-center.ts`, `backend/app/api/management-dashboard/action-center/route.ts`, `frontend/src/features/management-dashboard/components/ManagementDashboardActionCenter.tsx`, shared component export and stylesheet, plus updated architecture, metric-contract, component-system and implementation-handoff documentation.

**Verification boundary:** Source-level checks only. No frontend/backend build, database/API runtime verification or browser test was run. No database migration, new dependency, new permission or write operation was introduced.

### Step 12 of 14 — Role-specific management sections (implemented)

**Goal:** Compose the shared management sections into three consistent role-aware dashboards without erasing role differences or existing workflows.

**Files changed:**
- `frontend/src/components/features/WorkspaceDashboard.tsx`
- `frontend/src/features/management-dashboard/components/ManagementDashboardShell.tsx`
- Updated the six Step 6–11 dashboard components to refresh their own data safely.
- Updated this handoff and the metric-contract, architecture and component-system documents.

**Implemented across Organization Admin, HR Manager and Department Manager:**
- The shared `ManagementDashboardShell` now frames the live management dashboard with role/scope labels and organization-local reporting controls.
- The default reporting period is the last 30 calendar days. The shared shell accepts an optional maximum inclusive date span; these dashboards enforce 31 days because the attendance and leave aggregate APIs enforce the same limit. Invalid custom ranges do not update the child metrics and display a clear validation message.
- The selected range feeds both attendance analytics and leave/availability analytics. Payroll/overtime uses the month containing the selected range's end date, which is displayed by the existing monthly component. Workforce KPI, workforce composition and action-center populations remain current-state/scope metrics rather than being falsely filtered by a date range.
- The six sections are now mounted in each role dashboard: workforce KPIs, workforce composition, attendance analytics, leave/availability, payroll/overtime intelligence and Management Action Center.
- Each section continues to fetch from its existing authenticated, server-scoped endpoint. No organization, employee or department identity is trusted from the browser.
- New management-section sources refresh every 60 seconds while the dashboard is active; attendance analytics and payroll/overtime also refresh immediately when the existing attendance-change event fires. Existing focus/visibility/online refresh behavior is retained.
- A failed section continues to show its own error/unavailable state; one section's failure does not replace other successful section data.

**Role-specific composition:**
- **Organization Admin:** canonical workforce KPIs and composition, organization-wide attendance/availability, aggregate payroll and overtime oversight, the Action Center, organization readiness shortcuts (unassigned workforce, department manager eligibility, organization profile/settings, licensing and invitations), and the existing recent organization activity feed. The activity feed is not represented as a formal audit log. The only audit-log page/API found is separate from Organization Admin navigation, so no Super Admin audit route is exposed to tenant users.
- **HR Manager:** organization-wide workforce and operational analytics, authorized payroll readiness, Action Center, existing HR operational destinations and the department snapshot from the existing HR overview.
- **Department Manager:** all aggregate sections use the authenticated assigned-department scope enforced by their APIs. The dashboard retains the assigned department list and team workspace destinations. Payroll/overtime remains aggregate-only under the existing permission contract and does not grant team payslip access.
- HR Manager and Department Manager `PersonalMyDayWorkspace` remains above the management dashboard. Employee `EmployeeMyDayWorkspace` is unchanged and does not render management sections.
- Existing approval destinations, invitation registry, workforce pages, department pages, attendance/leave/payroll pages, route contracts and role navigation remain in place. The Action Center only links into those workflows.

**Data-accuracy decisions:**
- The old role-specific overview API is retained only where the dashboard still needs its supplemental context: Organization Admin activity and HR/Department Manager department information. Its legacy KPI/review figures are not reused as substitutes for the shared canonical metric contracts.
- No incomplete top-eight HR department list is passed as an authoritative department filter. The reporting controls therefore narrow by date only; a department selector is not shown until the dashboard can provide a complete authorized department list consistently across all data sources.
- Workforce, attendance, leave, payroll and queue totals remain separate metrics with their own population/period definitions. Payroll amounts remain separated by currency and ledger state as defined in Step 10.
- No new approval actions, SLA labels, migrations, dependencies, permissions or write operations were added.

**Verification boundary:** Source-level checks only. The Action Center queue isolation was strengthened with per-queue savepoints so a PostgreSQL statement error does not poison sibling reads in the shared snapshot. No frontend/backend build, runtime API/database check or browser visual test was run. The full regression campaign remains gated until the user says **`lets test now`**.

### Step 13 of 14 — Interactive drill-downs and reporting

**Goal:** Make dashboard summaries useful for investigation and action.

**Implementation approach:**
1. Link each card/chart/table to an existing authorized route whenever possible.
2. For new drill-downs, implement server-side authorization from the session and scope mapper.
3. Validate date range and department filters on the server; browser values can narrow but never expand access.
4. Keep the same metric definition/population between summary and detail.
5. Add exports only where the existing permissions and source data allow them.
6. Ensure charts and controls work with keyboard and screen readers.

**Acceptance:** every drill-down preserves tenant and role scope and reconciles to its parent metric.

### Step 14 of 14 — Final refinement and verification

**Goal:** Finish the three dashboards as one coherent, production-quality experience.

**Implementation approach:**
1. Review desktop, tablet and mobile layouts in light and dark themes.
2. Check loading, empty, unavailable, error and N/A states for every section.
3. Review typography, density, chart labels, legends, numeric formatting, date/time/currency formatting and focus states.
4. Confirm keyboard navigation, reduced motion and text alternatives.
5. Review request counts/performance and avoid duplicate fetching or N+1 queries.
6. Verify existing role navigation, approvals, invitations, employee administration, personal My Day, attendance clocking, leave, overtime and payroll workflows.
7. Run the full regression suite only after the user gives the agreed explicit instruction: **"lets test now"**.

**Acceptance:** all dashboard metrics and drill-downs reconcile, roles remain isolated, old workflows still work, and the interface behaves consistently at all supported breakpoints.

## 8. Working protocol for every remaining step

1. Work on exactly one roadmap step at a time.
2. Inspect the current `main` source before making edits.
3. Recheck the last commit and preserve all unrelated changes.
4. Make additive changes where possible; do not rewrite working modules wholesale.
5. Keep existing endpoint contracts and use new endpoints/services for the new dashboard data.
6. Do not wire unverified data into visible UI.
7. Perform narrow static/source checks for the current step and report what was not runtime-tested.
8. Commit only the files relevant to the current step and verify the updated `main` head.
9. Provide a commit link and a concise implementation handoff.
10. Stop after the step; proceed only when the user asks to start the next one.

## 9. Verification status at this handoff

- Steps 2–12 are committed on `main`. Step 10 implementation commit: `5fa195a6f6158e0d1d70aa32d8f34d61ab79b954`. Step 11 implementation commit: `7d11a2b0ef0b1909acd283c2bb2cdfcd36e8f508`. Step 12 implementation commit: `<STEP12_COMMIT_SHA>`.
- Step 6's shared workforce-summary source and component remain exported but are not mounted in the existing dashboards.
- Step 7 adds the role-scoped attendance summary and reusable attendance analytics component; the UI is mounted in Step 12 with the shared 31-day reporting-range validation.
- Step 8 adds workforce-composition analytics using the Step 6 population, with current status, department, unassigned and role totals reconciled to the shared workforce KPI source.
- Step 8's employee-history audit did not establish authoritative effective dates for joining, departure or rehire; movement and turnover remain deferred rather than inferred.
- Step 9 adds the snapshot-backed leave-availability endpoint and exported opt-in component. It distinguishes approved requests, distinct people, inclusive calendar days, upcoming approved leave and scheduled availability.
- Step 10 adds `GET /api/management-dashboard/payroll-overtime?month=YYYY-MM` and the snapshot-backed `loadManagementDashboardPayrollOvertimeSummary` service.
- Step 11 adds `GET /api/management-dashboard/action-center` and `loadManagementActionCenterSummary`, with independently resilient counts for pending invitations, attendance corrections, advance overtime and leave. Counts apply existing tenant/role/self-exclusion rules; a failed queue is unavailable rather than zero. Existing workflow routes remain the action destinations. The component is mounted in Step 12.
- Payroll amount scope mirrors the existing salary-payment GET route: Organization Admin sees eligible Employees, Department Managers and HR Managers; HR Manager sees eligible Employees and Department Managers excluding self and HR targets; Department Manager sees eligible Employee-role members in assigned departments only.
- Department Managers do not gain workforce payslip access. The endpoint returns aggregate amounts only, grouped by currency; estimated payable, recorded PAID and recorded UNPAID amounts remain separate.
- Overtime preauthorization requests follow the existing overtime-request GET scope; worked actual/payable/unapproved minutes use the Step 7 active scheduled workforce and attendance calculation; persisted excess-review cases follow the existing excess-review GET scope and are read without triggering its materialization behavior.
- `ManagementDashboardPayrollOvertime` is mounted in Step 12 as an aggregate-only section. It does not change any existing payment action, payslip route or approval workflow.
- Steps 7–11 have source-level checks only. Step 10 passed 31/31 targeted source checks. Step 11 received source-contract review; no frontend/backend build, database/API runtime verification, browser testing or full regression suite has been run. Do not describe these changes as runtime-certified.
- Step 10 adds no database migration, new dependency, new permission or write operation. Existing payroll and overtime routes remain unchanged.
- Full regression testing remains gated until the user says **`lets test now`**.

## 10. Relevant commits

- Step 2 — KPI/access contract: `7e86cc8268aac9e811f118dbc995d66ebae03e23`
- Step 3 — secure dashboard data foundation: `01f50863412500148bd9d916cfea2e197a8f2087`
- Step 4 — reusable UI components: `d41a577cfb1a4bcdaa2f7f76ce29ecdc7a393916`
- Step 5 — shared dashboard shell and handoff: [f628153a24ab93864b1612889515a31d4e19a6f8](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/f628153a24ab93864b1612889515a31d4e19a6f8)
- Step 6 — shared workforce KPI source and component: [99d6365ef03ad5cab523319ab7e3d729d64cf80d](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/99d6365ef03ad5cab523319ab7e3d729d64cf80d)

- Step 7 — role-scoped attendance and working-hours analytics: [b11f1e29cdd3943cc60ecf680b7905fee73e5b8c](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/b11f1e29cdd3943cc60ecf680b7905fee73e5b8c)
- Step 8 — workforce composition and movement-readiness audit: [5c9a0c3ba8229720a5808b48a8eaa2747434de8a](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/5c9a0c3ba8229720a5808b48a8eaa2747434de8a)
- Step 9 — leave and workforce availability: [5a886962f08b6f49dcec1502e1f63c529dffab54](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/5a886962f08b6f49dcec1502e1f63c529dffab54)
- Step 9 — include ongoing approved leave in upcoming availability: [f96a27d17611a15882f9eb8514626951866929d9](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/f96a27d17611a15882f9eb8514626951866929d9)
- Step 9 — align actionable review counts with the existing approval scope: [ddf3339275cb9c6090247b189d5ce6a0aba60971](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/ddf3339275cb9c6090247b189d5ce6a0aba60971)
- Step 10 — overtime and payroll intelligence: [5fa195a6f6158e0d1d70aa32d8f34d61ab79b954](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/5fa195a6f6158e0d1d70aa32d8f34d61ab79b954)
- Step 11 — Management Action Center: [7d11a2b0ef0b1909acd283c2bb2cdfcd36e8f508](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/7d11a2b0ef0b1909acd283c2bb2cdfcd36e8f508)
- Step 12 — role-specific management dashboard integration: [<STEP12_COMMIT_SHA>](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/<STEP12_COMMIT_SHA>)
Step 1 was completed as source audit and UX blueprint work and did not create a repository commit.
