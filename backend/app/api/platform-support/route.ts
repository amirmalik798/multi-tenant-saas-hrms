import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getOrganizationAdmin, getPlatformSuperAdmin } from "../../../lib/auth";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../lib/request-security";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    const platformAdmin = await getPlatformSuperAdmin();
    const organizationAdmin = platformAdmin ? null : await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!platformAdmin && !organizationAdmin) return json({ message: "Authentication required." }, 401);

    const actorId = platformAdmin?.id ?? organizationAdmin!.id;
    const url = new URL(request.url);
    const parsedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
    const parsedPageSize = Number.parseInt(url.searchParams.get("pageSize") || "25", 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const pageSize = Number.isFinite(parsedPageSize) ? Math.min(100, Math.max(1, parsedPageSize)) : 25;
    const offset = (page - 1) * pageSize;
    const search = (url.searchParams.get("search") || "").trim().slice(0, 160);
    const statusValue = (url.searchParams.get("status") || "ALL").trim().toUpperCase();
    const status = statusValue === "OPEN" || statusValue === "CLOSED" ? statusValue : "ALL";
    const pattern = `%${search}%`;
    const result = await pool.query(
      `SELECT c.id, c.organization_id, o.name AS organization_name, c.subject, c.status,
              c.created_at, c.updated_at, c.last_message_at,
              c.created_by_user_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', creator_employee.first_name, creator_employee.last_name)), ''), creator.email) AS created_by_name,
              COALESCE(last_message.body, '') AS last_message,
              COALESCE(unread.unread_count, 0)::int AS unread_count
       FROM public.platform_support_conversations c
       JOIN public.organizations o ON o.id = c.organization_id
       JOIN public.users creator ON creator.id = c.created_by_user_id
       LEFT JOIN public.employees creator_employee
         ON creator_employee.id = creator.employee_id AND creator_employee.organization_id = c.organization_id
       LEFT JOIN LATERAL (
         SELECT m.body FROM public.platform_support_messages m
         WHERE m.conversation_id = c.id AND m.organization_id = c.organization_id
         ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       ) last_message ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS unread_count FROM public.platform_support_messages m
         WHERE m.conversation_id = c.id AND m.organization_id = c.organization_id
           AND m.sender_user_id <> $1::uuid AND m.read_at IS NULL
       ) unread ON TRUE
       WHERE ($2::boolean = TRUE OR c.organization_id = $3::uuid)
         AND ($4::text = '' OR o.name ILIKE $5 OR c.subject ILIKE $5 OR creator.email ILIKE $5)
         AND ($6::text = 'ALL' OR c.status = $6::text)
       ORDER BY c.last_message_at DESC, c.id DESC LIMIT $7 OFFSET $8`,
      [actorId, Boolean(platformAdmin), organizationAdmin?.organizationId ?? null, search, pattern, status, pageSize, offset],
    );
    const visibleConversationIds = result.rows.map((row) => String(row.id));
    if (visibleConversationIds.length > 0) {
      await pool.query(
        `UPDATE public.platform_support_messages
         SET delivered_at = COALESCE(delivered_at, NOW())
         WHERE conversation_id = ANY($1::uuid[])
           AND sender_user_id <> $2::uuid
           AND delivered_at IS NULL`,
        [visibleConversationIds, actorId],
      );
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::integer AS total FROM public.platform_support_conversations c
       JOIN public.organizations o ON o.id = c.organization_id
       JOIN public.users creator ON creator.id = c.created_by_user_id
       WHERE ($1::boolean = TRUE OR c.organization_id = $2::uuid)
         AND ($3::text = '' OR o.name ILIKE $4 OR c.subject ILIKE $4 OR creator.email ILIKE $4)
         AND ($5::text = 'ALL' OR c.status = $5::text)`,
      [Boolean(platformAdmin), organizationAdmin?.organizationId ?? null, search, pattern, status],
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const unreadResult = await pool.query(
      `SELECT COUNT(*)::integer AS total
       FROM public.platform_support_messages m
       JOIN public.platform_support_conversations c
         ON c.id = m.conversation_id AND c.organization_id = m.organization_id
       WHERE m.sender_user_id <> $1::uuid AND m.read_at IS NULL
         AND ($2::boolean = TRUE OR c.organization_id = $3::uuid)`,
      [actorId, Boolean(platformAdmin), organizationAdmin?.organizationId ?? null],
    );
    const unreadTotal = Number(unreadResult.rows[0]?.total || 0);

    return json({
      status: "ok",
      currentUserId: actorId,
      mode: platformAdmin ? "PLATFORM" : "ORGANIZATION",
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      unreadTotal,
      conversations: result.rows.map((row) => ({
        id: String(row.id),
        organizationId: String(row.organization_id),
        organizationName: String(row.organization_name || "Organization"),
        subject: String(row.subject),
        status: String(row.status),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        createdByUserId: String(row.created_by_user_id),
        createdByName: String(row.created_by_name || "Organization Admin"),
        lastMessage: String(row.last_message || ""),
        unreadCount: Number(row.unread_count || 0),
      })),
    });
  } catch (error) {
    console.error("Failed to load platform support inbox:", error);
    return json({ message: "Unable to load the platform support inbox." }, 500);
  }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;
  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return json({ message: "Only an authenticated Organization Admin can start a support conversation." }, 403);
    const parsed = await parseJsonRequestBody(request, 12288);
    if (!parsed.ok) return parsed.response;
    if (!isRecord(parsed.body)) return json({ message: "Invalid request body." }, 400);
    const subject = typeof parsed.body.subject === "string" ? parsed.body.subject.trim() : "";
    const message = typeof parsed.body.message === "string" ? parsed.body.message.trim() : "";
    if (!subject || subject.length > 160) return json({ message: "Subject must be between 1 and 160 characters." }, 400);
    if (!message || message.length > 4000) return json({ message: "Message must be between 1 and 4000 characters." }, 400);

    const superAdmin = await pool.query(
      `SELECT u.id
       FROM public.users u
       JOIN public.roles r ON r.id = u.role_id
       WHERE u.account_scope = 'PLATFORM' AND u.organization_id IS NULL
         AND u.status = 'ACTIVE' AND r.name = 'SUPER_ADMIN'
         AND r.scope = 'PLATFORM' AND r.organization_id IS NULL
       ORDER BY u.created_at ASC, u.id ASC LIMIT 1`,
    );
    if (!superAdmin.rows[0]) return json({ message: "No active Platform Super Admin is available to receive support messages." }, 503);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query(
        `INSERT INTO public.platform_support_conversations
           (organization_id, created_by_user_id, super_admin_user_id, subject)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
         RETURNING id`,
        [admin.organizationId, admin.id, superAdmin.rows[0].id, subject],
      );
      const conversationId = String(created.rows[0].id);
      await client.query(
        `INSERT INTO public.platform_support_messages
           (conversation_id, organization_id, sender_user_id, body)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
        [conversationId, admin.organizationId, admin.id, message],
      );
      await client.query(
        `UPDATE public.platform_support_conversations
         SET last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid AND organization_id = $2::uuid`,
        [conversationId, admin.organizationId],
      );
      await client.query("COMMIT");
      return json({ status: "ok", conversationId }, 201);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to create platform support conversation:", error);
    return json({ message: "Unable to start a support conversation." }, 500);
  }
}
