export type SalarySlipDay = {
  workDate: string;
  scheduleName: string | null;
  dayStatus: string;
  workedMinutes: number;
  regularWorkedMinutes: number;
  potentialOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes: number;
  paidLeaveMinutes: number;
  paidHolidayMinutes: number;
  payableRegularMinutes: number;
  payableMinutes: number;
  hourlyRate: number | null;
  overtimeRate: number | null;
  currencyCode: string | null;
  regularPay: number | null;
  overtimePay: number | null;
  estimatedPay: number | null;
  paymentStatus: string | null;
  paidAt: string | null;
  paymentReference: string | null;
};

export type SalarySlipMonth = {
  month: string;
  totals: {
    workedMinutes: number;
    regularWorkedMinutes: number;
    payableOvertimeMinutes: number;
    potentialOvertimeMinutes: number;
    excessUnapprovedOvertimeMinutes: number;
    paidLeaveMinutes: number;
    paidHolidayMinutes: number;
    payableMinutes: number;
    daysWorked: number;
    daysWithMissingRates: number;
  };
  totalsByCurrency: Array<{
    currencyCode: string | null;
    amount: number | null;
    incomplete: boolean;
  }>;
  currencyMismatch: boolean;
  ratePeriods: Array<{
    fromDate: string;
    toDate: string;
    hourlyRate: number | null;
    overtimeRate: number | null;
    currencyCode: string | null;
  }>;
  payment: {
    status: string;
    recorded: boolean;
    paidAt: string | null;
    reference: string | null;
  };
  days: SalarySlipDay[];
};

export type SalarySlipPayload = {
  status: string;
  generatedAt: string;
  startMonth: string;
  endMonth: string;
  organization: { name: string; timeZone: string };
  employee: {
    id: string;
    employeeCode: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
    departmentName: string | null;
    workforceRole: string | null;
    employmentStatus: string;
  };
  months: SalarySlipMonth[];
  disclaimer: string;
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

function dateLabel(value: string, withWeekday = false): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "2-digit",
    year: withWeekday ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function duration(minutes: number): string {
  const safe = Math.max(0, Math.floor(Number(minutes) || 0));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function money(value: number | null, currencyCode: string | null): string {
  if (value === null || !Number.isFinite(value)) return "Rate not configured";
  if (!currencyCode || currencyCode === "UNCONFIGURED") return value.toFixed(2);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

function roleLabel(value: string | null): string {
  return (value || "Workforce member").replaceAll("_", " ").toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    WORKED: "Worked",
    PAID_LEAVE: "Paid leave",
    PAID_HOLIDAY: "Paid holiday",
    NO_ATTENDANCE: "No attendance",
    NON_WORKDAY: "Non-workday",
    IN_PROGRESS: "Session open",
    REVIEW_REQUIRED: "Review required",
  };
  return labels[value] || value.replaceAll("_", " ").toLowerCase();
}

function paymentLabel(month: SalarySlipMonth): string {
  const status = month.payment.status === "PAID" ? "PAID" : "UNPAID";
  return month.payment.recorded ? `Payment status · ${status} (stored)` : `Payment status · ${status} (not yet stored)`;
}

function monthlyEarningsSummary(month: SalarySlipMonth): string {
  if (month.totalsByCurrency.length === 0) return "No payable earnings recorded";
  return month.totalsByCurrency.map((entry) => {
    const amount = entry.incomplete ? "Incomplete — rate required" : money(entry.amount, entry.currencyCode);
    return `${escapeHtml(entry.currencyCode || "Currency not configured")}: ${escapeHtml(amount)}`;
  }).join(" &nbsp; <span class='summary-separator'>|</span> &nbsp; ");
}

function buildRateRows(month: SalarySlipMonth): string {
  if (month.ratePeriods.length === 0) {
    return '<tr><td colspan="4" class="empty-rate">No effective pay rate was configured during this month.</td></tr>';
  }
  return month.ratePeriods.map((period) => {
    const dateRange = period.fromDate === period.toDate
      ? dateLabel(period.fromDate)
      : `${dateLabel(period.fromDate)} – ${dateLabel(period.toDate)}`;
    return `<tr>
      <td>${escapeHtml(dateRange)}</td>
      <td class="numeric">${escapeHtml(period.hourlyRate === null ? "Not configured" : `${money(period.hourlyRate, period.currencyCode)} / hr`)}</td>
      <td class="numeric">${escapeHtml(period.overtimeRate === null ? "Not configured" : `${money(period.overtimeRate, period.currencyCode)} / hr`)}</td>
      <td>${escapeHtml(period.currencyCode || "—")}</td>
    </tr>`;
  }).join("");
}

function buildDayRows(days: SalarySlipDay[]): string {
  return days.map((day) => {
    const currency = day.currencyCode;
    const dayAmount = day.estimatedPay === null
      ? "Rate required"
      : day.payableMinutes > 0
        ? money(day.estimatedPay, currency)
        : "—";
    const statusClass = day.dayStatus === "WORKED"
      ? "status-worked"
      : day.dayStatus === "PAID_LEAVE" || day.dayStatus === "PAID_HOLIDAY"
        ? "status-paid"
        : day.dayStatus === "REVIEW_REQUIRED" || day.dayStatus === "IN_PROGRESS"
          ? "status-review"
          : "status-muted";
    const overtimeLabel = day.payableOvertimeMinutes > 0
      ? duration(day.payableOvertimeMinutes)
      : "—";
    const unapprovedNote = day.excessUnapprovedOvertimeMinutes > 0
      ? `<span class="sub-note">${escapeHtml(duration(day.excessUnapprovedOvertimeMinutes))} unapproved</span>`
      : "";
    return `<tr>
      <td class="date-cell"><strong>${escapeHtml(dateLabel(day.workDate))}</strong><span class="sub-note">${escapeHtml(dateLabel(day.workDate, true))}</span></td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(statusLabel(day.dayStatus))}</span></td>
      <td class="numeric">${escapeHtml(duration(day.workedMinutes))}</td>
      <td class="numeric">${escapeHtml(overtimeLabel)}${unapprovedNote}</td>
      <td class="numeric">${escapeHtml(day.payableRegularMinutes <= 0 ? "—" : day.regularPay === null ? "Rate required" : money(day.regularPay, currency))}</td>
      <td class="numeric">${escapeHtml(day.payableOvertimeMinutes <= 0 ? "—" : day.overtimePay === null ? "Rate required" : money(day.overtimePay, currency))}</td>
      <td class="numeric amount-cell">${escapeHtml(dayAmount)}</td>
    </tr>`;
  }).join("");
}

function buildMonthPage(
  payload: SalarySlipPayload,
  month: SalarySlipMonth,
  index: number,
  totalPages: number,
): string {
  const employeeName = [payload.employee.firstName, payload.employee.lastName].filter(Boolean).join(" ") || "Workforce member";
  const currencySummary = monthlyEarningsSummary(month);
  const paidTime = month.totals.paidLeaveMinutes + month.totals.paidHolidayMinutes;
  const paidTimeLabel = paidTime > 0 ? duration(paidTime) : "0h 00m";
  const paymentMeta = [
    month.payment.status === "PAID" && month.payment.paidAt
      ? `Paid ${dateLabel(month.payment.paidAt.slice(0, 10))}`
      : month.payment.status === "PAID" ? "Paid" : "",
    month.payment.reference ? `Reference: ${month.payment.reference}` : "",
  ].filter(Boolean).join(" · ");

  return `<section class="month-page">
    <div class="brand-row">
      <div class="brand-mark">HR</div>
      <div class="brand-copy">
        <p class="eyebrow">WORKFORCE PAYROLL STATEMENT</p>
        <h1>${escapeHtml(payload.organization.name)}</h1>
        <p class="muted">Official monthly salary slip</p>
      </div>
      <div class="period-block">
        <span class="eyebrow">PAY PERIOD</span>
        <strong>${escapeHtml(monthLabel(month.month))}</strong>
        <span class="payment-status ${month.payment.status === "PAID" ? "paid" : "unpaid"}">${escapeHtml(month.payment.status === "PAID" ? "PAID" : "UNPAID")}${month.payment.recorded ? "" : " · NOT SAVED"}</span>
        <span class="page-number">Page ${index + 1} of ${totalPages}</span>
      </div>
    </div>

    <div class="employee-panel">
      <div>
        <span class="eyebrow">WORKFORCE MEMBER</span>
        <h2>${escapeHtml(employeeName)}</h2>
        <p>${escapeHtml(roleLabel(payload.employee.workforceRole))}${payload.employee.departmentName ? ` · ${escapeHtml(payload.employee.departmentName)}` : ""}</p>
      </div>
      <div class="employee-meta">
        <span><small>Employee ID</small><strong>${escapeHtml(payload.employee.employeeCode || "Not assigned")}</strong></span>
        <span><small>Email</small><strong>${escapeHtml(payload.employee.email || "—")}</strong></span>
        <span><small>Organization timezone</small><strong>${escapeHtml(payload.organization.timeZone)}</strong></span>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card highlight"><span>Monthly earnings</span><strong class="summary-amount">${currencySummary}</strong><small>${escapeHtml(paymentLabel(month))}</small></div>
      <div class="summary-card"><span>Worked time</span><strong>${escapeHtml(duration(month.totals.workedMinutes))}</strong><small>${month.totals.daysWorked} days with recorded work</small></div>
      <div class="summary-card"><span>Approved overtime</span><strong>${escapeHtml(duration(month.totals.payableOvertimeMinutes))}</strong><small>Pre-authorized and payable</small></div>
      <div class="summary-card"><span>Paid leave / holiday</span><strong>${escapeHtml(paidTimeLabel)}</strong><small>Credited scheduled time</small></div>
    </div>

    <div class="section-heading">
      <div><span class="eyebrow">PAY RATE HISTORY</span><h3>Rates applied during this month</h3></div>
      <span class="small-note">Effective-dated rates</span>
    </div>
    <table class="rate-table">
      <thead><tr><th>Effective dates</th><th class="numeric">Normal hourly rate</th><th class="numeric">Overtime hourly rate</th><th>Currency</th></tr></thead>
      <tbody>${buildRateRows(month)}</tbody>
    </table>

    <div class="section-heading daily-heading">
      <div><span class="eyebrow">DAILY EARNINGS DETAIL</span><h3>Attendance and earnings by day</h3></div>
      <span class="small-note">${month.days.length} calendar days</span>
    </div>
    <table class="day-table">
      <thead><tr><th>Date</th><th>Day status / shift</th><th class="numeric">Worked</th><th class="numeric">Approved OT</th><th class="numeric">Normal pay</th><th class="numeric">OT pay</th><th class="numeric">Daily total</th></tr></thead>
      <tbody>${buildDayRows(month.days)}</tbody>
    </table>

    <div class="month-footer">
      <div class="footer-total">
        <span>Monthly payable time</span>
        <strong>${escapeHtml(duration(month.totals.payableMinutes))}</strong>
      </div>
      <div class="footer-note">
        ${paymentMeta ? `<p><strong>Payment record:</strong> ${escapeHtml(paymentMeta)}</p>` : ""}
        ${month.currencyMismatch ? `<p class="warning"><strong>Currency note:</strong> Pay rates changed currency during this month. Earnings are shown separately by currency and have not been combined.</p>` : ""}
        ${month.totals.daysWithMissingRates > 0 ? `<p class="warning"><strong>Payroll review:</strong> ${month.totals.daysWithMissingRates} day(s) have payable time without a complete configured rate.</p>` : ""}
        ${month.totals.excessUnapprovedOvertimeMinutes > 0 ? `<p><strong>Overtime excluded:</strong> ${escapeHtml(duration(month.totals.excessUnapprovedOvertimeMinutes))} was recorded beyond approved pre-authorization and is not included in payable overtime.</p>` : ""}
      </div>
    </div>

    <div class="disclaimer">
      <span>Prepared ${escapeHtml(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payload.generatedAt)))}</span>
      <span>${escapeHtml(payload.disclaimer)}</span>
    </div>
  </section>`;
}

export function buildSalarySlipDocument(payload: SalarySlipPayload): string {
  const pages = payload.months.map((month, index) =>
    buildMonthPage(payload, month, index, payload.months.length)
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salary Slip · ${escapeHtml(payload.employee.firstName)} ${escapeHtml(payload.employee.lastName)} · ${escapeHtml(payload.startMonth)} to ${escapeHtml(payload.endMonth)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e9eef5; color: #172338; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 22px; }
  .print-toolbar { max-width: 210mm; margin: 0 auto 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #526176; font-size: 12px; }
  .print-toolbar button { border: 0; border-radius: 8px; padding: 10px 16px; background: #1263d6; color: white; font-weight: 700; cursor: pointer; }
  .month-page { width: 210mm; min-height: 273mm; margin: 0 auto 22px; padding: 10mm; background: white; box-shadow: 0 5px 28px rgba(17,34,58,.12); display: flex; flex-direction: column; page-break-after: always; break-after: page; overflow: hidden; }
  .month-page:last-child { page-break-after: auto; break-after: auto; }
  .brand-row { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 2px solid #1e5fae; }
  .brand-mark { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: #102b4c; color: white; font-size: 14px; font-weight: 800; letter-spacing: .06em; }
  .brand-copy { min-width: 0; flex: 1; }
  .eyebrow { margin: 0 0 4px; color: #3276b8; font-size: 6.5pt; line-height: 1.2; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
  .brand-copy h1 { margin: 0; color: #12233a; font-size: 15px; line-height: 1.2; }
  .brand-copy .muted { margin: 3px 0 0; color: #718096; font-size: 9px; }
  .period-block { display: flex; min-width: 135px; flex-direction: column; align-items: flex-end; }
  .period-block strong { color: #102b4c; font-size: 14px; }
  .payment-status { display: inline-flex; margin-top: 5px; padding: 3px 7px; border-radius: 999px; font-size: 7px; font-weight: 800; letter-spacing: .08em; }
  .payment-status.paid { color: #17613e; background: #e4f5ea; border: 1px solid #b8e3c8; }
  .payment-status.unpaid { color: #9a5417; background: #fff1df; border: 1px solid #f4d4ae; }
  .page-number { margin-top: 4px; color: #7a8799; font-size: 8px; }
  .employee-panel { display: flex; justify-content: space-between; gap: 14px; padding: 12px 14px; margin-top: 11px; border: 1px solid #dce5ef; border-radius: 9px; background: #f7f9fc; }
  .employee-panel h2 { margin: 2px 0 3px; color: #14263e; font-size: 14px; }
  .employee-panel p { margin: 0; color: #627187; font-size: 8px; }
  .employee-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 16px; min-width: 48%; }
  .employee-meta span { display: flex; flex-direction: column; gap: 2px; }
  .employee-meta small { color: #758399; font-size: 6pt; }
  .employee-meta strong { overflow-wrap: anywhere; color: #263850; font-size: 8px; font-weight: 700; }
  .summary-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 7px; margin-top: 9px; }
  .summary-card { min-width: 0; padding: 8px 9px; border: 1px solid #e1e8f0; border-radius: 7px; background: #fff; }
  .summary-card.highlight { border-color: #c8d9ee; background: #f3f7fc; }
  .summary-card span { display: block; color: #718096; font-size: 7px; font-weight: 700; }
  .summary-card strong { display: block; margin-top: 4px; color: #142c49; font-size: 12px; }
  .summary-card .summary-amount { font-size: 10px; line-height: 1.35; overflow-wrap: anywhere; }
  .summary-card small { display: block; margin-top: 3px; color: #8190a2; font-size: 6.5px; line-height: 1.3; }
  .summary-separator { color: #9ba9b9; }
  .section-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin: 12px 0 5px; }
  .section-heading h3 { margin: 0; color: #172c47; font-size: 10px; }
  .small-note { color: #8491a2; font-size: 6.5pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #eff3f8; color: #52647b; font-size: 6.5px; text-transform: uppercase; letter-spacing: .045em; font-weight: 800; text-align: left; }
  th, td { padding: 4px 5px; border-bottom: 1px solid #e8edf3; vertical-align: middle; }
  td { color: #304157; font-size: 7px; }
  .numeric { text-align: right; font-variant-numeric: tabular-nums; }
  .rate-table { table-layout: auto; }
  .rate-table th, .rate-table td { padding-top: 4px; padding-bottom: 4px; }
  .rate-table td { font-size: 7px; }
  .empty-rate { color: #78879a; font-style: italic; }
  .daily-heading { margin-top: 11px; }
  .day-table th:nth-child(1) { width: 13%; }
  .day-table th:nth-child(2) { width: 18%; }
  .day-table th:nth-child(3) { width: 10%; }
  .day-table th:nth-child(4) { width: 11%; }
  .day-table th:nth-child(5) { width: 15%; }
  .day-table th:nth-child(6) { width: 13%; }
  .day-table th:nth-child(7) { width: 20%; }
  .day-table th, .day-table td { padding: 3px 4px; }
  .day-table td { font-size: 7pt; line-height: 1.1; }
  .day-table th { font-size: 6pt; }
  .date-cell strong, .date-cell .sub-note { display: block; }
  .date-cell strong { color: #263b56; font-size: 6.5pt; }
  .sub-note { display: block; margin-top: 2px; color: #738197; font-size: 5.8pt; line-height: 1.1; }
  .status-pill { display: inline-block; padding: 2px 4px; border-radius: 4px; font-size: 5.8pt; font-weight: 700; white-space: nowrap; }
  .status-worked { color: #17613e; background: #e6f5ec; }
  .status-paid { color: #24548b; background: #e7f0fb; }
  .status-review { color: #9a5a12; background: #fff1d9; }
  .status-muted { color: #64748b; background: #f0f3f7; }
  .amount-cell { color: #183c68; font-weight: 800; }
  .month-footer { display: flex; justify-content: space-between; gap: 16px; margin-top: auto; padding-top: 10px; }
  .footer-total { min-width: 115px; padding: 8px 10px; border-radius: 7px; background: #102b4c; color: #fff; }
  .footer-total span { display: block; color: #c2d5e9; font-size: 7px; }
  .footer-total strong { display: block; margin-top: 3px; font-size: 12px; }
  .footer-note { flex: 1; color: #68788d; font-size: 6pt; line-height: 1.3; }
  .footer-note p { margin: 0 0 3px; }
  .footer-note .warning { color: #985b12; }
  .disclaimer { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #e8edf3; color: #95a0af; font-size: 5.5pt; line-height: 1.3; }
  .disclaimer span:first-child { min-width: 100px; }
  .disclaimer span:last-child { text-align: right; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    html, body { width: 210mm; margin: 0; padding: 0; background: white; }
    .print-toolbar { display: none !important; }
    .month-page { width: 210mm; height: 297mm; min-height: 297mm; margin: 0; padding: 10mm; box-shadow: none; overflow: hidden; }
  }
  @media screen and (max-width: 850px) {
    body { padding: 10px; }
    .month-page { width: 100%; min-height: 0; padding: 18px; overflow: visible; }
    .employee-panel { flex-direction: column; }
    .employee-meta { min-width: 0; }
    .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .day-table { min-width: 650px; }
    .month-page { overflow-x: auto; }
  }
</style>
</head>
<body>
<div class="print-toolbar">
  <span>Print-ready salary statement · One A4 page per month · Use “Save as PDF” in the print destination</span>
  <button type="button" id="salary-slip-print">Print / Save as PDF</button>
</div>
${pages}
</body>
</html>`;
}
