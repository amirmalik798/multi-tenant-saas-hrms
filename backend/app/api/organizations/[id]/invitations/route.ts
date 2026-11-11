import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "../../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../../lib/auth";
import { sendOrganizationAdminInvitationEmail } from "../../../../../lib/email";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";

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
      "Referrer-Policy": "no-referrer",
    },
  });
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getDatabaseErrorCode(
  error: unknown,
): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

async function writePlatformAudit(
  client: PoolClient,
  input: {
    actorId: string;
    actorEmail: string;
    actionKey: string;
    targetId: string;
    organizationId: string;
    reason?: string | null;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
) {
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
       $1, $2, $3, 'ORGANIZATION_ADMIN_INVITATION',
       $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb
     )`,
    [
      input.actorId,
      input.actorEmail,
      input.actionKey,
      input.targetId,
      input.organizationId,
      input.reason ?? null,
      JSON.stringify(input.beforeState),
      JSON.stringify(input.afterState),
      JSON.stringify(input.metadata),
    ],
  );
}

/**
 * GET /api/organizations/[id]/invitations
 *
 * Platform Super Admin invitation registry.
 * Token hashes are never returned.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
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

    const { id: organizationId } = await params;

    if (!UUID_PATTERN.test(organizationId)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid organization ID",
        },
        400,
      );
    }

    const organizationResult = await pool.query<{
      id: string;
      name: string;
    }>(
      `SELECT id, name
       FROM public.organizations
       WHERE id = $1
       LIMIT 1`,
      [organizationId],
    );

    if (!organizationResult.rows.length) {
      return jsonResponse(
        {
          status: "error",
          message: "Organization not found",
        },
        404,
      );
    }

    const result = await pool.query<{
      id: string;
      email: string;
      status: InvitationStatus;
      expires_at: Date | string;
      accepted_at: Date | string | null;
      revoked_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT
         id,
         email,
         status,
         expires_at,
         accepted_at,
         revoked_at,
         created_at
       FROM public.organization_invitations
       WHERE organization_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [organizationId],
    );

    return jsonResponse({
      status: "ok",
      organization: organizationResult.rows[0],
      count: result.rows.length,
      invitations: result.rows,
    });
  } catch (error) {
    console.error(
      "Failed to fetch organization invitations:",
      error,
    );

    return jsonResponse(
      {
        status: "error",
        message: "Unable to fetch organization invitations",
      },
      500,
    );
  }
}

/**
 * POST /api/organizations/[id]/invitations
 *
 * Only Platform Super Admins can create Organization Admin invitations.
 * Email delivery uses the provider selected by EMAIL_MODE in the shared
 * email service.
 */
export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const bodyResult = await parseJsonRequestBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  let client: PoolClient | null = null;
  let transactionOpen = false;

  try {
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

    const { id: organizationId } = await params;

    if (!UUID_PATTERN.test(organizationId)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid organization ID",
        },
        400,
      );
    }

    const body: unknown = bodyResult.body;

    if (!isRecord(body) || typeof body.email !== "string") {
      return jsonResponse(
        {
          status: "error",
          message: "A valid email address is required",
        },
        400,
      );
    }

    const email = body.email.trim().toLowerCase();
    const adminProfileFields = [
      body.adminFirstName,
      body.adminLastName,
      body.adminPhone,
      body.adminCountry,
      body.adminCity,
    ];
    const hasAnyAdminProfileField = adminProfileFields.some((value) => value !== undefined);
    const hasAllAdminProfileFields = adminProfileFields.every((value) => typeof value === "string");
    const adminFirstName = typeof body.adminFirstName === "string" ? body.adminFirstName.normalize("NFKC").trim().replace(/\s+/g, " ") : null;
    const adminLastName = typeof body.adminLastName === "string" ? body.adminLastName.normalize("NFKC").trim().replace(/\s+/g, " ") : null;
    const adminPhone = typeof body.adminPhone === "string" ? body.adminPhone.normalize("NFKC").trim().replace(/\s+/g, " ") : null;
    const adminCountry = typeof body.adminCountry === "string" ? body.adminCountry.normalize("NFKC").trim().replace(/\s+/g, " ") : null;
    const adminCity = typeof body.adminCity === "string" ? body.adminCity.normalize("NFKC").trim().replace(/\s+/g, " ") : null;

    if (hasAnyAdminProfileField && !hasAllAdminProfileFields) {
      return jsonResponse({ status: "error", message: "Provide all Organization Admin profile fields together." }, 400);
    }
    if (hasAnyAdminProfileField) {
      const phoneDigits = (adminPhone ?? "").replace(/\D/g, "").length;
      if (
        !adminFirstName || adminFirstName.length < 2 || adminFirstName.length > 100 ||
        !adminLastName || adminLastName.length < 1 || adminLastName.length > 100 ||
        !adminCountry || adminCountry.length > 100 ||
        !adminCity || adminCity.length < 2 || adminCity.length > 100 ||
        !adminPhone || adminPhone.length > 50 || phoneDigits < 7 || phoneDigits > 15 ||
        !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(adminPhone)
      ) {
        return jsonResponse({ status: "error", message: "Enter valid administrator name, phone, country, and city details." }, 400);
      }
    }

    if (
      email.length > 254 ||
      !EMAIL_PATTERN.test(email)
    ) {
      return jsonResponse(
        {
          status: "error",
          message: "Please provide a valid email address",
        },
        400,
      );
    }

    /*
     * Validate the provider selected for this environment.
     *
     * sandbox: Mailtrap Sandbox
     * live: Google Apps Script
     *
     * The actual email is sent through the shared email service below.
     */
    const emailMode =
      process.env.EMAIL_MODE?.trim().toLowerCase();

    const mailtrapApiToken =
      process.env.MAILTRAP_API_TOKEN?.trim();

    const mailtrapInboxId =
      process.env.MAILTRAP_INBOX_ID?.trim();

    const googleAppsScriptUrl =
      process.env.GOOGLE_APPS_SCRIPT_URL?.trim();

    const hrmsEmailSecret =
      process.env.HRMS_EMAIL_SECRET?.trim();

    if (
      emailMode !== "sandbox" &&
      emailMode !== "live"
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            'Email delivery mode is invalid. Set EMAIL_MODE to "sandbox" or "live" and configure the corresponding provider in the backend environment.',
        },
        503,
      );
    }

    if (
      emailMode === "sandbox" &&
      (
        !mailtrapApiToken ||
        !mailtrapInboxId ||
        !/^\d+$/.test(mailtrapInboxId)
      )
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "Mailtrap Sandbox is not configured. Check EMAIL_MODE, MAILTRAP_API_TOKEN, and MAILTRAP_INBOX_ID in the backend environment.",
        },
        503,
      );
    }

    if (
      emailMode === "live" &&
      (!googleAppsScriptUrl || !hrmsEmailSecret)
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "Google Apps Script email delivery is not configured. Check EMAIL_MODE, GOOGLE_APPS_SCRIPT_URL, and HRMS_EMAIL_SECRET in the backend environment.",
        },
        503,
      );
    }

    const emailProvider =
      emailMode === "live"
        ? "google_apps_script"
        : "mailtrap_sandbox";

    const frontendUrlValue =
      process.env.FRONTEND_URL?.trim() ||
      "http://localhost:3001";

    let frontendBaseUrl: URL;

    try {
      frontendBaseUrl = new URL(frontendUrlValue);
    } catch {
      return jsonResponse(
        {
          status: "error",
          message:
            "FRONTEND_URL must be a valid absolute URL.",
        },
        503,
      );
    }

    if (
      frontendBaseUrl.protocol !== "http:" &&
      frontendBaseUrl.protocol !== "https:"
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "FRONTEND_URL must use HTTP or HTTPS.",
        },
        503,
      );
    }

    if (
      frontendBaseUrl.username ||
      frontendBaseUrl.password
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "FRONTEND_URL must not contain embedded credentials.",
        },
        503,
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionOpen = true;

    /*
     * 1. Lock the organization.
     *
     * This serializes initial-admin invitations for the same organization.
     */
    const organizationResult = await client.query<{
      id: string;
      name: string;
      status: string;
    }>(
      `SELECT id, name, status
       FROM public.organizations
       WHERE id = $1
       FOR UPDATE`,
      [organizationId],
    );

    const organization = organizationResult.rows[0];

    if (!organization) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message: "Organization not found",
        },
        404,
      );
    }

    if (
      organization.status !== "PENDING_SETUP" &&
      organization.status !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "Organization Admin invitations are only allowed for organizations in PENDING_SETUP or ACTIVE status.",
        },
        409,
      );
    }

    /*
     * 2. Serialize invitation creation globally by normalized email.
     *
     * Locking only the organization row is insufficient: two requests using
     * the same email against different organizations would lock different
     * rows and could both pass the duplicate checks.
     */
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0)
       )`,
      [`organization-admin-invitation:${email}`],
    );

    /*
     * 3. Find this organization's own ORGANIZATION_ADMIN role.
     */
    const roleResult = await client.query<{
      id: string;
    }>(
      `SELECT id
       FROM public.roles
       WHERE organization_id = $1
         AND scope = 'ORGANIZATION'
         AND name = 'ORGANIZATION_ADMIN'`,
      [organizationId],
    );

    if (roleResult.rows.length !== 1) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "The organization must have exactly one ORGANIZATION_ADMIN role.",
        },
        409,
      );
    }

    const roleId = roleResult.rows[0].id;

    /*
     * 4. An existing user with this email anywhere in the platform blocks
     * an invitation, preserving global email uniqueness.
     */
    const existingUser = await client.query(
      `SELECT id
       FROM public.users
       WHERE LOWER(TRIM(email)) = $1
       LIMIT 1`,
      [email],
    );

    if (existingUser.rows.length) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "A user account already exists with this email address.",
        },
        409,
      );
    }

    /*
     * 5. Mark stale invitations for this email as expired.
     * The global advisory lock makes this consistent with other invitation
     * creation requests using the same normalized email.
     */
    await client.query(
      `UPDATE public.organization_invitations
       SET status = 'EXPIRED',
           updated_at = NOW()
       WHERE LOWER(TRIM(email)) = $1
         AND status = 'PENDING'
         AND expires_at <= NOW()`,
      [email],
    );

    const existingInvitation = await client.query(
      `SELECT id
       FROM public.organization_invitations
       WHERE LOWER(TRIM(email)) = $1
         AND status = 'PENDING'
         AND expires_at > NOW()
       LIMIT 1`,
      [email],
    );

    if (existingInvitation.rows.length) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "This email already has a pending invitation.",
        },
        409,
      );
    }

    /*
     * 6. During initial setup, permit only one pending initial-admin
     * invitation and do not create one if an admin account already exists.
     */
    if (organization.status === "PENDING_SETUP") {
      const existingAdminAccount = await client.query(
        `SELECT u.id
         FROM public.users AS u
         JOIN public.roles AS r
           ON r.id = u.role_id
          AND r.scope = 'ORGANIZATION'
          AND r.organization_id = u.organization_id
         WHERE u.organization_id = $1
           AND u.account_scope = 'ORGANIZATION'
           AND r.name = 'ORGANIZATION_ADMIN'
         LIMIT 1`,
        [organizationId],
      );

      if (existingAdminAccount.rows.length) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return jsonResponse(
          {
            status: "error",
            message:
              "An Organization Admin account already exists for this organization. Use the organization-admin management workflow instead.",
          },
          409,
        );
      }

      const pendingInitialInvitation =
        await client.query(
          `SELECT id
           FROM public.organization_invitations
           WHERE organization_id = $1
             AND status = 'PENDING'
             AND expires_at > NOW()
           LIMIT 1`,
          [organizationId],
        );

      if (pendingInitialInvitation.rows.length) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return jsonResponse(
          {
            status: "error",
            message:
              "An initial Organization Admin invitation is already pending for this organization.",
          },
          409,
        );
      }
    }

    /*
     * 7. Generate a cryptographically random one-time token and store
     * only its hash.
     */
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInvitationToken(token);

    const expiresAt = new Date(
      Date.now() + 48 * 60 * 60 * 1000,
    );

    const invitationUrl = new URL(
      "/invitations/accept",
      frontendBaseUrl,
    );

    invitationUrl.searchParams.set("token", token);

    const invitationResult = await client.query<{
      id: string;
      organization_id: string;
      role_id: string;
      email: string;
      status: InvitationStatus;
      expires_at: Date | string;
      created_at: Date | string;
    }>(
      `INSERT INTO public.organization_invitations (
         organization_id,
         role_id,
         email,
         token_hash,
         invited_by,
         status,
         expires_at,
         admin_first_name,
         admin_last_name,
         admin_phone,
         admin_country,
         admin_city
       )
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9, $10, $11)
       RETURNING
         id,
         organization_id,
         role_id,
         email,
         status,
         expires_at,
         created_at`,
      [
        organizationId,
        roleId,
        email,
        tokenHash,
        admin.id,
        expiresAt,
        adminFirstName,
        adminLastName,
        adminPhone,
        adminCountry,
        adminCity,
      ],
    );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      throw new Error(
        "Organization invitation insert returned no row",
      );
    }

    /*
     * 8. Record the invitation creation atomically with the database write.
     */
    await writePlatformAudit(client, {
      actorId: admin.id,
      actorEmail: admin.email,
      actionKey: "organization_admin.invitation.create",
      targetId: invitation.id,
      organizationId,
      beforeState: {
        invitationStatus: null,
      },
      afterState: {
        invitationStatus: invitation.status,
        expiresAt: invitation.expires_at,
        adminFirstName,
        adminLastName,
        adminPhone,
        adminCountry,
        adminCity,
      },
      metadata: {
        organizationName: organization.name,
        organizationStatus: organization.status,
        emailMode,
        emailProvider,
      },
    });

    await client.query("COMMIT");
    transactionOpen = false;

    /*
     * 9. Send through the shared provider after commit. If sending fails,
     * attempt to revoke the invitation and audit that change separately.
     */
    try {
      await sendOrganizationAdminInvitationEmail({
        to: invitation.email,
        organizationName: organization.name,
        invitationUrl: invitationUrl.toString(),
        expiresAt: new Date(invitation.expires_at),
      });
    } catch (emailError) {
      console.error(
        "Organization Admin invitation email failed:",
        emailError,
      );

      try {
        const revokeClient = await pool.connect();

        try {
          await revokeClient.query("BEGIN");

          const revokeResult = await revokeClient.query<{
            id: string;
            status: string;
          }>(
            `UPDATE public.organization_invitations
             SET status = 'REVOKED',
                 revoked_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1
               AND organization_id = $2
               AND status = 'PENDING'
             RETURNING id, status`,
            [invitation.id, organizationId],
          );

          if (revokeResult.rows.length) {
            await writePlatformAudit(revokeClient, {
              actorId: admin.id,
              actorEmail: admin.email,
              actionKey:
                "organization_admin.invitation.revoke",
              targetId: invitation.id,
              organizationId,
              reason: "Invitation email delivery failed",
              beforeState: {
                invitationStatus: "PENDING",
              },
              afterState: {
                invitationStatus: "REVOKED",
              },
              metadata: {
                organizationName: organization.name,
                deliveryMode: emailMode,
                emailProvider,
              },
            });
          }

          await revokeClient.query("COMMIT");
        } catch (revokeError) {
          try {
            await revokeClient.query("ROLLBACK");
          } catch (rollbackError) {
            console.error(
              "Invitation revocation rollback failed:",
              rollbackError,
            );
          }

          throw revokeError;
        } finally {
          revokeClient.release();
        }
      } catch (revokeError) {
        console.error(
          "Failed to revoke invitation after email delivery failure:",
          revokeError,
        );
      }

      return jsonResponse(
        {
          status: "error",
          message:
            "The invitation email could not be sent. The invitation was revoked if possible. Check the configured email provider and try again.",
        },
        502,
      );
    }

    return jsonResponse(
      {
        status: "ok",
        message: "Invitation email sent successfully",
        emailSent: true,
        emailMode,
        emailProvider,
        invitation: {
          id: invitation.id,
          organizationId: invitation.organization_id,
          organizationName: organization.name,
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expires_at,
          createdAt: invitation.created_at,
        },
        invitationUrl: invitationUrl.toString(),
      },
      201,
    );
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
        transactionOpen = false;
      } catch (rollbackError) {
        console.error(
          "Invitation transaction rollback failed:",
          rollbackError,
        );
      }
    }

    if (getDatabaseErrorCode(error) === "42703") {
      return jsonResponse(
        {
          status: "error",
          message:
            "The Organization Admin profile database migration is missing. Apply the 20261106_add_org_admin_invitation_profile_details.sql migration, then retry the invitation.",
        },
        503,
      );
    }

    if (getDatabaseErrorCode(error) === "23505") {
      return jsonResponse(
        {
          status: "error",
          message:
            "A conflicting invitation already exists.",
        },
        409,
      );
    }

    console.error("Organization invitation creation error:", error);

    return jsonResponse(
      {
        status: "error",
        message: "Failed to create organization invitation",
      },
      500,
    );
  } finally {
    client?.release();
  }
}

/**
 * PATCH /api/organizations/[id]/invitations
 *
 * Revokes a pending Organization Admin invitation or marks an expired
 * invitation EXPIRED. Every state change is written to the platform audit log.
 */
export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const bodyResult = await parseJsonRequestBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  let client: PoolClient | null = null;
  let transactionOpen = false;

  try {
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

    const { id: organizationId } = await params;

    if (!UUID_PATTERN.test(organizationId)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid organization ID",
        },
        400,
      );
    }

    const body: unknown = bodyResult.body;

    if (
      !isRecord(body) ||
      typeof body.invitationId !== "string" ||
      typeof body.reason !== "string"
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "An invitation ID and revocation reason are required",
        },
        400,
      );
    }

    const invitationId = body.invitationId.trim();
    const reason = body.reason.trim();

    if (!UUID_PATTERN.test(invitationId)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid invitation ID",
        },
        400,
      );
    }

    if (reason.length < 3 || reason.length > 1000) {
      return jsonResponse(
        {
          status: "error",
          message:
            "The revocation reason must be between 3 and 1000 characters",
        },
        400,
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionOpen = true;

    const organizationResult = await client.query<{
      id: string;
      name: string;
      status: string;
    }>(
      `SELECT id, name, status
       FROM public.organizations
       WHERE id = $1
       FOR UPDATE`,
      [organizationId],
    );

    const organization = organizationResult.rows[0];

    if (!organization) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message: "Organization not found",
        },
        404,
      );
    }

    const invitationResult = await client.query<{
      id: string;
      organization_id: string;
      email: string;
      status: InvitationStatus;
      expires_at: Date | string;
      accepted_at: Date | string | null;
      revoked_at: Date | string | null;
      created_at: Date | string;
      is_expired: boolean;
    }>(
      `SELECT
         id,
         organization_id,
         email,
         status,
         expires_at,
         accepted_at,
         revoked_at,
         created_at,
         (expires_at <= NOW()) AS is_expired
       FROM public.organization_invitations
       WHERE id = $1
         AND organization_id = $2
       FOR UPDATE`,
      [invitationId, organizationId],
    );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "Invitation not found for this organization",
        },
        404,
      );
    }

    if (invitation.status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            `Only pending invitations can be revoked. Current status: ${invitation.status}.`,
        },
        409,
      );
    }

    if (invitation.is_expired) {
      const expiredResult = await client.query(
        `UPDATE public.organization_invitations
         SET status = 'EXPIRED',
             updated_at = NOW()
         WHERE id = $1
           AND organization_id = $2
           AND status = 'PENDING'
           AND expires_at <= NOW()
         RETURNING id`,
        [invitationId, organizationId],
      );

      if (!expiredResult.rows.length) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return jsonResponse(
          {
            status: "error",
            message:
              "The invitation changed during the request. Refresh and try again.",
          },
          409,
        );
      }

      await writePlatformAudit(client, {
        actorId: admin.id,
        actorEmail: admin.email,
        actionKey: "organization_admin.invitation.expire",
        targetId: invitation.id,
        organizationId,
        reason:
          "Invitation had expired before the revocation request",
        beforeState: {
          invitationStatus: "PENDING",
        },
        afterState: {
          invitationStatus: "EXPIRED",
        },
        metadata: {
          organizationName: organization.name,
          trigger: "manual_revoke_attempt",
        },
      });

      await client.query("COMMIT");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "This invitation has expired and cannot be revoked.",
        },
        409,
      );
    }

    const updateResult = await client.query<{
      id: string;
      organization_id: string;
      email: string;
      status: InvitationStatus;
      expires_at: Date | string;
      accepted_at: Date | string | null;
      revoked_at: Date | string | null;
      created_at: Date | string;
    }>(
      `UPDATE public.organization_invitations
       SET status = 'REVOKED',
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
         AND status = 'PENDING'
         AND expires_at > NOW()
       RETURNING
         id,
         organization_id,
         email,
         status,
         expires_at,
         accepted_at,
         revoked_at,
         created_at`,
      [invitationId, organizationId],
    );

    const revokedInvitation = updateResult.rows[0];

    if (!revokedInvitation) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "The invitation could not be revoked because its state changed. Refresh and try again.",
        },
        409,
      );
    }

    await writePlatformAudit(client, {
      actorId: admin.id,
      actorEmail: admin.email,
      actionKey: "organization_admin.invitation.revoke",
      targetId: revokedInvitation.id,
      organizationId,
      reason,
      beforeState: {
        invitationStatus: "PENDING",
        email: invitation.email,
      },
      afterState: {
        invitationStatus: "REVOKED",
        email: revokedInvitation.email,
      },
      metadata: {
        organizationName: organization.name,
        organizationStatus: organization.status,
      },
    });

    await client.query("COMMIT");
    transactionOpen = false;

    return jsonResponse({
      status: "ok",
      message: "Invitation revoked successfully",
      invitation: {
        id: revokedInvitation.id,
        organizationId: revokedInvitation.organization_id,
        email: revokedInvitation.email,
        status: revokedInvitation.status,
        expiresAt: revokedInvitation.expires_at,
        acceptedAt: revokedInvitation.accepted_at,
        revokedAt: revokedInvitation.revoked_at,
        createdAt: revokedInvitation.created_at,
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

    console.error(
      "Organization invitation revocation error:",
      error,
    );

    return jsonResponse(
      {
        status: "error",
        message: "Failed to revoke organization invitation",
      },
      500,
    );
  } finally {
    client?.release();
  }
}