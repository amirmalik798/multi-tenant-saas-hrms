# Source audit — Multi-Tenant SaaS HRMS

**Inspected repository:** `amirmalik798/multi-tenant-saas-hrms`  
**Branch:** `main`  
**Commit inspected:** `9da03d57dbf6b5043dcee2e66a116398536c7cdd`  
**Commit date:** 2026-11-20  
**Inspection mode:** read-only; no repository writes, branch changes, PRs, settings changes, or source edits were made.

## Repository structure

The source repository is a monorepo with three principal areas:

- `backend/` — standalone Next.js API application with PostgreSQL access through `pg`, role sessions through `iron-session`, and server-side authorization/business rules.
- `frontend/` — existing Next.js App Router frontend using React 19, TypeScript, Tailwind CSS v4, and `lucide-react`.
- `docs/` — project documentation, including `organization-admin-usability-standard.md`.

The existing frontend has separate shells and substantial navigation/session logic in:

- `frontend/app/components/org-admin/OrganizationAdminChrome.tsx`
- `frontend/app/components/hr/HRManagerChrome.tsx`
- `frontend/app/components/dm/DepartmentManagerChrome.tsx`
- `frontend/app/components/employee/EmployeeChrome.tsx`

This is the clearest opportunity to reduce duplicated presentation and improve maintainability. The source already shares some feature workspaces (attendance, leave, payroll, communications, workforce fields); the new frontend consolidates those patterns in a domain-oriented feature structure.

## Authentication boundaries

The backend has three distinct session identities. They are not interchangeable:

1. Platform Super Admin: `getPlatformSuperAdmin()` and platform session.
2. Organization Admin: `getOrganizationAdmin()` and organization-admin session.
3. Workforce: `getOrganizationUser()` for HR Manager, Department Manager, and Employee.

The standalone frontend uses the existing unified login endpoint to establish the appropriate session, then protects each workspace with the matching session endpoint. Super Admin uses `/api/auth/me` and `/api/auth/logout`; Organization Admin uses its organization-auth routes; HR Manager, Department Manager, and Employee use employee-auth routes. The platform session is not accepted as an organization or workforce session.

## Important source behaviors confirmed

- Organization Admin setup is guarded until server-side setup completion. The setup completion endpoint verifies country, timezone, locale, currency, date format, and at least one working day.
- License checks are server-authoritative. Organization Admin must retain access to the license renewal/payment-proof path even when setup or license status prevents access to normal workspace features.
- Organization and user identities are derived from verified sessions. Tenant IDs supplied from the browser must not widen scope.
- Department Manager list, review, leave, and report scopes are derived server-side from departments assigned to that manager.
- Employee self-service endpoints derive the employee ID from the authenticated session.
- HR Manager's personal attendance/earnings is distinct from the HR Manager's organization-wide HR responsibilities.
- Attendance clock eligibility, shift constraints, corrected punch calculations, timezone handling, and approved overtime are backend decisions.
- Salary is calculated by backend payroll/earnings functions. The frontend must not calculate authoritative salary or imply that the UI transfers money.
- The unified login endpoint supports `SUPER_ADMIN`, `ORGANIZATION_ADMIN`, `HR_MANAGER`, `DEPARTMENT_MANAGER`, and `EMPLOYEE`; the frontend routes each role to a separate workspace.
- The Super Admin frontend uses the existing platform-specific authorization routes; the backend rechecks platform role/account scope on privileged requests.
- Workforce invitations create inactive workforce profiles first; account activation occurs through the invitation-acceptance flow.
- The backend validates role hierarchy and reporting-line eligibility when invitations are created/accepted.

## Source UX standard

`docs/organization-admin-usability-standard.md` was read and used as the design baseline. In particular, the new implementation targets Nielsen's ten heuristics, visible loading/saving/error states, recognition over recall, consistent controls, safe destructive actions, keyboard operation, timezone/currency/date consistency, responsive tables, accessible drawers, and reduced-motion support.

The source UX document distinguishes code review from rendered browser verification. This project does the same: source inspection and static checks are not claimed as full browser usability certification.

## Audit boundary and remaining external verification

This audit is based on the commit SHA stated above. Source `main` can evolve independently. Before production cutover, re-check current API handlers and deployment behavior against the new frontend. The source repository remains unchanged.
