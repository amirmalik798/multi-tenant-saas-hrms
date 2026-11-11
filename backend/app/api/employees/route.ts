import { NextResponse } from "next/server";

import { pool } from "../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../lib/request-security";
import {
  requireActiveOrganization,
  requireOrganizationWorkforceRole,
  withWorkforceTransaction,
  writeEmployeeHistory,
  WorkforceRuleError,
} from "../../../lib/workforce";

type WorkforceRoleName =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

const ALLOWED_WORKFORCE_ROLES: WorkforceRoleName[] = [
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
];

const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,49}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;

const EMPLOYEE_SORT_COLUMNS = {
  created_at: "e.created_at",
  employee_code: "e.employee_code",
  name: "LOWER(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)))",
  department: "LOWER(COALESCE(d.name, ''))",
  designation: "LOWER(COALESCE(e.designation, ''))",
  workforce_role: "LOWER(COALESCE(workforce_role.name, ''))",
  employment_status: "e.employment_status",
  joining_date: "e.joining_date",
} as const;

type EmployeeSortBy = keyof typeof EMPLOYEE_SORT_COLUMNS;

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

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export async function GET(request: Request) {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER";

    // Department Managers may read the employee directory only through
// this endpoint's mandatory managed-department scope below.
// This is a route-specific read allowance, not a global permission grant.
//
// Organization Admins retain their tenant-admin behavior.
// HR Managers and Employees still require their configured permissions.
if (
  !isDepartmentManager &&
  !hasTenantPermission(actor, "employee.view")
) {
  return jsonResponse(
    {
      message:
        "You do not have permission to view employee records",
    },
    403,
  );
}

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(
      url.searchParams.get("limit") ?? "50",
    );

    const requestedSortBy = (
      url.searchParams.get("sortBy") ?? "created_at"
    )
      .trim()
      .toLowerCase();

    const requestedSortOrder = (
      url.searchParams.get("sortOrder") ?? "desc"
    )
      .trim()
      .toLowerCase();

    if (
      !Object.prototype.hasOwnProperty.call(
        EMPLOYEE_SORT_COLUMNS,
        requestedSortBy,
      )
    ) {
      return jsonResponse(
        {
          message:
            "Invalid sortBy. Allowed values: created_at, employee_code, name, department, designation, workforce_role, employment_status, joining_date.",
        },
        400,
      );
    }

    if (!["asc", "desc"].includes(requestedSortOrder)) {
      return jsonResponse(
        { message: "Invalid sortOrder. Use asc or desc." },
        400,
      );
    }

    const sortBy = requestedSortBy as EmployeeSortBy;
    const sortOrder = requestedSortOrder.toUpperCase();

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAGE_SIZE
    ) {
      return jsonResponse(
        {
          message:
            "Invalid pagination. Page must be positive and limit must be between 1 and 100.",
        },
        400,
      );
    }

    const offset = (page - 1) * limit;

    if (
      !Number.isSafeInteger(offset) ||
      offset > MAX_OFFSET
    ) {
      return jsonResponse(
        { message: "Requested page is out of range" },
        400,
      );
    }

    const search = (url.searchParams.get("q") ?? "")
      .trim()
      .replace(/\s+/g, " ");

    const requestedStatus = (
      url.searchParams.get("status") ??
      url.searchParams.get("employment_status") ??
      ""
    )
      .trim()
      .toUpperCase();

    const departmentId = (
      url.searchParams.get("departmentId") ??
      url.searchParams.get("department_id") ??
      ""
    ).trim();

    const unassignedParam = (
      url.searchParams.get("unassigned") ?? ""
    )
      .trim()
      .toLowerCase();

    const unassigned = unassignedParam === "true";

    if (
      unassignedParam &&
      !["true", "false"].includes(unassignedParam)
    ) {
      return jsonResponse(
        {
          message:
            "Unassigned filter must be true or false",
        },
        400,
      );
    }

    if (unassigned && departmentId) {
      return jsonResponse(
        {
          message:
            "Choose either a department ID or the unassigned filter, not both",
        },
        400,
      );
    }

    if (search.length > 100) {
      return jsonResponse(
        {
          message:
            "Search query must not exceed 100 characters",
        },
        400,
      );
    }

    if (
      requestedStatus &&
      !["ACTIVE", "INACTIVE", "FORMER"].includes(
        requestedStatus,
      )
    ) {
      return jsonResponse(
        {
          message:
            "Status must be ACTIVE, INACTIVE, or FORMER",
        },
        400,
      );
    }

    if (
      departmentId &&
      !UUID_PATTERN.test(departmentId)
    ) {
      return jsonResponse(
        { message: "Invalid department ID" },
        400,
      );
    }

    const where: string[] = ["e.organization_id = $1"];
    const filterValues: unknown[] = [
      actor.organizationId,
    ];

    // Organization Admins are platform/tenant operators, not workforce records
    // to be managed in the HR Manager employee directory.
    if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER") {
      where.push(`COALESCE(workforce_role.name, 'EMPLOYEE') NOT IN ('ORGANIZATION_ADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
        AND NOT EXISTS (
          SELECT 1
          FROM public.users AS target_account
          JOIN public.roles AS target_account_role
            ON target_account_role.id = target_account.role_id
           AND target_account_role.organization_id = target_account.organization_id
          WHERE target_account.organization_id = e.organization_id
            AND target_account.employee_id = e.id
            AND target_account.account_scope = 'ORGANIZATION'
            AND regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
        )`);
    }

    // Department Managers can only see employees belonging to
    // departments assigned to them.
    if (
      isDepartmentManager &&
      actor.kind === "ORGANIZATION_USER"
    ) {
      filterValues.push(actor.employeeId);

      where.push(`EXISTS (
        SELECT 1
        FROM public.departments AS assigned_department
        WHERE assigned_department.id = e.department_id
          AND assigned_department.organization_id = e.organization_id
          AND assigned_department.manager_id = $${filterValues.length}::uuid
      )`);
    }

    // SECURITY FIX:
    // Employee accounts may only read their own workforce profile,
    // even if employee.view is accidentally granted or assigned later.
    //
    // The same WHERE clause is used by both the employee query and
    // count query, so search, filters and pagination cannot expose
    // other employees or their total count.
    if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "EMPLOYEE"
    ) {
      filterValues.push(actor.employeeId);

      where.push(
        `e.id = $${filterValues.length}::uuid`,
      );
    }

    if (requestedStatus) {
      filterValues.push(requestedStatus);

      where.push(
        `e.employment_status = $${filterValues.length}`,
      );
    }

    if (unassigned) {
      where.push("e.department_id IS NULL");
    } else if (departmentId) {
      filterValues.push(departmentId);

      where.push(
        `e.department_id = $${filterValues.length}::uuid`,
      );
    }

    if (search) {
      filterValues.push(`%${search}%`);
      const searchParam = `$${filterValues.length}`;

      where.push(`(
        e.employee_code ILIKE ${searchParam}
        OR e.first_name ILIKE ${searchParam}
        OR COALESCE(e.last_name, '') ILIKE ${searchParam}
        OR COALESCE(e.email, '') ILIKE ${searchParam}
        OR COALESCE(e.phone, '') ILIKE ${searchParam}
        OR COALESCE(e.designation, '') ILIKE ${searchParam}
        OR COALESCE(e.city, '') ILIKE ${searchParam}
        OR COALESCE(e.country, '') ILIKE ${searchParam}
        OR COALESCE(d.name, '') ILIKE ${searchParam}
        OR NULLIF(
          TRIM(CONCAT_WS(' ', e.first_name, e.last_name)),
          ''
        ) ILIKE ${searchParam}
        OR NULLIF(
          TRIM(CONCAT_WS(' ', manager.first_name, manager.last_name)),
          ''
        ) ILIKE ${searchParam}
        OR COALESCE(workforce_role.name, '') ILIKE ${searchParam}
      )`);
    }

    const whereSql = where.join("\n        AND ");

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM public.employees AS e
      LEFT JOIN public.departments AS d
        ON d.id = e.department_id
       AND d.organization_id = e.organization_id
      LEFT JOIN public.employees AS manager
        ON manager.id = e.manager_id
       AND manager.organization_id = e.organization_id
      LEFT JOIN public.roles AS workforce_role
        ON workforce_role.id = e.workforce_role_id
       AND workforce_role.organization_id = e.organization_id
      WHERE ${whereSql}
    `;

    const employeeQueryValues = [
      ...filterValues,
      limit,
      offset,
    ];

    const employeeQuery = `
      SELECT
        e.id,
        e.organization_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.email,
        e.phone,
        e.country,
        e.city,
        e.designation,
        e.manager_id,
        e.is_primary_hr_manager,
        workforce_role.name AS workforce_role,
        e.joining_date::text AS joining_date,
        e.employment_status,
        e.department_id,
        d.name AS department_name,
        (
          SELECT COUNT(*)::int
          FROM public.departments AS managed_department
          WHERE managed_department.organization_id = e.organization_id
            AND managed_department.manager_id = e.id
        ) AS managed_department_count,
        manager.employee_code AS manager_employee_code,
        manager.first_name AS manager_first_name,
        manager.last_name AS manager_last_name,
        NULLIF(
          TRIM(CONCAT_WS(' ', manager.first_name, manager.last_name)),
          ''
        ) AS manager_name,
        manager.email AS manager_email,
        manager.employment_status AS manager_employment_status,
        manager_role.name AS manager_workforce_role,
        manager_account.status AS manager_account_status,
        latest_invitation.id AS invitation_id,
        CASE
          WHEN latest_invitation.status = 'PENDING'
            AND latest_invitation.expires_at <= NOW()
          THEN 'EXPIRED'
          ELSE latest_invitation.status
        END AS invitation_status,
        latest_invitation.expires_at AS invitation_expires_at,
        COALESCE(
          latest_invitation.status = 'PENDING'
            AND latest_invitation.expires_at > NOW(),
          FALSE
        ) AS has_pending_invitation,
        e.created_at,
        e.updated_at
      FROM public.employees AS e
      LEFT JOIN public.departments AS d
        ON d.id = e.department_id
       AND d.organization_id = e.organization_id
      LEFT JOIN public.roles AS workforce_role
        ON workforce_role.id = e.workforce_role_id
       AND workforce_role.organization_id = e.organization_id
      LEFT JOIN public.employees AS manager
        ON manager.id = e.manager_id
       AND manager.organization_id = e.organization_id
      LEFT JOIN public.roles AS manager_role
        ON manager_role.id = manager.workforce_role_id
       AND manager_role.organization_id = manager.organization_id
      LEFT JOIN LATERAL (
        SELECT u.status
        FROM public.users AS u
        WHERE u.employee_id = manager.id
          AND u.organization_id = manager.organization_id
          AND u.role_id = manager.workforce_role_id
          AND u.account_scope = 'ORGANIZATION'
        ORDER BY
          CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
          u.updated_at DESC NULLS LAST,
          u.created_at DESC NULLS LAST
        LIMIT 1
      ) AS manager_account ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          invitation.id,
          invitation.status,
          invitation.expires_at,
          invitation.created_at,
          invitation.updated_at
        FROM public.employee_invitations AS invitation
        WHERE invitation.organization_id = e.organization_id
          AND invitation.employee_id = e.id
        ORDER BY
          invitation.updated_at DESC NULLS LAST,
          invitation.created_at DESC NULLS LAST,
          invitation.id DESC
        LIMIT 1
      ) AS latest_invitation ON TRUE
      WHERE ${whereSql}
      ORDER BY
        ${EMPLOYEE_SORT_COLUMNS[sortBy]} ${sortOrder} NULLS LAST,
        e.employee_code ASC,
        e.id ASC
      LIMIT $${filterValues.length + 1}
      OFFSET $${filterValues.length + 2}
    `;

    const [employeesResult, countResult] =
      await Promise.all([
        pool.query(
          employeeQuery,
          employeeQueryValues,
        ),
        pool.query(countQuery, filterValues),
      ]);

    const total = Number(
      countResult.rows[0]?.total ?? 0,
    );

    return jsonResponse({
      status: "ok",
      employees: employeesResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasPreviousPage: page > 1,
        hasNextPage: offset + employeesResult.rows.length < total,
      },
      filters: {
        q: search || null,
        status: requestedStatus || null,
        departmentId: departmentId || null,
        unassigned: unassigned || null,
      },
      sort: {
        by: sortBy,
        order: requestedSortOrder,
      },
    });
  } catch (error) {
    console.error("Failed to load employees:", error);

    return jsonResponse(
      { message: "Unable to load employees right now" },
      500,
    );
  }
}

/**
 * Creates a new inactive workforce profile.
 *
 * Profiles remain INACTIVE until the invitation-acceptance workflow
 * provisions and activates the corresponding account.
 */
export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (!hasTenantPermission(actor, "employee.create")) {
      return jsonResponse(
        {
          message:
            "You do not have permission to create workforce profiles",
        },
        403,
      );
    }

    if (
      typeof parsedBody.body !== "object" ||
      parsedBody.body === null ||
      Array.isArray(parsedBody.body)
    ) {
      return jsonResponse(
        { message: "Invalid request body" },
        400,
      );
    }

    const input = parsedBody.body as Record<
      string,
      unknown
    >;

    if (
      typeof input.workforce_role !== "string" ||
      !ALLOWED_WORKFORCE_ROLES.includes(
        input.workforce_role as WorkforceRoleName,
      )
    ) {
      return jsonResponse(
        {
          message:
            "Select a valid workforce role before creating the profile",
        },
        400,
      );
    }

    const workforceRole =
      input.workforce_role as WorkforceRoleName;

    if (
      actor.kind === "ORGANIZATION_USER" &&
      (
        actor.roleName !== "HR_MANAGER" ||
        workforceRole === "HR_MANAGER"
      )
    ) {
      return jsonResponse(
        {
          message:
            "You are not permitted to create this workforce role",
        },
        403,
      );
    }

    if (
      typeof input.employee_code !== "string" ||
      typeof input.first_name !== "string" ||
      typeof input.last_name !== "string" ||
      typeof input.email !== "string" ||
      typeof input.phone !== "string" ||
      typeof input.country !== "string" ||
      typeof input.city !== "string" ||
      typeof input.designation !== "string" ||
      typeof input.joining_date !== "string" ||
      typeof input.workforce_role !== "string"
    ) {
      return jsonResponse(
        {
          message:
            "Employee code, full name, email, phone, country, city, job title, joining date, and workforce role are required.",
        },
        400,
      );
    }

    const optionalFields = [
      "emergency_contact_name",
      "emergency_contact_relationship",
      "emergency_contact_phone",
      "manager_id",
      "employment_status",
      "department_id",
    ];

    for (const field of optionalFields) {
      if (
        input[field] !== undefined &&
        input[field] !== null &&
        typeof input[field] !== "string"
      ) {
        return jsonResponse(
          { message: `Invalid value for ${field}` },
          400,
        );
      }
    }

    const employeeCode =
      input.employee_code.trim().toUpperCase();

    const firstName = normalizeWhitespace(
      input.first_name,
    );

    function optionalText(
      field: string,
    ): string | null {
      const value = input[field];

      if (typeof value !== "string") {
        return null;
      }

      return normalizeWhitespace(value) || null;
    }

    const lastName = optionalText("last_name");
    const email =
      optionalText("email")?.toLowerCase() ?? null;
    const phone =
      optionalText("phone")?.replace(/\s+/g, " ") ?? null;
    const emergencyContactName = optionalText("emergency_contact_name");
    const emergencyContactRelationship = optionalText("emergency_contact_relationship");
    const emergencyContactPhone =
      optionalText("emergency_contact_phone")?.replace(/\s+/g, " ") ?? null;
    const country = optionalText("country");
    const city = optionalText("city");
    const designation = normalizeWhitespace(input.designation);
    const managerId = optionalText("manager_id");
    const departmentId = optionalText("department_id");
    const joiningDate = optionalText("joining_date");

    if (
      !EMPLOYEE_CODE_PATTERN.test(employeeCode) ||
      !firstName ||
      firstName.length < 2 ||
      firstName.length > 100 ||
      !lastName ||
      lastName.length < 2 ||
      lastName.length > 100 ||
      !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(firstName) ||
      !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(lastName)
    ) {
      return jsonResponse(
        {
          message:
            "Employee code must be valid. First and last names are required, must be 2–100 characters, and may contain letters, spaces, apostrophes, periods, or hyphens.",
        },
        400,
      );
    }

    if (!city || !country) {
      return jsonResponse(
        { message: "City and country are required" },
        400,
      );
    }

    if (city.length > 100 || country.length > 100) {
      return jsonResponse(
        {
          message:
            "City and country must not exceed 100 characters",
        },
        400,
      );
    }

    if (!designation) {
      return jsonResponse(
        { message: "Designation is required" },
        400,
      );
    }

    if (designation.length > 100) {
      return jsonResponse(
        {
          message:
            "Designation must not exceed 100 characters",
        },
        400,
      );
    }

    if (
      !email ||
      email.length > 254 ||
      !EMAIL_PATTERN.test(email)
    ) {
      return jsonResponse(
        {
          message:
            "Enter a valid email address of at most 254 characters",
        },
        400,
      );
    }

    const phoneDigits = phone?.replace(/\D/g, "").length ?? 0;
    if (
      !phone ||
      phone.length > 50 ||
      !/^\+?[0-9][0-9\s().-]*$/.test(phone) ||
      phoneDigits < 7 ||
      phoneDigits > 15
    ) {
      return jsonResponse(
        { message: "A valid employee phone number is required (7–15 digits, including the country calling code)." },
        400,
      );
    }

    const emergencyContactPhoneDigits = emergencyContactPhone?.replace(/\D/g, "").length ?? 0;
    if (
      !emergencyContactName ||
      emergencyContactName.length < 2 ||
      emergencyContactName.length > 120 ||
      !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(emergencyContactName) ||
      !emergencyContactRelationship ||
      emergencyContactRelationship.length < 2 ||
      emergencyContactRelationship.length > 80 ||
      !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(emergencyContactRelationship) ||
      !emergencyContactPhone ||
      emergencyContactPhone.length > 30 ||
      !/^\+?[0-9][0-9\s().-]*$/.test(emergencyContactPhone) ||
      emergencyContactPhoneDigits < 7 ||
      emergencyContactPhoneDigits > 15
    ) {
      return jsonResponse(
        { message: "Enter a valid emergency contact name and relationship (2–120 and 2–80 characters), plus a phone number containing 7–15 digits. Names must contain letters and may include spaces, apostrophes, periods, or hyphens." },
        400,
      );
    }

    if (
      (managerId !== null &&
        !UUID_PATTERN.test(managerId)) ||
      (departmentId !== null &&
        !UUID_PATTERN.test(departmentId))
    ) {
      return jsonResponse(
        { message: "Invalid manager or department ID" },
        400,
      );
    }

    if (
      input.employment_status !== undefined &&
      !["ACTIVE", "INACTIVE", "FORMER"].includes(
        String(input.employment_status)
          .trim()
          .toUpperCase(),
      )
    ) {
      return jsonResponse(
        {
          message:
            "Employment status must be ACTIVE, INACTIVE, or FORMER",
        },
        400,
      );
    }

    if (!joiningDate) {
      return jsonResponse(
        { message: "Joining date is required." },
        400,
      );
    }

    if (joiningDate !== null) {
      const parsedDate =
        /^\d{4}-\d{2}-\d{2}$/.test(joiningDate)
          ? new Date(`${joiningDate}T00:00:00.000Z`)
          : new Date("invalid");

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== joiningDate
      ) {
        return jsonResponse(
          {
            message:
              "Joining date must be a valid YYYY-MM-DD date",
          },
          400,
        );
      }
    }

    const createdEmployee =
      await withWorkforceTransaction(async (client) => {
        await requireActiveOrganization(
          client,
          actor.organizationId,
        );

        /*
         * One normalized, nonblank employee contact email is allowed
         * per organization. The transaction-level advisory lock ensures
         * that create and edit requests using this email are serialized.
         */
        if (email) {
          await client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
            [`employee-contact-email:${actor.organizationId}:${email}`],
          );

          const duplicateEmailResult = await client.query(
            `SELECT id
             FROM public.employees
             WHERE organization_id = $1
               AND LOWER(BTRIM(email)) = $2
             LIMIT 1`,
            [actor.organizationId, email],
          );

          if (duplicateEmailResult.rows.length > 0) {
            throw new WorkforceRuleError(
              "An employee with this email address already exists in your organization.",
              409,
              "DUPLICATE_EMPLOYEE_EMAIL",
            );
          }
        }

        const role =
          await requireOrganizationWorkforceRole(
            client,
            actor.organizationId,
            workforceRole,
          );

        let resolvedDepartmentId: string | null = null;
        let resolvedManagerId: string | null = null;

        if (workforceRole === "HR_MANAGER") {
          if (departmentId || managerId) {
            throw new WorkforceRuleError(
              "An HR Manager cannot be assigned a department or employee manager.",
              400,
              "INVALID_HR_MANAGER_HIERARCHY",
            );
          }
        }

        if (workforceRole === "DEPARTMENT_MANAGER") {
          if (departmentId) {
            throw new WorkforceRuleError(
              "A Department Manager must be assigned to departments through department management.",
              400,
              "INVALID_DEPARTMENT_MANAGER_ASSIGNMENT",
            );
          }

          if (
            actor.kind === "ORGANIZATION_USER" &&
            actor.roleName === "HR_MANAGER" &&
            managerId &&
            managerId !== actor.employeeId
          ) {
            throw new WorkforceRuleError(
              "HR Managers can only create Department Managers who report to themselves.",
              403,
              "INVALID_HR_MANAGER_REPORTING_LINE",
            );
          }

          let selectedHrManagerId: string | null = null;

          if (
            actor.kind === "ORGANIZATION_USER" &&
            actor.roleName === "HR_MANAGER"
          ) {
            selectedHrManagerId = actor.employeeId;
          } else if (managerId) {
            selectedHrManagerId = managerId;
          } else {
            const primaryManagerResult =
              await client.query<{ id: string }>(
                `
                  SELECT e.id
                  FROM public.employees AS e
                  JOIN public.roles AS r
                    ON r.id = e.workforce_role_id
                   AND r.organization_id = e.organization_id
                  WHERE e.organization_id = $1
                    AND e.employment_status = 'ACTIVE'
                    AND e.is_primary_hr_manager IS TRUE
                    AND r.name = 'HR_MANAGER'
                    AND EXISTS (
                      SELECT 1
                      FROM public.users AS u
                      WHERE u.employee_id = e.id
                        AND u.organization_id = e.organization_id
                        AND u.status = 'ACTIVE'
                        AND u.role_id = e.workforce_role_id
                    )
                  FOR SHARE OF e
                `,
                [actor.organizationId],
              );

            selectedHrManagerId =
              primaryManagerResult.rows[0]?.id ?? null;
          }

          if (!selectedHrManagerId) {
            throw new WorkforceRuleError(
              "An active Primary HR Manager is required before creating a Department Manager.",
              409,
              "PRIMARY_HR_MANAGER_REQUIRED",
            );
          }

          const hrManagerResult =
            await client.query<{ id: string }>(
              `
                SELECT e.id
                FROM public.employees AS e
                JOIN public.roles AS r
                  ON r.id = e.workforce_role_id
                 AND r.organization_id = e.organization_id
                WHERE e.id = $1
                  AND e.organization_id = $2
                  AND e.employment_status = 'ACTIVE'
                  AND r.name = 'HR_MANAGER'
                  AND EXISTS (
                    SELECT 1
                    FROM public.users AS u
                    WHERE u.employee_id = e.id
                      AND u.organization_id = e.organization_id
                      AND u.status = 'ACTIVE'
                      AND u.role_id = e.workforce_role_id
                  )
                FOR SHARE OF e
              `,
              [
                selectedHrManagerId,
                actor.organizationId,
              ],
            );

          if (hrManagerResult.rows.length !== 1) {
            throw new WorkforceRuleError(
              "The reporting manager must be an active HR Manager with an active account in this organization.",
              400,
              "INVALID_HR_MANAGER",
            );
          }

          resolvedManagerId = selectedHrManagerId;
        }

        if (workforceRole === "EMPLOYEE") {
          if (!departmentId) {
            throw new WorkforceRuleError(
              "Select an active department with an eligible Department Manager before creating an Employee profile.",
              400,
              "EMPLOYEE_DEPARTMENT_REQUIRED",
            );
          }

          const departmentResult =
            await client.query<{
              department_id: string;
              manager_id: string;
            }>(
              `
                SELECT
                  d.id AS department_id,
                  m.id AS manager_id
                FROM public.departments AS d
                JOIN public.employees AS m
                  ON m.id = d.manager_id
                 AND m.organization_id = d.organization_id
                JOIN public.roles AS mr
                  ON mr.id = m.workforce_role_id
                 AND mr.organization_id = m.organization_id
                WHERE d.id = $1
                  AND d.organization_id = $2
                  AND d.status = 'ACTIVE'
                  AND m.employment_status = 'ACTIVE'
                  AND mr.name = 'DEPARTMENT_MANAGER'
                  AND EXISTS (
                    SELECT 1
                    FROM public.users AS u
                    WHERE u.employee_id = m.id
                      AND u.organization_id = m.organization_id
                      AND u.status = 'ACTIVE'
                      AND u.role_id = m.workforce_role_id
                  )
                FOR SHARE OF d, m
              `,
              [departmentId, actor.organizationId],
            );

          const department = departmentResult.rows[0];

          if (!department) {
            throw new WorkforceRuleError(
              "The selected department must be active and have an active Department Manager with an active account.",
              409,
              "DEPARTMENT_MANAGER_REQUIRED",
            );
          }

          resolvedDepartmentId = department.department_id;
          resolvedManagerId = department.manager_id;
        }

        const result = await client.query(
          `
            WITH inserted AS (
              INSERT INTO public.employees (
                organization_id,
                employee_code,
                first_name,
                last_name,
                email,
                phone,
                emergency_contact_name,
                emergency_contact_relationship,
                emergency_contact_phone,
                country,
                city,
                designation,
                manager_id,
                joining_date,
                employment_status,
                department_id,
                workforce_role_id
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, 'INACTIVE', $15, $16
              )
              RETURNING
                id,
                organization_id,
                employee_code,
                first_name,
                last_name,
                email,
                phone,
                emergency_contact_name,
                emergency_contact_relationship,
                emergency_contact_phone,
                country,
                city,
                designation,
                manager_id,
                joining_date,
                employment_status,
                department_id,
                workforce_role_id,
                created_at,
                updated_at
            )
            SELECT
              i.id,
              i.organization_id,
              i.employee_code,
              i.first_name,
              i.last_name,
              i.email,
              i.phone,
              i.emergency_contact_name,
              i.emergency_contact_relationship,
              i.emergency_contact_phone,
              i.country,
              i.city,
              i.designation,
              i.manager_id,
              i.joining_date,
              i.employment_status,
              i.department_id,
              d.name AS department_name,
              r.name AS workforce_role,
              i.created_at,
              i.updated_at
            FROM inserted AS i
            JOIN public.roles AS r
              ON r.id = i.workforce_role_id
             AND r.organization_id = i.organization_id
            LEFT JOIN public.departments AS d
              ON d.id = i.department_id
             AND d.organization_id = i.organization_id
          `,
          [
            actor.organizationId,
            employeeCode,
            firstName,
            lastName,
            email,
            phone,
            emergencyContactName,
            emergencyContactRelationship,
            emergencyContactPhone,
            country,
            city,
            designation,
            resolvedManagerId,
            joiningDate,
            resolvedDepartmentId,
            role.id,
          ],
        );

        const employee = result.rows[0];

        if (!employee) {
          throw new Error(
            "Workforce profile insertion returned no record",
          );
        }

        await writeEmployeeHistory(client, {
          organizationId: actor.organizationId,
          employeeId: employee.id,
          actorUserId: actor.userId,
          eventType: "PROFILE_CREATED",
          reason:
            "Workforce profile created inactive pending invitation acceptance.",
          beforeState: {},
          afterState: {
            employee_code: employee.employee_code,
            employment_status: "INACTIVE",
            workforce_role: role.name,
            account_status: "NONE",
            department_id: employee.department_id,
            manager_id: employee.manager_id,
          },
          metadata: {
            workflow: "workforce_profile_creation",
          },
        });

        return employee;
      });

    return jsonResponse(
      {
        status: "ok",
        message:
          "Workforce profile created inactive. Prepare its invitation to activate the account.",
        employee: createdEmployee,
      },
      201,
    );
  } catch (error) {
    if (error instanceof WorkforceRuleError) {
      return jsonResponse(
        { message: error.message },
        error.status,
      );
    }

    const dbError = error as {
      code?: string;
      constraint?: string;
    };

    if (
      dbError.code === "23505" &&
      dbError.constraint === "uq_employees_org_code"
    ) {
      return jsonResponse(
        {
          message:
            "This employee code already exists in your organization",
        },
        409,
      );
    }

    if (
      dbError.code === "23505" &&
      dbError.constraint === "uq_employees_org_normalized_email"
    ) {
      return jsonResponse(
        {
          message:
            "An employee with this email address already exists in your organization.",
        },
        409,
      );
    }

    if (dbError.code === "23503") {
      return jsonResponse(
        {
          message:
            "The selected manager, department, or workforce role is invalid for your organization",
        },
        400,
      );
    }

    if (dbError.code === "23514") {
      return jsonResponse(
        {
          message:
            "Workforce data violates a database validation rule",
        },
        400,
      );
    }

    console.error("Failed to create workforce profile:", error);

    return jsonResponse(
      {
        message:
          "Unable to create workforce profile right now",
      },
      500,
    );
  }
}