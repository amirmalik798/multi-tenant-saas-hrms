
-- Add optional employee profile photos.
-- Existing employee records remain unchanged.
-- Maximum stored image size: 25 KiB (25,600 bytes).

BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profile_image BYTEA NULL;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profile_image_mime_type TEXT NULL;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profile_image_updated_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.employees'::regclass
      AND conname = 'employees_profile_image_size_check'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_profile_image_size_check
      CHECK (
        profile_image IS NULL
        OR octet_length(profile_image) <= 25600
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.employees'::regclass
      AND conname = 'employees_profile_image_mime_check'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_profile_image_mime_check
      CHECK (
        (
          profile_image IS NULL
          AND profile_image_mime_type IS NULL
        )
        OR
        (
          profile_image IS NOT NULL
          AND profile_image_mime_type IN (
            'image/jpeg',
            'image/png',
            'image/webp'
          )
        )
      );
  END IF;
END
$$;

COMMIT;
