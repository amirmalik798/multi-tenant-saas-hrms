import type { PoolClient } from "pg";

import { pool } from "./db";

export type OrganizationLicenseStatus =
  | "NOT_ACTIVATED"
  | "ACTIVE"
  | "EXPIRED";

export type OrganizationLicenseActivationSource =
  | "NONE"
  | "LEGACY_GRACE"
  | "PAYMENT";

export type OrganizationLicenseRestrictionReason =
  | "LICENSE_RECORD_MISSING"
  | "NOT_ACTIVATED"
  | "EXPIRED";

export type OrganizationLicenseAccess = {
  organizationId: string;
  licenseExists: boolean;
  status: OrganizationLicenseStatus;
  activationSource: OrganizationLicenseActivationSource | null;
  startsAt: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
  canAccess: boolean;
  restrictionReason: OrganizationLicenseRestrictionReason | null;
  databaseTime: string;
};

type LicenseQueryRow = {
  organization_id: string;
  license_id: string | null;
  stored_status: OrganizationLicenseStatus | null;
  effective_status: OrganizationLicenseStatus;
  activation_source: OrganizationLicenseActivationSource | null;
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  remaining_days: number | null;
  can_access: boolean;
  database_time: Date | string;
};

type LicenseQueryExecutor = typeof pool | PoolClient;

function toIsoTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Database returned an invalid license timestamp");
  }

  return parsed.toISOString();
}

/**
 * Resolve the effective subscription state for one organization.
 *
 * The database clock is authoritative for expiry decisions. An ACTIVE license
 * whose expires_at has passed is returned as effectively EXPIRED even if its
 * stored status has not yet been materialized as EXPIRED. This function is
 * deliberately read-only: it never changes organization or license records.
 *
 * Returns null when the organization ID is invalid or the organization does
 * not exist. If the organization exists but has no license row, it returns a
 * restricted LICENSE_RECORD_MISSING result (fail-closed behavior).
 *
 * A PoolClient may be supplied when the caller needs the read to participate
 * in an existing database transaction. The default uses the shared pool.
 */
export async function getOrganizationLicenseAccess(
  organizationId: string,
  executor: LicenseQueryExecutor = pool,
): Promise<OrganizationLicenseAccess | null> {
  if (
    typeof organizationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    return null;
  }

  const result = await executor.query<LicenseQueryRow>(
    `SELECT
       o.id AS organization_id,
       l.id AS license_id,
       l.status AS stored_status,
       CASE
         WHEN l.id IS NULL THEN 'NOT_ACTIVATED'
         WHEN l.status = 'ACTIVE' AND l.expires_at <= NOW() THEN 'EXPIRED'
         ELSE l.status
       END AS effective_status,
       l.activation_source,
       l.starts_at,
       l.expires_at,
       CASE
         WHEN l.expires_at IS NULL THEN NULL
         WHEN l.expires_at <= NOW() THEN 0
         ELSE GREATEST(
           0,
           CEIL(EXTRACT(EPOCH FROM (l.expires_at - NOW())) / 86400)
         )::integer
       END AS remaining_days,
       (
         l.id IS NOT NULL
         AND l.status = 'ACTIVE'
         AND l.expires_at > NOW()
       ) AS can_access,
       NOW() AS database_time
     FROM public.organizations AS o
     LEFT JOIN public.organization_licenses AS l
       ON l.organization_id = o.id
     WHERE o.id = $1::uuid
     LIMIT 1`,
    [organizationId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const licenseExists = row.license_id !== null;
  const status = row.effective_status;
  let restrictionReason: OrganizationLicenseRestrictionReason | null = null;

  if (!licenseExists) {
    restrictionReason = "LICENSE_RECORD_MISSING";
  } else if (status === "NOT_ACTIVATED") {
    restrictionReason = "NOT_ACTIVATED";
  } else if (status === "EXPIRED") {
    restrictionReason = "EXPIRED";
  }

  return {
    organizationId: row.organization_id,
    licenseExists,
    status,
    activationSource: row.activation_source,
    startsAt: toIsoTimestamp(row.starts_at),
    expiresAt: toIsoTimestamp(row.expires_at),
    remainingDays:
      row.remaining_days === null ? null : Number(row.remaining_days),
    canAccess: row.can_access === true,
    restrictionReason,
    databaseTime: toIsoTimestamp(row.database_time) as string,
  };
}
