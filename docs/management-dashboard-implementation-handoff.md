# Management Dashboard — Implementation Handoff

**Project:** Multi-Tenant SaaS HRMS  
**Repository:** amirmalik798/multi-tenant-saas-hrms  
**Active branch:** main  
**Roadmap:** 14 steps  
**Current status:** Step 6 complete; Steps 1–6 complete; Steps 7–14 remain

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

## 6. Current dashboard behavior to preserve during integration

The current dashboard implementation is in `frontend/src/components/features/WorkspaceDashboard.tsx`.

- Organization Admin loads `/org/dashboard/stats` and `/org/dashboard/activity?limit=8`.
- HR Manager loads `/hr-manager/overview`.
- Department Manager loads `/department-manager/overview` and separately loads `/leave/requests` for its current pending leave display.
- HR Manager and Department Manager render `PersonalMyDayWorkspace` before the management overview.
- Employee route renders `EmployeeMyDayWorkspace`.
- The shared workforce KPI section is available as an opt-in component backed by `/management-dashboard/workforce-summary`; it is not yet mounted into any live role dashboard.
- Existing role-specific KPI labels, departments, attention links, activity panels and review queue destinations must remain functional during the gradual rollout.

Do not replace these data sources until the replacement has been verified against the existing behavior and contracts.

## 7. Remaining implementation roadmap

### Step 7 of 14 — Attendance and working-hours analytics

**Goal:** Add reliable attendance pulse and hours metrics.

**Implementation approach:**
1. Inspect current schedules, work schedule assignments, approved leave/holiday handling, attendance event streams and correction resolution.
2. Reuse server-side `calculateDailyAttendance`; never recreate attendance calculations in React or an unverified SQL shortcut.
3. Reconcile the current-day eligible scheduled population, present population, open sessions, completed sessions, not-yet-due and post-shift no-clock-in states.
4. Calculate attendance rate only with the contract's eligible denominator. Zero denominator is N/A.
5. Add historical daily trends only after period boundaries and effective correction rules are verified.
6. Display scheduled, regular worked, potential overtime, and payable overtime separately.
7. Preserve the current personal My Day attendance data and clocking logic.

**Acceptance:** role-scoped numbers reconcile with existing attendance calendar/report results for the same dates, including approved corrections and organization timezone.

### Step 8 of 14 — Workforce composition and movement analytics

**Goal:** Add consistent composition charts and reliable workforce trends.

**Implementation approach:**
1. Build department and employment-status composition from the Step 6 workforce scope.
2. Ensure chart totals reconcile with shared KPI totals.
3. Audit `employee_history` event types and effective date semantics before implementing joiners, departures or turnover.
4. If those semantics cannot be proven, ship composition only and clearly defer movement/turnover.
5. Provide text legends, accessible summaries and authorized detail routes.

**Acceptance:** charts reconcile to the exact workforce population; no guessed hire/termination classification or turnover rate.

### Step 9 of 14 — Leave and workforce availability

**Goal:** Present approved leave and availability consistently.

**Implementation approach:**
1. Reuse existing leave request workflow and role-specific review exclusions.
2. Distinguish pending requests from approved leave, people on leave and leave days.
3. Build date-overlap calculations using organization-local dates and current approved status.
4. Department Manager aggregates use only assigned departments.
5. Exclude the actor's own requests from their actionable review queue while keeping personal requests in My Day.
6. Do not add a leave entitlement system or change leave policy.

**Acceptance:** team/org metrics reconcile with authorized leave data; personal and management data stay separate; no unauthorized leave records or workflow changes.

### Step 10 of 14 — Overtime and payroll intelligence

**Goal:** Provide reliable overtime and permitted payroll summaries.

**Implementation approach:**
1. Separate pre-approved overtime requests, actual worked overtime, payable overtime, and unapproved/excess overtime.
2. Use authoritative attendance/pay calculation services and existing advance-approval rules.
3. Inspect payroll/payment records and permission matrix before exposing any aggregate amounts.
4. Never treat `/employee/earnings` as an organization/team payroll source; it is personal.
5. Never label estimates as paid or finalized payroll; never sum different currencies.
6. Department Manager sees team salary/payslip information only to the extent that current permissions already allow it.

**Acceptance:** each amount is tied to a period, currency, source state and role permission; employee-level salary details do not leak through aggregates.

### Step 11 of 14 — Management Action Center

**Goal:** Give each role one focused place for its actionable management work.

**Implementation approach:**
1. Read existing permissions and review eligibility for invitations, attendance corrections, overtime and leave.
2. Count only work items the signed-in role can act on.
3. Exclude the actor's own requests from the same actor's review queue.
4. Keep existing approval actions and their current destination routes; add links rather than duplicating approval logic.
5. Show age bands only if timestamps are reliable; call an item overdue only when an SLA policy exists.
6. Handle source errors independently so one failed queue does not become a false zero.

**Acceptance:** counts match the actual queue after applying the same server-side role and tenant filters.

### Step 12 of 14 — Role-specific management sections

**Goal:** Compose the shared sections into three complete but consistent role-aware dashboards.

**Implementation approach:**
1. Organization Admin: organization structure, invitations, manager eligibility, licensing/audit and permitted workforce/payroll oversight.
2. HR Manager: workforce operations, attendance, leave, overtime, payroll readiness and HR review actions.
3. Department Manager: assigned team composition, attendance, availability, requests and only permitted payroll insights.
4. Reuse shared cards, panels, chart frames, layouts, controls and metric components.
5. Keep My Day separate and above/beside the management view as it currently appears, preserving its behavior.
6. Retain role-specific current routes, actions and administrative workflows.

**Acceptance:** one component system; strictly distinct data scope and permitted content; no functionality is lost from the pre-existing dashboard.

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

- GitHub confirms Steps 2, 3, 4, 5 and 6 implementation commits are on `main` in sequence.
- Step 6 adds a new shared workforce-summary service and authenticated API route; the three existing overview endpoints and their response contracts are unchanged.
- The shared KPI component is exported and ready for opt-in integration; it is not mounted into the current dashboards.
- Department Manager scope is derived from the authenticated manager employee ID and assigned department relationship using SQL `EXISTS`.
- The shared workforce population explicitly excludes organization-administrator role records. Legacy dashboards retain their previous definitions until their live figures are reconciled.
- No database migration or new dependency was introduced.
- Source-level checks were performed for Step 6. No frontend/backend build, runtime/API verification or full regression suite has been run. Do not describe Step 6 as runtime-certified.
- Full regression testing remains gated until the user says **"lets test now"**.

## 10. Relevant commits

- Step 2 — KPI/access contract: `7e86cc8268aac9e811f118dbc995d66ebae03e23`
- Step 3 — secure dashboard data foundation: `01f50863412500148bd9d916cfea2e197a8f2087`
- Step 4 — reusable UI components: `d41a577cfb1a4bcdaa2f7f76ce29ecdc7a393916`
- Step 5 — shared dashboard shell and handoff: [f628153a24ab93864b1612889515a31d4e19a6f8](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/f628153a24ab93864b1612889515a31d4e19a6f8)
- Step 6 — shared workforce KPI source and component: [99d6365ef03ad5cab523319ab7e3d729d64cf80d](https://github.com/amirmalik798/multi-tenant-saas-hrms/commit/99d6365ef03ad5cab523319ab7e3d729d64cf80d)

Step 1 was completed as source audit and UX blueprint work and did not create a repository commit.
