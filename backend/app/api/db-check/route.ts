import { connection, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { pool } from "../../../lib/db";
import { getPlatformSuperAdmin } from "../../../lib/auth";

export async function GET() {
  // This endpoint depends on request authentication and must
  // not be prerendered as a build-time route.
  await connection();

  try {
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        {
          status: "error",
          message: "Authentication required",
        },
        { status: 401 },
      );
    }

    // Confirm connectivity without disclosing database metadata.
    await pool.query("SELECT 1");

    return NextResponse.json({
      status: "ok",
      message: "PostgreSQL connection successful",
    });
  } catch (error) {
    unstable_rethrow(error);

    console.error("PostgreSQL connection test failed:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Could not verify database connectivity",
      },
      { status: 500 },
    );
  }
}