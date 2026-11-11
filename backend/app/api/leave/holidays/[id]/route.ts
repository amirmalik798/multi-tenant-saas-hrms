import { pool } from "../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { validateSameOriginRequest } from "../../../../../lib/request-security";
import { isUuid, jsonResponse, organizationIsActive } from "../../../../../lib/schedule-utils";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = validateSameOriginRequest(request); if (originError) return originError;
  try {
    const actor = await getTenantPermissionActor(); if (!actor) return jsonResponse({ message: "Authentication required" }, 401);
    if (!(actor.kind === "ORGANIZATION_ADMIN" || (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER"))) return jsonResponse({ message: "Only HR Managers or Organization Admins can remove public holidays" }, 403);
    if (!(await organizationIsActive(pool, actor.organizationId))) return jsonResponse({ message: "This organization is not active" }, 403);
    const { id } = await context.params; if (!isUuid(id)) return jsonResponse({ message: "Invalid holiday ID" }, 400);
    const result = await pool.query(`DELETE FROM public.public_holidays WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id`, [id, actor.organizationId]);
    if (!result.rowCount) return jsonResponse({ message: "Public holiday not found" }, 404);
    return jsonResponse({ status: "ok", id });
  } catch (error) { console.error("Public holiday DELETE failed", error); return jsonResponse({ message: "Unable to remove public holiday" }, 500); }
}
