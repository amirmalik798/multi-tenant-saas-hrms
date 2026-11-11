"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileClock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
  useHRManagerAutoRefresh,
} from "../../components/hr/HRManagerChrome";

type Row = Record<string, unknown>;
type ReviewKind = "corrections" | "overtime";
type Bucket = { rows: Row[]; error: string; loading: boolean };
type Buckets = Record<ReviewKind, Bucket>;
type SummaryCounts = Record<ReviewKind, number>;

const INITIAL_BUCKETS: Buckets = {
  corrections: { rows: [], error: "", loading: true },
  overtime: { rows: [], error: "", loading: true },
};

const CONFIG: Record<ReviewKind, {
  title: string;
  href: string;
  icon: typeof FileClock;
  tone: string;
  payloadKey: string;
  actionText: string;
}> = {
  corrections: {
    title: "Attendance corrections",
    href: "/hr/modules/attendance?section=corrections",
    icon: FileClock,
    tone: "text-blue-300 bg-blue-400/10 ring-blue-300/20",
    payloadKey: "requests",
    actionText: "Review correction",
  },
  overtime: {
    title: "Overtime requests",
    href: "/hr/modules/attendance?section=overtime",
    icon: Clock3,
    tone: "text-amber-200 bg-amber-400/10 ring-amber-300/20",
    payloadKey: "requests",
    actionText: "Review overtime",
  },

};

function readString(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function asRows(payload: unknown, key: string): Row[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const value = data[key];
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function responseMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  return typeof data.message === "string" ? data.message : "";
}

function personName(row: Row): string {
  return [readString(row, "firstName", "first_name"), readString(row, "lastName", "last_name")].filter(Boolean).join(" ") || readString(row, "employeeCode", "employee_code") || "Employee";
}

function formatDate(value: string): string {
  if (!value) return "Date unavailable";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", ...(isDateOnly ? { timeZone: "UTC" } : {}) }).format(date);
}

function formatDateTime(value: string): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function humanize(value: string): string {
  return value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Review required";
}

function targetDate(kind: ReviewKind, row: Row): string {
  if (kind === "corrections" || kind === "overtime") return formatDate(readString(row, "workDate", "work_date"));
  return "";
}

function isExcludedSelfItem(row: Row, actorEmployeeId: string): boolean {
  // The existing review endpoints prohibit reviewing records for the actor’s own employee profile.
  // They do not prohibit reviewing every record an HR Manager originally submitted on another person’s behalf.
  const employeeId = readString(row, "employeeId", "employee_id");
  return Boolean(employeeId && employeeId === actorEmployeeId);
}

async function loadBucket(kind: ReviewKind, actorEmployeeId: string): Promise<Bucket> {
  const config = CONFIG[kind];
  const path = `/api/backend/attendance/${kind}`;

  try {
    const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store" });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(responseMessage(payload) || `Unable to load this queue (HTTP ${response.status}).`);
    const rows = asRows(payload, config.payloadKey).filter((row) => {
      const status = readString(row, "status").toUpperCase();
      const isPending = status === "PENDING";
      return isPending && !isExcludedSelfItem(row, actorEmployeeId);
    });
    return { rows, error: "", loading: false };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : "Unable to load this queue.", loading: false };
  }
}

function ReviewSection({ kind, bucket, count }: { kind: ReviewKind; bucket: Bucket; count: number | null }) {
  const config = CONFIG[kind];
  const Icon = config.icon;
  return (
    <section className="hr-wq-panel overflow-hidden rounded-2xl border border-[#344357]/80 bg-[#192333] shadow-lg shadow-black/10">
      <div className="flex flex-col justify-between gap-3 border-b border-[#344357]/80 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${config.tone}`}><Icon size={18} /></span>
          <div className="min-w-0"><h2 className="hr-wq-heading text-sm font-bold text-white">{config.title}</h2></div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xl font-bold tabular-nums text-white">{bucket.loading && count === null ? "…" : count === null ? bucket.error ? "—" : bucket.rows.length : count.toLocaleString()}</span>
          <Link href={config.href} className="hr-wq-link inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#3A4A60] px-3 text-xs font-semibold text-blue-200 transition hover:border-[#53647A] hover:bg-white/[0.03]">Open workflow <ArrowRight size={13} /></Link>
        </div>
      </div>
      {!bucket.error && !bucket.loading && bucket.rows.length >= 200 && (
        <div role="status" className="border-b border-amber-300/20 bg-amber-300/[0.05] px-5 py-3 text-xs leading-5 text-amber-100 sm:px-6">
          This list reached its 200-record limit. Additional pending items may exist; open the full workflow to review the complete queue.
        </div>
      )}
      {bucket.error ? (
        <div className="flex items-start gap-3 p-5" role="alert"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-300" /><div><p className="text-sm font-semibold text-rose-100">This queue could not be loaded</p><p className="mt-1 text-xs leading-5 text-rose-200/80">{bucket.error}</p></div></div>
      ) : bucket.loading ? (
        <div className="flex items-center gap-2 p-5 text-sm text-[#9AA8BA]"><RefreshCw size={15} className="animate-spin text-blue-300" />Loading records…</div>
      ) : bucket.rows.length === 0 ? (
        <div className="hr-wq-empty flex items-start gap-3 p-5"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300" /><div><p className="text-sm font-semibold text-[#F8FAFC]">Nothing waiting in this queue</p></div></div>
      ) : (
        <div className="divide-y divide-slate-800/70">
          {bucket.rows.map((row) => {
            const id = readString(row, "id");
            const subtitle = [readString(row, "employeeCode", "employee_code"), readString(row, "departmentName", "department_name"), targetDate(kind, row)].filter(Boolean).join(" · ");
            const note = readString(row, "reason", "details");
            const requestDescription = kind === "corrections" ? `${humanize(readString(row, "eventType", "event_type"))} · requested ${formatDateTime(readString(row, "requestedAt", "requested_at"))}` : kind === "overtime" ? `${readString(row, "requestedMinutes", "requested_minutes") || "—"} minutes requested · ${humanize(readString(row, "requestType", "request_type"))}` : humanize(readString(row, "exceptionType", "exception_type"));
            return (
              <div key={id || `${kind}-${subtitle}`} className="hr-wq-record flex flex-col gap-3 border-b border-[#344357]/60 px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-start gap-3"><EmployeeProfilePhoto employeeId={readString(row, "employeeId", "employee_id") || null} name={personName(row)} className="size-10 rounded-xl border border-[#3A4A60] bg-[#202D40]/60" textClassName="text-xs font-bold text-blue-200" /><div className="min-w-0"><p className="hr-wq-record-name break-words text-sm font-semibold text-[#F8FAFC]">{personName(row)}</p><p className="hr-wq-record-meta mt-1 break-words text-xs text-[#9AA8BA]">{subtitle || "Record details unavailable"}</p><p className="hr-wq-record-detail mt-2 break-words text-xs text-[#E8EEF5]">{requestDescription}</p>{note && <p className="hr-wq-record-meta mt-1 line-clamp-2 break-words text-xs leading-5 text-[#9AA8BA]">{note}</p>}</div></div>
                <Link href={config.href} className="hr-wq-link inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-blue-300 transition hover:bg-blue-400/[0.06]">{config.actionText} <ArrowRight size={13} /></Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function HRManagerWorkQueuePage() {
  const auth = useHRManagerSession();
  const [buckets, setBuckets] = useState<Buckets>(INITIAL_BUCKETS);
  const [summaryCounts, setSummaryCounts] = useState<SummaryCounts | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const loadRequestId = useRef(0);

  const loadQueues = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!auth.user) return;
    const kinds: ReviewKind[] = ["corrections", "overtime"];
    const [results, overviewResult] = await Promise.all([
      Promise.all(kinds.map(async (kind) => [kind, await loadBucket(kind, auth.user!.employeeId)] as const)),
      (async (): Promise<{ counts: SummaryCounts | null; error: string }> => {
        try {
          const response = await fetch("/api/backend/hr-manager/overview", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          });
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok || !payload || typeof payload !== "object") {
            throw new Error(responseMessage(payload) || `Unable to load queue summary (HTTP ${response.status}).`);
          }
          const data = payload as Record<string, unknown>;
          const stats = data.stats;
          if (data.status !== "ok" || !stats || typeof stats !== "object") {
            throw new Error(responseMessage(payload) || "The queue summary is unavailable.");
          }
          const value = stats as Record<string, unknown>;
          const readCount = (key: string): number | null => typeof value[key] === "number" && Number.isFinite(value[key]) ? Math.max(0, Math.trunc(value[key] as number)) : null;
          const corrections = readCount("pendingCorrections");
          const overtime = readCount("pendingOvertime");
          if ([corrections, overtime].some((count) => count === null)) {
            throw new Error("The queue summary returned incomplete counts.");
          }
          return { counts: { corrections: corrections!, overtime: overtime! }, error: "" };
        } catch (error) {
          return { counts: null, error: error instanceof Error ? error.message : "The queue summary is unavailable." };
        }
      })(),
    ]);
    if (requestId !== loadRequestId.current) return;
    const next: Buckets = { ...INITIAL_BUCKETS };
    for (const [kind, bucket] of results) next[kind] = bucket;
    setBuckets(next);
    setSummaryCounts(overviewResult.counts);
    setSummaryError(overviewResult.error);
  }, [auth.user]);

  useEffect(() => {
    void loadQueues();
    return () => { loadRequestId.current += 1; };
  }, [loadQueues]);

  useHRManagerAutoRefresh(loadQueues, {
    enabled: Boolean(auth.user),
    shouldRefresh: () => true,
  });

  if (auth.checking) return <HRManagerLoading message="Verifying your HR Manager session…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;

  const actionableTotal = summaryCounts
    ? Object.values(summaryCounts).reduce((sum, count) => sum + count, 0)
    : null;

  return (
    <HRManagerShell
      user={auth.user}
      activePage="work-queue"
      title=""
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <div className="hr-work-queue-page space-y-6">
        <style jsx global>{`
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-panel {
            background: #ffffff !important;
            border-color: #d7e0eb !important;
            color: #172033 !important;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06) !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-heading {
            color: #172033 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-muted {
            color: #526176 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-link {
            color: #174ea6 !important;
            border-color: #c5d3e4 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-link:hover {
            background: #edf4ff !important;
            color: #123d83 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-record {
            border-color: #e2e8f0 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-record-name {
            color: #172033 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-record-meta {
            color: #526176 !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-record-detail {
            color: #34445b !important;
          }
          html[data-hr-manager-theme="light"] .hr-work-queue-page .hr-wq-empty {
            color: #26364d !important;
          }
        `}</style>
        <section className="relative overflow-hidden rounded-3xl border border-[#344357] bg-gradient-to-br from-[#24354A] via-[#151C28] to-[#111827] p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 size-60 rounded-full bg-blue-500/[0.07] blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200"><ShieldCheck size={13} /> Organization reviews</div><h2 className="mt-4 text-2xl font-bold tracking-tight text-white">HR work queue</h2></div><div className="min-w-[148px] rounded-2xl border border-[#3A4A60]/80 bg-[#151C28]/70 p-4"><p className="text-xs text-[#9AA8BA]">Actionable records</p><p className="mt-1 text-3xl font-bold tabular-nums text-white">{actionableTotal === null ? "—" : actionableTotal}</p></div></div>
        </section>
        {summaryError && <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-200">The full category counts are unavailable. Individual queue data below is still shown independently: {summaryError}</div>}
        <div className="grid gap-5 2xl:grid-cols-2">
          {(["corrections", "overtime"] as ReviewKind[]).map((kind) => <ReviewSection key={kind} kind={kind} bucket={buckets[kind]} count={summaryCounts?.[kind] ?? null} />)}
        </div>
      </div>
    </HRManagerShell>
  );
}
