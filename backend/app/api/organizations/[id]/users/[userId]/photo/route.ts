import { NextResponse } from "next/server";
import { pool } from "../../../../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../../../../lib/auth";
import { imageResponse } from "../../../../../../../lib/image-upload";

type RouteContext = { params: Promise<{ id: string; userId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const admin = await getPlatformSuperAdmin();
    if (!admin) return errorResponse("Authentication required.", 401);

    const { id, userId } = await context.params;
    if (!UUID.test(id) || !UUID.test(userId)) {
      return errorResponse("Invalid organization or user ID.", 400);
    }

    const result = await pool.query(
      `SELECT
         CASE
           WHEN r.name = 'ORGANIZATION_ADMIN'
             THEN COALESCE(u.profile_image, e.profile_image)
           ELSE COALESCE(e.profile_image, u.profile_image)
         END AS profile_image,
         CASE
           WHEN r.name = 'ORGANIZATION_ADMIN'
             THEN CASE
               WHEN u.profile_image IS NOT NULL THEN u.profile_image_mime_type
               ELSE e.profile_image_mime_type
             END
           ELSE CASE
             WHEN e.profile_image IS NOT NULL THEN e.profile_image_mime_type
             ELSE u.profile_image_mime_type
           END
         END AS profile_image_mime_type
       FROM public.users AS u
       JOIN public.roles AS r
         ON r.id = u.role_id
        AND r.scope = 'ORGANIZATION'
        AND r.organization_id = u.organization_id
       LEFT JOIN public.employees AS e
         ON e.id = u.employee_id
        AND e.organization_id = u.organization_id
       JOIN public.organizations AS o
         ON o.id = u.organization_id
       WHERE u.id = $1::uuid
         AND u.organization_id = $2::uuid
         AND u.account_scope = 'ORGANIZATION'
       LIMIT 1`,
      [userId, id],
    );

    const photo = result.rows[0] as
      | { profile_image: Buffer | null; profile_image_mime_type: string | null }
      | undefined;

    if (!photo?.profile_image || !photo.profile_image_mime_type) {
      return errorResponse("No profile photo has been uploaded.", 404);
    }

    return imageResponse(photo.profile_image, photo.profile_image_mime_type);
  } catch (error) {
    console.error("Failed to load organization user photo for Platform Super Admin:", error);
    return errorResponse("Unable to load profile photo.", 500);
  }
}
