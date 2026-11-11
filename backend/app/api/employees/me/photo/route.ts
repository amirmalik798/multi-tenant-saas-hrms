
import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { getTenantPermissionActor } from "../../../../../lib/permissions";
import { validateSameOriginRequest } from "../../../../../lib/request-security";

const MAX_IMAGE_SIZE = 25 * 1024;
const MAX_REQUEST_SIZE = 64 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

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

async function getAuthenticatedEmployee() {
  const actor = await getTenantPermissionActor();

  if (!actor) {
    return {
      ok: false as const,
      response: jsonResponse(
        { message: "Authentication required" },
        401,
      ),
    };
  }

  if (
    actor.kind !== "ORGANIZATION_USER" ||
    !["EMPLOYEE", "DEPARTMENT_MANAGER", "HR_MANAGER"].includes(actor.roleName) ||
    !actor.employeeId ||
    !actor.organizationId
  ) {
    return {
      ok: false as const,
      response: jsonResponse(
        {
          message:
            "This endpoint is only available to an authenticated workforce member",
        },
        403,
      ),
    };
  }

  return {
    ok: true as const,
    userId: actor.userId,
    employeeId: actor.employeeId,
    organizationId: actor.organizationId,
  };
}

type BoundedBodyResult =
  | { ok: true; body: ArrayBuffer }
  | {
      ok: false;
      status: 400 | 413;
      message: string;
    };

/**
 * Reads a request body without allowing it to exceed the configured limit.
 * Content-Length is an early check; streamed bytes are counted as well.
 */
async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const normalizedLength = contentLength.trim();

    if (!/^\d+$/.test(normalizedLength)) {
      return {
        ok: false,
        status: 400,
        message: "Invalid Content-Length header",
      };
    }

    const declaredLength = Number(normalizedLength);

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > maxBytes
    ) {
      return {
        ok: false,
        status: 413,
        message: "Upload request is too large",
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      status: 400,
      message: "The upload request has no body",
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The request will be rejected regardless.
        }

        return {
          ok: false,
          status: 413,
          message: "Upload request is too large",
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Unable to read the upload request",
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore cleanup errors.
    }
  }

  // Use an explicit ArrayBuffer for Request body compatibility.
  const body = new ArrayBuffer(totalBytes);
  const output = new Uint8Array(body);

  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    ok: true,
    body,
  };
}

/**
 * Checks image signatures and basic container structure.
 * This does not replace full image decoding.
 */
function detectImageType(
  buffer: Buffer,
): AllowedImageType | null {
  // JPEG signature and EOI marker.
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

  // PNG signature and IEND trailer.
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

  // WebP RIFF container.
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
 * GET /api/employees/me/photo
 *
 * Returns the authenticated employee's own profile photo.
 */
export async function GET() {
  try {
    const auth = await getAuthenticatedEmployee();

    if (!auth.ok) {
      return auth.response;
    }

    const result = await pool.query<{
      profile_image: Buffer | null;
      profile_image_mime_type: string | null;
    }>(
      `SELECT
         CASE
           WHEN e.profile_image IS NOT NULL
             AND e.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(e.profile_image) <= $4
             THEN e.profile_image
           WHEN account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= $4
             THEN account.profile_image
           ELSE NULL
         END AS profile_image,
         CASE
           WHEN e.profile_image IS NOT NULL
             AND e.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(e.profile_image) <= $4
             THEN e.profile_image_mime_type
           WHEN account.profile_image IS NOT NULL
             AND account.profile_image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
             AND octet_length(account.profile_image) <= $4
             THEN account.profile_image_mime_type
           ELSE NULL
         END AS profile_image_mime_type
       FROM public.employees AS e
       JOIN public.organizations AS o
         ON o.id = e.organization_id
       LEFT JOIN LATERAL (
         SELECT
           u.profile_image,
           u.profile_image_mime_type
         FROM public.users AS u
         WHERE u.id = $3::uuid
           AND u.organization_id = e.organization_id
           AND u.account_scope = 'ORGANIZATION'
           AND u.status = 'ACTIVE'
         LIMIT 1
       ) AS account ON TRUE
       WHERE e.id = $1::uuid
         AND e.organization_id = $2::uuid
         AND e.employment_status = 'ACTIVE'
         AND o.status = 'ACTIVE'
       LIMIT 1`,
      [auth.employeeId, auth.organizationId, auth.userId, MAX_IMAGE_SIZE],
    );

    const employee = result.rows[0];

    if (!employee) {
      return jsonResponse(
        { message: "Employee profile not found" },
        404,
      );
    }

    if (
      !employee.profile_image ||
      !employee.profile_image_mime_type
    ) {
      return jsonResponse(
        { message: "No profile photo has been uploaded" },
        404,
      );
    }

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        employee.profile_image_mime_type as AllowedImageType,
      ) ||
      employee.profile_image.length > MAX_IMAGE_SIZE
    ) {
      return jsonResponse(
        { message: "The stored profile photo is invalid" },
        500,
      );
    }

    const detectedType = detectImageType(
      employee.profile_image,
    );

    if (detectedType !== employee.profile_image_mime_type) {
      return jsonResponse(
        { message: "The stored profile photo is invalid" },
        500,
      );
    }

    return new NextResponse(
      new Uint8Array(employee.profile_image),
      {
        status: 200,
        headers: {
          "Content-Type": employee.profile_image_mime_type,
          "Content-Length": String(
            employee.profile_image.length,
          ),
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      },
    );
  } catch (error) {
    console.error(
      "Failed to load employee profile photo:",
      error,
    );

    return jsonResponse(
      {
        message:
          "Unable to load your profile photo right now",
      },
      500,
    );
  }
}

/**
 * PUT /api/employees/me/photo
 *
 * Uploads or replaces the authenticated employee's own photo.
 */
export async function PUT(request: Request) {
  // Apply the existing project's same-origin protection.
  const originError = validateSameOriginRequest(request);

  if (originError) {
    return originError;
  }

  try {
    const auth = await getAuthenticatedEmployee();

    if (!auth.ok) {
      return auth.response;
    }

    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

    if (contentType !== "multipart/form-data") {
      return jsonResponse(
        {
          message:
            "Content-Type must be multipart/form-data",
        },
        415,
      );
    }

    const boundedBody = await readBoundedRequestBody(
      request,
      MAX_REQUEST_SIZE,
    );

    if (!boundedBody.ok) {
      return jsonResponse(
        { message: boundedBody.message },
        boundedBody.status,
      );
    }

    let formData: FormData;

    try {
      const boundedRequest = new Request(request.url, {
        method: "PUT",
        headers: request.headers,
        body: boundedBody.body,
      });

      formData = await boundedRequest.formData();
    } catch {
      return jsonResponse(
        { message: "Invalid image upload request" },
        400,
      );
    }

    const entries = Array.from(formData.entries());

    if (
      entries.length !== 1 ||
      entries[0][0] !== "photo"
    ) {
      return jsonResponse(
        {
          message:
            "Upload exactly one image using the photo field",
        },
        400,
      );
    }

    const uploadedFile = formData.get("photo");

    if (
      typeof File === "undefined" ||
      !(uploadedFile instanceof File)
    ) {
      return jsonResponse(
        { message: "Please select an image to upload" },
        400,
      );
    }

    if (uploadedFile.size === 0) {
      return jsonResponse(
        { message: "The selected image is empty" },
        400,
      );
    }

    if (uploadedFile.size > MAX_IMAGE_SIZE) {
      return jsonResponse(
        {
          message:
            "The image must not exceed 25 KB (25,600 bytes)",
        },
        413,
      );
    }

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        uploadedFile.type as AllowedImageType,
      )
    ) {
      return jsonResponse(
        {
          message:
            "Only JPEG, PNG and WebP images are supported",
        },
        415,
      );
    }

    const buffer = Buffer.from(
      await uploadedFile.arrayBuffer(),
    );

    const actualImageType = detectImageType(buffer);

    if (
      !actualImageType ||
      actualImageType !== uploadedFile.type
    ) {
      return jsonResponse(
        {
          message:
            "The selected file is not a valid JPEG, PNG or WebP image",
        },
        415,
      );
    }

    const result = await pool.query(
      `UPDATE public.employees AS e
       SET
         profile_image = $3::bytea,
         profile_image_mime_type = $4,
         profile_image_updated_at = NOW()
       WHERE e.id = $1::uuid
         AND e.organization_id = $2::uuid
         AND e.employment_status = 'ACTIVE'
         AND EXISTS (
           SELECT 1
           FROM public.organizations AS o
           WHERE o.id = e.organization_id
             AND o.status = 'ACTIVE'
         )
       RETURNING
         e.profile_image_updated_at`,
      [
        auth.employeeId,
        auth.organizationId,
        buffer,
        actualImageType,
      ],
    );

    if (result.rowCount !== 1) {
      return jsonResponse(
        { message: "Employee profile not found" },
        404,
      );
    }

    return jsonResponse({
      status: "ok",
      message: "Profile photo uploaded successfully",
      image: {
        mimeType: actualImageType,
        sizeBytes: buffer.length,
        updatedAt:
          result.rows[0].profile_image_updated_at,
      },
    });
  } catch (error) {
    console.error(
      "Failed to upload employee profile photo:",
      error,
    );

    return jsonResponse(
      {
        message:
          "Unable to upload your profile photo right now",
      },
      500,
    );
  }
}
