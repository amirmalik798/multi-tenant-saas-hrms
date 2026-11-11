-- Organization branding and Organization Admin profile photos.
-- Images are tenant-scoped and stored on their owning organization/user records.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_image BYTEA NULL,
  ADD COLUMN IF NOT EXISTS logo_image_mime_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS logo_image_updated_at TIMESTAMPTZ NULL;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_logo_image_size_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_image_size_check
  CHECK (logo_image IS NULL OR octet_length(logo_image) <= 102400);

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_logo_image_mime_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_image_mime_check
  CHECK (
    (logo_image IS NULL AND logo_image_mime_type IS NULL)
    OR (logo_image IS NOT NULL AND logo_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
  );

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_image BYTEA NULL,
  ADD COLUMN IF NOT EXISTS profile_image_mime_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS profile_image_updated_at TIMESTAMPTZ NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_profile_image_size_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_profile_image_size_check
  CHECK (profile_image IS NULL OR octet_length(profile_image) <= 25600);

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_profile_image_mime_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_profile_image_mime_check
  CHECK (
    (profile_image IS NULL AND profile_image_mime_type IS NULL)
    OR (profile_image IS NOT NULL AND profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
  );
