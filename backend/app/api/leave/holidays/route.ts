import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../../lib/request-security";
import { isRecord, isValidDateString, jsonResponse, organizationIsActive } from "../../../../lib/schedule-utils";

function canManage(actor: NonNullable<Awaited<ReturnType<typeof getTenantPermissionActor>>>) { return actor.kind === "ORGANIZATION_ADMIN" || (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER"); }
export async function GET(request: Request) {
  try {
    const actor = await getTenantPermissionActor(); if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return jsonResponse({ message: "This organization is not active" }, 403);
    const url = new URL(request.url); const from = url.searchParams.get("fromDate"); const to = url.searchParams.get("toDate");
    if ((from && !isValidDateString(from)) || (to && !isValidDateString(to)) || (from && to && from > to)) return jsonResponse({ message: "Provide a valid holiday date range" }, 400);
    const result = await pool.query(`SELECT id, holiday_date::text AS "holidayDate", name, is_paid AS "isPaid", notes, created_at AS "createdAt" FROM public.public_holidays WHERE organization_id=$1::uuid AND ($2::date IS NULL OR holiday_date >= $2::date) AND ($3::date IS NULL OR holiday_date <= $3::date) ORDER BY holiday_date LIMIT 500`, [actor.organizationId, from, to]);
    return jsonResponse({ status: "ok", canManage: canManage(actor), holidays: result.rows });
  } catch (error) { console.error("Public holidays GET failed", error); return jsonResponse({ message: "Unable to load public holidays" }, 500); }
}
export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request); if (originError) return originError;
  try {
    const actor = await getTenantPermissionActor(); if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (!canManage(actor)) return jsonResponse({ message: "Only HR Managers or Organization Admins can manage public holidays" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) return jsonResponse({ message: "This organization is not active" }, 403);
    const parsed = await parseJsonRequestBody(request); if (!parsed.ok) return parsed.response;
    if (!isRecord(parsed.body)) return jsonResponse({ message: "Provide a valid holiday" }, 400);
    const date = parsed.body.holidayDate; const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : ""; const notes = typeof parsed.body.notes === "string" ? parsed.body.notes.trim() : ""; const isPaid = parsed.body.isPaid !== false;
    if (!isValidDateString(date) || name.length < 2 || name.length > 160 || notes.length > 500) return jsonResponse({ message: "Provide a valid date, a holiday name of 2–160 characters, and notes up to 500 characters" }, 400);
    const result = await pool.query(`INSERT INTO public.public_holidays (organization_id, holiday_date, name, is_paid, notes, created_by_user_id) VALUES ($1::uuid,$2::date,$3,$4,NULLIF($5,''),$6::uuid) ON CONFLICT (organization_id, holiday_date) DO UPDATE SET name=EXCLUDED.name,is_paid=EXCLUDED.is_paid,notes=EXCLUDED.notes,updated_at=now() RETURNING id, holiday_date::text AS "holidayDate", name, is_paid AS "isPaid", notes`, [actor.organizationId, date, name, isPaid, notes, actor.userId]);
    return jsonResponse({ status: "ok", holiday: result.rows[0] }, 201);
  } catch (error) { console.error("Public holiday POST failed", error); return jsonResponse({ message: "Unable to save public holiday" }, 500); }
}
