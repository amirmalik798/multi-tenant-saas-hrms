export function humanize(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  return value.replace(/[._-]+/g, " ").trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat().format(value);
}

export function formatDate(value: unknown, timeZone?: string): string {
  if (typeof value !== "string" || !value) return "—";
  const isCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isCalendarDate ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  // Date-only values represent calendar days, not instants. Keep them fixed
  // regardless of the viewer's timezone.
  const displayTimeZone = isCalendarDate ? "UTC" : timeZone;
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(displayTimeZone ? { timeZone: displayTimeZone } : {}) }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  }
}

export function formatMoney(value: unknown, currencyCode?: string | null): string {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount)) return "—";
  if (!currencyCode) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currencyCode} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount)}`;
  }
}

/** Return today's calendar date in the configured organization timezone. */
export function getISODateInTimeZone(timeZone: string, referenceDate = new Date()): string {
  if (!timeZone || !timeZone.trim()) throw new Error("An organization timezone is required to determine today's date.");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(referenceDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error("Unable to determine today's date in the organization timezone.");
  return `${values.year}-${values.month}-${values.day}`;
}

export function getLocalISODate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

/** Convert a date/time entered in the organization's timezone into an ISO timestamp with its actual UTC offset. */
export function zonedDateTimeToOffsetISO(date: string, time: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Choose a valid date and time.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetAt = (timestamp: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const v = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const zonedAsUtc = Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day), Number(v.hour), Number(v.minute), Number(v.second));
    return zonedAsUtc - Math.floor(timestamp / 1000) * 1000;
  };
  const initialOffset = offsetAt(naiveUtc);
  const candidate = naiveUtc - initialOffset;
  const finalOffset = offsetAt(candidate);
  const instant = new Date(naiveUtc - finalOffset);
  const check = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(check.map((part) => [part.type, part.value]));
  if (values.year !== String(year).padStart(4, "0") || values.month !== String(month).padStart(2, "0") || values.day !== String(day).padStart(2, "0") || values.hour !== String(hour).padStart(2, "0") || values.minute !== String(minute).padStart(2, "0")) {
    throw new Error("That local time does not exist in the organization's timezone because of a clock change. Choose another time.");
  }
  const sign = finalOffset >= 0 ? "+" : "-";
  const absMinutes = Math.abs(Math.round(finalOffset / 60000));
  const offset = `${sign}${String(Math.floor(absMinutes / 60)).padStart(2, "0")}:${String(absMinutes % 60).padStart(2, "0")}`;
  return `${date}T${time}:00${offset}`;
}
