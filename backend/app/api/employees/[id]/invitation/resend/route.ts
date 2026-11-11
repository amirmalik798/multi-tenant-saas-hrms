import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "../../../../../../lib/db";
import { sendEmployeeInvitationEmail } from "../../../../../../lib/email";
import { writeEmployeeHistory } from "../../../../../../lib/workforce";
import { getTenantPermissionActor, hasTenantPermission } from "../../../../../../lib/permissions";
import { validateSameOriginRequest } from "../../../../../../lib/request-security";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/**
 * POST /api/employees/:id/invitation/resend
 *
 * Rotates the token for an existing, unexpired pending invitation and sends
 * the new link. Tenant scope and permissions come from the verified actor.
 */
export async function POST(request: Request, context: RouteContext) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const { id: employeeId } = await context.params;
  if (!UUID_PATTERN.test(employeeId)) return json({ message: "Invalid employee ID." }, 400);

  const actor = await getTenantPermissionActor();
  if (!actor) return json({ message: "Authentication required." }, 401);

  if (!hasTenantPermission(actor, "employee.create") || !hasTenantPermission(actor, "user.invite")) {
    return json({ message: "You do not have permission to resend workforce invitations." }, 403);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
  const invitationUrl = new URL("/employee-invitations/accept", frontendUrl);
  invitationUrl.searchParams.set("token", token);

  const client = await pool.connect();
  let invitation: {
    id: string;
    email: string;
    employee_name: string;
    organization_name: string;
    role_name: string;
    status: string;
    expires_at: string | Date;
  } | null = null;

  try {
    await client.query("BEGIN");

    const organizationResult = await client.query<{ status: string; name: string }>(
      `SELECT status, name FROM public.organizations WHERE id = $1::uuid FOR SHARE`,
      [actor.organizationId],
    );
    const organization = organizationResult.rows[0];
    if (!organization || organization.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      return json({ message: "Your organization must be active to resend invitations." }, 403);
    }

    const result = await client.query<{
      id: string;
      email: string;
      employee_name: string;
      role_name: string;
      status: string;
      expires_at: string | Date;
      employment_status: string;
    }>(
      `SELECT i.id::text AS id,
              i.email,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), i.email) AS employee_name,
              r.name AS role_name,
              i.status,
              i.expires_at,
              e.employment_status
       FROM public.employee_invitations i
       JOIN public.employees e
         ON e.id = i.employee_id AND e.organization_id = i.organization_id
       JOIN public.roles r
         ON r.id = i.role_id AND r.organization_id = i.organization_id
        AND r.scope = 'ORGANIZATION'
       WHERE i.organization_id = $1::uuid
         AND i.employee_id = $2::uuid
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT 1
       FOR UPDATE OF i, e`,
      [actor.organizationId, employeeId],
    );
    const row = result.rows[0];

    if (!row) {
      await client.query("ROLLBACK");
      return json({ message: "No invitation was found for this employee in your organization." }, 404);
    }

    if (row.status !== "PENDING" || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return json({ message: "Only an unexpired pending invitation can be resent. For an expired invitation, use the normal invitation workflow to create a new one." }, 409);
    }

    if (row.employment_status === "FORMER") {
      await client.query("ROLLBACK");
      return json({ message: "Former employees cannot receive a standard workforce invitation." }, 409);
    }

    if (row.role_name === "HR_MANAGER" && actor.kind !== "ORGANIZATION_ADMIN") {
      await client.query("ROLLBACK");
      return json({ message: "Only the Organization Admin may resend an HR Manager invitation." }, 403);
    }

    const existingUser = await client.query(
      `SELECT id FROM public.users
       WHERE organization_id = $1::uuid
         AND (employee_id = $2::uuid OR LOWER(TRIM(email)) = LOWER(TRIM($3)))
       LIMIT 1`,
      [actor.organizationId, employeeId, row.email],
    );
    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return json({ message: "An account already exists for this employee or email address." }, 409);
    }

    const updated = await client.query(
      `UPDATE public.employee_invitations
       SET token_hash = $1, expires_at = $2, updated_at = NOW()
       WHERE id = $3::uuid
         AND organization_id = $4::uuid
         AND status = 'PENDING'
       RETURNING id::text AS id, email, status, expires_at`,
      [tokenHash, expiresAt, row.id, actor.organizationId],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      return json({ message: "The invitation changed while you were resending it. Refresh the page and try again." }, 409);
    }

    await writeEmployeeHistory(client as PoolClient, {
      organizationId: actor.organizationId,
      employeeId,
      actorUserId: actor.userId,
      eventType: "INVITATION_RESENT",
      reason: "An authorized organization user resent an existing pending workforce invitation.",
      beforeState: { invitation_status: row.status, expires_at: row.expires_at },
      afterState: { invitation_status: "PENDING", expires_at: expiresAt.toISOString() },
      metadata: { workflow: "employee_invitation_resend", invitation_id: row.id },
    });

    invitation = {
      id: row.id,
      email: row.email,
      employee_name: row.employee_name,
      organization_name: organization.name,
      role_name: row.role_name,
      status: row.status,
      expires_at: expiresAt,
    };

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to prepare workforce invitation resend:", error);
    return json({ message: "Unable to prepare the invitation resend right now." }, 500);
  } finally {
    client.release();
  }

  if (!invitation) return json({ message: "Unable to prepare the invitation resend." }, 500);

  try {
    await sendEmployeeInvitationEmail({
      to: invitation.email,
      organizationName: invitation.organization_name,
      employeeName: invitation.employee_name,
      workforceRole: invitation.role_name,
      invitationUrl: invitationUrl.toString(),
      expiresAt: expiresAt.toISOString(),
    });
    return json({ status: "ok", message: "Invitation email sent again.", invitationId: invitation.id });
  } catch (error) {
    console.error("Failed to deliver resent workforce invitation:", error);
    return json({
      status: "error",
      message: "The invitation token was refreshed, but the email could not be delivered. Please retry the resend after checking email configuration.",
      invitationId: invitation.id,
    }, 502);
  }
}
