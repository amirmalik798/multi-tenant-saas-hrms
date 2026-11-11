"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileClock,
  RefreshCw,
} from "lucide-react";
import { useEmployeeWorkspaceUser } from "./EmployeeChrome";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Row = Record<string, unknown>;
type Category = "corrections" | "overtime";
type Collection = { rows: Row[]; error: string };
type Collections = Record<Category, Collection>;

const PANEL = "min-w-0 rounded-2xl border border-white/[0.08] bg-[#121b29] shadow-lg shadow-black/10";
const LINK = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.11] bg-white/[0.03] px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-300/[0.05] hover:text-white";

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read(row: Row | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function rowsFrom(payload: unknown, key: string): Row[] {
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload[key])) return (payload[key] as unknown[]).filter(isRecord);
  if (isRecord(payload.data) && Array.isArray(payload.data[key])) return (payload.data[key] as unknown[]).filter(isRecord);
  return [];
}

function messageFrom(payload: unknown): string {
  return isRecord(payload) ? read(payload, "message", "error", "detail") : "";
}

async function requestRows(path: string, key: string): Promise<Row[]> {
  const response = await fetch(`/api/backend${path}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageFrom(payload) || `Request failed with HTTP ${response.status}.`);
  return rowsFrom(payload, key);
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, amount: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

function dateOf(row: Row): string {
  const value = read(row, "workDate", "work_date", "requestedAt", "requested_at", "createdAt", "created_at", "periodStartDate", "period_start_date", "recordedAt", "recorded_at");
  return value ? value.slice(0, 10) : "";
}

function statusOf(row: Row): string {
  return read(row, "status", "approvalStatus", "approval_status", "state", "reviewStatus") || "STATUS_UNAVAILABLE";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Status unavailable";
}

function employeeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Waiting for review",
    SUBMITTED: "Submitted for review",
    IN_REVIEW: "Under review",
    UNDER_REVIEW: "Under review",
    APPROVED: "Approved",
    REJECTED: "Not approved",
    RETURNED: "Changes requested",
    OPEN: "Needs attention",
    RESOLVED: "Resolved",
    DISMISSED: "Closed after review",
    COMPLETED: "Completed",
    DRAFT: "Draft",
  };
  return labels[status.toUpperCase()] || humanize(status);
}

function employeeStatusDescription(status: string, category: Category): string {
  switch (status.toUpperCase()) {
    case "PENDING":
    case "SUBMITTED":
    case "IN_REVIEW":
    case "UNDER_REVIEW":
      return "An authorized reviewer needs to make the next decision.";
    case "APPROVED":
      return category === "overtime"
        ? "Permission was granted. This does not confirm that overtime was worked."
        : "Your request was approved.";
    case "REJECTED":
      return "This request was not approved. Review the manager's note for the reason.";
    case "RETURNED":
      return "Changes were requested. Open the record and read the reviewer's note.";
        default:
      return "This status is supplied by your HRMS records.";
  }
}

function statusTone(status: string): string {
  const value = status.toUpperCase();
  if (["APPROVED", "COMPLETED", "RESOLVED", "CLOSED"].includes(value)) return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200";
  if (["REJECTED", "CANCELLED", "REVOKED"].includes(value)) return "border-rose-300/20 bg-rose-300/[0.06] text-rose-200";
  if (["RETURNED", "OPEN", "NEEDS_ACTION", "ACTION_REQUIRED"].includes(value)) return "border-amber-300/20 bg-amber-300/[0.06] text-amber-100";
  return "border-sky-300/20 bg-sky-300/[0.06] text-sky-200";
}

function shortDate(value: string): string {
  if (!value) return "Date not provided";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_COLLECTIONS: Collections = {
  corrections: { rows: [], error: "" },
  overtime: { rows: [], error: "" },
};

export default function EmployeeRequestsWorkspace() {
  const user = useEmployeeWorkspaceUser();
  const [collections, setCollections] = useState<Collections>(EMPTY_COLLECTIONS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!user || user.role !== "EMPLOYEE") {
      setLoading(false);
      return;
    }

    const today = localDate(new Date());
    const fromDate = addDays(today, -30);
    const toDate = addDays(today, 14);
    if (!silent) setLoading(true);
    const results = await Promise.allSettled([
      requestRows("/attendance/corrections", "requests"),
      requestRows("/attendance/overtime", "requests"),
    ]);
    const keys: Category[] = ["corrections", "overtime"];
    const next = { ...EMPTY_COLLECTIONS } as Collections;
    results.forEach((result, index) => {
      const key = keys[index];
      next[key] = result.status === "fulfilled"
        ? { rows: result.value, error: "" }
        : { rows: [], error: result.reason instanceof Error ? result.reason.message : "Unable to load this section." };
    });
    setCollections(next);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useWorkspaceAutoRefresh(() => load(true), {
    intervalMs: 60_000,
    shouldRefresh: () => !loading,
  });

  if (!user || user.role !== "EMPLOYEE") return null;

  const waitingReviews = [...collections.corrections.rows, ...collections.overtime.rows].filter((row) => ["PENDING", "SUBMITTED", "IN_REVIEW", "UNDER_REVIEW"].includes(statusOf(row).toUpperCase())).length;
  const reviewUnavailable = Boolean(collections.corrections.error || collections.overtime.error);

  const cards: { key: Category; title: string; description: string; icon: typeof FileClock; href: string; linkLabel: string; dateFields: string[]; detailsFields: string[] }[] = [
    { key: "corrections", title: "Attendance corrections", description: "Requests to correct a recorded or missing punch.", icon: FileClock, href: "/employee/attendance?tab=requests#correction-request", linkLabel: "Request a correction", dateFields: ["workDate", "requestedAt", "createdAt", "requested_at"], detailsFields: ["eventType", "event_type", "reason"] },
    { key: "overtime", title: "Overtime requests", description: "Advance requests that must be approved before extra work begins.", icon: CalendarClock, href: "/employee/attendance?tab=requests#overtime-request", linkLabel: "Request overtime", dateFields: ["workDate", "requestedAt", "createdAt"], detailsFields: ["requestType", "request_type", "requestedMinutes", "requested_minutes", "reason"] },
  ];

  return (
    <div className="employee-requests-workspace min-w-0 space-y-6 pb-8 text-slate-100">
      <header className="employee-requests-header flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:flex-row sm:items-end sm:p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300">Follow through</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">My Requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Track attendance corrections and advance overtime requests.</p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className={`${PANEL} p-4`}><p className="text-xs text-slate-500">Awaiting review</p><p className="mt-2 text-2xl font-black text-white">{loading || reviewUnavailable ? "—" : waitingReviews}</p><p className="mt-1 text-xs text-slate-500">{reviewUnavailable ? "Could not verify all sources" : "Pending correction and overtime requests"}</p></div>
        <div className={`${PANEL} p-4`}><p className="text-xs text-slate-500">Records available</p><p className="mt-2 text-2xl font-black text-white">{loading ? "—" : Object.values(collections).reduce((sum, item) => sum + item.rows.length, 0)}</p><p className="mt-1 text-xs text-slate-500">Across the loaded request categories</p></div>
      </section>


      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          const data = collections[card.key];
          const latest = [...data.rows].sort((a, b) => (read(b, "createdAt", "created_at", "requestedAt", "requested_at", "workDate", "work_date") || "").localeCompare(read(a, "createdAt", "created_at", "requestedAt", "requested_at", "workDate", "work_date") || "")).slice(0, 3);
          return (
            <article key={card.key} className={`${PANEL} p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200"><Icon size={18} /></span><div><h2 className="text-sm font-bold text-white">{card.title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p></div></div>
                <span className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-xs font-bold text-slate-300">{loading ? "—" : data.rows.length}</span>
              </div>
              {data.error ? <div role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.05] p-3 text-xs leading-5 text-rose-200">Could not load this section: {data.error}</div> : loading ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-black/10 p-4 text-xs text-slate-400"><RefreshCw size={14} className="animate-spin" />Loading records…</div> : latest.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-white/[0.1] p-4 text-xs text-slate-500">No requests are currently listed in this category.</div> : <div className="mt-4 space-y-2">{latest.map((row, index) => {
                const status = statusOf(row);
                const detail = card.detailsFields.map((field) => read(row, field)).find(Boolean);
                const id = read(row, "id") || `${card.key}-${index}`;

                return <div key={id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-200">{shortDate(card.dateFields.map((field) => read(row, field)).find(Boolean) || dateOf(row))}</p>{detail && <p className="mt-1 break-words text-xs text-slate-400">{humanize(detail)}{read(row, "requestedMinutes", "requested_minutes") ? ` · ${read(row, "requestedMinutes", "requested_minutes")} minutes` : ""}</p>}<p className="mt-1 break-words text-xs leading-5 text-slate-500">{employeeStatusDescription(status, card.key)}</p>{read(row, "reviewerNote", "reviewer_note") && <p className="mt-2 break-words rounded-lg border border-white/[0.06] bg-white/[0.025] p-2 text-xs leading-5 text-slate-300">Reviewer note: {read(row, "reviewerNote", "reviewer_note")}</p>}</div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(status)}`}>{employeeStatusLabel(status)}</span></div>;
              })}</div>}
              <Link href={card.href} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-300 hover:text-sky-200">{card.linkLabel} <ArrowRight size={14} /></Link>
            </article>
          );
        })}
      </section>
      <footer className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-5 text-slate-500"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-sky-300" /><p>Status labels come from the HRMS records. A pending request is not an approval, and opening this page does not change any request.</p></footer>
    </div>
  );
}

