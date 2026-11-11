-- Persist manager review decisions for clock-outs beyond scheduled/approved time.
-- These decisions never grant overtime pay retroactively; payroll continues to
-- pay only advance-approved overtime.
BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_excess_overtime_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  scheduled_end timestamptz NOT NULL,
  actual_clock_out timestamptz NOT NULL,
  excess_minutes integer NOT NULL CHECK (excess_minutes > 0),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'REVIEWED_NO_PAY', 'FOLLOW_UP')),
  reviewed_by_user_id uuid NULL,
  reviewer_note text NULL CHECK (reviewer_note IS NULL OR length(reviewer_note) <= 500),
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attendance_excess_overtime_review
    UNIQUE (organization_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_excess_overtime_review_scope
  ON public.attendance_excess_overtime_reviews
    (organization_id, work_date DESC, status);

COMMIT;
