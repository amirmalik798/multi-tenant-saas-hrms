import { NextResponse } from "next/server";

import { pool } from "../../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../../lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = [
  "ALL",
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

type UserStatusFilter = (typeof ALLOWED_STATUSES)[number];

const LIMIT = 100;
const MAX_OFFSET = 1_000_000;

function jsonResponse(
  body: unknown,
  init: number | ResponseInit = 200,
) {
  const responseInit =
    typeof init === "number" ? { status: init } : init;

  const headers = new Headers(responseInit.headers);

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return NextResponse.json(body, {
    ...responseInit,
    headers,
  });
}

// Read-only directory for Platform Super Admin.
// Status filtering and offset pagination remain backward-compatible.
export async function GET(
  request: Request,
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

    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid organization ID",
        },
        400,
      );
    }

    const url = new URL(request.url);

    const requestedStatus = (
      url.searchParams.get("status") ?? "ALL"
    )
      .trim()
      .toUpperCase();

    if (
      !ALLOWED_STATUSES.includes(
        requestedStatus as UserStatusFilter,
      )
    ) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid user status filter",
        },
        400,
      );
    }

    const statusFilter =
      requestedStatus as UserStatusFilter;

    /*
     * Preserve the previous behavior of treating malformed offsets as zero,
     * but reject excessive valid offsets to limit unnecessarily expensive
     * directory scans.
     */
    const rawOffset = (
      url.searchParams.get("offset") ?? "0"
    ).trim();

    let offset = 0;

    if (/^\d+$/.test(rawOffset)) {
      const parsedOffset = Number(rawOffset);

      if (
        !Number.isSafeInteger(parsedOffset) ||
        parsedOffset > MAX_OFFSET
      ) {
        return jsonResponse(
          {
            status: "error",
            message:
              `Offset must be a safe integer between 0 and ${MAX_OFFSET}`,
          },
          400,
        );
      }

      offset = parsedOffset;
    }

    const searchTerm = (
      url.searchParams.get("q") ?? ""
    )
      .trim()
      .slice(0, 120);

    // Explicitly confirm that the requested organization exists.
    const organizationResult = await pool.query(
      `SELECT id
       FROM public.organizations
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    if (organizationResult.rows.length === 0) {
      return jsonResponse(
        {
          status: "error",
          message: "Organization not found",
        },
        404,
      );
    }

    /*
     * Organization scope is applied to both the account and role.
     * Platform-level accounts are deliberately excluded.
     */
    const userDirectoryQuery = `
      SELECT
        u.id,
        COALESCE(
          NULLIF(
            BTRIM(
              CONCAT_WS(
                ' ',
                e.first_name,
                e.last_name
              )
            ),
            ''
          ),
          u.email
        ) AS display_name,
        u.email,
        r.name AS role,
        u.status,
        u.last_login_at,
        u.created_at,
        e.employee_code,
        e.designation
      FROM public.users AS u
      JOIN public.roles AS r
        ON r.id = u.role_id
       AND r.scope = 'ORGANIZATION'
       AND r.organization_id = u.organization_id
      LEFT JOIN public.employees AS e
        ON e.id = u.employee_id
       AND e.organization_id = u.organization_id
      WHERE u.organization_id = $1
        AND u.account_scope = 'ORGANIZATION'
    `;

    const searchCondition = `(
      $2 = ''
      OR u.email ILIKE '%' || $2 || '%'
      OR COALESCE(
           NULLIF(
             BTRIM(
               CONCAT_WS(
                 ' ',
                 e.first_name,
                 e.last_name
               )
             ),
             ''
           ),
           u.email
         ) ILIKE '%' || $2 || '%'
      OR COALESCE(r.name, '') ILIKE '%' || $2 || '%'
      OR COALESCE(e.employee_code, '') ILIKE '%' || $2 || '%'
      OR COALESCE(e.designation, '') ILIKE '%' || $2 || '%'
    )`;

    const usersQuery =
      statusFilter === "ALL"
        ? pool.query(
            `${userDirectoryQuery}
             AND ${searchCondition}
             ORDER BY
               CASE u.status
                 WHEN 'ACTIVE' THEN 0
                 WHEN 'INVITED' THEN 1
                 WHEN 'SUSPENDED' THEN 2
                 WHEN 'DEACTIVATED' THEN 3
                 ELSE 4
               END,
               u.created_at DESC,
               u.id ASC
             LIMIT $3 OFFSET $4`,
            [id, searchTerm, LIMIT, offset],
          )
        : pool.query(
            `${userDirectoryQuery}
             AND ${searchCondition}
             AND u.status = $3
             ORDER BY u.created_at DESC, u.id ASC
             LIMIT $4 OFFSET $5`,
            [
              id,
              searchTerm,
              statusFilter,
              LIMIT,
              offset,
            ],
          );

    const [
      usersResult,
      countsResult,
      matchingCountResult,
    ] = await Promise.all([
      usersQuery,

      pool.query(
        `SELECT
           COUNT(*)::integer AS total,
           COUNT(*) FILTER (
             WHERE status = 'ACTIVE'
           )::integer AS active,
           COUNT(*) FILTER (
             WHERE status = 'INVITED'
           )::integer AS invited,
           COUNT(*) FILTER (
             WHERE status = 'SUSPENDED'
           )::integer AS suspended,
           COUNT(*) FILTER (
             WHERE status = 'DEACTIVATED'
           )::integer AS deactivated
         FROM public.users
         WHERE organization_id = $1
           AND account_scope = 'ORGANIZATION'`,
        [id],
      ),

      pool.query(
        `SELECT COUNT(*)::integer AS matching_total
         FROM public.users AS u
         JOIN public.roles AS r
           ON r.id = u.role_id
          AND r.scope = 'ORGANIZATION'
          AND r.organization_id = u.organization_id
         LEFT JOIN public.employees AS e
           ON e.id = u.employee_id
          AND e.organization_id = u.organization_id
         WHERE u.organization_id = $1
           AND u.account_scope = 'ORGANIZATION'
           AND ${searchCondition}
           AND ($3 = 'ALL' OR u.status = $3)`,
        [id, searchTerm, statusFilter],
      ),
    ]);

    const counts = countsResult.rows[0] ?? {
      total: 0,
      active: 0,
      invited: 0,
      suspended: 0,
      deactivated: 0,
    };

    const total = Number(counts.total);

    const matchingTotal = Number(
      matchingCountResult.rows[0]?.matching_total ?? 0,
    );

    return jsonResponse({
      status: "ok",
      organizationId: id,
      total,
      matchingTotal,
      statusFilter,
      counts: {
        active: Number(counts.active),
        invited: Number(counts.invited),
        suspended: Number(counts.suspended),
        deactivated: Number(counts.deactivated),
      },
      users: usersResult.rows,
      returned: usersResult.rows.length,
      offset,
      limit: LIMIT,
      hasMore:
        offset + usersResult.rows.length < matchingTotal,
    });
  } catch (error) {
    console.error(
      "Failed to fetch organization users:",
      error,
    );

    return jsonResponse(
      {
        status: "error",
        message: "Unable to fetch organization users",
      },
      500,
    );
  }
}