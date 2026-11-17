export type PayrollRegisterDocumentRow = {
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  workforceRole: string;
  workedMinutes: number;
  payableMinutes: number;
  status: string;
  amount: string | number | null;
  currencyCode: string;
  paidAt: string | null;
  paymentReference: string;
  recordedBy: string;
  notes: string;
};

export type PayrollRegisterDocumentInput = {
  month: string;
  generatedAt: string;
  timeZone: string;
  audienceLabel: string;
  rows: PayrollRegisterDocumentRow[];
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
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dateTimeLabel(value: string | null, timeZone: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "UTC",
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
}

function duration(value: number): string {
  const minutes = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function amountLabel(value: string | number | null, currency: string): string {
  if (value === null || value === "") return "Not recorded";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "RWF",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${currency || "RWF"} ${number.toFixed(2)}`;
  }
}

function statusLabel(value: string): string {
  switch (value) {
    case "PAID": return "Paid";
    case "UNPAID": return "Unpaid";
    case "NO_RECORDED_HOURS": return "No hours";
    case "RATE_REQUIRED": return "Rate required";
    case "CURRENCY_MISMATCH": return "Currency mismatch";
    default: return value.replaceAll("_", " ").toLowerCase();
  }
}

function statusClass(value: string): string {
  if (value === "PAID") return "paid";
  if (value === "UNPAID") return "unpaid";
  if (value === "RATE_REQUIRED" || value === "CURRENCY_MISMATCH") return "review";
  return "neutral";
}

export function buildPayrollRegisterDocument(input: PayrollRegisterDocumentInput): string {
  const rows = input.rows ?? [];
  const paidCount = rows.filter((row) => row.status === "PAID").length;
  const unpaidCount = rows.filter((row) => row.status === "UNPAID").length;
  const reviewCount = rows.filter((row) => row.status === "RATE_REQUIRED" || row.status === "CURRENCY_MISMATCH").length;
  const noHoursCount = rows.filter((row) => row.status === "NO_RECORDED_HOURS").length;
  const amounts = new Map<string, { paid: number; due: number; total: number }>();

  for (const row of rows) {
    const currency = (row.currencyCode || "RWF").toUpperCase();
    const summary = amounts.get(currency) ?? { paid: 0, due: 0, total: 0 };
    const value = Number(row.amount ?? 0);
    if (Number.isFinite(value)) {
      if (row.status === "PAID") summary.paid += value;
      else if (row.status === "UNPAID") summary.due += value;
      if (row.status === "PAID" || row.status === "UNPAID") summary.total += value;
    }
    amounts.set(currency, summary);
  }

  const financialSummary = [...amounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => {
    const format = (amount: number) => amountLabel(amount, currency);
    return `<div class="currency-card">
      <div class="currency">${escapeHtml(currency)}</div>
      <div class="amounts">
        <span><small>Total</small><strong>${escapeHtml(format(value.total))}</strong></span>
        <span><small>Paid</small><strong class="paid-text">${escapeHtml(format(value.paid))}</strong></span>
        <span><small>Outstanding</small><strong class="due-text">${escapeHtml(format(value.due))}</strong></span>
      </div>
    </div>`;
  }).join("");

  const bodyRows = rows.map((row) => `<tr>
    <td class="employee"><strong>${escapeHtml(row.employeeName || "Workforce member")}</strong><small>${escapeHtml(row.employeeCode || "No employee ID")}</small></td>
    <td>${escapeHtml(row.departmentName || "—")}</td>
    <td>${escapeHtml((row.workforceRole || "—").replaceAll("_", " "))}</td>
    <td class="numeric">${escapeHtml(duration(row.workedMinutes))}</td>
    <td class="numeric">${escapeHtml(duration(row.payableMinutes))}</td>
    <td><span class="status ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span></td>
    <td class="numeric amount">${escapeHtml(amountLabel(row.amount, row.currencyCode))}</td>
    <td>${escapeHtml(dateTimeLabel(row.paidAt, input.timeZone))}</td>
    <td class="wrap">${escapeHtml(row.paymentReference || "—")}</td>
    <td>${escapeHtml(row.recordedBy || "—")}</td>
    <td class="wrap">${escapeHtml(row.notes || "—")}</td>
  </tr>`).join("");

  const generatedLabel = dateTimeLabel(input.generatedAt, input.timeZone);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payroll register — ${escapeHtml(monthLabel(input.month))}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #182437; background: #fff; font: 10px/1.45 Arial, Helvetica, sans-serif; }
  .toolbar { display: flex; justify-content: flex-end; padding: 10px 0 12px; }
  .toolbar button { border: 0; border-radius: 7px; background: #1d4ed8; color: #fff; padding: 9px 14px; font-weight: 700; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding: 0 0 12px; border-bottom: 2px solid #1e3a5f; }
  .eyebrow { margin: 0 0 4px; color: #53708f; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
  h1 { margin: 0; color: #13243b; font-size: 22px; letter-spacing: -.35px; }
  .period { min-width: 180px; text-align: right; }
  .period strong { display: block; font-size: 14px; color: #1e3a5f; }
  .meta { margin-top: 4px; color: #64748b; font-size: 8px; }
  .scope { margin-top: 10px; color: #536579; font-size: 9px; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
  .metric { border: 1px solid #dbe4ee; border-radius: 7px; padding: 8px 10px; background: #f8fafc; }
  .metric span { display: block; color: #64748b; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
  .metric strong { display: block; margin-top: 2px; color: #17263b; font-size: 16px; }
  .financial { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin: 0 0 12px; }
  .currency-card { border: 1px solid #dbe4ee; border-radius: 7px; padding: 8px 10px; }
  .currency { color: #31557d; font-size: 9px; font-weight: 700; letter-spacing: .8px; }
  .amounts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; }
  .amounts small { display: block; color: #64748b; font-size: 8px; }
  .amounts strong { display: block; margin-top: 2px; font-size: 9px; }
  .paid-text { color: #047857; } .due-text { color: #b45309; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { padding: 7px 5px; background: #eaf0f6; border-bottom: 1px solid #cbd5e1; color: #40546b; text-align: left; font-size: 7px; text-transform: uppercase; letter-spacing: .45px; }
  td { padding: 6px 5px; border-bottom: 1px solid #e4eaf0; vertical-align: top; color: #344256; font-size: 7.5px; overflow-wrap: anywhere; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .employee strong { display: block; color: #15263d; font-size: 8px; }
  .employee small { display: block; margin-top: 2px; color: #64748b; font-size: 7px; }
  .numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .amount { font-weight: 700; color: #142a45; }
  .status { display: inline-block; padding: 3px 5px; border: 1px solid; border-radius: 99px; font-size: 6.5px; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
  .paid { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
  .unpaid { color: #a16207; background: #fffbeb; border-color: #fde68a; }
  .review { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
  .neutral { color: #475569; background: #f1f5f9; border-color: #cbd5e1; }
  .empty { padding: 26px; text-align: center; color: #64748b; }
  footer { margin-top: 10px; padding-top: 7px; border-top: 1px solid #dbe4ee; color: #64748b; font-size: 7px; }
  @media print { .toolbar { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="toolbar"><button id="payroll-register-print" type="button">Print / Save as PDF</button></div>
  <header>
    <div>
      <p class="eyebrow">Payroll · Salary payments</p>
      <h1>Payroll register</h1>
      <p class="scope">${escapeHtml(input.audienceLabel)} · Organization timezone: ${escapeHtml(input.timeZone || "Not configured")}</p>
    </div>
    <div class="period">
      <p class="eyebrow">Payroll period</p>
      <strong>${escapeHtml(monthLabel(input.month))}</strong>
      <p class="meta">Generated ${escapeHtml(generatedLabel)}</p>
    </div>
  </header>
  <section class="metrics" aria-label="Payroll status summary">
    <div class="metric"><span>Workforce in register</span><strong>${rows.length}</strong></div>
    <div class="metric"><span>Paid</span><strong>${paidCount}</strong></div>
    <div class="metric"><span>Outstanding</span><strong>${unpaidCount}</strong></div>
    <div class="metric"><span>Needs review / no hours</span><strong>${reviewCount + noHoursCount}</strong></div>
  </section>
  ${financialSummary ? `<section class="financial" aria-label="Payroll financial summary">${financialSummary}</section>` : ""}
  <table>
    <colgroup>
      <col style="width:15%"><col style="width:10%"><col style="width:8%">
      <col style="width:6%"><col style="width:6%"><col style="width:8%">
      <col style="width:9%"><col style="width:9%"><col style="width:9%">
      <col style="width:7%"><col style="width:13%">
    </colgroup>
    <thead><tr>
      <th>Workforce member</th><th>Department</th><th>Role</th>
      <th class="numeric">Worked</th><th class="numeric">Payable</th><th>Status</th>
      <th class="numeric">Amount</th><th>Paid at</th><th>Reference</th><th>Recorded by</th><th>Notes</th>
    </tr></thead>
    <tbody>${bodyRows || `<tr><td colspan="11" class="empty">No payroll entries match the selected filters.</td></tr>`}</tbody>
  </table>
  <footer>Confidential payroll record. Amounts are calculated from the payroll register for the selected month. This document reflects the currently filtered register view.</footer>
</body>
</html>`;
}
