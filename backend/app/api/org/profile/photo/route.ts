import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { getOrganizationAdmin } from "../../../../../lib/auth";
import { validateSameOriginRequest } from "../../../../../lib/request-security";
import { imageResponse, readUploadedImage } from "../../../../../lib/image-upload";

const MAX_PHOTO_BYTES = 25 * 1024;

export async function GET() {
  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    const result = await pool.query(
      `SELECT profile_image, profile_image_mime_type
       FROM public.users
       WHERE id = $1 AND organization_id = $2 AND account_scope = 'ORGANIZATION'
       LIMIT 1`,
      [admin.id, admin.organizationId],
    );
    const row = result.rows[0] as { profile_image: Buffer | null; profile_image_mime_type: string | null } | undefined;
    if (!row?.profile_image || !row.profile_image_mime_type) {
      return NextResponse.json({ message: "No profile photo has been uploaded" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return imageResponse(row.profile_image, row.profile_image_mime_type);
  } catch (error) {
    console.error("Failed to load Organization Admin photo:", error);
    return NextResponse.json({ message: "Unable to load profile photo" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const originError = validateSameOriginRequest(request);
    if (originError) return originError;
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

    const upload = await readUploadedImage(request, "photo", MAX_PHOTO_BYTES);
    if (!upload.ok) return NextResponse.json({ message: upload.message }, { status: upload.status });

    const result = await pool.query(
      `UPDATE public.users
       SET profile_image = $3::bytea,
           profile_image_mime_type = $4,
           profile_image_updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND account_scope = 'ORGANIZATION'
       RETURNING id`,
      [admin.id, admin.organizationId, upload.bytes, upload.mimeType],
    );
    if (result.rowCount !== 1) return NextResponse.json({ message: "Organization Admin account not found" }, { status: 404 });
    return NextResponse.json({ message: "Profile photo uploaded successfully" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to upload Organization Admin photo:", error);
    return NextResponse.json({ message: "Unable to upload profile photo" }, { status: 500 });
  }
}
