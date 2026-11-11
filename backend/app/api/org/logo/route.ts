import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getOrganizationAdmin } from "../../../../lib/auth";
import { getTenantPermissionActor } from "../../../../lib/permissions";
import { validateSameOriginRequest } from "../../../../lib/request-security";
import { imageResponse, readUploadedImage } from "../../../../lib/image-upload";

const MAX_LOGO_BYTES = 100 * 1024;

export async function GET() {
  try {
    const actor = await getTenantPermissionActor();
    const admin = actor ? null : await getOrganizationAdmin({ allowIncompleteSetup: true });
    const organizationId = actor?.organizationId ?? admin?.organizationId;
    if (!organizationId) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    const result = await pool.query(
      `SELECT logo_image, logo_image_mime_type
       FROM public.organizations
       WHERE id = $1
         AND status = 'ACTIVE'
       LIMIT 1`,
      [organizationId],
    );
    const row = result.rows[0] as { logo_image: Buffer | null; logo_image_mime_type: string | null } | undefined;
    if (!row?.logo_image || !row.logo_image_mime_type) {
      return NextResponse.json({ message: "No organization logo has been uploaded" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return imageResponse(row.logo_image, row.logo_image_mime_type);
  } catch (error) {
    console.error("Failed to load organization logo:", error);
    return NextResponse.json({ message: "Unable to load organization logo" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const originError = validateSameOriginRequest(request);
    if (originError) return originError;
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

    const upload = await readUploadedImage(request, "logo", MAX_LOGO_BYTES);
    if (!upload.ok) return NextResponse.json({ message: upload.message }, { status: upload.status });

    const result = await pool.query(
      `UPDATE public.organizations
       SET logo_image = $2::bytea,
           logo_image_mime_type = $3,
           logo_image_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [admin.organizationId, upload.bytes, upload.mimeType],
    );
    if (result.rowCount !== 1) return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    return NextResponse.json({ message: "Organization logo uploaded successfully" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to upload organization logo:", error);
    return NextResponse.json({ message: "Unable to upload organization logo" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const originError = validateSameOriginRequest(request);
    if (originError) return originError;
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    await pool.query(
      `UPDATE public.organizations
       SET logo_image = NULL, logo_image_mime_type = NULL, logo_image_updated_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [admin.organizationId],
    );
    return NextResponse.json({ message: "Organization logo removed" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to remove organization logo:", error);
    return NextResponse.json({ message: "Unable to remove organization logo" }, { status: 500 });
  }
}
