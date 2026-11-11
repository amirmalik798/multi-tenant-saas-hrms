-- Adds an optional, organization-configurable early clock-in window.
-- NULL preserves the previous behavior (no early clock-in restriction).
-- Set a value from 0 to 180 to enforce an earliest permitted clock-in time.
-- This is separate from the existing late-arrival grace period.

ALTER TABLE public.attendance_policy_settings
  ADD COLUMN IF NOT EXISTS early_clock_in_window_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_policy_settings_early_clock_in_window_check'
      AND conrelid = 'public.attendance_policy_settings'::regclass
  ) THEN
    ALTER TABLE public.attendance_policy_settings
      ADD CONSTRAINT attendance_policy_settings_early_clock_in_window_check
      CHECK (early_clock_in_window_minutes IS NULL OR (early_clock_in_window_minutes >= 0 AND early_clock_in_window_minutes <= 180));
  END IF;
END
$$;
