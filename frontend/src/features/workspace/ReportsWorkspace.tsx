"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, CalendarRange, FileBarChart } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Field, SelectInput, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PdfPreparationIndicator } from "@/components/ui/PdfPreparationIndicator";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { apiRequest } from "@/lib/api-client";
import { formatDate, getISODateInTimeZone, humanize } from "@/lib/format";
import { useAttendanceRefresh } from "@/lib/attendance-events";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { buildAttendanceReportDocument, type AttendanceReportPayload } from "@/features/workspace/attendance-report-document";
import { buildPdfPreparationDocument } from "@/features/payroll/pdf-preparation-document";

interface ReportTarget { employeeId: string; employeeCode: string; firstName: string; lastName: string; departmentName: string | null; workforceRole: string; employmentStatus: string }
type ReportPayload = AttendanceReportPayload;

export function ReportsWorkspace() {
  const { user, workDate, timeZone } = useWorkspace();
  const [targets, setTargets] = useState<ReportTarget[]>([]);
  const [targetId, setTargetId] = useState(["EMPLOYEE", "HR_MANAGER", "DEPARTMENT_MANAGER"].includes(user.role) ? user.employeeId || "" : "");
  const [fromDate, setFromDate] = useState(monthStart(workDate || todayISO(timeZone)));
  const [toDate, setToDate] = useState(workDate || todayISO(timeZone));
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(user.role !== "EMPLOYEE");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fromMonth, setFromMonth] = useState(monthStart(workDate || todayISO(timeZone)).slice(0, 7));
  const [toMonth, setToMonth] = useState((workDate || todayISO(timeZone)).slice(0, 7));
  const [monthlyDownloading, setMonthlyDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autoPreviewRevision, setAutoPreviewRevision] = useState(0);
  const [selectedDatePreset, setSelectedDatePreset] = useState<"7d" | "14d" | "3m" | "6m" | "12m" | null>(null);
  const reportRequestRef = useRef(0);
  const targetRequestRef = useRef(0);
  const dashboardRangeSeededRef = useRef(false);

  const loadTargets = useCallback(async (silent = false) => {
    const requestId = ++targetRequestRef.current;
    if (user.role === "EMPLOYEE") return;
    if (!silent) setLoadingTargets(true); setError("");
    try {
      const result = await apiRequest<{ targets?: ReportTarget[] }>("/attendance/reports/monthly?mode=targets");
      if (requestId !== targetRequestRef.current) return;
      const values = Array.isArray(result.targets) ? result.targets : [];
      setTargets(values);
      setTargetId((current) => current || values[0]?.employeeId || "");
    } catch (caught) {
      if (requestId === targetRequestRef.current) setError(caught instanceof Error ? caught.message : "Unable to load report targets.");
    } finally {
      if (!silent && requestId === targetRequestRef.current) setLoadingTargets(false);
    }
  }, [user.role]);

  useEffect(() => { void loadTargets(); }, [loadTargets]);
  useEffect(() => {
    if (!workDate) return;
    if (!dashboardRangeSeededRef.current) {
      setToDate(workDate);
      setFromDate((current) => current === monthStart(todayISO(timeZone)) ? monthStart(workDate) : current);
    }
    setToMonth((current) => current === todayISO(timeZone).slice(0, 7) ? workDate.slice(0, 7) : current);
    setFromMonth((current) => current === todayISO(timeZone).slice(0, 7) ? workDate.slice(0, 7) : current);
  }, [workDate, timeZone]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedFrom = query.get("fromDate") || "";
    const requestedTo = query.get("toDate") || "";
    const validDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(value + "T00:00:00.000Z");
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const today = workDate || todayISO(timeZone);
    if (validDate(requestedFrom) && validDate(requestedTo) &&
      requestedFrom <= requestedTo && requestedTo <= today) {
      dashboardRangeSeededRef.current = true;
      setFromDate(requestedFrom);
      setToDate(requestedTo);
      setSelectedDatePreset(null);
      setAutoPreviewRevision((revision) => revision + 1);
    }
  // URL is read once; subsequent changes are controlled by the report form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDatePreset(preset: "7d" | "14d" | "3m" | "6m" | "12m") {
    setSelectedDatePreset(preset);
    const end = workDate || todayISO(timeZone);
    const start = preset.endsWith("d")
      ? shiftDate(end, -(Number(preset.slice(0, -1)) - 1))
      : shiftMonthsClamped(end, -Number(preset.slice(0, -1)));
    setFromDate(start);
    setToDate(end);
    setReport(null);
    setError("");
    setNotice("");
    setAutoPreviewRevision((revision) => revision + 1);
  }

  const selectedTarget = useMemo(() => targets.find((target) => target.employeeId === targetId), [targets, targetId]);
  const canGenerateOrganizationSeries = user.role === "ORGANIZATION_ADMIN" || user.role === "HR_MANAGER";
  const monthSpan = isMonth(fromMonth) && isMonth(toMonth) && fromMonth <= toMonth
    ? monthOrdinal(toMonth) - monthOrdinal(fromMonth) + 1
    : 0;

  async function downloadOrganizationSeries() {
    if (!canGenerateOrganizationSeries || monthlyDownloading) return;
    if (!monthSpan) { setError("Choose valid From month and To month values."); return; }
    if (monthSpan > 24) { setError("An organization attendance report can cover up to 24 calendar months at a time."); return; }
    setMonthlyDownloading(true); setError(""); setNotice("");
    try {
      const params = new URLSearchParams({ fromMonth, toMonth });
      const response = await fetch(`/api/backend/attendance/reports/monthly-organization?${params.toString()}`, { credentials: "same-origin", cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.toLowerCase().includes("application/json")) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || `Monthly attendance report failed (${response.status}).`);
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.toLowerCase().includes("pdf")) throw new Error("The monthly attendance report was not returned as a PDF.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attendance-monthly-${fromMonth}-to-${toMonth}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(`Combined attendance report downloaded for ${fromMonth} through ${toMonth}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to download the multi-month attendance report."); }
    finally { setMonthlyDownloading(false); }
  }
  const totalWorkedHours = useMemo(() => (report?.months || []).reduce((sum, month) => sum + month.workedMinutes, 0) / 60, [report]);
  const totalPayableOvertime = useMemo(() => (report?.months || []).reduce((sum, month) => sum + month.payableOvertimeMinutes, 0) / 60, [report]);

  const generate = useCallback(async (silent = false) => {
    const requestId = ++reportRequestRef.current;
    if (!silent) { setGenerating(true); setError(""); setNotice(""); setReport(null); }
    try {
      if (!targetId && user.role !== "EMPLOYEE") throw new Error("Select a workforce member first.");
      if (!isDate(fromDate) || !isDate(toDate) || fromDate > toDate) throw new Error("Choose a valid date range.");
      const months = monthOrdinal(toDate) - monthOrdinal(fromDate) + 1;
      if (months > 24) throw new Error("Attendance reports can cover up to 24 calendar months at a time.");
      const params = new URLSearchParams({
        employeeId: user.role === "EMPLOYEE" ? user.employeeId || "" : targetId,
        fromDate,
        toDate,
        format: "json",
      });
      const result = await apiRequest<ReportPayload>(`/attendance/reports/monthly?${params.toString()}`);
      if (result.status !== "ok" || !result.employee || !Array.isArray(result.entries) || !Array.isArray(result.months)) {
        throw new Error("The attendance report response was incomplete.");
      }
      if (requestId === reportRequestRef.current) setReport(result);
    } catch (caught) {
      if (requestId === reportRequestRef.current) setError(caught instanceof Error ? caught.message : "Unable to generate this attendance report.");
    } finally {
      if (!silent && requestId === reportRequestRef.current) setGenerating(false);
    }
  }, [fromDate, toDate, targetId, user.role, user.employeeId]);

  useEffect(() => {
    reportRequestRef.current += 1;
    setReport(null);
    setGenerating(false);
  }, [targetId, fromDate, toDate]);

  useEffect(() => {
    if (!autoPreviewRevision || !isDate(fromDate) || !isDate(toDate) || fromDate > toDate) return;
    if (user.role !== "EMPLOYEE" && (!targetId || loadingTargets)) return;
    const timer = window.setTimeout(() => { void generate(); }, 180);
    return () => window.clearTimeout(timer);
  }, [autoPreviewRevision, fromDate, toDate, targetId, loadingTargets, user.role, generate]);

  useSmartRefresh(() => { if (report) return generate(true); if (user.role !== "EMPLOYEE") return loadTargets(true); }, !generating && !downloading && !monthlyDownloading);
  useAttendanceRefresh(() => { if (report) void generate(true); });

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true); setError(""); setNotice("");
    // Open synchronously in the click gesture so browsers do not block the report window.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Your browser blocked the attendance report window. Allow pop-ups for this site and try again.");
      setDownloading(false);
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPdfPreparationDocument("attendance", document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
    printWindow.document.close();
    try {
      if (!targetId && user.role !== "EMPLOYEE") throw new Error("Select a workforce member first.");
      if (!isDate(fromDate) || !isDate(toDate) || fromDate > toDate) throw new Error("Choose a valid date range.");
      const months = monthOrdinal(toDate) - monthOrdinal(fromDate) + 1;
      if (months > 24) throw new Error("Attendance reports can cover up to 24 calendar months at a time.");
      const params = new URLSearchParams({
        employeeId: user.role === "EMPLOYEE" ? user.employeeId || "" : targetId,
        fromDate,
        toDate,
        format: "json",
      });
      // The monthly report endpoint returns role-scoped JSON; render it into a print-ready report.
      const result = await apiRequest<ReportPayload>(`/attendance/reports/monthly?${params.toString()}`);
      if (result.status !== "ok" || !result.employee || !Array.isArray(result.entries) || !Array.isArray(result.months)) {
        throw new Error("The attendance report response was incomplete.");
      }
      const html = buildAttendanceReportDocument(result).replace(
        "</body>",
        "<script>document.getElementById('attendance-report-print')?.addEventListener('click', () => window.print());</script></body>",
      );
      if (printWindow.closed) throw new Error("The attendance report window was closed before the PDF was ready.");
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      window.setTimeout(() => {
        if (!printWindow.closed) { printWindow.focus(); printWindow.print(); }
      }, 500);
      setNotice("The attendance report is ready. In the print dialog, choose Save as PDF to download it.");
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setError(caught instanceof Error ? caught.message : "Unable to prepare this attendance report PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return <>
    <PageHeader eyebrow="Insights" title="Attendance reports" description="Generate individual and multi-month attendance reports. Report data, role scope, and calculations are supplied by the backend." />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    {canGenerateOrganizationSeries ? <Panel className="panel-pad organization-monthly-report">
      <div className="organization-monthly-heading">
        <span className="report-section-icon"><CalendarRange size={18} /></span>
        <div className="organization-monthly-heading-copy">
          <span className="report-section-eyebrow">Organization report</span>
          <h2>{user.role === "ORGANIZATION_ADMIN" ? "Multi-month organization attendance" : "Multi-month direct-reports attendance"}</h2>
          <p>{user.role === "ORGANIZATION_ADMIN" ? "Download one PDF containing the organization-wide monthly attendance registers." : "Download one PDF containing monthly attendance registers for your authorized direct-report scope."}</p>
        </div>
        <span className="report-limit-pill">Up to 24 months</span>
      </div>
      <div className="report-filter-grid organization-monthly-fields">
        <Field label="From month"><TextInput type="month" min="1900-01" max={toMonth || undefined} value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></Field>
        <Field label="To month"><TextInput type="month" min={fromMonth || "1900-01"} max={(workDate || todayISO(timeZone)).slice(0, 7)} value={toMonth} onChange={(event) => setToMonth(event.target.value)} /></Field>
        <div className="organization-monthly-summary"><strong>{monthSpan || "—"}</strong><span><b>{monthSpan === 1 ? "calendar month selected" : "calendar months selected"}</b><small>Maximum 24 per report</small></span></div>
      </div>
      <div className="organization-monthly-footer"><p><span className="report-timezone-dot" /> Organization timezone <strong>{timeZone}</strong><span className="report-footer-separator">·</span> Future dates are excluded.</p><Button variant="primary" leading={<ArrowDownToLine size={14} />} busy={monthlyDownloading} disabled={!monthSpan || monthSpan > 24} onClick={() => void downloadOrganizationSeries()}>Download combined PDF</Button></div>
      {monthlyDownloading ? <PdfPreparationIndicator label="Generating attendance report(s)" className="pdf-preparation-indicator-workspace" /> : null}
      {monthSpan > 24 ? <p className="field-hint" role="alert">Choose a range of 24 months or fewer.</p> : null}
    </Panel> : null}
    <Panel className="panel-pad individual-report-panel">
      <div className="individual-report-heading">
        <span className="report-section-icon"><FileBarChart size={18} /></span>
        <div>
          <span className="report-section-eyebrow">Individual report</span>
          <h2>Workforce attendance report</h2>
          <p>Select a workforce member and reporting period. Preview the monthly summary or download the complete PDF.</p>
        </div>
      </div>
      <div className="report-filter-grid individual-report-fields">
        {user.role !== "EMPLOYEE" ? <Field label="Workforce member"><SelectInput required value={targetId} onChange={(event) => { setTargetId(event.target.value); setReport(null); }}><option value="">Select a person</option>{targets.map((target) => <option key={target.employeeId} value={target.employeeId}>{target.employeeId === user.employeeId ? "My attendance · " : ""}{target.firstName} {target.lastName} · {target.employeeCode} · {target.departmentName || "No department"}</option>)}</SelectInput></Field> : <Field label="Report subject"><TextInput disabled value="My attendance" /></Field>}
        <Field label="From date"><TextInput type="date" value={fromDate} max={toDate} onChange={(event) => { setFromDate(event.target.value); setSelectedDatePreset(null); setReport(null); setError(""); setAutoPreviewRevision((revision) => revision + 1); }} /></Field>
        <Field label="To date"><TextInput type="date" value={toDate} min={fromDate} onChange={(event) => { setToDate(event.target.value); setSelectedDatePreset(null); setReport(null); setError(""); setAutoPreviewRevision((revision) => revision + 1); }} /></Field>
      </div>
      <div className="report-date-presets" role="group" aria-label="Attendance report date range presets">
        <span className="report-presets-label">Quick date range</span>
<button type="button" className={`button button-sm ${selectedDatePreset === "7d" ? "button-primary" : "button-secondary"}`} aria-pressed={selectedDatePreset === "7d"} onClick={() => applyDatePreset("7d")}>Last 7 days</button>
        <button type="button" className={`button button-sm ${selectedDatePreset === "14d" ? "button-primary" : "button-secondary"}`} aria-pressed={selectedDatePreset === "14d"} onClick={() => applyDatePreset("14d")}>Last 14 days</button>
        <button type="button" className={`button button-sm ${selectedDatePreset === "3m" ? "button-primary" : "button-secondary"}`} aria-pressed={selectedDatePreset === "3m"} onClick={() => applyDatePreset("3m")}>Last 3 months</button>
        <button type="button" className={`button button-sm ${selectedDatePreset === "6m" ? "button-primary" : "button-secondary"}`} aria-pressed={selectedDatePreset === "6m"} onClick={() => applyDatePreset("6m")}>Last 6 months</button>
        <button type="button" className={`button button-sm ${selectedDatePreset === "12m" ? "button-primary" : "button-secondary"}`} aria-pressed={selectedDatePreset === "12m"} onClick={() => applyDatePreset("12m")}>Last 12 months</button>
      </div>
      {selectedTarget ? <div className="report-selected-person">
        <div className="report-selected-person-label">Selected report subject</div>
        <ProfilePhoto name={`${selectedTarget.firstName} ${selectedTarget.lastName}`} employeeId={selectedTarget.employeeId} currentUser={selectedTarget.employeeId === user.employeeId} />
        <span><strong>{selectedTarget.firstName} {selectedTarget.lastName}</strong><small>{selectedTarget.employeeCode} <i>·</i> {selectedTarget.departmentName || "No department"}</small></span>
        <StatusBadge value={selectedTarget.employmentStatus} />
      </div> : null}
      <div className="report-filter-footer">
        <p><span className="report-timezone-dot" /> Organization timezone <strong>{timeZone}</strong><span className="report-footer-separator">·</span> Maximum span 24 months</p>
        <div className="report-action-group"><Button variant="secondary" leading={<FileBarChart size={14} />} busy={generating} disabled={loadingTargets || (!targetId && user.role !== "EMPLOYEE")} onClick={() => void generate()}>Preview report</Button><Button variant="primary" leading={<ArrowDownToLine size={14} />} busy={downloading} disabled={loadingTargets || (!targetId && user.role !== "EMPLOYEE")} onClick={() => void downloadPdf()}>Download PDF</Button></div>
      </div>
      {generating || downloading ? <PdfPreparationIndicator label="Generating attendance report(s)" className="pdf-preparation-indicator-workspace" /> : null}
    </Panel>
    {report ? <>
      <div className="report-kpis"><Panel className="metric-card"><span className="metric-label">Attendance days recorded</span><strong className="metric-value">{report.attendanceRecordCount ?? 0}</strong></Panel><Panel className="metric-card"><span className="metric-label">Hours worked</span><strong className="metric-value">{totalWorkedHours.toFixed(1)}</strong></Panel><Panel className="metric-card"><span className="metric-label">Approved overtime hours</span><strong className="metric-value">{totalPayableOvertime.toFixed(1)}</strong></Panel></div>
      <Panel><div className="panel-heading"><div><h2>{report.employee ? `${report.employee.firstName} ${report.employee.lastName}` : "Attendance summary"}</h2><p>{report.organization?.name || "Organization"} · {formatDate(fromDate, timeZone)} – {formatDate(toDate, timeZone)}</p></div><StatusBadge value="Generated" /></div>
        {report.months?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Month</th><th>Scheduled days</th><th>Days recorded</th><th>Worked hours</th><th>Regular hours</th><th>Approved overtime</th></tr></thead><tbody>{report.months.map((month) => <tr key={month.month}><td>{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month.month}-01T00:00:00Z`))}</td><td>{month.scheduledDays}</td><td>{month.daysWithAttendance}</td><td>{(month.workedMinutes / 60).toFixed(2)}</td><td>{(month.regularWorkedMinutes / 60).toFixed(2)}</td><td>{(month.payableOvertimeMinutes / 60).toFixed(2)}</td></tr>)}</tbody></table></div> : null}
      <div className="panel-heading"><div><h2>Daily attendance</h2><p>{Math.min(report.entries?.length || 0, 31)} latest records shown in the preview. Download the full PDF for the complete period.</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Work date</th><th>Schedule</th><th>First clock-in</th><th>Last clock-out</th><th>Worked</th><th>Status</th></tr></thead><tbody>{(report.entries || []).slice(-31).map((entry) => <tr key={entry.workDate}><td>{formatDate(entry.workDate, timeZone)}</td><td>{entry.scheduleName || "—"}</td><td>{formatTime(entry.firstClockIn, timeZone)}</td><td>{formatTime(entry.lastClockOut, timeZone)}</td><td>{(entry.workedMinutes / 60).toFixed(2)} h</td><td><StatusBadge value={entry.status} /></td></tr>)}</tbody></table></div>
    </Panel>
    </> : <Panel className="panel-pad report-placeholder"><div className="state-icon"><FileBarChart size={18} /></div><h3>Choose your report details</h3><p>Preview will display month summaries and recent daily attendance. The PDF download contains the complete report generated by the backend.</p></Panel>}
  </>;
}
function todayISO(timeZone: string) { return getISODateInTimeZone(timeZone); }
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function shiftMonthsClamped(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const targetMonthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)); }
function monthOrdinal(value: string) { const [year, month] = value.split("-").map(Number); return year * 12 + month; }
function isMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function formatTime(value: string | Date | null, timeZone: string) { if (!value) return "—"; const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) return "—"; return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date); }
