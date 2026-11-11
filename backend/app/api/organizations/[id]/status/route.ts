import { NextResponse } from "next/server";

import { pool } from "../../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../../lib/auth";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type OrganizationStatus =
  | "PENDING_SETUP"
  | "ACTIVE"
  | "SUSPENDED"
  | "ARCHIVED";

type OrganizationStatusRow = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  updated_at: string | Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TARGET_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

type TargetStatus = (typeof ALLOWED_TARGET_STATUSES)[number];

function isTargetStatus(value: unknown): value is TargetStatus {
  return (
    typeof value === "string" &&
    ALLOWED_TARGET_STATUSES.includes(value as TargetStatus)
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      status: "error",
      message,
    },
    { status },
  );
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  // 0. Reject requests that fail same-origin validation.
  // This runs before authentication, body parsing, and database access.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // 1. Require JSON and enforce the shared request-body size limit.
  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  try {
    // 2. Require an authenticated Platform Super Admin.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return jsonError("Authentication required", 401);
    }

    // 3. Validate the organization ID.
    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return jsonError("Invalid organization ID", 400);
    }

    // 4. Validate the request body.
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      !("status" in body) ||
      !isTargetStatus(body.status)
    ) {
      return jsonError(
        "Status must be ACTIVE, SUSPENDED, or ARCHIVED",
        400,
      );
    }

    const requestedStatus = body.status;
    const restoreArchived = "restoreArchived" in body && body.restoreArchived === true;

    // Existing suspend/reactivate callers may omit the reason.
    // Archiving requires an explicit, meaningful reason.
    let reason: string | null = null;

    if ("reason" in body) {
      if (typeof body.reason !== "string") {
        return jsonError(
          "Reason must be a string",
          400,
        );
      }

      const normalizedReason = body.reason.trim();

      if (normalizedReason.length > 1000) {
        return jsonError(
          "Reason must not exceed 1000 characters",
          400,
        );
      }

      reason = normalizedReason || null;
    }

    if (
      (requestedStatus === "ARCHIVED" || restoreArchived) &&
      (!reason || reason.length < 3)
    ) {
      return jsonError(
        "A reason of at least 3 characters is required to archive or restore an organization.",
        400,
      );
    }

    // 5. Lock the organization row so concurrent status changes
    // cannot bypass the transition rules.
    const client = await pool.connect();

    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const existingResult =
        await client.query<OrganizationStatusRow>(
          `SELECT id, name, slug, status, updated_at
           FROM organizations
           WHERE id = $1
           FOR UPDATE`,
          [id],
        );

      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonError("Organization not found", 404);
      }

      const organization = existingResult.rows[0];
      const currentStatus = organization.status;

      // 6. PENDING_SETUP cannot be changed through this endpoint.
      // The dedicated setup-completion workflow must handle activation.
      if (currentStatus === "PENDING_SETUP") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonError(
          "Organization setup must be completed before changing its status.",
          409,
        );
      }

      // 7. Archival remains terminal by default. A deliberate, reasoned
      // restore can move an archived tenant to SUSPENDED for review before
      // an administrator explicitly reactivates it.
      if (currentStatus === "ARCHIVED" && !(restoreArchived && requestedStatus === "SUSPENDED")) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        if (requestedStatus === "ARCHIVED") {
          return NextResponse.json({
            status: "ok",
            message: "Organization is already ARCHIVED",
            organization,
          });
        }

        return jsonError(
          "Archived organizations cannot be reactivated or have their status changed.",
          409,
        );
      }

      // 8. Treat repeated requests for the current status as
      // successful no-ops.
      if (currentStatus === requestedStatus) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return NextResponse.json({
          status: "ok",
          message: `Organization is already ${currentStatus}`,
          organization,
        });
      }

      // 9. Enforce explicit, permitted transitions:
      //
      // ACTIVE -> SUSPENDED
      // SUSPENDED -> ACTIVE
      // SUSPENDED -> ARCHIVED
      //
      // ACTIVE -> ARCHIVED is deliberately rejected. Suspend first.
      const isAllowedTransition =
        (currentStatus === "ACTIVE" && requestedStatus === "SUSPENDED") ||
        (currentStatus === "SUSPENDED" && (requestedStatus === "ACTIVE" || requestedStatus === "ARCHIVED")) ||
        (currentStatus === "ARCHIVED" && restoreArchived && requestedStatus === "SUSPENDED");

      if (!isAllowedTransition) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        if (
          currentStatus === "ACTIVE" &&
          requestedStatus === "ARCHIVED"
        ) {
          return jsonError(
            "Suspend the organization before archiving it.",
            409,
          );
        }

        return jsonError(
          `Transition from ${currentStatus} to ${requestedStatus} is not allowed.`,
          409,
        );
      }

      // 10. Update only the status field and update timestamp.
      // Do not delete or modify historical organization records.
      const updateResult =
        await client.query<OrganizationStatusRow>(
          `UPDATE organizations
           SET status = $1,
               updated_at = NOW()
           WHERE id = $2
             AND status = $3
           RETURNING id, name, slug, status, updated_at`,
          [requestedStatus, id, currentStatus],
        );

      if (updateResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonError(
          "Organization status changed concurrently. Reload and try again.",
          409,
        );
      }

      const updatedOrganization = updateResult.rows[0];

      // 11. Record the status change in the audit log within the
      // same transaction, so a failed audit insert rolls back the change.
      await client.query(
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
           $1, $2, $3, $4, $5, $6, $7,
           $8::jsonb, $9::jsonb, $10::jsonb
         )`,
        [
          admin.id,
          admin.email,
          "organization.status.change",
          "ORGANIZATION",
          id,
          id,
          reason,
          JSON.stringify({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            status: currentStatus,
            updatedAt: organization.updated_at,
          }),
          JSON.stringify({
            id: updatedOrganization.id,
            name: updatedOrganization.name,
            slug: updatedOrganization.slug,
            status: updatedOrganization.status,
            updatedAt: updatedOrganization.updated_at,
          }),
          JSON.stringify({
            previousStatus: currentStatus,
            newStatus: requestedStatus,
            restoredFromArchive: currentStatus === "ARCHIVED" && restoreArchived,
          }),
        ],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      // 12. Return the persisted organization status.
      return NextResponse.json({
        status: "ok",
        message: `Organization status changed to ${requestedStatus}`,
        organization: updatedOrganization,
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error(
            "Organization status rollback failed:",
            rollbackError,
          );
        }
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Organization status update error:", error);

    return jsonError(
      "Failed to update organization status",
      500,
    );
  }
}