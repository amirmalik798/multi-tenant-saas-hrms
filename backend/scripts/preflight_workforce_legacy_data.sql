-- READ-ONLY Task 23 post-004/pre-005/post-005 workforce integrity report.
-- Run only after 004_workforce_hierarchy_lifecycle.sql adds workforce_role_id.
-- No data is modified.

-- 1. Roles with workforce-style legacy names per organization.
SELECT o.name AS organization, r.name AS role_name, COUNT(DISTINCT u.id)::int AS linked_accounts,
       COUNT(DISTINCT e.id)::int AS linked_profiles
FROM public.organizations o
JOIN public.roles r ON r.organization_id = o.id AND r.scope = 'ORGANIZATION'
LEFT JOIN public.users u ON u.organization_id = o.id AND u.role_id = r.id AND u.account_scope = 'ORGANIZATION'
LEFT JOIN public.employees e ON e.organization_id = o.id
  AND (e.id = u.employee_id OR e.workforce_role_id = r.id)
WHERE r.name IN ('HR_OFFICER', 'LINE_MANAGER', 'DEPARTMENT_MANAGER', 'HR_MANAGER', 'EMPLOYEE')
GROUP BY o.name, r.name
ORDER BY o.name, r.name;

-- 2. Department managers that are missing, inactive, or not eligible.
SELECT o.name AS organization, d.id AS department_id, d.name AS department,
       d.status AS department_status, m.employee_code AS manager_code,
       m.employment_status AS manager_employment_status, mr.name AS manager_role,
       u.status AS manager_account_status
FROM public.departments d
JOIN public.organizations o ON o.id = d.organization_id
LEFT JOIN public.employees m ON m.id = d.manager_id AND m.organization_id = d.organization_id
LEFT JOIN public.roles mr ON mr.id = m.workforce_role_id AND mr.organization_id = m.organization_id
LEFT JOIN public.users u ON u.employee_id = m.id AND u.organization_id = m.organization_id
  AND u.account_scope = 'ORGANIZATION' AND u.role_id = m.workforce_role_id
WHERE d.manager_id IS NULL
   OR d.status NOT IN ('ACTIVE', 'INACTIVE')
   OR (d.manager_id IS NOT NULL AND (
        m.id IS NULL OR m.employment_status <> 'ACTIVE'
        OR mr.name <> 'DEPARTMENT_MANAGER' OR mr.scope <> 'ORGANIZATION'
        OR u.id IS NULL OR u.status <> 'ACTIVE'
      ))
ORDER BY o.name, d.name;

-- 3. Active employee-role profiles that violate department/reporting-line rules.
-- This report deliberately uses user.role_id as a fallback before migration 004.
SELECT o.name AS organization, e.id AS employee_id, e.employee_code,
       e.employment_status, e.department_id, d.name AS department,
       e.manager_id, m.employee_code AS reporting_manager_code,
       COALESCE(workforce_role.name, account_role.name) AS resolved_role,
       d.status AS department_status, department_manager.employee_code AS department_manager_code
FROM public.employees e
JOIN public.organizations o ON o.id = e.organization_id
LEFT JOIN public.roles workforce_role
  ON workforce_role.id = e.workforce_role_id
 AND workforce_role.organization_id = e.organization_id
LEFT JOIN public.users u
  ON u.employee_id = e.id AND u.organization_id = e.organization_id
 AND u.account_scope = 'ORGANIZATION'
LEFT JOIN public.roles account_role ON account_role.id = u.role_id
LEFT JOIN public.departments d
  ON d.id = e.department_id AND d.organization_id = e.organization_id
LEFT JOIN public.employees m
  ON m.id = e.manager_id AND m.organization_id = e.organization_id
LEFT JOIN public.employees department_manager
  ON department_manager.id = d.manager_id AND department_manager.organization_id = d.organization_id
WHERE e.employment_status = 'ACTIVE'
  AND COALESCE(workforce_role.name, account_role.name) = 'EMPLOYEE'
  AND (
    d.id IS NULL OR d.status <> 'ACTIVE' OR d.manager_id IS NULL
    OR e.manager_id IS DISTINCT FROM d.manager_id
    OR department_manager.id IS NULL
    OR department_manager.employment_status <> 'ACTIVE'
    OR NOT EXISTS (
      SELECT 1 FROM public.roles dr
      JOIN public.users du ON du.employee_id = department_manager.id
        AND du.organization_id = department_manager.organization_id
        AND du.account_scope = 'ORGANIZATION'
        AND du.role_id = department_manager.workforce_role_id
        AND du.status = 'ACTIVE'
      WHERE dr.id = department_manager.workforce_role_id
        AND dr.organization_id = department_manager.organization_id
        AND dr.scope = 'ORGANIZATION'
        AND dr.name = 'DEPARTMENT_MANAGER'
    )
  )
ORDER BY o.name, e.employee_code;

-- 4. Legacy HR_OFFICER references. These are intentionally NOT auto-mapped by
-- migration 005 because mapping to HR_MANAGER could silently elevate permissions.
SELECT o.name AS organization, r.name AS legacy_role,
       u.id AS user_id, u.email, u.status AS account_status,
       e.id AS employee_id, e.employee_code,
       i.id AS invitation_id, i.status AS invitation_status
FROM public.roles r
JOIN public.organizations o ON o.id = r.organization_id
LEFT JOIN public.users u ON u.role_id = r.id AND u.organization_id = r.organization_id
LEFT JOIN public.employees e ON e.organization_id = r.organization_id
  AND (e.workforce_role_id = r.id OR e.id = u.employee_id)
LEFT JOIN public.employee_invitations i ON i.role_id = r.id AND i.organization_id = r.organization_id
WHERE r.scope = 'ORGANIZATION' AND r.name = 'HR_OFFICER'
ORDER BY o.name, u.email, e.employee_code;

-- 5. Multiple active HR Manager candidates; primary designation must be explicit.
SELECT o.name AS organization, e.employee_code, e.first_name, e.last_name,
       e.employment_status, u.email, u.status AS account_status
FROM public.employees e
JOIN public.organizations o ON o.id = e.organization_id
LEFT JOIN public.roles r ON r.id = e.workforce_role_id AND r.organization_id = e.organization_id
LEFT JOIN public.users u ON u.employee_id = e.id AND u.organization_id = e.organization_id
  AND u.account_scope = 'ORGANIZATION' AND u.role_id = e.workforce_role_id
WHERE (r.name = 'HR_MANAGER' OR (r.name IS NULL AND EXISTS (
  SELECT 1 FROM public.users u2 JOIN public.roles r2 ON r2.id = u2.role_id
  WHERE u2.employee_id = e.id AND u2.organization_id = e.organization_id
    AND u2.account_scope = 'ORGANIZATION' AND r2.name = 'HR_MANAGER'
)))
AND e.employment_status = 'ACTIVE' AND u.status = 'ACTIVE'
ORDER BY o.name, e.employee_code;

-- 6. Unexpired PENDING invitations whose email/role/profile no longer agrees.
SELECT o.name AS organization, i.id AS invitation_id, e.employee_code,
       i.email AS invitation_email, e.email AS profile_email, i.expires_at,
       ir.name AS invitation_role, er.name AS profile_role, e.employment_status
FROM public.employee_invitations i
JOIN public.organizations o ON o.id = i.organization_id
JOIN public.employees e ON e.id = i.employee_id AND e.organization_id = i.organization_id
LEFT JOIN public.roles ir ON ir.id = i.role_id AND ir.organization_id = i.organization_id
LEFT JOIN public.roles er ON er.id = e.workforce_role_id AND er.organization_id = e.organization_id
WHERE i.status = 'PENDING' AND i.expires_at > NOW()
  AND (
    LOWER(TRIM(i.email)) IS DISTINCT FROM LOWER(TRIM(e.email))
    OR i.role_id IS DISTINCT FROM e.workforce_role_id
    OR e.employment_status = 'FORMER'
    OR ir.scope IS DISTINCT FROM 'ORGANIZATION'
    OR ir.name NOT IN ('HR_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE')
  )
ORDER BY o.name, i.created_at DESC;
