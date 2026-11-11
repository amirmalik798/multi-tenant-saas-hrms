import { connection, NextResponse } from "next/server";

import { pool } from "../../../../../lib/db";
import { getOrganizationAdmin } from "../../../../../lib/auth";
import { getOrganizationLicenseAccess } from "../../../../../lib/licensing";

const MAX_ACTIVITY_ITEMS = 10;

function parseLimit(value: string | null) {
  if (!value) return 6;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 6;
  return Math.min(parsed, MAX_ACTIVITY_ITEMS);
}

/**
 * GET /api/org/dashboard/activity
 *
 * Returns a small, read-only feed of audit events for the authenticated
 * Organization Admin's own tenant. Organization scope is derived exclusively
 * from the verified server session; client-supplied tenant IDs are ignored.
 * Sensitive before/after states and metadata are intentionally not returned.
 */
export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const admin = await getOrganizationAdmin();

    if (!admin) {
      return NextResponse.json(
        { status: "error", message: "Authentication required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Dashboard activity is part of the normal HRMS workspace. Keep the
    // Organization Admin authenticated for licensing/payment workflows, but
    // do not expose tenant dashboard data while its license is unavailable.
    const licenseAccess = await getOrganizationLicenseAccess(
      admin.organizationId,
    );

    if (!licenseAccess?.canAccess) {
      return NextResponse.json(
        {
          status: "error",
          message: "Organization license is not active",
          code: "LICENSE_REQUIRED",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }

    const params = new URL(request.url).searchParams;
    const limit = parseLimit(params.get("limit"));

    const result = await pool.query<{
      id: string;
      actorEmail: string | null;
      actionKey: string;
      targetType: string | null;
      targetId: string | null;
      createdAt: string;
    }>(
      `SELECT
         a.id::text AS id,
         a.actor_email AS "actorEmail",
         a.action_key AS "actionKey",
         a.target_type AS "targetType",
         a.target_id::text AS "targetId",
         a.created_at AS "createdAt"
       FROM public.platform_audit_logs AS a
       WHERE a.organization_id = $1
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $2`,
      [admin.organizationId, limit],
    );

    return NextResponse.json(
      { status: "ok", activities: result.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Organization dashboard activity error:", error);
    return NextResponse.json(
      { status: "error", message: "Unable to load recent organization activity" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
