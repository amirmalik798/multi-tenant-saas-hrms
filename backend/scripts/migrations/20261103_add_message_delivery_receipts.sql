-- Add WhatsApp-style delivery/read receipt timestamps to existing messaging tables.
-- Safe to run on existing installations; no existing messages or read timestamps are rewritten.
ALTER TABLE public.workforce_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;

ALTER TABLE public.platform_support_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS workforce_messages_delivery_idx
  ON public.workforce_messages (organization_id, sender_user_id, delivered_at)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_support_messages_delivery_idx
  ON public.platform_support_messages (organization_id, sender_user_id, delivered_at)
  WHERE delivered_at IS NULL;
