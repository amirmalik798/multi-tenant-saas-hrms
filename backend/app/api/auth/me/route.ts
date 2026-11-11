import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { getPlatformSuperAdmin } from "../../../../lib/auth";

export async function GET() {
  try {
    // Use the same database-backed authorization helper as all
    // other Super Admin platform routes.
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        { message: "Authentication required" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      status: "ok",
      authenticated: true,
      user: {
        email: admin.email,
        role: admin.roleName,
      },
    });
  } catch (error) {
    // Preserve framework-controlled Next.js errors.
    unstable_rethrow(error);

    console.error("Session verification failed:", error);

    return NextResponse.json(
      { message: "Unable to verify session" },
      { status: 500 },
    );
  }
}