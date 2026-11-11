import { createHmac } from "node:crypto";

import { pool } from "./db";

const MIN_WINDOW_MS = 1_000;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_ATTEMPTS = 1_000_000;
const MAX_IDENTIFIER_BYTES = 1_024;

const DEFAULT_CLEANUP_BATCH_SIZE = 500;
const MAX_CLEANUP_BATCH_SIZE = 5_000;

export type ConsumeRateLimitOptions = {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
};

type RateLimitRow = {
  attempt_count: number;
  window_ends_at: Date | string;
};

function normalizeScope(scope: string): string {
  if (typeof scope !== "string") {
    throw new TypeError("Rate-limit scope must be a string.");
  }

  const normalized = scope.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9:_-]{0,63}$/.test(normalized)) {
    throw new RangeError("Invalid rate-limit scope.");
  }

  return normalized;
}

function normalizeIdentifier(identifier: string): string {
  if (typeof identifier !== "string") {
    throw new TypeError("Rate-limit identifier must be a string.");
  }

  const normalized = identifier.trim().toLowerCase();

  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > MAX_IDENTIFIER_BYTES
  ) {
    throw new RangeError("Invalid rate-limit identifier.");
  }

  return normalized;
}

function getRateLimitKeyHash(
  scope: string,
  identifier: string,
): string {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;

  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error(
      "RATE_LIMIT_HMAC_SECRET must contain at least 32 bytes.",
    );
  }

  return createHmac("sha256", secret)
    .update(`${scope}\u0000${identifier}`, "utf8")
    .digest("hex");
}

function normalizeOptions(
  options: ConsumeRateLimitOptions,
): ConsumeRateLimitOptions {
  if (
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > MAX_ATTEMPTS
  ) {
    throw new RangeError("Invalid rate-limit attempt limit.");
  }

  if (
    !Number.isSafeInteger(options.windowMs) ||
    options.windowMs < MIN_WINDOW_MS ||
    options.windowMs > MAX_WINDOW_MS
  ) {
    throw new RangeError("Invalid rate-limit window.");
  }

  return {
    scope: normalizeScope(options.scope),
    identifier: normalizeIdentifier(options.identifier),
    limit: options.limit,
    windowMs: options.windowMs,
  };
}

/**
 * Emits one structured event when a bucket first crosses its limit.
 * No identifiers, emails, IP addresses, tokens, or key hashes are logged.
 */
function logRateLimitExceeded(
  options: ConsumeRateLimitOptions,
  retryAfterSeconds: number,
): void {
  console.warn(
    JSON.stringify({
      event: "auth_rate_limit_exceeded",
      scope: options.scope,
      limit: options.limit,
      windowMs: options.windowMs,
      retryAfterSeconds,
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Atomically records one attempt in a fixed time window.
 *
 * Counters are bounded globally at MAX_ATTEMPTS. Logging happens
 * exactly when a bucket first crosses its configured limit.
 *
 * The same scope must always use a consistent limit and window.
 */
export async function consumeRateLimit(
  input: ConsumeRateLimitOptions,
): Promise<RateLimitDecision> {
  const options = normalizeOptions(input);

  const keyHash = getRateLimitKeyHash(
    options.scope,
    options.identifier,
  );

  const result = await pool.query<RateLimitRow>(
    `INSERT INTO public.auth_rate_limits AS current_limit (
       scope,
       key_hash,
       window_started_at,
       attempt_count,
       window_ends_at
     )
     VALUES (
       $1,
       $2,
       NOW(),
       1,
       NOW() + (
         $3::double precision * INTERVAL '1 millisecond'
       )
     )
     ON CONFLICT (scope, key_hash)
     DO UPDATE SET
       window_started_at = CASE
         WHEN current_limit.window_ends_at <= NOW()
           THEN NOW()
         ELSE current_limit.window_started_at
       END,
       attempt_count = CASE
         WHEN current_limit.window_ends_at <= NOW()
           THEN 1
         ELSE LEAST(
           current_limit.attempt_count + 1,
           $4::integer
         )
       END,
       window_ends_at = CASE
         WHEN current_limit.window_ends_at <= NOW()
           THEN NOW() + (
             $3::double precision * INTERVAL '1 millisecond'
           )
         ELSE current_limit.window_ends_at
       END,
       updated_at = NOW()
     RETURNING
       attempt_count,
       window_ends_at`,
    [
      options.scope,
      keyHash,
      options.windowMs,
      MAX_ATTEMPTS,
    ],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(
      "Rate-limit operation did not return a counter.",
    );
  }

  const attemptCount = Number(row.attempt_count);

  const resetAt =
    row.window_ends_at instanceof Date
      ? new Date(row.window_ends_at.getTime())
      : new Date(row.window_ends_at);

  if (
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1 ||
    !Number.isFinite(resetAt.getTime())
  ) {
    throw new Error(
      "Rate-limit storage returned invalid data.",
    );
  }

  const allowed = attemptCount <= options.limit;

  const remaining = Math.max(
    0,
    options.limit - attemptCount,
  );

  const retryAfterSeconds = allowed
    ? 0
    : Math.max(
        0,
        Math.ceil(
          (resetAt.getTime() - Date.now()) / 1_000,
        ),
      );

  if (!allowed && attemptCount === options.limit + 1) {
    logRateLimitExceeded(options, retryAfterSeconds);
  }

  return {
    allowed,
    limit: options.limit,
    remaining,
    retryAfterSeconds,
    resetAt,
  };
}

/**
 * Clears a particular bucket only when the calling workflow
 * intentionally resets that counter.
 */
export async function clearRateLimit(
  scope: string,
  identifier: string,
): Promise<void> {
  const normalizedScope = normalizeScope(scope);
  const normalizedIdentifier =
    normalizeIdentifier(identifier);

  const keyHash = getRateLimitKeyHash(
    normalizedScope,
    normalizedIdentifier,
  );

  await pool.query(
    `DELETE FROM public.auth_rate_limits
     WHERE scope = $1
       AND key_hash = $2`,
    [normalizedScope, keyHash],
  );
}

/**
 * Removes one bounded batch of expired rate-limit buckets.
 * Repeat from a trusted maintenance job until fewer than batchSize
 * rows are deleted. This function is not automatically scheduled.
 */
export async function cleanupExpiredRateLimitRecords(
  batchSize = DEFAULT_CLEANUP_BATCH_SIZE,
): Promise<number> {
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_CLEANUP_BATCH_SIZE
  ) {
    throw new RangeError(
      `Cleanup batch size must be between 1 and ${MAX_CLEANUP_BATCH_SIZE}.`,
    );
  }

  const result = await pool.query(
    `WITH expired_records AS (
       SELECT ctid
       FROM public.auth_rate_limits
       WHERE window_ends_at <= NOW()
       ORDER BY window_ends_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     DELETE FROM public.auth_rate_limits AS rate_limit
     USING expired_records
     WHERE rate_limit.ctid = expired_records.ctid`,
    [batchSize],
  );

  const deletedRecords = result.rowCount ?? 0;

  if (deletedRecords > 0) {
    console.info(
      JSON.stringify({
        event: "auth_rate_limit_cleanup_completed",
        deletedRecords,
        batchSize,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  return deletedRecords;
}