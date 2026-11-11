/** Shared, explicit AM/PM formatting for attendance and schedule timestamps. */
export function formatTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  const plainTime = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (plainTime) {
    const hour = Number(plainTime[1]);
    const minute = Number(plainTime[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    // A supplied organization timezone must never silently fall back to the
    // browser's timezone. Keep the original value visible for diagnosis.
    if (timeZone) return value;
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
}

export function formatDateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    // Avoid presenting a device-local timestamp when the organization
    // timezone was explicitly supplied but could not be applied.
    if (timeZone) return value;
    return date.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
