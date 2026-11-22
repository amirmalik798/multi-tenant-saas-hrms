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

Step 5 will establish the shared management dashboard shell and controls. Subsequent steps will move dashboard content onto these primitives incrementally while retaining the existing role-specific routes and actions.
