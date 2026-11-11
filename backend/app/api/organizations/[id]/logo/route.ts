import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { getPlatformSuperAdmin } from "../../../../../lib/auth";
import { imageResponse } from "../../../../../lib/image-upload";

type RouteContext = { params: Promise<{ id: string }> };
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

    const { id } = await context.params;
    if (!UUID.test(id)) return errorResponse("Invalid organization ID.", 400);

    const result = await pool.query(
      `SELECT logo_image, logo_image_mime_type
       FROM public.organizations
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    const organization = result.rows[0] as
      | { logo_image: Buffer | null; logo_image_mime_type: string | null }
      | undefined;

    if (!organization?.logo_image || !organization.logo_image_mime_type) {
      return errorResponse("No organization logo has been uploaded.", 404);
    }

    return imageResponse(organization.logo_image, organization.logo_image_mime_type);
  } catch (error) {
    console.error("Failed to load organization logo for Platform Super Admin:", error);
    return errorResponse("Unable to load organization logo.", 500);
  }
}
