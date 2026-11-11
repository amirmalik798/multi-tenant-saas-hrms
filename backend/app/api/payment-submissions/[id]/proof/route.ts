import { connection, NextResponse } from "next/server";

import { getOrganizationAdmin, getPlatformSuperAdmin } from "../../../../../lib/auth";
import { pool } from "../../../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_PROOF_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function errorResponse(message: string, status: number): Response {
  return NextResponse.json(
    { status: "error", message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    },
  );
}

/**
 * GET /api/payment-submissions/:id/proof
 *
 * Returns a private payment-proof image to either an authenticated Platform
 * Super Admin or the Organization Admin belonging to the submission's tenant.
 * Tenant identity is always taken from the verified session, never the URL.
 */
export async function GET(_request: Request, context: RouteContext) {
  await connection();

  try {
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return errorResponse("Invalid payment submission ID.", 400);
    }

    // Platform access is checked first. If it is not a valid, unambiguous
    // platform session, only the owning Organization Admin may retrieve it.
    const platformAdmin = await getPlatformSuperAdmin();
    const organizationAdmin = platformAdmin
      ? null
      : await getOrganizationAdmin({ allowIncompleteSetup: true });

    if (!platformAdmin && !organizationAdmin) {
      return errorResponse("Authentication required.", 401);
    }

    const result = await pool.query<{
      proof_image: Buffer | null;
      proof_image_mime_type: string | null;
    }>(
      `SELECT
         proof_image,
         proof_image_mime_type
       FROM public.organization_payment_submissions
       WHERE id = $1::uuid
         AND (
           $2::boolean = TRUE
           OR organization_id = $3::uuid
         )
       LIMIT 1`,
      [
        id,
        Boolean(platformAdmin),
        organizationAdmin?.organizationId ?? null,
      ],
    );

    const submission = result.rows[0];

    // Return the same response for a missing ID and another tenant's ID to
    // avoid disclosing whether a payment submission exists across tenants.
    if (!submission?.proof_image || !submission.proof_image_mime_type) {
      return errorResponse("Payment proof not found.", 404);
    }

    if (
      !Buffer.isBuffer(submission.proof_image) ||
      submission.proof_image.length === 0 ||
      submission.proof_image.length > 5 * 1024 * 1024 ||
      !ALLOWED_PROOF_MIME_TYPES.has(submission.proof_image_mime_type)
    ) {
      console.error("Stored organization payment proof failed integrity checks.", {
        submissionId: id,
      });
      return errorResponse("Payment proof is unavailable.", 500);
    }

    return new Response(new Uint8Array(submission.proof_image), {
      status: 200,
      headers: {
        "Content-Type": submission.proof_image_mime_type,
        "Content-Length": String(submission.proof_image.length),
        "Content-Disposition": 'inline; filename="payment-proof"',
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    console.error("Failed to retrieve organization payment proof:", error);
    return errorResponse("Unable to retrieve payment proof. Please try again later.", 500);
  }
}
