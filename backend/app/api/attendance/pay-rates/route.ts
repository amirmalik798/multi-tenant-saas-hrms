import { NextResponse } from "next/server";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { organizationIsActive } from "../../../../lib/schedule-utils";
import { isExcludedHrTargetRole } from "../../../../lib/workforce-eligibility";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function canManageRates(actor: Awaited<ReturnType<typeof getTenantPermissionActor>>) {
  return Boolean(actor && (
    actor.kind === "ORGANIZATION_ADMIN" ||
    (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER")
  ));
}

export async function GET(request: Request) {
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!canManageRates(actor)) return json({ message: "Only an Organization Admin or HR Manager can manage employee pay rates" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);

    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId");
    if (!employeeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId)) {
      return json({ message: "Provide a valid employeeId" }, 400);
    }

    if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER" && employeeId === actor.employeeId) {
      return json({ message: "The current HR Manager is not eligible for employee pay-rate management" }, 403);
    }
    const target = await pool.query(
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
       WHERE e.organization_id = $1::uuid AND e.id = $2::uuid
       LIMIT 1`,
      [actor.organizationId, employeeId],
    );
    if (!target.rowCount) return json({ message: "Employee not found in this organization" }, 404);
    if (isExcludedHrTargetRole(target.rows[0].workforce_role) || target.rows[0].is_organization_admin) {
      return json({ message: "Organization Admin and HR Manager records are not eligible for employee pay rates" }, 403);
    }

    const [result, settings] = await Promise.all([
      pool.query(
      `SELECT r.id, r.employee_id AS "employeeId", r.hourly_rate::text AS "hourlyRate",
              r.overtime_rate::text AS "overtimeRate", r.currency_code AS "currencyCode",
              r.effective_from::text AS "effectiveFrom", r.effective_to::text AS "effectiveTo",
              r.created_at AS "createdAt", r.updated_at AS "updatedAt"
       FROM public.employee_pay_rates r
       JOIN public.employees e ON e.id = r.employee_id AND e.organization_id = r.organization_id
       WHERE r.organization_id = $1::uuid AND r.employee_id = $2::uuid
       ORDER BY r.effective_from DESC, r.created_at DESC`,
      [actor.organizationId, employeeId],
      ),
      pool.query<{ currency_code: string | null }>(
        `SELECT currency_code FROM public.organization_settings WHERE organization_id = $1::uuid LIMIT 1`,
        [actor.organizationId],
      ),
    ]);
    return json({ status: "ok", rates: result.rows, organizationCurrencyCode: settings.rows[0]?.currency_code?.toUpperCase() ?? null });
  } catch (error) {
    console.error("Failed to load employee pay rates:", error);
    return json({ message: "Unable to load employee pay rates" }, 500);
  }
}

export async function PUT(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;
  const client = await pool.connect();
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!canManageRates(actor)) return json({ message: "Only an Organization Admin or HR Manager can manage employee pay rates" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);

    const parsedBody = await parseJsonRequestBody(request);
    if (!parsedBody.ok) return parsedBody.response;
    const body: unknown = parsedBody.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Provide a valid request body" }, 400);
    const input = body as Record<string, unknown>;
    const employeeId = typeof input.employeeId === "string" ? input.employeeId : "";
    const hourlyRate = typeof input.hourlyRate === "number" ? input.hourlyRate : Number(input.hourlyRate);
    const overtimeRate = typeof input.overtimeRate === "number" ? input.overtimeRate : Number(input.overtimeRate);
    const currencyCode = typeof input.currencyCode === "string" ? input.currencyCode.trim().toUpperCase() : "";
    const effectiveFrom = input.effectiveFrom;
    const effectiveTo = input.effectiveTo === null || input.effectiveTo === "" ? null : input.effectiveTo;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId) || !Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 99999999 ||
        !Number.isFinite(overtimeRate) || overtimeRate < 0 || overtimeRate > 99999999 ||
        !/^[A-Z]{3}$/.test(currencyCode) || !validDate(effectiveFrom) ||
        (effectiveTo !== null && !validDate(effectiveTo)) ||
        (typeof effectiveTo === "string" && effectiveTo < effectiveFrom)) {
      return json({ message: "Provide an employee, valid non-negative rates, a three-letter currency code, and valid effective dates" }, 400);
    }

    if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER" && employeeId === actor.employeeId) {
      return json({ message: "The current HR Manager is not eligible for employee pay-rate management" }, 403);
    }

    await client.query("BEGIN");
    const organizationSettings = await client.query<{ currency_code: string | null }>(
      `SELECT currency_code FROM public.organization_settings WHERE organization_id = $1::uuid LIMIT 1`,
      [actor.organizationId],
    );
    const organizationCurrencyCode = organizationSettings.rows[0]?.currency_code?.toUpperCase() ?? null;
    if (!organizationCurrencyCode) {
      await client.query("ROLLBACK");
      return json({ message: "Configure the organization currency in Organization Profile & Settings before setting employee pay rates." }, 409);
    }
    if (currencyCode !== organizationCurrencyCode) {
      await client.query("ROLLBACK");
      return json({ message: `Pay rates must use the organization currency (${organizationCurrencyCode}).` }, 409);
    }
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
       LIMIT 1 FOR UPDATE OF e`,
      [employeeId, actor.organizationId],
    );
    if (!employee.rowCount) {
      await client.query("ROLLBACK");
      return json({ message: "Employee not found in this organization" }, 404);
    }
    if (isExcludedHrTargetRole(employee.rows[0].workforce_role) || employee.rows[0].is_organization_admin) {
      await client.query("ROLLBACK");
      return json({ message: "Organization Admin and HR Manager records are not eligible for employee pay rates" }, 403);
    }

    const currencyHistory = await client.query<{ currency_code: string }>(
      `SELECT DISTINCT currency_code
       FROM public.employee_pay_rates
       WHERE organization_id = $1::uuid AND employee_id = $2::uuid
       LIMIT 2`,
      [actor.organizationId, employeeId],
    );
    if (currencyHistory.rows.some((row) => row.currency_code !== currencyCode)) {
      await client.query("ROLLBACK");
      return json({ message: "An employee's currency cannot be changed across pay-rate history. Use one currency for consistent monthly totals." }, 409);
    }

    const overlap = await client.query(
      `SELECT 1
       FROM public.employee_pay_rates
       WHERE organization_id = $1::uuid
         AND employee_id = $2::uuid
         AND effective_from <> $3::date
         AND effective_from <= COALESCE($5::date, 'infinity'::date)
         AND COALESCE(effective_to, 'infinity'::date) >= $4::date
       LIMIT 1`,
      [actor.organizationId, employeeId, effectiveFrom, effectiveFrom, effectiveTo],
    );
    if (overlap.rowCount) {
      await client.query("ROLLBACK");
      return json({ message: "This effective period overlaps another saved pay-rate period. Choose non-overlapping dates." }, 409);
    }

    const saved = await client.query(
      `INSERT INTO public.employee_pay_rates
         (organization_id, employee_id, hourly_rate, overtime_rate, currency_code,
          effective_from, effective_to, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5, $6::date, $7::date, $8::uuid)
       ON CONFLICT (organization_id, employee_id, effective_from)
       DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate,
                     overtime_rate = EXCLUDED.overtime_rate,
                     currency_code = EXCLUDED.currency_code,
                     effective_to = EXCLUDED.effective_to,
                     updated_at = now()
       RETURNING id, employee_id AS "employeeId", hourly_rate::text AS "hourlyRate",
                 overtime_rate::text AS "overtimeRate", currency_code AS "currencyCode",
                 effective_from::text AS "effectiveFrom", effective_to::text AS "effectiveTo",
                 updated_at AS "updatedAt"`,
      [actor.organizationId, employeeId, hourlyRate, overtimeRate, currencyCode, effectiveFrom, effectiveTo, actor.userId],
    );
    await client.query("COMMIT");
    return json({ status: "ok", rate: saved.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to save employee pay rate:", error);
    return json({ message: "Unable to save employee pay rate" }, 500);
  } finally {
    client.release();
  }
}
