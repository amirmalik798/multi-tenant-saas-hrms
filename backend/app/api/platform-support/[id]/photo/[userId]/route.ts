import { NextResponse } from "next/server";
import { pool } from "../../../../../../lib/db";
import { getOrganizationAdmin, getPlatformSuperAdmin } from "../../../../../../lib/auth";
import { imageResponse } from "../../../../../../lib/image-upload";

type RouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, userId } = await context.params;
    if (!UUID.test(id) || !UUID.test(userId)) {
      return errorResponse("Invalid conversation or user ID.", 400);
    }

    const platformAdmin = await getPlatformSuperAdmin();
    const organizationAdmin = platformAdmin
      ? null
      : await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!platformAdmin && !organizationAdmin) {
      return errorResponse("Authentication required.", 401);
    }

    const access = await pool.query(
      `SELECT
         c.created_by_user_id,
         c.super_admin_user_id,
         c.organization_id
       FROM public.platform_support_conversations c
       WHERE c.id = $1::uuid
         AND (
           ($2::boolean = TRUE AND c.super_admin_user_id = $4::uuid)
           OR
           ($2::boolean = FALSE AND c.organization_id = $3::uuid)
         )
       LIMIT 1`,
      [
        id,
        Boolean(platformAdmin),
        organizationAdmin?.organizationId ?? null,
        platformAdmin?.id ?? null,
      ],
    );

    const conversation = access.rows[0] as
      | {
          created_by_user_id: string;
          super_admin_user_id: string;
          organization_id: string;
        }
      | undefined;

    if (
      !conversation ||
      (String(conversation.created_by_user_id) !== userId &&
        String(conversation.super_admin_user_id) !== userId)
    ) {
      return errorResponse("Profile photo not found.", 404);
    }

    const isPlatformAccount =
      String(conversation.super_admin_user_id) === userId;

    const result = isPlatformAccount
      ? await pool.query(
          `SELECT profile_image, profile_image_mime_type
           FROM public.users
           WHERE id = $1::uuid
             AND account_scope = 'PLATFORM'
             AND organization_id IS NULL
             AND status = 'ACTIVE'
           LIMIT 1`,
          [userId],
        )
      : await pool.query(
          `SELECT profile_image, profile_image_mime_type
           FROM public.users
           WHERE id = $1::uuid
             AND organization_id = $2::uuid
             AND account_scope = 'ORGANIZATION'
             AND status = 'ACTIVE'
           LIMIT 1`,
          [userId, conversation.organization_id],
        );

    const photo = result.rows[0] as
      | { profile_image: Buffer | null; profile_image_mime_type: string | null }
      | undefined;

    if (!photo?.profile_image || !photo.profile_image_mime_type) {
      return errorResponse("No profile photo has been uploaded.", 404);
    }

    return imageResponse(photo.profile_image, photo.profile_image_mime_type);
  } catch (error) {
    console.error("Failed to load platform support participant photo:", error);
    return errorResponse("Unable to load profile photo.", 500);
  }
}
