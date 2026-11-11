-- Store the initial Organization Admin's personal contact details on the invitation.
-- Existing invitations remain valid; their profile details can still be supplied
-- during acceptance when these nullable columns are empty.
BEGIN;

ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS admin_first_name varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS admin_last_name varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS admin_phone varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS admin_country varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS admin_city varchar(100) NULL;

ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_admin_profile_complete_check,
  DROP CONSTRAINT IF EXISTS organization_invitations_admin_first_name_length_check,
  DROP CONSTRAINT IF EXISTS organization_invitations_admin_last_name_length_check,
  DROP CONSTRAINT IF EXISTS organization_invitations_admin_phone_length_check,
  DROP CONSTRAINT IF EXISTS organization_invitations_admin_country_length_check,
  DROP CONSTRAINT IF EXISTS organization_invitations_admin_city_length_check;

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_admin_profile_complete_check
    CHECK (
      (
        admin_first_name IS NULL AND
        admin_last_name IS NULL AND
        admin_phone IS NULL AND
        admin_country IS NULL AND
        admin_city IS NULL
      )
      OR
      (
        admin_first_name IS NOT NULL AND btrim(admin_first_name) <> '' AND
        admin_last_name IS NOT NULL AND btrim(admin_last_name) <> '' AND
        admin_phone IS NOT NULL AND btrim(admin_phone) <> '' AND
        admin_country IS NOT NULL AND btrim(admin_country) <> '' AND
        admin_city IS NOT NULL AND btrim(admin_city) <> ''
      )
    ),
  ADD CONSTRAINT organization_invitations_admin_first_name_length_check
    CHECK (admin_first_name IS NULL OR length(btrim(admin_first_name)) BETWEEN 2 AND 100),
  ADD CONSTRAINT organization_invitations_admin_last_name_length_check
    CHECK (admin_last_name IS NULL OR length(btrim(admin_last_name)) BETWEEN 1 AND 100),
  ADD CONSTRAINT organization_invitations_admin_phone_length_check
    CHECK (admin_phone IS NULL OR length(btrim(admin_phone)) BETWEEN 7 AND 50),
  ADD CONSTRAINT organization_invitations_admin_country_length_check
    CHECK (admin_country IS NULL OR length(btrim(admin_country)) BETWEEN 1 AND 100),
  ADD CONSTRAINT organization_invitations_admin_city_length_check
    CHECK (admin_city IS NULL OR length(btrim(admin_city)) BETWEEN 2 AND 100);

COMMIT;
