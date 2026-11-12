import { connection, NextResponse } from "next/server";

import { pool } from "../../../lib/db";
import { getPlatformSuperAdmin } from "../../../lib/auth";

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

// GET: List Organization Admin accounts for the Platform Super Admin.
export async function GET(request: Request) {
  // Preserve dynamic request handling for cookie/session authentication.
  await connection();

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

    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";

    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.status AS account_status,
         u.created_at,
         u.updated_at,
         u.last_login_at,
         o.id AS organization_id,
         o.name AS organization_name,
         o.slug AS organization_slug,
         o.status AS organization_status,
         r.name AS role_name,
         e.first_name,
         e.last_name,
         e.employee_code,
         COALESCE(NULLIF(BTRIM(u.contact_phone), ''), e.phone) AS phone,
         COALESCE(NULLIF(BTRIM(u.contact_country), ''), e.country) AS country,
         COALESCE(NULLIF(BTRIM(u.contact_city), ''), e.city) AS city,
         e.designation,
         e.employment_status,
         e.joining_date,
         latest_invitation.status AS latest_invitation_status,
         latest_invitation.expires_at
           AS latest_invitation_expires_at
       FROM public.users AS u
       JOIN public.roles AS r
         ON r.id = u.role_id
        AND r.scope = 'ORGANIZATION'
        AND r.organization_id = u.organization_id
        AND r.name = 'ORGANIZATION_ADMIN'
       JOIN public.organizations AS o
         ON o.id = u.organization_id
       LEFT JOIN public.employees AS e
         ON e.id = u.employee_id
        AND e.organization_id = u.organization_id
       LEFT JOIN LATERAL (
         SELECT
           oi.status,
           oi.expires_at
         FROM public.organization_invitations AS oi
         WHERE oi.organization_id = u.organization_id
           AND LOWER(BTRIM(oi.email)) =
               LOWER(BTRIM(u.email))
         ORDER BY
           oi.created_at DESC,
           oi.id DESC
         LIMIT 1
       ) AS latest_invitation ON TRUE
       WHERE u.account_scope = 'ORGANIZATION'
         AND ($1::boolean OR o.status <> 'ARCHIVED')
       ORDER BY
         CASE u.status
           WHEN 'ACTIVE' THEN 0
           WHEN 'INVITED' THEN 1
           WHEN 'SUSPENDED' THEN 2
           ELSE 3
         END,
         u.created_at DESC,
         u.id ASC`,
      [includeArchived],
    );

    return jsonResponse({
      status: "ok",
      count: result.rows.length,
      organizationAdmins: result.rows,
    });
  } catch (error) {
    console.error(
      "Failed to fetch Organization Admin accounts:",
      error,
    );

    return jsonResponse(
      {
        status: "error",
        message:
          "Unable to fetch Organization Admin accounts",
      },
      500,
    );
  }
}