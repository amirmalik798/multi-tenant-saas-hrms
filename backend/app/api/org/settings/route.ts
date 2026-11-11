import { NextResponse } from "next/server";

import { pool } from "../../../../lib/db";
import { getOrganizationAdmin } from "../../../../lib/auth";
import { getOrganizationRegionalDefaults } from "../../../../lib/organization-regional-defaults";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";

type SettingsRow = {
  organization_id: string;
  time_zone: string;
  locale: string;
  currency_code: string | null;
  date_format: string;
  week_starts_on: number;
  working_days: number[];
  country_code: string | null;
  legal_entity_name: string | null;
  legal_entity_country_code: string | null;
  created_at: string;
  updated_at: string;
  setup_completed_at: string | null;
};

const DATE_FORMATS = new Set([
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD.MM.YYYY",
]);

const ALLOWED_INPUT_KEYS = new Set([
  "timeZone",
  "locale",
  "currencyCode",
  "dateFormat",
  "weekStartsOn",
  "workingDays",
  "countryCode",
  "legalEntityName",
  "legalEntityCountryCode",
]);

const SELECT_SETTINGS = `
  SELECT
    organization_id,
    time_zone,
    locale,
    currency_code,
    date_format,
    week_starts_on,
    working_days,
    country_code,
    legal_entity_name,
    legal_entity_country_code,
    created_at,
    updated_at,
    setup_completed_at
  FROM public.organization_settings
  WHERE organization_id = $1
  LIMIT 1
`;

function toResponseSettings(row: SettingsRow) {
  return {
    organizationId: row.organization_id,
    timeZone: row.time_zone,
    locale: row.locale,
    currencyCode: row.currency_code,
    dateFormat: row.date_format,
    weekStartsOn: row.week_starts_on,
    workingDays: row.working_days,
    countryCode: row.country_code,
    legalEntityName: row.legal_entity_name,
    legalEntityCountryCode: row.legal_entity_country_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    setupCompletedAt: row.setup_completed_at,
  };
}

function invalid(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeOptionalCode(
  value: unknown,
  fieldName: string,
  length: number,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toUpperCase();

  if (!normalized) return null;

  if (
    normalized.length !== length ||
    !/^[A-Z]+$/.test(normalized)
  ) {
    throw new Error(
      `${fieldName} must be a ${length}-letter code or null`,
    );
  }

  return normalized;
}

function normalizeNullableText(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();

  if (!normalized) return null;

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} cannot exceed ${maxLength} characters`);
  }

  return normalized;
}

export async function GET() {
  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });

    if (!admin) {
      return NextResponse.json(
        { message: "Authentication required" },
        { status: 401 },
      );
    }

    // Ensure organizations created after the migration also receive defaults.
    // The tenant ID always comes from the verified session, never from input.
    await pool.query(
      `INSERT INTO public.organization_settings (organization_id)
       VALUES ($1)
       ON CONFLICT (organization_id) DO NOTHING`,
      [admin.organizationId],
    );

    const countryResult = await pool.query(
      `SELECT country FROM public.organizations WHERE id = $1 LIMIT 1`,
      [admin.organizationId],
    );
    const organizationCountry =
      typeof countryResult.rows[0]?.country === "string"
        ? countryResult.rows[0].country.trim()
        : "";
    const regionalDefaults = getOrganizationRegionalDefaults(organizationCountry);

    // Apply regional defaults only once, before setup completion. A populated
    // country_code indicates the settings have already been initialized or
    // deliberately reviewed; never silently overwrite them on later visits.
    if (regionalDefaults) {
      await pool.query(
        `UPDATE public.organization_settings
         SET time_zone = $2,
             locale = $3,
             currency_code = $4,
             date_format = $5,
             week_starts_on = $6,
             country_code = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1
           AND setup_completed_at IS NULL
           AND (country_code IS NULL OR BTRIM(country_code) = '')`,
        [
          admin.organizationId,
          regionalDefaults.timeZone,
          regionalDefaults.locale,
          regionalDefaults.currencyCode,
          regionalDefaults.dateFormat,
          regionalDefaults.weekStartsOn,
          regionalDefaults.countryCode,
        ],
      );
    }

    const [result, organizationResult] = await Promise.all([
      pool.query(SELECT_SETTINGS, [admin.organizationId]),
      pool.query(
        `SELECT id, name, slug, contact_email, contact_phone, address, country,
                status, created_at, updated_at
         FROM public.organizations
         WHERE id = $1
         LIMIT 1`,
        [admin.organizationId],
      ),
    ]);
    const settings = result.rows[0] as SettingsRow | undefined;
    const organization = organizationResult.rows[0] as {
      id: string;
      name: string;
      slug: string;
      contact_email: string;
      contact_phone: string;
      address: string;
      country: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!settings) {
      return NextResponse.json(
        { message: "Organization settings could not be loaded" },
        { status: 500 },
      );
    }

    if (!organization) {
      return NextResponse.json(
        { message: "Organization profile could not be loaded" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "ok",
      settings: toResponseSettings(settings),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        contactEmail: organization.contact_email,
        contactPhone: organization.contact_phone,
        address: organization.address,
        country: organization.country,
        status: organization.status,
        createdAt: organization.created_at,
        updatedAt: organization.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to load organization settings:", error);

    return NextResponse.json(
      { message: "Unable to load organization settings right now" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  // Reject requests that fail same-origin validation before authentication,
  // request-body parsing, or database access.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  // Require application/json and enforce the shared 64 KiB body limit.
  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  try {
    const admin = await getOrganizationAdmin({ allowIncompleteSetup: true });

    if (!admin) {
      return NextResponse.json(
        { message: "Authentication required" },
        { status: 401 },
      );
    }

    if (!isRecord(body)) {
      return invalid("Invalid request body");
    }

    const inputKeys = Object.keys(body);

    if (inputKeys.length === 0) {
      return invalid("Provide at least one setting to update");
    }

    const unknownKeys = inputKeys.filter(
      (key) => !ALLOWED_INPUT_KEYS.has(key),
    );

    if (unknownKeys.length > 0) {
      return invalid(`Unsupported setting field: ${unknownKeys.join(", ")}`);
    }

    const updates: Array<{
      column: string;
      value: string | number | number[] | null;
    }> = [];

    try {
      if (Object.hasOwn(body, "timeZone")) {
        const value = body.timeZone;

        if (
          typeof value !== "string" ||
          !value.trim() ||
          value.trim().length > 64
        ) {
          throw new Error(
            "timeZone must be a non-empty IANA time-zone name (maximum 64 characters)",
          );
        }

        const normalized = value.trim();

        try {
          new Intl.DateTimeFormat("en-US", { timeZone: normalized });
        } catch {
          throw new Error("timeZone must be a valid IANA time-zone name");
        }

        updates.push({ column: "time_zone", value: normalized });
      }

      if (Object.hasOwn(body, "locale")) {
        const value = body.locale;

        if (
          typeof value !== "string" ||
          !value.trim() ||
          value.trim().length > 35
        ) {
          throw new Error(
            "locale must be a valid locale tag (maximum 35 characters)",
          );
        }

        let canonicalLocale: string;

        try {
          canonicalLocale = Intl.getCanonicalLocales(value.trim())[0];
        } catch {
          throw new Error("locale must be a valid locale tag");
        }

        if (!canonicalLocale) {
          throw new Error("locale must be a valid locale tag");
        }

        updates.push({ column: "locale", value: canonicalLocale });
      }

      if (Object.hasOwn(body, "currencyCode")) {
        const value = body.currencyCode;

        if (value === null) {
          updates.push({ column: "currency_code", value: null });
        } else if (
          typeof value === "string" &&
          /^[A-Za-z]{3}$/.test(value.trim())
        ) {
          updates.push({
            column: "currency_code",
            value: value.trim().toUpperCase(),
          });
        } else {
          throw new Error(
            "currencyCode must be a three-letter currency code or null",
          );
        }
      }

      if (Object.hasOwn(body, "dateFormat")) {
        const value = body.dateFormat;

        if (typeof value !== "string" || !DATE_FORMATS.has(value)) {
          throw new Error(
            `dateFormat must be one of: ${Array.from(DATE_FORMATS).join(", ")}`,
          );
        }

        updates.push({ column: "date_format", value });
      }

      if (Object.hasOwn(body, "weekStartsOn")) {
        const value = body.weekStartsOn;

        if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > 7
        ) {
          throw new Error(
            "weekStartsOn must be an integer from 1 (Monday) to 7 (Sunday)",
          );
        }

        updates.push({ column: "week_starts_on", value });
      }

      if (Object.hasOwn(body, "workingDays")) {
        const value = body.workingDays;

        if (
          !Array.isArray(value) ||
          value.length < 1 ||
          value.length > 7 ||
          !value.every(
            (day) =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 1 &&
              day <= 7,
          ) ||
          new Set(value).size !== value.length
        ) {
          throw new Error(
            "workingDays must contain unique weekday numbers from 1 (Monday) to 7 (Sunday)",
          );
        }

        updates.push({
          column: "working_days",
          value: value as number[],
        });
      }

      if (Object.hasOwn(body, "countryCode")) {
        const value = normalizeOptionalCode(
          body.countryCode,
          "countryCode",
          2,
        );

        if (value === undefined) {
          throw new Error(
            "countryCode must be a two-letter country code or null",
          );
        }

        updates.push({ column: "country_code", value });
      }

      if (Object.hasOwn(body, "legalEntityName")) {
        const value = normalizeNullableText(
          body.legalEntityName,
          "legalEntityName",
          200,
        );

        if (value === undefined) {
          throw new Error("legalEntityName must be a string or null");
        }

        updates.push({ column: "legal_entity_name", value });
      }

      if (Object.hasOwn(body, "legalEntityCountryCode")) {
        const value = normalizeOptionalCode(
          body.legalEntityCountryCode,
          "legalEntityCountryCode",
          2,
        );

        if (value === undefined) {
          throw new Error(
            "legalEntityCountryCode must be a two-letter country code or null",
          );
        }

        updates.push({
          column: "legal_entity_country_code",
          value,
        });
      }
    } catch (error) {
      return invalid(
        error instanceof Error ? error.message : "Invalid setting value",
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO public.organization_settings (organization_id)
         VALUES ($1)
         ON CONFLICT (organization_id) DO NOTHING`,
        [admin.organizationId],
      );

      // Column names come only from the fixed server-side allowlist above;
      // all setting values remain parameterized.
      const assignments = updates.map(
        (item, index) => `${item.column} = $${index + 2}`,
      );

      assignments.push("updated_at = CURRENT_TIMESTAMP");

      const values = [
        admin.organizationId,
        ...updates.map((item) => item.value),
      ];

      const result = await client.query(
        `UPDATE public.organization_settings
         SET ${assignments.join(", ")}
         WHERE organization_id = $1
         RETURNING
           organization_id,
           time_zone,
           locale,
           currency_code,
           date_format,
           week_starts_on,
           working_days,
           country_code,
           legal_entity_name,
           legal_entity_country_code,
           created_at,
           updated_at`,
        values,
      );

      await client.query("COMMIT");

      const settings = result.rows[0] as SettingsRow | undefined;

      if (!settings) {
        return NextResponse.json(
          { message: "Organization settings could not be saved" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: "ok",
        message: "Organization settings updated successfully",
        settings: toResponseSettings(settings),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to update organization settings:", error);

    return NextResponse.json(
      { message: "Unable to update organization settings right now" },
      { status: 500 },
    );
  }
}