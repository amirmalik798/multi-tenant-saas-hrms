-- Remove the unused optional Super Admin MFA fields.
-- Authentication no longer reads or enforces these fields. IF EXISTS keeps this
-- safe for databases where the earlier optional-MFA migration was never applied.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_mfa_consistency_check;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS mfa_secret_encrypted,
  DROP COLUMN IF EXISTS mfa_enabled_at;
