import { connection, NextResponse } from "next/server";

import { pool } from "../../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../../lib/auth";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type TargetStatus = "ACTIVE" | "SUSPENDED";

type OrganizationAdminRow = {
  id: string;
  email: string;
  account_status: string;
  organization_id: string;
  organization_name: string;
  organization_status: string;
  role_name: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  status: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTargetStatus(value: unknown): value is TargetStatus {
  return value === "ACTIVE" || value === "SUSPENDED";
}

function jsonResponse(
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

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  // 1. Validate request origin before authentication and database work.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // This endpoint depends on incoming request cookies and session state.
  await connection();

  try {
    // 2. Parse JSON using the shared request size limit.
    const parsedBody = await parseJsonRequestBody(request);

    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const body = parsedBody.body;

    // 3. Require a Platform Super Admin session.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return jsonResponse(
        {
          status: "error",
          message: "Authentication required",
        },
        401,
      );
    }

    // 4. Validate target ID.
    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid Organization Admin ID",
        },
        400,
      );
    }

    // 5. Validate the complete request body.
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      !("status" in body) ||
      !isTargetStatus(body.status) ||
      !("reason" in body) ||
      typeof body.reason !== "string"
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "A valid status and an audit reason are required",
        },
        400,
      );
    }

    const requestedStatus = body.status;
    const reason = body.reason.trim();

    if (reason.length < 3 || reason.length > 500) {
      return jsonResponse(
        {
          status: "error",
          message:
            "The reason must be between 3 and 500 characters",
        },
        400,
      );
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      /*
       * 6. Resolve the Organization Admin's tenant using the role
       * associated with their organization account.
       */
      const candidateResult = await client.query<{
        organization_id: string;
      }>(
        `SELECT u.organization_id
         FROM public.users AS u
         JOIN public.roles AS r
           ON r.id = u.role_id
          AND r.scope = 'ORGANIZATION'
          AND r.organization_id = u.organization_id
         WHERE u.id = $1
           AND u.account_scope = 'ORGANIZATION'
           AND r.name = 'ORGANIZATION_ADMIN'
         LIMIT 1`,
        [id],
      );

      if (!candidateResult.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            status: "error",
            message: "Organization Admin account not found",
          },
          404,
        );
      }

      const organizationId =
        candidateResult.rows[0].organization_id;

      /*
       * 7. Serialize administrator status changes for this organization.
       * This prevents concurrent requests from bypassing the
       * last-active-admin safeguard.
       */
      const organizationLock =
        await client.query<OrganizationRow>(
          `SELECT id, name, status
           FROM public.organizations
           WHERE id = $1
           FOR UPDATE`,
          [organizationId],
        );

      if (!organizationLock.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            status: "error",
            message: "Organization not found",
          },
          404,
        );
      }

      const organization = organizationLock.rows[0];

      /*
       * 8. Re-read and lock the exact target after locking the tenant.
       */
      const targetResult =
        await client.query<OrganizationAdminRow>(
          `SELECT
             u.id,
             u.email,
             u.status AS account_status,
             u.organization_id,
             o.name AS organization_name,
             o.status AS organization_status,
             r.name AS role_name
           FROM public.users AS u
           JOIN public.roles AS r
             ON r.id = u.role_id
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = u.organization_id
           JOIN public.organizations AS o
             ON o.id = u.organization_id
           WHERE u.id = $1
             AND u.organization_id = $2
             AND u.account_scope = 'ORGANIZATION'
             AND r.name = 'ORGANIZATION_ADMIN'
           FOR UPDATE OF u`,
          [id, organizationId],
        );

      if (!targetResult.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            status: "error",
            message: "Organization Admin account not found",
          },
          404,
        );
      }

      const target = targetResult.rows[0];

      /*
       * 9. Only ACTIVE and SUSPENDED accounts can be managed by this route.
       * INVITED or DEACTIVATED accounts must use their appropriate workflow.
       */
      if (
        target.account_status !== "ACTIVE" &&
        target.account_status !== "SUSPENDED"
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            status: "error",
            message:
              `An account with status ${target.account_status} cannot be changed through this endpoint`,
          },
          409,
        );
      }

      // 10. Repeated status requests are successful no-ops.
      if (target.account_status === requestedStatus) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse({
          status: "ok",
          message:
            `Organization Admin account is already ${requestedStatus}`,
          organizationAdmin: {
            id: target.id,
            email: target.email,
            account_status: target.account_status,
            organization_id: target.organization_id,
            organization_name: target.organization_name,
            organization_status: target.organization_status,
            role_name: target.role_name,
          },
          auditRecorded: false,
        });
      }

      /*
       * 11. Do not reactivate an account while its organization is
       * suspended or archived.
       */
      if (
        requestedStatus === "ACTIVE" &&
        organization.status !== "ACTIVE"
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            status: "error",
            message:
              "The Organization Admin cannot be reactivated until the organization is ACTIVE",
          },
          409,
        );
      }

      /*
       * 12. Protect the last active Organization Admin.
       * Archived tenants do not need to retain an active administrator.
       */
      if (
        requestedStatus === "SUSPENDED" &&
        organization.status !== "ARCHIVED"
      ) {
        const countResult = await client.query<{
          active_count: string;
        }>(
          `SELECT COUNT(*)::text AS active_count
           FROM public.users AS u
           JOIN public.roles AS r
             ON r.id = u.role_id
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = u.organization_id
           WHERE u.organization_id = $1
             AND u.account_scope = 'ORGANIZATION'
             AND u.status = 'ACTIVE'
             AND r.name = 'ORGANIZATION_ADMIN'`,
          [organizationId],
        );

        const activeCount = Number(
          countResult.rows[0]?.active_count ?? 0,
        );

        if (activeCount <= 1) {
          await client.query("ROLLBACK");
          transactionStarted = false;

          return jsonResponse(
            {
              status: "error",
              message:
                "The last active Organization Admin cannot be suspended",
            },
            409,
          );
        }
      }

      /*
       * 13. Change the status and increment the session version.
       * Incrementing it ensures existing sessions using the previous
       * version can no longer be treated as current.
       */
      const updateResult = await client.query<{
        id: string;
        email: string;
        status: string;
        updated_at: Date | string;
      }>(
        `UPDATE public.users
         SET status = $1,
             session_version = session_version + 1,
             updated_at = NOW()
         WHERE id = $2
           AND organization_id = $3
           AND account_scope = 'ORGANIZATION'
         RETURNING id, email, status, updated_at`,
        [requestedStatus, id, organizationId],
      );

      if (updateResult.rows.length !== 1) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            status: "error",
            message:
              "Organization Admin status could not be updated",
          },
          409,
        );
      }

      const updatedUser = updateResult.rows[0];

      const actionKey =
        requestedStatus === "SUSPENDED"
          ? "organization_admin.suspend"
          : "organization_admin.reactivate";

      /*
       * 14. Record the audit event in the same transaction.
       * If audit insertion fails, the account change is rolled back.
       */
      const auditResult = await client.query<{
        id: string;
      }>(
        `INSERT INTO public.platform_audit_logs (
           actor_user_id,
           actor_email,
           action_key,
           target_type,
           target_id,
           organization_id,
           reason,
           before_state,
           after_state,
           metadata
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8::jsonb,
           $9::jsonb,
           $10::jsonb
         )
         RETURNING id`,
        [
          admin.id,
          admin.email,
          actionKey,
          "ORGANIZATION_ADMIN",
          updatedUser.id,
          organizationId,
          reason,
          JSON.stringify({
            accountStatus: target.account_status,
          }),
          JSON.stringify({
            accountStatus: updatedUser.status,
          }),
          JSON.stringify({
            organizationName: organization.name,
            organizationStatus: organization.status,
            roleName: target.role_name,
            sessionVersionIncremented: true,
          }),
        ],
      );

      // 15. Commit status and audit changes together.
      await client.query("COMMIT");
      transactionStarted = false;

      return jsonResponse({
        status: "ok",
        message:
          `Organization Admin account status changed to ${updatedUser.status}`,
        organizationAdmin: {
          id: updatedUser.id,
          email: updatedUser.email,
          account_status: updatedUser.status,
          organization_id: organizationId,
          organization_name: organization.name,
          organization_status: organization.status,
          role_name: target.role_name,
          updated_at: updatedUser.updated_at,
        },
        auditRecorded: true,
        auditEventId: auditResult.rows[0].id,
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
          transactionStarted = false;
        } catch (rollbackError) {
          console.error(
            "Organization Admin status rollback failed:",
            rollbackError,
          );
        }
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "Organization Admin status update failed:",
      error,
    );

    return jsonResponse(
      {
        status: "error",
        message:
          "Unable to update Organization Admin status",
      },
      500,
    );
  }
}