import { connection, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getPlatformSuperAdmin } from "../../../../../lib/auth";
import { pool } from "../../../../../lib/db";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReviewDecision = "APPROVE" | "REJECT";

type PaymentRow = {
  id: string;
  organization_id: string;
  amount: string;
  currency_code: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  created_at: Date | string;
};

type LicenseRow = {
  id: string;
  status: "NOT_ACTIVATED" | "ACTIVE" | "EXPIRED";
  activation_source: "NONE" | "LEGACY_GRACE" | "PAYMENT";
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  last_approved_payment_id: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { status: "error", message },
    { status, headers: NO_STORE_HEADERS },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Database returned an invalid payment or license timestamp.");
  }
  return parsed.toISOString();
}

/**
 * PATCH /api/platform-payments/:id/review
 *
 * Body:
 *   { "decision": "APPROVE" }
 *   { "decision": "REJECT", "rejectionReason": "..." }
 *
 * Approval, license extension and audit logging are committed atomically.
 * Every review takes the organization-license lock before the payment-row
 * lock. This matches the lock order used by payment submission and avoids
 * introducing a payment/license lock-order deadlock.
 */
export async function PATCH(request: Request, context: RouteContext) {
  await connection();

  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request, 8 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (!isRecord(parsedBody.body)) {
    return jsonError("Invalid review request body.", 400);
  }

  const decisionValue = parsedBody.body.decision;
  if (decisionValue !== "APPROVE" && decisionValue !== "REJECT") {
    return jsonError("Decision must be APPROVE or REJECT.", 400);
  }
  const decision: ReviewDecision = decisionValue;

  let rejectionReason: string | null = null;
  if (decision === "REJECT") {
    if (typeof parsedBody.body.rejectionReason !== "string") {
      return jsonError("A rejection reason is required.", 400);
    }
    rejectionReason = parsedBody.body.rejectionReason.trim();
    if (rejectionReason.length < 1 || rejectionReason.length > 1000) {
      return jsonError("Rejection reason must be between 1 and 1000 characters.", 400);
    }
  } else if (
    parsedBody.body.rejectionReason !== undefined &&
    parsedBody.body.rejectionReason !== null &&
    parsedBody.body.rejectionReason !== ""
  ) {
    return jsonError("A rejection reason is only accepted when rejecting a payment.", 400);
  }

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    const admin = await getPlatformSuperAdmin();
    if (!admin) return jsonError("Authentication required.", 401);

    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return jsonError("Invalid payment submission ID.", 400);
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Resolve the tenant without taking the payment lock. The license row is
    // locked first to maintain the same lock order as the submission endpoint.
    const ownerResult = await client.query<{ organization_id: string }>(
      `SELECT organization_id::text AS organization_id
       FROM public.organization_payment_submissions
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );

    const organizationId = ownerResult.rows[0]?.organization_id;
    if (!organizationId) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonError("Payment submission not found.", 404);
    }

    const licenseLockResult = await client.query<LicenseRow>(
      `SELECT
         id::text AS id,
         status,
         activation_source,
         starts_at,
         expires_at,
         last_approved_payment_id::text AS last_approved_payment_id
       FROM public.organization_licenses
       WHERE organization_id = $1::uuid
       FOR UPDATE`,
      [organizationId],
    );

    const licenseBefore = licenseLockResult.rows[0];
    if (!licenseBefore) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonError(
        "The organization license record is missing. The payment cannot be reviewed until the license record is repaired.",
        409,
      );
    }

    const paymentLockResult = await client.query<PaymentRow>(
      `SELECT
         id::text AS id,
         organization_id::text AS organization_id,
         amount::text AS amount,
         BTRIM(currency_code) AS currency_code,
         status,
         rejection_reason,
         created_at
       FROM public.organization_payment_submissions
       WHERE id = $1::uuid
         AND organization_id = $2::uuid
       FOR UPDATE`,
      [id, organizationId],
    );

    const paymentBefore = paymentLockResult.rows[0];
    if (!paymentBefore) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonError("Payment submission not found.", 404);
    }

    if (paymentBefore.status !== "PENDING_REVIEW") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return jsonError(
        `This payment has already been ${paymentBefore.status.toLowerCase().replace("_", " ")}. Reviewed payments cannot be changed.`,
        409,
      );
    }

    const reviewedPaymentResult = await client.query<{
      id: string;
      reviewed_at: Date | string;
    }>(
      `UPDATE public.organization_payment_submissions
       SET status = $2,
           rejection_reason = $3,
           reviewed_by_user_id = $4::uuid,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND organization_id = $5::uuid
         AND status = 'PENDING_REVIEW'
       RETURNING id::text AS id, reviewed_at`,
      [
        id,
        decision === "APPROVE" ? "APPROVED" : "REJECTED",
        rejectionReason,
        admin.id,
        organizationId,
      ],
    );

    const reviewedPayment = reviewedPaymentResult.rows[0];
    if (!reviewedPayment) {
      throw new Error("Payment review update did not affect the expected pending submission.");
    }

    let licenseAfter: {
      status: "NOT_ACTIVATED" | "ACTIVE" | "EXPIRED";
      activation_source: "NONE" | "LEGACY_GRACE" | "PAYMENT";
      starts_at: Date | string | null;
      expires_at: Date | string | null;
      last_approved_payment_id: string | null;
    } = {
      status: licenseBefore.status,
      activation_source: licenseBefore.activation_source,
      starts_at: licenseBefore.starts_at,
      expires_at: licenseBefore.expires_at,
      last_approved_payment_id: licenseBefore.last_approved_payment_id,
    };

    if (decision === "APPROVE") {
      const activationResult = await client.query(
        `UPDATE public.organization_licenses
         SET status = 'ACTIVE',
             activation_source = 'PAYMENT',
             starts_at = CASE
               WHEN status = 'ACTIVE' AND expires_at > NOW() THEN starts_at
               ELSE NOW()
             END,
             expires_at = CASE
               WHEN status = 'ACTIVE' AND expires_at > NOW() THEN expires_at
               ELSE NOW()
             END + INTERVAL '30 days',
             last_approved_payment_id = $2::uuid,
             updated_at = NOW()
         WHERE organization_id = $1::uuid
         RETURNING
           status,
           activation_source,
           starts_at,
           expires_at,
           last_approved_payment_id::text AS last_approved_payment_id`,
        [organizationId, id],
      );

      const updatedLicense = activationResult.rows[0];
      if (!updatedLicense) {
        throw new Error("License activation update returned no row.");
      }
      licenseAfter = updatedLicense;
    }

    const actionKey =
      decision === "APPROVE"
        ? "organization.payment.approve"
        : "organization.payment.reject";

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
         $3,
         'ORGANIZATION_PAYMENT_SUBMISSION',
         $4::uuid,
         $5::uuid,
         $6,
         $7::jsonb,
         $8::jsonb,
         $9::jsonb
       )`,
      [
        admin.id,
        admin.email,
        actionKey,
        id,
        organizationId,
        rejectionReason,
        JSON.stringify({
          paymentStatus: paymentBefore.status,
          licenseStatus: licenseBefore.status,
          licenseActivationSource: licenseBefore.activation_source,
          licenseStartsAt: toIsoTimestamp(licenseBefore.starts_at),
          licenseExpiresAt: toIsoTimestamp(licenseBefore.expires_at),
          lastApprovedPaymentId: licenseBefore.last_approved_payment_id,
        }),
        JSON.stringify({
          paymentStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          rejectionReason,
          licenseStatus: licenseAfter.status,
          licenseActivationSource: licenseAfter.activation_source,
          licenseStartsAt: toIsoTimestamp(licenseAfter.starts_at),
          licenseExpiresAt: toIsoTimestamp(licenseAfter.expires_at),
          lastApprovedPaymentId: licenseAfter.last_approved_payment_id,
        }),
        JSON.stringify({
          organizationId,
          amount: paymentBefore.amount,
          currency: paymentBefore.currency_code,
          reviewedAt: toIsoTimestamp(reviewedPayment.reviewed_at),
          licenseDaysGranted: decision === "APPROVE" ? 30 : 0,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        status: "ok",
        message:
          decision === "APPROVE"
            ? "Payment approved. The organization license has been activated or extended by 30 days."
            : "Payment rejected. The organization has been notified through its payment history.",
        payment: {
          id,
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          rejectionReason,
          reviewedAt: toIsoTimestamp(reviewedPayment.reviewed_at),
        },
        license: {
          status: licenseAfter.status,
          activationSource: licenseAfter.activation_source,
          startsAt: toIsoTimestamp(licenseAfter.starts_at),
          expiresAt: toIsoTimestamp(licenseAfter.expires_at),
          lastApprovedPaymentId: licenseAfter.last_approved_payment_id,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Payment review rollback error:", rollbackError);
      }
    }

    console.error("Failed to review organization payment:", error);
    return jsonError("Unable to review this payment. No changes have been confirmed.", 500);
  } finally {
    client?.release();
  }
}
