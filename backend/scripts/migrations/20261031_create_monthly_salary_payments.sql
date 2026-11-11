BEGIN;

CREATE TABLE IF NOT EXISTS public.monthly_salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  pay_month date NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency_code character(3) NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'UNPAID',
  paid_at timestamptz,
  payment_reference varchar(120),
  notes varchar(1000),
  recorded_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_salary_payments_amount_check CHECK (amount >= 0),
  CONSTRAINT monthly_salary_payments_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT monthly_salary_payments_month_check CHECK (EXTRACT(DAY FROM pay_month) = 1),
  CONSTRAINT monthly_salary_payments_status_check CHECK (status IN ('PAID', 'UNPAID')),
  CONSTRAINT monthly_salary_payments_paid_at_check CHECK ((status = 'PAID' AND paid_at IS NOT NULL) OR (status = 'UNPAID' AND paid_at IS NULL)),
  CONSTRAINT monthly_salary_payments_org_employee_fk FOREIGN KEY (organization_id, employee_id)
    REFERENCES public.employees (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT monthly_salary_payments_org_recorder_fk FOREIGN KEY (organization_id, recorded_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT monthly_salary_payments_org_employee_month_uniq UNIQUE (organization_id, employee_id, pay_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_salary_payments_org_month
  ON public.monthly_salary_payments (organization_id, pay_month DESC, status);
CREATE INDEX IF NOT EXISTS idx_monthly_salary_payments_employee_month
  ON public.monthly_salary_payments (organization_id, employee_id, pay_month DESC);

COMMENT ON TABLE public.monthly_salary_payments IS
  'HR-entered monthly salary payment tracking. Amount is the actual amount recorded as payable/paid; it is not automatically inferred from estimated earnings.';

COMMIT;
