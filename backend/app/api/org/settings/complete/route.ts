import { NextResponse } from "next/server";

import { pool } from "../../../../../lib/db";
import { getOrganizationAdmin } from "../../../../../lib/auth";
import { validateSameOriginRequest } from "../../../../../lib/request-security";

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) {
      return NextResponse.json(
        { message: "Authentication required" },
        { status: 401 },
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // The tenant is always resolved from the authenticated session.
      // Lock the row while validating and recording the administrator's review.
      const result = await client.query(
        `SELECT
           organization_id,
           time_zone,
           locale,
           currency_code,
           date_format,
           working_days,
           country_code
         FROM public.organization_settings
         WHERE organization_id = $1
         FOR UPDATE`,
        [admin.organizationId],
      );

      const settings = result.rows[0] as
        | {
            organization_id: string;
            time_zone: string | null;
            locale: string | null;
            currency_code: string | null;
            date_format: string | null;
            working_days: number[] | null;
            country_code: string | null;
          }
        | undefined;

      if (!settings) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { message: "Save the organization settings before completing setup." },
          { status: 400 },
        );
      }

      const missing: string[] = [];
      if (!settings.time_zone?.trim()) missing.push("time zone");
      if (!settings.locale?.trim()) missing.push("locale");
      if (!settings.currency_code?.trim()) missing.push("currency");
      if (!settings.date_format?.trim()) missing.push("date format");
      if (!Array.isArray(settings.working_days) || settings.working_days.length === 0) {
        missing.push("at least one working day");
      }
      if (!settings.country_code?.trim()) missing.push("organization country");

      if (missing.length > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            message: `Complete these organization settings first: ${missing.join(", ")}.`,
            missing,
          },
          { status: 400 },
        );
      }

      const updated = await client.query(
        `UPDATE public.organization_settings
         SET setup_completed_at = COALESCE(setup_completed_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1
         RETURNING setup_completed_at`,
        [admin.organizationId],
      );

      await client.query("COMMIT");
      return NextResponse.json({
        status: "ok",
        message: "Organization setup reviewed and completed.",
        setupCompletedAt: updated.rows[0]?.setup_completed_at ?? null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to complete organization setup:", error);
    return NextResponse.json(
      { message: "Unable to complete organization setup right now." },
      { status: 500 },
    );
  }
}
