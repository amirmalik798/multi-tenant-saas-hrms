import { NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../lib/auth";
import { getOrganizationLicenseAccess } from "../../../../lib/licensing";
import {
  deleteOrganizationTenantData,
  OrganizationDeletionBlockedError,
} from "../../../../lib/organization-deletion";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    // 1. Verify Super Admin authentication.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        {
          status: "error",
          message: "Authentication required",
        },
        { status: 401 },
      );
    }

    // 2. Get and validate the organization ID.
    const { id } = await params;

    if (!uuidPattern.test(id)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid organization ID",
        },
        { status: 400 },
      );
    }

    // 3. Find this specific organization.
    const result = await pool.query(
      `SELECT
         id,
         name,
         slug,
         contact_email,
         contact_phone,
         address,
         country,
         status,
         created_at,
         updated_at
       FROM organizations
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Organization not found",
        },
        { status: 404 },
      );
    }

    // Resolve license state through the shared, read-only licensing service.
    // This is additive response data; existing organization fields remain unchanged.
    let license: Awaited<ReturnType<typeof getOrganizationLicenseAccess>> = null;
    try {
      license = await getOrganizationLicenseAccess(id);
    } catch (licenseError) {
      // Keep the established organization-details contract available if the
      // optional license lookup is temporarily unavailable.
      console.error("Failed to resolve organization license details:", licenseError);
    }

    return NextResponse.json({
      status: "ok",
      organization: result.rows[0],
      license,
    });
  } catch (error) {
    console.error("Failed to fetch organization:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Unable to fetch organization details",
      },
      { status: 500 },
    );
  }
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
    // 2. Verify Super Admin authorization.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        {
          status: "error",
          message: "Authentication required",
        },
        { status: 401 },
      );
    }

    // 3. Read and validate the organization ID.
    const { id } = await params;

    if (!uuidPattern.test(id)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid organization ID",
        },
        { status: 400 },
      );
    }

    // 4. Validate the required fields.
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      !("name" in body) ||
      !("slug" in body) ||
      !("contactEmail" in body) ||
      !("contactPhone" in body) ||
      !("address" in body) ||
      typeof body.name !== "string" ||
      typeof body.slug !== "string" ||
      typeof body.contactEmail !== "string" ||
      typeof body.contactPhone !== "string" ||
      typeof body.address !== "string" ||
      ("country" in body && typeof body.country !== "string")
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "All organization fields are required",
        },
        { status: 400 },
      );
    }

    const name = body.name.trim();
    const slug = body.slug.trim().toLowerCase();
    const contactEmail = body.contactEmail.trim().toLowerCase();
    const contactPhone = body.contactPhone.trim();
    const address = body.address.trim();
    const countryWasProvided = "country" in body;
    const requestedCountry =
      countryWasProvided && typeof body.country === "string"
        ? body.country.trim()
        : undefined;

    if (requestedCountry !== undefined && requestedCountry.length > 100) {
      return NextResponse.json(
        {
          status: "error",
          message: "Country must not exceed 100 characters",
        },
        { status: 400 },
      );
    }

    // 5. Validate each field on the server.
    if (name.length < 2 || name.length > 120) {
      return NextResponse.json(
        {
          status: "error",
          message: "Organization name must be between 2 and 120 characters",
        },
        { status: 400 },
      );
    }

    if (
      slug.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid organization slug",
        },
        { status: 400 },
      );
    }

    if (
      contactEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "Please provide a valid contact email",
        },
        { status: 400 },
      );
    }

    if (!/^[+()\d\s.-]{7,30}$/.test(contactPhone)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Please provide a valid contact phone number",
        },
        { status: 400 },
      );
    }

    if (address.length < 3 || address.length > 255) {
      return NextResponse.json(
        {
          status: "error",
          message: "Address must be between 3 and 255 characters",
        },
        { status: 400 },
      );
    }

    // 6. Update the organization and write its audit record atomically.
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      // Lock the row so before_state reflects the exact state being edited.
      const existingResult = await client.query(
        `SELECT
           id,
           name,
           slug,
           contact_email,
           contact_phone,
           address,
           country,
           status
         FROM organizations
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );

      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return NextResponse.json(
          {
            status: "error",
            message: "Organization not found",
          },
          { status: 404 },
        );
      }

      const existingOrganization = existingResult.rows[0] as {
        id: string;
        name: string;
        slug: string;
        contact_email: string;
        contact_phone: string;
        address: string;
        country: string | null;
        status: string;
      };

      // Archived organizations are read-only, including direct API requests.
      if (existingOrganization.status?.toUpperCase() === "ARCHIVED") {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return NextResponse.json(
          {
            status: "error",
            message: "Archived organizations are read-only and cannot be edited",
          },
          { status: 409 },
        );
      }

      const beforeState = {
        id: existingOrganization.id,
        name: existingOrganization.name,
        slug: existingOrganization.slug,
        contactEmail: existingOrganization.contact_email,
        contactPhone: existingOrganization.contact_phone,
        address: existingOrganization.address,
        country: existingOrganization.country,
        status: existingOrganization.status,
      };

      const updateResult = await client.query(
        `UPDATE organizations
         SET
           name = $1,
           slug = $2,
           contact_email = $3,
           contact_phone = $4,
           address = $5,
           country = $6,
           updated_at = NOW()
         WHERE id = $7
         RETURNING
           id,
           name,
           slug,
           contact_email,
           contact_phone,
           address,
           country,
           status,
           created_at,
           updated_at`,
        [
          name,
          slug,
          contactEmail,
          contactPhone,
          address,
          countryWasProvided
            ? requestedCountry || null
            : existingOrganization.country,
          id,
        ],
      );

      const updatedOrganization = updateResult.rows[0] as {
        id: string;
        name: string;
        slug: string;
        contact_email: string;
        contact_phone: string;
        address: string;
        country: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      };

      const afterState = {
        id: updatedOrganization.id,
        name: updatedOrganization.name,
        slug: updatedOrganization.slug,
        contactEmail: updatedOrganization.contact_email,
        contactPhone: updatedOrganization.contact_phone,
        address: updatedOrganization.address,
        country: updatedOrganization.country,
        status: updatedOrganization.status,
      };

      const changedFields = [
        ["name", beforeState.name, afterState.name],
        ["slug", beforeState.slug, afterState.slug],
        ["contactEmail", beforeState.contactEmail, afterState.contactEmail],
        ["contactPhone", beforeState.contactPhone, afterState.contactPhone],
        ["address", beforeState.address, afterState.address],
        ["country", beforeState.country, afterState.country],
      ]
        .filter(([, beforeValue, afterValue]) => beforeValue !== afterValue)
        .map(([fieldName]) => fieldName);

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
          "organization.update",
          "ORGANIZATION",
          updatedOrganization.id,
          updatedOrganization.id,
          null,
          JSON.stringify(beforeState),
          JSON.stringify(afterState),
          JSON.stringify({
            changedFields,
            source: "super_admin_organization_edit",
          }),
        ],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json({
        status: "ok",
        message: "Organization updated successfully",
        organization: updatedOrganization,
      });
    } catch (transactionError) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error(
            "Organization update rollback failed:",
            rollbackError,
          );
        }
      }

      throw transactionError;
    } finally {
      client.release();
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "An organization with this slug already exists",
        },
        { status: 409 },
      );
    }

    console.error("Organization update error:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Failed to update organization",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/organizations/:id
 *
 * Permanently deletes one tenant and its tenant-owned records. This is a
 * Super Admin-only operation and requires the exact organization slug as a
 * second confirmation. The purge, organization removal, and platform audit
 * event share one database transaction.
 */
export async function DELETE(
  request: Request,
  { params }: RouteContext,
) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("confirmationSlug" in body) ||
    typeof body.confirmationSlug !== "string"
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: "Type the organization's slug to confirm permanent deletion.",
      },
      { status: 400 },
    );
  }

  const confirmationSlug = body.confirmationSlug.trim();
  if (!confirmationSlug || confirmationSlug.length > 80) {
    return NextResponse.json(
      { status: "error", message: "Invalid deletion confirmation." },
      { status: 400 },
    );
  }

  try {
    const admin = await getPlatformSuperAdmin();
    if (!admin) {
      return NextResponse.json(
        { status: "error", message: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json(
        { status: "error", message: "Invalid organization ID" },
        { status: 400 },
      );
    }

    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      // Lock the organization row. Tenant inserts protected by foreign keys
      // need a KEY SHARE lock on this same row and cannot race the purge.
      const organizationResult = await client.query<{
        id: string;
        name: string;
        slug: string;
        contact_email: string | null;
        status: string;
      }>(
        "SELECT id, name, slug, contact_email, status " +
          "FROM public.organizations WHERE id = $1::uuid FOR UPDATE",
        [id],
      );

      const organization = organizationResult.rows[0];
      if (!organization) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return NextResponse.json(
          { status: "error", message: "Organization not found" },
          { status: 404 },
        );
      }

      if (confirmationSlug !== organization.slug) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return NextResponse.json(
          {
            status: "error",
            message: "The confirmation slug does not match this organization.",
          },
          { status: 400 },
        );
      }

      const deletionReport = await deleteOrganizationTenantData(
        client,
        organization.id,
      );

      const deletedOrganization = await client.query(
        "DELETE FROM public.organizations " +
          "WHERE id = $1::uuid RETURNING id",
        [organization.id],
      );

      if (deletedOrganization.rowCount !== 1) {
        throw new Error("The organization could not be removed after its tenant data was purged.");
      }

      const totalDeletedRecords = deletionReport.deletedRecordCount + 1;
      const recordsByTable = {
        ...deletionReport.recordsByTable,
        organizations: 1,
      };

      // Retain the platform audit event count/history, but remove tenant
      // identifiers, user emails, snapshots, and metadata from older entries.
      // This prevents retained platform audit rows from becoming a hidden
      // copy of deleted organization data.
      await client.query(
        "UPDATE public.platform_audit_logs " +
          "SET actor_user_id = NULL, actor_email = 'redacted@deleted.invalid', " +
          "target_id = NULL, organization_id = NULL, reason = NULL, " +
          "before_state = '{}'::jsonb, after_state = '{}'::jsonb, metadata = '{}'::jsonb " +
          "WHERE organization_id = $1::uuid OR target_id = $1::uuid",
        [organization.id],
      );

      // Write a minimal platform-level record for the deletion. It deliberately
      // contains no tenant name, slug, UUID, contact details, or tenant user data.
      await client.query(
        "INSERT INTO public.platform_audit_logs (" +
          "actor_user_id, actor_email, action_key, target_type, target_id, " +
          "organization_id, reason, before_state, after_state, metadata" +
          ") VALUES (" +
          "$1::uuid, $2, 'organization.delete', 'ORGANIZATION', NULL, " +
          "NULL, 'Organization permanently deleted by Super Admin', " +
          "'{}'::jsonb, $3::jsonb, $4::jsonb" +
          ")",
        [
          admin.id,
          admin.email,
          JSON.stringify({ exists: false }),
          JSON.stringify({
            deletedRecordCount: totalDeletedRecords,
            deletedTableCount: deletionReport.deletedTableCount + 1,
            recordsByTable,
            source: "super_admin_organization_delete",
            tenantDataRetained: false,
          }),
        ],
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json(
        {
          status: "ok",
          message: "Organization and its tenant-owned records were permanently deleted.",
          deletedOrganization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          deletion: {
            deletedRecordCount: totalDeletedRecords,
            deletedTableCount: deletionReport.deletedTableCount + 1,
            recordsByTable,
            platformAuditLogsRetained: true,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (transactionError) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Organization deletion rollback failed:", rollbackError);
        }
      }
      throw transactionError;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof OrganizationDeletionBlockedError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: 409 },
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ["23503", "23514", "55000"].includes(String(error.code))
    ) {
      console.error("Organization deletion was blocked by a database constraint:", error);
      return NextResponse.json(
        {
          status: "error",
          message: "Deletion was stopped by a database constraint. No organization data was committed as deleted.",
        },
        { status: 409 },
      );
    }

    console.error("Organization deletion error:", error);
    return NextResponse.json(
      { status: "error", message: "Failed to delete organization. No partial deletion was committed." },
      { status: 500 },
    );
  }
}
