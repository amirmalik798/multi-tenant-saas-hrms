-- Records the Organization Admin's explicit review of required tenant settings.
-- Existing organizations remain incomplete until their administrator completes setup.
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ NULL;
