import { connection, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Returns display context for the authenticated tenant only. */
export async function GET() {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return jsonResponse({ message: "Authentication required." }, 401);

    const result = await pool.query<{ timeZone: string }>(
      `SELECT COALESCE(NULLIF(BTRIM(os.time_zone), ''), 'Africa/Kigali') AS "timeZone"
       FROM public.organizations AS o
       LEFT JOIN public.organization_settings AS os
         ON os.organization_id = o.id
       WHERE o.id = $1::uuid
         AND o.status = 'ACTIVE'
       LIMIT 1`,
      [actor.organizationId],
    );
    if (!result.rows[0]) {
      return jsonResponse({ message: "Organization context is unavailable." }, 404);
    }

    const timeZone = result.rows[0].timeZone;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return jsonResponse({ message: "The organization's configured time zone is invalid." }, 500);
    }

    return jsonResponse({ status: "ok", timeZone });
  } catch (error) {
    console.error("Failed to load tenant workspace context:", error);
    return jsonResponse({ message: "Unable to load workspace context." }, 500);
  }
}
