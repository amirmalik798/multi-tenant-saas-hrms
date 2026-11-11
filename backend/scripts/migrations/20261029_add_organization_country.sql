-- Safe, repeatable schema addition for organization country.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS country VARCHAR(100);
