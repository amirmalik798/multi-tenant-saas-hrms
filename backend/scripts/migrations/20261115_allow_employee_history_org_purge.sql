-- Allow permanent organization deletion to remove tenant-owned employee history.
--
-- Employee history remains append-only for all normal application workflows.
-- The exception is limited to DELETE statements running in the dedicated
-- organization purge transaction, which sets this transaction-local flag.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_employee_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.organization_deletion', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Employee history is append-only; UPDATE and DELETE are prohibited.'
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION public.reject_employee_history_mutation() IS
  'Rejects employee-history UPDATE/DELETE except transaction-scoped organization purge DELETE operations.';

COMMIT;
