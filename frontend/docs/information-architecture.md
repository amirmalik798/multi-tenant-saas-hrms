# Information architecture

The product is treated as one coherent SaaS platform with four permission-scoped workspaces. Navigation is role-specific, while feature implementations and design-system components are shared.

## Organization Admin

- Workspace: Overview
- People: Workforce, Departments, Organization chart, Invitations
- Time & Work: Attendance, Schedules, Leave & Holidays
- Compensation: Pay Rates, Payroll
- Insights & Support: Reports, Messages, Platform Support
- Organization: Settings, License & Payments, My Profile

## HR Manager

- Workspace: Overview, Review Queue
- People: Workforce, Departments, Organization Chart, Invitations
- Time & Leave: Attendance, Schedules, Leave & Holidays
- Pay & Reporting: Pay Rates, Salary Payments, Reports
- Communication: Messages
- My Account: My Attendance, My Earnings, My Profile, Password & Security

## Department Manager

- Workspace: My Overview, My Team
- Time & Approvals: Team Attendance, Team Schedule, Review Queue, Leave & Holidays
- Pay & Reporting: Scoped Team Payments, Attendance Reports
- Communication: Messages
- My Account: My Attendance, My Earnings, My Profile, Password & Security

## Employee

- My Workspace: My Day, My Time, My Schedule, Attendance Reports
- My Requests: Leave & Holidays, Requests
- My Pay: Earnings & Payment History
- Communication: Messages
- My Account: My Profile, Password & Security

## Shared page composition

Each route resolves into a shared feature module. Roles influence data scope and available actions through the authenticated user, typed route metadata, and server-verified capabilities. They do not fork a copy of the page implementation.

The main shared modules are workforce, departments, invitations, organization chart, attendance, review queue, schedules, leave, pay rates, payroll, personal earnings, reports, communications, profile, organization settings/branding, license, support, and onboarding acceptance.
