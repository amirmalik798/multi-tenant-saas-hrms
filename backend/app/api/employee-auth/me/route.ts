import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { getOrganizationUser } from "../../../../lib/auth";

const EMPLOYEE_WORKSPACE_ROLES: ReadonlySet<string> =
  new Set([
    "HR_MANAGER",
    "DEPARTMENT_MANAGER",
    "EMPLOYEE",
  ]);

function jsonResponse(
  body: unknown,
  status = 200,
) {
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

/**
 * GET /api/employee-auth/me
 *
 * Returns the identity and permissions of the authenticated workforce user.
 * This endpoint does not accept an employee ID from the caller.
 */
export async function GET() {
  try {
    const user = await getOrganizationUser();

    if (!user) {
      return jsonResponse(
        {
          authenticated: false,
          message: "Authentication required",
        },
        401,
      );
    }

    if (!EMPLOYEE_WORKSPACE_ROLES.has(user.roleName)) {
      return jsonResponse(
        {
          authenticated: false,
          message:
            "This account does not use the employee workspace",
        },
        403,
      );
    }

    return jsonResponse({
      status: "ok",
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.roleName,
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        employeeId: user.employeeId,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    unstable_rethrow(error);

    console.error(
      "Employee session verification failed:",
      error,
    );

    return jsonResponse(
      {
        authenticated: false,
        message: "Unable to verify session",
      },
      500,
    );
  }
}