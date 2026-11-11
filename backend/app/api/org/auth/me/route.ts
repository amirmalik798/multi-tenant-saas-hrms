import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { getOrganizationAdmin } from "../../../../../lib/auth";

export async function GET() {
  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });

    if (!admin) {
      return NextResponse.json(
        { authenticated: false, message: "Authentication required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        authenticated: true,
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.roleName,
          organizationId: admin.organizationId,
          organizationName: admin.organizationName,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("Organization session verification failed:", error);

    return NextResponse.json(
      { authenticated: false, message: "Unable to verify session" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
