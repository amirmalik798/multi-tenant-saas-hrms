# Management Dashboard Architecture

**Status:** Step 3 of 14 — unified, secure management-dashboard data architecture  
**Applies to:** Organization Admin, HR Manager, Department Manager  
**Rollout rule:** Additive foundation. Existing dashboard endpoints, response contracts, business logic, and personal My Day remain unchanged.

## 1. Architecture goals

The three management workspaces should share one data architecture and consistent metric definitions while retaining their different authority:

- **Organization Admin:** organization-wide administrative oversight inside the authenticated tenant.
- **HR Manager:** organization-wide people-operations data within the existing HR permissions and review workflow.
- **Department Manager:** only the departments assigned to the authenticated manager's employee record.

The shared architecture centralizes identity-to-scope mapping, tenant metadata, and read-snapshot handling. It does not grant a role broader permissions than its existing workflows.

## 2. Server-side layers

| Layer | Responsibility | Rule |
|---|---|---|
| Route boundary | Per-request execution, authenticated actor resolution, HTTP status and response shape | Never trust browser-supplied organization, employee, manager, or department IDs |
| Scope mapper | Convert the authenticated permission actor to a management-dashboard scope | Allow only Organization Admin, HR Manager, and Department Manager; all other roles fail closed |
| Snapshot runner | Open one PostgreSQL **REPEATABLE READ READ ONLY** transaction for a dashboard read | Commit on success; roll back on failure; always release the connection |
| Context loader | Load active organization metadata, validated time zone, work date, week-start setting, and authorized department context | All queries use the tenant ID and manager identity from the server-derived scope |
| Metric services | The shared workforce-summary service is implemented in Step 6; attendance, availability, overtime, payroll and action-center services remain subsequent work | Reuse authoritative domain calculations and existing permission rules; never duplicate business calculations in React |
| Presentation layer (subsequent steps) | Render shared cards, charts, filters, and drill-downs with role-aware content | Client-side presentation does not constitute authorization |

## 3. Access-scope contract

The server builds one of two scope forms:

- **ORGANIZATION:** Organization Admin and HR Manager, constrained to the tenant from the authenticated session. HR Manager scope also retains the actor's employee identity for workflow rules such as excluding the actor's own requests.
- **ASSIGNED_DEPARTMENTS:** Department Manager, constrained by the actor's authenticated employee ID and the departments.manager_id relationship.

The scope mapper rejects Employee and any unrecognized role. It does not accept IDs or scope overrides from request parameters.

Every later Department Manager aggregate must use the authenticated organization and manager identity. For workforce aggregation, use an EXISTS relationship to the authorized departments (or an equivalent distinct employee set) so employees are not double-counted if multiple assigned-department relationships can match. A browser-supplied department selection may narrow this server-derived set only after explicit validation in a later step.

## 4. Shared bootstrap endpoint

**GET /api/management-dashboard/context**

The endpoint is a small, additive bootstrap contract for later dashboard sections. It returns:

- schema version and generation timestamp;
- authenticated management role and scope kind;
- department count within that scope;
- assigned department identifiers/names/statuses for Department Managers only;
- organization name, validated time zone, configured week start, and organization-local work date.

It does not return employee records, payroll values, personal attendance, review queue contents, or aggregate metrics. Those datasets are added by subsequent steps through permission-aware services.

The endpoint uses the existing getTenantPermissionActor session/tenant/licensing boundary and jsonResponse no-cache headers. Employee access is rejected. No organization or department identifier is accepted from the browser.

### Shared workforce KPI endpoint (Step 6)

**GET /api/management-dashboard/workforce-summary**

This endpoint adds the first shared aggregate on top of the scope and snapshot foundation. It derives the actor and scope from the authenticated session, loads organization context and workforce aggregates in one read-only snapshot, and returns a versioned response.

The shared workforce population excludes organization-scoped role names `ORGANIZATION_ADMIN`, `ORG_ADMIN`, and `ORGANIZATION_ADMINISTRATOR`. Missing linked role records retain the established `EMPLOYEE` fallback. The aggregate returns total/active/inactive/former workforce, assigned and active-unassigned counts, and total/active/inactive departments.

For Department Managers, employee scope is an `EXISTS` relationship to departments whose `manager_id` matches the authenticated actor employee ID. This keeps multi-department membership unique and prevents browser input from widening the population.

The new endpoint does not change the existing Organization Admin, HR Manager or Department Manager overview endpoints. The opt-in `ManagementDashboardWorkforceKpis` component uses the shared metric cards and loading/error states but is not yet mounted into the visible dashboards. Existing KPI cards remain until actual tenant figures have been reconciled.


### Attendance and working-hours summary (Step 7)

**GET /api/management-dashboard/attendance-summary**

The Step 7 endpoint is an additive source for role-scoped attendance pulse, working-hours totals and a daily trend. It uses the existing actor-to-scope mapper and one `REPEATABLE READ READ ONLY` snapshot transaction. Tenant identity and the Department Manager employee identity are never accepted from request parameters.

The request requires inclusive organization-local `fromDate` / `toDate` values, limited to 31 calendar days and not beyond the server-derived organization work date. An optional department filter can only narrow scope and is validated against the authenticated tenant and, for Department Managers, the authenticated manager's assigned departments.

The service builds distinct employee-day rows from active workforce records, effective schedule assignments, active work schedules, weekday definitions and organization timezone. It resolves approved attendance corrections and approved missing-punch corrections as of the snapshot time. It also loads approved leave, public holidays and approved preauthorization minutes.

For each scheduled employee-day, the service calls the existing `calculateDailyAttendance` helper and aggregates its authoritative worked, regular, potential-overtime and payable-overtime outputs. Attendance eligibility excludes approved leave and public holidays, consistent with the current clock-in route, which blocks clock-in on both. The rate is weighted across eligible scheduled employee-days and returns N/A when its denominator is zero. Current-day states include not-yet-due shifts and missing clock-ins only while the assigned shift is actively in progress; no confirmed absence or lateness is inferred.

The endpoint enforces a 31-day date limit and a 100,000-row calculation limit. It returns an error when the row limit is exceeded rather than silently truncating the result. The corresponding `ManagementDashboardAttendanceAnalytics` frontend section is exported but remains opt-in and is not mounted into the live dashboards in Step 7.

## 5. Snapshot and data consistency

All future unified dashboard aggregation services should execute through withManagementDashboardSnapshot:

1. Acquire one pooled PostgreSQL client.
2. Begin **REPEATABLE READ READ ONLY**.
3. Load all datasets needed for that response through the same client.
4. Commit only after every required read succeeds.
5. Roll back on an exception and release the client in all cases.

A failed source must remain an error/unavailable state. Do not coerce a failed query into zero. If a future metric is optional, isolate its failure explicitly and mark that metric unavailable while preserving the rest of the response.

## 6. Existing functionality intentionally preserved

- /api/org/dashboard/stats and /api/org/dashboard/activity remain unchanged.
- /api/hr-manager/overview remains unchanged.
- /api/department-manager/overview remains unchanged.
- Existing leave, attendance, correction, overtime, payroll, licensing, invitations, audit, and approval routes remain unchanged.
- The existing dashboard UI continues using its current data sources during this foundation step.
- Employee My Day and the personal My Day views for HR Manager and Department Manager are untouched.
- No database migration, schema change, new permission, or business-rule change is introduced.
- Step 6 adds an opt-in workforce aggregate and KPI component; existing dashboard UI and personal My Day remain unchanged.

The new context endpoint is not yet wired into the visible dashboards. It establishes the shared, server-controlled foundation; subsequent steps add reusable presentation components and metric services incrementally.

## 7. Required rules for subsequent services

1. Receive a ManagementDashboardScope created from the authenticated actor; do not reconstruct it from request input.
2. Reuse the same transaction client for related queries.
3. Keep Organization Admin/HR organization scope separate from Department Manager assigned-department scope.
4. Preserve workflow-specific exclusions, including the actor's own requests from their actionable review queue.
5. Keep a manager's personal My Day data separate from management aggregates.
6. Reuse calculateDailyAttendance and other authoritative server-side domain logic. Do not recreate attendance or payroll calculations in frontend code.
7. Preserve existing endpoint contracts while new data is introduced additively.
8. Use organization-local dates and the configured time zone/week start.
9. Distinguish zero, unavailable, and not-applicable values.
10. Do not introduce staffing, absence, lateness, payroll, or turnover interpretations before their authoritative inputs and definitions are verified.

## 8. Step 3 completion criteria

- A shared, typed scope exists for all three management roles.
- Employee and unknown roles fail closed.
- Department Manager scope originates only from the authenticated employee identity.
- A reusable read-only snapshot helper exists.
- The context loader returns only tenant metadata and role-authorized department context.
- The new endpoint does not replace or modify any existing endpoint.
- No visible dashboard or personal My Day workflow is changed.
