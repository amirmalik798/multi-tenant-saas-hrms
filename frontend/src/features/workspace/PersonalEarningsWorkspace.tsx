"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarDays, ChevronDown, CircleDollarSign, Clock3, FileDown, LoaderCircle, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { apiRequest } from "@/lib/api-client";
import { formatDate, formatMoney, getISODateInTimeZone, humanize } from "@/lib/format";
import { buildSalarySlipDocument, type SalarySlipPayload } from "@/features/payroll/salary-slip-document";
import { useAttendanceRefresh } from "@/lib/attendance-events";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { assertSalarySlipUsesOrganizationCurrency, normalizeCurrencyCode } from "@/lib/payroll-currency";

interface EarningsDay {
  workDate: string; scheduleName: string | null; isPaidLeave: boolean; isPaidHoliday: boolean;
  payableMinutes: number; clockIn: string | null; clockOut: string | null; workedMinutes: number;
  regularWorkedMinutes: number; potentialOvertimeMinutes: number; approvedOvertimeMinutes: number;
  payableOvertimeMinutes: number; excessUnapprovedOvertimeMinutes: number; calculationStatus: string;
  hourlyRate: number | null; overtimeRate: number | null;
  regularPay: number | null; overtimePay: number | null; estimatedPay: number | null;
  currencyCode: string | null; excessOvertimeReviewStatus: string | null;
}
interface EarningsSummary {
  estimatedSalary: number | null; regularMinutes: number; payableOvertimeMinutes: number;
  potentialOvertimeMinutes: number; excessUnapprovedOvertimeMinutes: number; totalWorkedMinutes: number;
  paidLeaveMinutes: number; paidHolidayMinutes: number; payableMinutes: number; daysWorked: number;
  daysWithMissingRates: number; currencyMismatch: boolean; currencyCodes: string[];
}
interface EarningsPayload {
  status?: string; message?: string; month?: string; timeZone?: string; employeeName?: string;
  currencyCode?: string | null; hasRates?: boolean; summary?: EarningsSummary; days?: EarningsDay[]; disclaimer?: string;
}

function duration(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
function formatTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
  catch { return value; }
}

function monthOrdinal(value: string) { const [year, month] = value.split("-").map(Number); return year * 12 + month - 1; }
function validateOwnSlipRange(fromMonth: string, toMonth: string, organizationMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(toMonth)) throw new Error("Choose valid start and end months.");
  const count = monthOrdinal(toMonth) - monthOrdinal(fromMonth) + 1;
  if (count < 1) throw new Error("The From month must be before or equal to the To month.");
  if (count > 24) throw new Error("A payslip can cover at most 24 months at a time.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(organizationMonth) || monthOrdinal(toMonth) > monthOrdinal(organizationMonth)) throw new Error("Future payroll months cannot be included. Select a range ending no later than the current organization month.");
  return count;
}

export function PersonalEarningsWorkspace({ embedded = false, monthOverride }: { embedded?: boolean; monthOverride?: string } = {}) {
  const { user, workDate, currencyCode, timeZone } = useWorkspace();
  const organizationMonth = (workDate || getISODateInTimeZone(timeZone)).slice(0, 7);
  const [slipFromMonth, setSlipFromMonth] = useState(organizationMonth);
  const [slipToMonth, setSlipToMonth] = useState(organizationMonth);
  const [slipGenerating, setSlipGenerating] = useState(false);
  const [slipRangeTouched, setSlipRangeTouched] = useState(false);
  const [slipError, setSlipError] = useState("");
  const [slipNotice, setSlipNotice] = useState("");
  const [ownMonth, setOwnMonth] = useState((workDate || getISODateInTimeZone(timeZone)).slice(0, 7));
  const month = monthOverride || ownMonth;
  const [monthChanged, setMonthChanged] = useState(false);
  const [dailyBreakdownOpen, setDailyBreakdownOpen] = useState(false);
  const [data, setData] = useState<EarningsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSequenceRef = useRef(0);
  useEffect(() => { if (!monthOverride && workDate && !monthChanged) setOwnMonth(workDate.slice(0, 7)); }, [workDate, monthChanged, monthOverride]);
  useEffect(() => {
    if (workDate && !slipRangeTouched) {
      const currentOrganizationMonth = workDate.slice(0, 7);
      setSlipFromMonth(currentOrganizationMonth);
      setSlipToMonth(currentOrganizationMonth);
    }
  }, [workDate, slipRangeTouched]);

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    if (!silent) setLoading(true); setError("");
    try {
      const result = await apiRequest<EarningsPayload>(`/employee/earnings?month=${encodeURIComponent(month)}`);
      if (requestId === loadSequenceRef.current) setData(result);
    } catch (caught) {
      if (requestId === loadSequenceRef.current) { setError(caught instanceof Error ? caught.message : "Unable to load your earnings for this month."); if (!silent) setData(null); }
    } finally {
      if (!silent && requestId === loadSequenceRef.current) setLoading(false);
    }
  }, [month]);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !slipGenerating);
  useAttendanceRefresh(() => { void load(true); });

  const summary = data?.summary;
  const days = Array.isArray(data?.days) ? data.days : [];
  const organizationCurrencyCode = normalizeCurrencyCode(currencyCode);
  const rateCurrencyCodes = Array.from(new Set([
    data?.currencyCode,
    ...days.map((day) => day.currencyCode),
    ...(summary?.currencyCodes ?? []),
  ].map((value) => normalizeCurrencyCode(value)).filter((value): value is string => Boolean(value))));
  const mismatchedCurrencyCodes = organizationCurrencyCode
    ? rateCurrencyCodes.filter((value) => value !== organizationCurrencyCode)
    : [];
  const hasCurrencyMismatch = Boolean(summary?.currencyMismatch || mismatchedCurrencyCodes.length);
  const incompleteRateDays = useMemo(() => days.filter((day) => day.payableMinutes > 0 && day.estimatedPay === null).length, [days]);
  const zone = data?.timeZone || timeZone;

  async function generateMyPayslip() {
    if (!user.employeeId || slipGenerating) {
      if (!user.employeeId) setSlipError("Your employee record could not be verified. Please sign in again.");
      return;
    }
    let count = 0;
    try { count = validateOwnSlipRange(slipFromMonth, slipToMonth, organizationMonth); }
    catch (caught) { setSlipError(caught instanceof Error ? caught.message : "Choose a valid payslip range."); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setSlipError("Your browser blocked the salary-slip window. Allow pop-ups for this site and try again."); return; }
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><title>Preparing your salary slip</title></head><body style='font-family:Arial,sans-serif;padding:32px;color:#24354a'><h2>Preparing your salary slip…</h2><p>Loading your attendance, effective pay rates and current payment statuses.</p></body></html>");
    printWindow.document.close();
    setSlipGenerating(true); setSlipError(""); setSlipNotice("");
    try {
      const params = new URLSearchParams({ startMonth: slipFromMonth, endMonth: slipToMonth });
      const result = await apiRequest<SalarySlipPayload>(`/payroll/payslips/${encodeURIComponent(user.employeeId)}?${params.toString()}`);
      if (!result.employee || result.employee.id !== user.employeeId || result.startMonth !== slipFromMonth || result.endMonth !== slipToMonth || !Array.isArray(result.months) || result.months.length !== count) {
        throw new Error("The payslip data was incomplete or did not match the selected monthly period.");
      }
      assertSalarySlipUsesOrganizationCurrency(result, organizationCurrencyCode);
      if (printWindow.closed) {
        setSlipNotice("Your salary-slip data was prepared, but the print window was closed. Generate it again to print or save it.");
        return;
      }
      printWindow.document.open(); printWindow.document.write(buildSalarySlipDocument(result)); printWindow.document.close();
      const paidCount = result.months.filter((item) => item.payment.status === "PAID").length;
      setSlipNotice(`Your ${count}-month payslip is ready: ${paidCount} PAID and ${result.months.length - paidCount} UNPAID month(s). Generating a payslip does not change payroll records.`);
      window.setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 300);
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setSlipError(caught instanceof Error ? caught.message : "Unable to generate your salary slip.");
    } finally { setSlipGenerating(false); }
  }

  return <>
    {!embedded ? <PageHeader eyebrow="My account · Compensation" title="My earnings" description="Your personal earnings estimate from recorded working time and approved overtime." /> : null}
    {!embedded ? <div className="toolbar" style={{ marginBottom: 14 }}>
      <label className="field" style={{ maxWidth: 190 }}><span className="field-label">Pay period</span><input className="text-input" type="month" value={month} onChange={(event) => { setOwnMonth(event.target.value); setMonthChanged(true); }} /></label>
      <span className="date-chip"><CalendarDays size={13} /> {zone}</span><span className="date-chip"><CircleDollarSign size={13} /> {organizationCurrencyCode || "Currency not configured"}</span><span style={{ marginLeft: "auto" }} />
      <span style={{ color: "var(--muted)", fontSize: 12 }}>{data?.employeeName || user.displayName}</span>
    </div> : null}
    {error ? <div role="alert" className="form-error" style={{ marginBottom: 14 }}>{error}</div> : null}
    {!error && summary ? <>
      {!embedded ? <div className="page-grid grid-3" style={{ marginBottom: 16 }}>
        <Panel className="metric-card"><div className="metric-icon"><Wallet size={17} /></div><div className="metric-label">Estimated earnings</div><div className="metric-value">{!organizationCurrencyCode || hasCurrencyMismatch ? "—" : formatMoney(summary.estimatedSalary, organizationCurrencyCode)}</div><div className="metric-foot">{!organizationCurrencyCode ? "Organization currency unavailable" : hasCurrencyMismatch ? "Currency mismatch — estimate withheld" : `For ${month} · not a final payslip`}</div></Panel>
        <Panel className="metric-card"><div className="metric-icon"><Clock3 size={17} /></div><div className="metric-label">Recorded work</div><div className="metric-value">{duration(summary.totalWorkedMinutes)}</div><div className="metric-foot">{summary.daysWorked} days with recorded work</div></Panel>
        <Panel className="metric-card"><div className="metric-icon"><CalendarDays size={17} /></div><div className="metric-label">Approved overtime</div><div className="metric-value">{duration(summary.payableOvertimeMinutes)}</div><div className="metric-foot">Potential unapproved overtime: {duration(summary.excessUnapprovedOvertimeMinutes)}</div></Panel>
      </div> : null}
      {!organizationCurrencyCode ? <div className="form-error" role="alert" style={{ marginBottom: 14 }}>The organization's configured currency could not be verified. Monetary amounts are withheld until the organization currency is available.</div> : hasCurrencyMismatch ? <div className="form-error" role="alert" style={{ marginBottom: 14 }}>Pay-rate currency {mismatchedCurrencyCodes.length ? mismatchedCurrencyCodes.join(", ") : (summary.currencyCodes ?? rateCurrencyCodes).join(", ") || "is inconsistent"} does not match the organization's configured currency ({organizationCurrencyCode}). Affected estimates and payslips are withheld until HR reviews the pay-rate history.</div> : null}
      {incompleteRateDays > 0 || summary.daysWithMissingRates > 0 || !data?.hasRates ? <div className="info-callout" style={{ marginBottom: 14 }}><AlertCircle size={15} /><span>Some payable time does not have a complete effective pay rate. Affected amounts are not estimated. Ask HR to review your pay-rate history.</span></div> : null}
      {data?.disclaimer ? <div className="info-callout" style={{ marginBottom: 14 }}>{data.disclaimer}</div> : null}
    </> : null}
    <Panel>
      <div className="panel-heading"><div><h2>Daily earnings breakdown</h2><p>See each day’s calculated earnings and the hourly and overtime rates effective on that date.</p></div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="date-chip">{loading ? "Loading…" : `${days.length} days`}</span><button type="button" className="button button-sm button-secondary" aria-expanded={dailyBreakdownOpen} aria-controls="employee-daily-earnings-content" onClick={() => setDailyBreakdownOpen((open) => !open)}><ChevronDown size={14} style={{ transform: dailyBreakdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }} />{dailyBreakdownOpen ? "Collapse" : "Expand"}</button></div></div>
      <div id="employee-daily-earnings-content" hidden={!dailyBreakdownOpen}>
      {loading && !days.length ? <div className="loading-state">Calculating your earnings…</div> : null}
      {!loading && !error && !days.length ? <div className="empty-state"><div className="state-icon"><Wallet size={18} /></div><h3>No earnings details for this period</h3><p>Your daily schedule and attendance details will appear here when available.</p></div> : null}
      {days.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Work date</th><th>Schedule</th><th>Clock in / out</th><th>Worked</th><th>Approved OT</th><th>Daily earnings</th><th>Status</th></tr></thead><tbody>{days.map((day) => {
        const dayCurrency = normalizeCurrencyCode(day.currencyCode || data?.currencyCode);
        const dayCurrencyMismatch = !organizationCurrencyCode || (day.payableMinutes > 0 && (!dayCurrency || dayCurrency !== organizationCurrencyCode));
        return <tr key={day.workDate}>
        <td><span className="table-primary">{formatDate(day.workDate, zone)}</span></td>
        <td>{day.scheduleName || "No shift"}{day.isPaidLeave ? <span className="table-secondary">Paid leave</span> : day.isPaidHoliday ? <span className="table-secondary">Paid holiday</span> : null}</td>
        <td><span className="table-primary">{formatTime(day.clockIn, zone)}</span><span className="table-secondary">{formatTime(day.clockOut, zone)}</span></td>
        <td><span className="table-primary">{duration(day.workedMinutes)}</span><span className="table-secondary">{duration(day.payableMinutes)} payable</span></td>
        <td>{duration(day.payableOvertimeMinutes)}{day.excessUnapprovedOvertimeMinutes > 0 ? <span className="table-secondary">{duration(day.excessUnapprovedOvertimeMinutes)} unapproved</span> : null}</td>
        <td>{dayCurrencyMismatch ? <span className="table-secondary currency-mismatch-text">{organizationCurrencyCode ? "Currency mismatch — amount withheld" : "Organization currency unavailable"}</span> : <><span className="table-primary">{formatMoney(day.estimatedPay, organizationCurrencyCode)}</span><span className="table-secondary">Regular {formatMoney(day.regularPay, organizationCurrencyCode)} · OT {formatMoney(day.overtimePay, organizationCurrencyCode)}</span><span className="table-secondary">Hourly rate: {day.hourlyRate === null ? "Not configured" : `${formatMoney(day.hourlyRate, organizationCurrencyCode)} / hour`}</span><span className="table-secondary">Overtime rate: {day.overtimeRate === null ? "Not configured" : `${formatMoney(day.overtimeRate, organizationCurrencyCode)} / hour`}</span></>}</td>
        <td><StatusBadge value={day.calculationStatus || (day.isPaidLeave ? "PAID_LEAVE" : day.isPaidHoliday ? "PAID_HOLIDAY" : "NO_DATA")} />{day.excessOvertimeReviewStatus ? <span className="table-secondary">{humanize(day.excessOvertimeReviewStatus)}</span> : null}</td>
      </tr>;
      })}</tbody></table></div> : null}
      <div className="table-footer"><span>Rates and payable time are provided by the backend.</span><span>Estimates may change after approved corrections or payroll review.</span></div>
      </div>
    </Panel>
    {user.employeeId ? <Panel className="panel-pad" style={{ marginTop: 16 }}>
      <div className="payslip-generator-heading"><span className="metric-icon"><FileDown size={18} /></span><div><h2>Generate my payslip</h2><p>Select a From month and To month. Each month in the range is included as its own monthly payslip with attendance, effective pay rates and the latest payment status.</p></div></div>
      <div className="payslip-generator-controls"><label className="field"><span className="field-label">From month</span><input className="text-input" type="month" min="2000-01" max={slipToMonth || organizationMonth} value={slipFromMonth} disabled={slipGenerating} onChange={(event) => { setSlipRangeTouched(true); setSlipFromMonth(event.target.value); setSlipError(""); setSlipNotice(""); }} /></label><label className="field"><span className="field-label">To month</span><input className="text-input" type="month" min={slipFromMonth || "2000-01"} max={organizationMonth} value={slipToMonth} disabled={slipGenerating} onChange={(event) => { setSlipRangeTouched(true); setSlipToMonth(event.target.value); setSlipError(""); setSlipNotice(""); }} /></label><Button variant="primary" leading={slipGenerating ? <LoaderCircle size={14} /> : <Printer size={14} />} busy={slipGenerating} disabled={!slipFromMonth || !slipToMonth || slipFromMonth > slipToMonth} onClick={() => void generateMyPayslip()}>Generate payslip</Button></div>
      <div className="payslip-generator-footer"><p>Up to 24 months per request. Future organization payroll months are not available. Payslips are read-only statements and never create, edit or mark payments as paid.</p><span className="payslip-month-count">{slipFromMonth && slipToMonth && slipFromMonth <= slipToMonth ? `${monthOrdinal(slipToMonth) - monthOrdinal(slipFromMonth) + 1} monthly statement(s)` : "Choose a valid month range"}</span></div>
      {slipError ? <div className="form-error" role="alert" style={{ marginTop: 12 }}>{slipError}</div> : null}
      {slipNotice ? <div className="success-callout" role="status" style={{ marginTop: 12 }}>{slipNotice}</div> : null}
    </Panel> : null}
  </>;
}
