import { NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../lib/auth";
import { getOrganizationLicenseAccess } from "../../../../lib/licensing";
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