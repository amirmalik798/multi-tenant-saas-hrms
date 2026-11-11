import { pool } from "../../../lib/db";
import { getTenantPermissionActor } from "../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../lib/request-security";
import {
  canManageScheduleDefinitions,
  isRecord,
  isUuid,
  isValidDateString,
  jsonResponse,
  organizationIsActive,
} from "../../../lib/schedule-utils";
import { isExcludedHrTargetRole } from "../../../lib/workforce-eligibility";

const ASSIGNMENT_SELECT = `
  SELECT
    a.id,
    a.organization_id AS "organizationId",
    a.employee_id AS "employeeId",
    a.schedule_id AS "scheduleId",
    a.effective_from AS "effectiveFrom",
    a.effective_to AS "effectiveTo",
    a.created_at AS "createdAt",

    e.employee_code AS "employeeCode",
    e.first_name AS "firstName",
    e.last_name AS "lastName",
    e.department_id AS "departmentId",
    d.name AS "departmentName",

    s.name AS "scheduleName",
    s.status AS "scheduleStatus",

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'dayOfWeek', sd.day_of_week,
            'startTime', TO_CHAR(sd.start_time, 'HH24:MI'),
            'endTime', TO_CHAR(sd.end_time, 'HH24:MI'),
            'breakMinutes', sd.break_minutes
          )
          ORDER BY sd.day_of_week
        )
        FROM public.work_schedule_days AS sd
        WHERE sd.organization_id = s.organization_id
          AND sd.schedule_id = s.id
      ),
      '[]'::jsonb
    ) AS days

  FROM public.employee_schedule_assignments AS a

  JOIN public.employees AS e
    ON e.id = a.employee_id
   AND e.organization_id = a.organization_id

  JOIN public.work_schedules AS s
    ON s.id = a.schedule_id
   AND s.organization_id = a.organization_id

  LEFT JOIN public.departments AS d
    ON d.id = e.department_id
   AND d.organization_id = e.organization_id
`;

export async function GET() {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    const values: unknown[] = [actor.organizationId];
    const conditions = ["a.organization_id = $1"];

    if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "DEPARTMENT_MANAGER"
    ) {
      // The manager can see assignments only for employees
      // in departments assigned to that manager.
      values.push(actor.employeeId);

      conditions.push(`
        EXISTS (
          SELECT 1
          FROM public.departments AS managed_department
          WHERE managed_department.organization_id = e.organization_id
            AND managed_department.id = e.department_id
            AND managed_department.manager_id = $${values.length}::uuid
        )
      `);
    } else if (
      actor.kind === "ORGANIZATION_USER" &&
      actor.roleName === "EMPLOYEE"
    ) {
      // Employees can see only their own schedule assignments.
      values.push(actor.employeeId);

      conditions.push(
        `a.employee_id = $${values.length}::uuid`,
      );
    } else if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        {
          message:
            "You do not have permission to view schedule assignments",
        },
        403,
      );
    }

    if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER") {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM public.roles target_role
        WHERE target_role.id = e.workforce_role_id
          AND target_role.organization_id = e.organization_id
          AND (
            regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_ADMIN%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATIONADMIN%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_ADMIN%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORGANIZATION_OWNER%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ORG_OWNER%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'TENANT_ADMIN%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'ADMINISTRATOR%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'HR_MANAGER%'
            OR regexp_replace(UPPER(target_role.name), '[^A-Z0-9]+', '_', 'g') LIKE 'HRMANAGER%'
          )
      ) AND NOT EXISTS (
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

    const result = await pool.query(
      `${ASSIGNMENT_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.effective_from DESC, e.last_name, e.first_name`,
      values,
    );

    return jsonResponse({
      status: "ok",
      assignments: result.rows,
    });
  } catch (error) {
    console.error("Schedule assignment list failed:", error);

    return jsonResponse(
      { message: "Unable to load schedule assignments right now" },
      500,
    );
  }
}

export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const body = parsedBody.body;

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    if (!canManageScheduleDefinitions(actor)) {
      return jsonResponse(
        { message: "You do not have permission to assign schedules" },
        403,
      );
    }

    if (!(await organizationIsActive(pool, actor.organizationId))) {
      return jsonResponse(
        { message: "This organization is not active" },
        403,
      );
    }

    if (!isRecord(body)) {
      return jsonResponse(
        { message: "Invalid request body" },
        400,
      );
    }

    const unknownKeys = Object.keys(body).filter(
      (key) =>
        ![
          "employeeId",
          "scheduleId",
          "effectiveFrom",
          "effectiveTo",
        ].includes(key),
    );

    if (unknownKeys.length > 0) {
      return jsonResponse(
        { message: `Unsupported field: ${unknownKeys.join(", ")}` },
        400,
      );
    }

    if (!isUuid(body.employeeId) || !isUuid(body.scheduleId)) {
      return jsonResponse(
        { message: "Valid employeeId and scheduleId are required" },
        400,
      );
    }

    if (!isValidDateString(body.effectiveFrom)) {
      return jsonResponse(
        {
          message:
            "effectiveFrom must be a valid YYYY-MM-DD date",
        },
        400,
      );
    }

    const effectiveFrom = body.effectiveFrom;
    let effectiveTo: string | null = null;

    if (body.effectiveTo !== undefined && body.effectiveTo !== null) {
      if (!isValidDateString(body.effectiveTo)) {
        return jsonResponse(
          {
            message:
              "effectiveTo must be a valid YYYY-MM-DD date or null",
          },
          400,
        );
      }

      effectiveTo = body.effectiveTo;

      if (effectiveTo < effectiveFrom) {
        return jsonResponse(
          {
            message:
              "effectiveTo cannot be earlier than effectiveFrom",
          },
          400,
        );
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Serialize assignment changes for this employee so two
      // concurrent requests cannot create overlapping date ranges.
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended($1::text, 0)
         )`,
        [
          `employee-schedule:${actor.organizationId}:${body.employeeId}`,
        ],
      );

      const employeeResult = await client.query(
        `SELECT e.id, r.name AS workforce_role,
                EXISTS (
                  SELECT 1 FROM public.users target_account
                  JOIN public.roles target_account_role ON target_account_role.id = target_account.role_id AND target_account_role.organization_id = target_account.organization_id
                  WHERE target_account.organization_id = e.organization_id AND target_account.employee_id = e.id
                    AND target_account.account_scope = 'ORGANIZATION'
                    AND regexp_replace(UPPER(target_account_role.name), '[^A-Z0-9]+', '_', 'g') IN ('ORGANIZATION_ADMIN', 'ORGANIZATIONADMIN', 'ORG_ADMIN', 'ORGANIZATION_ADMINISTRATOR')
                ) AS is_organization_admin
         FROM public.employees e
         LEFT JOIN public.roles r ON r.id = e.workforce_role_id AND r.organization_id = e.organization_id
         WHERE e.id = $1
           AND e.organization_id = $2
           AND e.employment_status = 'ACTIVE'
         LIMIT 1
         FOR SHARE OF e`,
        [body.employeeId, actor.organizationId],
      );

      if (employeeResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "Active employee not found in this organization",
          },
          404,
        );
      }
      if (actor.kind === "ORGANIZATION_USER" && actor.roleName === "HR_MANAGER" && (isExcludedHrTargetRole(employeeResult.rows[0].workforce_role) || employeeResult.rows[0].is_organization_admin)) {
        await client.query("ROLLBACK");
        return jsonResponse({ message: "Organization Admin and HR Manager records are not eligible for HR Manager schedule assignment" }, 403);
      }

      const scheduleResult = await client.query(
        `SELECT id
         FROM public.work_schedules
         WHERE id = $1
           AND organization_id = $2
           AND status = 'ACTIVE'
         LIMIT 1
         FOR SHARE`,
        [body.scheduleId, actor.organizationId],
      );

      if (scheduleResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "Active schedule not found in this organization",
          },
          404,
        );
      }

      const overlap = await client.query(
        `SELECT 1
         FROM public.employee_schedule_assignments
         WHERE organization_id = $1
           AND employee_id = $2
           AND effective_from <= COALESCE($4::date, 'infinity'::date)
           AND COALESCE(effective_to, 'infinity'::date) >= $3::date
         LIMIT 1`,
        [
          actor.organizationId,
          body.employeeId,
          effectiveFrom,
          effectiveTo,
        ],
      );

      if (overlap.rows.length > 0) {
        await client.query("ROLLBACK");

        return jsonResponse(
          {
            message:
              "This employee already has a schedule assignment that overlaps these dates. End or correct the existing assignment first.",
          },
          409,
        );
      }

      const inserted = await client.query(
        `INSERT INTO public.employee_schedule_assignments (
           organization_id,
           employee_id,
           schedule_id,
           effective_from,
           effective_to,
           assigned_by_user_id
         )
         VALUES ($1, $2, $3, $4::date, $5::date, $6)
         RETURNING
           id,
           organization_id AS "organizationId",
           employee_id AS "employeeId",
           schedule_id AS "scheduleId",
           effective_from AS "effectiveFrom",
           effective_to AS "effectiveTo",
           created_at AS "createdAt"`,
        [
          actor.organizationId,
          body.employeeId,
          body.scheduleId,
          effectiveFrom,
          effectiveTo,
          actor.userId,
        ],
      );

      await client.query("COMMIT");

      return jsonResponse(
        {
          status: "ok",
          assignment: inserted.rows[0],
        },
        201,
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Schedule assignment creation failed:", error);

    return jsonResponse(
      { message: "Unable to assign this schedule right now" },
      500,
    );
  }
}