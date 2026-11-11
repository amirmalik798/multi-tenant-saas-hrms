import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

export async function GET() {
  let database = false;
  try {
    await pool.query("SELECT 1");
    database = true;
  } catch (error) {
    console.error("Readiness database check failed:", error);
  }

  const emailMode = process.env.EMAIL_MODE?.trim().toLowerCase();
  const emailConfigured = emailMode === "sandbox"
    ? Boolean(process.env.MAILTRAP_API_TOKEN?.trim() && /^\d+$/.test(process.env.MAILTRAP_INBOX_ID?.trim() || ""))
    : emailMode === "live"
      ? Boolean(process.env.GOOGLE_APPS_SCRIPT_URL?.trim() && process.env.HRMS_EMAIL_SECRET?.trim())
      : false;
  const ready = database && emailConfigured;
  return NextResponse.json({
    status: ready ? "ready" : database ? "degraded" : "unavailable",
    ready,
    checks: { database: database ? "ok" : "failed", emailDelivery: emailConfigured ? "configured" : "not_configured" },
    checkedAt: new Date().toISOString(),
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" } });
}
