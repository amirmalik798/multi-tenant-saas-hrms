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

const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;

function jsonResponse(
  body: unknown,
  init: number | ResponseInit = 200,
) {
  const responseInit =
    typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return NextResponse.json(body, {
    ...responseInit,
    headers,
  });
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

    if (
  !isDepartmentManager &&
  !hasTenantPermission(actor, "department.view")
) {
  return jsonResponse(
    {
      message:
        "You do not have permission to view departments",
    },
    403,
  );
}

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const includeInactive =
      url.searchParams.get("includeInactive") === "true";
    const search = (url.searchParams.get("q") ?? "")
      .trim()
      .replace(/\s+/g, " ");
    const requestedStatus = (
      url.searchParams.get("status") ?? ""
    )
      .trim()
      .toUpperCase();

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

    if (search.length > 100) {
      return jsonResponse(
        {
          message:
            "Department search must not exceed 100 characters",
        },
        400,
      );
    }

    if (
      requestedStatus &&
      !["ACTIVE", "INACTIVE"].includes(requestedStatus)
    ) {
      return jsonResponse(
        {
          message: "Status must be ACTIVE or INACTIVE",
        },
        400,
      );
    }

    const organizationResult = await pool.query<{
      status: string;
    }>(
      "SELECT status FROM public.organizations WHERE id = $1 LIMIT 1",
      [actor.organizationId],
    );

    if (organizationResult.rows[0]?.status !== "ACTIVE") {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const where: string[] = ["d.organization_id = $1"];
    const filterValues: unknown[] = [actor.organizationId];

    if (requestedStatus) {
      filterValues.push(requestedStatus);
      where.push(`d.status = $${filterValues.length}`);
    } else if (!includeInactive) {
      where.push("d.status = 'ACTIVE'");
    }

    if (search) {
      filterValues.push(`%${search}%`);
      const searchParam = `$${filterValues.length}`;

      where.push(`(
        d.name ILIKE ${searchParam}
        OR COALESCE(d.description, '') ILIKE ${searchParam}
        OR NULLIF(
          TRIM(CONCAT_WS(' ', manager.first_name, manager.last_name)),
          ''
        ) ILIKE ${searchParam}
        OR COALESCE(manager.employee_code, '') ILIKE ${searchParam}
        OR COALESCE(manager.email, '') ILIKE ${searchParam}
      )`);
    }

    // Department Managers can only see departments assigned to them.
    // The organization scope remains mandatory for every actor.
    if (
      isDepartmentManager &&
      actor.kind === "ORGANIZATION_USER"
    ) {
      filterValues.push(actor.employeeId);
      where.push(
        `d.manager_id = $${filterValues.length}::uuid`,
      );
    }

    const whereSql = where.join("\n        AND ");

    const countQuery = `
      SELECT COUNT(DISTINCT d.id)::int AS total
      FROM public.departments AS d
      LEFT JOIN public.employees AS manager
        ON manager.id = d.manager_id
       AND manager.organization_id = d.organization_id
      WHERE ${whereSql}
    `;

    const dataValues = [...filterValues, limit, offset];

    const dataQuery = `
      SELECT
        d.id,
        d.organization_id,
        d.name,
        d.description,
        d.status,
        d.manager_id,
        manager.employee_code AS manager_employee_code,
        manager.first_name AS manager_first_name,
        manager.last_name AS manager_last_name,
        NULLIF(
          TRIM(CONCAT_WS(
            ' ',
            manager.first_name,
            manager.last_name
          )),
          ''
        ) AS manager_name,
        manager.email AS manager_email,
        manager_role.name AS manager_role,
        manager.employment_status AS manager_employment_status,
        manager_account.status AS manager_account_status,
        (
          manager.id IS NOT NULL
          AND manager.employment_status = 'ACTIVE'
          AND manager_role.name = 'DEPARTMENT_MANAGER'
          AND manager_role.scope = 'ORGANIZATION'
          AND manager_role.organization_id = d.organization_id
          AND manager_account.status = 'ACTIVE'
          AND manager_account.account_scope = 'ORGANIZATION'
        ) AS manager_eligible,
        COUNT(e.id)::int AS total_employee_count,
        COUNT(e.id) FILTER (
          WHERE e.employment_status = 'ACTIVE'
        )::int AS employee_count,
        COUNT(e.id) FILTER (
          WHERE e.employment_status = 'ACTIVE'
        )::int AS active_employee_count,
        COUNT(e.id) FILTER (
          WHERE e.employment_status = 'INACTIVE'
        )::int AS inactive_employee_count,
        COUNT(e.id) FILTER (
          WHERE e.employment_status = 'FORMER'
        )::int AS former_employee_count
      FROM public.departments AS d
      LEFT JOIN public.employees AS manager
        ON manager.id = d.manager_id
       AND manager.organization_id = d.organization_id
      LEFT JOIN public.roles AS manager_role
        ON manager_role.id = manager.workforce_role_id
       AND manager_role.organization_id = manager.organization_id
      LEFT JOIN LATERAL (
        SELECT u.status, u.account_scope
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
      LEFT JOIN public.employees AS e
        ON e.department_id = d.id
       AND e.organization_id = d.organization_id
      WHERE ${whereSql}
      GROUP BY
        d.id,
        d.organization_id,
        d.name,
        d.description,
        d.status,
        d.manager_id,
        manager.id,
        manager.employee_code,
        manager.first_name,
        manager.last_name,
        manager.email,
        manager.employment_status,
        manager_role.name,
        manager_role.scope,
        manager_role.organization_id,
        manager_account.status,
        manager_account.account_scope
      ORDER BY LOWER(d.name) ASC, d.id ASC
      LIMIT $${filterValues.length + 1}
      OFFSET $${filterValues.length + 2}
    `;

    const [result, countResult] = await Promise.all([
      pool.query(dataQuery, dataValues),
      pool.query(countQuery, filterValues),
    ]);

    const total = Number(
      countResult.rows[0]?.total ?? 0,
    );

    return jsonResponse({
      status: "ok",
      departments: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasPreviousPage: page > 1,
        hasNextPage: page * limit < total,
      },
      filters: {
        q: search || null,
        status:
          requestedStatus ||
          (includeInactive ? "ALL" : "ACTIVE"),
      },
    });
  } catch (error) {
    console.error("Failed to load departments:", error);

    return jsonResponse(
      { message: "Unable to load departments right now" },
      500,
    );
  }
}

export async function POST(request: Request) {
  // Check CSRF protection and JSON body before an authenticated write.
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) return parsedBody.response;

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

  const input = parsedBody.body as Record<string, unknown>;

  if (typeof input.name !== "string") {
    return jsonResponse(
      { message: "Department name is required" },
      400,
    );
  }

  const name = input.name.trim().replace(/\s+/g, " ");

  if (!name) {
    return jsonResponse(
      { message: "Department name is required" },
      400,
    );
  }

  if (name.length > 100) {
    return jsonResponse(
      {
        message:
          "Department name cannot exceed 100 characters",
      },
      400,
    );
  }

  let description: string | null = null;

  if (
    input.description !== undefined &&
    input.description !== null
  ) {
    if (typeof input.description !== "string") {
      return jsonResponse(
        { message: "Invalid department description" },
        400,
      );
    }

    description =
      input.description.trim().replace(/\s+/g, " ") || null;

    if (description && description.length > 2000) {
      return jsonResponse(
        {
          message:
            "Department description cannot exceed 2000 characters",
        },
        400,
      );
    }
  }

  // Department ownership is deliberately not accepted in this request body.
  // Ownership is controlled by the dedicated manager-assignment flow.
  const actor = await getTenantPermissionActor().catch((error) => {
    console.error("Failed to resolve department actor:", error);
    return null;
  });

  if (!actor) {
    return jsonResponse(
      { message: "Authentication required" },
      401,
    );
  }

  if (!hasTenantPermission(actor, "department.create")) {
    return jsonResponse(
      {
        message:
          "You do not have permission to create departments",
      },
      403,
    );
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Lock the tenant row while checking and creating a department.
    // This serializes department-name uniqueness checks per organization.
    const organizationResult = await client.query<{
      status: string;
    }>(
      `SELECT status
       FROM public.organizations
       WHERE id = $1
       FOR UPDATE`,
      [actor.organizationId],
    );

    if (organizationResult.rows[0]?.status !== "ACTIVE") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const duplicateResult = await client.query(
      `SELECT 1
       FROM public.departments
       WHERE organization_id = $1
         AND LOWER(TRIM(name)) = LOWER($2)
       LIMIT 1`,
      [actor.organizationId, name],
    );

    if (duplicateResult.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "A department with this name already exists in your organization",
        },
        409,
      );
    }

    const result = await client.query(
      `INSERT INTO public.departments (
         organization_id,
         name,
         description
       )
       VALUES ($1, $2, $3)
       RETURNING id, organization_id, name, description, status`,
      [actor.organizationId, name, description],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return jsonResponse(
      {
        status: "ok",
        message: "Department created successfully",
        department: result.rows[0],
      },
      201,
    );
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Failed to roll back department creation:",
          rollbackError,
        );
      }
    }

    const dbError = error as {
      code?: string;
      constraint?: string;
    };

    if (dbError.code === "23505") {
      return jsonResponse(
        {
          message:
            "A department with this name already exists in your organization",
        },
        409,
      );
    }

    if (dbError.code === "23503") {
      return jsonResponse(
        {
          message:
            "The organization reference for this department is invalid",
        },
        400,
      );
    }

    console.error("Failed to create department:", error);

    return jsonResponse(
      { message: "Unable to create department right now" },
      500,
    );
  } finally {
    client.release();
  }
}