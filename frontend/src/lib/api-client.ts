import type { ApiErrorPayload } from "@/types/workspace";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const candidate = payload as ApiErrorPayload;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
    if (typeof candidate.detail === "string" && candidate.detail.trim()) return candidate.detail;
  }
  return fallback;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`/api/backend${normalizedPath}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(messageFrom(payload, `Request failed with HTTP ${response.status}.`), response.status, payload);
  }
  if (payload === null) throw new ApiError("The server returned an unreadable response.", response.status);
  return payload as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pickArray(payload: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  if (isRecord(payload.data)) {
    for (const key of keys) {
      const value = payload.data[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  return [];
}

export function stringValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function numberValue(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}
