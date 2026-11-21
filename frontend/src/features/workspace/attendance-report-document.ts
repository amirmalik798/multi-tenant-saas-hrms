export type AttendanceReportEvent = {
  id?: string;
  eventType?: string;
  recordedAt?: string | Date | null;
  timeZone?: string | null;
  source?: string | null;
};

export type AttendanceReportEntry = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentName: string | null;
  workforceRole: string | null;
  employmentStatus: string | null;
  timeZone: string;
  workDate: string;
  scheduleName: string | null;
  expectedStart: string | Date | null;
  expectedEnd: string | Date | null;
  scheduledBreakMinutes: number | string | null;
  firstClockIn: string | Date | null;
  lastClockOut: string | Date | null;
  eventCount: number | string;
  events: AttendanceReportEvent[];
  approvedOvertimeMinutes: number | string;
  excessOvertimeReviewStatus: string | null;
  leaveRequest: { leaveType?: string; status?: string; isPaid?: boolean } | null;
  publicHoliday: { name?: string; isPaid?: boolean } | null;
  status: string;
  calculationStatus: string;
  actualElapsedMinutes: number;
  breakDeductedMinutes: number;
  workedMinutes: number;
  regularWorkedMinutes: number;
  potentialOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes: number;
};

export type AttendanceReportMonth = {
  month: string;
  days: number;
  daysWithAttendance: number;
  scheduledDays: number;
  workedDays: number;
  workedMinutes: number;
  regularWorkedMinutes: number;
  potentialOvertimeMinutes: number;
  approvedOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes: number;
  workedHours: number;
  regularHours: number;
  approvedOvertimeHours: number;
};

export type AttendanceReportPayload = {
  status: string;
  organization: { name: string; timeZone: string };
  generatedBy: string;
  generatedAt: string;
  employee: {
    employeeId: string;
    employeeCode: string | null;
    firstName: string | null;
    lastName: string | null;
    departmentName: string | null;
    workforceRole: string | null;
    employmentStatus: string | null;
  };
  fromDate: string;
  toDate: string;
  attendanceRecordCount: number;
  entries: AttendanceReportEntry[];
  months: AttendanceReportMonth[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dateLabel(value: string, includeYear = false): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function dateTimeLabel(value: string | Date | null, timeZone: string): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
}

function dateTimeFull(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

function duration(minutes: number): string {
  const safe = Math.max(0, Math.floor(Number(minutes) || 0));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function roleLabel(value: string | null): string {
  return (value || "Workforce member").replaceAll("_", " ").toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    RECORDED: "Attendance recorded",
    REVIEW_REQUIRED: "Review required",
    IN_PROGRESS: "Clocked in",
    APPROVED_LEAVE: "Approved leave",
    LEAVE_PENDING: "Leave pending",
    PUBLIC_HOLIDAY: "Public holiday",
    NO_PUNCHES: "No punches",
    NOT_SCHEDULED: "Not scheduled",
  };
  return labels[value] || value.replaceAll("_", " ").toLowerCase();
}

function eventSummary(entry: AttendanceReportEntry, timeZone: string): string {
  if (!entry.events?.length) return "No punches";
  return entry.events.map((event) => {
    const eventName = (event.eventType || "EVENT").replaceAll("_", " ");
    return `${eventName} ${dateTimeLabel(event.recordedAt ?? null, event.timeZone || timeZone)}`;
  }).join(" · ");
}

function statusClass(status: string): string {
  if (status === "RECORDED") return "good";
  if (status === "IN_PROGRESS") return "info";
  if (status === "REVIEW_REQUIRED" || status === "LEAVE_PENDING") return "warning";
  if (status === "APPROVED_LEAVE" || status === "PUBLIC_HOLIDAY") return "special";
  return "muted";
}

function buildDayRows(entries: AttendanceReportEntry[], timeZone: string): string {
  return entries.map((entry) => {
    const shift = entry.scheduleName || "No shift";
    const expected = entry.expectedStart && entry.expectedEnd
      ? `${dateTimeLabel(entry.expectedStart, timeZone)} – ${dateTimeLabel(entry.expectedEnd, timeZone)}`
      : "—";
    const contextual = [
      entry.publicHoliday?.name ? `Holiday: ${entry.publicHoliday.name}` : entry.publicHoliday ? "Public holiday" : "",
      entry.leaveRequest ? `Leave: ${entry.leaveRequest.leaveType || "Leave"} (${entry.leaveRequest.status || "status"})` : "",
      entry.excessUnapprovedOvertimeMinutes > 0 ? `${duration(entry.excessUnapprovedOvertimeMinutes)} excess not approved for pay` : "",
    ].filter(Boolean).join(" · ");
    return `<tr>
      <td class="date-cell"><strong>${escapeHtml(dateLabel(entry.workDate))}</strong></td>
      <td><strong>${escapeHtml(shift)}</strong><span class="sub-note">${escapeHtml(expected)}</span>${contextual ? `<span class="sub-note">${escapeHtml(contextual)}</span>` : ""}</td>
      <td class="events-cell">${escapeHtml(eventSummary(entry, timeZone))}</td>
      <td class="numeric strong">${escapeHtml(duration(entry.workedMinutes))}</td>
      <td class="numeric">${escapeHtml(duration(entry.regularWorkedMinutes))}</td>
      <td class="numeric">${escapeHtml(duration(entry.potentialOvertimeMinutes))}</td>
      <td class="numeric">${escapeHtml(duration(entry.payableOvertimeMinutes))}</td>
      <td><span class="status ${statusClass(entry.status)}">${escapeHtml(statusLabel(entry.status))}</span></td>
    </tr>`;
  }).join("");
}

function buildMonthPage(
  payload: AttendanceReportPayload,
  month: AttendanceReportMonth,
  index: number,
  totalPages: number,
): string {
  const entries = payload.entries.filter((entry) => entry.workDate.startsWith(month.month));
  const employeeName = [payload.employee.firstName, payload.employee.lastName].filter(Boolean).join(" ") ||
    payload.employee.employeeCode || "Workforce member";
  const subtitle = [
    roleLabel(payload.employee.workforceRole),
    payload.employee.departmentName || "",
    payload.employee.employeeCode ? `ID ${payload.employee.employeeCode}` : "",
  ].filter(Boolean).join(" · ");

  return `<section class="month-page${index === 0 ? " first-month" : ""}">
    <header class="brand-row">
      <div class="brand-mark">HR</div>
      <div class="brand-copy">
        <span class="eyebrow">WORKFORCE ATTENDANCE STATEMENT</span>
        <h1>${escapeHtml(payload.organization.name)}</h1>
        <p>Attendance records and monthly hours</p>
      </div>
      <div class="period">
        <span class="eyebrow">MONTHLY PERIOD</span>
        <strong>${escapeHtml(monthLabel(month.month))}</strong>
        <span class="page-count">Month ${index + 1} of ${totalPages}</span>
      </div>
    </header>

    <section class="identity">
      <div class="person">
        <span class="eyebrow">WORKFORCE MEMBER</span>
        <h2>${escapeHtml(employeeName)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="identity-meta">
        <span><small>Selected date range</small><strong>${escapeHtml(dateLabel(payload.fromDate, true))} – ${escapeHtml(dateLabel(payload.toDate, true))}</strong></span>
        <span><small>Organization timezone</small><strong>${escapeHtml(payload.organization.timeZone)}</strong></span>
        <span><small>Employment status</small><strong>${escapeHtml(payload.employee.employmentStatus || "—")}</strong></span>
        <span><small>Attendance records</small><strong>${month.daysWithAttendance} day(s) with recorded events</strong></span>
      </div>
    </section>

    <section class="summary-grid">
      <div class="metric primary"><span>Total worked</span><strong>${escapeHtml(duration(month.workedMinutes))}</strong><small>${month.workedDays} days with work recorded</small></div>
      <div class="metric"><span>Regular hours</span><strong>${escapeHtml(duration(month.regularWorkedMinutes))}</strong><small>Calculated regular work</small></div>
      <div class="metric"><span>Potential overtime</span><strong>${escapeHtml(duration(month.potentialOvertimeMinutes))}</strong><small>Elapsed time beyond shift</small></div>
      <div class="metric"><span>Approved payable OT</span><strong>${escapeHtml(duration(month.payableOvertimeMinutes))}</strong><small>Pre-authorized overtime</small></div>
      <div class="metric"><span>Unapproved excess</span><strong>${escapeHtml(duration(month.excessUnapprovedOvertimeMinutes))}</strong><small>Not payable</small></div>
      <div class="metric"><span>Scheduled / recorded days</span><strong>${month.scheduledDays} / ${month.daysWithAttendance}</strong><small>${month.days} calendar days in range</small></div>
    </section>

    <div class="table-heading">
      <div><span class="eyebrow">DAILY ATTENDANCE DETAIL</span><h3>Attendance records and hours by day</h3></div>
      <span>${entries.length} date(s)</span>
    </div>
    <table class="attendance-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Shift / expected time</th>
          <th>Recorded events</th>
          <th class="numeric">Worked</th>
          <th class="numeric">Regular</th>
          <th class="numeric">Potential OT</th>
          <th class="numeric">Payable OT</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${buildDayRows(entries, payload.organization.timeZone)}</tbody>
    </table>

    <footer class="footer">
      <div><strong>Monthly total worked: ${escapeHtml(duration(month.workedMinutes))}</strong><span>Regular ${escapeHtml(duration(month.regularWorkedMinutes))} · Approved overtime ${escapeHtml(duration(month.payableOvertimeMinutes))} · Unapproved excess ${escapeHtml(duration(month.excessUnapprovedOvertimeMinutes))}</span></div>
      <div class="footer-meta">
        <span>Generated ${escapeHtml(dateTimeFull(payload.generatedAt, payload.organization.timeZone))}</span>
        <span>Prepared by ${escapeHtml(payload.generatedBy)}</span>
      </div>
    </footer>
  </section>`;
}

export function buildAttendanceReportDocument(payload: AttendanceReportPayload): string {
  const pages = payload.months.map((month, index) =>
    buildMonthPage(payload, month, index, payload.months.length)
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Attendance report · ${escapeHtml(payload.employee.firstName)} ${escapeHtml(payload.employee.lastName)} · ${escapeHtml(payload.fromDate)} to ${escapeHtml(payload.toDate)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #17263a; background: #eaf0f6; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 20px; }
  .toolbar { width: 210mm; max-width: 100%; margin: 0 auto 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #52647a; font-size: 12px; }
  .toolbar button { border: 0; border-radius: 8px; padding: 10px 16px; background: #1769aa; color: white; font-weight: 700; cursor: pointer; }
  .month-page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; padding: 9mm; background: white; box-shadow: 0 5px 26px rgba(17,34,58,.13); display: block; overflow: visible; page-break-before: always; break-before: page; page-break-inside: auto; break-inside: auto; }
  .month-page.first-month { page-break-before: auto; break-before: auto; }
  .attendance-table thead { display: table-header-group; }
  .attendance-table tr { page-break-inside: avoid; break-inside: avoid; }
  .brand-row { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid #1769aa; }
  .brand-mark { width: 40px; height: 40px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: #102b4c; color: white; font-size: 13px; font-weight: 800; }
  .brand-copy { min-width: 0; flex: 1; }
  .eyebrow { display: block; margin-bottom: 4px; color: #3979b7; font-size: 6.2pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  .brand-copy h1 { margin: 0; color: #122a47; font-size: 14pt; }
  .brand-copy p { margin: 3px 0 0; color: #758399; font-size: 8pt; }
  .period { min-width: 130px; display: flex; flex-direction: column; align-items: flex-end; }
  .period strong { color: #142f50; font-size: 13pt; }
  .page-count { margin-top: 3px; color: #78879a; font-size: 7pt; }
  .identity { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 10px 12px; border: 1px solid #dce5ef; border-radius: 8px; background: #f7f9fc; }
  .person { min-width: 0; flex: 1; }
  .person h2 { margin: 1px 0 3px; color: #142a45; font-size: 12pt; }
  .person p { margin: 0; color: #617188; font-size: 7pt; }
  .identity-meta { display: grid; min-width: 52%; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
  .identity-meta span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .identity-meta small { color: #7c899b; font-size: 6pt; }
  .identity-meta strong { overflow-wrap: anywhere; color: #2a3f58; font-size: 6.6pt; }
  .summary-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr 1fr 1fr; gap: 5px; margin-top: 8px; }
  .metric { min-width: 0; padding: 7px; border: 1px solid #e0e7ef; border-radius: 7px; background: #fff; }
  .metric.primary { border-color: #c8d8ea; background: #f0f6fc; }
  .metric span { display: block; color: #708096; font-size: 6.1pt; font-weight: 700; }
  .metric strong { display: block; margin-top: 3px; color: #183557; font-size: 10pt; }
  .metric small { display: block; margin-top: 2px; color: #8794a5; font-size: 5.5pt; line-height: 1.2; }
  .table-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin: 10px 0 5px; }
  .table-heading h3 { margin: 0; color: #1a304b; font-size: 9pt; }
  .table-heading > span { color: #7a899c; font-size: 7pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { padding: 5px 4px; background: #edf2f7; color: #52647b; font-size: 5.8pt; font-weight: 800; letter-spacing: .04em; text-align: left; text-transform: uppercase; }
  td { padding: 4px 4px; border-bottom: 1px solid #e7edf3; color: #30435b; font-size: 6.3pt; line-height: 1.12; vertical-align: middle; }
  .attendance-table th:nth-child(1) { width: 11%; }
  .attendance-table th:nth-child(2) { width: 17%; }
  .attendance-table th:nth-child(3) { width: 22%; }
  .attendance-table th:nth-child(4) { width: 9%; }
  .attendance-table th:nth-child(5) { width: 9%; }
  .attendance-table th:nth-child(6) { width: 10%; }
  .attendance-table th:nth-child(7) { width: 10%; }
  .attendance-table th:nth-child(8) { width: 12%; }
  .date-cell strong { color: #203a58; white-space: nowrap; }
  .sub-note { display: block; margin-top: 2px; color: #77869a; font-size: 5.5pt; line-height: 1.1; }
  .events-cell { overflow-wrap: anywhere; color: #42556c; font-size: 5.8pt; }
  .numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { color: #1b385b; font-weight: 800; }
  .status { display: inline-block; padding: 2px 4px; border-radius: 4px; font-size: 5.5pt; font-weight: 700; white-space: nowrap; }
  .status.good { color: #17613e; background: #e5f4ea; }
  .status.info { color: #20558a; background: #e8f1fb; }
  .status.warning { color: #965911; background: #fff0d9; }
  .status.special { color: #594c9a; background: #f0edff; }
  .status.muted { color: #62738a; background: #eff3f7; }
  .footer { margin-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding-top: 8px; border-top: 1px solid #e4eaf1; break-inside: avoid; page-break-inside: avoid; }
  .footer > div:first-child { display: flex; flex-direction: column; gap: 3px; }
  .footer strong { color: #173452; font-size: 8pt; }
  .footer span { color: #758399; font-size: 6pt; }
  .footer-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    html, body { width: 210mm; margin: 0; padding: 0; background: white; }
    .toolbar { display: none !important; }
    .month-page { width: 210mm; min-height: 297mm; margin: 0; padding: 9mm; box-shadow: none; overflow: visible; }
  }
  @media screen and (max-width: 850px) {
    body { padding: 10px; }
    .month-page { width: 100%; height: auto; min-height: 0; overflow: visible; padding: 16px; break-before: auto; page-break-before: auto; }
    .identity { flex-direction: column; }
    .identity-meta { min-width: 0; }
    .attendance-table { min-width: 760px; }
    .month-page { overflow-x: auto; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <span>Attendance report · Each month begins on a new page · Long months continue across pages</span>
  <button type="button" id="attendance-report-print">Print / Save as PDF</button>
</div>
${pages}
</body>
</html>`;
}
