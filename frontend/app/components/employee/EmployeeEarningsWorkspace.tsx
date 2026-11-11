"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, BadgeDollarSign, CalendarDays, Clock3, Flame, RefreshCw, TrendingUp } from "lucide-react";
import SalaryPaymentsWorkspace from "../payroll/SalaryPaymentsWorkspace";
import { formatDate as formatWorkDate } from "../../../lib/attendance-format";

type Day = {
  workDate: string;
  scheduleName: string | null;
  timeZone: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  regularWorkedMinutes: number;
  paidLeaveMinutes: number;
  paidHolidayMinutes: number;
  payableMinutes: number;
  isPaidLeave: boolean;
  isPaidHoliday: boolean;
  potentialOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes: number;
  excessOvertimeReviewStatus: string | null;
  calculationStatus: string;
  hourlyRate: number | null;
  hourlyMinuteRate: number | null;
  overtimeRate: number | null;
  overtimeMinuteRate: number | null;
  regularPay: number | null;
  overtimePay: number | null;
  estimatedPay: number | null;
  currencyCode: string | null;
};

type EarningsPayload = {
  month: string;
  timeZone: string;
  employeeName: string;
  currencyCode: string | null;
  hasRates: boolean;
  hourlyRate: number | null;
  hourlyMinuteRate: number | null;
  overtimeRate: number | null;
  overtimeMinuteRate: number | null;
  summary: {
    estimatedSalary: number | null;
    regularMinutes: number;
    payableOvertimeMinutes: number;
    potentialOvertimeMinutes: number;
    excessUnapprovedOvertimeMinutes: number;
    totalWorkedMinutes: number;
    paidLeaveMinutes: number;
    paidHolidayMinutes: number;
    payableMinutes: number;
    daysWorked: number;
    daysWithMissingRates: number;
    currencyMismatch: boolean;
    currencyCodes: string[];
  };
  days: Day[];
  disclaimer: string;
};

function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}


function monthInTimeZone(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}`;
  } catch {
    return monthNow();
  }
}

function minutesLabel(value: number) {
  const minutes = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

function excessReviewLabel(status: string | null | undefined): string {
  switch ((status || "").toUpperCase()) {
    case "OPEN": return "Awaiting review";
    case "REVIEWED_NO_PAY": return "Reviewed — no extra pay";
    case "FOLLOW_UP": return "Follow-up requested";
    default: return "Review status not yet recorded";
  }
}

function money(value: number | null, currencyCode: string | null) {
  if (value === null || !Number.isFinite(value)) return "Not available";
  if (!currencyCode) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

function timeLabel(value: string | null, timeZone?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
}

function dateLabel(value: string) {
  return formatWorkDate(value);
}

function shortRate(value: number | null, currencyCode: string | null) {
  return value === null ? "Not set" : `${money(value, currencyCode)} / min`;
}

function monthLabel(value: string) {
  const date = new Date(`${value}-01T12:00:00`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date) : value;
}

export default function EmployeeEarningsWorkspace({ employeeId, showTitle = true }: { employeeId?: string; showTitle?: boolean } = {}) {
  const [month, setMonth] = useState(monthNow);
  const [activeView, setActiveView] = useState<"earnings" | "payments">("earnings");
  const [data, setData] = useState<EarningsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const initialMonthResolved = useRef(false);
  const monthTouchedByUser = useRef(false);
  const loadRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/backend/employee/earnings?month=${encodeURIComponent(month)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (requestId !== loadRequestId.current) return;
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
          ? payload.message : "Unable to load your earnings.";
        throw new Error(message);
      }
      const earnings = payload as EarningsPayload;
      setData(earnings);
      // The first request may have used the browser's month. Resolve the
      // default to the organization's month once the server supplies its TZ.
      if (!initialMonthResolved.current) {
        initialMonthResolved.current = true;
        if (!monthTouchedByUser.current && earnings.timeZone) {
          const organizationMonth = monthInTimeZone(new Date(), earnings.timeZone);
          if (organizationMonth !== month) setMonth(organizationMonth);
        }
      }
    } catch (caught) {
      if (requestId === loadRequestId.current) {
        setError(caught instanceof Error ? caught.message : "Unable to load your earnings.");
        setData(null);
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
    return () => { loadRequestId.current += 1; };
  }, [load]);

  const scheduledDays = useMemo(() => data?.days.filter((day) => Boolean(day.scheduleName)).length ?? 0, [data]);
  const attendanceProgress = useMemo(() => scheduledDays > 0 && data ? Math.min(100, Math.round((data.summary.daysWorked / scheduledDays) * 100)) : 0, [data, scheduledDays]);
  const badge = useMemo(() => {
    const days = data?.summary.daysWorked ?? 0;
    if (days >= 20) return { title: "Consistency champion", description: "20+ days with recorded work this month", icon: Award };
    if (days >= 10) return { title: "Momentum builder", description: "10+ days with recorded work this month", icon: Flame };
    if (days >= 5) return { title: "Building momentum", description: "5+ days with recorded work this month", icon: TrendingUp };
    if (days >= 1) return { title: "First shift logged", description: "Your attendance is contributing to this month's earnings", icon: Award };
    return { title: "Your month starts here", description: "Complete a shift to start building your monthly record", icon: CalendarDays };
  }, [data]);
  const BadgeIcon = badge.icon;

  return (
    <section className="employee-earnings-workspace space-y-5 text-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {showTitle && <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Your work, made visible</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">My Earnings</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Review your estimated earnings or check salary payment records. Each view appears separately to keep the information clear.</p>
        </div>}
        {activeView === "earnings" && <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="employee-earnings-month" className="text-sm text-slate-400">Month</label>
          <input id="employee-earnings-month" type="month" value={month} onChange={(event) => { monthTouchedByUser.current = true; setMonth(event.target.value); }} className="rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" />
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.05] disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>}
      </div>

      <div role="tablist" aria-label="My Earnings sections" className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-[#141c28] p-2">
        <button type="button" role="tab" aria-selected={activeView === "earnings"} onClick={() => setActiveView("earnings")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeView === "earnings" ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/20" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}>Earnings overview</button>
        <button type="button" role="tab" aria-selected={activeView === "payments"} onClick={() => setActiveView("payments")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeView === "payments" ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/20" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}>Payment history</button>
      </div>

      {activeView === "earnings" ? <>
      {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200">{error}</div>}
      {loading ? <div className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-8 text-sm text-slate-400">Loading your earnings…</div> : null}

      {data && !loading && (
        <>
          {!data.hasRates && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">Your hourly pay rate has not been configured yet. Your attendance is still recorded, but an earnings estimate needs the correct effective pay rates.</div>}
          {data.summary.daysWithMissingRates > 0 && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">Rates were not configured for {data.summary.daysWithMissingRates} worked day(s). The monthly estimate is incomplete until HR reviews those effective dates.</div>}
          {data.summary.currencyMismatch && <div role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm leading-6 text-rose-100">Your pay-rate history contains more than one currency ({data.summary.currencyCodes.join(", ")}). A combined monthly total would be misleading, so the estimate is withheld until HR corrects the rate history.</div>}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <article className="employee-earnings-summary-card relative overflow-hidden rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.13] to-[#141c28] p-5">
              <div className="flex items-center justify-between gap-3"><span className="employee-earnings-summary-label text-sm font-medium text-emerald-100/80">Accumulated this month</span><BadgeDollarSign className="text-emerald-300" size={21} /></div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">{money(data.summary.estimatedSalary, data.currencyCode)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{monthLabel(data.month)} · estimated, not final payroll</p>
            </article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-300">Hourly rate</span><Clock3 size={20} className="text-sky-300" /></div>
              <p className="mt-4 text-xl font-bold text-white">{money(data.hourlyRate, data.currencyCode)}<span className="ml-1 text-xs font-medium text-slate-400">/ hour</span></p>
              <p className="mt-2 text-xs text-slate-400">{shortRate(data.hourlyMinuteRate, data.currencyCode)}</p>
            </article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-300">Overtime rate</span><TrendingUp size={20} className="text-violet-300" /></div>
              <p className="mt-4 text-xl font-bold text-white">{money(data.overtimeRate, data.currencyCode)}<span className="ml-1 text-xs font-medium text-slate-400">/ hour</span></p>
              <p className="mt-2 text-xs text-slate-400">{shortRate(data.overtimeMinuteRate, data.currencyCode)}</p>
            </article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-300">Recorded work</span><CalendarDays size={20} className="text-amber-300" /></div>
              <p className="mt-4 text-xl font-bold text-white">{minutesLabel(data.summary.totalWorkedMinutes)}</p>
              <p className="mt-2 text-xs text-slate-400">{data.summary.daysWorked} day(s) with recorded work</p>
            </article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-300">Paid time away</span><CalendarDays size={20} className="text-emerald-300" /></div>
              <p className="mt-4 text-xl font-bold text-white">{minutesLabel(data.summary.paidLeaveMinutes + data.summary.paidHolidayMinutes)}</p>
              <p className="mt-2 text-xs text-slate-400">Leave + public holidays</p>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <article className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-semibold text-white">Monthly momentum</h3><p className="mt-1 text-sm text-slate-400">Recorded workdays compared with scheduled workdays.</p></div>
                <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1 text-xs font-semibold text-sky-200">{attendanceProgress}%</span>
              </div>
              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-300 transition-all" style={{ width: `${attendanceProgress}%` }} /></div>
              <div className="mt-3 flex justify-between gap-3 text-xs text-slate-400"><span>{data.summary.daysWorked} days worked</span><span>{scheduledDays} scheduled days in month</span></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-xs text-slate-400">Regular time</p><p className="mt-1 font-semibold text-white">{minutesLabel(data.summary.regularMinutes)}</p></div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-xs text-slate-400">Approved payable OT</p><p className="mt-1 font-semibold text-white">{minutesLabel(data.summary.payableOvertimeMinutes)}</p></div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-xs text-slate-400">Unapproved excess — not payable</p><p className="mt-1 font-semibold text-amber-200">{minutesLabel(data.summary.excessUnapprovedOvertimeMinutes)}</p></div>
              </div>
            </article>
            <article className="rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.09] to-[#141c28] p-5 sm:p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/[0.08] text-violet-200"><BadgeIcon size={22} /></div>
              <h3 className="mt-4 font-semibold text-white">{badge.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-400">{badge.description}</p>
              <div className="mt-5 border-t border-white/[0.08] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Keep your record accurate</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Clock in and out for every shift, request overtime before it begins, and report missing punches promptly. Only approved overtime is included in the payable estimate.</p>
              </div>
            </article>
          </div>

          <article className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141c28]">
            <div className="border-b border-white/[0.07] p-5"><h3 className="font-semibold text-white">Daily earnings breakdown</h3><p className="mt-1 text-sm text-slate-400">Each day uses the pay rate effective on that date. Times are shown in AM/PM format.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-white/[0.025] text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Clock in / out</th><th className="px-4 py-3 font-semibold">Worked</th><th className="px-4 py-3 font-semibold">Regular pay</th><th className="px-4 py-3 font-semibold">Payable OT</th><th className="px-4 py-3 font-semibold">Estimated total</th></tr></thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data.days.filter((day) => day.workedMinutes > 0 || day.scheduleName || day.isPaidLeave || day.isPaidHoliday).map((day) => (
                    <tr key={day.workDate} className="text-slate-300 hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><div className="font-medium text-white">{dateLabel(day.workDate)}</div><div className="mt-0.5 text-xs text-slate-500">{day.scheduleName || "No shift scheduled"}</div>{day.isPaidHoliday && <div className="mt-1 text-xs font-medium text-violet-300">Paid public holiday</div>}{day.isPaidLeave && <div className="mt-1 text-xs font-medium text-emerald-300">Paid leave</div>}</td>
                      <td className="px-4 py-3"><div>{timeLabel(day.clockIn, day.timeZone)}</div><div className="mt-0.5 text-xs text-slate-500">Out: {timeLabel(day.clockOut, day.timeZone)}</div></td>
                      <td className="px-4 py-3"><div>{minutesLabel(day.workedMinutes)}</div>{day.excessUnapprovedOvertimeMinutes > 0 && <div className="mt-1 text-xs text-amber-300">{minutesLabel(day.excessUnapprovedOvertimeMinutes)} unapproved excess — not payable</div>}{day.excessUnapprovedOvertimeMinutes > 0 && <div className="mt-1 text-xs text-slate-500">{excessReviewLabel(day.excessOvertimeReviewStatus)}</div>}</td>
                      <td className="px-4 py-3">{money(day.regularPay, day.currencyCode)}</td>
                      <td className="px-4 py-3"><div>{minutesLabel(day.payableOvertimeMinutes)}</div><div className="mt-0.5 text-xs text-slate-500">{money(day.overtimePay, day.currencyCode)}</div></td>
                      <td className="px-4 py-3 font-semibold text-white">{money(day.estimatedPay, day.currencyCode)}</td>
                    </tr>
                  ))}
                  {data.days.every((day) => day.workedMinutes === 0 && !day.scheduleName && !day.isPaidLeave && !day.isPaidHoliday) && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No attendance or scheduled shifts for this month yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
          <p className="text-xs leading-5 text-slate-500">{data.disclaimer}</p>
        </>
      )}
      </> : <SalaryPaymentsWorkspace audience="employee" employeeId={employeeId} />}
    </section>
  );
}
