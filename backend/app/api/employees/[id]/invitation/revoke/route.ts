import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { pool } from "../../../../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../../../lib/permissions";
import { writeEmployeeHistory } from "../../../../../../lib/workforce";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InvitationRow = {
  id: string;
  organization_id: string;
  employee_id: string;
  email: string;
  status:
    | "PENDING"
    | "ACCEPTED"
    | "REVOKED"
    | "EXPIRED"
    | string;
  expires_at: Date | string;
  is_expired: boolean;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function json(
  body: unknown,
  status = 200,
) {
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

async function markInvitationExpired(
  client: PoolClient,
  actorUserId: string,
  organizationId: string,
  employeeId: string,
  invitationId: string,
): Promise<InvitationRow | null> {
  const result = await client.query<InvitationRow>(
    `UPDATE public.employee_invitations
     SET status = 'EXPIRED',
         updated_at = NOW()
     WHERE id = $1
       AND organization_id = $2
       AND employee_id = $3
       AND status = 'PENDING'
       AND expires_at <= NOW()
     RETURNING
       id,
       organization_id,
       employee_id,
       email,
       status,
       expires_at,
       TRUE AS is_expired,
       accepted_at,
       revoked_at,
       created_at,
       updated_at`,
    [invitationId, organizationId, employeeId],
  );

  const expired = result.rows[0];

  if (!expired) {
    return null;
  }

  await writeEmployeeHistory(client, {
    organizationId,
    employeeId,
    actorUserId,
    eventType: "INVITATION_EXPIRED",
    reason:
      "The invitation had expired before it could be revoked.",
    beforeState: {
      invitation_status: "PENDING",
    },
    afterState: {
      invitation_status: "EXPIRED",
      expires_at: new Date(
        expired.expires_at,
      ).toISOString(),
    },
    metadata: {
      workflow: "employee_invitation_revocation",
      invitation_id: expired.id,
    },
  });

  return expired;
}

// POST /api/employees/[id]/invitation/revoke
export async function POST(
  request: Request,
  context: RouteContext,
) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  let client: PoolClient | null = null;
  let transactionOpen = false;

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return json(
        {
          status: "error",
          message: "Authentication required.",
        },
        401,
      );
    }

    /*
     * Revocation is limited to Organization Admins and HR Managers.
     * Both must have current database-backed permissions.
     */
    const allowedRole =
      actor.kind === "ORGANIZATION_ADMIN" ||
      (
        actor.kind === "ORGANIZATION_USER" &&
        actor.roleName === "HR_MANAGER"
      );

    const allowed =
      allowedRole &&
      hasTenantPermission(actor, "employee.create") &&
      hasTenantPermission(actor, "user.invite");

    if (!allowed) {
      return json(
        {
          status: "error",
          message:
            "You do not have permission to revoke employee invitations.",
        },
        403,
      );
    }

    const { id: employeeId } = await context.params;

    if (!UUID_PATTERN.test(employeeId)) {
      return json(
        {
          status: "error",
          message: "Invalid employee ID.",
        },
        400,
      );
    }

    if (
      typeof parsedBody.body !== "object" ||
      parsedBody.body === null ||
      Array.isArray(parsedBody.body)
    ) {
      return json(
        {
          status: "error",
          message:
            "Invalid invitation revocation request body.",
        },
        400,
      );
    }

    const body = parsedBody.body as Record<
      string,
      unknown
    >;

    const invitationId =
      typeof body.invitationId === "string"
        ? body.invitationId.trim()
        : "";

    if (!UUID_PATTERN.test(invitationId)) {
      return json(
        {
          status: "error",
          message: "A valid invitationId is required.",
        },
        400,
      );
    }

    const requestedReason =
      typeof body.reason === "string"
        ? body.reason.trim()
        : "";

    if (requestedReason.length > 500) {
      return json(
        {
          status: "error",
          message:
            "The revocation reason must be 500 characters or fewer.",
        },
        400,
      );
    }

    const reason =
      requestedReason ||
      "Invitation revoked by an authorized organization user.";

    client = await pool.connect();

    await client.query("BEGIN");
    transactionOpen = true;

    // 1. Confirm the actor's organization is still active.
    const organizationResult = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM public.organizations
       WHERE id = $1
       FOR SHARE`,
      [actor.organizationId],
    );

    const organization = organizationResult.rows[0];

    if (
      !organization ||
      organization.status !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return json(
        {
          status: "error",
          message: "The organization is not active.",
        },
        403,
      );
    }

    // 2. Lock the employee within this organization.
    const employeeResult = await client.query<{
      id: string;
      employee_code: string;
    }>(
      `SELECT id, employee_code
       FROM public.employees
       WHERE id = $1
         AND organization_id = $2
       FOR UPDATE`,
      [employeeId, actor.organizationId],
    );

    if (!employeeResult.rows.length) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return json(
        {
          status: "error",
          message:
            "Employee not found in your organization.",
        },
        404,
      );
    }

    // 3. Lock the invitation and enforce employee and tenant ownership.
    const invitationResult =
      await client.query<InvitationRow>(
        `SELECT
           id,
           organization_id,
           employee_id,
           email,
           status,
           expires_at,
           (expires_at <= NOW()) AS is_expired,
           accepted_at,
           revoked_at,
           created_at,
           updated_at
         FROM public.employee_invitations
         WHERE id = $1
           AND employee_id = $2
           AND organization_id = $3
         FOR UPDATE`,
        [
          invitationId,
          employeeId,
          actor.organizationId,
        ],
      );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return json(
        {
          status: "error",
          message:
            "Invitation not found for this employee in your organization.",
        },
        404,
      );
    }

    // 4. Keep revocation idempotent for stale UI requests.
    if (invitation.status === "REVOKED") {
      await client.query("COMMIT");
      transactionOpen = false;

      return json({
        status: "ok",
        message: "This invitation was already revoked.",
        invitation: {
          id: invitation.id,
          status: "REVOKED",
          expires_at: invitation.expires_at,
          revoked_at: invitation.revoked_at,
          updated_at: invitation.updated_at,
        },
      });
    }

    if (invitation.status !== "PENDING") {
      await client.query("COMMIT");
      transactionOpen = false;

      return json(
        {
          status: "error",
          message:
            invitation.status === "ACCEPTED"
              ? "This invitation has already been accepted and cannot be revoked."
              : "This invitation is no longer pending.",
          invitation: {
            id: invitation.id,
            status: invitation.status,
            expires_at: invitation.expires_at,
            revoked_at: invitation.revoked_at,
            updated_at: invitation.updated_at,
          },
        },
        409,
      );
    }

    // 5. Convert expired pending invitations to EXPIRED, not REVOKED.
    if (invitation.is_expired) {
      const expired = await markInvitationExpired(
        client,
        actor.userId,
        actor.organizationId,
        employeeId,
        invitationId,
      );

      if (!expired) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return json(
          {
            status: "error",
            message:
              "The invitation changed during the request. Refresh and try again.",
          },
          409,
        );
      }

      await client.query("COMMIT");
      transactionOpen = false;

      return json(
        {
          status: "error",
          message:
            "This invitation had already expired. It has been marked EXPIRED.",
          invitation: {
            id: expired.id,
            status: "EXPIRED",
            expires_at: expired.expires_at,
            updated_at: expired.updated_at,
          },
        },
        409,
      );
    }

    // 6. Revoke only a pending, non-expired invitation.
    const revokeResult =
      await client.query<InvitationRow>(
        `UPDATE public.employee_invitations
         SET status = 'REVOKED',
             revoked_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND organization_id = $2
           AND employee_id = $3
           AND status = 'PENDING'
           AND expires_at > NOW()
         RETURNING
           id,
           organization_id,
           employee_id,
           email,
           status,
           expires_at,
           FALSE AS is_expired,
           accepted_at,
           revoked_at,
           created_at,
           updated_at`,
        [
          invitationId,
          actor.organizationId,
          employeeId,
        ],
      );

    const revoked = revokeResult.rows[0];

    if (!revoked) {
      /*
       * Handle the expiry boundary without exposing an internal error
       * or incorrectly reporting a database failure as HTTP 500.
       */
      const expired = await markInvitationExpired(
        client,
        actor.userId,
        actor.organizationId,
        employeeId,
        invitationId,
      );

      if (expired) {
        await client.query("COMMIT");
        transactionOpen = false;

        return json(
          {
            status: "error",
            message:
              "This invitation had expired before revocation. It has been marked EXPIRED.",
            invitation: {
              id: expired.id,
              status: "EXPIRED",
              expires_at: expired.expires_at,
              updated_at: expired.updated_at,
            },
          },
          409,
        );
      }

      await client.query("ROLLBACK");
      transactionOpen = false;

      return json(
        {
          status: "error",
          message:
            "The invitation changed during the request. Refresh and try again.",
        },
        409,
      );
    }

    // 7. Record the revocation atomically with the invitation change.
    await writeEmployeeHistory(client, {
      organizationId: actor.organizationId,
      employeeId,
      actorUserId: actor.userId,
      eventType: "INVITATION_REVOKED",
      reason,
      beforeState: {
        invitation_status: "PENDING",
      },
      afterState: {
        invitation_status: "REVOKED",
        expires_at: new Date(
          revoked.expires_at,
        ).toISOString(),
        revoked_at: new Date(
          revoked.revoked_at as Date | string,
        ).toISOString(),
      },
      metadata: {
        workflow: "employee_invitation_revocation",
        invitation_id: revoked.id,
      },
    });

    await client.query("COMMIT");
    transactionOpen = false;

    return json({
      status: "ok",
      message: "Invitation revoked successfully.",
      invitation: {
        id: revoked.id,
        status: "REVOKED",
        expires_at: revoked.expires_at,
        revoked_at: revoked.revoked_at,
        updated_at: revoked.updated_at,
      },
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
        transactionOpen = false;
      } catch (rollbackError) {
        console.error(
          "Invitation revocation rollback failed:",
          rollbackError,
        );
      }
    }

    const dbError = error as {
      code?: string;
    };

    if (
      dbError.code === "23503" ||
      dbError.code === "23514"
    ) {
      return json(
        {
          status: "error",
          message:
            "The invitation or employee state is no longer valid.",
        },
        409,
      );
    }

    console.error(
      "Failed to revoke employee invitation:",
      error,
    );

    return json(
      {
        status: "error",
        message:
          "Unable to revoke the invitation right now.",
      },
      500,
    );
  } finally {
    client?.release();
  }
}