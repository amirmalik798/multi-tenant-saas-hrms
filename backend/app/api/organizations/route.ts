import { NextResponse } from "next/server";

import { pool } from "../../../lib/db";
import { getPlatformSuperAdmin } from "../../../lib/auth";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../lib/request-security";

// GET: Fetch organizations for the Super Admin.
export async function GET(request: Request) {
  try {
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

    const url = new URL(request.url);
    const rawPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
    const rawPageSize = Number.parseInt(url.searchParams.get("pageSize") || "100", 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(100, Math.max(1, rawPageSize)) : 100;
    const offset = (page - 1) * pageSize;
    const search = (url.searchParams.get("search") || "").trim().slice(0, 200);
    const requestedStatus = (url.searchParams.get("status") || "NON_ARCHIVED").trim().toUpperCase();
    const allowedStatuses = new Set(["ALL", "NON_ARCHIVED", "ACTIVE", "PENDING_SETUP", "SUSPENDED", "ARCHIVED"]);
    const status = allowedStatuses.has(requestedStatus) ? requestedStatus : "NON_ARCHIVED";
    const searchPattern = `%${search}%`;

    const result = await pool.query(`
      SELECT
        o.id, o.name, o.slug, o.contact_email, o.contact_phone, o.address,
        o.country, o.status, o.created_at,
        (
          SELECT u.email FROM users AS u JOIN roles AS r ON r.id = u.role_id
          WHERE u.organization_id = o.id AND u.account_scope = 'ORGANIZATION'
            AND r.scope = 'ORGANIZATION' AND r.organization_id = o.id
            AND r.name = 'ORGANIZATION_ADMIN'
          ORDER BY CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END, u.created_at DESC
          LIMIT 1
        ) AS organization_admin_email,
        (
          SELECT u.id
          FROM users AS u
          JOIN roles AS r ON r.id = u.role_id
          WHERE u.organization_id = o.id
            AND u.account_scope = 'ORGANIZATION'
            AND r.scope = 'ORGANIZATION'
            AND r.organization_id = o.id
            AND r.name = 'ORGANIZATION_ADMIN'
          ORDER BY CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END, u.created_at DESC
          LIMIT 1
        ) AS organization_admin_user_id,
        (SELECT COUNT(*)::integer FROM users AS u
          WHERE u.organization_id = o.id AND u.account_scope = 'ORGANIZATION') AS user_count
      FROM organizations AS o
      WHERE ($2::text = 'ALL' OR ($2::text = 'NON_ARCHIVED' AND o.status <> 'ARCHIVED') OR o.status = $2::text)
        AND ($1::text = '' OR
          o.name ILIKE $3 OR o.slug ILIKE $3 OR
          COALESCE(o.contact_email, '') ILIKE $3 OR
          COALESCE(o.contact_phone, '') ILIKE $3 OR
          COALESCE(o.address, '') ILIKE $3 OR
          EXISTS (SELECT 1 FROM users su JOIN roles sr ON sr.id = su.role_id
            WHERE su.organization_id = o.id AND su.account_scope = 'ORGANIZATION'
              AND sr.name = 'ORGANIZATION_ADMIN' AND sr.scope = 'ORGANIZATION'
              AND sr.organization_id = o.id AND su.email ILIKE $3))
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $4 OFFSET $5
    `, [search, status, searchPattern, pageSize, offset]);

    const totalResult = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE status <> 'ARCHIVED')::integer AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::integer AS active,
        COUNT(*) FILTER (WHERE status = 'PENDING_SETUP')::integer AS pending,
        COUNT(*) FILTER (WHERE status = 'SUSPENDED')::integer AS suspended,
        COUNT(*) FILTER (WHERE status = 'ARCHIVED')::integer AS archived
      FROM organizations
    `);
    const matchingResult = await pool.query(`
      SELECT COUNT(*)::integer AS total FROM organizations o
      WHERE ($2::text = 'ALL' OR ($2::text = 'NON_ARCHIVED' AND o.status <> 'ARCHIVED') OR o.status = $2::text)
        AND ($1::text = '' OR o.name ILIKE $3 OR o.slug ILIKE $3
          OR COALESCE(o.contact_email, '') ILIKE $3
          OR COALESCE(o.contact_phone, '') ILIKE $3
          OR COALESCE(o.address, '') ILIKE $3
          OR EXISTS (SELECT 1 FROM users su JOIN roles sr ON sr.id = su.role_id
            WHERE su.organization_id = o.id AND su.account_scope = 'ORGANIZATION'
              AND sr.name = 'ORGANIZATION_ADMIN' AND sr.scope = 'ORGANIZATION'
              AND sr.organization_id = o.id AND su.email ILIKE $3))
    `, [search, status, searchPattern]);

    const summary = totalResult.rows[0] || {};
    const matchingTotal = Number(matchingResult.rows[0]?.total || 0);
    return NextResponse.json({
      status: "ok",
      count: result.rows.length,
      organizations: result.rows,
      pagination: { page, pageSize, total: matchingTotal, totalPages: Math.max(1, Math.ceil(matchingTotal / pageSize)) },
      summary: { total: Number(summary.total || 0), active: Number(summary.active || 0), pending: Number(summary.pending || 0), suspended: Number(summary.suspended || 0), archived: Number(summary.archived || 0) },
    });
  } catch (error) {
    console.error("Failed to fetch organizations:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Unable to fetch organizations",
      },
      { status: 500 },
    );
  }
}

// POST: Create an organization, its four approved organization roles,
// their permission mappings, and the audit record atomically.
export async function POST(request: Request) {
  // Reject requests that fail same-origin validation before any
  // authentication, body parsing, or database operations.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // Enforce JSON content type and the shared request-body size limit.
  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  try {
    // 1. Authenticate the Platform Super Admin.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        {
          status: "error",
          message: "Unauthorized",
        },
        { status: 401 },
      );
    }

    // 2. Validate required fields and their types.
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
      typeof body.address !== "string"
    ) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Organization name, slug, contact email, contact phone, and address are required",
        },
        { status: 400 },
      );
    }

    // 3. Normalize the input.
    const name = body.name.trim();
    const slug = body.slug.trim().toLowerCase();
    const contactEmail = body.contactEmail.trim().toLowerCase();
    const contactPhone = body.contactPhone.trim();
    const address = body.address.trim();
    const country =
      "country" in body && typeof body.country === "string"
        ? body.country.trim()
        : "";

    // 4. Validate each field on the server.
    if (name.length < 2 || name.length > 120) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Organization name must be between 2 and 120 characters",
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
          message:
            "Slug must contain lowercase letters, numbers, and single hyphens",
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

    if (country.length > 100) {
      return NextResponse.json(
        { status: "error", message: "Country must be 100 characters or fewer" },
        { status: 400 },
      );
    }

    if (address.length < 3 || address.length > 255) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Address must be between 3 and 255 characters",
        },
        { status: 400 },
      );
    }

    // 5. Define the approved organization roles and permissions.
    //
    // The Super Admin is a PLATFORM-scoped role and is not created here.
    // Organization Admin sits at the top of the organization hierarchy.
    // Department Manager deliberately has no permissions until
    // department-scoped API enforcement is implemented and tested.
    const allOrganizationAdminPermissions = [
      "department.create",
      "department.deactivate",
      "department.update",
      "department.view",
      "employee.create",
      "employee.deactivate",
      "employee.update",
      "employee.view",
      "organization.profile.update",
      "organization.profile.view",
      "report.view",
      "role.create",
      "role.update",
      "role.view",
      "user.invite",
      "user.suspend",
    ];

    const hrManagerPermissions = [
      "department.create",
      "department.deactivate",
      "department.update",
      "department.view",
      "employee.create",
      "employee.deactivate",
      "employee.history.view",
      "employee.status.change",
      "employee.update",
      "employee.view",
      "invitation.view",
      "organization.profile.view",
      "report.view",
      "role.view",
      "user.invite",
    ];

    // Employees may access their own workforce profile and history.
    // The employee API still checks the authenticated employee ID,
    // so these permissions do not grant access to other profiles.
    const employeeSelfServicePermissions = [
      "employee.self.history.view",
      "employee.self.update",
      "employee.self.view",
    ];

    const roleDefinitions: {
      name: string;
      description: string;
      permissionKeys: string[];
    }[] = [
      {
        name: "ORGANIZATION_ADMIN",
        description:
          "Organization administrator responsible for organization-level administration and access management.",
        permissionKeys: allOrganizationAdminPermissions,
      },
      {
        name: "HR_MANAGER",
        description:
          "Leads HR operations and manages organization-wide employee and department records.",
        permissionKeys: hrManagerPermissions,
      },
      {
        name: "DEPARTMENT_MANAGER",
        description:
          "Manages assigned departments only. Department-scoped permissions must be enforced by backend APIs before access is granted.",
        permissionKeys: [],
      },
      {
        name: "EMPLOYEE",
        description:
          "Standard employee account with access to its own permitted workforce profile and self-service functions.",
        permissionKeys: employeeSelfServicePermissions,
      },
    ];

    const expectedRoles = [
      "ORGANIZATION_ADMIN",
      "HR_MANAGER",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ];

    // 6. Start the database transaction.
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 7. Create the organization.
      const organizationResult = await client.query(
        `INSERT INTO organizations (
           name,
           slug,
           contact_email,
           contact_phone,
           address,
           country,
           status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           id,
           name,
           slug,
           contact_email,
           contact_phone,
           address,
           country,
           status,
           created_at`,
        [
          name,
          slug,
          contactEmail,
          contactPhone,
          address,
          country || null,
          "PENDING_SETUP",
        ],
      );

      const organization = organizationResult.rows[0];

      // 8. Initialize the organization's subscription license in the same
      // transaction as organization creation. New organizations must not
      // receive the legacy migration grace period; they remain unlicensed
      // until a Super Admin verifies a payment submission.
      await client.query(
        `INSERT INTO public.organization_licenses (
           organization_id,
           status,
           activation_source
         )
         VALUES ($1::uuid, 'NOT_ACTIVATED', 'NONE')`,
        [organization.id],
      );

      // 9. Create the four organization-specific roles and their
      // permission mappings inside the same transaction.
      const createdRoleNames: string[] = [];

      for (const roleDefinition of roleDefinitions) {
        const roleResult = await client.query(
          `INSERT INTO roles (
             scope,
             organization_id,
             name,
             description
           )
           VALUES ('ORGANIZATION', $1::uuid, $2, $3)
           RETURNING id, name`,
          [
            organization.id,
            roleDefinition.name,
            roleDefinition.description,
          ],
        );

        const role = roleResult.rows[0] as
          | { id: string; name: string }
          | undefined;

        if (!role) {
          throw new Error(
            `Failed to create organization role: ${roleDefinition.name}`,
          );
        }

        // Only organization-scoped permissions are eligible.
        const permissionResult = await client.query(
          `SELECT id, permission_key
           FROM permissions
           WHERE scope = 'ORGANIZATION'
             AND permission_key = ANY($1::text[])`,
          [roleDefinition.permissionKeys],
        );

        const availablePermissionKeys = new Set<string>(
          permissionResult.rows.map(
            (permission: {
              id: string;
              permission_key: string;
            }) => permission.permission_key,
          ),
        );

        // Do not create an incompletely configured role.
        const missingPermissions =
          roleDefinition.permissionKeys.filter(
            (permissionKey) =>
              !availablePermissionKeys.has(permissionKey),
          );

        if (missingPermissions.length > 0) {
          throw new Error(
            `Role initialization failed for ${roleDefinition.name}. ` +
              `Missing permissions: ${missingPermissions.join(", ")}`,
          );
        }

        // Create the role-to-permission mappings.
        const mappingResult = await client.query(
          `INSERT INTO role_permissions (
             role_id,
             permission_id,
             scope
           )
           SELECT
             $1::uuid,
             p.id,
             p.scope
           FROM permissions AS p
           WHERE p.scope = 'ORGANIZATION'
             AND p.permission_key = ANY($2::text[])`,
          [
            role.id,
            roleDefinition.permissionKeys,
          ],
        );

        if (
          mappingResult.rowCount !==
          roleDefinition.permissionKeys.length
        ) {
          throw new Error(
            `Role initialization failed: incorrect permission mapping count for ${roleDefinition.name}.`,
          );
        }

        createdRoleNames.push(role.name);
      }

      // 10. Verify that all four required roles were created.
      const rolesAreCorrect =
        createdRoleNames.length === expectedRoles.length &&
        expectedRoles.every((roleName) =>
          createdRoleNames.includes(roleName),
        );

      if (!rolesAreCorrect) {
        throw new Error(
          "Role initialization failed: the four expected organization roles were not created.",
        );
      }

      // 11. Record organization creation in the platform audit log.
      // Organization, license, roles, mappings and this audit record share
      // one transaction. A failure rolls everything back.
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
          "organization.create",
          "ORGANIZATION",
          organization.id,
          organization.id,
          null,
          JSON.stringify({ exists: false }),
          JSON.stringify({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            contactEmail: organization.contact_email,
            contactPhone: organization.contact_phone,
            address: organization.address,
            country: organization.country,
            status: organization.status,
          }),
          JSON.stringify({
            createdRoleNames,
            roleCount: createdRoleNames.length,
            initialization: "default_roles_and_permissions",
          }),
        ],
      );

      // 12. Commit everything atomically.
      await client.query("COMMIT");

      return NextResponse.json(
        {
          status: "ok",
          message:
            "Organization created successfully with the approved role hierarchy",
          organization,
          roles: createdRoleNames,
        },
        { status: 201 },
      );
    } catch (transactionError) {
      // Roll back all changes if any step fails.
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Organization transaction rollback failed:",
          rollbackError,
        );
      }

      throw transactionError;
    } finally {
      client.release();
    }
  } catch (error) {
    // Handle duplicate organization slugs.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505" &&
      "constraint" in error &&
      error.constraint === "organizations_slug_key"
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "This organization slug already exists",
        },
        { status: 409 },
      );
    }

    console.error("Organization creation error:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Failed to create organization",
      },
      { status: 500 },
    );
  }
}