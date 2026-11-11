import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import {
  getNewPasswordValidationError,
  hashNewPassword,
} from "../../../../lib/password";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

const INVALID_TOKEN_MESSAGE =
  "This password reset link is invalid or expired. Request a new one.";

const MAX_ATTEMPTS_PER_TOKEN = 10;
const MAX_ATTEMPTS_PER_IP = 30;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function invalidTokenResponse() {
  return NextResponse.json(
    {
      status: "error",
      message: INVALID_TOKEN_MESSAGE,
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function rateLimitedResponse(
  retryAfterSeconds: number,
) {
  return NextResponse.json(
    {
      status: "error",
      message:
        "Too many attempts. Please wait before trying again, or request a new password reset link.",
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
 * Read an IP address only from a configured trusted proxy header.
 *
 * The proxy must overwrite the header on incoming requests.
 * Never configure this to a header clients can freely control.
 *
 * During local development, the IP limit is skipped when no
 * trusted header is configured. The token-based limit still applies.
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

  // Accept exactly one IP, not a forwarding chain.
  if (!candidate || candidate.includes(",")) {
    return null;
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

export async function POST(request: Request) {
  // 1. Reject untrusted requests before rate limiting, parsing the body,
  // validating tokens, or accessing the database.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // 2. Apply IP-based protection before parsing the body, where a
  // trusted client-IP source is available.
  try {
    const clientIp = getClientIp(request);

    if (clientIp) {
      const ipLimit = await consumeRateLimit({
        scope: "password-reset:complete:ip",
        identifier: clientIp,
        limit: MAX_ATTEMPTS_PER_IP,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });

      if (!ipLimit.allowed) {
        return rateLimitedResponse(
          ipLimit.retryAfterSeconds,
        );
      }
    }
  } catch {
    console.error(
      "Password reset completion IP rate limiting failed.",
    );

    return NextResponse.json(
      {
        status: "error",
        message:
          "Password reset is temporarily unavailable.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // 3. Enforce JSON content type and the shared 64 KiB body-size limit.
  // The parser consumes the request body; do not call request.json() again.
  const bodyResult = await parseJsonRequestBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const body: unknown = bodyResult.body;

  if (
    !isObject(body) ||
    typeof body.token !== "string" ||
    typeof body.password !== "string" ||
    typeof body.confirmPassword !== "string"
  ) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Token, password, and password confirmation are required.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const { token, password, confirmPassword } = body;

  // A 32-byte base64url token has 43 characters and no padding.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return invalidTokenResponse();
  }

  // Hash the token before using it as a rate-limit identifier.
  // The shared rate-limit helper HMACs the identifier before storing it.
  const tokenHash = createHash("sha256")
    .update(token, "utf8")
    .digest("hex");

  try {
    const tokenLimit = await consumeRateLimit({
      scope: "password-reset:complete:token",
      identifier: tokenHash,
      limit: MAX_ATTEMPTS_PER_TOKEN,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });

    if (!tokenLimit.allowed) {
      return rateLimitedResponse(
        tokenLimit.retryAfterSeconds,
      );
    }
  } catch {
    console.error(
      "Password reset completion token rate limiting failed.",
    );

    return NextResponse.json(
      {
        status: "error",
        message:
          "Password reset is temporarily unavailable.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      {
        status: "error",
        message: "The passwords do not match.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const passwordValidationError =
    getNewPasswordValidationError(password);

  if (passwordValidationError) {
    return NextResponse.json(
      {
        status: "error",
        message: passwordValidationError,
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the token and account together so concurrent reset
    // attempts cannot consume the same token more than once.
    const tokenResult = await client.query(
      `SELECT
         prt.id AS reset_token_id,
         prt.user_id,
         prt.status AS token_status,
         prt.expires_at,
         u.status AS user_status
       FROM public.password_reset_tokens AS prt
       JOIN public.users AS u
         ON u.id = prt.user_id
       WHERE prt.token_hash = $1
       FOR UPDATE OF prt, u`,
      [tokenHash],
    );

    const resetRecord = tokenResult.rows[0];

    if (
      !resetRecord ||
      resetRecord.token_status !== "PENDING"
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return invalidTokenResponse();
    }

    const expiresAt = new Date(resetRecord.expires_at);

    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      await client.query(
        `UPDATE public.password_reset_tokens
         SET status = 'EXPIRED',
             expired_at = GREATEST(expires_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
           AND status = 'PENDING'`,
        [resetRecord.reset_token_id],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return invalidTokenResponse();
    }

    // A password reset must never reactivate an account.
    if (resetRecord.user_status !== "ACTIVE") {
      await client.query(
        `UPDATE public.password_reset_tokens
         SET status = 'REVOKED',
             revoked_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND status = 'PENDING'`,
        [resetRecord.reset_token_id],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return invalidTokenResponse();
    }

    const passwordHash = await hashNewPassword(password);

    await client.query(
      `UPDATE public.users
       SET password_hash = $1,
           password_changed_at = NOW(),
           session_version = session_version + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, resetRecord.user_id],
    );

    // Consume the successfully used token.
    await client.query(
      `UPDATE public.password_reset_tokens
       SET status = 'CONSUMED',
           consumed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND status = 'PENDING'`,
      [resetRecord.reset_token_id],
    );

    // Revoke any other pending token for the account.
    await client.query(
      `UPDATE public.password_reset_tokens
       SET status = 'REVOKED',
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND status = 'PENDING'`,
      [resetRecord.user_id],
    );

    // Expire any remaining pending tokens whose expiry has passed.
    await client.query(
      `UPDATE public.password_reset_tokens
       SET status = 'EXPIRED',
           expired_at = GREATEST(expires_at, NOW()),
           updated_at = NOW()
       WHERE user_id = $1
         AND status = 'PENDING'
         AND expires_at <= NOW()`,
      [resetRecord.user_id],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        status: "ok",
        message:
          "Your password has been reset. Please sign in with your new password.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error(
          "Password reset transaction rollback failed.",
        );
      }
    }

    console.error("Password reset completion failed.");

    return NextResponse.json(
      {
        status: "error",
        message:
          "Password reset is temporarily unavailable.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } finally {
    client.release();
  }
}