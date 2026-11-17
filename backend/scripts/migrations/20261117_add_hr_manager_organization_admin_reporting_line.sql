BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS reporting_manager_user_id uuid;

-- The composite foreign key below also needs a matching unique key on the
-- tenant/user pair. users.id is globally unique, so this index is redundant
-- for lookup but makes tenant ownership part of the FK contract.
CREATE UNIQUE INDEX IF NOT EXISTS users_organization_id_id_uq
  ON public.users (organization_id, id);

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
SET reporting_manager_user_id = (
  SELECT u.id
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
)
WHERE e.reporting_manager_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.roles AS workforce_role
    WHERE workforce_role.id = e.workforce_role_id
      AND workforce_role.organization_id = e.organization_id
      AND workforce_role.scope = 'ORGANIZATION'
      AND workforce_role.name = 'HR_MANAGER'
  );

COMMIT;
