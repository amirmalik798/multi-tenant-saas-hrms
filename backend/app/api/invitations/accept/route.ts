import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import {
  getNewPasswordValidationError,
  hashNewPassword,
} from "../../../../lib/password";
import { pool } from "../../../../lib/db";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

type AcceptInvitationBody = {
  token: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  city: string;
  password: string;
};

type OrganizationInvitation = {
  invitation_id: string;
  organization_id: string;
  organization_name: string;
  organization_status: string;
  email: string;
  invitation_status: string;
  expires_at: Date | string;
  is_expired: boolean;
  role_id: string;
  role_name: string;
  role_scope: string;
  role_organization_id: string | null;
  admin_first_name?: string | null;
  admin_last_name?: string | null;
  admin_phone?: string | null;
  admin_country?: string | null;
  admin_city?: string | null;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,100}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hashToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
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

function isMissingOrganizationAdminProfileMigration(error: unknown): boolean {
  if (getDatabaseErrorCode(error) !== "42703") return false;
  const message =
    typeof error === "object" && error !== null && "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";
  return /admin_(first_name|last_name|phone|country|city)|contact_(phone|country|city)/i.test(message);
}

async function writePlatformAudit(
  client: PoolClient,
  input: {
    actorId: string;
    actorEmail: string;
    actionKey: string;
    targetId: string;
    organizationId: string;
    reason: string;
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
       $1, $2, $3, 'ORGANIZATION_ADMIN',
       $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb
     )`,
    [
      input.actorId,
      input.actorEmail,
      input.actionKey,
      input.targetId,
      input.organizationId,
      input.reason,
      JSON.stringify(input.beforeState),
      JSON.stringify(input.afterState),
      JSON.stringify(input.metadata),
    ],
  );
}

const SYSTEM_AUDIT_EMAIL = "system@hrms.local";

type InvitationExpirationTrigger =
  | "preview"
  | "accept_initial_check"
  | "accept_final_check";

async function writeOrganizationAdminInvitationExpirationAudit(
  client: PoolClient,
  input: {
    invitationId: string;
    organizationId: string;
    expiresAt: Date | string;
    trigger: InvitationExpirationTrigger;
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
       NULL, $1, 'organization_admin.invitation.expire',
       'ORGANIZATION_ADMIN_INVITATION', $2, $3, $4,
       $5::jsonb, $6::jsonb, $7::jsonb
     )`,
    [
      SYSTEM_AUDIT_EMAIL,
      input.invitationId,
      input.organizationId,
      "Organization Admin invitation expired",
      JSON.stringify({
        invitationStatus: "PENDING",
      }),
      JSON.stringify({
        invitationStatus: "EXPIRED",
        expiresAt: input.expiresAt,
      }),
      JSON.stringify({
        actorType: "SYSTEM",
        invitationId: input.invitationId,
        trigger: input.trigger,
      }),
    ],
  );
}

/**
 * Changes an expired invitation from PENDING to EXPIRED and records
 * the corresponding platform audit event in the same transaction.
 *
 * This helper must be called with a client that already has an open
 * transaction. It writes an audit event only when the conditional
 * UPDATE actually changes one invitation.
 */
async function expirePendingOrganizationAdminInvitation(
  client: PoolClient,
  input: {
    invitationId: string;
    organizationId: string;
    trigger: InvitationExpirationTrigger;
  },
): Promise<boolean> {
  const result = await client.query<{
    expires_at: Date | string;
  }>(
    `UPDATE public.organization_invitations
     SET status = 'EXPIRED',
         updated_at = NOW()
     WHERE id = $1
       AND organization_id = $2
       AND status = 'PENDING'
       AND expires_at <= NOW()
     RETURNING expires_at`,
    [
      input.invitationId,
      input.organizationId,
    ],
  );

  if (result.rowCount !== 1) {
    return false;
  }

  const expiredInvitation = result.rows[0];

  if (!expiredInvitation) {
    throw new Error(
      "Invitation expiration update returned no expiration timestamp",
    );
  }

  await writeOrganizationAdminInvitationExpirationAudit(
    client,
    {
      invitationId: input.invitationId,
      organizationId: input.organizationId,
      expiresAt: expiredInvitation.expires_at,
      trigger: input.trigger,
    },
  );

  return true;
}

/**
 * The GET preview route does not otherwise have a transaction.
 * Use a dedicated transaction so its expiration update and audit
 * record either both commit or both roll back.
 */
async function expireInvitationFromPreview(input: {
  invitationId: string;
  organizationId: string;
}): Promise<void> {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    await expirePendingOrganizationAdminInvitation(client, {
      ...input,
      trigger: "preview",
    });

    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
        transactionOpen = false;
      } catch (rollbackError) {
        console.error(
          "Invitation preview expiration rollback failed:",
          rollbackError,
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * GET /api/invitations/accept?token=...
 *
 * Returns safe invitation preview data. Does not create an account.
 * Raw invitation tokens are hashed before database lookup.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get("token") ?? "").trim();

    if (!TOKEN_PATTERN.test(token)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid invitation token.",
        },
        400,
      );
    }

    const tokenHash = hashToken(token);

    const invitationResult =
      await pool.query<OrganizationInvitation>(
        `SELECT
           i.id AS invitation_id,
           i.organization_id,
           LOWER(BTRIM(i.email)) AS email,
           i.status AS invitation_status,
           i.expires_at,
           (i.expires_at <= NOW()) AS is_expired,
           i.admin_first_name,
           i.admin_last_name,
           i.admin_phone,
           i.admin_country,
           i.admin_city,

           o.name AS organization_name,
           o.status AS organization_status,

           r.id AS role_id,
           r.name AS role_name,
           r.scope AS role_scope,
           r.organization_id AS role_organization_id
         FROM public.organization_invitations AS i
         JOIN public.organizations AS o
           ON o.id = i.organization_id
         JOIN public.roles AS r
           ON r.id = i.role_id
         WHERE i.token_hash = $1
         LIMIT 1`,
        [tokenHash],
      );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      return jsonResponse(
        {
          status: "error",
          message: "Invitation not found or invalid.",
        },
        404,
      );
    }

    if (
      invitation.invitation_status === "EXPIRED" ||
      (
        invitation.invitation_status === "PENDING" &&
        invitation.is_expired
      )
    ) {
      if (invitation.invitation_status === "PENDING") {
        await expireInvitationFromPreview({
          invitationId: invitation.invitation_id,
          organizationId: invitation.organization_id,
        });
      }

      return jsonResponse(
        {
          status: "error",
          message:
            "This invitation has expired. Please request a new invitation.",
        },
        410,
      );
    }

    if (invitation.invitation_status !== "PENDING") {
      return jsonResponse(
        {
          status: "error",
          message:
            "This invitation has already been used or is no longer valid.",
        },
        409,
      );
    }

    if (
      invitation.organization_status !== "PENDING_SETUP" &&
      invitation.organization_status !== "ACTIVE"
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            `This organization cannot accept invitations while its status is ${invitation.organization_status}.`,
        },
        409,
      );
    }

    if (
      invitation.role_name !== "ORGANIZATION_ADMIN" ||
      invitation.role_scope !== "ORGANIZATION" ||
      invitation.role_organization_id !==
        invitation.organization_id
    ) {
      return jsonResponse(
        {
          status: "error",
          message: "The invitation has an invalid organization role.",
        },
        409,
      );
    }

    return jsonResponse({
      status: "ok",
      invitation: {
        organizationName: invitation.organization_name,
        email: invitation.email,
        expiresAt: invitation.expires_at,
        adminProfile: {
          firstName: invitation.admin_first_name ?? null,
          lastName: invitation.admin_last_name ?? null,
          phone: invitation.admin_phone ?? null,
          country: invitation.admin_country ?? null,
          city: invitation.admin_city ?? null,
        },
      },
    });
  } catch (error) {
    console.error("Invitation preview failed:", error);

    if (isMissingOrganizationAdminProfileMigration(error)) {
      return jsonResponse(
        {
          status: "error",
          message:
            "The Organization Admin profile database migrations are missing. Apply the 20261106_add_org_admin_invitation_profile_details.sql and 20261106_add_organization_admin_contact_details.sql migrations.",
        },
        503,
      );
    }

    return jsonResponse(
      {
        status: "error",
        message: "Could not load invitation details.",
      },
      500,
    );
  }
}

/**
 * POST /api/invitations/accept
 *
 * Creates the Organization Admin account, consumes the invitation,
 * activates an organization completing initial setup, and records the
 * platform audit event inside one transaction.
 */
export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const bodyResult = await parseJsonRequestBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const body: unknown = bodyResult.body;

  if (
    !isObject(body) ||
    typeof body.token !== "string" ||
    typeof body.firstName !== "string" ||
    typeof body.lastName !== "string" ||
    typeof body.phone !== "string" ||
    (
      body.country !== undefined &&
      body.country !== null &&
      typeof body.country !== "string"
    ) ||
    (
      body.city !== undefined &&
      body.city !== null &&
      typeof body.city !== "string"
    ) ||
    typeof body.password !== "string"
  ) {
    return jsonResponse(
      {
        status: "error",
        message:
          "Invitation token, first name, last name, contact number, and password are required.",
      },
      400,
    );
  }

  const input: AcceptInvitationBody = {
    token: body.token.trim(),
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    phone: body.phone.trim(),
    country:
      typeof body.country === "string"
        ? body.country.trim()
        : "",
    city:
      typeof body.city === "string"
        ? body.city.trim()
        : "",
    password: body.password,
  };

  if (!TOKEN_PATTERN.test(input.token)) {
    return jsonResponse(
      {
        status: "error",
        message: "Invalid invitation token.",
      },
      400,
    );
  }

  if (
    input.firstName.length < 2 ||
    input.firstName.length > 100 ||
    input.lastName.length < 1 ||
    input.lastName.length > 100
  ) {
    return jsonResponse(
      {
        status: "error",
        message:
          "First name must be 2–100 characters and last name 1–100 characters.",
      },
      400,
    );
  }

  if (
    input.country.length > 100 ||
    input.city.length > 100
  ) {
    return jsonResponse(
      {
        status: "error",
        message:
          "Country and city must not exceed 100 characters each.",
      },
      400,
    );
  }

  const phoneDigits = input.phone.replace(/\D/g, "");

  if (
    !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(input.phone) ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    return jsonResponse(
      {
        status: "error",
        message:
          "Enter a valid contact number with 7–15 digits, including the country code where possible.",
      },
      400,
    );
  }

  const passwordValidationError =
    getNewPasswordValidationError(input.password);

  if (passwordValidationError) {
    return jsonResponse(
      {
        status: "error",
        message: passwordValidationError,
      },
      400,
    );
  }

  const tokenHash = hashToken(input.token);

  let client: PoolClient | null = null;
  let transactionOpen = false;

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transactionOpen = true;

    /*
     * Lock the invitation, organization, and role.
     * Role ownership is verified separately below, so a malformed
     * cross-organization role cannot be accepted.
     */
    const invitationResult =
      await client.query<OrganizationInvitation>(
        `SELECT
           i.id AS invitation_id,
           i.organization_id,
           LOWER(BTRIM(i.email)) AS email,
           i.status AS invitation_status,
           i.expires_at,
           (i.expires_at <= NOW()) AS is_expired,
           i.admin_first_name,
           i.admin_last_name,
           i.admin_phone,
           i.admin_country,
           i.admin_city,

           o.name AS organization_name,
           o.status AS organization_status,

           r.id AS role_id,
           r.name AS role_name,
           r.scope AS role_scope,
           r.organization_id AS role_organization_id
         FROM public.organization_invitations AS i
         JOIN public.organizations AS o
           ON o.id = i.organization_id
         JOIN public.roles AS r
           ON r.id = i.role_id
         WHERE i.token_hash = $1
         FOR UPDATE OF i, o, r`,
        [tokenHash],
      );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message: "Invitation not found or invalid.",
        },
        404,
      );
    }

    if (invitation.invitation_status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "This invitation has already been used or is no longer valid.",
        },
        409,
      );
    }

    if (invitation.is_expired) {
      await expirePendingOrganizationAdminInvitation(client, {
        invitationId: invitation.invitation_id,
        organizationId: invitation.organization_id,
        trigger: "accept_initial_check",
      });

      await client.query("COMMIT");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "This invitation has expired. Please request a new invitation.",
        },
        410,
      );
    }

    if (
      invitation.organization_status !== "PENDING_SETUP" &&
      invitation.organization_status !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            `This organization cannot accept invitations while its status is ${invitation.organization_status}.`,
        },
        409,
      );
    }

    if (
      invitation.role_name !== "ORGANIZATION_ADMIN" ||
      invitation.role_scope !== "ORGANIZATION" ||
      invitation.role_organization_id !==
        invitation.organization_id
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message: "The invitation has an invalid organization role.",
        },
        409,
      );
    }

    /*
     * Serialize acceptance for this normalized email across organizations.
     * The key matches the Organization Admin invitation creation route.
     */
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0)
       )`,
      [
        `organization-admin-invitation:${invitation.email}`,
      ],
    );

    /*
     * Check global account uniqueness case-insensitively. Do not rely on
     * exact email string matching to detect existing accounts.
     */
    const existingUser = await client.query(
      `SELECT id
       FROM public.users
       WHERE LOWER(BTRIM(email)) = $1
       LIMIT 1`,
      [invitation.email],
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "An account already exists with this email address.",
        },
        409,
      );
    }

    /*
     * During initial setup, do not create a second Organization Admin
     * account if one is already linked to this tenant.
     */
    if (
      invitation.organization_status === "PENDING_SETUP"
    ) {
      const existingOrganizationAdmin =
        await client.query(
          `SELECT u.id
           FROM public.users AS u
           JOIN public.roles AS r
             ON r.id = u.role_id
            AND r.organization_id = u.organization_id
            AND r.scope = 'ORGANIZATION'
            AND r.name = 'ORGANIZATION_ADMIN'
           WHERE u.organization_id = $1
             AND u.account_scope = 'ORGANIZATION'
           LIMIT 1`,
          [invitation.organization_id],
        );

      if (existingOrganizationAdmin.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return jsonResponse(
          {
            status: "error",
            message:
              "An Organization Admin account already exists for this organization.",
          },
          409,
        );
      }
    }

    /*
     * Check expiration again immediately before creating the employee
     * and account; password hashing may take time.
     */
    const expiryCheck = await client.query<{
      is_valid: boolean;
    }>(
      `SELECT (
         status = 'PENDING'
         AND expires_at > NOW()
       ) AS is_valid
       FROM public.organization_invitations
       WHERE id = $1
         AND organization_id = $2
       FOR UPDATE`,
      [
        invitation.invitation_id,
        invitation.organization_id,
      ],
    );

    if (expiryCheck.rows[0]?.is_valid !== true) {
      await expirePendingOrganizationAdminInvitation(client, {
        invitationId: invitation.invitation_id,
        organizationId: invitation.organization_id,
        trigger: "accept_final_check",
      });

      await client.query("COMMIT");
      transactionOpen = false;

      return jsonResponse(
        {
          status: "error",
          message:
            "This invitation has expired. Please request a new invitation.",
        },
        410,
      );
    }

    const profileFirstName = invitation.admin_first_name?.trim() || input.firstName;
    const profileLastName = invitation.admin_last_name?.trim() || input.lastName;
    const profilePhone = invitation.admin_phone?.trim() || input.phone;
    const profileCountry = invitation.admin_country?.trim() || input.country;
    const profileCity = invitation.admin_city?.trim() || input.city;

    if (
      profileFirstName.length < 2 || profileFirstName.length > 100 ||
      profileLastName.length < 1 || profileLastName.length > 100 ||
      profileCountry.length > 100 || profileCity.length > 100 ||
      !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(profilePhone) ||
      profilePhone.replace(/\D/g, "").length < 7 ||
      profilePhone.replace(/\D/g, "").length > 15
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return jsonResponse({ status: "error", message: "The administrator profile details on this invitation are invalid. Ask the platform administrator to issue a corrected invitation." }, 409);
    }

    const passwordHash = await hashNewPassword(
      input.password,
    );

    /*
     * Create the Organization Admin profile, preserving the existing
     * employee-code convention and optional country/city fields.
     */
    const employeeCode =
      `ADM-${randomBytes(8).toString("hex").toUpperCase()}`;

    const employeeResult = await client.query<{
      id: string;
      phone: string;
      country: string | null;
      city: string | null;
    }>(
      `INSERT INTO public.employees (
         organization_id,
         employee_code,
         first_name,
         last_name,
         email,
         country,
         city,
         phone,
         designation,
         employment_status,
         joining_date
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         CURRENT_DATE
       )
       RETURNING id, phone, country, city`,
      [
        invitation.organization_id,
        employeeCode,
        profileFirstName,
        profileLastName,
        invitation.email,
        profileCountry || null,
        profileCity || null,
        profilePhone,
        "Organization Admin",
        "ACTIVE",
      ],
    );

    const employee = employeeResult.rows[0];

    if (!employee) {
      throw new Error(
        "Organization Admin employee profile creation returned no row",
      );
    }

    /*
     * Create the active organization account using the role verified above.
     */
    const userResult = await client.query<{
      id: string;
      email: string;
      status: string;
    }>(
      `INSERT INTO public.users (
         email,
         password_hash,
         account_scope,
         organization_id,
         employee_id,
         status,
         role_id,
         contact_phone,
         contact_country,
         contact_city
       )
       VALUES ($1, $2, 'ORGANIZATION', $3, $4, 'ACTIVE', $5, $6, $7, $8)
       RETURNING id, email, status`,
      [
        invitation.email,
        passwordHash,
        invitation.organization_id,
        employee.id,
        invitation.role_id,
        profilePhone,
        profileCountry || null,
        profileCity || null,
      ],
    );

    const user = userResult.rows[0];

    if (!user) {
      throw new Error(
        "Organization Admin account creation returned no row",
      );
    }

    /*
     * Consume the invitation using a conditional update. A stale or
     * concurrently changed invitation cannot be accepted.
     */
    const acceptedInvitation = await client.query(
      `UPDATE public.organization_invitations
       SET status = 'ACCEPTED',
           accepted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
         AND role_id = $3
         AND status = 'PENDING'
         AND expires_at > NOW()
       RETURNING id`,
      [
        invitation.invitation_id,
        invitation.organization_id,
        invitation.role_id,
      ],
    );

    if (acceptedInvitation.rowCount !== 1) {
      throw new Error(
        "The invitation became ineligible during acceptance",
      );
    }

    let resultingOrganizationStatus =
      invitation.organization_status;

    if (
      invitation.organization_status === "PENDING_SETUP"
    ) {
      const organizationUpdate = await client.query<{
        status: string;
      }>(
        `UPDATE public.organizations
         SET status = 'ACTIVE',
             updated_at = NOW()
         WHERE id = $1
           AND status = 'PENDING_SETUP'
         RETURNING status`,
        [invitation.organization_id],
      );

      if (organizationUpdate.rowCount !== 1) {
        throw new Error(
          "Organization status changed unexpectedly during invitation acceptance",
        );
      }

      resultingOrganizationStatus =
        organizationUpdate.rows[0].status;
    }

    /*
     * Record successful acceptance atomically with account creation,
     * invitation consumption, and initial tenant activation.
     */
    await writePlatformAudit(client, {
      actorId: user.id,
      actorEmail: invitation.email,
      actionKey: "organization_admin.invitation.accept",
      targetId: user.id,
      organizationId: invitation.organization_id,
      reason: "Organization Admin invitation accepted",
      beforeState: {
        accountStatus: null,
        invitationStatus: "PENDING",
        organizationStatus: invitation.organization_status,
      },
      afterState: {
        accountStatus: user.status,
        invitationStatus: "ACCEPTED",
        organizationStatus: resultingOrganizationStatus,
      },
      metadata: {
        invitationId: invitation.invitation_id,
        organizationName: invitation.organization_name,
      },
    });

    await client.query("COMMIT");
    transactionOpen = false;

    return jsonResponse(
      {
        status: "ok",
        message:
          "Invitation accepted and account created successfully.",
        user,
        employee: {
          phone: employee.phone,
          country: employee.country,
          city: employee.city,
        },
        organization: {
          id: invitation.organization_id,
          name: invitation.organization_name,
          status: resultingOrganizationStatus,
        },
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
          "Invitation acceptance rollback failed:",
          rollbackError,
        );
      }
    }

    const errorCode = getDatabaseErrorCode(error);

    if (isMissingOrganizationAdminProfileMigration(error)) {
      return jsonResponse(
        {
          status: "error",
          message:
            "The Organization Admin profile database migrations are missing. Apply the 20261106_add_org_admin_invitation_profile_details.sql and 20261106_add_organization_admin_contact_details.sql migrations.",
        },
        503,
      );
    }

    if (errorCode === "23505") {
      return jsonResponse(
        {
          status: "error",
          message:
            "An account or employee record conflicts with existing data. Please request assistance.",
        },
        409,
      );
    }

    if (errorCode === "23503") {
      return jsonResponse(
        {
          status: "error",
          message:
            "The organization, role, employee, or account reference is no longer valid.",
        },
        409,
      );
    }

    if (errorCode === "23514") {
      return jsonResponse(
        {
          status: "error",
          message:
            "The account or employee profile violates a database validation rule.",
        },
        409,
      );
    }

    console.error("Invitation acceptance error:", error);

    return jsonResponse(
      {
        status: "error",
        message: "Failed to accept invitation.",
      },
      500,
    );
  } finally {
    client?.release();
  }
}