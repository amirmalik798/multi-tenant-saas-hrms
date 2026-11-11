import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../../lib/request-security";
import { isRecord, isValidDateString, jsonResponse, organizationIsActive } from "../../../../lib/schedule-utils";

const TYPES = new Set(["ANNUAL", "SICK", "PERSONAL", "PARENTAL", "UNPAID", "OTHER"]);
const SELECT = `SELECT r.id, r.employee_id AS "employeeId", r.leave_type AS "leaveType", r.start_date::text AS "startDate", r.end_date::text AS "endDate", r.is_paid AS "isPaid", r.reason, r.status, r.reviewer_note AS "reviewerNote", r.decision_at AS "decisionAt", r.created_at AS "createdAt", e.employee_code AS "employeeCode", e.first_name AS "firstName", e.last_name AS "lastName", e.department_id AS "departmentId", d.name AS "departmentName" FROM public.leave_requests r JOIN public.employees e ON e.id = r.employee_id AND e.organization_id = r.organization_id LEFT JOIN public.departments d ON d.id = e.department_id AND d.organization_id = e.organization_id`;

export async function GET() {
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return jsonResponse({ message: "This organization is not active" }, 403);
    const values: unknown[] = [actor.organizationId];
    const conditions = ["r.organization_id = $1::uuid"];
    if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "EMPLOYEE") {
      values.push(actor.employeeId); conditions.push(`r.employee_id = $${values.length}::uuid`);
    } else if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER") {
      values.push(actor.employeeId);
      conditions.push(`(
        r.employee_id = $${values.length}::uuid
        OR EXISTS (
          SELECT 1
          FROM public.departments md
          WHERE md.organization_id = e.organization_id
            AND md.id = e.department_id
            AND md.manager_id = $${values.length}::uuid
        )
      )`);
    } else if (!(actor.kind === "ORGANIZATION_ADMIN" || actor.roleName === "HR_MANAGER")) {
      return jsonResponse({ message: "You do not have permission to view leave requests" }, 403);
    }
    const result = await pool.query(`${SELECT} WHERE ${conditions.join(" AND ")} ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, r.start_date DESC, r.created_at DESC LIMIT 500`, values);
    const requests = result.rows.map((row) => ({ ...row, isOwnRequest: actor.kind === "ORGANIZATION_USER" && row.employeeId === actor.employeeId }));
    return jsonResponse({ status: "ok", requests });
  } catch (error) { console.error("Leave requests GET failed", error); return jsonResponse({ message: "Unable to load leave requests" }, 500); }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request); if (originError) return originError;
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (actor.kind !== "ORGANIZATION_USER" || !actor.employeeId) return jsonResponse({ message: "Only workforce members with an employee record can submit leave requests for themselves" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) return jsonResponse({ message: "This organization is not active" }, 403);
    const parsed = await parseJsonRequestBody(request); if (!parsed.ok) return parsed.response;
    if (!isRecord(parsed.body)) return jsonResponse({ message: "Provide a valid leave request" }, 400);
    const input = parsed.body;
    const leaveType = typeof input.leaveType === "string" ? input.leaveType : "";
    const startDate = input.startDate; const endDate = input.endDate;
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!TYPES.has(leaveType) || !isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate || reason.length < 3 || reason.length > 1000) return jsonResponse({ message: "Choose a leave type, valid date range, and reason of 3–1000 characters" }, 400);
    const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000;
    if (days > 90) return jsonResponse({ message: "A single leave request cannot exceed 91 calendar days" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [actor.organizationId, actor.employeeId]);

      // Match attendance and correction-request rules: a retained session must
      // not let a deactivated workforce record create new leave requests.
      const employee = await client.query(
        `SELECT id
         FROM public.employees
         WHERE id = $1::uuid
           AND organization_id = $2::uuid
           AND employment_status = 'ACTIVE'
         FOR SHARE`,
        [actor.employeeId, actor.organizationId],
      );
      if (!employee.rowCount) {
        await client.query("ROLLBACK");
        return jsonResponse({ message: "Your active employee record was not found. Contact your Organization Admin if this is unexpected." }, 403);
      }

      const overlap = await client.query(`SELECT 1 FROM public.leave_requests WHERE organization_id = $1::uuid AND employee_id = $2::uuid AND status IN ('PENDING','APPROVED') AND daterange(start_date, end_date, '[]') && daterange($3::date, $4::date, '[]') LIMIT 1`, [actor.organizationId, actor.employeeId, startDate, endDate]);
      if (overlap.rowCount) { await client.query("ROLLBACK"); return jsonResponse({ message: "These dates overlap an existing pending or approved leave request" }, 409); }
      const result = await client.query(`INSERT INTO public.leave_requests (organization_id, employee_id, leave_type, start_date, end_date, is_paid, reason) VALUES ($1::uuid,$2::uuid,$3,$4::date,$5::date,$6,$7) RETURNING id, employee_id AS "employeeId", leave_type AS "leaveType", start_date::text AS "startDate", end_date::text AS "endDate", is_paid AS "isPaid", reason, status, created_at AS "createdAt"`, [actor.organizationId, actor.employeeId, leaveType, startDate, endDate, leaveType !== "UNPAID", reason]);
      await client.query("COMMIT");
      return jsonResponse({ status: "ok", request: result.rows[0] }, 201);
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  } catch (error) { console.error("Leave requests POST failed", error); return jsonResponse({ message: "Unable to submit leave request" }, 500); }
}
