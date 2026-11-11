-- READ-ONLY preflight for migration 004_workforce_hierarchy_lifecycle.sql.
-- Run this against a restored copy of the current database BEFORE applying 004.
-- This script intentionally uses only columns that exist before migration 004.
-- It does not modify data.

-- 1. Active departments that need manager reconciliation.
SELECT
  d.organization_id,
  d.id AS department_id,
  d.name AS department_name,
  d.manager_id,
  m.employee_code AS manager_employee_code,
  m.employment_status AS manager_employment_status,
  r.name AS manager_role,
  u.status AS manager_account_status
FROM public.departments d
LEFT JOIN public.employees m
  ON m.id = d.manager_id
 AND m.organization_id = d.organization_id
LEFT JOIN public.users u
  ON u.employee_id = m.id
 AND u.organization_id = m.organization_id
 AND u.account_scope = 'ORGANIZATION'
LEFT JOIN public.roles r
  ON r.id = u.role_id
 AND r.organization_id = u.organization_id
WHERE d.status = 'ACTIVE'
  AND (
    d.manager_id IS NULL
    OR m.id IS NULL
    OR m.employment_status IS DISTINCT FROM 'ACTIVE'
    OR u.status IS DISTINCT FROM 'ACTIVE'
    OR r.name IS DISTINCT FROM 'DEPARTMENT_MANAGER'
  )
ORDER BY d.organization_id, d.name;

-- 2. Active Employee accounts that need department/reporting-line review.
-- Department Managers are listed separately in report 4 because they may
-- manage multiple departments and need not belong to a single department.
SELECT
  e.organization_id,
  e.id AS employee_id,
  e.employee_code,
  e.employment_status,
  r.name AS account_role,
  e.department_id,
  e.manager_id
FROM public.employees e
JOIN public.users u
  ON u.employee_id = e.id
 AND u.organization_id = e.organization_id
 AND u.account_scope = 'ORGANIZATION'
JOIN public.roles r
  ON r.id = u.role_id
 AND r.organization_id = u.organization_id
WHERE e.employment_status = 'ACTIVE'
  AND u.status = 'ACTIVE'
  AND r.name = 'EMPLOYEE'
  AND (
    e.department_id IS NULL
    OR e.manager_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.departments d
      WHERE d.id = e.department_id
        AND d.organization_id = e.organization_id
        AND d.status = 'ACTIVE'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.departments d
      JOIN public.employees dm
        ON dm.id = d.manager_id
       AND dm.organization_id = d.organization_id
      WHERE d.id = e.department_id
        AND d.organization_id = e.organization_id
        AND d.status = 'ACTIVE'
        AND dm.id = e.manager_id
        AND dm.employment_status = 'ACTIVE'
    )
  )
ORDER BY e.organization_id, e.employee_code;

-- 3. Profiles whose role cannot be safely inferred from existing data, or
-- whose current account role conflicts with the latest invitation role.
-- A linked user's current role is authoritative. Invitation history is only
-- a fallback for profiles that have no linked user account.
SELECT
  e.organization_id,
  e.id AS employee_id,
  e.employee_code,
  e.email,
  e.employment_status,
  ur.name AS linked_user_role,
  ir.name AS latest_invitation_role,
  li.status AS latest_invitation_status
FROM public.employees e
LEFT JOIN public.users u
  ON u.employee_id = e.id
 AND u.organization_id = e.organization_id
 AND u.account_scope = 'ORGANIZATION'
LEFT JOIN public.roles ur
  ON ur.id = u.role_id
 AND ur.organization_id = u.organization_id
LEFT JOIN LATERAL (
  SELECT i.role_id, i.status, i.created_at, i.id
  FROM public.employee_invitations i
  WHERE i.employee_id = e.id
    AND i.organization_id = e.organization_id
  ORDER BY
    CASE WHEN i.status = 'PENDING' THEN 0 ELSE 1 END,
    i.created_at DESC,
    i.id DESC
  LIMIT 1
) li ON TRUE
LEFT JOIN public.roles ir
  ON ir.id = li.role_id
 AND ir.organization_id = e.organization_id
WHERE ur.name IS DISTINCT FROM 'ORGANIZATION_ADMIN'
  AND (
    (u.id IS NULL AND li.role_id IS NULL)
    OR (
      u.id IS NOT NULL
      AND li.role_id IS NOT NULL
      AND u.role_id IS DISTINCT FROM li.role_id
      AND ur.name IN ('HR_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE')
    )
  )
ORDER BY e.organization_id, e.employee_code;

-- 4. Current active HR Manager candidates. The pre-migration schema has no
-- Primary HR Manager flag, so this report intentionally does not reference it.
-- An organization must explicitly choose the primary after migration 004.
SELECT
  e.organization_id,
  e.id AS employee_id,
  e.employee_code,
  e.first_name,
  e.last_name,
  e.employment_status,
  u.id AS user_id,
  u.status AS account_status,
  u.email
FROM public.employees e
JOIN public.users u
  ON u.employee_id = e.id
 AND u.organization_id = e.organization_id
 AND u.account_scope = 'ORGANIZATION'
JOIN public.roles r
  ON r.id = u.role_id
 AND r.organization_id = u.organization_id
WHERE r.scope = 'ORGANIZATION'
  AND r.name = 'HR_MANAGER'
ORDER BY e.organization_id, e.employment_status DESC, e.employee_code;
