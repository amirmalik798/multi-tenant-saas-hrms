# HRMS Workspace Frontend

A standalone Next.js frontend for the existing Multi-Tenant SaaS HRMS. It provides one sign-in experience and five role-specific workspaces: Super Admin, Organization Admin, HR Manager, Department Manager, and Employee.

## Repository boundary

- Source repository: `amirmalik798/multi-tenant-saas-hrms` — inspected read-only. No source code, branches, settings, or deployment configuration were changed.
- This is an independent frontend project. It does not contain or modify the source backend, database schema, or migrations.
- Super Admin UI behavior and API contracts were reviewed from source `main` at commit `9da03d57dbf6b5043dcee2e66a116398536c7cdd`; the standalone frontend now has its own platform workspace and uses the existing backend platform session.

## Stack

- Next.js App Router 16.4
- React 19 and TypeScript
- Tailwind CSS 4
- Lucide icons

## Unified authentication and workspaces

The sign-in page calls the existing `POST /api/unified-auth/login` endpoint and routes the returned role to its workspace:

| Role | Workspace |
|---|---|
| Super Admin | `/dashboard` |
| Organization Admin | `/org` |
| HR Manager | `/hr` |
| Department Manager | `/dm` |
| Employee | `/employee` |

The platform workspace is protected independently. It verifies the platform session with `GET /api/auth/me` and signs out through `POST /api/auth/logout`. Organization Admin and workforce sessions continue to use their own existing session verification and logout routes. The three session identities are not interchangeable.

## Workspace areas

| Role | Main workspace areas |
|---|---|
| Super Admin | Platform overview, organizations, organization administrators, platform invitations, payments and license review, support conversations, audit logs; organization lifecycle and initial-admin invitation actions |
| Organization Admin | Overview, workforce, departments, organization chart, invitations, attendance, schedules, leave/holidays, pay rates, payroll, reports, messages, platform support, organization settings/branding, license and payment proof, profile |
| HR Manager | Overview, review queue, workforce, departments, organization chart, invitations, attendance and schedules, leave/holidays, pay rates, salary payments, reports, messages, personal attendance/earnings/profile/security |
| Department Manager | Overview, assigned team, scoped attendance and schedules, review queue, leave, team payment view, reports, messages, personal attendance/earnings/profile/security |
| Employee | My day, attendance and clock actions, schedule, reports, leave, requests, earnings, messages, profile/security |

The Super Admin area uses a dedicated platform navigation shell and session gate. Its organization, payment-review, and support actions call the existing platform endpoints. Organization lifecycle and administrator status changes keep their required confirmation/reason fields; the backend remains authoritative for allowed transitions, audit writes, session invalidation, and last-active-admin safeguards.

The same workforce and department forms/drawers are reused across the Organization Admin and HR Manager workspaces. Role-specific routes share the same design primitives and feature modules.

## Connect to the existing backend

Requirements: Node.js 22+ and npm 10+.

1. Install packages: `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `BACKEND_ORIGIN` to the existing backend origin (default: `http://localhost:3000`).
4. In the backend environment, configure `APP_ORIGIN` (or an exact allowed-origin setting such as `FRONTEND_URL` / `APP_ALLOWED_ORIGINS`) to the frontend public origin, for example `http://localhost:3001`. The backend rejects unsafe requests unless the browser origin is explicitly allowed.
5. Start the backend and then run `npm run dev`.
6. Open `http://localhost:3001`.

The Next.js server rewrites `/api/backend/*` to `${BACKEND_ORIGIN}/api/*`. Keep the browser-facing frontend and backend cookie origin aligned in deployment. Do not relax cookie, same-origin, CSRF, session, tenant-isolation, or backend authorization rules to work around a proxy configuration problem.

## Commands

- `npm run dev` — development server on port 3001
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript type check
- `npm run check:source` — fast syntax, local-import, and native-browser-prompt source check

`check:source` is not a replacement for TypeScript type checking, linting, the production build, or browser tests.

## Super Admin scope notes

- Super Admin authentication reuses the backend unified login and platform session; it does not use Organization Admin or workforce session endpoints.
- Organization creation calls the existing transactional endpoint. The response's `organization.id` is used to open the new tenant record.
- Organization Admin invitation creation and organization lifecycle changes use the existing platform APIs.
- Organization Admin account suspension/reactivation requires an audit reason. The backend still enforces the last-active-admin rule and increments session versions.
- Payment review uses the existing approval/rejection endpoint; license changes are performed by the backend.
- Support replies and open/close changes use the existing support conversation APIs.
- System Health reads the existing `/api/health/ready` endpoint for database readiness and email-delivery configuration. It does not send a test email.
- The current pass does not yet reproduce every interaction from the legacy Super Admin screens. Detailed parity for invitation revoke/resend, every organization-user management action, and advanced audit filters still needs a separate implementation and verification pass.

See `docs/` for the source audit, route/API contract catalogue, business-rule record, role capability matrix, information architecture, and implementation/verification status. The backend remains authoritative for authentication, role permissions, tenant scope, attendance eligibility, schedules, leave decisions, overtime approval, pay calculations, licenses, and payments.
