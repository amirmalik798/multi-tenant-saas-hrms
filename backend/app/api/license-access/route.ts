import { connection, NextResponse } from "next/server";

import { getOrganizationAdmin, getOrganizationUser } from "../../../lib/auth";
import { getOrganizationLicenseAccess } from "../../../lib/licensing";

export async function GET() {
  await connection();

  try {
    // The endpoint supports both tenant-admin and workforce sessions. The
    // organization identity is always derived from the verified session.
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    const workforce = admin ? null : await getOrganizationUser();
    const organizationId = admin?.organizationId ?? workforce?.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { status: "error", message: "Authentication required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const license = await getOrganizationLicenseAccess(organizationId);
    if (!license) {
      return NextResponse.json(
        { status: "error", message: "Organization could not be found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        license: {
          status: license.status,
          canAccess: license.canAccess,
          restrictionReason: license.restrictionReason,
          expiresAt: license.expiresAt,
          remainingDays: license.remainingDays,
          databaseTime: license.databaseTime,
        },
        setupCompleted: admin ? Boolean(admin.setupCompletedAt) : true,
        role: admin ? "ORGANIZATION_ADMIN" : workforce?.roleName ?? null,
      },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch (error) {
    console.error("Organization license access check failed:", error);
    return NextResponse.json(
      { status: "error", message: "Unable to verify organization license access" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
