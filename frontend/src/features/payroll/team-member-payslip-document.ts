export interface DepartmentManagerPayslipMonth {
  month: string;
  hasPayrollRecord: boolean;
  workedMinutes: number;
  payableMinutes: number;
  calculatedAmount: number | null;
  recordedAmount: number | null;
  paymentStatus: string;
  paidAt: string | null;
  reference: string | null;
}

export interface DepartmentManagerPayslipDocumentInput {
  organizationName: string;
  employee: { name: string; employeeCode: string; departmentName: string };
  currencyCode: string;
  timeZone: string;
  startMonth: string;
  endMonth: string;
  generatedAt: string;
  months: DepartmentManagerPayslipMonth[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function duration(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}
function money(value: number | null, currencyCode: string): string {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}
function dateLabel(value: string | null, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone }).format(date); }
  catch { return "—"; }
}

export function buildDepartmentManagerPayslipDocument(input: DepartmentManagerPayslipDocumentInput): string {
  if (!input.months.length || input.months.length > 24) throw new Error("A team member statement must contain between 1 and 24 months.");
  const totalWorked = input.months.reduce((sum, item) => sum + item.workedMinutes, 0);
  const totalPayable = input.months.reduce((sum, item) => sum + item.payableMinutes, 0);
  const estimatedTotal = input.months.reduce((sum, item) => sum + (item.calculatedAmount ?? 0), 0);
  const paidTotal = input.months.reduce((sum, item) => sum + (item.recordedAmount ?? 0), 0);
  const statementRows = input.months.map((item) => {
    const pay = item.hasPayrollRecord ? money(item.calculatedAmount, input.currencyCode) : "No payroll record";
    const paid = item.recordedAmount === null ? "—" : money(item.recordedAmount, input.currencyCode);
    const status = item.hasPayrollRecord ? item.paymentStatus.replaceAll("_", " ") : "NO PAYROLL RECORD";
    return `<tr><td><strong>${escapeHtml(monthLabel(item.month))}</strong><small>${escapeHtml(item.month)}</small></td><td class="num">${escapeHtml(duration(item.workedMinutes))}</td><td class="num">${escapeHtml(duration(item.payableMinutes))}</td><td class="num">${escapeHtml(pay)}</td><td><span class="status">${escapeHtml(status)}</span></td><td>${escapeHtml(dateLabel(item.paidAt, input.timeZone))}</td><td>${escapeHtml(item.reference || "—")}</td><td class="num">${escapeHtml(paid)}</td></tr>`;
  }).join("");
  const prepared = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: input.timeZone }).format(new Date(input.generatedAt));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team member payslip · ${escapeHtml(input.employee.name)} · ${escapeHtml(input.startMonth)} to ${escapeHtml(input.endMonth)}</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#eef2f7;color:#17263b;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{padding:22px}.toolbar{max-width:297mm;margin:0 auto 12px;display:flex;justify-content:space-between;gap:12px;color:#617087;font-size:12px}.toolbar button{border:0;border-radius:7px;padding:10px 16px;background:#185fc0;color:white;font-weight:700;cursor:pointer}.sheet{width:297mm;min-height:190mm;margin:0 auto 18px;padding:15mm;background:#fff;box-shadow:0 4px 22px #17263b18}.brand{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #285e9e;padding-bottom:13px}.eyebrow{font-size:8px;letter-spacing:.16em;font-weight:800;color:#3972ad}.brand h1{font-size:22px;margin:5px 0;color:#142944}.period{text-align:right}.period strong{display:block;font-size:16px;color:#1b3c65}.employee{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin:16px 0;padding:14px;background:#f5f8fc;border:1px solid #dce5f0;border-radius:8px}.employee h2{font-size:18px;margin:4px 0}.employee p{margin:3px 0;color:#627187;font-size:11px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:9px}.meta span{display:block;color:#8491a2;font-size:9px}.meta strong{display:block;margin-top:2px;font-size:11px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0}.summary>div{border:1px solid #e0e7ef;border-radius:8px;padding:11px}.summary span{display:block;color:#6f7f92;font-size:9px}.summary strong{display:block;margin-top:5px;font-size:17px;color:#183b64}.section-title{margin:18px 0 8px;font-size:12px;color:#1a3556}table{width:100%;border-collapse:collapse;table-layout:fixed}th{padding:9px 7px;text-align:left;background:#edf2f8;color:#586b82;font-size:8px;text-transform:uppercase}td{padding:9px 7px;border-bottom:1px solid #e3e9f1;font-size:9px;overflow-wrap:anywhere}td small{display:block;margin-top:3px;color:#8491a2;font-size:8px}.num{text-align:right;font-variant-numeric:tabular-nums}.status{display:inline-block;padding:4px 6px;border-radius:12px;background:#edf2f8;color:#395a7e;font-size:8px;font-weight:700}.foot{margin-top:16px;padding-top:12px;border-top:1px solid #e4eaf1;display:flex;justify-content:space-between;color:#68788d;font-size:9px}.disclaimer{margin-top:14px;padding:10px;border-radius:7px;background:#f5f8fc;color:#64758b;font-size:9px;line-height:1.5}@page{size:A4 landscape;margin:0}@media print{html,body{width:297mm;margin:0;padding:0;background:white}.toolbar{display:none}.sheet{width:297mm;min-height:210mm;margin:0;box-shadow:none}}@media screen and (max-width:950px){body{padding:8px}.sheet{width:100%;min-height:0;padding:18px;overflow-x:auto}.employee{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}table{min-width:900px}}
    </style></head><body><div class="toolbar"><span>Manager-scoped monthly salary statement · ${input.months.length} monthly record(s) · ${escapeHtml(input.startMonth)} to ${escapeHtml(input.endMonth)}</span><button onclick="window.print()">Print / Save as PDF</button></div><main class="sheet"><header class="brand"><div><span class="eyebrow">WORKFORCE PAYROLL STATEMENT</span><h1>${escapeHtml(input.organizationName)}</h1><span>Multi-month team member salary statement</span></div><div class="period"><span class="eyebrow">SELECTED PERIOD</span><strong>${escapeHtml(monthLabel(input.startMonth))} – ${escapeHtml(monthLabel(input.endMonth))}</strong><p>Currency: ${escapeHtml(input.currencyCode)}</p></div></header><section class="employee"><div><span class="eyebrow">WORKFORCE MEMBER</span><h2>${escapeHtml(input.employee.name)}</h2><p>${escapeHtml(input.employee.departmentName)}</p></div><div class="meta"><div><span>Employee code</span><strong>${escapeHtml(input.employee.employeeCode)}</strong></div><div><span>Statement months</span><strong>${input.months.length}</strong></div></div></section><section class="summary"><div><span>Total worked time</span><strong>${escapeHtml(duration(totalWorked))}</strong></div><div><span>Total payable time</span><strong>${escapeHtml(duration(totalPayable))}</strong></div><div><span>Total calculated pay</span><strong>${escapeHtml(money(estimatedTotal, input.currencyCode))}</strong></div><div><span>Total recorded paid</span><strong>${escapeHtml(money(paidTotal, input.currencyCode))}</strong></div></section><h3 class="section-title">Monthly payroll and payment status</h3><table><thead><tr><th style="width:13%">Pay month</th><th style="width:11%" class="num">Worked</th><th style="width:11%" class="num">Payable</th><th style="width:14%" class="num">Calculated pay</th><th style="width:15%">Status</th><th style="width:11%">Paid date</th><th style="width:15%">Payment reference</th><th style="width:14%" class="num">Recorded paid</th></tr></thead><tbody>${statementRows}</tbody></table><footer class="foot"><span>Prepared ${escapeHtml(prepared)}</span><span>Source: backend-calculated payroll summaries for your authorized department scope.</span></footer><div class="disclaimer">This statement is read-only. It does not create payroll records, approve compensation, mark payments as paid, or initiate money transfers. Months without a payroll row are shown as “No payroll record”. Detailed daily attendance and rate history remain available to HR Managers and Organization Admins.</div></main></body></html>`;
}
