import { connection, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { pool } from "../../../lib/db";
import { getPlatformSuperAdmin } from "../../../lib/auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Check whether an organization slug is available.
 * The current organization can be excluded when editing.
 *
 * Only authenticated Platform Super Admins may use this endpoint.
 */
export async function GET(request: Request) {
  // This route reads session cookies and database state.
  // Defer execution until an incoming request.
  await connection();

  try {
    const admin = await getPlatformSuperAdmin();

    if (!admin) {
      return NextResponse.json(
        {
          status: "error",
          message: "Authentication required",
        },
        { status: 401 },
      );
    }

    const url = new URL(request.url);

    const slug = (url.searchParams.get("slug") ?? "")
      .trim()
      .toLowerCase();

    const excludeOrganizationId = (
      url.searchParams.get("excludeOrganizationId") ?? ""
    ).trim();

    if (slug.length === 0 || slug.length > 80 || !SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid organization slug",
        },
        { status: 400 },
      );
    }

    if (!UUID_PATTERN.test(excludeOrganizationId)) {
      return NextResponse.json(
        {
          status: "error",
          message: "A valid organization ID is required",
        },
        { status: 400 },
      );
    }

    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM organizations
         WHERE LOWER(slug) = $1
           AND id <> $2::uuid
       ) AS taken`,
      [slug, excludeOrganizationId],
    );

    return NextResponse.json({
      status: "ok",
      available: !Boolean(result.rows[0]?.taken),
    });
  } catch (error) {
    unstable_rethrow(error);

    console.error("Organization slug availability check failed:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Could not verify organization slug availability",
      },
      { status: 500 },
    );
  }
}