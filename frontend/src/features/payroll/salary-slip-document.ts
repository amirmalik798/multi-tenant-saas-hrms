export type SalarySlipDay = {
  workDate: string;
  scheduleName?: string | null;
  dayStatus: string;
  workedMinutes: number;
  regularWorkedMinutes?: number;
  potentialOvertimeMinutes?: number;
  payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes?: number;
  paidLeaveMinutes?: number;
  paidHolidayMinutes?: number;
  payableRegularMinutes?: number;
  payableMinutes: number;
  hourlyRate?: number | null;
  overtimeRate?: number | null;
  currencyCode?: string | null;
  regularPay?: number | null;
  overtimePay?: number | null;
  estimatedPay?: number | null;
  paymentStatus?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
};

export type SalarySlipMonth = {
  month: string;
  totals: {
    workedMinutes: number;
    regularWorkedMinutes?: number;
    payableOvertimeMinutes: number;
    potentialOvertimeMinutes?: number;
    excessUnapprovedOvertimeMinutes?: number;
    paidLeaveMinutes?: number;
    paidHolidayMinutes?: number;
    payableMinutes: number;
    daysWorked: number;
    daysWithMissingRates: number;
  };
  totalsByCurrency: Array<{ currencyCode: string | null; amount: number | null; incomplete: boolean }>;
  currencyMismatch: boolean;
  ratePeriods: Array<{ fromDate: string; toDate: string; hourlyRate: number | null; overtimeRate: number | null; currencyCode: string | null }>;
  payment: { status: string; recorded: boolean; paidAt: string | null; reference: string | null };
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
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function dateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
function duration(minutes: number | null | undefined): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(Number(minutes))) : 0;
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}
function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "Rate not configured";
  if (!currency) return amount.toFixed(2);
  try { return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}
function amountSummary(month: SalarySlipMonth): string {
  if (!month.totalsByCurrency?.length) return "No payable earnings recorded";
  return month.totalsByCurrency.map((entry) => `${escapeHtml(entry.currencyCode || "Currency unavailable")}: ${escapeHtml(entry.incomplete ? "Incomplete — rate required" : money(entry.amount, entry.currencyCode))}`).join(" · ");
}
function rateRows(month: SalarySlipMonth): string {
  if (!month.ratePeriods?.length) return '<tr><td colspan="4" class="empty">No effective pay rate was configured during this month.</td></tr>';
  return month.ratePeriods.map((period) => `<tr><td>${escapeHtml(period.fromDate === period.toDate ? dateLabel(period.fromDate) : `${dateLabel(period.fromDate)} – ${dateLabel(period.toDate)}`)}</td><td>${escapeHtml(period.hourlyRate === null ? "Not configured" : `${money(period.hourlyRate, period.currencyCode)} / hr`)}</td><td>${escapeHtml(period.overtimeRate === null ? "Not configured" : `${money(period.overtimeRate, period.currencyCode)} / hr`)}</td><td>${escapeHtml(period.currencyCode || "—")}</td></tr>`).join("");
}
function dayRows(days: SalarySlipDay[]): string {
  return (days || []).map((day) => {
    const estimated = day.estimatedPay === null || day.estimatedPay === undefined ? "Rate required" : day.payableMinutes > 0 ? money(day.estimatedPay, day.currencyCode) : "—";
    const stateClass = day.dayStatus === "WORKED" ? "worked" : ["PAID_LEAVE", "PAID_HOLIDAY"].includes(day.dayStatus) ? "paid" : ["REVIEW_REQUIRED", "IN_PROGRESS"].includes(day.dayStatus) ? "review" : "muted";
    const overrun = Number(day.excessUnapprovedOvertimeMinutes || 0) > 0 ? `<small class="subnote">${escapeHtml(duration(day.excessUnapprovedOvertimeMinutes))} unapproved</small>` : "";
    return `<tr><td><strong>${escapeHtml(dateLabel(day.workDate))}</strong><small class="subnote">${escapeHtml(day.scheduleName || "—")}</small></td><td><span class="pill ${stateClass}">${escapeHtml(String(day.dayStatus || "Unknown").replaceAll("_", " "))}</span></td><td class="num">${escapeHtml(duration(day.workedMinutes))}</td><td class="num">${escapeHtml(duration(day.payableOvertimeMinutes))}${overrun}</td><td class="num">${escapeHtml(day.payableRegularMinutes && day.payableRegularMinutes > 0 ? money(day.regularPay, day.currencyCode) : "—")}</td><td class="num">${escapeHtml(day.payableOvertimeMinutes > 0 ? money(day.overtimePay, day.currencyCode) : "—")}</td><td class="num total">${escapeHtml(estimated)}</td></tr>`;
  }).join("");
}
function monthPage(payload: SalarySlipPayload, month: SalarySlipMonth, index: number, count: number): string {
  const employeeName = [payload.employee.firstName, payload.employee.lastName].filter(Boolean).join(" ") || "Workforce member";
  const paidTime = Number(month.totals.paidLeaveMinutes || 0) + Number(month.totals.paidHolidayMinutes || 0);
  const paid = month.payment.status === "PAID";
  const paymentMeta = [month.payment.paidAt ? `Paid ${dateLabel(month.payment.paidAt.slice(0, 10))}` : "", month.payment.reference ? `Reference: ${month.payment.reference}` : ""].filter(Boolean).join(" · ");
  return `<section class="month-page"><header class="brand"><div class="brand-mark">HR</div><div class="brand-title"><span>WORKFORCE PAYROLL STATEMENT</span><h1>${escapeHtml(payload.organization.name)}</h1><p>Official monthly salary slip</p></div><div class="period"><span>PAY PERIOD</span><strong>${escapeHtml(monthLabel(month.month))}</strong><b class="${paid ? "pill-paid" : "pill-unpaid"}">${paid ? "PAID" : "UNPAID"}</b><small>Month ${index + 1} of ${count}</small></div></header>
  <section class="employee"><div><span>WORKFORCE MEMBER</span><h2>${escapeHtml(employeeName)}</h2><p>${escapeHtml(String(payload.employee.workforceRole || "Workforce member").replaceAll("_", " "))}${payload.employee.departmentName ? ` · ${escapeHtml(payload.employee.departmentName)}` : ""}</p></div><dl><div><dt>Employee ID</dt><dd>${escapeHtml(payload.employee.employeeCode || "Not assigned")}</dd></div><div><dt>Email</dt><dd>${escapeHtml(payload.employee.email || "—")}</dd></div><div><dt>Employment status</dt><dd>${escapeHtml(payload.employee.employmentStatus || "—")}</dd></div><div><dt>Organization time zone</dt><dd>${escapeHtml(payload.organization.timeZone || "—")}</dd></div></dl></section>
  <section class="summary"><div class="highlight"><span>Monthly earnings</span><strong>${amountSummary(month)}</strong><small>Payment status · ${paid ? "PAID" : "UNPAID"}</small></div><div><span>Worked time</span><strong>${escapeHtml(duration(month.totals.workedMinutes))}</strong><small>${Number(month.totals.daysWorked || 0)} days with recorded work</small></div><div><span>Approved overtime</span><strong>${escapeHtml(duration(month.totals.payableOvertimeMinutes))}</strong><small>Pre-authorized and payable</small></div><div><span>Paid leave / holiday</span><strong>${escapeHtml(duration(paidTime))}</strong><small>Credited scheduled time</small></div></section>
  <div class="section-head"><div><span>PAY RATE HISTORY</span><h3>Rates applied during this month</h3></div><small>Effective-dated rates</small></div><table class="rates"><thead><tr><th>Effective dates</th><th>Normal hourly rate</th><th>Overtime hourly rate</th><th>Currency</th></tr></thead><tbody>${rateRows(month)}</tbody></table>
  <div class="section-head"><div><span>DAILY EARNINGS DETAIL</span><h3>Attendance and earnings by day</h3></div><small>${month.days?.length || 0} calendar days</small></div><table class="days"><thead><tr><th>Date / shift</th><th>Day status</th><th class="num">Worked</th><th class="num">Approved OT</th><th class="num">Normal pay</th><th class="num">OT pay</th><th class="num">Daily total</th></tr></thead><tbody>${dayRows(month.days || [])}</tbody></table>
  <footer class="month-footer"><div><span>Monthly payable time</span><strong>${escapeHtml(duration(month.totals.payableMinutes))}</strong></div><p>${paymentMeta ? `<strong>Payment record:</strong> ${escapeHtml(paymentMeta)}<br>` : ""}${month.currencyMismatch ? "Currency changed during this month; earnings are shown separately and have not been combined.<br>" : ""}${month.totals.daysWithMissingRates > 0 ? `${month.totals.daysWithMissingRates} day(s) have payable time without a complete configured rate.<br>` : ""}${Number(month.totals.excessUnapprovedOvertimeMinutes || 0) > 0 ? `${escapeHtml(duration(month.totals.excessUnapprovedOvertimeMinutes))} beyond approved overtime was excluded from payable overtime.` : ""}</p></footer>
  <div class="disclaimer"><span>Prepared ${escapeHtml(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payload.generatedAt)))}</span><span>${escapeHtml(payload.disclaimer)}</span></div></section>`;
}

export function buildSalarySlipDocument(input: SalarySlipPayload | SalarySlipPayload[]): string {
  const payloads = Array.isArray(input) ? input : [input];
  if (!payloads.length) throw new Error("At least one salary slip is required.");
  const first = payloads[0];
  const months = first.months.map((item) => item.month).join("|");
  if (payloads.some((payload) => payload.startMonth !== first.startMonth || payload.endMonth !== first.endMonth || payload.organization.name !== first.organization.name || payload.organization.timeZone !== first.organization.timeZone || payload.months.map((item) => item.month).join("|") !== months)) {
    throw new Error("All salary slips in a combined document must use the same organization and month range.");
  }
  const pages = payloads.map((payload) => payload.months.map((month, index) => monthPage(payload, month, index, payload.months.length)).join("\n")).join("\n");
  const subject = payloads.length === 1 ? [first.employee.firstName, first.employee.lastName].filter(Boolean).join(" ") || "Workforce member" : `${payloads.length} workforce members`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salary slips · ${escapeHtml(subject)} · ${escapeHtml(first.startMonth)} to ${escapeHtml(first.endMonth)}</title><style>
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#e9eef5;color:#172338;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{padding:20px}.toolbar{max-width:210mm;margin:0 auto 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#526176;font-size:12px}.toolbar button{border:0;border-radius:8px;padding:10px 16px;background:#1263d6;color:white;font-weight:700;cursor:pointer}.month-page{width:210mm;min-height:273mm;margin:0 auto 20px;padding:10mm;background:white;box-shadow:0 5px 28px rgba(17,34,58,.12)}.month-page+.month-page{page-break-before:always;break-before:page}.brand{display:flex;align-items:center;gap:12px;padding-bottom:12px;border-bottom:2px solid #1e5fae}.brand-mark{width:42px;height:42px;display:grid;place-items:center;border-radius:11px;background:#102b4c;color:white;font-weight:800}.brand-title{min-width:0;flex:1}.brand-title>span,.period>span,.employee>div>span,.section-head span{color:#3276b8;font-size:7px;font-weight:800;letter-spacing:.15em}.brand-title h1{margin:3px 0;color:#12233a;font-size:16px}.brand-title p{margin:0;color:#718096;font-size:9px}.period{text-align:right;display:flex;flex-direction:column;align-items:flex-end}.period strong{color:#102b4c;font-size:14px}.period small{margin-top:4px;color:#7a8799;font-size:8px}.pill-paid,.pill-unpaid{margin-top:5px;padding:3px 8px;border-radius:999px;font-size:7px}.pill-paid{background:#e4f5ea;color:#17613e}.pill-unpaid{background:#fff1df;color:#9a5417}.employee{display:flex;justify-content:space-between;gap:15px;margin-top:12px;padding:12px;border:1px solid #dce5ef;border-radius:9px;background:#f7f9fc}.employee h2{margin:3px 0;color:#14263e;font-size:14px}.employee p{margin:0;color:#627187;font-size:8px}.employee dl{display:grid;grid-template-columns:1fr 1fr;gap:7px 16px;min-width:48%;margin:0}.employee dt{color:#758399;font-size:7px}.employee dd{margin:2px 0 0;color:#263850;font-size:8px;font-weight:700;overflow-wrap:anywhere}.summary{display:grid;grid-template-columns:1.45fr 1fr 1fr 1fr;gap:7px;margin-top:9px}.summary>div{padding:8px;border:1px solid #e1e8f0;border-radius:7px}.summary .highlight{background:#f3f7fc;border-color:#c8d9ee}.summary span{display:block;color:#718096;font-size:7px;font-weight:700}.summary strong{display:block;margin-top:4px;color:#142c49;font-size:11px;overflow-wrap:anywhere}.summary small{display:block;margin-top:3px;color:#8190a2;font-size:6px}.section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin:12px 0 5px}.section-head h3{margin:2px 0 0;color:#172c47;font-size:10px}.section-head small{color:#8491a2;font-size:7px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#eff3f8;color:#52647b;font-size:6px;text-transform:uppercase;letter-spacing:.04em;text-align:left}th,td{padding:5px;border-bottom:1px solid #e8edf3;vertical-align:top}td{color:#304157;font-size:7px}td strong{font-size:7px}.num{text-align:right;font-variant-numeric:tabular-nums}.subnote{display:block;margin-top:2px;color:#738197;font-size:6px}.pill{display:inline-block;padding:3px 5px;border-radius:4px;font-size:6px;font-weight:700}.worked{color:#17613e;background:#e6f5ec}.paid{color:#24548b;background:#e7f0fb}.review{color:#9a5a12;background:#fff1d9}.muted{color:#64748b;background:#f0f3f7}.total{color:#183c68;font-weight:800}.empty{color:#78879a;font-style:italic}.month-footer{display:flex;justify-content:space-between;gap:15px;margin-top:12px;padding-top:10px}.month-footer>div{min-width:125px;padding:9px;border-radius:7px;background:#102b4c;color:white}.month-footer span{display:block;color:#c2d5e9;font-size:7px}.month-footer strong{display:block;margin-top:3px;font-size:12px}.month-footer p{flex:1;margin:0;color:#68788d;font-size:7px;line-height:1.5}.disclaimer{display:flex;justify-content:space-between;gap:12px;margin-top:9px;padding-top:6px;border-top:1px solid #e8edf3;color:#95a0af;font-size:6px;line-height:1.35}.disclaimer span:last-child{text-align:right}@page{size:A4 portrait;margin:0}@media print{html,body{width:210mm;margin:0;padding:0;background:white}.toolbar{display:none!important}.month-page{width:210mm;min-height:297mm;margin:0;box-shadow:none}}@media screen and (max-width:850px){body{padding:8px}.month-page{width:100%;min-height:0;padding:16px}.employee{flex-direction:column}.employee dl{min-width:0}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.days{min-width:650px}.month-page{overflow-x:auto}}
  </style></head><body><div class="toolbar"><span>${payloads.length === 1 ? "Individual salary statement" : "Combined workforce salary slips"} · ${payloads.length} member(s) · ${escapeHtml(first.startMonth)} to ${escapeHtml(first.endMonth)}</span><button id="salary-slip-print" onclick="window.print()">Print / Save as PDF</button></div>${pages}</body></html>`;
}
