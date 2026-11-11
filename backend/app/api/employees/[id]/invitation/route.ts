import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "../../../../../lib/db";
import { sendEmployeeInvitationEmail } from "../../../../../lib/email";
import { writeEmployeeHistory } from "../../../../../lib/workforce";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../../lib/permissions";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../../lib/request-security";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type WorkforceRoleName =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

type HierarchyResolution = {
  managerId: string | null;
  error: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WORKFORCE_ROLES = new Set<WorkforceRoleName>([
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
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
  headers.set("Referrer-Policy", "no-referrer");

  return NextResponse.json(body, {
    ...responseInit,
    headers,
  });
}

async function resolveInvitationManager(
  client: PoolClient,
  organizationId: string,
  employeeId: string,
  roleName: WorkforceRoleName,
  departmentId: string | null,
  currentManagerId: string | null,
): Promise<HierarchyResolution> {
  if (roleName === "EMPLOYEE") {
    if (!departmentId) {
      return {
        managerId: null,
        error:
          "Assign the employee to an active department with an eligible Department Manager before inviting them.",
      };
    }

    const result = await client.query<{
      manager_id: string;
    }>(
      `SELECT
         manager.id AS manager_id
       FROM public.departments AS d
       JOIN public.employees AS manager
         ON manager.id = d.manager_id
        AND manager.organization_id = d.organization_id
       JOIN public.roles AS manager_role
         ON manager_role.id = manager.workforce_role_id
        AND manager_role.organization_id = manager.organization_id
        AND manager_role.scope = 'ORGANIZATION'
        AND manager_role.name = 'DEPARTMENT_MANAGER'
       JOIN LATERAL (
         SELECT COUNT(*)::int AS active_account_count
         FROM public.users AS u
         WHERE u.employee_id = manager.id
           AND u.organization_id = manager.organization_id
           AND u.role_id = manager.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
       ) AS manager_account ON TRUE
       JOIN public.employees AS hr_manager
         ON hr_manager.id = manager.manager_id
        AND hr_manager.organization_id = d.organization_id
       JOIN public.roles AS hr_role
         ON hr_role.id = hr_manager.workforce_role_id
        AND hr_role.organization_id = hr_manager.organization_id
        AND hr_role.scope = 'ORGANIZATION'
        AND hr_role.name = 'HR_MANAGER'
       JOIN LATERAL (
         SELECT COUNT(*)::int AS active_account_count
         FROM public.users AS u
         WHERE u.employee_id = hr_manager.id
           AND u.organization_id = hr_manager.organization_id
           AND u.role_id = hr_manager.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
       ) AS hr_account ON TRUE
       WHERE d.id = $1
         AND d.organization_id = $2
         AND d.status = 'ACTIVE'
         AND manager.id <> $3
         AND manager.employment_status = 'ACTIVE'
         AND manager.department_id IS NULL
         AND manager_account.active_account_count = 1
         AND hr_manager.employment_status = 'ACTIVE'
         AND hr_manager.department_id IS NULL
         AND hr_manager.manager_id IS NULL
         AND hr_account.active_account_count = 1
       FOR UPDATE OF d, manager, hr_manager`,
      [departmentId, organizationId, employeeId],
    );

    const row = result.rows[0];

    if (!row) {
      return {
        managerId: null,
        error:
          "The employee's department must be active and have an eligible Department Manager who reports to an active HR Manager. Both managers must have exactly one active organization account.",
      };
    }

    return {
      managerId: row.manager_id,
      error: null,
    };
  }

  if (roleName === "DEPARTMENT_MANAGER") {
    if (departmentId !== null) {
      return {
        managerId: null,
        error:
          "Department Managers cannot have a home department. Correct the workforce profile before creating an invitation.",
      };
    }

    let supervisorId = currentManagerId;

    if (!supervisorId) {
      const primaryResult = await client.query<{
        id: string;
      }>(
        `SELECT e.id
         FROM public.employees AS e
         JOIN public.roles AS r
           ON r.id = e.workforce_role_id
          AND r.organization_id = e.organization_id
          AND r.scope = 'ORGANIZATION'
          AND r.name = 'HR_MANAGER'
         JOIN LATERAL (
           SELECT COUNT(*)::int AS active_account_count
           FROM public.users AS u
           WHERE u.employee_id = e.id
             AND u.organization_id = e.organization_id
             AND u.role_id = e.workforce_role_id
             AND u.account_scope = 'ORGANIZATION'
             AND u.status = 'ACTIVE'
         ) AS account_state ON TRUE
         WHERE e.organization_id = $1
           AND e.is_primary_hr_manager IS TRUE
           AND e.employment_status = 'ACTIVE'
           AND e.department_id IS NULL
           AND e.manager_id IS NULL
           AND account_state.active_account_count = 1
         ORDER BY e.id
         LIMIT 2
         FOR UPDATE OF e`,
        [organizationId],
      );

      if (primaryResult.rows.length !== 1) {
        return {
          managerId: null,
          error:
            "Assign an eligible HR Manager or configure exactly one active Primary HR Manager with an active organization account before inviting this Department Manager.",
        };
      }

      supervisorId = primaryResult.rows[0].id;
    }

    const supervisorResult = await client.query<{
      id: string;
    }>(
      `SELECT manager.id
       FROM public.employees AS manager
       JOIN public.roles AS r
         ON r.id = manager.workforce_role_id
        AND r.organization_id = manager.organization_id
        AND r.scope = 'ORGANIZATION'
        AND r.name = 'HR_MANAGER'
       JOIN LATERAL (
         SELECT COUNT(*)::int AS active_account_count
         FROM public.users AS u
         WHERE u.employee_id = manager.id
           AND u.organization_id = manager.organization_id
           AND u.role_id = manager.workforce_role_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
       ) AS account_state ON TRUE
       WHERE manager.id = $1
         AND manager.organization_id = $2
         AND manager.id <> $3
         AND manager.employment_status = 'ACTIVE'
         AND manager.department_id IS NULL
         AND manager.manager_id IS NULL
         AND account_state.active_account_count = 1
       FOR UPDATE OF manager`,
      [supervisorId, organizationId, employeeId],
    );

    if (supervisorResult.rowCount !== 1) {
      return {
        managerId: null,
        error:
          "The Department Manager must report to an active HR Manager with no department or reporting manager and exactly one active organization account.",
      };
    }

    return {
      managerId: supervisorId,
      error: null,
    };
  }

  if (roleName === "HR_MANAGER") {
    if (departmentId !== null || currentManagerId !== null) {
      return {
        managerId: null,
        error:
          "HR Managers cannot have a home department or reporting manager. Correct the workforce profile before creating an invitation.",
      };
    }

    return {
      managerId: null,
      error: null,
    };
  }

  return {
    managerId: null,
    error: "Unsupported workforce role.",
  };
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const originError = validateSameOriginRequest(request);

  if (originError) return originError;

  const parsedBody = await parseJsonRequestBody(request);

  if (!parsedBody.ok) return parsedBody.response;

  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse(
        { message: "Authentication required" },
        401,
      );
    }

    const canCreateInvitations =
      hasTenantPermission(actor, "employee.create") &&
      hasTenantPermission(actor, "user.invite");

    if (!canCreateInvitations) {
      return jsonResponse(
        {
          message:
            "You do not have permission to create employee invitations",
        },
        403,
      );
    }

    const { id: employeeId } = await context.params;

    if (!UUID_PATTERN.test(employeeId)) {
      return jsonResponse(
        { message: "Invalid employee ID" },
        400,
      );
    }

    if (
      typeof parsedBody.body !== "object" ||
      parsedBody.body === null ||
      Array.isArray(parsedBody.body)
    ) {
      return jsonResponse(
        { message: "Invalid invitation request body" },
        400,
      );
    }

    const body = parsedBody.body as Record<string, unknown>;

    const hasRoleId = Object.prototype.hasOwnProperty.call(
      body,
      "roleId",
    );

    const hasRoleName = Object.prototype.hasOwnProperty.call(
      body,
      "roleName",
    );

    if (hasRoleId === hasRoleName) {
      return jsonResponse(
        {
          message: "Provide exactly one of roleId or roleName",
        },
        400,
      );
    }

    if (
      hasRoleId &&
      (
        typeof body.roleId !== "string" ||
        !UUID_PATTERN.test(body.roleId)
      )
    ) {
      return jsonResponse(
        { message: "A valid roleId is required" },
        400,
      );
    }

    if (
      hasRoleName &&
      (
        typeof body.roleName !== "string" ||
        !WORKFORCE_ROLES.has(body.roleName as WorkforceRoleName)
      )
    ) {
      return jsonResponse(
        { message: "A valid workforce roleName is required" },
        400,
      );
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const organizationResult = await client.query<{
        id: string;
        name: string;
        status: string;
      }>(
        `SELECT id, name, status
         FROM public.organizations
         WHERE id = $1
         FOR SHARE`,
        [actor.organizationId],
      );

      const organization = organizationResult.rows[0];

      if (!organization || organization.status !== "ACTIVE") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          { message: "Organization is not active" },
          403,
        );
      }

      const employeeResult = await client.query<{
        id: string;
        organization_id: string;
        employee_code: string;
        first_name: string;
        last_name: string | null;
        email: string | null;
        employment_status: string;
        workforce_role_id: string | null;
        department_id: string | null;
        manager_id: string | null;
      }>(
        `SELECT
           id,
           organization_id,
           employee_code,
           first_name,
           last_name,
           email,
           employment_status,
           workforce_role_id,
           department_id,
           manager_id
         FROM public.employees
         WHERE id = $1
           AND organization_id = $2
         FOR UPDATE`,
        [employeeId, actor.organizationId],
      );

      const employee = employeeResult.rows[0];

      if (!employee) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          { message: "Employee not found in your organization" },
          404,
        );
      }

      if (employee.employment_status === "FORMER") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Former employees cannot be invited through the standard workforce creation workflow. Use the rehire workflow when available.",
          },
          409,
        );
      }

      if (
        employee.employment_status !== "ACTIVE" &&
        employee.employment_status !== "INACTIVE"
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          { message: "The employee status is not eligible for invitation" },
          409,
        );
      }

      if (!employee.workforce_role_id) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "This employee profile has no assigned workforce role. Correct the profile before creating an invitation.",
          },
          409,
        );
      }

      const roleResult = await client.query<{
        id: string;
        name: string;
        scope: string;
      }>(
        `SELECT id, name, scope
         FROM public.roles
         WHERE id = $1
           AND organization_id = $2
           AND scope = 'ORGANIZATION'
         FOR SHARE`,
        [employee.workforce_role_id, actor.organizationId],
      );

      const role = roleResult.rows[0];

      if (
        !role ||
        !WORKFORCE_ROLES.has(role.name as WorkforceRoleName)
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The employee profile does not have a valid workforce role for this organization.",
          },
          409,
        );
      }

      if (
        (hasRoleId && body.roleId !== role.id) ||
        (hasRoleName && body.roleName !== role.name)
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The requested invitation role does not match the role assigned to this employee profile.",
          },
          409,
        );
      }

      if (
        actor.kind === "ORGANIZATION_USER" &&
        role.name === "HR_MANAGER"
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "Only the Organization Admin may invite an HR Manager",
          },
          403,
        );
      }

      const hierarchy = await resolveInvitationManager(
        client,
        actor.organizationId,
        employeeId,
        role.name as WorkforceRoleName,
        employee.department_id,
        employee.manager_id,
      );

      if (hierarchy.error) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          { message: hierarchy.error },
          409,
        );
      }

      if (hierarchy.managerId !== employee.manager_id) {
        const managerUpdate = await client.query(
          `UPDATE public.employees
           SET manager_id = $1,
               updated_at = NOW()
           WHERE id = $2
             AND organization_id = $3
           RETURNING id`,
          [
            hierarchy.managerId,
            employeeId,
            actor.organizationId,
          ],
        );

        if (managerUpdate.rowCount !== 1) {
          throw new Error(
            "Employee reporting line changed during invitation creation",
          );
        }

        await writeEmployeeHistory(client, {
          organizationId: actor.organizationId,
          employeeId,
          actorUserId: actor.userId,
          eventType: "REPORTING_LINE_CHANGED",
          reason:
            "The reporting manager was synchronized with the validated workforce hierarchy before invitation creation.",
          beforeState: {
            employee_code: employee.employee_code,
            employment_status: employee.employment_status,
            department_id: employee.department_id,
            manager_id: employee.manager_id,
          },
          afterState: {
            employee_code: employee.employee_code,
            employment_status: employee.employment_status,
            department_id: employee.department_id,
            manager_id: hierarchy.managerId,
          },
          metadata: {
            workflow: "employee_invitation_creation",
            trigger: "hierarchy_validation",
          },
        });
      }

      const email =
        typeof employee.email === "string"
          ? employee.email.trim().toLowerCase()
          : "";

      if (
        !email ||
        email.length > 254 ||
        !EMAIL_PATTERN.test(email)
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "The employee profile must have a valid email address before an invitation can be created.",
          },
          400,
        );
      }

      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended($1::text, 0)
         )`,
        [`employee-invitation:${actor.organizationId}:${email}`],
      );

      const existingUser = await client.query(
        `SELECT id
         FROM public.users
         WHERE organization_id = $1
           AND (
             employee_id = $2
             OR LOWER(TRIM(email)) = $3
           )
         LIMIT 1`,
        [actor.organizationId, employeeId, email],
      );

      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "An account already exists for this employee or email address.",
          },
          409,
        );
      }

      const expiredInvitations = await client.query<{
        id: string;
        employee_id: string;
        email: string;
        expires_at: Date | string;
      }>(
        `UPDATE public.employee_invitations
         SET status = 'EXPIRED',
             updated_at = NOW()
         WHERE organization_id = $1
           AND LOWER(BTRIM(email)) = $2
           AND status = 'PENDING'
           AND expires_at <= NOW()
         RETURNING id, employee_id, email, expires_at`,
        [actor.organizationId, email],
      );

      for (const expiredInvitation of expiredInvitations.rows) {
        await writeEmployeeHistory(client, {
          organizationId: actor.organizationId,
          employeeId: expiredInvitation.employee_id,
          actorUserId: actor.userId,
          eventType: "INVITATION_EXPIRED",
          reason:
            "An expired invitation was marked EXPIRED while preparing a new invitation for the same email address.",
          beforeState: {
            invitation_status: "PENDING",
          },
          afterState: {
            invitation_status: "EXPIRED",
            invitation_id: expiredInvitation.id,
            email: expiredInvitation.email,
            expires_at:
              expiredInvitation.expires_at instanceof Date
                ? expiredInvitation.expires_at.toISOString()
                : expiredInvitation.expires_at,
          },
          metadata: {
            workflow: "employee_invitation_expiration",
            invitation_id: expiredInvitation.id,
            triggered_by: "new_invitation_request",
          },
        });
      }

      const pendingInvitation = await client.query<{
        id: string;
        employee_id: string;
        email: string;
        expires_at: Date | string;
      }>(
        `SELECT id, employee_id, email, expires_at
         FROM public.employee_invitations
         WHERE organization_id = $1
           AND LOWER(BTRIM(email)) = $2
           AND status = 'PENDING'
         ORDER BY created_at DESC
         LIMIT 1`,
        [actor.organizationId, email],
      );

      if (pendingInvitation.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return jsonResponse(
          {
            message:
              "A pending invitation already exists for this email address in your organization. Revoke the existing invitation or wait until it expires before inviting this email again.",
            invitation: {
              id: pendingInvitation.rows[0].id,
              status: "PENDING",
              expires_at: pendingInvitation.rows[0].expires_at,
            },
          },
          409,
        );
      }

      const token = randomBytes(32).toString("base64url");

      const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      const expiresAt = new Date(
        Date.now() + 48 * 60 * 60 * 1000,
      );

      const invitationResult = await client.query(
        `INSERT INTO public.employee_invitations (
           organization_id,
           employee_id,
           role_id,
           email,
           token_hash,
           invited_by,
           status,
           expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
         RETURNING
           id,
           employee_id,
           role_id,
           email,
           status,
           expires_at,
           created_at`,
        [
          actor.organizationId,
          employeeId,
          role.id,
          email,
          tokenHash,
          actor.userId,
          expiresAt,
        ],
      );

      await writeEmployeeHistory(client, {
        organizationId: actor.organizationId,
        employeeId,
        actorUserId: actor.userId,
        eventType: "INVITATION_CREATED",
        reason:
          "An authorized organization user created a workforce invitation.",
        beforeState: {
          employment_status: employee.employment_status,
          account_status: "NONE",
          invitation_status: "NONE",
        },
        afterState: {
          employment_status: employee.employment_status,
          account_status: "NONE",
          invitation_status: "PENDING",
          workforce_role: role.name,
          manager_id: hierarchy.managerId,
          expires_at: expiresAt.toISOString(),
        },
        metadata: {
          workflow: "employee_invitation_creation",
          invitation_id: invitationResult.rows[0].id,
          role_id: role.id,
        },
      });

      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3001";

      const invitationUrl = new URL(
        "/employee-invitations/accept",
        frontendUrl,
      );

      invitationUrl.searchParams.set("token", token);

      await client.query("COMMIT");
      transactionStarted = false;

      // Determine the configured provider for accurate error reporting
      // and history metadata. The email service validates EMAIL_MODE.
      const emailMode = process.env.EMAIL_MODE;

      const emailProvider =
        emailMode === "live"
          ? "Google Apps Script"
          : emailMode === "sandbox"
            ? "Mailtrap Sandbox"
            : "configured email provider";

      try {
        const employeeName = [
          employee.first_name,
          employee.last_name,
        ]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join(" ") || email;

        await sendEmployeeInvitationEmail({
          to: email,
          organizationName: organization.name,
          employeeName,
          workforceRole: role.name,
          invitationUrl: invitationUrl.toString(),
          expiresAt,
        });
      } catch (deliveryError) {
        console.error(
          `Workforce invitation ${emailProvider} delivery failed:`,
          deliveryError instanceof Error
            ? deliveryError.message
            : "Unknown delivery error",
        );

        let revokeClient: PoolClient | null = null;
        let revokeTransactionOpen = false;

        try {
          revokeClient = await pool.connect();
          await revokeClient.query("BEGIN");
          revokeTransactionOpen = true;

          const revokeResult = await revokeClient.query<{
            id: string;
            status: string;
          }>(
            `UPDATE public.employee_invitations
             SET status = 'REVOKED',
                 revoked_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1
               AND organization_id = $2
               AND employee_id = $3
               AND status = 'PENDING'
             RETURNING id, status`,
            [
              invitationResult.rows[0].id,
              actor.organizationId,
              employeeId,
            ],
          );

          if (revokeResult.rowCount === 1) {
            await writeEmployeeHistory(revokeClient, {
              organizationId: actor.organizationId,
              employeeId,
              actorUserId: actor.userId,
              eventType: "INVITATION_REVOKED",
              reason: `Invitation revoked because ${emailProvider} delivery failed.`,
              beforeState: {
                invitation_status: "PENDING",
              },
              afterState: {
                invitation_status: "REVOKED",
              },
              metadata: {
                workflow: "employee_invitation_creation",
                invitation_id: invitationResult.rows[0].id,
                trigger:
                  emailMode === "live"
                    ? "google_apps_script_delivery_failed"
                    : emailMode === "sandbox"
                      ? "mailtrap_sandbox_delivery_failed"
                      : "email_delivery_failed",
              },
            });
          }

          await revokeClient.query("COMMIT");
          revokeTransactionOpen = false;
        } catch (revokeError) {
          if (revokeClient && revokeTransactionOpen) {
            try {
              await revokeClient.query("ROLLBACK");
              revokeTransactionOpen = false;
            } catch (rollbackError) {
              console.error(
                "Invitation delivery-failure rollback failed:",
                rollbackError,
              );
            }
          }

          console.error(
            "Could not automatically revoke the invitation after delivery failure:",
            revokeError,
          );
        } finally {
          revokeClient?.release();
        }

        return jsonResponse(
          {
            status: "error",
            message: `${emailProvider} could not send the invitation. Check the configured email provider. The invitation was revoked if possible.`,
          },
          502,
        );
      }

      return jsonResponse(
        {
          status: "ok",
          message: "Employee invitation created and sent successfully",
          emailSent: true,
          emailMode: emailMode === "live" ? "live" : "sandbox",
          invitation: invitationResult.rows[0],
          invitationUrl: invitationUrl.toString(),
        },
        201,
      );
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
          transactionStarted = false;
        } catch (rollbackError) {
          console.error(
            "Employee invitation rollback failed:",
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
              "An employee account or pending invitation already exists.",
          },
          409,
        );
      }

      if (dbError.code === "23503") {
        return jsonResponse(
          {
            message:
              "The employee, role, organization, or reporting-line reference is invalid.",
          },
          409,
        );
      }

      if (dbError.code === "23514") {
        return jsonResponse(
          {
            message:
              "The employee or reporting-line update violates a database validation rule.",
          },
          409,
        );
      }

      console.error(
        "Employee invitation creation failed:",
        error,
      );

      return jsonResponse(
        { message: "Unable to create employee invitation right now" },
        500,
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "Employee invitation authorization failed:",
      error,
    );

    return jsonResponse(
      { message: "Unable to create employee invitation right now" },
      500,
    );
  }
}