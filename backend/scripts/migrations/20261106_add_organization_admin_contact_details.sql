-- Add editable contact details for Organization Admin accounts.
-- Values are stored on the tenant-scoped organization user record.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS contact_phone varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS contact_country varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS contact_city varchar(100) NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_contact_phone_length_check,
  DROP CONSTRAINT IF EXISTS users_contact_country_length_check,
  DROP CONSTRAINT IF EXISTS users_contact_city_length_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_contact_phone_length_check
    CHECK (contact_phone IS NULL OR length(btrim(contact_phone)) <= 50),
  ADD CONSTRAINT users_contact_country_length_check
    CHECK (contact_country IS NULL OR length(btrim(contact_country)) <= 100),
  ADD CONSTRAINT users_contact_city_length_check
    CHECK (contact_city IS NULL OR length(btrim(contact_city)) <= 100);

COMMIT;
