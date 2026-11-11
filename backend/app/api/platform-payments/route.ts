import { connection, NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getPlatformSuperAdmin } from "../../../lib/auth";
import { pool } from "../../../lib/db";

const PAYMENT_STATUSES = new Set([
  "ALL",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]);

const SORT_ORDERS: Record<string, string> = {
  NEWEST: "p.created_at DESC, p.id DESC",
  OLDEST: "p.created_at ASC, p.id ASC",
  AMOUNT_HIGH: "p.amount DESC, p.created_at DESC, p.id DESC",
  AMOUNT_LOW: "p.amount ASC, p.created_at DESC, p.id DESC",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
};

type PaymentListRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  amount: string;
  currency: string;
  transactionReference: string | null;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  proofMimeType: string;
  proofFilename: string | null;
  proofSizeBytes: number;
  submittedAt: Date | string;
  submittedByEmail: string;
  reviewedAt: Date | string | null;
  reviewedByEmail: string | null;
  licenseStatus: "NOT_ACTIVATED" | "ACTIVE" | "EXPIRED" | null;
  licenseActivationSource: string | null;
  licenseStartsAt: Date | string | null;
  licenseExpiresAt: Date | string | null;
};

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Database returned an invalid payment timestamp");
  }
  return parsed.toISOString();
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { status: "error", message },
    { status, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/platform-payments
 *
 * Returns a paginated, searchable Super Admin payment-submission queue.
 * The endpoint never returns proof-image bytes; images are served by the
 * separately authenticated /api/payment-submissions/:id/proof endpoint.
 */
export async function GET(request: Request) {
  await connection();

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    const admin = await getPlatformSuperAdmin();
    if (!admin) {
      return jsonError("Authentication required.", 401);
    }

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get("page"), 1, 1_000_000);
    const pageSize = parsePositiveInteger(url.searchParams.get("pageSize"), 25, 100);
    const offset = (page - 1) * pageSize;
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 160);
    const requestedStatus = (url.searchParams.get("status") ?? "ALL")
      .trim()
      .toUpperCase();
    const status = PAYMENT_STATUSES.has(requestedStatus)
      ? requestedStatus
      : "ALL";
    const requestedSort = (url.searchParams.get("sort") ?? "NEWEST")
      .trim()
      .toUpperCase();
    const orderBy = SORT_ORDERS[requestedSort] ?? SORT_ORDERS.NEWEST;
    const searchPattern = `%${search}%`;

    client = await pool.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;

    const summaryResult = await client.query<{
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      organizationsWithPending: number;
    }>(
      `SELECT
         COUNT(*)::integer AS total,
         COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::integer AS pending,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::integer AS approved,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::integer AS rejected,
         COUNT(DISTINCT organization_id)
           FILTER (WHERE status = 'PENDING_REVIEW')::integer AS "organizationsWithPending"
       FROM public.organization_payment_submissions`,
    );

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total
       FROM public.organization_payment_submissions AS p
       JOIN public.organizations AS o
         ON o.id = p.organization_id
       JOIN public.users AS submitter
         ON submitter.id = p.submitted_by_user_id
        AND submitter.organization_id = p.organization_id
       WHERE ($1::text = 'ALL' OR p.status = $1::text)
         AND (
           $2::text = ''
           OR o.name ILIKE $3
           OR o.slug ILIKE $3
           OR COALESCE(o.contact_email, '') ILIKE $3
           OR COALESCE(p.transaction_reference, '') ILIKE $3
           OR submitter.email ILIKE $3
           OR p.id::text ILIKE $3
         )`,
      [status, search, searchPattern],
    );

    const listResult = await client.query<PaymentListRow>(
      `SELECT
         p.id::text AS id,
         p.organization_id::text AS "organizationId",
         o.name AS "organizationName",
         o.slug AS "organizationSlug",
         o.status AS "organizationStatus",
         p.amount::text AS amount,
         BTRIM(p.currency_code) AS currency,
         p.transaction_reference AS "transactionReference",
         p.status AS status,
         p.rejection_reason AS "rejectionReason",
         p.proof_image_mime_type AS "proofMimeType",
         p.proof_image_filename AS "proofFilename",
         octet_length(p.proof_image)::integer AS "proofSizeBytes",
         p.created_at AS "submittedAt",
         submitter.email AS "submittedByEmail",
         p.reviewed_at AS "reviewedAt",
         reviewer.email AS "reviewedByEmail",
         CASE
           WHEN l.id IS NULL THEN NULL
           WHEN l.status = 'ACTIVE' AND l.expires_at <= NOW() THEN 'EXPIRED'
           ELSE l.status
         END AS "licenseStatus",
         l.activation_source AS "licenseActivationSource",
         l.starts_at AS "licenseStartsAt",
         l.expires_at AS "licenseExpiresAt"
       FROM public.organization_payment_submissions AS p
       JOIN public.organizations AS o
         ON o.id = p.organization_id
       JOIN public.users AS submitter
         ON submitter.id = p.submitted_by_user_id
        AND submitter.organization_id = p.organization_id
       LEFT JOIN public.users AS reviewer
         ON reviewer.id = p.reviewed_by_user_id
       LEFT JOIN public.organization_licenses AS l
         ON l.organization_id = p.organization_id
       WHERE ($1::text = 'ALL' OR p.status = $1::text)
         AND (
           $2::text = ''
           OR o.name ILIKE $3
           OR o.slug ILIKE $3
           OR COALESCE(o.contact_email, '') ILIKE $3
           OR COALESCE(p.transaction_reference, '') ILIKE $3
           OR submitter.email ILIKE $3
           OR p.id::text ILIKE $3
         )
       ORDER BY ${orderBy}
       LIMIT $4 OFFSET $5`,
      [status, search, searchPattern, pageSize, offset],
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const summary = summaryResult.rows[0] ?? {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      organizationsWithPending: 0,
    };

    const payments = listResult.rows.map((payment) => ({
      ...payment,
      submittedAt: toIsoTimestamp(payment.submittedAt),
      reviewedAt: toIsoTimestamp(payment.reviewedAt),
      licenseStartsAt: toIsoTimestamp(payment.licenseStartsAt),
      licenseExpiresAt: toIsoTimestamp(payment.licenseExpiresAt),
    }));

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        status: "ok",
        payments,
        summary: {
          total: Number(summary.total),
          pending: Number(summary.pending),
          approved: Number(summary.approved),
          rejected: Number(summary.rejected),
          organizationsWithPending: Number(summary.organizationsWithPending),
        },
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
        filters: {
          status,
          search,
          sort: SORT_ORDERS[requestedSort] ? requestedSort : "NEWEST",
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Platform payments list rollback error:", rollbackError);
      }
    }

    console.error("Platform payments list error:", error);
    return jsonError("Unable to load payment submissions. Please try again later.", 500);
  } finally {
    client?.release();
  }
}
