"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileBarChart,
  FileCheck2,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function currentDateInTimeZone(timeZone?: string): string {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(now);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to the browser's local date if the configured time zone is invalid.
  }
  return localDate(now);
}

function readMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const message = (value as Record<string, unknown>).message;
  return typeof message === "string" ? message : "";
}

export default function HRManagerReportsPage() {
  const auth = useHRManagerSession();
  const [reportDate, setReportDate] = useState(() => localDate(new Date()));
  const [organizationTimeZone, setOrganizationTimeZone] = useState("");
  const [dateSourceWarning, setDateSourceWarning] = useState("");
  const reportDateEdited = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadOrganizationDate() {
      try {
        const response = await fetch("/api/backend/hr-manager/overview", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== "object") {
          throw new Error("Unable to load organization date settings.");
        }
        const data = payload as Record<string, unknown>;
        const organization = data.organization && typeof data.organization === "object"
          ? data.organization as Record<string, unknown>
          : null;
        const workDate = typeof data.workDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.workDate)
          ? data.workDate
          : "";
        const timeZone = typeof organization?.timeZone === "string" ? organization.timeZone : "";
        if (cancelled) return;
        if (timeZone) setOrganizationTimeZone(timeZone);
        if (!reportDateEdited.current) {
          if (workDate) setReportDate(workDate);
          else setReportDate(currentDateInTimeZone(timeZone || undefined));
        }
        setDateSourceWarning("");
      } catch {
        if (!cancelled) setDateSourceWarning("Organization date settings could not be loaded. Confirm the selected date is the intended organization work date.");
      }
    }

    void loadOrganizationDate();
    return () => { cancelled = true; };
  }, []);

  async function generateReport() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      setError("Choose a valid report date.");
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    let objectUrl = "";

    try {
      const response = await fetch(`/api/backend/attendance/reports/daily?date=${encodeURIComponent(reportDate)}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(readMessage(payload) || `The report could not be generated (HTTP ${response.status}).`);
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error("The report was empty. Please try again.");

      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `daily-attendance-${reportDate}.pdf`;
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setSuccess(`Daily attendance report downloaded for ${reportDate}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate the daily attendance report.");
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setLoading(false);
    }
  }

  if (auth.checking) return <HRManagerLoading message="Verifying your HR Manager session…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;

  return (
    <HRManagerShell
      user={auth.user}
      activePage="reports"
      title="Reports & governance"
      description="Generate operational reports from persisted attendance records using the organization's existing reporting rules and permissions."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/hr/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#C5D0DE] transition hover:text-white"><ArrowLeft size={15} /> Back to overview</Link>

        <section className="relative overflow-hidden rounded-3xl border border-[#344357] bg-gradient-to-br from-[#24354A] via-[#151C28] to-[#111827] p-5 shadow-xl shadow-black/20 sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 size-60 rounded-full bg-blue-500/[0.08] blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-blue-300/15 bg-blue-300/[0.08] text-blue-200"><FileBarChart size={23} /></span>
            <div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200">Operational reporting</div><h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Daily attendance report</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#C5D0DE]">Create a shareable PDF snapshot for a chosen work date. Use it to review the day's schedule and recorded punches in one document.</p></div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#344357]/80 bg-[#192333] p-5 shadow-lg shadow-black/10 sm:p-7">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20"><CalendarDays size={19} /></span><div><h3 className="text-base font-bold text-white">Report parameters</h3><p className="mt-1 text-xs text-[#9AA8BA]">Select the organization work date you want to review.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-end">
            <label className="block text-sm font-semibold text-[#E8EEF5]">Work date<input type="date" value={reportDate} onChange={(event) => { reportDateEdited.current = true; setReportDate(event.target.value); setError(""); setSuccess(""); }} className="mt-2 h-12 w-full rounded-xl border border-[#3A4A60] bg-[#0B0F17] px-3.5 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10" /></label>
            <button type="button" onClick={() => void generateReport()} disabled={loading || !reportDate} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-blue-950/20 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-wait disabled:opacity-50">{loading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}{loading ? "Preparing PDF…" : "Generate and download PDF"}</button>
          </div>
          {organizationTimeZone && <p className="mt-3 text-xs text-[#9AA8BA]">Organization time zone: {organizationTimeZone}</p>}
          {dateSourceWarning && <div role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3.5 text-xs leading-5 text-amber-200">{dateSourceWarning}</div>}
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3.5 text-sm leading-6 text-rose-200"><Info size={16} className="mt-1 shrink-0" />{error}</div>}
          {success && <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5 text-sm leading-6 text-emerald-200"><CheckCircle2 size={16} className="mt-1 shrink-0" />{success}</div>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#344357]/80 bg-[#111827] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]"><FileCheck2 size={16} className="text-blue-300" /> What the report contains</div><p className="mt-2 text-xs leading-5 text-[#9AA8BA]">Employee scope, assigned schedules and recorded punches.</p></div>
          <div className="rounded-2xl border border-[#344357]/80 bg-[#111827] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]"><ShieldCheck size={16} className="text-emerald-300" /> Records remain unchanged</div><p className="mt-2 text-xs leading-5 text-[#9AA8BA]">Generating a report does not alter punches. Server-side authorization remains authoritative.</p></div>
        </section>
      </div>
    </HRManagerShell>
  );
}
