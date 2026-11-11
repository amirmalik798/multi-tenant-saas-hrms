import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getOrganizationAdmin, getPlatformSuperAdmin } from "../../../../lib/auth";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../../lib/request-security";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } });
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
type RouteContext = { params: Promise<{ id: string }> };

async function authorizeConversation(id: string) {
  const platformAdmin = await getPlatformSuperAdmin();
  if (platformAdmin) {
    const access = await pool.query(
      `SELECT c.id, c.organization_id, o.name AS organization_name, c.subject, c.status
       FROM public.platform_support_conversations c
       JOIN public.organizations o ON o.id = c.organization_id
       WHERE c.id = $1::uuid LIMIT 1`,
      [id],
    );
    return access.rows[0] ? { kind: "PLATFORM" as const, user: platformAdmin, conversation: access.rows[0] } : null;
  }
  const organizationAdmin = await getOrganizationAdmin({ allowIncompleteSetup: true });
  if (!organizationAdmin) return null;
  const access = await pool.query(
    `SELECT c.id, c.organization_id, o.name AS organization_name, c.subject, c.status
     FROM public.platform_support_conversations c
     JOIN public.organizations o ON o.id = c.organization_id
     WHERE c.id = $1::uuid AND c.organization_id = $2::uuid LIMIT 1`,
    [id, organizationAdmin.organizationId],
  );
  return access.rows[0] ? { kind: "ORGANIZATION" as const, user: organizationAdmin, conversation: access.rows[0] } : null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return json({ message: "Invalid conversation ID." }, 400);
    const authorized = await authorizeConversation(id);
    if (!authorized) return json({ message: "Conversation not found or access denied." }, 404);
    const conversationId = String(authorized.conversation.id);
    const organizationId = String(authorized.conversation.organization_id);
    const actorId = authorized.user.id;

    await pool.query(
      `UPDATE public.platform_support_messages
       SET delivered_at = COALESCE(delivered_at, NOW()), read_at = COALESCE(read_at, NOW())
       WHERE conversation_id = $1::uuid AND organization_id = $2::uuid
         AND sender_user_id <> $3::uuid AND read_at IS NULL`,
      [conversationId, organizationId, actorId],
    );
    const messages = await pool.query(
      `SELECT m.id, m.sender_user_id, m.body, m.created_at, m.delivered_at, m.read_at,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', sender_employee.first_name, sender_employee.last_name)), ''), sender.email) AS sender_name,
              r.name AS sender_role
       FROM public.platform_support_messages m
       JOIN public.users sender ON sender.id = m.sender_user_id
       LEFT JOIN public.employees sender_employee
         ON sender_employee.id = sender.employee_id AND sender_employee.organization_id = m.organization_id
       LEFT JOIN public.roles r ON r.id = sender.role_id
       WHERE m.conversation_id = $1::uuid AND m.organization_id = $2::uuid
       ORDER BY m.created_at ASC, m.id ASC`,
      [conversationId, organizationId],
    );
    return json({
      status: "ok",
      currentUserId: actorId,
      mode: authorized.kind,
      conversation: {
        id: conversationId,
        organizationId,
        organizationName: String(authorized.conversation.organization_name || "Organization"),
        subject: String(authorized.conversation.subject),
        status: String(authorized.conversation.status),
      },
      messages: messages.rows.map((row) => ({
        id: String(row.id),
        senderUserId: String(row.sender_user_id),
        senderName: String(row.sender_name || "User"),
        senderRole: String(row.sender_role || "USER"),
        body: String(row.body),
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
      })),
    });
  } catch (error) {
    console.error("Failed to load platform support conversation:", error);
    return json({ message: "Unable to load this support conversation." }, 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return json({ message: "Invalid conversation ID." }, 400);
    const authorized = await authorizeConversation(id);
    if (!authorized) return json({ message: "Conversation not found or access denied." }, 404);
    const parsed = await parseJsonRequestBody(request, 12288);
    if (!parsed.ok) return parsed.response;
    if (!isRecord(parsed.body)) return json({ message: "Invalid request body." }, 400);
    const message = typeof parsed.body.message === "string" ? parsed.body.message.trim() : "";
    if (!message || message.length > 4000) return json({ message: "Message must be between 1 and 4000 characters." }, 400);
    if (String(authorized.conversation.status) !== "OPEN") return json({ message: "This support conversation is closed." }, 409);

    const conversationId = String(authorized.conversation.id);
    const organizationId = String(authorized.conversation.organization_id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO public.platform_support_messages
           (conversation_id, organization_id, sender_user_id, body)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
        [conversationId, organizationId, authorized.user.id, message],
      );
      await client.query(
        `UPDATE public.platform_support_conversations
         SET last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid AND organization_id = $2::uuid`,
        [conversationId, organizationId],
      );
      await client.query("COMMIT");
      return json({ status: "ok" }, 201);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to send platform support reply:", error);
    return json({ message: "Unable to send your support reply." }, 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return json({ message: "Invalid conversation ID." }, 400);
    const authorized = await authorizeConversation(id);
    if (!authorized) return json({ message: "Conversation not found or access denied." }, 404);
    const parsed = await parseJsonRequestBody(request, 4096);
    if (!parsed.ok) return parsed.response;
    if (!isRecord(parsed.body) || (parsed.body.status !== "OPEN" && parsed.body.status !== "CLOSED")) {
      return json({ message: "Status must be OPEN or CLOSED." }, 400);
    }
    const nextStatus = parsed.body.status;
    const reason = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";
    if (reason.length > 500) return json({ message: "Reason must be 500 characters or fewer." }, 400);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE public.platform_support_conversations
         SET status = $1, updated_at = NOW()
         WHERE id = $2::uuid AND organization_id = $3::uuid
         RETURNING id, status, updated_at`,
        [nextStatus, String(authorized.conversation.id), String(authorized.conversation.organization_id)],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return json({ message: "Conversation not found." }, 404);
      }
      if (authorized.kind === "PLATFORM") {
        await client.query(
          `INSERT INTO public.platform_audit_logs
            (actor_user_id, actor_email, action_key, target_type, target_id, organization_id, reason, before_state, after_state, metadata)
           VALUES ($1, $2, 'platform_support.status.change', 'PLATFORM_SUPPORT_CONVERSATION', $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
          [authorized.user.id, authorized.user.email, String(authorized.conversation.id), String(authorized.conversation.organization_id), reason || null,
            JSON.stringify({ status: authorized.conversation.status }), JSON.stringify({ status: nextStatus }),
            JSON.stringify({ organizationName: String(authorized.conversation.organization_name || "Organization") })],
        );
      }
      await client.query("COMMIT");
      return json({ status: "ok", conversation: { id: String(updated.rows[0].id), status: String(updated.rows[0].status), updatedAt: updated.rows[0].updated_at } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to update platform support conversation status:", error);
    return json({ message: "Unable to update support conversation status." }, 500);
  }
}
