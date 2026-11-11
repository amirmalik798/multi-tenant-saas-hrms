BEGIN;

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  leave_type varchar(24) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_paid boolean NOT NULL DEFAULT true,
  reason varchar(1000) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'PENDING',
  reviewer_note varchar(1000),
  decided_by_user_id uuid,
  decision_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_type_check CHECK (leave_type IN ('ANNUAL', 'SICK', 'PERSONAL', 'PARENTAL', 'UNPAID', 'OTHER')),
  CONSTRAINT leave_requests_date_check CHECK (start_date <= end_date),
  CONSTRAINT leave_requests_reason_check CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  CONSTRAINT leave_requests_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT leave_requests_decision_check CHECK ((status IN ('PENDING', 'CANCELLED') AND decision_at IS NULL) OR (status IN ('APPROVED', 'REJECTED') AND decision_at IS NOT NULL)),
  CONSTRAINT leave_requests_org_employee_fk FOREIGN KEY (organization_id, employee_id)
    REFERENCES public.employees (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT leave_requests_org_decider_fk FOREIGN KEY (organization_id, decided_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_org_dates ON public.leave_requests (organization_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_dates ON public.leave_requests (organization_id, employee_id, start_date, end_date, status);

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  holiday_date date NOT NULL,
  name varchar(160) NOT NULL,
  is_paid boolean NOT NULL DEFAULT true,
  notes varchar(500),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_holidays_name_check CHECK (length(trim(name)) BETWEEN 2 AND 160),
  CONSTRAINT public_holidays_org_date_uniq UNIQUE (organization_id, holiday_date),
  CONSTRAINT public_holidays_org_creator_fk FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_public_holidays_org_date ON public.public_holidays (organization_id, holiday_date);

COMMENT ON TABLE public.leave_requests IS 'Organization-scoped leave requests and approvals. Paid leave is credited to salary only for scheduled days with no recorded work.';
COMMENT ON TABLE public.public_holidays IS 'Organization-scoped public holiday calendar; paid holidays are credited to salary only for scheduled days with no recorded work.';
COMMIT;
