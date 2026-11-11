import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { getOrganizationAdmin } from "../../../../lib/auth";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeField(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length > maxLength) return undefined;
  return normalized || null;
}

export async function GET() {
  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return jsonResponse({ message: "Authentication required." }, 401);

    const result = await pool.query(
      `SELECT
         u.id::text AS id,
         u.email,
         employee.first_name,
         employee.last_name,
         u.contact_phone,
         u.contact_country,
         u.contact_city
       FROM public.users u
       LEFT JOIN LATERAL (
         SELECT e.first_name, e.last_name
         FROM public.employees e
         WHERE e.organization_id = u.organization_id
           AND (
             e.id = u.employee_id
             OR LOWER(e.email) = LOWER(u.email)
           )
         ORDER BY CASE WHEN e.id = u.employee_id THEN 0 ELSE 1 END
         LIMIT 1
       ) employee ON TRUE
       WHERE u.id = $1::uuid
         AND u.organization_id = $2::uuid
         AND u.account_scope = 'ORGANIZATION'
         AND u.status = 'ACTIVE'
       LIMIT 1`,
      [admin.id, admin.organizationId],
    );
    const user = result.rows[0] as
      | {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          contact_phone: string | null;
          contact_country: string | null;
          contact_city: string | null;
        }
      | undefined;
    if (!user) return jsonResponse({ message: "Organization Admin account not found." }, 404);

    return jsonResponse({
      status: "ok",
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        contactPhone: user.contact_phone || "",
        country: user.contact_country || "",
        city: user.contact_city || "",
      },
    });
  } catch (error) {
    console.error("Failed to load Organization Admin profile:", error);
    return jsonResponse({ message: "Unable to load your profile right now." }, 500);
  }
}

export async function PATCH(request: Request) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });
    if (!admin) return jsonResponse({ message: "Authentication required." }, 401);

    const parsed = await parseJsonRequestBody(request, 8192);
    if (!parsed.ok) return parsed.response;
    if (
      typeof parsed.body !== "object" ||
      parsed.body === null ||
      Array.isArray(parsed.body)
    ) {
      return jsonResponse({ message: "Invalid profile data." }, 400);
    }

    const body = parsed.body as Record<string, unknown>;
    const phone = normalizeField(body.contactPhone, 50);
    const country = normalizeField(body.country, 100);
    const city = normalizeField(body.city, 100);

    if (phone === undefined || country === undefined || city === undefined) {
      return jsonResponse({
        message: "Phone number must be 50 characters or fewer; country and city must each be 100 characters or fewer.",
      }, 400);
    }

    const result = await pool.query(
      `UPDATE public.users
       SET contact_phone = $3,
           contact_country = $4,
           contact_city = $5,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND organization_id = $2::uuid
         AND account_scope = 'ORGANIZATION'
         AND status = 'ACTIVE'
       RETURNING id::text AS id, email, contact_phone, contact_country, contact_city`,
      [admin.id, admin.organizationId, phone ?? null, country ?? null, city ?? null],
    );
    const user = result.rows[0] as
      | { id: string; email: string; contact_phone: string | null; contact_country: string | null; contact_city: string | null }
      | undefined;
    if (!user) return jsonResponse({ message: "Organization Admin account not found." }, 404);

    return jsonResponse({
      status: "ok",
      message: "Your contact details have been updated.",
      profile: {
        id: user.id,
        email: user.email,
        contactPhone: user.contact_phone || "",
        country: user.contact_country || "",
        city: user.contact_city || "",
      },
    });
  } catch (error) {
    console.error("Failed to update Organization Admin profile:", error);
    return jsonResponse({ message: "Unable to save your contact details right now." }, 500);
  }
}
