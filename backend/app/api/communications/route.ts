import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getTenantPermissionActor } from "../../../lib/permissions";
import { organizationIsActive } from "../../../lib/schedule-utils";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../lib/request-security";
import { resolveHigherUpRecipient } from "../../../lib/communications";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } });
}

export async function GET() {
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);

    const result = await pool.query(
      `SELECT c.id, c.subject, c.created_at, c.updated_at, c.last_message_at,
              CASE WHEN c.created_by_user_id = $2::uuid THEN c.recipient_user_id ELSE c.created_by_user_id END AS other_user_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', other_employee.first_name, other_employee.last_name)), ''), other_user.email) AS other_name,
              COALESCE(other_employee.id, other_user.employee_id) AS other_employee_id,
              other_role.name AS other_role,
              COALESCE(last_message.body, '') AS last_message,
              COALESCE(unread.unread_count, 0)::int AS unread_count
       FROM public.workforce_conversations c
       JOIN public.users other_user
         ON other_user.id = CASE WHEN c.created_by_user_id = $2::uuid THEN c.recipient_user_id ELSE c.created_by_user_id END
       LEFT JOIN LATERAL (
         SELECT e.id, e.first_name, e.last_name
         FROM public.employees e
         WHERE e.organization_id = c.organization_id
           AND (
             e.id = other_user.employee_id
             OR LOWER(e.email) = LOWER(other_user.email)
           )
         ORDER BY CASE WHEN e.id = other_user.employee_id THEN 0 ELSE 1 END
         LIMIT 1
       ) other_employee ON TRUE
       LEFT JOIN public.roles other_role
         ON other_role.id = other_user.role_id AND other_role.organization_id = other_user.organization_id
       LEFT JOIN LATERAL (
         SELECT m.body FROM public.workforce_messages m
         WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       ) last_message ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS unread_count FROM public.workforce_messages m
         WHERE m.conversation_id = c.id AND m.sender_user_id <> $2::uuid AND m.read_at IS NULL
       ) unread ON TRUE
       WHERE c.organization_id = $1::uuid
         AND (c.created_by_user_id = $2::uuid OR c.recipient_user_id = $2::uuid)
       ORDER BY c.last_message_at DESC, c.id DESC LIMIT 100`,
      [actor.organizationId, actor.userId],
    );

    const visibleConversationIds = result.rows.map((row) => String(row.id));
    if (visibleConversationIds.length > 0) {
      await pool.query(
        `UPDATE public.workforce_messages
         SET delivered_at = COALESCE(delivered_at, NOW())
         WHERE organization_id = $1::uuid
           AND conversation_id = ANY($2::uuid[])
           AND sender_user_id <> $3::uuid
           AND delivered_at IS NULL`,
        [actor.organizationId, visibleConversationIds, actor.userId],
      );
    }

    const recipient = await resolveHigherUpRecipient(actor);
    return json({
      status: "ok",
      currentUserId: actor.userId,
      conversations: result.rows.map((row) => ({
        id: String(row.id),
        subject: String(row.subject),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        otherUserId: String(row.other_user_id),
        otherName: String(row.other_name || "Colleague"),
        otherEmployeeId: row.other_employee_id ? String(row.other_employee_id) : null,
        otherRole: String(row.other_role || "ORGANIZATION_USER"),
        lastMessage: String(row.last_message || ""),
        unreadCount: Number(row.unread_count || 0),
      })),
      canStartNew: actor.kind === "ORGANIZATION_USER" && Boolean(recipient),
      recipientName: recipient?.displayName ?? null,
      recipientRole: recipient?.roleName ?? null,
    });
  } catch (error) {
    console.error("Failed to load communication inbox:", error);
    return json({ message: "Unable to load messages. Confirm the communications migration has been applied." }, 500);
  }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const actor = await getTenantPermissionActor();
  if (!actor) return json({ message: "Authentication required" }, 401);
  if (actor.kind !== "ORGANIZATION_USER" || !["HR_MANAGER", "DEPARTMENT_MANAGER", "EMPLOYEE"].includes(actor.roleName)) {
    return json({ message: "Only workforce users can start an upward conversation." }, 403);
  }
  if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);

  const parsedBody = await parseJsonRequestBody(request, 8192);
  if (!parsedBody.ok) return parsedBody.response;
  const body: unknown = parsedBody.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ message: "Invalid request body." }, 400);
  const payload = body as Record<string, unknown>;
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (subject.length < 3 || subject.length > 160) return json({ message: "Subject must be between 3 and 160 characters." }, 400);
  if (message.length < 1 || message.length > 4000) return json({ message: "Message must be between 1 and 4000 characters." }, 400);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recipient = await resolveHigherUpRecipient(actor, client);
    if (!recipient) {
      await client.query("ROLLBACK");
      return json({ message: "No active higher-up account is available. Ask your organization administrator to review the reporting hierarchy." }, 409);
    }

    const conversation = await client.query(
      `INSERT INTO public.workforce_conversations
         (organization_id, subject, created_by_user_id, recipient_user_id, last_message_at)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, NOW())
       RETURNING id`,
      [actor.organizationId, subject, actor.userId, recipient.userId],
    );
    const conversationId = String(conversation.rows[0].id);
    await client.query(
      `INSERT INTO public.workforce_messages
         (conversation_id, organization_id, sender_user_id, body)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [conversationId, actor.organizationId, actor.userId, message],
    );
    await client.query("COMMIT");
    return json({ status: "ok", conversationId, recipientName: recipient.displayName }, 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to start communication:", error);
    return json({ message: "Unable to send your message." }, 500);
  } finally {
    client.release();
  }
}
