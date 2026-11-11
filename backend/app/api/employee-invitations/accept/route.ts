import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import {
  getNewPasswordValidationError,
  hashNewPassword,
} from "../../../../lib/password";
import { pool } from "../../../../lib/db";
import {
  parseJsonRequestBody,
  validateSameOriginRequest,
} from "../../../../lib/request-security";
import { writeEmployeeHistory } from "../../../../lib/workforce";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,100}$/;

const EMPLOYEE_ROLES = new Set<string>([
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
]);

type AcceptInvitationBody = {
  token: string;
  password: string;
};

type InvitationRow = {
  invitation_id: string;
  organization_id: string;
  employee_id: string;
  role_id: string;
  email: string;
  invitation_status: string;
  expires_at: Date | string;
  is_expired: boolean;

  employee_email: string | null;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  employment_status: string;
  workforce_role_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  is_primary_hr_manager: boolean;
  invitation_role_matches: boolean;

  organization_name: string;
  organization_status: string;

  role_name: string;
  role_scope: string;
  role_organization_id: string | null;
};

type ManagerResolution = {
  managerId: string | null;
  error: string | null;
};

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

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Record an invitation expiration inside the transaction that changes
 * the invitation status to EXPIRED.
 *
 * Invitation recipients are unauthenticated before acceptance, so there
 * is no authenticated actor user ID for these expiration events.
 */
async function writeInvitationExpiredHistory(
  client: PoolClient,
  input: {
    organizationId: string;
    employeeId: string;
    invitationId: string;
    expiresAt: Date | string;
    trigger: "expired_link_opened" | "acceptance_attempted";
  },
): Promise<void> {
  await writeEmployeeHistory(client, {
    organizationId: input.organizationId,
    employeeId: input.employeeId,
    actorUserId: null,
    eventType: "INVITATION_EXPIRED",
    reason:
      input.trigger === "expired_link_opened"
        ? "The invitation expired before its acceptance page was opened."
        : "The invitation expired before it could be accepted.",
    beforeState: {
      invitation_status: "PENDING",
    },
    afterState: {
      invitation_status: "EXPIRED",
      expires_at: new Date(input.expiresAt).toISOString(),
    },
    metadata: {
      workflow: "employee_invitation_acceptance",
      invitation_id: input.invitationId,
      trigger: input.trigger,
    },
  });
}

function invitationRoleIsValid(
  invitation: InvitationRow,
): boolean {
  return (
    invitation.role_scope === "ORGANIZATION" &&
    invitation.role_organization_id ===
      invitation.organization_id &&
    EMPLOYEE_ROLES.has(invitation.role_name) &&
    invitation.workforce_role_id !== null &&
    invitation.role_id === invitation.workforce_role_id &&
    invitation.invitation_role_matches
  );
}

/**
 * Revalidate workforce hierarchy during invitation acceptance.
 *
 * The invitation's stored reporting manager is not automatically trusted:
 * department ownership and current HR eligibility determine the effective
 * manager at acceptance time.
 */
async function resolveAcceptanceManager(
  client: PoolClient,
  invitation: InvitationRow,
): Promise<ManagerResolution> {
  if (invitation.role_name === "EMPLOYEE") {
    if (!invitation.department_id) {
      return {
        managerId: null,
        error:
          "Assign this employee to an active department with an eligible Department Manager before accepting the invitation.",
      };
    }

    /*
     * Verify the complete chain:
     *
     * Employee -> Department Manager -> HR Manager
     *
     * Both management profiles and their account relationships must be valid
     * within this organization. Each must have exactly one active matching
     * organization account.
     */
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
      [
        invitation.department_id,
        invitation.organization_id,
        invitation.employee_id,
      ],
    );

    const departmentManager = result.rows[0];

    if (!departmentManager) {
      return {
        managerId: null,
        error:
          "The employee's department must be active and have an eligible Department Manager who reports to an active HR Manager. Both managers must have exactly one active organization account.",
      };
    }

    return {
      managerId: departmentManager.manager_id,
      error: null,
    };
  }

  if (invitation.role_name === "DEPARTMENT_MANAGER") {
    if (invitation.department_id !== null) {
      return {
        managerId: null,
        error:
          "Department Managers cannot have a home department. Correct the workforce profile before accepting the invitation.",
      };
    }

    let supervisorId = invitation.manager_id;

    /*
     * Preserve the existing fallback: when the profile has no supervisor,
     * use the organization's sole eligible Primary HR Manager.
     */
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
        [invitation.organization_id],
      );

      if (primaryResult.rows.length !== 1) {
        return {
          managerId: null,
          error:
            "Assign an eligible HR Manager or configure exactly one active Primary HR Manager with an active organization account before accepting this Department Manager invitation.",
        };
      }

      supervisorId = primaryResult.rows[0].id;
    }

    /*
     * Whether selected explicitly or found through the Primary HR Manager
     * fallback, the supervisor must pass the same strict validation.
     */
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
      [
        supervisorId,
        invitation.organization_id,
        invitation.employee_id,
      ],
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

  if (invitation.role_name === "HR_MANAGER") {
    if (
      invitation.department_id !== null ||
      invitation.manager_id !== null
    ) {
      return {
        managerId: null,
        error:
          "HR Managers cannot have a home department or reporting manager. Correct the workforce profile before accepting the invitation.",
      };
    }

    return {
      managerId: null,
      error: null,
    };
  }

  return {
    managerId: null,
    error: "The invitation has an unsupported workforce role.",
  };
}

/**
 * GET /api/employee-invitations/accept?token=...
 *
 * Verifies an invitation and returns safe information for the acceptance
 * page. Does not create an account or activate the employee.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token || !TOKEN_PATTERN.test(token)) {
      return jsonResponse(
        { message: "Invalid invitation token" },
        400,
      );
    }

    const tokenHash = hashToken(token);

    const result = await pool.query<InvitationRow>(
      `SELECT
         i.id AS invitation_id,
         i.organization_id,
         i.employee_id,
         i.role_id,
         LOWER(TRIM(i.email)) AS email,
         i.status AS invitation_status,
         i.expires_at,
         (i.expires_at <= NOW()) AS is_expired,

         e.employee_code,
         e.first_name,
         e.last_name,
         e.email AS employee_email,
         e.employment_status,
         e.workforce_role_id,
         e.department_id,
         e.manager_id,
         e.is_primary_hr_manager,

         (i.role_id = e.workforce_role_id)
           AS invitation_role_matches,

         o.name AS organization_name,
         o.status AS organization_status,

         r.name AS role_name,
         r.scope AS role_scope,
         r.organization_id AS role_organization_id
       FROM public.employee_invitations AS i
       JOIN public.employees AS e
         ON e.id = i.employee_id
        AND e.organization_id = i.organization_id
       JOIN public.organizations AS o
         ON o.id = i.organization_id
       JOIN public.roles AS r
         ON r.id = i.role_id
        AND r.organization_id = i.organization_id
       WHERE i.token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );

    const invitation = result.rows[0];

    if (!invitation) {
      return jsonResponse(
        { message: "Invitation not found or invalid" },
        404,
      );
    }

    if (invitation.invitation_status !== "PENDING") {
      return jsonResponse(
        { message: "This invitation is no longer valid" },
        409,
      );
    }

    if (invitation.is_expired) {
      const client = await pool.connect();
      let expirationTransactionOpen = false;

      try {
        await client.query("BEGIN");
        expirationTransactionOpen = true;

        // Re-read and lock the invitation because its state may have changed
        // since the initial, non-mutating verification query.
        const currentResult = await client.query<{
          invitation_id: string;
          organization_id: string;
          employee_id: string;
          invitation_status: string;
          expires_at: Date | string;
          is_expired: boolean;
        }>(
          `SELECT
             id AS invitation_id,
             organization_id,
             employee_id,
             status AS invitation_status,
             expires_at,
             (expires_at <= NOW()) AS is_expired
           FROM public.employee_invitations
           WHERE token_hash = $1
           FOR UPDATE`,
          [tokenHash],
        );

        const currentInvitation = currentResult.rows[0];

        if (!currentInvitation) {
          await client.query("ROLLBACK");
          expirationTransactionOpen = false;

          return jsonResponse(
            { message: "Invitation not found or invalid" },
            404,
          );
        }

        if (currentInvitation.invitation_status !== "PENDING") {
          await client.query("COMMIT");
          expirationTransactionOpen = false;

          if (currentInvitation.invitation_status === "EXPIRED") {
            return jsonResponse(
              { message: "This invitation has expired" },
              410,
            );
          }

          return jsonResponse(
            { message: "This invitation is no longer valid" },
            409,
          );
        }

        if (!currentInvitation.is_expired) {
          await client.query("COMMIT");
          expirationTransactionOpen = false;

          return jsonResponse(
            {
              message:
                "The invitation changed during verification. Refresh and try again.",
            },
            409,
          );
        }

        const expirationUpdate = await client.query<{ id: string }>(
          `UPDATE public.employee_invitations
           SET status = 'EXPIRED',
               updated_at = NOW()
           WHERE id = $1
             AND organization_id = $2
             AND employee_id = $3
             AND status = 'PENDING'
             AND expires_at <= NOW()
           RETURNING id`,
          [
            currentInvitation.invitation_id,
            currentInvitation.organization_id,
            currentInvitation.employee_id,
          ],
        );

        if (expirationUpdate.rowCount !== 1) {
          throw new Error(
            "Invitation expiration state changed during verification",
          );
        }

        await writeInvitationExpiredHistory(client, {
          organizationId: currentInvitation.organization_id,
          employeeId: currentInvitation.employee_id,
          invitationId: currentInvitation.invitation_id,
          expiresAt: currentInvitation.expires_at,
          trigger: "expired_link_opened",
        });

        await client.query("COMMIT");
        expirationTransactionOpen = false;

        return jsonResponse(
          { message: "This invitation has expired" },
          410,
        );
      } catch (error) {
        if (expirationTransactionOpen) {
          try {
            await client.query("ROLLBACK");
            expirationTransactionOpen = false;
          } catch (rollbackError) {
            console.error(
              "Invitation expiration rollback failed:",
              rollbackError,
            );
          }
        }

        throw error;
      } finally {
        client.release();
      }
    }

    if (invitation.organization_status !== "ACTIVE") {
      return jsonResponse(
        { message: "The organization is not active" },
        409,
      );
    }

    if (
      invitation.employment_status !== "INACTIVE" &&
      invitation.employment_status !== "ACTIVE"
    ) {
      return jsonResponse(
        {
          message:
            "This employee profile is not eligible for invitation acceptance.",
        },
        409,
      );
    }

    const employeeEmail =
      typeof invitation.employee_email === "string"
        ? invitation.employee_email.trim().toLowerCase()
        : "";

    if (!employeeEmail || employeeEmail !== invitation.email) {
      return jsonResponse(
        {
          message:
            "The employee email has changed. Please request a new invitation.",
        },
        409,
      );
    }

    if (!invitationRoleIsValid(invitation)) {
      return jsonResponse(
        {
          message:
            "The invitation role no longer matches the workforce profile. Please request administrator assistance.",
        },
        409,
      );
    }

    /*
     * Preserve the existing identity rule: an email or employee that already
     * has an account cannot be linked through invitation acceptance.
     */
    const accountState = await pool.query<{
      employee_has_account: boolean;
      email_has_account: boolean;
    }>(
      `SELECT
         EXISTS (
           SELECT 1
           FROM public.users AS u
           WHERE u.employee_id = $1
         ) AS employee_has_account,
         EXISTS (
           SELECT 1
           FROM public.users AS u
           WHERE LOWER(TRIM(u.email)) = $2
         ) AS email_has_account`,
      [invitation.employee_id, invitation.email],
    );

    const account = accountState.rows[0];

    if (
      account?.employee_has_account ||
      account?.email_has_account
    ) {
      return jsonResponse(
        {
          message:
            "An account already exists for this employee or email.",
        },
        409,
      );
    }

    return jsonResponse({
      status: "ok",
      invitation: {
        email: invitation.email,
        employeeCode: invitation.employee_code,
        employeeName: [
          invitation.first_name,
          invitation.last_name,
        ]
          .filter(Boolean)
          .join(" "),
        role: invitation.role_name,
        organizationName: invitation.organization_name,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (error) {
    console.error(
      "Employee invitation verification failed:",
      error,
    );

    return jsonResponse(
      { message: "Unable to verify invitation right now" },
      500,
    );
  }
}

/**
 * POST /api/employee-invitations/accept
 *
 * Creates the workforce account, activates an eligible employee, consumes
 * the invitation, and records employee history atomically.
 */
export async function POST(request: Request) {
  const originError = validateSameOriginRequest(request);

  if (originError) return originError;

  const bodyResult = await parseJsonRequestBody(request);

  if (!bodyResult.ok) return bodyResult.response;

  const body: unknown = bodyResult.body;

  if (
    !isObject(body) ||
    typeof body.token !== "string" ||
    typeof body.password !== "string"
  ) {
    return jsonResponse(
      { message: "Invitation token and password are required" },
      400,
    );
  }

  const input: AcceptInvitationBody = {
    token: body.token.trim(),
    password: body.password,
  };

  if (!TOKEN_PATTERN.test(input.token)) {
    return jsonResponse(
      { message: "Invalid invitation token" },
      400,
    );
  }

  const passwordValidationError =
    getNewPasswordValidationError(input.password);

  if (passwordValidationError) {
    return jsonResponse(
      { message: passwordValidationError },
      400,
    );
  }

  const tokenHash = hashToken(input.token);

  let client: PoolClient | null = null;
  let inTransaction = false;

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    inTransaction = true;

    /*
     * Lock the invitation, employee, organization, and role. The current
     * invitation state must still be valid at the time of acceptance.
     */
    const invitationResult =
      await client.query<InvitationRow>(
        `SELECT
           i.id AS invitation_id,
           i.organization_id,
           i.employee_id,
           i.role_id,
           LOWER(TRIM(i.email)) AS email,
           i.status AS invitation_status,
           i.expires_at,
           (i.expires_at <= NOW()) AS is_expired,

           e.email AS employee_email,
           e.employment_status,
           e.employee_code,
           e.first_name,
           e.last_name,
           e.workforce_role_id,
           e.department_id,
           e.manager_id,
           e.is_primary_hr_manager,

           (i.role_id = e.workforce_role_id)
             AS invitation_role_matches,

           o.name AS organization_name,
           o.status AS organization_status,

           r.name AS role_name,
           r.scope AS role_scope,
           r.organization_id AS role_organization_id
         FROM public.employee_invitations AS i
         JOIN public.employees AS e
           ON e.id = i.employee_id
          AND e.organization_id = i.organization_id
         JOIN public.organizations AS o
           ON o.id = i.organization_id
         JOIN public.roles AS r
           ON r.id = i.role_id
          AND r.organization_id = i.organization_id
         WHERE i.token_hash = $1
         FOR UPDATE OF i, e, o, r`,
        [tokenHash],
      );

    const invitation = invitationResult.rows[0];

    if (!invitation) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        { message: "Invitation not found or invalid" },
        404,
      );
    }

    if (invitation.invitation_status !== "PENDING") {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        { message: "This invitation is no longer valid" },
        409,
      );
    }

    if (invitation.is_expired) {
      const expirationUpdate = await client.query<{ id: string }>(
        `UPDATE public.employee_invitations
         SET status = 'EXPIRED',
             updated_at = NOW()
         WHERE id = $1
           AND organization_id = $2
           AND employee_id = $3
           AND status = 'PENDING'
           AND expires_at <= NOW()
         RETURNING id`,
        [
          invitation.invitation_id,
          invitation.organization_id,
          invitation.employee_id,
        ],
      );

      if (expirationUpdate.rowCount !== 1) {
        await client.query("ROLLBACK");
        inTransaction = false;

        return jsonResponse(
          {
            message:
              "The invitation changed during acceptance. Refresh and try again.",
          },
          409,
        );
      }

      await writeInvitationExpiredHistory(client, {
        organizationId: invitation.organization_id,
        employeeId: invitation.employee_id,
        invitationId: invitation.invitation_id,
        expiresAt: invitation.expires_at,
        trigger: "acceptance_attempted",
      });

      await client.query("COMMIT");
      inTransaction = false;

      return jsonResponse(
        { message: "This invitation has expired" },
        410,
      );
    }

    if (invitation.organization_status !== "ACTIVE") {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        { message: "The organization is not active" },
        409,
      );
    }

    if (
      invitation.employment_status !== "INACTIVE" &&
      invitation.employment_status !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        {
          message:
            "This employee profile is not eligible for invitation acceptance.",
        },
        409,
      );
    }

    const employeeEmail =
      typeof invitation.employee_email === "string"
        ? invitation.employee_email.trim().toLowerCase()
        : "";

    if (!employeeEmail || employeeEmail !== invitation.email) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        {
          message:
            "The employee email has changed. Please request a new invitation.",
        },
        409,
      );
    }

    if (!invitationRoleIsValid(invitation)) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        {
          message:
            "The invitation role no longer matches the workforce profile. Please request administrator assistance.",
        },
        409,
      );
    }

    /*
     * Revalidate the complete workforce reporting hierarchy inside the
     * transaction. The resulting manager is authoritative for activation.
     */
    const hierarchy = await resolveAcceptanceManager(
      client,
      invitation,
    );

    if (hierarchy.error) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        { message: hierarchy.error },
        409,
      );
    }

    const activationManagerId = hierarchy.managerId;

    /*
     * Prevent duplicate account creation. The database's unique constraints
     * remain an additional safeguard against concurrent requests.
     */
    const existingUser = await client.query(
      `SELECT id
       FROM public.users
       WHERE employee_id = $1
          OR LOWER(TRIM(email)) = $2
       LIMIT 1`,
      [invitation.employee_id, invitation.email],
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return jsonResponse(
        {
          message:
            "An account already exists for this employee or email.",
        },
        409,
      );
    }

    const passwordHash = await hashNewPassword(input.password);

    /*
     * 1. Activate the employee profile and synchronize its reporting manager.
     * The transaction rolls back if account creation or invitation consumption
     * fails later.
     */
    const employeeUpdate = await client.query<{
      id: string;
    }>(
      `UPDATE public.employees
       SET employment_status = 'ACTIVE',
           manager_id = $4,
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
         AND workforce_role_id = $3
         AND employment_status IN ('INACTIVE', 'ACTIVE')
       RETURNING id`,
      [
        invitation.employee_id,
        invitation.organization_id,
        invitation.role_id,
        activationManagerId,
      ],
    );

    if (employeeUpdate.rowCount !== 1) {
      throw new Error(
        "Employee profile changed or became ineligible during acceptance",
      );
    }

    /*
     * 2. Create the active organization account with the validated role.
     */
    const userResult = await client.query<{
      id: string;
      email: string;
      status: string;
    }>(
      `INSERT INTO public.users (
         email,
         password_hash,
         account_scope,
         organization_id,
         employee_id,
         status,
         role_id
       )
       VALUES ($1, $2, 'ORGANIZATION', $3, $4, 'ACTIVE', $5)
       RETURNING id, email, status`,
      [
        invitation.email,
        passwordHash,
        invitation.organization_id,
        invitation.employee_id,
        invitation.role_id,
      ],
    );

    const newUser = userResult.rows[0];

    if (!newUser) {
      throw new Error("Account creation returned no user");
    }

    /*
     * 3. Record a separate reporting-line event when acceptance repairs a
     * stale manager_id. This is kept in the same transaction as acceptance.
     */
    if (invitation.manager_id !== activationManagerId) {
      await writeEmployeeHistory(client, {
        organizationId: invitation.organization_id,
        employeeId: invitation.employee_id,
        actorUserId: newUser.id,
        eventType: "REPORTING_LINE_CHANGED",
        reason:
          "The reporting manager was synchronized with the validated workforce hierarchy during invitation acceptance.",
        beforeState: {
          employee_code: invitation.employee_code,
          employment_status: invitation.employment_status,
          department_id: invitation.department_id,
          manager_id: invitation.manager_id,
        },
        afterState: {
          employee_code: invitation.employee_code,
          employment_status: "ACTIVE",
          department_id: invitation.department_id,
          manager_id: activationManagerId,
        },
        metadata: {
          workflow: "employee_invitation_acceptance",
          invitation_id: invitation.invitation_id,
        },
      });
    }

    /*
     * 4. Consume the pending invitation. Recheck status and expiry in the
     * UPDATE so acceptance cannot succeed using a stale invitation state.
     */
    const acceptedInvitation = await client.query(
      `UPDATE public.employee_invitations
       SET status = 'ACCEPTED',
           accepted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
         AND employee_id = $3
         AND role_id = $4
         AND status = 'PENDING'
         AND expires_at > NOW()
       RETURNING id`,
      [
        invitation.invitation_id,
        invitation.organization_id,
        invitation.employee_id,
        invitation.role_id,
      ],
    );

    if (acceptedInvitation.rowCount !== 1) {
      throw new Error(
        "Invitation was no longer eligible for acceptance",
      );
    }

    /*
     * 5. Record account creation, activation, and invitation consumption.
     */
    await writeEmployeeHistory(client, {
      organizationId: invitation.organization_id,
      employeeId: invitation.employee_id,
      actorUserId: newUser.id,
      eventType: "INVITATION_ACCEPTED",
      reason:
        "Workforce invitation accepted; employee profile activated and account created.",
      beforeState: {
        employment_status: invitation.employment_status,
        department_id: invitation.department_id,
        manager_id: invitation.manager_id,
        account_status: "NONE",
        invitation_status: "PENDING",
      },
      afterState: {
        employment_status: "ACTIVE",
        department_id: invitation.department_id,
        manager_id: activationManagerId,
        account_status: "ACTIVE",
        workforce_role: invitation.role_name,
        invitation_status: "ACCEPTED",
        role_id: invitation.role_id,
      },
      metadata: {
        workflow: "employee_invitation_acceptance",
        invitation_id: invitation.invitation_id,
      },
    });

    /*
     * 6. Commit all changes atomically.
     */
    await client.query("COMMIT");
    inTransaction = false;

    return jsonResponse(
      {
        status: "ok",
        message: "Invitation accepted and employee account created",
        user: newUser,
        employee: {
          employeeCode: invitation.employee_code,
          role: invitation.role_name,
          employmentStatus: "ACTIVE",
        },
      },
      201,
    );
  } catch (error) {
    if (client && inTransaction) {
      try {
        await client.query("ROLLBACK");
        inTransaction = false;
      } catch (rollbackError) {
        console.error(
          "Employee invitation rollback failed:",
          rollbackError,
        );
      }
    }

    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return jsonResponse(
        {
          message:
            "An account or invitation conflicts with existing data.",
        },
        409,
      );
    }

    if (dbError.code === "23503") {
      return jsonResponse(
        {
          message:
            "The employee, role, organization, or reporting-line reference is no longer valid.",
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
      "Employee invitation acceptance failed:",
      error,
    );

    return jsonResponse(
      { message: "Unable to accept invitation right now" },
      500,
    );
  } finally {
    client?.release();
  }
}