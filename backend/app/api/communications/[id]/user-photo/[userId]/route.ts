import { NextResponse } from "next/server";
import { pool } from "../../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../../lib/permissions";
import { imageResponse } from "../../../../../../lib/image-upload";

type RouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * Return a participant's profile image only when both the viewer and target
 * are participants in the requested conversation and belong to the same
 * organization. Organization Admin photos are stored on users; the linked
 * employee image is retained as a compatibility fallback for older accounts.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getTenantPermissionActor();
    if (!actor) return errorResponse("Authentication required.", 401);

    const { id, userId } = await context.params;
    if (!UUID.test(id) || !UUID.test(userId)) {
      return errorResponse("Invalid conversation or user ID.", 400);
    }

    const result = await pool.query(
      `SELECT
         CASE
           WHEN account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= 25600
             THEN account.profile_image
           WHEN employee.profile_image IS NOT NULL
             AND employee.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(employee.profile_image) <= 25600
             THEN employee.profile_image
           ELSE NULL
         END AS profile_image,
         CASE
           WHEN account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= 25600
             THEN account.profile_image_mime_type
           WHEN employee.profile_image IS NOT NULL
             AND employee.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(employee.profile_image) <= 25600
             THEN employee.profile_image_mime_type
           ELSE NULL
         END AS profile_image_mime_type
       FROM public.workforce_conversations AS conversation
       JOIN public.users AS account
         ON account.id = $4::uuid
        AND account.organization_id = conversation.organization_id
       LEFT JOIN LATERAL (
         SELECT
           e.profile_image,
           e.profile_image_mime_type
         FROM public.employees AS e
         WHERE e.organization_id = account.organization_id
           AND (
             e.id = account.employee_id
             OR LOWER(BTRIM(e.email)) = LOWER(BTRIM(account.email))
           )
         ORDER BY
           CASE WHEN e.id = account.employee_id THEN 0 ELSE 1 END,
           e.id ASC
         LIMIT 1
       ) AS employee ON TRUE
       WHERE conversation.id = $1::uuid
         AND conversation.organization_id = $2::uuid
         AND (
           conversation.created_by_user_id = $3::uuid
           OR conversation.recipient_user_id = $3::uuid
         )
         AND (
           conversation.created_by_user_id = $4::uuid
           OR conversation.recipient_user_id = $4::uuid
         )
       LIMIT 1`,
      [id, actor.organizationId, actor.userId, userId],
    );

    const photo = result.rows[0] as
      | { profile_image: Buffer | null; profile_image_mime_type: string | null }
      | undefined;

    if (!photo?.profile_image || !photo.profile_image_mime_type) {
      return errorResponse("No profile photo has been uploaded.", 404);
    }

    return imageResponse(photo.profile_image, photo.profile_image_mime_type);
  } catch (error) {
    console.error("Failed to load workforce conversation participant photo:", error);
    return errorResponse("Unable to load profile photo.", 500);
  }
}
