-- Step 7: decouple active overtime approvals from timesheets.
--
-- Historical RECORDED_OVERTIME rows and their timesheet_id values are retained
-- for audit/history. The API no longer creates or reviews this legacy request
-- type. Removing the foreign key means timesheet storage can be retired in a
-- later, separately reviewed migration without deleting overtime history.

BEGIN;

ALTER TABLE public.attendance_overtime_requests
  DROP CONSTRAINT IF EXISTS fk_overtime_timesheet;

ALTER TABLE public.attendance_overtime_requests
  DROP CONSTRAINT IF EXISTS chk_overtime_timesheet_type;

COMMENT ON COLUMN public.attendance_overtime_requests.timesheet_id IS
  'Legacy historical reference only. New advance overtime requests must not depend on timesheets. Retained temporarily for audit compatibility.';

COMMIT;
