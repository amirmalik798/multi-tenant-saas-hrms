import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const DEFAULT_JSON_BODY_LIMIT_BYTES = 64 * 1024;

type JsonBodyErrorStatus = 400 | 413 | 415;

export type JsonRequestBodyResult =
  | {
      ok: true;
      body: unknown;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function isAllowedConfiguredOrigin(value: string): string | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const isLocalHttpOrigin =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (
    (url.protocol !== "https:" && !isLocalHttpOrigin) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/"
  ) {
    return null;
  }

  return url.origin;
}

/**
 * Build an exact-origin allowlist from explicit configuration. APP_ORIGIN
 * remains the primary local/deployment origin; FRONTEND_URL is also trusted
 * because it is the public browser origin used for links. Additional exact
 * origins may be supplied as a comma-separated APP_ALLOWED_ORIGINS value.
 * No wildcard, request Host, or forwarded-host value is trusted here.
 */
function getAllowedConfiguredOrigins(): Set<string> | null {
  const configuredValues = [
    process.env.APP_ORIGIN?.trim(),
    process.env.FRONTEND_URL?.trim(),
    ...(process.env.APP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()),
  ].filter((value): value is string => Boolean(value));

  if (configuredValues.length === 0) return null;

  const allowedOrigins = new Set<string>();

  for (const value of configuredValues) {
    const origin = isAllowedConfiguredOrigin(value);
    if (!origin) return null;
    allowedOrigins.add(origin);
  }

  return allowedOrigins.size > 0 ? allowedOrigins : null;
}

function getRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.get("origin");

  if (originHeader !== null) {
    try {
      const originUrl = new URL(originHeader);

      if (
        originUrl.origin === "null" ||
        originUrl.username !== "" ||
        originUrl.password !== "" ||
        originUrl.pathname !== "/" ||
        originUrl.search !== "" ||
        originUrl.hash !== ""
      ) {
        return null;
      }

      return originUrl.origin;
    } catch {
      return null;
    }
  }

  // Some legitimate clients send Referer without Origin.
  // If Origin is present but invalid, do not fall back to Referer.
  const refererHeader = request.headers.get("referer");

  if (!refererHeader) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

function forbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      message: "Request origin is not allowed.",
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Protects state-changing requests with a configured, exact-origin
 * policy. Call this at the beginning of each unsafe API handler.
 *
 * GET, HEAD, and OPTIONS are not blocked by this helper.
 * State-changing cookie-authenticated routes must validate origin
 * before doing any work.
 */
export function validateSameOriginRequest(
  request: Request,
): NextResponse | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const allowedOrigins = getAllowedConfiguredOrigins();

  if (!allowedOrigins) {
    console.error(
      "Request origin protection is not configured: at least one of APP_ORIGIN, FRONTEND_URL, or APP_ALLOWED_ORIGINS must contain valid exact origins; every configured value must be an exact origin.",
    );

    return NextResponse.json(
      {
        status: "error",
        message: "Request security is not configured.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const fetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();

  // Requests that the browser identifies as cross-site or as
  // initiated outside a normal browsing context are rejected.
  if (fetchSite === "cross-site" || fetchSite === "none") {
    console.warn("Rejected state-changing request by Fetch Metadata policy.", {
      fetchSite,
    });
    return forbiddenResponse();
  }

  const requestOrigin = getRequestOrigin(request);

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    // Origin values are host-level metadata, not credentials. Logging this
    // small diagnostic makes reverse-proxy/demo-origin mismatches debuggable
    // without logging request bodies, passwords, cookies, or session tokens.
    console.warn("Rejected state-changing request due to origin mismatch.", {
      requestOrigin,
      allowedOrigins: [...allowedOrigins],
      fetchSite: fetchSite ?? null,
    });
    return forbiddenResponse();
  }

  return null;
}

function jsonBodyErrorResponse(
  status: JsonBodyErrorStatus,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Reads and parses a JSON request body with a byte limit.
 *
 * Validates Content-Type, checks Content-Length when supplied,
 * and independently enforces the limit while reading the body stream.
 *
 * The request body is consumed by this function. API handlers should
 * use the returned body instead of calling request.json() afterwards.
 */
export async function parseJsonRequestBody(
  request: Request,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<JsonRequestBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("The JSON request body limit must be a positive safe integer.");
  }

  // 1. Require a JSON media type.
  const contentType = request.headers.get("content-type");
  const mediaType = contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (mediaType !== "application/json") {
    return {
      ok: false,
      response: jsonBodyErrorResponse(
        415,
        "Content-Type must be application/json.",
      ),
    };
  }

  // 2. Reject a declared length that is invalid or too large.
  // The streamed-byte check below remains necessary because a request
  // may not include Content-Length.
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength.trim())) {
      return {
        ok: false,
        response: jsonBodyErrorResponse(
          400,
          "Invalid Content-Length header.",
        ),
      };
    }

    if (Number(contentLength) > maxBytes) {
      return {
        ok: false,
        response: jsonBodyErrorResponse(
          413,
          "Request body is too large.",
        ),
      };
    }
  }

  // 3. Read the stream while enforcing the actual byte limit.
  const bodyStream = request.body;

  if (!bodyStream) {
    return {
      ok: false,
      response: jsonBodyErrorResponse(
        400,
        "Invalid JSON request body.",
      ),
    };
  }

  const reader = bodyStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The request will still be rejected as oversized.
        }

        return {
          ok: false,
          response: jsonBodyErrorResponse(
            413,
            "Request body is too large.",
          ),
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: jsonBodyErrorResponse(
        400,
        "Unable to read JSON request body.",
      ),
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore a release error while finishing request processing.
    }
  }

  // 4. Combine the bounded chunks into one byte array.
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // 5. Reject invalid UTF-8 rather than silently replacing bad bytes.
  let decodedBody: string;

  try {
    decodedBody = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);
  } catch {
    return {
      ok: false,
      response: jsonBodyErrorResponse(
        400,
        "Request body must contain valid UTF-8 JSON.",
      ),
    };
  }

  // 6. Parse JSON, leaving endpoint-specific schema validation to
  // the route handler.
  try {
    return {
      ok: true,
      body: JSON.parse(decodedBody),
    };
  } catch {
    return {
      ok: false,
      response: jsonBodyErrorResponse(
        400,
        "Invalid JSON request body.",
      ),
    };
  }
}