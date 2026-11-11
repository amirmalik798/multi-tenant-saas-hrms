import { pool } from "../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../../../lib/request-security";
import { isRecord, isUuid, jsonResponse, organizationIsActive } from "../../../../../lib/schedule-utils";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = validateSameOriginRequest(request); if (originError) return originError;
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return jsonResponse({ message: "This organization is not active" }, 403);
    const { id } = await context.params; if (!isUuid(id)) return jsonResponse({ message: "Invalid leave request ID" }, 400);
    const parsed = await parseJsonRequestBody(request); if (!parsed.ok) return parsed.response;
    if (!isRecord(parsed.body)) return jsonResponse({ message: "Provide a valid decision" }, 400);
    const status = parsed.body.status;
    const reviewerNote = typeof parsed.body.reviewerNote === "string" ? parsed.body.reviewerNote.trim() : "";
    if ((status !== "APPROVED" && status !== "REJECTED" && status !== "CANCELLED") || reviewerNote.length > 1000) return jsonResponse({ message: "Provide an allowed decision and reviewer note up to 1000 characters" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT r.id, r.employee_id AS "employeeId", r.status, e.department_id AS "departmentId", d.manager_id AS "departmentManagerId" FROM public.leave_requests r JOIN public.employees e ON e.id = r.employee_id AND e.organization_id = r.organization_id LEFT JOIN public.departments d ON d.id = e.department_id AND d.organization_id = e.organization_id WHERE r.id = $1::uuid AND r.organization_id = $2::uuid FOR UPDATE OF r`, [id, actor.organizationId]);
      const row = current.rows[0];
      if (!row) { await client.query("ROLLBACK"); return jsonResponse({ message: "Leave request not found" }, 404); }
      const isEmployee = actor.kind === "ORGANIZATION_USER" && actor.roleName === "EMPLOYEE";
      const isManager = actor.kind === "ORGANIZATION_USER" && actor.roleName === "DEPARTMENT_MANAGER";
      const isOwnRequest = actor.kind === "ORGANIZATION_USER" && row.employeeId === actor.employeeId;
      if (status === "CANCELLED") {
        if (!isOwnRequest || row.status !== "PENDING") { await client.query("ROLLBACK"); return jsonResponse({ message: "Only the requesting workforce member can cancel their own pending request" }, 403); }
        await client.query(`UPDATE public.leave_requests SET status='CANCELLED', updated_at=now() WHERE id=$1::uuid`, [id]);
      } else {
        if (!(actor.kind === "ORGANIZATION_ADMIN" || (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER") || isManager)) { await client.query("ROLLBACK"); return jsonResponse({ message: "You do not have permission to decide leave requests" }, 403); }
        if (isEmployee || (actor.kind === "ORGANIZATION_USER" && row.employeeId === actor.employeeId)) { await client.query("ROLLBACK"); return jsonResponse({ message: "You cannot approve or reject your own leave request" }, 403); }
        if (isManager && row.departmentManagerId !== actor.employeeId) { await client.query("ROLLBACK"); return jsonResponse({ message: "You can decide requests only for employees in your managed departments" }, 403); }
        if (row.status !== "PENDING") { await client.query("ROLLBACK"); return jsonResponse({ message: "Only pending leave requests can be decided" }, 409); }
        if (status === "APPROVED") {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [actor.organizationId, row.employeeId]);
          const conflict = await client.query(`SELECT 1 FROM public.leave_requests r WHERE r.organization_id=$1::uuid AND r.employee_id=$2::uuid AND r.id<>$3::uuid AND r.status='APPROVED' AND daterange(r.start_date,r.end_date,'[]') && (SELECT daterange(pending.start_date,pending.end_date,'[]') FROM public.leave_requests pending WHERE pending.id=$3::uuid AND pending.organization_id=$1::uuid) LIMIT 1`, [actor.organizationId, row.employeeId, id]);
          if (conflict.rowCount) { await client.query("ROLLBACK"); return jsonResponse({ message: "This employee has another approved leave request overlapping these dates" }, 409); }
        }
        await client.query(`UPDATE public.leave_requests SET status=$2, reviewer_note=NULLIF($3,''), decided_by_user_id=$4::uuid, decision_at=now(), updated_at=now() WHERE id=$1::uuid`, [id, status, reviewerNote, actor.userId]);
      }
      await client.query("COMMIT");
      return jsonResponse({ status: "ok", id, decision: status });
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  } catch (error) { console.error("Leave decision failed", error); return jsonResponse({ message: "Unable to update leave request" }, 500); }
}
