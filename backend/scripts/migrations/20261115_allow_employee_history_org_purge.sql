-- Keep employee history append-only for normal workflows, while allowing
-- the controlled organization purge transaction to remove tenant-owned rows.
--
-- The purge also detaches employee/department references before deleting
-- those tables. These deferred hierarchy guards must skip validation only
-- inside that same transaction; their normal behavior remains unchanged.

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

CREATE OR REPLACE FUNCTION public.check_department_hierarchy_deferred()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.organization_deletion', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM public.assert_active_department_hierarchy(NEW.id);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_employee_hierarchy_deferred()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee_id uuid;
  v_department_id uuid;
  v_hierarchy_changed boolean := TRUE;
BEGIN
  IF current_setting('app.organization_deletion', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_hierarchy_changed :=
      NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
      OR NEW.department_id IS DISTINCT FROM OLD.department_id
      OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
      OR NEW.workforce_role_id IS DISTINCT FROM OLD.workforce_role_id;

    IF NOT v_hierarchy_changed THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM public.assert_active_employee_hierarchy(NEW.id);

  IF TG_OP = 'UPDATE' THEN
    FOR v_employee_id IN
      SELECT DISTINCT e.id
      FROM public.employees AS e
      WHERE e.manager_id = OLD.id
        AND e.employment_status = 'ACTIVE'
        AND e.id <> OLD.id
    LOOP
      PERFORM public.assert_active_employee_hierarchy(v_employee_id);
    END LOOP;

    FOR v_department_id IN
      SELECT d.id
      FROM public.departments AS d
      WHERE d.manager_id = OLD.id
        AND d.status = 'ACTIVE'
    LOOP
      PERFORM public.assert_active_department_hierarchy(v_department_id);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_manager_hierarchy_deferred()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee_ids uuid[] := ARRAY[]::uuid[];
  v_employee_id uuid;
  v_department_id uuid;
BEGIN
  IF current_setting('app.organization_deletion', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.account_scope IS NOT DISTINCT FROM OLD.account_scope
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN
      RETURN NULL;
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    IF OLD.employee_id IS NOT NULL THEN
      v_employee_ids := array_append(v_employee_ids, OLD.employee_id);
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NEW.employee_id IS NOT NULL THEN
      v_employee_ids := array_append(v_employee_ids, NEW.employee_id);
    END IF;
  END IF;

  FOR v_employee_id IN
    SELECT DISTINCT affected.id
    FROM unnest(v_employee_ids) AS affected(id)
    WHERE affected.id IS NOT NULL
  LOOP
    PERFORM public.assert_active_employee_hierarchy(v_employee_id);
  END LOOP;

  FOR v_employee_id IN
    SELECT DISTINCT e.id
    FROM public.employees AS e
    WHERE e.manager_id = ANY(v_employee_ids)
      AND e.employment_status = 'ACTIVE'
  LOOP
    PERFORM public.assert_active_employee_hierarchy(v_employee_id);
  END LOOP;

  FOR v_department_id IN
    SELECT d.id
    FROM public.departments AS d
    WHERE d.manager_id = ANY(v_employee_ids)
      AND d.status = 'ACTIVE'
  LOOP
    PERFORM public.assert_active_department_hierarchy(v_department_id);
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.reject_employee_history_mutation() IS
  'Rejects employee-history UPDATE/DELETE except transaction-scoped organization purge DELETE operations.';

COMMIT;
