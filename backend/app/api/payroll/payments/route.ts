import { NextResponse } from "next/server";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { organizationIsActive } from "../../../../lib/schedule-utils";
import { calculateOrganizationMonthlyPay } from "../../../../lib/monthly-salary-calculation";
import { isExcludedHrTargetRole } from "../../../../lib/workforce-eligibility";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } });
}
function validMonth(value: string | null): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}
function canManage(actor: NonNullable<Awaited<ReturnType<typeof getTenantPermissionActor>>>) {
  return actor.kind === "ORGANIZATION_ADMIN" || (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER");
}

export async function GET(request: Request) {
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);
    const month = new URL(request.url).searchParams.get("month");
    if (!validMonth(month)) return json({ message: "Provide month in YYYY-MM format" }, 400);
    const start = `${month}-01`;
    const isEmployee = actor.kind === "ORGANIZATION_USER" && actor.roleName === "EMPLOYEE";
    const isDm = actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";
    if (!canManage(actor) && !isEmployee && !isDm) return json({ message: "You do not have permission to view salary payments" }, 403);
    const result = await pool.query(
      `SELECT p.id, e.id AS "employeeId", e.employee_code AS "employeeCode",
              e.first_name AS "firstName", e.last_name AS "lastName", e.department_id AS "departmentId",
              d.name AS "departmentName", $2::date::text AS "payMonth", p.amount::text AS amount,
              COALESCE(p.currency_code, rate.currency_code, 'RWF') AS "currencyCode",
              COALESCE(p.status, 'UNPAID') AS status, p.paid_at AS "paidAt",
              p.payment_reference AS "paymentReference", p.notes, p.updated_at AS "updatedAt"
       FROM public.employees e
       LEFT JOIN public.departments d ON d.id = e.department_id AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS workforce_role ON workforce_role.id = e.workforce_role_id AND workforce_role.organization_id = e.organization_id
       LEFT JOIN public.monthly_salary_payments p ON p.organization_id = e.organization_id AND p.employee_id = e.id AND p.pay_month = $2::date
       LEFT JOIN LATERAL (
         SELECT pr.currency_code FROM public.employee_pay_rates pr
         WHERE pr.organization_id = e.organization_id AND pr.employee_id = e.id
           AND pr.effective_from <= ($2::date + INTERVAL '1 month - 1 day')::date
           AND (pr.effective_to IS NULL OR pr.effective_to >= $2::date)
         ORDER BY pr.effective_from DESC LIMIT 1
       ) rate ON TRUE
       WHERE e.organization_id = $1::uuid
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'ORGANIZATION_ADMIN%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'ORGANIZATIONADMIN%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'ORG_ADMIN%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'ORGANIZATION_OWNER%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'ORG_OWNER%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'TENANT_ADMIN%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'ADMINISTRATOR%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'HR_MANAGER%'
         AND COALESCE(regexp_replace(UPPER(workforce_role.name), '[^A-Z0-9]+', '_', 'g'), 'EMPLOYEE') NOT LIKE 'HRMANAGER%'
         AND NOT EXISTS (
           SELECT 1
           FROM public.users AS target_account
           JOIN public.roles AS target_account_role
             ON target_account_role.id = target_account.role_id
            AND target_account_role.organization_id = target_account.organization_id
           WHERE target_account.organization_id = e.organization_id
             AND target_account.employee_id = e.id
             AND target_account.account_scope = 'ORGANIZATION'
             AND regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
         )
         AND (
           e.employment_status = 'ACTIVE'
           OR p.id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM public.attendance_events ae
             WHERE ae.organization_id = e.organization_id
               AND ae.employee_id = e.id
               AND ae.work_date >= $2::date
               AND ae.work_date < ($2::date + INTERVAL '1 month')
           )
           OR EXISTS (
             SELECT 1 FROM public.employee_pay_rates pr
             WHERE pr.organization_id = e.organization_id
               AND pr.employee_id = e.id
               AND pr.effective_from < ($2::date + INTERVAL '1 month')
               AND (pr.effective_to IS NULL OR pr.effective_to >= $2::date)
           )
           OR EXISTS (
             SELECT 1 FROM public.leave_requests lr
             WHERE lr.organization_id = e.organization_id
               AND lr.employee_id = e.id
               AND lr.status = 'APPROVED'
               AND lr.start_date < ($2::date + INTERVAL '1 month')
               AND lr.end_date >= $2::date
           )
         )
         AND ($3::boolean OR ($4::boolean AND e.id = $5::uuid) OR
              ($6::boolean AND (e.id = $5::uuid OR EXISTS (
                SELECT 1 FROM public.departments md
                WHERE md.organization_id = e.organization_id
                  AND md.id = e.department_id
                  AND md.manager_id = $5::uuid
              ))))
       ORDER BY e.first_name, e.last_name, e.employee_code`,
      [actor.organizationId, start, canManage(actor), isEmployee, actor.kind === "ORGANIZATION_USER" ? actor.employeeId : null, isDm],
    );
    const calculated = await calculateOrganizationMonthlyPay(pool, actor.organizationId, month);
    const payments = result.rows.map((row) => {
      const estimate = calculated.get(String(row.employeeId));
      const workedMinutes = estimate?.workedMinutes ?? 0;
      const payableMinutes = estimate?.payableMinutes ?? 0;
      const calculatedAmount = estimate?.amount ?? null;
      const recordedAmount = row.status === "PAID" ? row.amount : null;
      const currencyMismatch = estimate?.currencyMismatch === true;
      const status = row.status === "PAID"
        ? "PAID"
        : payableMinutes <= 0
          ? "NO_RECORDED_HOURS"
          : currencyMismatch
            ? "CURRENCY_MISMATCH"
            : calculatedAmount === null
              ? "RATE_REQUIRED"
              : "UNPAID";
      return {
        ...row,
        workedMinutes,
        payableMinutes,
        paidLeaveMinutes: estimate?.paidLeaveMinutes ?? 0,
        paidHolidayMinutes: estimate?.paidHolidayMinutes ?? 0,
        calculatedAmount: calculatedAmount === null ? null : calculatedAmount.toFixed(2),
        calculatedRegularAmount: estimate ? estimate.regularAmount.toFixed(2) : null,
        calculatedOvertimeAmount: estimate ? estimate.overtimeAmount.toFixed(2) : null,
        calculatedPaidAbsenceAmount: estimate ? estimate.paidAbsenceAmount.toFixed(2) : null,
        amount: recordedAmount !== null ? recordedAmount : calculatedAmount === null ? null : calculatedAmount.toFixed(2),
        currencyMismatch,
        status,
        currencyCode: estimate?.currencyCode || row.currencyCode || "RWF",
      };
    });
    return json({ status: "ok", month, payments });
  } catch (error) {
    console.error("Failed to load monthly salary payments:", error);
    return json({ message: "Unable to load salary payments" }, 500);
  }
}

export async function PUT(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!canManage(actor)) return json({ message: "Only an Organization Admin or HR Manager can record salary payments" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);
    const parsedBody = await parseJsonRequestBody(request);
    if (!parsedBody.ok) return parsedBody.response;
    const body: unknown = parsedBody.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Provide a valid request body" }, 400);
    const input = body as Record<string, unknown>;
    const employeeId = typeof input.employeeId === "string" ? input.employeeId : "";
    const month = typeof input.month === "string" ? input.month : "";
    const currencyCode = typeof input.currencyCode === "string" ? input.currencyCode.trim().toUpperCase() : "";
    const status = input.status === "PAID" ? "PAID" : input.status === "UNPAID" ? "UNPAID" : "";
    const reference = typeof input.paymentReference === "string" ? input.paymentReference.trim() : "";
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId) || !validMonth(month) || (currencyCode && !/^[A-Z]{3}$/.test(currencyCode)) || !status || reference.length > 120 || notes.length > 1000) {
      return json({ message: "Provide a valid employee, month, payment status, and optional reference/notes within the limits" }, 400);
    }
    const monthCalculation = await calculateOrganizationMonthlyPay(pool, actor.organizationId, month);
    const calculatedEmployee = monthCalculation.get(employeeId);
    await client.query("BEGIN");
    transactionStarted = true;
    const employee = await client.query(
      `SELECT e.id, r.name AS workforce_role,
              EXISTS (
                SELECT 1 FROM public.users target_account
                JOIN public.roles target_account_role ON target_account_role.id = target_account.role_id AND target_account_role.organization_id = target_account.organization_id
                WHERE target_account.organization_id = e.organization_id AND target_account.employee_id = e.id
                  AND target_account.account_scope = 'ORGANIZATION'
                  AND regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
              ) AS is_organization_admin
       FROM public.employees e
       LEFT JOIN public.roles r ON r.id = e.workforce_role_id AND r.organization_id = e.organization_id
       WHERE e.id = $1::uuid AND e.organization_id = $2::uuid
       FOR UPDATE OF e`,
      [employeeId, actor.organizationId],
    );
    if (!employee.rowCount) { await client.query("ROLLBACK"); return json({ message: "Employee not found in this organization" }, 404); }
    if (isExcludedHrTargetRole(employee.rows[0].workforce_role) || employee.rows[0].is_organization_admin) {
      await client.query("ROLLBACK");
      return json({ message: "Organization Admin and HR Manager records are not eligible for salary payments" }, 403);
    }
    if (!calculatedEmployee || calculatedEmployee.payableMinutes <= 0) {
      await client.query("ROLLBACK");
      return json({ message: "No payable working hours are available for this employee in the selected month. Approved paid leave or paid public holidays can qualify when they cover scheduled workdays." }, 409);
    }
    if (calculatedEmployee.amount === null) {
      await client.query("ROLLBACK");
      return json({ message: calculatedEmployee.currencyMismatch
        ? "This employee has multiple currencies in the selected month. Correct the effective pay-rate history before recording a salary payment."
        : "A valid effective pay rate is required for all payable working time before a salary record can be saved." }, 409);
    }
    const amountToRecord = calculatedEmployee.amount;
    const currencyToRecord = calculatedEmployee.currencyCode || currencyCode || "RWF";
    const saved = await client.query(
      `INSERT INTO public.monthly_salary_payments
        (organization_id, employee_id, pay_month, amount, currency_code, status, paid_at, payment_reference, notes, recorded_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::date, $4::numeric, $5, $6,
               CASE WHEN $6 = 'PAID' THEN now() ELSE NULL END, NULLIF($7, ''), NULLIF($8, ''), $9::uuid)
       ON CONFLICT (organization_id, employee_id, pay_month)
       DO UPDATE SET amount = EXCLUDED.amount, currency_code = EXCLUDED.currency_code, status = EXCLUDED.status,
                     paid_at = CASE WHEN EXCLUDED.status = 'PAID' THEN COALESCE(public.monthly_salary_payments.paid_at, now()) ELSE NULL END,
                     payment_reference = EXCLUDED.payment_reference, notes = EXCLUDED.notes,
                     recorded_by_user_id = EXCLUDED.recorded_by_user_id, updated_at = now()
       RETURNING id, employee_id AS "employeeId", pay_month::text AS "payMonth", amount::text AS amount,
                 currency_code AS "currencyCode", status, paid_at AS "paidAt", payment_reference AS "paymentReference", notes`,
      [actor.organizationId, employeeId, `${month}-01`, amountToRecord, currencyToRecord, status, reference, notes, actor.userId],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return json({ status: "ok", payment: saved.rows[0] });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to record monthly salary payment:", error);
    return json({ message: "Unable to save salary payment" }, 500);
  } finally { client.release(); }
}
