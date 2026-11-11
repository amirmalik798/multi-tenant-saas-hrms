import { connection, NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getPlatformSuperAdmin } from "../../../lib/auth";

const ALLOWED_STATUSES = new Set(["ALL", "PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);

export async function GET(request: Request) {
  // This authenticated endpoint must run per request. Keep the
  // prerender boundary outside the handler try/catch so Next.js
  // does not cache a build-time authentication error response.
  await connection();
  try {
    const admin = await getPlatformSuperAdmin();
    if (!admin) return NextResponse.json({ status: "error", message: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });

    const url = new URL(request.url);
    const parsedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
    const parsedPageSize = Number.parseInt(url.searchParams.get("pageSize") || "25", 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const pageSize = Number.isFinite(parsedPageSize) ? Math.min(100, Math.max(1, parsedPageSize)) : 25;
    const offset = (page - 1) * pageSize;
    const search = (url.searchParams.get("search") || "").trim().slice(0, 200);
    const requestedStatus = (url.searchParams.get("status") || "ALL").trim().toUpperCase();
    const status = ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : "ALL";
    const pattern = `%${search}%`;

    const where = `($1::text = '' OR i.email ILIKE $2 OR o.name ILIKE $2 OR i.id::text ILIKE $2)
      AND ($3::text = 'ALL'
        OR ($3::text = 'PENDING' AND i.status::text = 'PENDING' AND i.expires_at > NOW())
        OR ($3::text = 'ACCEPTED' AND i.status::text = 'ACCEPTED')
        OR ($3::text = 'REVOKED' AND i.status::text = 'REVOKED')
        OR ($3::text = 'EXPIRED' AND (i.status::text = 'EXPIRED' OR (i.status::text = 'PENDING' AND i.expires_at <= NOW()))))`;

    const [rows, count, summary] = await Promise.all([
      pool.query(`SELECT i.id, i.organization_id, o.name AS organization_name, i.email, i.status,
        i.expires_at, i.accepted_at, i.revoked_at, i.created_at
        FROM public.organization_invitations i
        JOIN public.organizations o ON o.id = i.organization_id
        WHERE ${where}
        ORDER BY i.created_at DESC, i.id DESC LIMIT $4 OFFSET $5`, [search, pattern, status, pageSize, offset]),
      pool.query(`SELECT COUNT(*)::integer AS total FROM public.organization_invitations i
        JOIN public.organizations o ON o.id = i.organization_id WHERE ${where}`, [search, pattern, status]),
      pool.query(`SELECT
        COUNT(*)::integer AS total,
        COUNT(*) FILTER (WHERE status::text = 'ACCEPTED')::integer AS accepted,
        COUNT(*) FILTER (WHERE status::text = 'REVOKED')::integer AS revoked,
        COUNT(*) FILTER (WHERE status::text = 'EXPIRED' OR (status::text = 'PENDING' AND expires_at <= NOW()))::integer AS expired,
        COUNT(*) FILTER (WHERE status::text = 'PENDING' AND expires_at > NOW())::integer AS pending
        FROM public.organization_invitations`),
    ]);

    const total = Number(count.rows[0]?.total || 0);
    const counts = summary.rows[0] || {};
    return NextResponse.json({
      status: "ok",
      count: rows.rows.length,
      invitations: rows.rows,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      summary: { total: Number(counts.total || 0), pending: Number(counts.pending || 0), accepted: Number(counts.accepted || 0), expired: Number(counts.expired || 0), revoked: Number(counts.revoked || 0) },
    }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    // Keep the public error generic, but log PostgreSQL diagnostics so schema/query
    // mismatches can be identified without exposing database details to the client.
    const dbError = error as { code?: unknown; message?: unknown; detail?: unknown; constraint?: unknown };
    console.error("Failed to load platform-wide invitations:", {
      code: typeof dbError?.code === "string" ? dbError.code : undefined,
      message: typeof dbError?.message === "string" ? dbError.message : String(error),
      detail: typeof dbError?.detail === "string" ? dbError.detail : undefined,
      constraint: typeof dbError?.constraint === "string" ? dbError.constraint : undefined,
    });
    return NextResponse.json({ status: "error", message: "Unable to load platform-wide invitations" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
