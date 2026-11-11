-- Optional authenticator-based MFA for Platform Super Admin accounts.
-- Secret material is encrypted by the application using SUPER_ADMIN_MFA_ENCRYPTION_KEY.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text NULL,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_mfa_consistency_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_platform_mfa_consistency_check
  CHECK (
    (mfa_secret_encrypted IS NULL AND mfa_enabled_at IS NULL)
    OR
    (account_scope = 'PLATFORM' AND organization_id IS NULL AND mfa_secret_encrypted IS NOT NULL AND mfa_enabled_at IS NOT NULL)
  );
