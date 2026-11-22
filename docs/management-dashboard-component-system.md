# Management Dashboard Component System

**Status:** Step 4 of 14 — reusable management-dashboard presentation primitives  
**Applies to:** Organization Admin, HR Manager, Department Manager  
**Scope:** Additive UI foundation. Existing dashboards do not switch to these components until the dashboard integration step.

## 1. Design principles

- Reuse the application's existing theme tokens: surface, text, muted, border, accent, success, warning, danger, and shadow.
- Support both existing light and dark themes without hard-coded page backgrounds.
- Use one typography and spacing rhythm across Organization Admin, HR Manager, and Department Manager.
- Keep cards compact but readable, with stable numeric alignment and clear labels.
- Make component states explicit: loading, genuine zero, unavailable, not applicable, empty, and error.
- Keep layout primitives presentation-only. Data loading, authorization, filter state, and business rules remain with the calling feature.
- Avoid adding a charting dependency before the chart requirements and data shape are implemented.

## 2. Shared components

| Component | Intended use |
|---|---|
| `ManagementDashboardSectionHeading` | Section title, supporting description, eyebrow and action |
| `ManagementDashboardGrid` | Responsive two-, three-, or four-column content grid |
| `ManagementDashboardMetricCard` | KPI value, label, optional icon, description, context and tone |
| `ManagementDashboardMetricGrid` | Consistent KPI card layout |
| `ManagementDashboardPanel` | Shared card/panel surface with optional heading and action |
| `ManagementDashboardChartPanel` | Chart panel frame with optional legend and reserved visualization area |
| `ManagementDashboardChartLegend` | Accessible text legend with theme-aware tone markers |
| `ManagementDashboardFilterBar` | Layout for caller-owned filter controls and actions |
| `ManagementDashboardSkeleton` | Metric, chart and list loading placeholders |
| `ManagementDashboardEmptyState` | Clear empty-state message and optional next action |
| `ManagementDashboardErrorState` | Accessible error message and optional retry action |

All exports are available from `@/features/management-dashboard/components`.

## 3. Metric state semantics

- `state="ready"`: render the value supplied by the data layer. A genuine numeric zero is rendered as zero.
- `state="loading"`: render a skeleton and expose `aria-busy`.
- `state="unavailable"`: render “Unavailable”; do not show zero after a failed source query.
- `state="not-applicable"`: render “N/A”, for example when a percentage has a zero denominator.

The component does not calculate a metric, infer a trend, or decide whether a value is good or bad. Those decisions remain in the metric definition and data service.

## 4. Charting strategy

The project does not currently include a dedicated charting package. This step therefore adds a consistent chart panel and legend container, not a chart engine or sample data. Later chart steps will implement accessible, responsive visualizations against verified metric datasets. No extra dependency or bundle weight is introduced.

## 5. Responsive and accessibility behavior

- Four-column metric layouts collapse to two columns at tablet widths and one column on narrow screens.
- Content grids collapse progressively without fixed panel widths.
- Section and panel hierarchy uses semantic headings.
- Loading regions use a labelled status region with `aria-busy`.
- Empty states use `role="status"`; failures use `role="alert"`.
- Chart legends retain text labels rather than relying on colour alone.
- Reduced-motion preferences disable shimmer and hover movement.

## 6. Integration boundary

This step adds the component library and imports its theme-aware stylesheet into the frontend global stylesheet. It does not modify `WorkspaceDashboard`, role dashboards, existing `Panel` or `PageHeader` primitives, API routes, personal My Day, or business logic.

Step 5 established the shared management-dashboard shell and reporting controls. Step 6 added the opt-in `ManagementDashboardWorkforceKpis` composite section, backed by a new role-scoped server aggregate and the existing metric-card primitives. The section is exported but is not mounted into live dashboards yet. Subsequent steps will connect the remaining verified datasets and compose the role-specific dashboards incrementally while retaining existing routes and actions.

## 7. Attendance analytics composite section (Step 7)

`ManagementDashboardAttendanceAnalytics` composes the existing section heading, metric cards/grid, chart panel, general panel, skeletons and error state. It loads only the new authenticated attendance-summary endpoint and accepts reporting dates and optional department narrowing from its parent. The backend revalidates these filters against the authenticated scope.

The section presents:

- Attendance rate and eligible/present scheduled employee-days.
- Scheduled, worked, regular-worked, potential-overtime and payable-overtime hours.
- A CSS-based accessible daily attendance trend with text labels and N/A states.
- A current-day shift pulse for scheduled/present/not-yet-due/live-exception/open/completed counts.

It uses the existing theme tokens and responsive styles and adds no chart dependency. The composite section is exported for reuse but is intentionally not mounted into the existing dashboards until the later role-specific composition step. The separate personal My Day experience is not affected.

## 8. Workforce composition composite section (Step 8)

`ManagementDashboardWorkforceComposition` composes the shared heading, chart panels, chart legend, grid, skeleton and error state components. It loads the new role-scoped workforce-composition endpoint and displays:

- Current active, inactive and former workforce status composition.
- Department-level status distribution, including authorized departments with zero employees.
- Workforce-role distribution.
- An explicit unassigned group for Organization Admin/HR Manager and an N/A explanation for Department Manager.
- A data-readiness panel explaining why joiner, departure, reactivation and turnover metrics are deferred.

The backend reconciles all composition totals against the existing Step 6 workforce-summary service inside the same database snapshot. The section is exported but remains unmounted in the live dashboards until Step 12. It introduces no chart package or database migration.



## 9. Leave and availability composite section (Step 9)

ManagementDashboardLeaveAvailability reuses the shared section heading, metric cards, responsive grids, chart panel, panel, skeleton and error-state primitives. It reads only the new role-scoped /api/management-dashboard/leave-availability endpoint and accepts inclusive reporting dates plus an optional narrowing department from its parent.

The section distinguishes actionable pending reviews, approved requests, distinct people with approved leave, inclusive approved calendar days, upcoming approved leave and scheduled availability. It includes a daily stacked availability trend and a current-day summary that separates people on leave from the employees who have an active scheduled shift today.

The trend separates available scheduled employee-days, approved-leave scheduled employee-days and public-holiday scheduled employee-days. Its rate denominator excludes public holidays. All chart values retain text labels and N/A states; no chart dependency is added. The component is exported but intentionally unmounted until Step 12. Personal My Day and the existing leave workflows are untouched.
