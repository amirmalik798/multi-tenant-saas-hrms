BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS reporting_manager_user_id uuid;

DO $$
BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_reporting_manager_user_fk
    FOREIGN KEY (organization_id, reporting_manager_user_id)
    REFERENCES public.users (organization_id, id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager_user
  ON public.employees (organization_id, reporting_manager_user_id)
  WHERE reporting_manager_user_id IS NOT NULL;

-- Existing HR Managers report to the active Organization Admin account for
-- their tenant. Keep manager_id reserved for the workforce hierarchy
-- (Department Manager -> HR Manager -> Employee).
UPDATE public.employees AS e
SET reporting_manager_user_id = admin_account.id
FROM public.roles AS workforce_role
JOIN LATERAL (
  SELECT u.id, u.organization_id
  FROM public.users AS u
  JOIN public.roles AS account_role
    ON account_role.id = u.role_id
   AND account_role.organization_id = u.organization_id
  WHERE u.organization_id = e.organization_id
    AND u.account_scope = 'ORGANIZATION'
    AND u.status = 'ACTIVE'
    AND account_role.scope = 'ORGANIZATION'
    AND regexp_replace(UPPER(account_role.name), '[^A-Z0-9]+', '_', 'g')
      IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
  ORDER BY u.created_at ASC, u.id ASC
  LIMIT 1
) AS admin_account ON admin_account.organization_id = e.organization_id
WHERE workforce_role.id = e.workforce_role_id
  AND workforce_role.organization_id = e.organization_id
  AND workforce_role.scope = 'ORGANIZATION'
  AND workforce_role.name = 'HR_MANAGER'
  AND e.reporting_manager_user_id IS NULL;

COMMIT;
