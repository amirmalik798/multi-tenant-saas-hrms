BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  hourly_rate numeric(12,4) NOT NULL,
  overtime_rate numeric(12,4) NOT NULL,
  currency_code character(3) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_pay_rates_hourly_rate_check CHECK (hourly_rate >= 0),
  CONSTRAINT employee_pay_rates_overtime_rate_check CHECK (overtime_rate >= 0),
  CONSTRAINT employee_pay_rates_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT employee_pay_rates_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT employee_pay_rates_org_employee_fk
    FOREIGN KEY (organization_id, employee_id)
    REFERENCES public.employees (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT employee_pay_rates_org_creator_fk
    FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES public.users (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_employee_pay_rates_effective_lookup
  ON public.employee_pay_rates (organization_id, employee_id, effective_from DESC, effective_to);

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_pay_rates_org_employee_effective_from
  ON public.employee_pay_rates (organization_id, employee_id, effective_from);

COMMENT ON TABLE public.employee_pay_rates IS
  'Effective-dated hourly and overtime rates. Earnings are estimates from attendance minutes and approved overtime; this is not a complete payroll ledger.';

COMMIT;
