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
  let passwordResetTables = false;
  if (database) {
    try {
      await pool.query("SELECT 1 FROM public.password_reset_tokens LIMIT 0");
      await pool.query("SELECT 1 FROM public.auth_rate_limits LIMIT 0");
      passwordResetTables = true;
    } catch (error) {
      console.error("Readiness password reset schema check failed:", error);
    }
  }

  const rateLimitSecretConfigured =
    Buffer.byteLength(process.env.RATE_LIMIT_HMAC_SECRET ?? "", "utf8") >= 32;
  const resetOriginConfigured = Boolean(
    process.env.PASSWORD_RESET_BASE_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    process.env.APP_ORIGIN?.trim(),
  );
  const passwordResetConfigured =
    passwordResetTables && rateLimitSecretConfigured && resetOriginConfigured;

  const ready = database && emailConfigured;
  return NextResponse.json({
    status: ready ? "ready" : database ? "degraded" : "unavailable",
    ready,
    checks: {
      database: database ? "ok" : "failed",
      emailDelivery: emailConfigured ? "configured" : "not_configured",
      passwordReset: {
        status: passwordResetConfigured ? "configured" : "not_configured",
        storage: passwordResetTables ? "ok" : "missing_tables",
        rateLimitSecret: rateLimitSecretConfigured ? "configured" : "missing_or_too_short",
        linkOrigin: resetOriginConfigured ? "configured" : "missing",
      },
    },
    checkedAt: new Date().toISOString(),
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" } });
}
