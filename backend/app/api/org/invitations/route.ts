import { connection, NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../lib/permissions";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
] as const;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_PAGE = 1_000_000;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_HISTORY_EVENTS_PER_INVITATION = 25;

type InvitationStatus = (typeof ALLOWED_STATUSES)[number];
type StatusFilter = "ALL" | InvitationStatus;

type InvitationHistoryEvent = {
  id: string;
  event_type: string;
  reason: string | null;
  effective_at: string | Date | null;
  created_at: string | Date;
};

type InvitationRecord = {
  id: string;
  organization_id: string;
  employee_id: string;
  email: string;
  status: InvitationStatus;
  display_status: InvitationStatus;
  expires_at: string | Date;
  accepted_at: string | Date | null;
  revoked_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  employee_code: string | null;
  first_name: string | null;
  last_name: string | null;
  employee_name: string | null;
  employment_status: string | null;
  workforce_role: string | null;
  invited_by_email: string | null;
  history: InvitationHistoryEvent[];
};

type Summary = {
  total: number;
  pending: number;
  accepted: number;
  expired: number;
  revoked: number;
};

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

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  max: number,
): number | null {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed >= 1 &&
    parsed <= max
    ? parsed
    : null;
}

function normalizeSearch(
  value: string | null,
): string | null {
  const raw = value ?? "";

  // Reject oversized raw input before Unicode normalization.
  if (raw.length > MAX_SEARCH_LENGTH * 4) {
    return null;
  }

  const normalized = raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  if (normalized.length > MAX_SEARCH_LENGTH) {
    return null;
  }

  return normalized.toLowerCase();
}

/**
 * GET /api/org/invitations
 *
 * Tenant-scoped invitation registry.
 *
 * Security:
 * - Requires an authenticated tenant actor.
 * - Requires the database-backed invitation.view permission.
 * - Derives tenant scope exclusively from the verified actor.
 * - Validates filters and bounds pagination.
 * - Uses parameterized SQL for user-controlled values.
 * - Scopes every invitation, employee, role, and inviter join to the tenant.
 * - Does not return token hashes, raw tokens, acceptance URLs, employee
 *   history snapshots, or arbitrary metadata.
 */
export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        {
          status: "error",
          message: "Authentication required.",
        },
        401,
      );
    }

    if (!hasTenantPermission(actor, "invitation.view")) {
      return jsonResponse(
        {
          status: "error",
          message:
            "You do not have permission to view workforce invitations.",
        },
        403,
      );
    }

    const params = new URL(request.url).searchParams;

    const page = parsePositiveInteger(
      params.get("page"),
      DEFAULT_PAGE,
      MAX_PAGE,
    );

    const limit = parsePositiveInteger(
      params.get("limit"),
      DEFAULT_LIMIT,
      MAX_LIMIT,
    );

    if (page === null || limit === null) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid pagination values.",
        },
        400,
      );
    }

    const offset = (page - 1) * limit;

    if (
      !Number.isSafeInteger(offset) ||
      offset > MAX_OFFSET
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            `Pagination offset must not exceed ${MAX_OFFSET}.`,
        },
        400,
      );
    }

    const search = normalizeSearch(params.get("q"));

    if (search === null) {
      return jsonResponse(
        {
          status: "error",
          message:
            `Search query must not exceed ${MAX_SEARCH_LENGTH} characters.`,
        },
        400,
      );
    }

    const statusRaw = (
      params.get("status") ?? "ALL"
    )
      .trim()
      .toUpperCase();

    if (
      statusRaw !== "ALL" &&
      !ALLOWED_STATUSES.includes(
        statusRaw as InvitationStatus,
      )
    ) {
      return jsonResponse(
        {
          status: "error",
          message:
            "Status must be ALL, PENDING, ACCEPTED, EXPIRED, or REVOKED.",
        },
        400,
      );
    }

    const statusFilter = statusRaw as StatusFilter;

    const employeeId = (
      params.get("employeeId") ?? ""
    ).trim();

    if (employeeId && !UUID_PATTERN.test(employeeId)) {
      return jsonResponse(
        {
          status: "error",
          message: "Invalid employee ID.",
        },
        400,
      );
    }

    /*
     * The organization ID comes only from the authenticated actor.
     * No query parameter or route parameter can select another tenant.
     */
    const where: string[] = [
      "i.organization_id = $1",
    ];

    const values: unknown[] = [
      actor.organizationId,
    ];

    if (employeeId) {
      values.push(employeeId);
      where.push(
        `i.employee_id = $${values.length}::uuid`,
      );
    }

    if (statusFilter === "PENDING") {
      where.push(
        "i.status = 'PENDING' AND i.expires_at > NOW()",
      );
    } else if (statusFilter === "EXPIRED") {
      // Display expired pending invitations as EXPIRED even if a
      // background process has not updated their stored status yet.
      where.push(
        "(i.status = 'EXPIRED' OR " +
          "(i.status = 'PENDING' AND i.expires_at <= NOW()))",
      );
    } else if (statusFilter !== "ALL") {
      values.push(statusFilter);
      where.push(
        `i.status = $${values.length}`,
      );
    }

    if (search) {
      // POSITION performs literal substring matching. User-supplied
      // percent and underscore characters are not LIKE wildcards.
      values.push(search);

      const searchParameter = `$${values.length}`;

      where.push(`(
        POSITION(
          ${searchParameter}
          IN LOWER(COALESCE(i.email, ''))
        ) > 0
        OR POSITION(
          ${searchParameter}
          IN LOWER(COALESCE(e.employee_code, ''))
        ) > 0
        OR POSITION(
          ${searchParameter}
          IN LOWER(
            COALESCE(e.first_name, '') || ' ' ||
            COALESCE(e.last_name, '')
          )
        ) > 0
        OR POSITION(
          ${searchParameter}
          IN LOWER(COALESCE(workforce_role.name, ''))
        ) > 0
      )`);
    }

    const whereSql = where.join(" AND ");

    // Count invitations matching the tenant and active filters.
    const countResult = await pool.query<{
      total: number;
    }>(
      `SELECT COUNT(*)::int AS total
       FROM public.employee_invitations AS i
       LEFT JOIN public.employees AS e
         ON e.id = i.employee_id
        AND e.organization_id = i.organization_id
       LEFT JOIN public.roles AS workforce_role
         ON workforce_role.id = i.role_id
        AND workforce_role.organization_id = i.organization_id
        AND workforce_role.scope = 'ORGANIZATION'
       WHERE ${whereSql}`,
      values,
    );

    const total = Number(
      countResult.rows[0]?.total ?? 0,
    );

    const pageValues = [
      ...values,
      limit,
      offset,
    ];

    const limitParameter = values.length + 1;
    const offsetParameter = values.length + 2;

    const invitationsResult =
      await pool.query<InvitationRecord>(
        `SELECT
           i.id::text AS id,
           i.organization_id::text AS organization_id,
           i.employee_id::text AS employee_id,
           i.email,
           i.status,
           CASE
             WHEN i.status = 'PENDING'
               AND i.expires_at <= NOW()
             THEN 'EXPIRED'
             ELSE i.status
           END AS display_status,
           i.expires_at,
           i.accepted_at,
           i.revoked_at,
           i.created_at,
           i.updated_at,
           e.employee_code,
           e.first_name,
           e.last_name,
           NULLIF(
             TRIM(
               CONCAT_WS(
                 ' ',
                 e.first_name,
                 e.last_name
               )
             ),
             ''
           ) AS employee_name,
           e.employment_status,
           workforce_role.name AS workforce_role,
           inviter.email AS invited_by_email,
           COALESCE(
             invitation_history.history,
             '[]'::json
           ) AS history
         FROM public.employee_invitations AS i
         LEFT JOIN public.employees AS e
           ON e.id = i.employee_id
          AND e.organization_id = i.organization_id
         LEFT JOIN public.roles AS workforce_role
           ON workforce_role.id = i.role_id
          AND workforce_role.organization_id = i.organization_id
          AND workforce_role.scope = 'ORGANIZATION'
         LEFT JOIN public.users AS inviter
           ON inviter.id = i.invited_by
          AND inviter.organization_id = i.organization_id
          AND inviter.account_scope = 'ORGANIZATION'
         LEFT JOIN LATERAL (
           SELECT json_agg(
             json_build_object(
               'id', event_row.id::text,
               'event_type', event_row.event_type,
               'reason', event_row.reason,
               'effective_at', event_row.effective_at,
               'created_at', event_row.created_at
             )
             ORDER BY
               event_row.effective_at DESC,
               event_row.created_at DESC,
               event_row.id DESC
           ) AS history
           FROM (
             SELECT
               h.id,
               h.event_type,
               LEFT(h.reason, 500) AS reason,
               h.effective_at,
               h.created_at
             FROM public.employee_history AS h
             WHERE h.organization_id = i.organization_id
               AND h.employee_id = i.employee_id
               AND h.metadata->>'invitation_id' = i.id::text
               AND LEFT(h.event_type, 11) = 'INVITATION_'
             ORDER BY
               h.effective_at DESC,
               h.created_at DESC,
               h.id DESC
             LIMIT ${MAX_HISTORY_EVENTS_PER_INVITATION}
           ) AS event_row
         ) AS invitation_history ON TRUE
         WHERE ${whereSql}
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $${limitParameter}
         OFFSET $${offsetParameter}`,
        pageValues,
      );

    // Summary counters remain tenant-wide, independent of the page/filter.
    const summaryResult = await pool.query<Summary>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE status = 'PENDING'
             AND expires_at > NOW()
         )::int AS pending,
         COUNT(*) FILTER (
           WHERE status = 'ACCEPTED'
         )::int AS accepted,
         COUNT(*) FILTER (
           WHERE status = 'EXPIRED'
             OR (
               status = 'PENDING'
               AND expires_at <= NOW()
             )
         )::int AS expired,
         COUNT(*) FILTER (
           WHERE status = 'REVOKED'
         )::int AS revoked
       FROM public.employee_invitations
       WHERE organization_id = $1`,
      [actor.organizationId],
    );

    const summary = summaryResult.rows[0] ?? {
      total: 0,
      pending: 0,
      accepted: 0,
      expired: 0,
      revoked: 0,
    };

    return jsonResponse({
      status: "ok",
      invitations: invitationsResult.rows,
      summary: {
        total: Number(summary.total) || 0,
        pending: Number(summary.pending) || 0,
        accepted: Number(summary.accepted) || 0,
        expired: Number(summary.expired) || 0,
        revoked: Number(summary.revoked) || 0,
      },
      filters: {
        q: search || null,
        status: statusFilter,
        employeeId: employeeId || null,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasPreviousPage: page > 1,
        hasNextPage:
          offset + invitationsResult.rows.length < total,
      },
    });
  } catch (error) {
    console.error(
      "Organization invitation registry error:",
      error,
    );

    return jsonResponse(
      {
        status: "error",
        message:
          "Unable to load workforce invitations right now.",
      },
      500,
    );
  }
}