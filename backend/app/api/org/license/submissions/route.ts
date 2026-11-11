import { connection, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getOrganizationAdmin } from "../../../../../lib/auth";
import { pool } from "../../../../../lib/db";
import { readUploadedImage } from "../../../../../lib/image-upload";
import { consumeRateLimit } from "../../../../../lib/rate-limit";
import { validateSameOriginRequest } from "../../../../../lib/request-security";

const MAX_PROOF_IMAGE_BYTES = 5 * 1024 * 1024;
const PAYMENT_RATE_LIMIT = 5;
const PAYMENT_RATE_WINDOW_MS = 60 * 60 * 1000;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { status: "error", message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function parsePaymentAmount(value: string | null): string | null {
  if (!value || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Normalize to the database numeric(14,2) precision without using
  // floating-point arithmetic for the value sent to PostgreSQL.
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function parseTransactionReference(value: string | null): string | null | false {
  if (value === null || value.trim() === "") return null;
  const normalized = value.trim();
  if (
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return false;
  }
  return normalized;
}

/**
 * POST /api/org/license/submissions
 *
 * Accepts one payment-proof image in multipart field `proofImage`.
 * Payment metadata is sent in headers:
 *   X-Payment-Amount: positive decimal, up to 2 fractional digits
 *   X-Payment-Currency: ISO-style three-letter currency code
 *   X-Transaction-Reference: optional, maximum 120 characters
 *
 * Organization and submitter identities are always derived from the verified
 * Organization Admin session. The uploaded bytes remain private in PostgreSQL.
 */
export async function POST(request: Request) {
  await connection();

  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    // Payment and renewal must remain available before setup completion and
    // while the subscription is inactive or expired.
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) {
      return jsonError("Authentication required", 401);
    }

    const rateLimit = await consumeRateLimit({
      scope: "org-payment-submit",
      identifier: admin.id,
      limit: PAYMENT_RATE_LIMIT,
      windowMs: PAYMENT_RATE_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          status: "error",
          message: "Too many payment submissions. Please try again later.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const amount = parsePaymentAmount(request.headers.get("x-payment-amount"));
    if (!amount) {
      return jsonError(
        "Enter a valid payment amount greater than zero, with no more than two decimal places.",
        400,
      );
    }

    const currency = request.headers.get("x-payment-currency")?.trim() ?? "";
    if (!/^[A-Z]{3}$/.test(currency)) {
      return jsonError("Provide a three-letter uppercase payment currency code.", 400);
    }

    const transactionReference = parseTransactionReference(
      request.headers.get("x-transaction-reference"),
    );
    if (transactionReference === false) {
      return jsonError("Transaction reference must be 120 characters or fewer.", 400);
    }

    const uploadedImage = await readUploadedImage(
      request,
      "proofImage",
      MAX_PROOF_IMAGE_BYTES,
    );
    if (!uploadedImage.ok) {
      return jsonError(uploadedImage.message, uploadedImage.status);
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize submissions for this tenant. The partial unique index remains
    // the final concurrency guard if another writer does not take this lock.
    const licenseResult = await client.query<{ id: string }>(
      `SELECT id
       FROM public.organization_licenses
       WHERE organization_id = $1::uuid
       FOR UPDATE`,
      [admin.organizationId],
    );

    if (licenseResult.rowCount !== 1) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonError(
        "Your organization license record is not available. Please contact support.",
        409,
      );
    }

    const pendingResult = await client.query<{ id: string }>(
      `SELECT id
       FROM public.organization_payment_submissions
       WHERE organization_id = $1::uuid
         AND status = 'PENDING_REVIEW'
       LIMIT 1`,
      [admin.organizationId],
    );

    if (pendingResult.rowCount > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonError(
        "A payment is already awaiting review. Wait for its decision before submitting another proof.",
        409,
      );
    }

    const paymentResult = await client.query<{ id: string; created_at: Date | string }>(
      `INSERT INTO public.organization_payment_submissions (
         organization_id,
         submitted_by_user_id,
         amount,
         currency_code,
         transaction_reference,
         proof_image,
         proof_image_mime_type,
         status
       )
       VALUES (
         $1::uuid,
         $2::uuid,
         $3::numeric(14, 2),
         $4,
         $5,
         $6::bytea,
         $7,
         'PENDING_REVIEW'
       )
       RETURNING id::text AS id, created_at`,
      [
        admin.organizationId,
        admin.id,
        amount,
        currency,
        transactionReference,
        uploadedImage.bytes,
        uploadedImage.mimeType,
      ],
    );

    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new Error("Payment submission insert returned no row.");
    }

    // Keep the submission and its audit event atomic. Never include proof
    // bytes or other image contents in audit metadata.
    await client.query(
      `INSERT INTO public.platform_audit_logs (
         actor_user_id,
         actor_email,
         action_key,
         target_type,
         target_id,
         organization_id,
         reason,
         before_state,
         after_state,
         metadata
       )
       VALUES (
         $1::uuid,
         $2,
         'organization.payment.submit',
         'ORGANIZATION_PAYMENT_SUBMISSION',
         $3::uuid,
         $4::uuid,
         'Payment proof submitted for Super Admin review',
         $5::jsonb,
         $6::jsonb,
         $7::jsonb
       )`,
      [
        admin.id,
        admin.email,
        payment.id,
        admin.organizationId,
        JSON.stringify({ exists: false }),
        JSON.stringify({ status: "PENDING_REVIEW" }),
        JSON.stringify({
          amount,
          currency,
          transactionReferenceProvided: transactionReference !== null,
          proofMimeType: uploadedImage.mimeType,
          proofSizeBytes: uploadedImage.bytes.length,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        status: "ok",
        message: "Payment proof submitted successfully and is awaiting review.",
        payment: {
          id: payment.id,
          amount,
          currency,
          transactionReference,
          proofMimeType: uploadedImage.mimeType,
          status: "PENDING_REVIEW",
          createdAt:
            payment.created_at instanceof Date
              ? payment.created_at.toISOString()
              : new Date(payment.created_at).toISOString(),
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Organization payment submission rollback error:", rollbackError);
      }
    }

    // The database's partial unique index is the authoritative guard against
    // concurrent pending submissions. Convert its conflict into a safe 409.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return jsonError(
        "A payment is already awaiting review. Wait for its decision before submitting another proof.",
        409,
      );
    }

    console.error("Organization payment submission error:", error);
    return jsonError("Unable to submit payment proof. Please try again later.", 500);
  } finally {
    client?.release();
  }
}
