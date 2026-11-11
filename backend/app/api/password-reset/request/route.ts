import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import { sendPasswordResetEmail } from "../../../../lib/email";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

const GENERIC_MESSAGE =
  "If an account with that email address exists, password reset instructions will be sent.";

const MAX_REQUESTS_PER_ACCOUNT = 3;
const RATE_LIMIT_WINDOW_MINUTES = 15;

const MAX_REQUESTS_PER_IP = 30;
const RATE_LIMIT_WINDOW_MS =
  RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

type JsonObject = Record<string, unknown>;

type ResetEmailPayload = {
  email: string;
  resetUrl: string;
  expiresAt: Date;
  tokenHash: string;
};

function isObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function genericResponse() {
  return NextResponse.json({
    status: "ok",
    message: GENERIC_MESSAGE,
  });
}

function rateLimitedGenericResponse(
  retryAfterSeconds: number,
) {
  return NextResponse.json(
    {
      status: "ok",
      message: GENERIC_MESSAGE,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, retryAfterSeconds),
        ),
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Read the client IP only from an explicitly configured trusted
 * proxy header.
 *
 * The proxy must overwrite this header, not merely append to a
 * value supplied by the client. Do not configure this setting to
 * a header that clients can choose freely.
 *
 * During local development, if no trusted header is configured,
 * IP limiting is skipped. Account-based limiting remains active.
 */
function getClientIp(request: Request): string | null {
  const trustedHeaderName =
    process.env.RATE_LIMIT_TRUSTED_IP_HEADER
      ?.trim()
      .toLowerCase();

  if (!trustedHeaderName) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RATE_LIMIT_TRUSTED_IP_HEADER must be configured in production.",
      );
    }

    return null;
  }

  if (!/^[a-z0-9-]+$/.test(trustedHeaderName)) {
    throw new Error(
      "RATE_LIMIT_TRUSTED_IP_HEADER has an invalid header name.",
    );
  }

  const candidate =
    request.headers.get(trustedHeaderName)?.trim();

  // Reject forwarding chains and accept exactly one IP.
  if (!candidate || candidate.includes(",")) {
    return null;
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

/**
 * Use an explicitly configured, trusted frontend URL.
 * Never construct reset links from request headers.
 */
function getPasswordResetBaseUrl(): URL {
  const configuredUrl = process.env.PASSWORD_RESET_BASE_URL;

  if (!configuredUrl) {
    throw new Error(
      "PASSWORD_RESET_BASE_URL is not configured.",
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      "PASSWORD_RESET_BASE_URL is not a valid URL.",
    );
  }

  const isLocalDevelopmentUrl =
    baseUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(
      baseUrl.hostname,
    );

  if (
    (baseUrl.protocol !== "https:" && !isLocalDevelopmentUrl) ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== "" ||
    baseUrl.pathname !== "/"
  ) {
    throw new Error(
      "PASSWORD_RESET_BASE_URL must be a trusted HTTPS origin, or a localhost HTTP origin for development.",
    );
  }

  return baseUrl;
}

export async function POST(request: Request) {
  // 1. Reject untrusted requests before rate limiting, parsing the body,
  // or looking up an account.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // 2. Apply the IP limiter before parsing the body or looking up an
  // account, so the endpoint itself is protected when a trusted
  // client IP source is available.
  try {
    const clientIp = getClientIp(request);

    if (clientIp) {
      const ipLimit = await consumeRateLimit({
        scope: "password-reset:request:ip",
        identifier: clientIp,
        limit: MAX_REQUESTS_PER_IP,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });

      if (!ipLimit.allowed) {
        return rateLimitedGenericResponse(
          ipLimit.retryAfterSeconds,
        );
      }
    }
  } catch (error) {
    console.error(
      "Password reset IP rate limiting failed.",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        message: "Password reset is temporarily unavailable.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // 3. Require JSON and enforce the shared body-size limit.
  // The parser consumes the body, so do not call request.json() again.
  const bodyResult = await parseJsonRequestBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const body: unknown = bodyResult.body;

  if (!isObject(body) || typeof body.email !== "string") {
    return NextResponse.json(
      {
        status: "error",
        message: "A valid email address is required.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const email = body.email.trim().toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: "A valid email address is required.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const baseUrl = getPasswordResetBaseUrl();

    let emailPayload: ResetEmailPayload | null = null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `SELECT
           id,
           email,
           password_hash,
           status
         FROM public.users
         WHERE LOWER(email) = $1
         ORDER BY id
         LIMIT 1
         FOR UPDATE`,
        [email],
      );

      const user = userResult.rows[0];

      // Only existing, active accounts with a password can request
      // this flow. Never reactivate suspended or deactivated users.
      if (
        !user ||
        user.status !== "ACTIVE" ||
        typeof user.email !== "string" ||
        typeof user.password_hash !== "string" ||
        !user.password_hash
      ) {
        await client.query("ROLLBACK");
        return genericResponse();
      }

      // Expire old pending tokens before applying the account limit.
      await client.query(
        `UPDATE public.password_reset_tokens
         SET status = 'EXPIRED',
             expired_at = GREATEST(expires_at, NOW()),
             updated_at = NOW()
         WHERE user_id = $1
           AND status = 'PENDING'
           AND expires_at <= NOW()`,
        [user.id],
      );

      // Serialize requests for the same account via the user-row lock.
      const rateLimitResult = await client.query(
        `SELECT COUNT(*)::int AS request_count
         FROM public.password_reset_tokens
         WHERE user_id = $1
           AND created_at >=
             NOW() - ($2::int * INTERVAL '1 minute')`,
        [user.id, RATE_LIMIT_WINDOW_MINUTES],
      );

      const requestCount = Number(
        rateLimitResult.rows[0]?.request_count ?? 0,
      );

      if (requestCount >= MAX_REQUESTS_PER_ACCOUNT) {
        await client.query("COMMIT");
        return genericResponse();
      }

      // A user can have at most one pending reset token.
      await client.query(
        `UPDATE public.password_reset_tokens
         SET status = 'REVOKED',
             revoked_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1
           AND status = 'PENDING'`,
        [user.id],
      );

      // Persist only the SHA-256 hash, never the raw token.
      const rawToken = randomBytes(32).toString("base64url");

      const tokenHash = createHash("sha256")
        .update(rawToken, "utf8")
        .digest("hex");

      const tokenResult = await client.query(
        `INSERT INTO public.password_reset_tokens (
           user_id,
           token_hash,
           status,
           expires_at
         )
         VALUES (
           $1,
           $2,
           'PENDING',
           NOW() + INTERVAL '30 minutes'
         )
         RETURNING expires_at`,
        [user.id, tokenHash],
      );

      const expiresAt = new Date(
        tokenResult.rows[0].expires_at,
      );

      // The reset experience lives on the existing login page.
      const resetUrl = new URL("/", baseUrl.origin);
      resetUrl.searchParams.set("token", rawToken);

      await client.query("COMMIT");

      emailPayload = {
        email: user.email,
        resetUrl: resetUrl.toString(),
        expiresAt,
        tokenHash,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error(
          "Password reset transaction rollback failed.",
        );
      }

      throw error;
    } finally {
      client.release();
    }

    if (emailPayload) {
      try {
        await sendPasswordResetEmail({
          to: emailPayload.email,
          resetUrl: emailPayload.resetUrl,
          expiresAt: emailPayload.expiresAt,
        });
      } catch {
        // Revoke the token if the email could not be sent.
        // Never log the raw token or complete reset URL.
        console.error(
          "Password reset email delivery failed.",
        );

        try {
          await pool.query(
            `UPDATE public.password_reset_tokens
             SET status = 'REVOKED',
                 revoked_at = NOW(),
                 updated_at = NOW()
             WHERE token_hash = $1
               AND status = 'PENDING'`,
            [emailPayload.tokenHash],
          );
        } catch {
          console.error(
            "Failed to revoke a reset token after email delivery failure.",
          );
        }
      }
    }

    // Do not reveal whether the email belongs to an account.
    return genericResponse();
  } catch (error) {
    console.error(
      "Password reset request processing failed:",
      error,
    );

    return NextResponse.json(
      {
        status: "error",
        message: "Password reset is temporarily unavailable.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}