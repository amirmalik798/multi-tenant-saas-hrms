import type { PoolClient } from "pg";

import type { ManagementDashboardScope } from "./scope";

export type ManagementDashboardDepartment = {
  id: string;
  name: string;
  status: string;
};

export type ManagementDashboardContext = {
  organization: {
    name: string;
    timeZone: string;
    weekStartsOn: number;
    workDate: string;
  };
  departmentCount: number;
  departments: ManagementDashboardDepartment[];
};

type OrganizationContextRow = {
  name: string;
  timeZone: string;
  weekStartsOn: number;
};

type WorkDateRow = {
  workDate: string;
};

type DepartmentCountRow = {
  count: number;
};

export class InvalidManagementDashboardTimeZoneError extends Error {
  constructor() {
    super("The organization's configured time zone is invalid");
    this.name = "InvalidManagementDashboardTimeZoneError";
  }
}

/**
 * Loads only the tenant metadata and department context authorized by the
 * server-derived scope. The supplied client must belong to the caller's
 * read-only snapshot transaction.
 */
export async function loadManagementDashboardContext(
  client: PoolClient,
  scope: ManagementDashboardScope,
): Promise<ManagementDashboardContext | null> {
  const organizationResult = await client.query<OrganizationContextRow>(
    `SELECT
       o.name AS "name",
       COALESCE(NULLIF(os.time_zone, ''), 'Africa/Kigali') AS "timeZone",
       COALESCE(os.week_starts_on, 1)::int AS "weekStartsOn"
     FROM public.organizations AS o
     LEFT JOIN public.organization_settings AS os
       ON os.organization_id = o.id
     WHERE o.id = $1::uuid
       AND o.status = 'ACTIVE'
     LIMIT 1`,
    [scope.organizationId],
  );

  const organization = organizationResult.rows[0];
  if (!organization) {
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: organization.timeZone,
    });
  } catch {
    throw new InvalidManagementDashboardTimeZoneError();
  }

  const workDateResult = await client.query<WorkDateRow>(
    `SELECT TO_CHAR(
       (NOW() AT TIME ZONE $1)::date,
       'YYYY-MM-DD'
     ) AS "workDate"`,
    [organization.timeZone],
  );

  const workDate = workDateResult.rows[0]?.workDate;
  if (!workDate) {
    throw new Error("The organization's current work date is unavailable");
  }

  if (scope.kind === "ASSIGNED_DEPARTMENTS") {
    const departmentsResult =
      await client.query<ManagementDashboardDepartment>(
        `SELECT
           d.id,
           d.name,
           d.status
         FROM public.departments AS d
         WHERE d.organization_id = $1::uuid
           AND d.manager_id = $2::uuid
         ORDER BY LOWER(d.name), d.id`,
        [scope.organizationId, scope.managerEmployeeId],
      );

    return {
      organization: {
        name: organization.name,
        timeZone: organization.timeZone,
        weekStartsOn: organization.weekStartsOn,
        workDate,
      },
      departmentCount: departmentsResult.rows.length,
      departments: departmentsResult.rows,
    };
  }

  const departmentCountResult =
    await client.query<DepartmentCountRow>(
      `SELECT COUNT(*)::int AS "count"
       FROM public.departments
       WHERE organization_id = $1::uuid`,
      [scope.organizationId],
    );

  return {
    organization: {
      name: organization.name,
      timeZone: organization.timeZone,
      weekStartsOn: organization.weekStartsOn,
      workDate,
    },
    departmentCount: departmentCountResult.rows[0]?.count ?? 0,
    // Organization-wide department records are intentionally not returned
    // by this context endpoint. Later data services expose only the fields
    // required by each dashboard section and its existing permissions.
    departments: [],
  };
}
