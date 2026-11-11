"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, RefreshCw, Users } from "lucide-react";
import { formatDate, formatTime } from "../../../lib/attendance-format";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type EventRow = { id?: string; eventType?: string; recordedAt?: string; timeZone?: string };
type Entry = {
  employeeId: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  departmentName?: string | null;
  workDate: string;
  scheduleName?: string | null;
  timeZone?: string | null;
  expectedStart?: string | null;
  expectedEnd?: string | null;
  scheduledBreakMinutes?: number | string | null;
  firstClockIn?: string | null;
  lastClockOut?: string | null;
  events?: EventRow[];
  approvedOvertimeMinutes?: number | string | null;
  workedMinutes?: number;
  regularWorkedMinutes?: number;
  potentialOvertimeMinutes?: number;
  payableOvertimeMinutes?: number;
  excessUnapprovedOvertimeMinutes?: number;
  excessOvertimeReviewStatus?: string | null;
  calculationStatus?: string;
  leaveRequest?: { leaveType?: string; status?: string; isPaid?: boolean } | null;
  publicHoliday?: { name?: string; isPaid?: boolean } | null;
};
type Props = { audience: "employee" | "department-manager" | "hr-manager"; actorEmployeeId?: string };

function monthInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}`;
  } catch {
    return monthValue(date);
  }
}
type PayRate = { hourlyRate: string | number; overtimeRate: string | number; currencyCode: string; effectiveFrom: string; effectiveTo: string | null };
type PayrollEstimate = { employeeId: string; calculatedAmount: string | number | null; calculatedRegularAmount?: string | number | null; calculatedOvertimeAmount?: string | number | null; calculatedPaidAbsenceAmount?: string | number | null; currencyCode: string; status?: string };

const PANEL = "min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-5";
const INPUT = "mt-1.5 w-full min-w-0 rounded-xl border border-slate-700 bg-[#0b111b] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10";

function monthValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthBounds(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}
function minutesLabel(value: number): string {
  const safe = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}
function excessReviewLabel(status: string | null | undefined): string {
  switch ((status || "").toUpperCase()) {
    case "OPEN": return "Awaiting review";
    case "REVIEWED_NO_PAY": return "Reviewed — no extra pay";
    case "FOLLOW_UP": return "Follow-up requested";
    default: return "Review status not yet recorded";
  }
}
export default function AttendanceMonthlyHoursView({ audience, actorEmployeeId }: Props) {
  const [month, setMonth] = useState(monthValue);
  const initialMonthResolved = useRef(false);
  const monthTouchedByUser = useRef(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [compensationRefresh, setCompensationRefresh] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [payRates, setPayRates] = useState<PayRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState("");
  const [payrollEstimate, setPayrollEstimate] = useState<PayrollEstimate | null>(null);
  const [payrollEstimateLoading, setPayrollEstimateLoading] = useState(false);
  const [payrollEstimateError, setPayrollEstimateError] = useState("");
  const loadRequestId = useRef(0);
  const isEmployee = audience === "employee";
  const isHr = audience === "hr-manager";

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadRequestId.current;
    if (!/^\d{4}-\d{2}$/.test(month)) { setLoading(false); return; }
    if (!silent) setLoading(true); setError("");
    const range = monthBounds(month);
    try {
      const allEntries: Entry[] = [];
      let offset = 0;
      let responseTimeZone = "";
      // Retrieve every page so manager totals and employee selection are not
      // silently limited to the first 2,000 rows.
      while (true) {
        const response = await fetch(`/api/backend/attendance/calendar?fromDate=${range.from}&toDate=${range.to}&offset=${offset}`, { credentials: "same-origin", cache: "no-store" });
        const payload: unknown = await response.json().catch(() => null);
        if (requestId !== loadRequestId.current) return;
        if (!response.ok) {
          const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string" ? payload.message : "Unable to load monthly attendance.";
          throw new Error(message);
        }
        const pagePayload = typeof payload === "object" && payload !== null ? payload as { entries?: unknown; hasMore?: unknown; timeZone?: unknown } : null;
        if (!responseTimeZone && typeof pagePayload?.timeZone === "string") responseTimeZone = pagePayload.timeZone;
        const pageEntries = Array.isArray(pagePayload?.entries) ? pagePayload.entries as Entry[] : [];
        allEntries.push(...pageEntries);
        const hasMore = pagePayload?.hasMore === true;
        if (!hasMore) break;
        if (pageEntries.length === 0) throw new Error("Attendance pagination stopped unexpectedly. Try again in a moment.");
        offset += pageEntries.length;
      }
      setTruncated(false);
      if (!initialMonthResolved.current) {
        initialMonthResolved.current = true;
        if (!monthTouchedByUser.current && responseTimeZone) {
          const organizationMonth = monthInTimeZone(new Date(), responseTimeZone);
          if (organizationMonth !== month) {
            setMonth(organizationMonth);
            return;
          }
        }
      }
      if (requestId === loadRequestId.current) setEntries(allEntries);
    } catch (cause) {
      if (requestId === loadRequestId.current) {
        setEntries([]); setTruncated(false); setError(cause instanceof Error ? cause.message : "Unable to load monthly attendance.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }, [month]);

  useEffect(() => {
    void load();
    return () => { loadRequestId.current += 1; };
  }, [load, refresh]);

  useWorkspaceAutoRefresh(
    () => {
      void load(true);
      setCompensationRefresh((current) => current + 1);
    },
    {
      enabled: true,
      intervalMs: 60_000,
      shouldRefresh: () => !loading && !ratesLoading && !payrollEstimateLoading,
    },
  );

  // Compensation is deliberately available only to HR Manager views and only for one
  // selected employee at a time. The backend independently enforces this permission.
  useEffect(() => {
    let cancelled = false;
    if (!isHr || selectedEmployee === "ALL") {
      setPayRates([]); setRatesError(""); setRatesLoading(false);
      return;
    }
    setRatesLoading(true); setRatesError("");
    fetch(`/api/backend/attendance/pay-rates?employeeId=${encodeURIComponent(selectedEmployee)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string" ? payload.message : "Unable to load pay rates.";
          throw new Error(message);
        }
        const rates = typeof payload === "object" && payload !== null && "rates" in payload && Array.isArray(payload.rates) ? payload.rates as PayRate[] : [];
        if (!cancelled) setPayRates(rates);
      })
      .catch((cause) => { if (!cancelled) { setPayRates([]); setRatesError(cause instanceof Error ? cause.message : "Unable to load pay rates."); } })
      .finally(() => { if (!cancelled) setRatesLoading(false); });
    return () => { cancelled = true; };
  }, [isHr, selectedEmployee, compensationRefresh]);

  useEffect(() => {
    let cancelled = false;
    if (!isHr || selectedEmployee === "ALL") {
      setPayrollEstimate(null); setPayrollEstimateError(""); setPayrollEstimateLoading(false);
      return;
    }
    setPayrollEstimateLoading(true); setPayrollEstimateError("");
    fetch(`/api/backend/payroll/payments?month=${encodeURIComponent(month)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string" ? payload.message : "Unable to load the payroll-calculated estimate.";
          throw new Error(message);
        }
        const rows = typeof payload === "object" && payload !== null && "payments" in payload && Array.isArray(payload.payments) ? payload.payments as PayrollEstimate[] : [];
        const estimate = rows.find((row) => row.employeeId === selectedEmployee) ?? null;
        if (!cancelled) setPayrollEstimate(estimate);
      })
      .catch((cause) => { if (!cancelled) { setPayrollEstimate(null); setPayrollEstimateError(cause instanceof Error ? cause.message : "Unable to load the payroll-calculated estimate."); } })
      .finally(() => { if (!cancelled) setPayrollEstimateLoading(false); });
    return () => { cancelled = true; };
  }, [isHr, selectedEmployee, month, compensationRefresh]);

  const employees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; department: string }>();
    for (const entry of entries) map.set(entry.employeeId, { id: entry.employeeId, name: `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() || entry.employeeCode || "Employee", department: entry.departmentName ?? "Unassigned department" });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);
  const visible = useMemo(() => {
    const selected = entries
      .filter((entry) => selectedEmployee === "ALL" || entry.employeeId === selectedEmployee)
      .sort((a, b) => {
        const dateOrder = a.workDate.localeCompare(b.workDate);
        if (dateOrder !== 0) return dateOrder;
        const aName = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.employeeCode || "";
        const bName = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.employeeCode || "";
        return aName.localeCompare(bName, undefined, { sensitivity: "base" });
      });
    if (!isEmployee && selectedEmployee === "ALL") return selected;
    // Do not synthesize a full month of empty days when the selected person has
    // no calendar records at all; that would make missing data look like zero work.
    if (selected.length === 0) return [];
    const targetEmployeeId = isEmployee ? (entries[0]?.employeeId ?? "") : selectedEmployee;
    const template = selected[0] ?? entries.find((entry) => entry.employeeId === targetEmployeeId);
    const [year, monthNumber] = month.split("-").map(Number);
    const dayCount = new Date(year, monthNumber, 0).getDate();
    const byDate = new Map(selected.map((entry) => [entry.workDate, entry]));
    return Array.from({ length: dayCount }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      const existing = byDate.get(date);
      if (existing) return existing;
      return {
        employeeId: targetEmployeeId,
        employeeCode: template?.employeeCode ?? null,
        firstName: template?.firstName ?? null,
        lastName: template?.lastName ?? null,
        departmentName: template?.departmentName ?? null,
        workDate: date,
        scheduleName: null,
        timeZone: template?.timeZone ?? null,
        expectedStart: null,
        expectedEnd: null,
        scheduledBreakMinutes: 0,
        firstClockIn: null,
        lastClockOut: null,
        events: [],
        approvedOvertimeMinutes: 0,
        workedMinutes: 0,
        regularWorkedMinutes: 0,
        potentialOvertimeMinutes: 0,
        payableOvertimeMinutes: 0,
        excessUnapprovedOvertimeMinutes: 0,
        calculationStatus: template ? "NO_RECORDS" : "NO_SHIFT",
      };
    });
  }, [entries, selectedEmployee, isEmployee, month]);
  const totals = useMemo(() => visible.reduce((acc, entry) => ({ worked: acc.worked + (entry.workedMinutes ?? 0), regular: acc.regular + (entry.regularWorkedMinutes ?? 0), overtime: acc.overtime + (entry.potentialOvertimeMinutes ?? 0), payable: acc.payable + (entry.payableOvertimeMinutes ?? 0), excess: acc.excess + (entry.excessUnapprovedOvertimeMinutes ?? 0) }), { worked: 0, regular: 0, overtime: 0, payable: 0, excess: 0 }), [visible]);
  const estimatedPay = useMemo(() => visible.reduce((acc, entry) => {
    const rate = payRates.find((candidate) => candidate.effectiveFrom <= entry.workDate && (!candidate.effectiveTo || candidate.effectiveTo >= entry.workDate));
    if (!rate) return { ...acc, missingRateDays: acc.missingRateDays + ((entry.regularWorkedMinutes ?? 0) + (entry.payableOvertimeMinutes ?? 0) > 0 ? 1 : 0) };
    return {
      regular: acc.regular + (entry.regularWorkedMinutes ?? 0) * Number(rate.hourlyRate) / 60,
      overtime: acc.overtime + (entry.payableOvertimeMinutes ?? 0) * Number(rate.overtimeRate) / 60,
      missingRateDays: acc.missingRateDays,
      currency: rate.currencyCode,
    };
  }, { regular: 0, overtime: 0, missingRateDays: 0, currency: "" }), [visible, payRates]);
  const money = (value: number, currency: string) => currency ? `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  return <div className="space-y-4">
    <section className={PANEL}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><CalendarDays size={18} className="text-sky-300"/>Monthly hours</h3><p className="mt-1 text-sm leading-5 text-slate-400">Daily hours are calculated by the server from attendance records, shift rules and approved overtime.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-300">Month<input type="month" value={month} onChange={(event) => { monthTouchedByUser.current = true; setMonth(event.target.value); }} className={INPUT}/></label>
          {!isEmployee && <label className="block text-sm font-medium text-slate-300">Employee<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} className={INPUT}><option value="ALL">All employees</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.department}</option>)}</select></label>}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{error}</p>}
      {truncated && <p role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-sm text-amber-100">This organization has more attendance rows than can be returned in one calendar response. Select an individual employee to narrow the view, or ask an administrator to increase report pagination before relying on organization-wide totals.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[{ label: "Total worked", value: minutesLabel(totals.worked), icon: Clock3 }, { label: "Regular hours", value: minutesLabel(totals.regular), icon: Clock3 }, { label: "Potential overtime", value: minutesLabel(totals.overtime), icon: CalendarDays }, { label: "Approved payable OT", value: minutesLabel(totals.payable), icon: Users }, { label: "Unapproved excess", value: minutesLabel(totals.excess), icon: RefreshCw }].map((card) => <div key={card.label} className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center gap-2 text-xs text-slate-400"><card.icon size={14}/>{card.label}</div><p className="mt-2 text-xl font-bold tabular-nums text-slate-100">{card.value}</p></div>)}
      </div>
      {isHr && <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[0.04] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-slate-100">Estimated earnings</h4><p className="mt-1 text-xs leading-5 text-slate-400">Select one employee to estimate regular pay and approved overtime using the rate effective on each work date. This is an estimate, not a finalized payroll.</p></div>{selectedEmployee === "ALL" && <span className="rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-300">Select an employee</span>}</div>
        {selectedEmployee !== "ALL" && (payrollEstimateLoading ? <p className="mt-3 text-sm text-slate-400">Reconciling with monthly salary calculation…</p> : payrollEstimateError ? <p role="alert" className="mt-3 text-sm text-rose-200">{payrollEstimateError}</p> : !payrollEstimate || payrollEstimate.calculatedAmount == null ? <p className="mt-3 text-sm text-amber-200">{payrollEstimate?.status === "CURRENCY_MISMATCH" ? "Multiple currencies apply in this month. Correct the employee's pay-rate history before relying on an earnings total." : payrollEstimate?.status === "RATE_REQUIRED" ? "A pay rate is missing for one or more payable days. The total is withheld until the rate history is complete." : ratesLoading ? "Loading effective-dated pay rates…" : ratesError ? ratesError : "No payable time or valid rate was found for this employee in the selected month."}</p> : <><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border border-white/[0.06] bg-black/10 p-3"><p className="text-xs text-slate-400">Regular work pay</p><p className="mt-1 text-lg font-bold text-white">{money(Number(payrollEstimate.calculatedRegularAmount ?? 0), payrollEstimate.currencyCode)}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/10 p-3"><p className="text-xs text-slate-400">Approved overtime</p><p className="mt-1 text-lg font-bold text-white">{money(Number(payrollEstimate.calculatedOvertimeAmount ?? 0), payrollEstimate.currencyCode)}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/10 p-3"><p className="text-xs text-slate-400">Paid leave / holidays</p><p className="mt-1 text-lg font-bold text-white">{money(Number(payrollEstimate.calculatedPaidAbsenceAmount ?? 0), payrollEstimate.currencyCode)}</p></div><div className="rounded-lg border border-violet-300/20 bg-violet-300/[0.05] p-3"><p className="text-xs text-slate-400">Estimated gross total</p><p className="mt-1 text-lg font-bold text-violet-200">{money(Number(payrollEstimate.calculatedAmount), payrollEstimate.currencyCode)}</p></div></div><p className="mt-2 text-xs leading-5 text-slate-500">This total is sourced from the same server calculation used by monthly salary payments, including applicable paid leave and paid public holidays, approved overtime, effective-dated rates, and payroll rounding. It excludes taxes, deductions, allowances, and statutory contributions.</p></>) }
      </div>}
    </section>

    <section className={`${PANEL} !p-0`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5"><div><h3 className="font-semibold text-slate-100">Daily breakdown</h3><p className="mt-1 text-xs text-slate-500">{formatDate(`${month}-01`)} · Times shown in AM/PM format</p></div></div>
      {loading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin"/>Loading monthly attendance…</div> : visible.length === 0 ? <div className="p-8 text-center"><p className="font-semibold text-slate-200">No attendance entries for this month</p><p className="mt-1 text-sm text-slate-500">Scheduled days and recorded attendance will appear here.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase tracking-wide text-slate-500"><tr>{!isEmployee && <th className="whitespace-nowrap px-4 py-3 font-semibold">Employee</th>}<th className="whitespace-nowrap px-4 py-3 font-semibold">Work date</th><th className="whitespace-nowrap px-4 py-3 font-semibold">Shift</th><th className="whitespace-nowrap px-4 py-3 font-semibold">Clock in</th><th className="whitespace-nowrap px-4 py-3 font-semibold">Clock out</th><th className="whitespace-nowrap px-4 py-3 font-semibold">Worked</th><th className="whitespace-nowrap px-4 py-3 font-semibold">Overtime</th><th className="whitespace-nowrap px-4 py-3 font-semibold">Status</th></tr></thead><tbody>{visible.map((entry, index) => <tr key={`${entry.employeeId}-${entry.workDate}-${index}`} className="border-t border-white/[0.055] hover:bg-white/[0.02]">{!isEmployee && <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-2.5">{(audience === "department-manager" || audience === "hr-manager") && <EmployeeProfilePhoto employeeId={actorEmployeeId && entry.employeeId === actorEmployeeId ? undefined : entry.employeeId} name={`${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() || entry.employeeCode || "Employee"} className="size-9 rounded-lg border border-white/10 bg-slate-800" textClassName="text-[10px] font-bold text-slate-300" />}<div className="min-w-0"><p className="font-medium text-slate-200">{`${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() || entry.employeeCode || "Employee"}</p><p className="mt-0.5 text-xs text-slate-500">{entry.departmentName || "Unassigned department"}</p></div></div></td>}<td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDate(entry.workDate)}</td><td className="px-4 py-3 text-slate-300"><div>{entry.scheduleName || "No shift"}</div>{entry.publicHoliday && <p className="mt-1 text-xs text-violet-300">Public holiday{entry.publicHoliday.name ? ` · ${entry.publicHoliday.name}` : ""}{entry.publicHoliday.isPaid ? " · Paid" : ""}</p>}{entry.leaveRequest && <p className={`mt-1 text-xs ${entry.leaveRequest.status === "APPROVED" ? "text-emerald-300" : "text-amber-200"}`}>Leave · {entry.leaveRequest.leaveType?.replaceAll("_", " ") || "Leave"} ({entry.leaveRequest.status || "status unavailable"})</p>}</td><td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">{formatTime(entry.firstClockIn, entry.timeZone)}</td><td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">{formatTime(entry.lastClockOut, entry.timeZone)}</td><td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-100">{minutesLabel(entry.workedMinutes ?? 0)}</td><td className="whitespace-nowrap px-4 py-3 tabular-nums"><span className="text-amber-200">{minutesLabel(entry.potentialOvertimeMinutes ?? 0)}</span>{(entry.excessUnapprovedOvertimeMinutes ?? 0) > 0 && <><p className="mt-1 text-xs text-rose-300">{minutesLabel(entry.excessUnapprovedOvertimeMinutes ?? 0)} unapproved excess — not payable</p><p className="mt-1 text-xs text-slate-500">{excessReviewLabel(entry.excessOvertimeReviewStatus)}</p></>}</td><td className="whitespace-nowrap px-4 py-3"><span className={`employee-monthly-status-pill inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium ${entry.publicHoliday ? "border-violet-300/20 bg-violet-300/10 text-violet-200" : entry.leaveRequest?.status === "APPROVED" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : entry.leaveRequest?.status === "PENDING" ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : entry.calculationStatus === "REVIEW_REQUIRED" ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : entry.calculationStatus === "IN_PROGRESS" ? "border-sky-300/20 bg-sky-300/10 text-sky-200" : "border-slate-600 bg-slate-700/20 text-slate-300"}`}>{entry.publicHoliday ? "Public holiday" : entry.leaveRequest?.status === "APPROVED" ? "Approved leave" : entry.leaveRequest?.status === "PENDING" ? "Leave pending" : entry.calculationStatus === "IN_PROGRESS" ? "Clocked in" : entry.calculationStatus === "REVIEW_REQUIRED" ? "Review required" : entry.calculationStatus === "NO_RECORDS" ? "No punches" : entry.calculationStatus === "NO_SHIFT" ? "No shift" : "Recorded"}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>;

}

