import { humanize } from "@/lib/format";

const SUCCESS_STATES = new Set(["ACTIVE", "APPROVED", "PAID", "COMPLETED", "ACCEPTED", "DELIVERED", "READ", "ELIGIBLE", "VERIFIED"]);
const WARNING_STATES = new Set(["INACTIVE", "PENDING", "UNPAID", "OPEN", "AWAITING", "SUBMITTED", "REVIEW", "DRAFT", "RESTRICTED"]);
const DANGER_STATES = new Set(["REJECTED", "FAILED", "FORMER", "EXPIRED", "REVOKED", "CANCELLED", "SUSPENDED", "ARCHIVED"]);

export function StatusBadge({ value, label }: { value?: unknown; label?: string }) {
  const status = typeof value === "string" ? value.toUpperCase() : "UNKNOWN";
  const states = new Set(status.split(/[^A-Z0-9]+/).filter(Boolean));
  const tone = [...DANGER_STATES].some((state) => states.has(state))
    ? "danger"
    : [...WARNING_STATES].some((state) => states.has(state))
      ? "warning"
      : [...SUCCESS_STATES].some((state) => states.has(state))
        ? "success"
        : "neutral";

  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {label ?? humanize(value)}
    </span>
  );
}
