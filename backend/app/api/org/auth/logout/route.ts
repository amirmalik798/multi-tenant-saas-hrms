import { NextResponse } from "next/server";

import { destroyAllRoleSessions } from "../../../../../lib/auth";
import { validateSameOriginRequest } from "../../../../../lib/request-security";

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  try {
    // This application permits one active role session per browser.
    // Clear all three cookies so stale sessions cannot become active
    // after only one of several cookies is removed.
    await destroyAllRoleSessions();

    return NextResponse.json({
      status: "ok",
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout failed:", error);
    return NextResponse.json(
      { message: "Unable to log out right now" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
