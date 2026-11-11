
import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import {
  getTenantPermissionActor,
  hasTenantPermission,
} from "../../../../../lib/permissions";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function detectImageType(buffer: Buffer): AllowedImageType | null {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {
    return "image/jpeg";
  }

  const pngEndMarker = Buffer.from([
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);

  if (
    buffer.length >= 20 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
      ]),
    ) &&
    buffer.subarray(-12).equals(pngEndMarker)
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 20 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP" &&
    buffer.readUInt32LE(4) === buffer.length - 8
  ) {
    const chunkType = buffer.toString("ascii", 12, 16);
    const chunkLength = buffer.readUInt32LE(16);

    if (
      ["VP8 ", "VP8L", "VP8X"].includes(chunkType) &&
      chunkLength > 0 &&
      chunkLength <= buffer.length - 20
    ) {
      return "image/webp";
    }
  }

  return null;
}

/**
 * GET /api/employees/:id/photo
 * Returns a photo only when the authenticated tenant actor is authorized
 * to view the requested employee record.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await getTenantPermissionActor();

    if (!actor) {
      return jsonResponse({ message: "Authentication required" }, 401);
    }

    const { id } = await context.params;

    if (!uuidPattern.test(id)) {
      return jsonResponse({ message: "Invalid employee ID" }, 400);
    }

    // A verified participant may view the other participant's photo in a
    // private workforce conversation, even when directory scope is narrower.
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    let isConversationParticipantPhoto = false;

    if (conversationId !== null) {
      if (!uuidPattern.test(conversationId)) {
        return jsonResponse({ message: "Invalid conversation ID" }, 400);
      }

      const conversationAccess = await pool.query(
        `SELECT 1
         FROM public.workforce_conversations AS c
         JOIN public.users AS target_user
           ON target_user.organization_id = c.organization_id
          AND target_user.account_scope = 'ORGANIZATION'
          AND target_user.id IN (c.created_by_user_id, c.recipient_user_id)
          AND (
            target_user.employee_id = $3::uuid
            OR EXISTS (
              SELECT 1
              FROM public.employees AS linked_employee
              WHERE linked_employee.id = $3::uuid
                AND linked_employee.organization_id = c.organization_id
                AND LOWER(BTRIM(linked_employee.email)) =
                    LOWER(BTRIM(target_user.email))
            )
          )
         WHERE c.id = $1::uuid
           AND c.organization_id = $2::uuid
           AND (c.created_by_user_id = $4::uuid OR c.recipient_user_id = $4::uuid)
         LIMIT 1`,
        [conversationId, actor.organizationId, id, actor.userId],
      );

      isConversationParticipantPhoto = conversationAccess.rowCount === 1;
    }

    const isOrganizationUser = actor.kind === "ORGANIZATION_USER";
    const isDepartmentManager =
      isOrganizationUser && actor.roleName === "DEPARTMENT_MANAGER";
    const isEmployee =
      isOrganizationUser && actor.roleName === "EMPLOYEE";
    const isOwnEmployee =
      isOrganizationUser && id === actor.employeeId;

    // Employees and Department Managers may view only their own direct
    // reporting manager's photo outside the normal employee-directory scope.
    // The relationship is verified from the authenticated employee record;
    // no manager ID supplied by the browser can grant access.
    let isReportingManagerPhoto = false;

    if (
      isOrganizationUser &&
      (isEmployee || isDepartmentManager) &&
      actor.employeeId &&
      !isOwnEmployee
    ) {
      const reportingManagerAccess = await pool.query(
        `SELECT 1
         FROM public.employees AS workforce_member
         JOIN public.employees AS reporting_manager
           ON reporting_manager.id = workforce_member.manager_id
          AND reporting_manager.organization_id = workforce_member.organization_id
         WHERE workforce_member.id = $1::uuid
           AND workforce_member.organization_id = $2::uuid
           AND reporting_manager.id = $3::uuid
         LIMIT 1`,
        [actor.employeeId, actor.organizationId, id],
      );

      isReportingManagerPhoto = reportingManagerAccess.rowCount === 1;
    }

    if (isEmployee) {
      if (
        (!isOwnEmployee || !hasTenantPermission(actor, "employee.self.view")) &&
        !isConversationParticipantPhoto &&
        !isReportingManagerPhoto
      ) {
        return jsonResponse({ message: "Employee not found" }, 404);
      }
    } else if (isDepartmentManager && isOwnEmployee) {
      if (
        !hasTenantPermission(actor, "employee.self.view") &&
        !isConversationParticipantPhoto
      ) {
        return jsonResponse(
          { message: "You do not have permission to view this employee photo" },
          403,
        );
      }
    } else if (
      !isDepartmentManager &&
      !hasTenantPermission(actor, "employee.view") &&
      !isConversationParticipantPhoto &&
      !isReportingManagerPhoto
    ) {
      return jsonResponse(
        { message: "You do not have permission to view employee photos" },
        403,
      );
    }

    const restrictToManagedDepartments =
      isDepartmentManager &&
      !isOwnEmployee &&
      !isConversationParticipantPhoto &&
      !isReportingManagerPhoto;

    const departmentManagerPredicate = restrictToManagedDepartments
      ? `AND EXISTS (
           SELECT 1
           FROM public.departments AS assigned_department
           WHERE assigned_department.id = e.department_id
             AND assigned_department.organization_id = e.organization_id
             AND assigned_department.manager_id = $3::uuid
         )`
      : "";

    const queryValues: unknown[] = [id, actor.organizationId];

    if (restrictToManagedDepartments && isOrganizationUser) {
      queryValues.push(actor.employeeId);
    }

    const result = await pool.query<{
      profile_image: Buffer | null;
      profile_image_mime_type: string | null;
    }>(
      `SELECT
         CASE
           WHEN account.role_name = 'ORGANIZATION_ADMIN'
             AND account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= 25600
             THEN account.profile_image
           WHEN e.profile_image IS NOT NULL
             AND e.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(e.profile_image) <= 25600
             THEN e.profile_image
           WHEN account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= 25600
             THEN account.profile_image
           ELSE NULL
         END AS profile_image,
         CASE
           WHEN account.role_name = 'ORGANIZATION_ADMIN'
             AND account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= 25600
             THEN account.profile_image_mime_type
           WHEN e.profile_image IS NOT NULL
             AND e.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(e.profile_image) <= 25600
             THEN e.profile_image_mime_type
           WHEN account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= 25600
             THEN account.profile_image_mime_type
           ELSE NULL
         END AS profile_image_mime_type
       FROM public.employees AS e
       JOIN public.organizations AS o
         ON o.id = e.organization_id
       LEFT JOIN LATERAL (
         SELECT
           u.profile_image,
           u.profile_image_mime_type,
           r.name AS role_name
         FROM public.users AS u
         JOIN public.roles AS r
           ON r.id = u.role_id
          AND r.organization_id = u.organization_id
          AND r.scope = 'ORGANIZATION'
         WHERE u.organization_id = e.organization_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
           AND (
             u.employee_id = e.id
             OR LOWER(BTRIM(u.email)) = LOWER(BTRIM(e.email))
           )
         ORDER BY
           CASE WHEN r.name = 'ORGANIZATION_ADMIN' THEN 0 ELSE 1 END,
           CASE WHEN u.employee_id = e.id THEN 0 ELSE 1 END,
           u.id ASC
         LIMIT 1
       ) AS account ON TRUE
       WHERE e.id = $1::uuid
         AND e.organization_id = $2::uuid
         AND o.status = 'ACTIVE'
         ${departmentManagerPredicate}
       LIMIT 1`,
      queryValues,
    );

    const employee = result.rows[0];

    if (!employee) {
      return jsonResponse({ message: "Employee not found" }, 404);
    }

    if (
      !employee.profile_image ||
      !employee.profile_image_mime_type
    ) {
      return jsonResponse({ message: "No profile photo has been uploaded" }, 404);
    }

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        employee.profile_image_mime_type as AllowedImageType,
      ) ||
      employee.profile_image.length > 25 * 1024
    ) {
      return jsonResponse({ message: "The stored profile photo is invalid" }, 500);
    }

    const detectedType = detectImageType(employee.profile_image);

    if (detectedType !== employee.profile_image_mime_type) {
      return jsonResponse({ message: "The stored profile photo is invalid" }, 500);
    }

    return new NextResponse(new Uint8Array(employee.profile_image), {
      status: 200,
      headers: {
        "Content-Type": employee.profile_image_mime_type,
        "Content-Length": String(employee.profile_image.length),
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("Failed to load employee profile photo:", error);
    return jsonResponse(
      { message: "Unable to load employee profile photo right now" },
      500,
    );
  }
}
