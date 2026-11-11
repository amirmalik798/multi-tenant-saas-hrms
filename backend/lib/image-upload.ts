import { Buffer } from "node:buffer";

export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

export type UploadedImageResult =
  | { ok: true; bytes: Buffer; mimeType: SupportedImageType }
  | { ok: false; status: 400 | 413; message: string };

function detectImageType(bytes: Buffer): SupportedImageType | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
  ) return "image/jpeg";

  const pngEnd = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  if (
    bytes.length >= 20 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    bytes.subarray(-12).equals(pngEnd)
  ) return "image/png";

  if (
    bytes.length >= 20 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) === bytes.length - 8 &&
    ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)) &&
    bytes.readUInt32LE(16) > 0 &&
    bytes.readUInt32LE(16) <= bytes.length - 20
  ) return "image/webp";

  return null;
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* Request is rejected regardless. */ }
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    try { reader.releaseLock(); } catch { /* Ignore cleanup errors. */ }
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

export async function readUploadedImage(
  request: Request,
  fieldName: string,
  maxImageBytes: number,
): Promise<UploadedImageResult> {
  const maxRequestBytes = maxImageBytes + 16 * 1024;
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!/^\d+$/.test(contentLength.trim()) || !Number.isSafeInteger(declared)) {
      return { ok: false, status: 400, message: "Invalid upload size." };
    }
    if (declared > maxRequestBytes) {
      return { ok: false, status: 413, message: "Upload request is too large." };
    }
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return { ok: false, status: 400, message: "Upload an image using multipart form data." };
  }

  const boundedBody = await readBoundedBody(request, maxRequestBytes);
  if (!boundedBody) {
    return { ok: false, status: 413, message: "Upload request is too large or could not be read." };
  }

  let formData: FormData;
  try {
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: boundedBody,
    });
    formData = await boundedRequest.formData();
  } catch {
    return { ok: false, status: 400, message: "Invalid image upload request." };
  }

  const entries = Array.from(formData.entries());
  if (entries.length !== 1 || entries[0][0] !== fieldName) {
    return { ok: false, status: 400, message: `Upload exactly one image using the ${fieldName} field.` };
  }

  const file = formData.get(fieldName);
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, status: 400, message: "Please select an image." };
  }
  if (file.size > maxImageBytes) {
    return { ok: false, status: 413, message: `Image must not exceed ${Math.ceil(maxImageBytes / 1024)} KB.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected || detected !== file.type) {
    return { ok: false, status: 400, message: "Use a valid JPEG, PNG, or WebP image." };
  }

  return { ok: true, bytes, mimeType: detected };
}

export function imageResponse(bytes: Buffer, mimeType: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
