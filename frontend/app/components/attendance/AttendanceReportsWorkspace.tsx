"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileBarChart,
  FileText,
  LockKeyhole,
  Printer,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  buildAttendanceReportDocument,
  type AttendanceReportPayload,
} from "./attendance-report-document";

type Audience = "organization-admin" | "hr-manager" | "department-manager" | "employee";
type ReportMode = "daily" | "member" | "organization-monthly";
type ReportTarget = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentName: string | null;
  workforceRole: string | null;
  employmentStatus: string | null;
};

type Props = { audience: Audience };

const INPUT =
  "mt-2 h-12 w-full rounded-xl border border-[#34465d] bg-[#0b1420] px-3.5 text-sm font-medium text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-55";
const BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-bold text-[#07111d] shadow-lg shadow-sky-950/20 transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-50";

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart(value: string): string {
  return value.slice(0, 7) + "-01";
}

function monthCount(fromDate: string, toDate: string): number {
  return (
    Number(toDate.slice(0, 4)) * 12 +
    Number(toDate.slice(5, 7)) -
    (Number(fromDate.slice(0, 4)) * 12 + Number(fromDate.slice(5, 7))) +
    1
  );
}

function readMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const message = (value as Record<string, unknown>).message;
  return typeof message === "string" ? message : "";
}

function targetName(target: ReportTarget): string {
  return [target.firstName, target.lastName].filter(Boolean).join(" ").trim() ||
    target.employeeCode ||
    "Workforce member";
}

function targetLabel(target: ReportTarget): string {
  const role = (target.workforceRole || "EMPLOYEE").replaceAll("_", " ").toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return [
    targetName(target),
    role,
    target.departmentName || "Unassigned",
    target.employeeCode || "",
  ].filter(Boolean).join(" · ");
}

function loadingDocument(title: string, detail: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#eef3f8;color:#20334b;font-family:Arial,Helvetica,sans-serif"><main style="max-width:620px;margin:12vh auto;padding:36px;background:#fff;border:1px solid #dce5ef;border-radius:18px"><div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#2474ae;text-transform:uppercase">HRMS · Attendance reports</div><h1 style="margin:12px 0 8px;font-size:24px">${title}</h1><p style="margin:0;color:#63748a;line-height:1.6">${detail}</p></main></body></html>`;
}

export default function AttendanceReportsWorkspace({ audience }: Props) {
  const isOrganizationAdmin = audience === "organization-admin";
  const isEmployee = audience === "employee";
  const [mode, setMode] = useState<ReportMode>(isOrganizationAdmin ? "daily" : "member");
  const [reportDate, setReportDate] = useState(() => localDate());
  const [fromDate, setFromDate] = useState(() => monthStart(localDate()));
  const [toDate, setToDate] = useState(() => localDate());
  const [fromMonth, setFromMonth] = useState(() => monthStart(localDate()).slice(0, 7));
  const [toMonth, setToMonth] = useState(() => localDate().slice(0, 7));
  const [timeZone, setTimeZone] = useState("");
  const [targets, setTargets] = useState<ReportTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(true);
  const [loadingMode, setLoadingMode] = useState<ReportMode | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dailyDateTouched = useRef(false);
  const rangeTouched = useRef(false);
  const selectedTarget = useMemo(
    () => targets.find((target) => target.employeeId === selectedTargetId) || null,
    [targets, selectedTargetId],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadOrganizationDate() {
      try {
        const seedDate = localDate();
        const response = await fetch(
          `/api/backend/attendance/calendar?fromDate=${encodeURIComponent(seedDate)}&toDate=${encodeURIComponent(seedDate)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== "object") {
          throw new Error(readMessage(payload) || "Unable to load organization date settings.");
        }
        const data = payload as Record<string, unknown>;
        const today = typeof data.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.today)
          ? data.today
          : seedDate;
        const organizationZone = typeof data.timeZone === "string" ? data.timeZone : "";
        if (cancelled) return;
        setTimeZone(organizationZone);
        if (!dailyDateTouched.current) setReportDate(today);
        if (!rangeTouched.current) {
          setFromDate(monthStart(today));
          setToDate(today);
          setFromMonth(today.slice(0, 7));
          setToMonth(today.slice(0, 7));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load organization date settings.");
        }
      } finally {
        if (!cancelled) setDateLoading(false);
      }
    }
    void loadOrganizationDate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTargets() {
      setTargetsLoading(true);
      try {
        const response = await fetch("/api/backend/attendance/reports/monthly?mode=targets", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(readMessage(payload) || "Unable to load permitted workforce members.");
        }
        const rows = payload && typeof payload === "object" && "targets" in payload && Array.isArray(payload.targets)
          ? payload.targets as ReportTarget[]
          : [];
        if (!cancelled) {
          setTargets(rows);
          setSelectedTargetId((current) => rows.some((row) => row.employeeId === current)
            ? current
            : rows[0]?.employeeId || "");
        }
      } catch (cause) {
        if (!cancelled) {
          setTargets([]);
          setSelectedTargetId("");
          setError(cause instanceof Error ? cause.message : "Unable to load permitted workforce members.");
        }
      } finally {
        if (!cancelled) setTargetsLoading(false);
      }
    }
    void loadTargets();
    return () => { cancelled = true; };
  }, []);

  function openPreparationWindow(title: string, detail: string): Window | null {
    const opened = window.open("", "_blank");
    if (!opened) {
      setError("Your browser blocked the report window. Allow pop-ups for this site and try again.");
      return null;
    }
    opened.document.open();
    opened.document.write(loadingDocument(title, detail));
    opened.document.close();
    return opened;
  }

  async function generateDailyReport() {
    if (!isOrganizationAdmin) {
      setError("Organization-wide daily reports are available to Organization Admins only.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      setError("Choose a valid work date.");
      return;
    }
    const reportWindow = openPreparationWindow(
      "Preparing daily attendance report",
      "Compiling the organization-wide attendance register, shift details and recorded punches.",
    );
    if (!reportWindow) return;

    setLoadingMode("daily");
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/backend/attendance/reports/daily?date=${encodeURIComponent(reportDate)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(readMessage(payload) || `Unable to generate the daily report (${response.status}).`);
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.toLowerCase().includes("pdf")) {
        throw new Error("The attendance report could not be prepared as a PDF.");
      }
      if (reportWindow.closed) return;
      const objectUrl = URL.createObjectURL(blob);
      reportWindow.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
      setNotice(`Organization-wide attendance PDF opened for ${reportDate}. Use the PDF viewer to print or save it.`);
    } catch (cause) {
      if (!reportWindow.closed) reportWindow.close();
      setError(cause instanceof Error ? cause.message : "Unable to generate the daily attendance report.");
    } finally {
      setLoadingMode(null);
    }
  }

  async function generateOrganizationMonthlyReport() {
    if (!isOrganizationAdmin && audience !== "hr-manager") {
      setError("Monthly organization reports are available to Organization Admins and HR Managers only.");
      return;
    }
    if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth) ||
        !/^\\d{4}-(0[1-9]|1[0-2])$/.test(toMonth) ||
        fromMonth > toMonth) {
      setError("Choose valid From month and To month values. From month must be on or before To month.");
      return;
    }
    const selectedMonths = monthCount(`${fromMonth}-01`, `${toMonth}-01`);
    if (selectedMonths > 24) {
      setError("A report can cover up to 24 calendar months at a time.");
      return;
    }

    const reportWindow = openPreparationWindow(
      "Preparing monthly attendance report",
      "Compiling each month in sequence with the full attendance register for that month.",
    );
    if (!reportWindow) return;

    setLoadingMode("organization-monthly");
    setError("");
    setNotice("");
    try {
      const query = new URLSearchParams({ fromMonth, toMonth });
      const response = await fetch(`/api/backend/attendance/reports/monthly-organization?${query.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(readMessage(payload) || `Unable to generate the monthly report (${response.status}).`);
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.toLowerCase().includes("pdf")) {
        throw new Error("The monthly attendance report could not be prepared as a PDF.");
      }
      if (reportWindow.closed) return;
      const objectUrl = URL.createObjectURL(blob);
      reportWindow.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
      setNotice(`Monthly attendance PDF prepared from ${fromMonth} through ${toMonth}.`);
    } catch (cause) {
      if (!reportWindow.closed) reportWindow.close();
      setError(cause instanceof Error ? cause.message : "Unable to generate the monthly attendance report.");
    } finally {
      setLoadingMode(null);
    }
  }

  async function generateMemberReport() {
    if (!selectedTargetId) {
      setError("Select a workforce member.");
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
      fromDate > toDate
    ) {
      setError("Choose valid start and end dates. The start date must not be after the end date.");
      return;
    }
    if (monthCount(fromDate, toDate) > 24) {
      setError("A report can cover up to 24 calendar months at a time.");
      return;
    }

    const reportWindow = openPreparationWindow(
      "Preparing workforce attendance report",
      "Loading recorded events, approved corrections, assigned shifts and monthly hours for the selected dates.",
    );
    if (!reportWindow) return;

    setLoadingMode("member");
    setError("");
    setNotice("");
    try {
      const query = new URLSearchParams({
        employeeId: selectedTargetId,
        fromDate,
        toDate,
      });
      const response = await fetch(`/api/backend/attendance/reports/monthly?${query.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as AttendanceReportPayload | { message?: string } | null;
      if (!response.ok) {
        throw new Error(readMessage(payload) || (
          response.status === 404
            ? "No attendance records were found within the selected dates."
            : `Unable to generate the attendance report (${response.status}).`
        ));
      }
      if (
        !payload ||
        !("entries" in payload) ||
        !Array.isArray(payload.entries) ||
        !("months" in payload) ||
        !Array.isArray(payload.months) ||
        payload.months.length === 0 ||
        Number(payload.attendanceRecordCount) <= 0
      ) {
        throw new Error("No attendance records were found within the selected dates. Choose another date range.");
      }
      if (reportWindow.closed) return;

      reportWindow.document.open();
      reportWindow.document.write(buildAttendanceReportDocument(payload));
      reportWindow.document.close();

      const printWhenReady = () => {
        if (reportWindow.closed) return;
        reportWindow.focus();
        reportWindow.document.getElementById("attendance-report-print")?.addEventListener("click", () => {
          if (!reportWindow.closed) {
            reportWindow.focus();
            reportWindow.print();
          }
        }, { once: true });
        reportWindow.print();
      };
      if (reportWindow.document.readyState === "complete") {
        window.setTimeout(printWhenReady, 300);
      } else {
        reportWindow.addEventListener("load", () => window.setTimeout(printWhenReady, 300), { once: true });
      }
      setNotice(`Attendance report prepared for ${selectedTarget ? targetName(selectedTarget) : "the selected workforce member"}.`);
    } catch (cause) {
      if (!reportWindow.closed) reportWindow.close();
      setError(cause instanceof Error ? cause.message : "Unable to generate the workforce attendance report.");
    } finally {
      setLoadingMode(null);
    }
  }

  const busy = loadingMode !== null;

  return (
    <div className="mx-auto max-w-[1420px] space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-[#34465d] bg-gradient-to-br from-[#1c3048] via-[#121d2b] to-[#101722] p-5 shadow-2xl shadow-black/15 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-sky-400/[0.08] blur-3xl"/>
        <div className="relative flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sky-300">
              <FileBarChart size={18}/>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]">{isEmployee ? "Personal attendance" : "Workforce intelligence"}</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{isEmployee ? "My attendance report" : "Report builder"}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">{isEmployee ? "Generate a printable PDF of your own attendance history, monthly hours and daily details." : "Generate verified attendance PDFs from your authorized reporting scope."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {timeZone && <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2"><CalendarDays size={14} className="text-sky-300"/>{timeZone}</span>}
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2"><FileText size={14} className="text-sky-300"/>PDF reports</span>
          </div>
        </div>
      </section>

      {!isEmployee && (
        <section className="grid gap-3 xl:grid-cols-3" aria-label="Attendance report types">
          <button
            type="button"
            onClick={() => { if (isOrganizationAdmin) { setMode("daily"); setError(""); setNotice(""); } }}
            disabled={!isOrganizationAdmin || busy}
            aria-pressed={mode === "daily"}
            className={`group min-w-0 rounded-2xl border p-4 text-left transition sm:p-5 ${mode === "daily" ? "border-sky-400/45 bg-sky-400/[0.07] shadow-lg shadow-sky-950/10" : "border-white/[0.08] bg-[#151e2b] hover:border-white/[0.16]"} ${!isOrganizationAdmin ? "cursor-not-allowed opacity-65" : ""}`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-11 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/[0.08] text-sky-200"><Users size={20}/></span>
              {!isOrganizationAdmin
                ? <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><LockKeyhole size={11}/>Organization Admin</span>
                : <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${mode === "daily" ? "border-sky-300/25 bg-sky-300/10 text-sky-200" : "border-slate-700 text-slate-500"}`}>01 · Organization-wide</span>}
            </div>
            <h3 className="mt-4 text-base font-bold text-white">Single-day organization report</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">One date · Active workforce · Daily attendance register</p>
          </button>
          <button
            type="button"
            onClick={() => { setMode("organization-monthly"); setError(""); setNotice(""); }}
            disabled={busy}
            aria-pressed={mode === "organization-monthly"}
            className={`group min-w-0 rounded-2xl border p-4 text-left transition sm:p-5 ${mode === "organization-monthly" ? "border-sky-400/45 bg-sky-400/[0.07] shadow-lg shadow-sky-950/10" : "border-white/[0.08] bg-[#151e2b] hover:border-white/[0.16]"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200"><CalendarDays size={20}/></span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${mode === "organization-monthly" ? "border-sky-300/25 bg-sky-300/10 text-sky-200" : "border-slate-700 text-slate-500"}`}>02 · Monthly series</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">Monthly organization report</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">From month · To month · One combined PDF</p>
          </button>
          <button
            type="button"
            onClick={() => { setMode("member"); setError(""); setNotice(""); }
            disabled={busy}
            aria-pressed={mode === "member"}
            className={`group min-w-0 rounded-2xl border p-4 text-left transition sm:p-5 ${mode === "member" ? "border-sky-400/45 bg-sky-400/[0.07] shadow-lg shadow-sky-950/10" : "border-white/[0.08] bg-[#151e2b] hover:border-white/[0.16]"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-11 items-center justify-center rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] text-indigo-200"><FileText size={20}/></span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${mode === "member" ? "border-sky-300/25 bg-sky-300/10 text-sky-200" : "border-slate-700 text-slate-500"}`}>02 · Workforce member</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">Individual attendance report</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Selected member · Date range · Monthly hours and daily detail</p>
          </button>
        </section>
      )}

      <section className="rounded-2xl border border-[#34465d]/80 bg-[#141e2b] p-5 shadow-xl shadow-black/10 sm:p-7">
        {mode === "organization-monthly" ? (
          <>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-200 ring-1 ring-cyan-300/15"><CalendarDays size={18}/></span>
              <div><h3 className="text-base font-bold text-white">Organization attendance · Monthly range</h3><p className="mt-1 text-xs text-slate-400">Each selected month contains its complete authorized attendance register.</p></div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:items-end">
              <label className="block min-w-0 text-xs font-semibold text-slate-300">From month
                <input type="month" value={fromMonth} disabled={dateLoading || busy} max={toMonth || undefined} onChange={(event) => { rangeTouched.current = true; setFromMonth(event.target.value); setError(""); setNotice(""); }} className={INPUT}/>
              </label>
              <label className="block min-w-0 text-xs font-semibold text-slate-300">To month
                <input type="month" value={toMonth} disabled={dateLoading || busy} min={fromMonth || undefined} onChange={(event) => { rangeTouched.current = true; setToMonth(event.target.value); setError(""); setNotice(""); }} className={INPUT}/>
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Inclusive calendar months · Each month starts on a new PDF page · Maximum 24 months</p>
              <button type="button" onClick={() => void generateOrganizationMonthlyReport()} disabled={dateLoading || busy || !fromMonth || !toMonth || fromMonth > toMonth} className={BUTTON}>
                {loadingMode === "organization-monthly" ? <RefreshCw size={16} className="animate-spin"/> : <Download size={16}/>}
                {loadingMode === "organization-monthly" ? "Generating PDF…" : "Generate monthly organization PDF"}
              </button>
            </div>
          </>
        ) : mode === "daily" ? (
          <>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/[0.08] text-sky-200 ring-1 ring-sky-300/15"><CalendarDays size={18}/></span>
              <div><h3 className="text-base font-bold text-white">Organization attendance · One day</h3><p className="mt-1 text-xs text-slate-400">Select the organization work date.</p></div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,280px)_1fr] sm:items-end">
              <label className="block min-w-0 text-xs font-semibold text-slate-300">Work date
                <input type="date" value={reportDate} disabled={dateLoading || busy} onChange={(event) => { dailyDateTouched.current = true; setReportDate(event.target.value); setError(""); setNotice(""); }} className={INPUT}/>
              </label>
              <button type="button" onClick={() => void generateDailyReport()} disabled={!isOrganizationAdmin || dateLoading || busy || !reportDate} className={BUTTON}>
                {loadingMode === "daily" ? <RefreshCw size={16} className="animate-spin"/> : <Download size={16}/>}
                {loadingMode === "daily" ? "Generating PDF…" : "Generate / print organization PDF"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-400/[0.08] text-indigo-200 ring-1 ring-indigo-300/15"><FileText size={18}/></span>
              <div><h3 className="text-base font-bold text-white">{isEmployee ? "My attendance · Date range" : "Workforce attendance · Date range"}</h3><p className="mt-1 text-xs text-slate-400">{isEmployee ? "Choose the reporting period for your own attendance record." : "Select one authorized workforce member and reporting period."}</p></div>
            </div>
            <div className={`mt-5 grid gap-4 ${isEmployee ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4 xl:items-end"}`}>
              {isEmployee ? (
                <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-3.5 py-3 md:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Your workforce record</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-100">{selectedTarget ? targetLabel(selectedTarget) : targetsLoading ? "Loading your employee profile…" : "Your employee record is unavailable."}</p>
                </div>
              ) : (
                <label className="block min-w-0 text-xs font-semibold text-slate-300 md:col-span-2 xl:col-span-2">Workforce member
                  <select value={selectedTargetId} disabled={targetsLoading || busy || targets.length === 0} onChange={(event) => { setSelectedTargetId(event.target.value); setError(""); setNotice(""); }} className={INPUT}>
                    <option value="">{targetsLoading ? "Loading permitted members…" : "Select workforce member"}</option>
                    {targets.map((target) => <option key={target.employeeId} value={target.employeeId}>{targetLabel(target)}</option>)}
                  </select>
                </label>
              )}
              <label className="block min-w-0 text-xs font-semibold text-slate-300">Start date
                <input type="date" value={fromDate} disabled={dateLoading || busy} onChange={(event) => { rangeTouched.current = true; setFromDate(event.target.value); setError(""); setNotice(""); }} className={INPUT}/>
              </label>
              <label className="block min-w-0 text-xs font-semibold text-slate-300">End date
                <input type="date" value={toDate} disabled={dateLoading || busy} onChange={(event) => { rangeTouched.current = true; setToDate(event.target.value); setError(""); setNotice(""); }} className={INPUT}/>
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{isEmployee ? "Your attendance record · Each month starts on a new PDF page" : `${targets.length} authorized member(s) · Each month starts on a new PDF page`}</p>
              <button type="button" onClick={() => void generateMemberReport()} disabled={targetsLoading || busy || !selectedTargetId || dateLoading} className={BUTTON}>
                {loadingMode === "member" ? <RefreshCw size={16} className="animate-spin"/> : <Printer size={16}/>}
                {loadingMode === "member" ? "Preparing PDF…" : "Generate and print PDF"}
              </button>
            </div>
          </>
        )}
        {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3.5 text-sm leading-6 text-rose-200"><span>{error}</span></div>}
        {notice && <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3.5 text-sm leading-6 text-emerald-200"><CheckCircle2 size={16} className="mt-0.5 shrink-0"/><span>{notice}</span></div>}
        {dateLoading && <p role="status" className="mt-3 text-xs text-slate-500">Loading organization date and timezone…</p>}
      </section>
    </div>
  );
}
