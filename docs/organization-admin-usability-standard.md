# Organization Admin Workspace — Usability Standard

This standard governs every Organization Admin route and every meaningful view/state within those routes. It is an implementation and review checklist, not a claim that a page has passed testing.

## Nielsen's 10 usability heuristics

1. **Visibility of system status** — show loading/progress, current filters and selections, save state, pending/review status, and clear success/failure feedback. Disable duplicate submissions while an action is in progress.
2. **Match between system and the real world** — use workforce, attendance, shift, leave, pay-rate, payroll, and organization terminology consistently. Format dates, times, currency, and country using the organization's configured settings.
3. **User control and freedom** — provide cancel/back/close paths, safe dismissal, undo or recovery where supported, and unsaved-change protection for destructive navigation or drawer closure.
4. **Consistency and standards** — share the same navigation, page header, field, table, status, drawer, dialog, and action patterns across all Organization Admin pages.
5. **Error prevention** — validate before submission, explain constraints beside the relevant control, confirm destructive/high-impact actions, and never rely on client-side validation for authorization or tenant isolation.
6. **Recognition rather than recall** — keep labels visible, show contextual actions and current state, preserve useful filters, and explain unfamiliar statuses or calculations in place.
7. **Flexibility and efficiency of use** — support search, filters, sorting, pagination, keyboard navigation, command palette shortcuts, and bulk actions where the workflow supports them.
8. **Aesthetic and minimalist design** — prioritize the primary task, remove redundant instructions and decorative clutter, group related information, and keep dense data scannable.
9. **Help users recognize, diagnose, and recover from errors** — use actionable, specific messages; preserve entered data after recoverable failures; provide retry paths; associate field errors with fields.
10. **Help and documentation** — provide concise contextual guidance for complex or consequential workflows, explain policy constraints, and link to the relevant settings or supporting page.

## Route-by-route review inventory

Every route below must be reviewed in desktop, tablet, and mobile layouts, including loading, empty, populated, filtered, validation-error, request-error, success, and confirmation states where applicable.

| Route | Primary views and task-specific checks |
|---|---|
| /org/dashboard | Organization overview, metric drill-downs, alerts, analytics, exports, quick actions; metric definitions and date context must be clear. |
| /org/employees | Directory table/cards, search/filter/sort/pagination, create/edit/view drawers, workforce status actions, manager assignment, profile and contact details; protect unsaved form data. |
| /org/departments | Department directory, create/edit/view drawer, manager assignment, active/inactive states, employee relationships; explain unavailable manager choices. |
| /org/organization-chart | Hierarchy view, search, expand/collapse, reporting-line context, empty/unassigned branches; preserve readable hierarchy on narrow screens. |
| /org/invitations | Invitation directory, table/cards, status filters, history, resend actions, expiry and acceptance states; make resend progress and outcome explicit. |
| /org/attendance | Daily/monthly attendance, calendar/list views, clock events, corrections, overtime, review actions; distinguish expected vs actual time and prevent self-review. |
| /org/schedules | Schedule list/calendar, create/edit, assignment, effective dates, conflicts and unassigned people; show the impact of changes before saving. |
| /org/leave | Request queue, request details, review/cancel actions, public holidays; show approver, balance/policy context when available, and clear pending/approved/rejected states. |
| /org/pay-rates | Employee rate directory, effective-dated hourly/overtime rates, edit history and validation; make effective dates and rate units unmistakable. |
| /org/payroll | Monthly payroll summary, employee calculations, payment status, record/update payment flows; distinguish calculated, due, paid, and failed amounts. |
| /org/reports | Report parameters, generation progress, download outcome and errors; clearly identify organization timezone and selected work date. |
| /org/communications | Conversation list, active thread, compose/send, delivery/loading/empty/error states; preserve drafts and expose unread/new-message status. |
| /org/support | Support request list/detail/create and response states; clarify ownership, status, and expected next action. |
| /org/settings | Organization profile, locale/timezone/currency/date settings, working days, legal entity and setup completion; preview consequences and protect unsaved changes. |
| /org/profile | Admin identity/contact/photo views and edits; explain validation, save state, and privacy-sensitive actions. |
| /org/license | License status, payment/submission/history views and confirmation states; make renewal, expiry, verification, and payment status unambiguous. |
| /account/change-password | Password form and validation; explain requirements, preserve accessible error feedback, and confirm success without exposing credentials. |

## Shared acceptance criteria

- Every page has one clear primary heading, a predictable place for primary actions, and a visible current navigation item.
- Every interactive control has a programmatic name, keyboard access, visible focus, and a usable touch target.
- Tables remain usable on narrow screens through responsive layout or intentional horizontal scrolling; headers and row actions remain understandable.
- Dialogs and drawers have an accessible name, focus management, Escape/close behavior where safe, and an explicit unsaved-change guard when needed.
- Loading, empty, error, and success states are designed—not left as blank content or unexplained spinners.
- Destructive or financially consequential actions require clear confirmation and show the exact affected record/amount/period.
- Theme changes retain readable contrast for text, controls, tables, charts, date pickers, overlays, and status badges.
- Reduced-motion preferences are respected.
- Organization timezone, locale, date format, and currency are used consistently.
- Authorization, validation, audit logging, and tenant isolation remain enforced by the backend; UI visibility is not a security boundary.

## Verification policy

Review each route and its nested views against all ten heuristics. Record concrete defects and fix them in the feature branch. Do not mark an item passed until it has been inspected in the running application at the relevant viewport and state. Automated tests and builds must be reported separately from visual/usability review.
