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

## 2026-11-17 implementation review — code-level findings

The following safeguards were implemented after reviewing the Organization Admin routes and their shared workspaces. This is a source-code review record; it is not a browser-based usability certification.

### Shared workspace and navigation

- Desktop navigation is grouped into Overview, People, Time & Pay, Communication, and Account. The current route remains visually and semantically identified.
- The mobile navigation remains available as a horizontally scrollable navigation strip so all destinations remain reachable at narrow widths.
- The reusable attendance/payroll module shell now provides a consistent page heading, breadcrumb, organization-workspace context, session recovery, and scoped Organization Admin theme root.
- Added a keyboard skip link and matching main-content target across Organization Admin pages.
- Kept the shared command palette, visible focus treatment, and reduced-motion behavior.
- Added semantic page headings and breadcrumbs to Dashboard, Employees, Departments, Invitations, Organization Chart, Profile, Settings, and License & Payments; the shared shell supplies them to Attendance, Schedules, Leave, Pay Rates, Payroll, Reports, Messages, and Platform Support.

### High-impact action and recovery improvements

- **Departments:** replaced native browser confirmation dialogs for single deactivation, bulk deactivation, and deactivation during an edit-save with themed confirmation dialogs. The dialogs explain that active employees assigned to the department are also marked inactive. Added Escape handling and keyboard focus containment/restoration.
- **Leave:** replaced browser prompts/confirms for approve, reject, cancel, and public-holiday removal with themed dialogs. Rejection requires a reason; the dialogs identify the affected request or holiday and explain downstream calendar/payroll impact. Added keyboard focus handling, accessible search/filter names, empty-vs-filtered-empty messaging, clear-filters action, and retry/loading states.
- **Pay Rates:** Organization Admin rate changes now require a review confirmation showing employee, regular/overtime hourly rates, currency, and effective period. Unsaved rate edits are protected from automatic refresh and employee switching; leaving the page triggers the browser unsaved-change warning. The dialogs support keyboard focus handling.
- **Payroll:** changing a payment status to Paid or reversing a Paid status now requires confirmation. The dialog shows employee, calculated amount, month, and available payment reference, and explicitly asks the admin to confirm the underlying payment/correction.
- **License & Payments:** submitting payment proof now requires a final review of amount, currency, transaction reference, receipt filename and size. The dialog clarifies that proof submission is for verification and does not itself activate the license or make a payment.
- **Error recovery:** added explicit retry actions to Leave, Pay Rates, Payroll, Reports, Invitations, Profile, and License error states. Existing dashboard, department, settings, and organization-chart recovery paths were retained.
- **Status visibility:** exposed the organization date/timezone loading state in Attendance Reports and made Leave loading states announce themselves to assistive technology. Background refresh is paused while the admin is reviewing a confirmation or unsaved pay-rate values, avoiding stale dialogs and overwritten inputs.

### Route review status

| Route | Code-level review performed | Safeguards confirmed or added |
|---|---|---|
| /org/dashboard | Yes | Metrics loading/error states, recent-activity empty/error states, accessible chart descriptions, retry paths, page hierarchy |
| /org/employees | Yes | Validated forms, unsaved-change protection, drawer/dialog keyboard handling, bulk-action confirmation, loading and error states |
| /org/departments | Yes | Validated forms, unsaved-change protection, eligible-manager loading/error/retry, themed single/bulk deactivation confirmation, keyboard focus handling |
| /org/organization-chart | Yes | Search, expand/collapse controls, loading/error/empty states, unresolved reporting-line review, page hierarchy |
| /org/invitations | Yes | Search/status filters, table/card views, loading/error/empty states, resend progress, pagination, retry |
| /org/attendance | Yes | Attendance summary, section navigation, scoped review queues, per-source errors/empty states, action progress, self-review prevention |
| /org/schedules | Yes | Schedule creation/assignment forms, effective-date constraints, loading/error/empty states, correction workflow and status visibility |
| /org/leave | Yes | Search/status filtering, request/holiday empty/loading states, approval/rejection/cancel confirmation, holiday-removal confirmation, retry |
| /org/pay-rates | Yes | Required/range-constrained rate fields, organization currency context, effective-dated history, confirmation of rate changes, retry |
| /org/payroll | Yes | Month selection, search/filter/sort, calculated earnings context, review states, paid/unpaid confirmation, retry |
| /org/reports | Yes | Date/timezone context, loading/progress, download success/error, retry |
| /org/communications | Yes | Shared shell and workspace message loading/error/empty/send states; keyboard behavior retained in the shared workspace |
| /org/support | Yes | Shared shell and support inbox/thread loading/error/empty/send states |
| /org/profile | Yes | Profile/contact edit and save states, upload progress, success/error recovery, retry |
| /org/settings | Yes | Setup guidance, required settings, save/complete states, unsaved-change refresh guard, validation and retry |
| /org/license | Yes | License/payment status, proof validation, submission progress, receipt preview failure state, themed proof-submission confirmation and retry |

### Verification still required

- Open every route in the running app at desktop, tablet, and mobile widths.
- Exercise each route's real loading, populated, empty, filtered-empty, validation-error, API-error, success, and confirmation states.
- Verify color contrast for every chart, table, badge, date control, popover, drawer, and modal in both themes using actual rendered content.
- Verify keyboard-only navigation and screen-reader announcements in the running app, including focus order when dialogs open/close.
- Verify that all confirmation flows still call the same existing APIs and that server-side validation, tenant isolation, authorization, and audit logging remain authoritative.
- Run the build and regression suite only under the project's agreed testing procedure. No build or regression pass is claimed by this document.
