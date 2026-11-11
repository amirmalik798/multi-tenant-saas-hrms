import { connection, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getOrganizationAdmin } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { getOrganizationLicenseAccess } from "../../../../lib/licensing";

type PaymentHistoryRow = {
  id: string;
  amount: string;
  currencyCode: string;
  transactionReference: string | null;
  proofImageMimeType: string;
  proofImageFilename: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedAt: Date | string | null;
  createdAt: Date | string;
};

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Database returned an invalid payment timestamp");
  }

  return parsed.toISOString();
}

/**
 * GET /api/org/license
 *
 * Returns licensing information and a bounded payment history for the
 * authenticated Organization Admin's own organization. Tenant identity is
 * derived exclusively from the verified server session. Payment proof bytes
 * are deliberately excluded and must be retrieved through a separately
 * authorized proof endpoint.
 */
export async function GET() {
  // Force request-time execution outside the handler try/catch so Next.js
  // does not attempt to prerender this authenticated endpoint.
  await connection();

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    // Licensing must remain accessible even when organization setup has not
    // yet been completed, otherwise an unpaid organization could be locked
    // out of the workflow needed to activate its license.
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });

    if (!admin) {
      return NextResponse.json(
        { status: "error", message: "Authentication required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    client = await pool.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;

    const license = await getOrganizationLicenseAccess(
      admin.organizationId,
      client,
    );

    if (!license) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return NextResponse.json(
        { status: "error", message: "Organization could not be found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const paymentResult = await client.query<PaymentHistoryRow>(
      `SELECT
         p.id::text AS id,
         p.amount::text AS amount,
         BTRIM(p.currency_code) AS "currencyCode",
         p.transaction_reference AS "transactionReference",
         p.proof_image_mime_type AS "proofImageMimeType",
         p.proof_image_filename AS "proofImageFilename",
         p.status AS status,
         p.rejection_reason AS "rejectionReason",
         p.reviewed_at AS "reviewedAt",
         p.created_at AS "createdAt"
       FROM public.organization_payment_submissions AS p
       WHERE p.organization_id = $1::uuid
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 50`,
      [admin.organizationId],
    );

    const payments = paymentResult.rows.map((payment) => ({
      ...payment,
      createdAt: toIsoTimestamp(payment.createdAt),
      reviewedAt: toIsoTimestamp(payment.reviewedAt),
    }));

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        status: "ok",
        license: {
          status: license.status,
          activationSource: license.activationSource,
          startsAt: license.startsAt,
          expiresAt: license.expiresAt,
          remainingDays: license.remainingDays,
          canAccess: license.canAccess,
          restrictionReason: license.restrictionReason,
          databaseTime: license.databaseTime,
        },
        payments,
        paymentHistoryLimit: 50,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Organization license API rollback error:", rollbackError);
      }
    }

    console.error("Organization license API error:", error);
    return NextResponse.json(
      { status: "error", message: "Unable to load organization license information" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    client?.release();
  }
}
