import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "../../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import { writeEmployeeHistory } from "../../../../lib/workforce";
import {
  EMPLOYEE_CODE_VALIDATION_MESSAGE,
  isValidEmployeeCode,
  normalizeEmployeeCode,
  normalizeWhitespace,
} from "../../../../lib/employee-validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMERGENCY_CONTACT_FIELDS = new Set([
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
]);

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

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    const { id } = await context.params;

    if (!uuidPattern.test(id)) {
      return jsonResponse(
        { message: "Invalid employee ID" },
        400,
      );
    }

    const isDepartmentManager =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER";

    const isSelfEmployee =
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "EMPLOYEE";

    const isOwnWorkforceProfile =
      actor.kind === "ORGANIZATION_USER" &&
      id === actor.employeeId;

    const canViewEmergencyContact =
      actor.kind === "ORGANIZATION_ADMIN" ||
      (actor.kind === "ORGANIZATION_USER" &&
        ((actor.roleName === "HR_MANAGER" &&
          hasTenantPermission(actor, "employee.view")) ||
          (isDepartmentManager && !isOwnWorkforceProfile) ||
          isOwnWorkforceProfile));

    const emergencyContactSelect = canViewEmergencyContact
      ? `e.emergency_contact_name,
          e.emergency_contact_relationship,
          e.emergency_contact_phone,`
      : "";

    if (isSelfEmployee) {
      if (!hasTenantPermission(actor, "employee.self.view")) {
        return jsonResponse(
          {
            message:
              "You do not have permission to view your employee profile",
          },
          403,
        );
      }

      if (id !== actor.employeeId) {
        return jsonResponse(
          { message: "Employee not found" },
          404,
        );
      }
    } else if (
      isDepartmentManager &&
      isOwnWorkforceProfile
    ) {
      // Department Managers may read their own profile only; the target ID
      // must match the authenticated employee ID.
    } else if (
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

    const restrictToManagedDepartments =
      isDepartmentManager && !isOwnWorkforceProfile;

    const departmentManagerPredicate =
      restrictToManagedDepartments
        ? `AND EXISTS (
             SELECT 1
             FROM public.departments AS assigned_department
             WHERE assigned_department.id = e.department_id
               AND assigned_department.organization_id = e.organization_id
               AND assigned_department.manager_id = $3::uuid
           )`
        : "";

    const queryValues: unknown[] = [
      id,
      actor.organizationId,
    ];

    if (
      restrictToManagedDepartments &&
      actor.kind === "ORGANIZATION_USER"
    ) {
      queryValues.push(actor.employeeId);
    }

    const result = await pool.query(
      `SELECT
         e.id,
         e.organization_id,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.email,
         e.phone,
         ${emergencyContactSelect}
         e.country,
         e.city,
         e.designation,
         e.manager_id,
         e.is_primary_hr_manager,
         workforce_role.name AS workforce_role,
         CASE
           WHEN m.id IS NOT NULL
           THEN CONCAT_WS(' ', m.first_name, m.last_name)
           ELSE NULL
         END AS manager_name,
         m.employee_code AS manager_employee_code,
         m.first_name AS manager_first_name,
         m.last_name AS manager_last_name,
         m.email AS manager_email,
         m.employment_status AS manager_employment_status,
         manager_role.name AS manager_workforce_role,
         manager_account.status AS manager_account_status,
         e.joining_date::text AS joining_date,
         e.employment_status,
         e.department_id,
         d.name AS department_name,
         COALESCE((
           SELECT json_agg(
             json_build_object(
               'id', managed_department.id,
               'name', managed_department.name,
               'status', managed_department.status
             )
             ORDER BY
               managed_department.name ASC,
               managed_department.id ASC
           )
           FROM public.departments AS managed_department
           WHERE managed_department.organization_id = e.organization_id
             AND managed_department.manager_id = e.id
         ), '[]'::json) AS managed_departments,
         (
           SELECT COUNT(*)::int
           FROM public.departments AS managed_department
           WHERE managed_department.organization_id = e.organization_id
             AND managed_department.manager_id = e.id
         ) AS managed_department_count,
         e.created_at,
         e.updated_at
       FROM public.employees AS e
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS workforce_role
         ON workforce_role.id = e.workforce_role_id
        AND workforce_role.organization_id = e.organization_id
       LEFT JOIN public.employees AS m
         ON m.id = e.manager_id
        AND m.organization_id = e.organization_id
       LEFT JOIN public.roles AS manager_role
         ON manager_role.id = m.workforce_role_id
        AND manager_role.organization_id = m.organization_id
       LEFT JOIN LATERAL (
         SELECT u.status
         FROM public.users AS u
         WHERE u.employee_id = m.id
           AND u.organization_id = m.organization_id
           AND u.role_id = m.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
         ORDER BY
           CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
           u.updated_at DESC NULLS LAST,
           u.created_at DESC NULLS LAST
         LIMIT 1
       ) AS manager_account ON TRUE
       WHERE e.id = $1
         AND e.organization_id = $2
         ${departmentManagerPredicate}
       LIMIT 1`,
      queryValues,
    );

    const employee = result.rows[0];

    if (!employee) {
      return jsonResponse(
        { message: "Employee not found" },
        404,
      );
    }

    return jsonResponse({
      status: "ok",
      employee,
    });
  } catch (error) {
    console.error("Failed to load employee details:", error);

    return jsonResponse(
      {
        message: "Unable to load employee details right now",
      },
      500,
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body: unknown = parsedBody.body;
  const actor = await getTenantPermissionActor();

  if (!actor) {
    return jsonResponse(
      { message: "Authentication required" },
      401,
    );
  }

  const { id } = await context.params;

  if (!uuidPattern.test(id)) {
    return jsonResponse(
      { message: "Invalid employee ID" },
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return jsonResponse(
      { message: "Invalid request body" },
      400,
    );
  }

  const input = body as Record<string, unknown>;

  const wantsPrimaryDesignation =
    Object.prototype.hasOwnProperty.call(
      input,
      "is_primary_hr_manager",
    );

  if (wantsPrimaryDesignation) {
    if (actor.kind !== "ORGANIZATION_ADMIN") {
      return jsonResponse(
        {
          message:
            "Only the Organization Admin can designate the Primary HR Manager",
        },
        403,
      );
    }

    if (input.is_primary_hr_manager !== true) {
      return jsonResponse(
        {
          message:
            "Set is_primary_hr_manager to true on an eligible HR Manager to transfer the designation. The current Primary HR Manager cannot be unset without a replacement.",
        },
        400,
      );
    }
  }

  const isDepartmentManager =
    actor.kind === "ORGANIZATION_USER" &&
    actor.roleName === "DEPARTMENT_MANAGER";

  const isSelfEmployee =
    actor.kind === "ORGANIZATION_USER" &&
    actor.roleName === "EMPLOYEE";

  const isSelfWorkforceProfile =
    actor.kind === "ORGANIZATION_USER" &&
    id === actor.employeeId;

  // Preserve the existing self-only not-found behavior before field-level checks.
  if (isSelfEmployee && id !== actor.employeeId) {
    return jsonResponse(
      { message: "Employee not found" },
      404,
    );
  }

  const requestedEmergencyFields = Object.keys(input).filter((field) =>
    EMERGENCY_CONTACT_FIELDS.has(field),
  );

  const canEditEmergencyContact =
    actor.kind === "ORGANIZATION_ADMIN" ||
    (actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "HR_MANAGER" &&
      hasTenantPermission(actor, "employee.update")) ||
    (isSelfWorkforceProfile &&
      (isDepartmentManager ||
        hasTenantPermission(actor, "employee.self.update")));

  const selfServiceAllowedFields = new Set([
    "phone",
    "city",
    "country",
    "emergency_contact_name",
    "emergency_contact_relationship",
    "emergency_contact_phone",
  ]);

  const isOwnSelfServiceUpdate =
    isSelfWorkforceProfile &&
    Object.keys(input).length > 0 &&
    Object.keys(input).every((field) => selfServiceAllowedFields.has(field)) &&
    (isDepartmentManager ||
      hasTenantPermission(actor, "employee.self.update"));

  if (requestedEmergencyFields.length > 0 && !canEditEmergencyContact) {
    return jsonResponse(
      { message: "You do not have permission to view or update emergency contact details" },
      403,
    );
  }

  const canEditFullProfile =
    hasTenantPermission(actor, "employee.update") &&
    (
      actor.kind === "ORGANIZATION_ADMIN" ||
      actor.roleName === "HR_MANAGER"
    );

  // Department Managers receive a route-specific status-change allowance.
  // The target employee is still constrained to an assigned department below.
  const canChangeStatus =
    hasTenantPermission(actor, "employee.status.change") ||
    isDepartmentManager;

  if (isSelfEmployee) {
    if (!hasTenantPermission(actor, "employee.self.update")) {
      return jsonResponse(
        {
          message:
            "You do not have permission to update your employee profile",
        },
        403,
      );
    }
  } else if (isDepartmentManager) {
    if (!canChangeStatus && !isOwnSelfServiceUpdate) {
      return jsonResponse(
        {
          message:
            "You do not have permission to change employee status",
        },
        403,
      );
    }
  } else if (!canEditFullProfile) {
    return jsonResponse(
      {
        message:
          "You do not have permission to update employee records",
      },
      403,
    );
  }

  const allowedFields = [
    "employee_code",
    "first_name",
    "last_name",
    "email",
    "phone",
    "country",
    "city",
    "emergency_contact_name",
    "emergency_contact_relationship",
    "emergency_contact_phone",
    "designation",
    "manager_id",
    "joining_date",
    "employment_status",
    "department_id",
  ] as const;

  if (
    isSelfEmployee &&
    Object.keys(input).some(
      (field) => !selfServiceAllowedFields.has(field),
    )
  ) {
    return jsonResponse(
      {
        message:
          "Employees may update only their own phone, city, country, and emergency contact details through self-service.",
      },
      403,
    );
  }

  if (
    isDepartmentManager &&
    Object.keys(input).some(
      (field) =>
        field !== "employment_status" &&
        !(isOwnSelfServiceUpdate && selfServiceAllowedFields.has(field)),
    )
  ) {
    return jsonResponse(
      {
        message:
          "Department Managers may change employment status only for employees in their assigned departments.",
      },
      403,
    );
  }

  const unknownFields = Object.keys(input).filter(
    (field) =>
      field !== "is_primary_hr_manager" &&
      !allowedFields.includes(
        field as (typeof allowedFields)[number],
      ),
  );

  if (unknownFields.length > 0) {
    return jsonResponse(
      { message: "One or more fields cannot be updated" },
      400,
    );
  }

  const updates: {
    column: string;
    value: string | null;
  }[] = [];

  let requestedManagerId: string | null | undefined;

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      continue;
    }

    const rawValue = input[field];

    if (field === "manager_id") {
      if (
        rawValue !== null &&
        typeof rawValue !== "string"
      ) {
        return jsonResponse(
          { message: "Invalid manager_id" },
          400,
        );
      }

      const value =
        typeof rawValue === "string"
          ? normalizeWhitespace(rawValue)
          : "";

      if (value && !uuidPattern.test(value)) {
        return jsonResponse(
          { message: "Invalid manager_id" },
          400,
        );
      }

      requestedManagerId = value || null;
      continue;
    }

    if (field === "employee_code") {
      if (typeof rawValue !== "string") {
        return jsonResponse(
          { message: "employee_code must be a non-empty string" },
          400,
        );
      }

      const value = normalizeEmployeeCode(rawValue);

      if (!isValidEmployeeCode(value)) {
        return jsonResponse(
          {
            message: EMPLOYEE_CODE_VALIDATION_MESSAGE,
          },
          400,
        );
      }

      updates.push({ column: field, value });
      continue;
    }

    if (field === "first_name") {
      if (typeof rawValue !== "string") {
        return jsonResponse(
          { message: "first_name must be a non-empty string" },
          400,
        );
      }

      const value = normalizeWhitespace(rawValue);

      if (
        value.length < 2 ||
        value.length > 100 ||
        !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value)
      ) {
        return jsonResponse(
          {
            message:
              "First name must be 2–100 characters and use letters, spaces, apostrophes, periods, or hyphens",
          },
          400,
        );
      }

      updates.push({ column: field, value });
      continue;
    }

    if (field === "employment_status") {
      if (typeof rawValue !== "string") {
        return jsonResponse(
          { message: "Invalid employment status" },
          400,
        );
      }

      const value = rawValue.trim().toUpperCase();

      if (!["ACTIVE", "INACTIVE", "FORMER"].includes(value)) {
        return jsonResponse(
          {
            message:
              "Employment status must be ACTIVE, INACTIVE, or FORMER",
          },
          400,
        );
      }

      updates.push({ column: field, value });
      continue;
    }

    if (
      rawValue !== null &&
      typeof rawValue !== "string"
    ) {
      return jsonResponse(
        { message: `Invalid value for ${field}` },
        400,
      );
    }

    const value =
      typeof rawValue === "string"
        ? normalizeWhitespace(rawValue)
        : "";

    if (field === "emergency_contact_name") {
      if (
        value &&
        (
          value.length < 2 ||
          value.length > 120 ||
          !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value)
        )
      ) {
        return jsonResponse(
          { message: "Emergency contact name must be 2–120 characters and use letters, spaces, apostrophes, periods, or hyphens" },
          400,
        );
      }

      updates.push({ column: field, value: value || null });
      continue;
    }

    if (field === "emergency_contact_relationship") {
      if (
        value &&
        (
          value.length < 2 ||
          value.length > 80 ||
          !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value)
        )
      ) {
        return jsonResponse(
          { message: "Emergency contact relationship must be 2–80 characters and use letters, spaces, apostrophes, periods, or hyphens" },
          400,
        );
      }

      updates.push({ column: field, value: value || null });
      continue;
    }

    if (field === "emergency_contact_phone") {
      const digits = value.replace(/\D/g, "").length;

      if (
        value.length > 30 ||
        (value && (
          !/^\+?[0-9][0-9\s().-]*$/.test(value) ||
          digits < 7 ||
          digits > 15
        ))
      ) {
        return jsonResponse(
          { message: "Emergency contact phone must contain 7 to 15 digits and only phone-number characters" },
          400,
        );
      }

      updates.push({ column: field, value: value || null });
      continue;
    }

    if (field === "designation") {
      if (!value) {
        return jsonResponse(
          { message: "Designation is required" },
          400,
        );
      }

      if (value.length > 100) {
        return jsonResponse(
          { message: "Designation must not exceed 100 characters" },
          400,
        );
      }

      updates.push({ column: field, value });
      continue;
    }

    if (field === "country" || field === "city") {
      if (!value) {
        return jsonResponse(
          {
            message:
              `${field === "country" ? "Country" : "City"} is required`,
          },
          400,
        );
      }

      if (value.length > 100) {
        return jsonResponse(
          {
            message:
              `${field === "country" ? "Country" : "City"} must not exceed 100 characters`,
          },
          400,
        );
      }

      updates.push({ column: field, value });
      continue;
    }

    if (
      field === "last_name" &&
      value &&
      (
        value.length < 2 ||
        value.length > 100 ||
        !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value)
      )
    ) {
      return jsonResponse(
        { message: "Last name must be 2–100 characters and use letters, spaces, apostrophes, periods, or hyphens" },
        400,
      );
    }

    if (field === "email" && value) {
      const email = value.toLowerCase();

      if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return jsonResponse(
          { message: "Invalid email address" },
          400,
        );
      }

      updates.push({ column: field, value: email });
      continue;
    }

    if (field === "phone") {
      if (value.length > 50) {
        return jsonResponse(
          {
            message:
              "Enter a valid phone number containing 7–15 digits and only phone-number characters",
          },
          400,
        );
      }

      if (
        value &&
        (
          !/^\+?[0-9][0-9\s().-]*$/.test(value) ||
          (value.match(/[0-9]/g) ?? []).length < 7 ||
          (value.match(/[0-9]/g) ?? []).length > 15
        )
      ) {
        return jsonResponse(
          {
            message:
              "Enter a valid phone number containing 7–15 digits and only phone-number characters",
          },
          400,
        );
      }

      updates.push({
        column: field,
        value: value ? value.replace(/\s+/g, " ") : null,
      });
      continue;
    }

    if (field === "department_id") {
      if (value && !uuidPattern.test(value)) {
        return jsonResponse(
          { message: "Invalid department_id" },
          400,
        );
      }

      updates.push({
        column: field,
        value: value || null,
      });
      continue;
    }

    if (field === "joining_date" && value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return jsonResponse(
          {
            message:
              "Joining date must use YYYY-MM-DD format",
          },
          400,
        );
      }

      const date = new Date(`${value}T00:00:00.000Z`);

      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        return jsonResponse(
          { message: "Invalid joining date" },
          400,
        );
      }

      updates.push({ column: field, value });
      continue;
    }

    const nullableFields = [
      "last_name",
      "email",
      "phone",
      "joining_date",
    ];

    if (nullableFields.includes(field)) {
      updates.push({
        column: field,
        value: value || null,
      });
    }
  }

  const employmentStatusUpdate = updates.find(
    (update) => update.column === "employment_status",
  );

  if (employmentStatusUpdate && !canChangeStatus) {
    return jsonResponse(
      {
        message:
          "You do not have permission to change employee status",
      },
      403,
    );
  }

  if (updates.length === 0 && !wantsPrimaryDesignation) {
    return jsonResponse(
      {
        message:
          "Provide at least one editable field to update; a manager is derived from department assignment",
      },
      400,
    );
  }

  let client: PoolClient | null = null;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    if (wantsPrimaryDesignation) {
      const organizationLock = await client.query(
        `SELECT id
         FROM public.organizations
         WHERE id = $1
         FOR UPDATE`,
        [actor.organizationId],
      );

      if (organizationLock.rowCount !== 1) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          { message: "Organization not found" },
          404,
        );
      }
    }

    const existingEmployeeValues: unknown[] = [
      id,
      actor.organizationId,
    ];

    const departmentManagerTargetPredicate =
      isDepartmentManager && !isOwnSelfServiceUpdate
        ? `AND EXISTS (
             SELECT 1
             FROM public.departments AS assigned_department
             WHERE assigned_department.id = e.department_id
               AND assigned_department.organization_id = e.organization_id
               AND assigned_department.manager_id = $3::uuid
           )`
        : "";

    if (
      isDepartmentManager &&
      !isOwnSelfServiceUpdate &&
      actor.kind === "ORGANIZATION_USER"
    ) {
      existingEmployeeValues.push(actor.employeeId);
    }

    const existingResult = await client.query(
      `SELECT
          e.employee_code,
          e.designation,
          e.workforce_role_id,
          employee_role_record.name AS workforce_role_name,
          e.country,
          e.city,
          e.email,
          e.phone,
          e.emergency_contact_name,
          e.emergency_contact_relationship,
          e.emergency_contact_phone,
          e.first_name,
          e.last_name,
          -- Keep PostgreSQL DATE as a date-only string to avoid timezone shifts.
          e.joining_date::text AS joining_date,
          e.employment_status,
          e.department_id,
          e.manager_id,
          e.is_primary_hr_manager
       FROM public.employees AS e
       LEFT JOIN public.roles AS employee_role_record
         ON employee_role_record.id = e.workforce_role_id
        AND employee_role_record.organization_id = e.organization_id
        AND employee_role_record.scope = 'ORGANIZATION'
       WHERE e.id = $1
         AND e.organization_id = $2
         ${departmentManagerTargetPredicate}
       FOR UPDATE OF e`,
      existingEmployeeValues,
    );

    const existingEmployee = existingResult.rows[0];

    // Return a clean 404 before reading fields or attempting a status change.
    // This also covers IDs outside the Department Manager's assigned scope.
    if (!existingEmployee) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        { message: "Employee not found" },
        404,
      );
    }

    // Department Managers may change status only for employee-role records.
    // The lookup above has already enforced organization and assigned-department scope.
    if (
      isDepartmentManager &&
      employmentStatusUpdate &&
      String(existingEmployee.workforce_role_name ?? "").toUpperCase() !==
        "EMPLOYEE"
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "Department Managers may change status only for employees in their assigned departments.",
        },
        403,
      );
    }

    /*
     * Enforce normalized email uniqueness per organization during edits.
     * Exclude the current employee so it can retain its own email.
     * The lock uses the same key as employee creation to serialize
     * concurrent create/edit requests for this email and tenant.
     */
    const requestedEmailUpdate = updates.find(
      (update) => update.column === "email",
    );

    if (requestedEmailUpdate?.value) {
      const normalizedEmail =
        requestedEmailUpdate.value.trim().toLowerCase();

      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        [
          `employee-contact-email:${actor.organizationId}:${normalizedEmail}`,
        ],
      );

      const duplicateEmailResult = await client.query(
        `SELECT id
         FROM public.employees
         WHERE organization_id = $1
           AND id <> $2
           AND LOWER(BTRIM(email)) = $3
         LIMIT 1`,
        [actor.organizationId, id, normalizedEmail],
      );

      if (duplicateEmailResult.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "An employee with this email address already exists in your organization.",
          },
          409,
        );
      }
    }

    const effectiveValue = (
      column: string,
      currentValue: string | null,
    ) => {
      const update = updates.find(
        (candidate) => candidate.column === column,
      );

      return update ? update.value : currentValue;
    };

    const effectiveEmergencyContactName = effectiveValue(
      "emergency_contact_name",
      existingEmployee.emergency_contact_name,
    );

    const effectiveEmergencyContactRelationship = effectiveValue(
      "emergency_contact_relationship",
      existingEmployee.emergency_contact_relationship,
    );

    const effectiveEmergencyContactPhone = effectiveValue(
      "emergency_contact_phone",
      existingEmployee.emergency_contact_phone,
    );

    const emergencyContactHasAnyValue = Boolean(
      effectiveEmergencyContactName ||
      effectiveEmergencyContactRelationship ||
      effectiveEmergencyContactPhone,
    );

    if (
      emergencyContactHasAnyValue &&
      (!effectiveEmergencyContactName || !effectiveEmergencyContactPhone)
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "Provide both an emergency contact name and phone number, or leave all emergency contact fields blank. Relationship is optional.",
        },
        400,
      );
    }

    const canViewUpdatedEmergencyContact =
      actor.kind === "ORGANIZATION_ADMIN" ||
      (actor.kind === "ORGANIZATION_USER" &&
        ((actor.roleName === "HR_MANAGER" &&
          hasTenantPermission(actor, "employee.update")) ||
          isSelfWorkforceProfile));

    const emergencyContactSelectForResponse =
      canViewUpdatedEmergencyContact
        ? `e.emergency_contact_name,
          e.emergency_contact_relationship,
          e.emergency_contact_phone,`
        : "";

    const effectiveCountry = effectiveValue(
      "country",
      existingEmployee.country,
    );

    const effectiveCity = effectiveValue(
      "city",
      existingEmployee.city,
    );

    if (
      typeof effectiveCountry !== "string" ||
      !effectiveCountry.trim() ||
      typeof effectiveCity !== "string" ||
      !effectiveCity.trim()
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "City and country are required. Provide both before saving this employee.",
        },
        400,
      );
    }

    const effectiveStatus = String(
      effectiveValue(
        "employment_status",
        existingEmployee.employment_status,
      ),
    ).toUpperCase();

    const currentEmploymentStatus = String(
      existingEmployee.employment_status ?? "",
    ).toUpperCase();

    const enteringActiveStatus = Boolean(
      employmentStatusUpdate &&
      currentEmploymentStatus !== "ACTIVE" &&
      effectiveStatus === "ACTIVE",
    );

    let accountToReactivateId: string | null = null;
    let linkedAccountStatusSynchronized = false;
    let pendingInvitationsRevokedCount = 0;

    if (enteringActiveStatus) {
      const targetRoleName = String(
        existingEmployee.workforce_role_name ?? "",
      ).toUpperCase();

      const mayReactivateTarget =
        // Organization Admin can reactivate any workforce member
        // within their own organization.
        actor.kind === "ORGANIZATION_ADMIN" ||

        // HR Manager can reactivate any workforce member
        // within their own organization.
        (
          actor.kind === "ORGANIZATION_USER" &&
          actor.roleName === "HR_MANAGER"
        ) ||

        // Department Manager remains limited to employees
        // in their assigned departments.
        (
          actor.kind === "ORGANIZATION_USER" &&
          actor.roleName === "DEPARTMENT_MANAGER" &&
          targetRoleName === "EMPLOYEE"
        );

      if (!mayReactivateTarget) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Reactivation must be performed by the authorized superior in the workforce hierarchy.",
          },
          403,
        );
      }

      if (currentEmploymentStatus === "FORMER") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Former employees cannot be reactivated through a profile edit. Use the rehire workflow when available.",
          },
          409,
        );
      }

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
          {
            message:
              "Employees cannot be reactivated while the organization is not active.",
          },
          403,
        );
      }

      const linkedAccountsResult = await client.query<{
        id: string;
        role_id: string;
        status: string;
        password_hash: string | null;
      }>(
        `SELECT id, role_id, status, password_hash
         FROM public.users
         WHERE employee_id = $1
           AND organization_id = $2
           AND account_scope = 'ORGANIZATION'
         FOR UPDATE`,
        [id, actor.organizationId],
      );

      const linkedAccounts = linkedAccountsResult.rows;

      if (
        linkedAccounts.length !== 1 ||
        !existingEmployee.workforce_role_id ||
        linkedAccounts[0].role_id !==
          existingEmployee.workforce_role_id
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "This employee cannot be reactivated until exactly one matching workforce account exists. Use invitation acceptance for profiles without an account.",
          },
          409,
        );
      }

      const linkedAccount = linkedAccounts[0];

      if (linkedAccount.status === "SUSPENDED") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The linked workforce account is suspended. Resolve the account suspension before reactivating employment.",
          },
          409,
        );
      }

      if (
        !["ACTIVE", "DEACTIVATED"].includes(
          linkedAccount.status,
        )
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "This account must complete invitation acceptance before the employee can be activated.",
          },
          409,
        );
      }

      if (!linkedAccount.password_hash) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The linked account has no password configured. The employee cannot be reactivated until account setup is completed.",
          },
          409,
        );
      }

      accountToReactivateId = linkedAccount.id;
    }

    const primaryDesignationClearedForStatusChange =
      existingEmployee.is_primary_hr_manager === true &&
      Boolean(employmentStatusUpdate) &&
      effectiveStatus !== "ACTIVE";

    if (primaryDesignationClearedForStatusChange) {
      const designationResult = await client.query(
        `UPDATE public.employees
         SET is_primary_hr_manager = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND organization_id = $2
           AND is_primary_hr_manager IS TRUE
         RETURNING id`,
        [id, actor.organizationId],
      );

      if (designationResult.rowCount !== 1) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The Primary HR Manager designation changed during this request. Reload and try again.",
          },
          409,
        );
      }
    }

    if (
      wantsPrimaryDesignation &&
      effectiveStatus !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "The Primary HR Manager must have ACTIVE employment status",
        },
        409,
      );
    }

    const effectiveDepartmentId = effectiveValue(
      "department_id",
      existingEmployee.department_id,
    );

    const departmentWasSubmitted =
      Object.prototype.hasOwnProperty.call(
        input,
        "department_id",
      );

    const workforceRoleName = String(
      existingEmployee.workforce_role_name ?? "",
    ).toUpperCase();

    let derivedManagerId: string | null = null;

    if (
      ![
        "EMPLOYEE",
        "DEPARTMENT_MANAGER",
        "HR_MANAGER",
      ].includes(workforceRoleName)
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        {
          message:
            "The employee's workforce role is not configured. Resolve the role before updating this profile.",
        },
        409,
      );
    }

    if (workforceRoleName === "EMPLOYEE") {
      if (
        typeof effectiveDepartmentId === "string" &&
        effectiveDepartmentId
      ) {
        const departmentResult = await client.query(
          `SELECT
             d.id,
             d.status,
             d.manager_id,
             manager.employment_status AS manager_employment_status,
             EXISTS (
               SELECT 1
               FROM public.users AS u
               JOIN public.roles AS r
                 ON r.id = u.role_id
                AND r.scope = 'ORGANIZATION'
                AND r.organization_id = u.organization_id
               WHERE u.employee_id = manager.id
                 AND u.organization_id = d.organization_id
                 AND u.account_scope = 'ORGANIZATION'
                 AND u.status = 'ACTIVE'
                 AND r.name = 'DEPARTMENT_MANAGER'
             ) AS manager_account_eligible
           FROM public.departments AS d
           LEFT JOIN public.employees AS manager
             ON manager.id = d.manager_id
            AND manager.organization_id = d.organization_id
           WHERE d.id = $1
             AND d.organization_id = $2
           FOR UPDATE OF d`,
          [
            effectiveDepartmentId,
            actor.organizationId,
          ],
        );

        const department = departmentResult.rows[0];

        if (!department) {
          await client.query("ROLLBACK");
          transactionStarted = false;

          return jsonResponse(
            {
              message:
                "The selected department is invalid for your organization",
            },
            400,
          );
        }

        derivedManagerId = department.manager_id ?? null;

        const mustBeEligible =
          effectiveStatus === "ACTIVE" ||
          departmentWasSubmitted;

        if (
          mustBeEligible &&
          String(department.status).toUpperCase() !== "ACTIVE"
        ) {
          await client.query("ROLLBACK");
          transactionStarted = false;

          return jsonResponse(
            {
              message:
                "An employee can only be assigned to an active department",
            },
            400,
          );
        }

        if (mustBeEligible) {
          const managerIsEligible =
            Boolean(derivedManagerId) &&
            derivedManagerId !== id &&
            String(
              department.manager_employment_status ?? "",
            ).toUpperCase() === "ACTIVE" &&
            department.manager_account_eligible === true;

          if (!managerIsEligible) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return jsonResponse(
              {
                message:
                  "The selected department must have an active, eligible Department Manager with an active account",
              },
              400,
            );
          }
        }
      } else if (effectiveStatus === "ACTIVE") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "An employee must be assigned to an active department with an eligible Department Manager before activation",
          },
          400,
        );
      }

      if (
        requestedManagerId !== undefined &&
        requestedManagerId !== derivedManagerId
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "An employee's manager is derived from the assigned department and cannot be set independently",
          },
          400,
        );
      }
    } else if (workforceRoleName === "DEPARTMENT_MANAGER") {
      if (effectiveDepartmentId) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Department Managers do not have a home department; department ownership is managed separately",
          },
          400,
        );
      }

      const requestedDepartmentManagerSupervisor =
        requestedManagerId !== undefined
          ? requestedManagerId
          : (existingEmployee.manager_id ?? null);

      if (!requestedDepartmentManagerSupervisor) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "A Department Manager must report to an active HR Manager with an active organization account",
          },
          400,
        );
      }

      const hrManagerResult = await client.query(
        `SELECT
           hr_manager.id,
           hr_manager.employment_status,
           hr_manager.department_id,
           hr_manager.manager_id,
           hr_role.name AS role_name,
           EXISTS (
             SELECT 1
             FROM public.users AS u
             JOIN public.roles AS account_role
               ON account_role.id = u.role_id
              AND account_role.organization_id = u.organization_id
              AND account_role.scope = 'ORGANIZATION'
             WHERE u.employee_id = hr_manager.id
               AND u.organization_id = hr_manager.organization_id
               AND u.role_id = hr_manager.workforce_role_id
               AND u.account_scope = 'ORGANIZATION'
               AND u.status = 'ACTIVE'
               AND account_role.name = 'HR_MANAGER'
           ) AS manager_account_eligible
         FROM public.employees AS hr_manager
         JOIN public.roles AS hr_role
           ON hr_role.id = hr_manager.workforce_role_id
          AND hr_role.organization_id = hr_manager.organization_id
          AND hr_role.scope = 'ORGANIZATION'
         WHERE hr_manager.id = $1
           AND hr_manager.organization_id = $2
         FOR UPDATE OF hr_manager`,
        [
          requestedDepartmentManagerSupervisor,
          actor.organizationId,
        ],
      );

      const hrManager = hrManagerResult.rows[0];

      const managerIsEligible = Boolean(
        hrManager &&
        hrManager.id !== id &&
        hrManager.role_name === "HR_MANAGER" &&
        String(
          hrManager.employment_status,
        ).toUpperCase() === "ACTIVE" &&
        hrManager.department_id == null &&
        hrManager.manager_id == null &&
        hrManager.manager_account_eligible === true
      );

      if (!managerIsEligible) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Select an active HR Manager with an active organization account and no department or reporting manager",
          },
          400,
        );
      }

      derivedManagerId =
        requestedDepartmentManagerSupervisor;
    } else {
      if (
        effectiveDepartmentId ||
        (
          requestedManagerId !== undefined &&
          requestedManagerId !== null
        )
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "HR Managers must not have a home department or reporting manager",
          },
          400,
        );
      }

      derivedManagerId = null;
    }

    if (wantsPrimaryDesignation) {
      const primaryCandidate = await client.query<{
        employment_status: string;
        role_name: string;
        department_id: string | null;
        manager_id: string | null;
        active_account_count: number;
      }>(
        `SELECT
           e.employment_status,
           e.department_id,
           e.manager_id,
           r.name AS role_name,
           (
             SELECT COUNT(*)::int
             FROM public.users AS u
             WHERE u.employee_id = e.id
               AND u.organization_id = e.organization_id
               AND u.role_id = e.workforce_role_id
               AND u.account_scope = 'ORGANIZATION'
               AND u.status = 'ACTIVE'
           ) AS active_account_count
         FROM public.employees AS e
         JOIN public.roles AS r
           ON r.id = e.workforce_role_id
          AND r.organization_id = e.organization_id
          AND r.scope = 'ORGANIZATION'
         WHERE e.id = $1
           AND e.organization_id = $2
         FOR UPDATE OF e`,
        [id, actor.organizationId],
      );

      const candidate = primaryCandidate.rows[0];

      if (
        !candidate ||
        candidate.role_name !== "HR_MANAGER" ||
        String(
          candidate.employment_status,
        ).toUpperCase() !== "ACTIVE" ||
        candidate.department_id !== null ||
        candidate.manager_id !== null ||
        Number(candidate.active_account_count) !== 1
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The Primary HR Manager must be an active HR Manager with no department or reporting manager and exactly one active organization account.",
          },
          409,
        );
      }

      const previousPrimaries = await client.query<{
        id: string;
        employee_code: string;
        workforce_role_id: string | null;
        employment_status: string;
        department_id: string | null;
        manager_id: string | null;
        is_primary_hr_manager: boolean;
      }>(
        `SELECT
           id,
           employee_code,
           workforce_role_id,
           employment_status,
           department_id,
           manager_id,
           is_primary_hr_manager
         FROM public.employees
         WHERE organization_id = $1
           AND is_primary_hr_manager IS TRUE
           AND id <> $2
         FOR UPDATE`,
        [actor.organizationId, id],
      );

      await client.query(
        `UPDATE public.employees
         SET is_primary_hr_manager = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1
           AND is_primary_hr_manager IS TRUE
           AND id <> $2`,
        [actor.organizationId, id],
      );

      for (const previous of previousPrimaries.rows) {
        await writeEmployeeHistory(client, {
          organizationId: actor.organizationId,
          employeeId: previous.id,
          actorUserId: actor.userId,
          eventType: "PRIMARY_HR_MANAGER_DEMOTED",
          reason:
            "Primary HR Manager designation transferred to another eligible HR Manager.",
          beforeState: {
            employee_code: previous.employee_code,
            workforce_role_id: previous.workforce_role_id,
            employment_status: previous.employment_status,
            department_id: previous.department_id,
            manager_id: previous.manager_id,
            is_primary_hr_manager: true,
          },
          afterState: {
            employee_code: previous.employee_code,
            workforce_role_id: previous.workforce_role_id,
            employment_status: previous.employment_status,
            department_id: previous.department_id,
            manager_id: previous.manager_id,
            is_primary_hr_manager: false,
          },
          metadata: {
            workflow: "primary_hr_manager_transfer",
            replacement_employee_id: id,
          },
        });
      }
    }

    if (accountToReactivateId) {
      const activatedAccount = await client.query(
        `UPDATE public.users
         SET status = 'ACTIVE',
             session_version = session_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND employee_id = $2
           AND organization_id = $3
           AND role_id = $4
           AND account_scope = 'ORGANIZATION'
           AND status IN ('ACTIVE', 'DEACTIVATED')
         RETURNING id`,
        [
          accountToReactivateId,
          id,
          actor.organizationId,
          existingEmployee.workforce_role_id,
        ],
      );

      if (activatedAccount.rowCount !== 1) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The linked workforce account changed during reactivation. Reload and try again.",
          },
          409,
        );
      }

      linkedAccountStatusSynchronized = true;
    }

    const values = updates.map((update) => update.value);

    const assignments = updates.map(
      (update, index) =>
        `${update.column} = $${index + 1}`,
    );

    if (wantsPrimaryDesignation) {
      assignments.push("is_primary_hr_manager = TRUE");
    }

    values.push(derivedManagerId);
    assignments.push(`manager_id = $${values.length}`);

    values.push(id);
    const employeeIdParam = values.length;

    values.push(actor.organizationId);
    const organizationIdParam = values.length;

    const updateResult = await client.query(
      `UPDATE public.employees
       SET ${assignments.join(", ")},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $${employeeIdParam}
         AND organization_id = $${organizationIdParam}
       RETURNING id`,
      values,
    );

    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return jsonResponse(
        { message: "Employee not found" },
        404,
      );
    }

    if (
      employmentStatusUpdate &&
      effectiveStatus !== "ACTIVE"
    ) {
      const accountStatusResult = await client.query(
        `UPDATE public.users AS u
         SET status = CASE
               WHEN u.status IN ('ACTIVE', 'INVITED')
                 THEN 'DEACTIVATED'
               ELSE u.status
             END,
             session_version = u.session_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE u.employee_id = $1
           AND u.organization_id = $2
           AND u.account_scope = 'ORGANIZATION'
           AND u.status <> 'DEACTIVATED'
         RETURNING u.id`,
        [id, actor.organizationId],
      );

      linkedAccountStatusSynchronized =
        (accountStatusResult.rowCount ?? 0) > 0;
    }

    if (
      employmentStatusUpdate &&
      effectiveStatus === "FORMER"
    ) {
      const revokedInvitations = await client.query(
        `UPDATE public.employee_invitations
         SET status = 'REVOKED',
             revoked_at = COALESCE(
               revoked_at,
               CURRENT_TIMESTAMP
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE employee_id = $1
           AND organization_id = $2
           AND status = 'PENDING'
         RETURNING id`,
        [id, actor.organizationId],
      );

      pendingInvitationsRevokedCount =
        revokedInvitations.rowCount ?? 0;
    }

    const result = await client.query(
      `SELECT
         e.id,
         e.organization_id,
         e.employee_code,
         e.first_name,
         e.last_name,
         e.email,
         e.phone,
         ${emergencyContactSelectForResponse}
         e.country,
         e.city,
         e.designation,
         e.manager_id,
         e.is_primary_hr_manager,
         workforce_role.name AS workforce_role,
         CASE
           WHEN m.id IS NOT NULL
           THEN CONCAT_WS(' ', m.first_name, m.last_name)
           ELSE NULL
         END AS manager_name,
         m.employee_code AS manager_employee_code,
         m.first_name AS manager_first_name,
         m.last_name AS manager_last_name,
         m.email AS manager_email,
         m.employment_status AS manager_employment_status,
         manager_role.name AS manager_workforce_role,
         manager_account.status AS manager_account_status,
         e.joining_date::text AS joining_date,
         e.employment_status,
         e.department_id,
         d.name AS department_name,
         e.created_at,
         e.updated_at
       FROM public.employees AS e
       LEFT JOIN public.departments AS d
         ON d.id = e.department_id
        AND d.organization_id = e.organization_id
       LEFT JOIN public.roles AS workforce_role
         ON workforce_role.id = e.workforce_role_id
        AND workforce_role.organization_id = e.organization_id
       LEFT JOIN public.employees AS m
         ON m.id = e.manager_id
        AND m.organization_id = e.organization_id
       LEFT JOIN public.roles AS manager_role
         ON manager_role.id = m.workforce_role_id
        AND manager_role.organization_id = m.organization_id
       LEFT JOIN LATERAL (
         SELECT u.status
         FROM public.users AS u
         WHERE u.employee_id = m.id
           AND u.organization_id = m.organization_id
           AND u.role_id = m.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
         ORDER BY
           CASE WHEN u.status = 'ACTIVE' THEN 0 ELSE 1 END,
           u.updated_at DESC NULLS LAST,
           u.created_at DESC NULLS LAST
         LIMIT 1
       ) AS manager_account ON TRUE
       WHERE e.id = $1
         AND e.organization_id = $2
       LIMIT 1`,
      [id, actor.organizationId],
    );

    const updatedEmployee = result.rows[0];

    const comparableHistoryFields = new Set<string>([
      ...updates.map((update) => update.column),
      // Department and manager can change as a derived result of hierarchy validation.
      "department_id",
      "manager_id",
      // Primary HR designation is handled separately from the ordinary field allow-list.
      "is_primary_hr_manager",
    ]);

    const normalizeHistoryValue = (
      field: string,
      value: unknown,
    ): unknown => {
      if (value === null || value === undefined) return null;

      if (field === "joining_date") {
        if (value instanceof Date) {
          if (Number.isNaN(value.getTime())) return null;

          // Preserve a PostgreSQL DATE as a calendar date without UTC shifts.
          const year = value.getFullYear();
          const month = String(value.getMonth() + 1).padStart(2, "0");
          const day = String(value.getDate()).padStart(2, "0");

          return `${year}-${month}-${day}`;
        }

        if (typeof value === "string") {
          return value.slice(0, 10);
        }
      }

      if (typeof value === "string") return value;

      return value;
    };

    const changedFieldsForHistory = [
      ...comparableHistoryFields,
    ].filter((field) => {
      const beforeValue = normalizeHistoryValue(
        field,
        existingEmployee[field],
      );

      const afterValue = normalizeHistoryValue(
        field,
        updatedEmployee[field],
      );

      return beforeValue !== afterValue;
    });

    const emergencyContactChanged = changedFieldsForHistory.some(
      (field) => EMERGENCY_CONTACT_FIELDS.has(field),
    );

    const beforeState = {
      employee_code: existingEmployee.employee_code,
      workforce_role_id: existingEmployee.workforce_role_id,
      employment_status: existingEmployee.employment_status,
      department_id: existingEmployee.department_id,
      manager_id: existingEmployee.manager_id,
      designation: existingEmployee.designation,
      // Include the date in snapshots so updated_fields can be audited against it.
      joining_date: normalizeHistoryValue(
        "joining_date",
        existingEmployee.joining_date,
      ),
      is_primary_hr_manager:
        existingEmployee.is_primary_hr_manager === true,
      ...(emergencyContactChanged
        ? {
            emergency_contact_configured: Boolean(
              existingEmployee.emergency_contact_name &&
              existingEmployee.emergency_contact_phone,
            ),
          }
        : {}),
    };

    const afterState = {
      employee_code: updatedEmployee.employee_code,
      // This route does not change workforce_role_id; preserve the persisted role ID.
      workforce_role_id: existingEmployee.workforce_role_id,
      employment_status: updatedEmployee.employment_status,
      department_id: updatedEmployee.department_id,
      manager_id: updatedEmployee.manager_id,
      designation: updatedEmployee.designation,
      joining_date: normalizeHistoryValue(
        "joining_date",
        updatedEmployee.joining_date,
      ),
      is_primary_hr_manager:
        updatedEmployee.is_primary_hr_manager === true,
      ...(emergencyContactChanged
        ? {
            emergency_contact_configured: Boolean(
              effectiveEmergencyContactName &&
              effectiveEmergencyContactPhone,
            ),
          }
        : {}),
    };

    const statusChanged =
      beforeState.employment_status !==
      afterState.employment_status;

    const reportingLineChanged =
      beforeState.department_id !== afterState.department_id ||
      beforeState.manager_id !== afterState.manager_id;

    const primaryChanged =
      beforeState.is_primary_hr_manager !==
      afterState.is_primary_hr_manager;

    const eventType = primaryChanged
      ? (
          afterState.is_primary_hr_manager
            ? "PRIMARY_HR_MANAGER_DESIGNATED"
            : "PRIMARY_HR_MANAGER_DEMOTED"
        )
      : statusChanged
        ? "EMPLOYMENT_STATUS_CHANGED"
        : linkedAccountStatusSynchronized
          ? "ACCOUNT_STATUS_SYNCHRONIZED"
          : pendingInvitationsRevokedCount > 0
            ? "INVITATION_REVOKED"
            : reportingLineChanged
              ? "REPORTING_LINE_CHANGED"
              : emergencyContactChanged
                ? "EMERGENCY_CONTACT_UPDATED"
                : "PROFILE_UPDATED";

    const reason = primaryChanged
      ? (
          statusChanged
            ? "Primary HR Manager designation was automatically cleared as part of an authorized employment status change."
            : "Primary HR Manager designation updated by the Organization Admin."
        )
      : statusChanged
        ? "Employee employment status changed through an authorized profile update; linked account lifecycle was synchronized."
        : linkedAccountStatusSynchronized
          ? "Linked workforce account status and session version were synchronized with the employee's non-active employment status."
          : pendingInvitationsRevokedCount > 0
            ? "Outstanding workforce invitations were revoked because the employee was marked former."
            : reportingLineChanged
              ? "Employee department or derived reporting manager changed."
              : emergencyContactChanged
                ? "Emergency contact details updated. Contact values are intentionally excluded from history snapshots."
                : "Employee profile updated by an authorized organization user.";

    await writeEmployeeHistory(client, {
      organizationId: actor.organizationId,
      employeeId: id,
      actorUserId: actor.userId,
      eventType,
      reason,
      beforeState,
      afterState,
      metadata: {
        workflow: "employee_profile_update",
        updated_fields: changedFieldsForHistory,
        primary_designation_requested: wantsPrimaryDesignation,
        primary_designation_auto_cleared:
          primaryDesignationClearedForStatusChange,
        linked_account_status_synchronized:
          linkedAccountStatusSynchronized,
        pending_invitations_revoked:
          pendingInvitationsRevokedCount,
      },
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return jsonResponse({
      status: "ok",
      message: "Employee updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Failed to roll back employee update:",
          rollbackError,
        );
      }
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
            "The selected manager or department is invalid for your organization",
        },
        400,
      );
    }

    if (dbError.code === "23514") {
      return jsonResponse(
        {
          message:
            "Employee data violates a database validation rule",
        },
        400,
      );
    }

    console.error("Failed to update employee:", error);

    return jsonResponse(
      { message: "Unable to update employee right now" },
      500,
    );
  } finally {
    client?.release();
  }
}