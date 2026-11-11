import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { organizationIsActive } from "../../../../lib/schedule-utils";
import { parseJsonRequestBody, validateSameOriginRequest } from "../../../../lib/request-security";
import { isUuid } from "../../../../lib/communications";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff" } });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return json({ message: "Authentication required" }, 401);
    if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);
    const { id } = await context.params;
    if (!isUuid(id)) return json({ message: "Invalid conversation ID." }, 400);

    const access = await pool.query(
      `SELECT c.id, c.subject,
              CASE WHEN c.created_by_user_id = $2::uuid THEN c.recipient_user_id ELSE c.created_by_user_id END AS other_user_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', other_employee.first_name, other_employee.last_name)), ''), other_user.email) AS other_name,
              COALESCE(other_employee.id, other_user.employee_id) AS other_employee_id,
              other_role.name AS other_role
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
       WHERE c.id = $1::uuid AND c.organization_id = $3::uuid
         AND (c.created_by_user_id = $2::uuid OR c.recipient_user_id = $2::uuid)
       LIMIT 1`,
      [id, actor.userId, actor.organizationId],
    );
    if (!access.rows[0]) return json({ message: "Conversation not found." }, 404);

    await pool.query(
      `UPDATE public.workforce_messages
       SET delivered_at = COALESCE(delivered_at, NOW()), read_at = COALESCE(read_at, NOW())
       WHERE conversation_id = $1::uuid AND organization_id = $2::uuid
         AND sender_user_id <> $3::uuid AND read_at IS NULL`,
      [id, actor.organizationId, actor.userId],
    );

    const messages = await pool.query(
      `SELECT m.id, m.sender_user_id, m.body, m.created_at, m.delivered_at, m.read_at,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', sender_employee.first_name, sender_employee.last_name)), ''), sender_user.email) AS sender_name,
              COALESCE(sender_employee.id, sender_user.employee_id) AS sender_employee_id,
              sender_role.name AS sender_role
       FROM public.workforce_messages m
       JOIN public.users sender_user ON sender_user.id = m.sender_user_id
       LEFT JOIN LATERAL (
         SELECT e.id, e.first_name, e.last_name
         FROM public.employees e
         WHERE e.organization_id = m.organization_id
           AND (
             e.id = sender_user.employee_id
             OR LOWER(e.email) = LOWER(sender_user.email)
           )
         ORDER BY CASE WHEN e.id = sender_user.employee_id THEN 0 ELSE 1 END
         LIMIT 1
       ) sender_employee ON TRUE
       LEFT JOIN public.roles sender_role
         ON sender_role.id = sender_user.role_id AND sender_role.organization_id = sender_user.organization_id
       WHERE m.conversation_id = $1::uuid AND m.organization_id = $2::uuid
       ORDER BY m.created_at ASC, m.id ASC`,
      [id, actor.organizationId],
    );
    return json({
      status: "ok",
      currentUserId: actor.userId,
      conversation: {
        id: String(access.rows[0].id),
        subject: String(access.rows[0].subject),
        otherUserId: String(access.rows[0].other_user_id),
        otherName: String(access.rows[0].other_name || "Colleague"),
        otherEmployeeId: access.rows[0].other_employee_id ? String(access.rows[0].other_employee_id) : null,
        otherRole: String(access.rows[0].other_role || "ORGANIZATION_USER"),
      },
      messages: messages.rows.map((row) => ({
        id: String(row.id),
        senderUserId: String(row.sender_user_id),
        senderName: String(row.sender_name || "Colleague"),
        senderEmployeeId: row.sender_employee_id ? String(row.sender_employee_id) : null,
        senderRole: String(row.sender_role || "ORGANIZATION_USER"),
        body: String(row.body),
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
      })),
    });
  } catch (error) {
    console.error("Failed to load communication thread:", error);
    return json({ message: "Unable to load this conversation." }, 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const actor = await getTenantPermissionActor();
  if (!actor) return json({ message: "Authentication required" }, 401);
  if (!(await organizationIsActive(pool, actor.organizationId))) return json({ message: "This organization is not active" }, 403);
  const { id } = await context.params;
  if (!isUuid(id)) return json({ message: "Invalid conversation ID." }, 400);

  const parsedBody = await parseJsonRequestBody(request, 8192);
  if (!parsedBody.ok) return parsedBody.response;
  const body: unknown = parsedBody.body;
  const message = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).message === "string"
    ? ((body as Record<string, unknown>).message as string).trim()
    : "";
  if (!message || message.length > 4000) return json({ message: "Message must be between 1 and 4000 characters." }, 400);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const conversation = await client.query(
      `SELECT id FROM public.workforce_conversations
       WHERE id = $1::uuid AND organization_id = $2::uuid
         AND (created_by_user_id = $3::uuid OR recipient_user_id = $3::uuid)
       FOR UPDATE`,
      [id, actor.organizationId, actor.userId],
    );
    if (!conversation.rows[0]) {
      await client.query("ROLLBACK");
      return json({ message: "Conversation not found." }, 404);
    }

    await client.query(
      `INSERT INTO public.workforce_messages
         (conversation_id, organization_id, sender_user_id, body)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [id, actor.organizationId, actor.userId, message],
    );
    await client.query(
      `UPDATE public.workforce_conversations
       SET last_message_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND organization_id = $2::uuid`,
      [id, actor.organizationId],
    );
    await client.query("COMMIT");
    return json({ status: "ok" }, 201);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Failed to send communication reply:", error);
    return json({ message: "Unable to send your reply." }, 500);
  } finally {
    client.release();
  }
}
