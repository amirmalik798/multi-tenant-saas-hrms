import { isIP } from "node:net";

/**
 * Return the client IP only when the deployment explicitly names a trusted
 * reverse-proxy header that it overwrites with a single IP address.
 *
 * This limiter is an additional abuse-control layer. Password-reset requests
 * are also limited per account, and completion attempts are limited by the
 * hashed reset token. When no trusted header is configured, those stronger
 * workflow-specific limits remain active and the IP bucket is skipped.
 */
export function getTrustedClientIp(request: Request): string | null {
  const headerName = process.env.RATE_LIMIT_TRUSTED_IP_HEADER
    ?.trim()
    .toLowerCase();

  if (!headerName) {
    return null;
  }

  if (!/^[a-z0-9-]+$/.test(headerName)) {
    throw new Error(
      "RATE_LIMIT_TRUSTED_IP_HEADER must be a valid HTTP header name.",
    );
  }

  const candidate = request.headers.get(headerName)?.trim();

  // A comma indicates a forwarding chain. Do not guess which hop is trusted.
  if (!candidate || candidate.includes(",")) {
    return null;
  }

  return isIP(candidate) !== 0 ? candidate : null;
}
