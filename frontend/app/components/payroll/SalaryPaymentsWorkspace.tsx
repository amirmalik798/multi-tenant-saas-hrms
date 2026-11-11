"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeDollarSign, CheckCircle2, RefreshCw, Search, SlidersHorizontal, CalendarDays, Clock3, AlertTriangle, CheckCircle, CircleDollarSign } from "lucide-react";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Payment = { id?: string | null; employeeId: string; employeeCode?: string | null; firstName?: string | null; lastName?: string | null; departmentName?: string | null; payMonth: string; amount: string | number | null; calculatedAmount?: string | number | null; workedMinutes?: number; payableMinutes?: number; paidLeaveMinutes?: number; paidHolidayMinutes?: number; currencyCode: string; status: "PAID" | "UNPAID" | "NO_RECORDED_HOURS" | "RATE_REQUIRED" | "CURRENCY_MISMATCH"; currencyMismatch?: boolean; paidAt?: string | null; paymentReference?: string | null; notes?: string | null };
type EmployeeRoleRecord = { id?: string; workforce_role?: unknown; workforceRole?: unknown; roleName?: unknown; role_name?: unknown; role?: unknown; userRole?: unknown; user_role?: unknown; user?: { role?: unknown } };
type Props = { audience: "hr-manager" | "department-manager" | "employee"; employeeId?: string; excludeEmployeeId?: string };
const INPUT = "mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400";
const BUTTON = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50";
function monthNow() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function money(value: string | number | null, currency: string) { if (value === null || value === "") return "Not recorded"; const n = Number(value); if (!Number.isFinite(n)) return "—"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } }
function isExcludedHrTarget(employee: EmployeeRoleRecord) {
  const normalize = (value: unknown): string[] => {
    if (typeof value === "string") return [value.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_")];
    if (value && typeof value === "object") {
      const role = value as { name?: unknown; title?: unknown; slug?: unknown };
      return [role.name, role.title, role.slug].filter((item): item is string => typeof item === "string").map((item) => item.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_"));
    }
    return [];
  };
  const roles = [
    ...normalize(employee.workforce_role), ...normalize(employee.workforceRole),
    ...normalize(employee.roleName), ...normalize(employee.role_name),
    ...normalize(employee.role), ...normalize(employee.userRole),
    ...normalize(employee.user_role), ...normalize(employee.user?.role),
  ];
  return roles.some((role) => ["ORGANIZATION_ADMIN", "ORG_ADMIN", "ORGANIZATIONADMIN", "ORGANIZATION_ADMINISTRATOR", "ORGANIZATION_OWNER", "ORG_OWNER", "TENANT_ADMIN", "ADMINISTRATOR", "HR_MANAGER", "HRMANAGER"].includes(role) || role.startsWith("ORGANIZATION_ADMIN_") || role.startsWith("ORGANIZATIONADMIN_") || role.startsWith("ORG_ADMIN_") || role.startsWith("ORGANIZATION_OWNER_") || role.startsWith("ORG_OWNER_") || role.startsWith("TENANT_ADMIN_") || role.startsWith("HR_MANAGER_") || role.startsWith("HRMANAGER_"));
}
async function loadEligibleEmployeeIds() {
  const fetchPage = async (page: number) => {
    const response = await fetch(`/api/backend/employees?page=${page}&limit=100&sortBy=name&sortOrder=asc`, { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Unable to verify employee roles (${response.status})`);
    if (!Array.isArray(payload?.employees)) throw new Error("Unable to verify employee roles: the employee list response was invalid.");
    return { rows: payload.employees as EmployeeRoleRecord[], totalPages: Math.max(1, Number(payload?.pagination?.totalPages) || 1) };
  };
  const first = await fetchPage(1);
  const allRows = [...first.rows];
  if (first.totalPages > 10001) throw new Error("The employee list is too large to verify safely. Contact your administrator.");
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await fetchPage(page);
    allRows.push(...result.rows);
  }
  return new Set(allRows.filter((employee) => typeof employee.id === "string" && !isExcludedHrTarget(employee)).map((employee) => employee.id as string));
}

export default function SalaryPaymentsWorkspace({ audience, employeeId, excludeEmployeeId }: Props) {
  const canEdit = audience === "hr-manager";
  const [month, setMonth] = useState(monthNow);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "UNPAID" | "PAID" | "REVIEW" | "NO_HOURS">("ALL");
  const [nameSortOrder, setNameSortOrder] = useState<"asc" | "desc">("asc");
  const [drafts, setDrafts] = useState<Record<string, { amount: string; currencyCode: string; status: "PAID" | "UNPAID"; paymentReference: string; notes: string }>>({});
  const loadRequestId = useRef(0);
  const load = useCallback(async (silent = false) => {
    const requestId = ++loadRequestId.current;
    if (!silent) setLoading(true); setError("");
    try {
      const paymentRequest = fetch(`/api/backend/payroll/payments?month=${encodeURIComponent(month)}`, { credentials: "same-origin", cache: "no-store" });
      const eligibleIdsRequest = canEdit ? loadEligibleEmployeeIds() : Promise.resolve(null);
      const [response, eligibleIds] = await Promise.all([paymentRequest, eligibleIdsRequest]);
      const payload = await response.json().catch(() => null);
      if (requestId !== loadRequestId.current) return;
      if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
      const responseRows = Array.isArray(payload?.payments) ? payload.payments as Payment[] : [];
      // HR Manager payroll views must never include Organization Admin or HR Manager records.
      // Verify roles against the tenant-scoped employee API before displaying or editing payments.
      const eligibleRows = eligibleIds ? responseRows.filter((payment) => eligibleIds.has(payment.employeeId)) : responseRows;
      // Department Managers may view team payroll on the team page, but their
      // personal earnings page must show only their own payment record.
      const rows = audience === "employee" && employeeId
        ? eligibleRows.filter((payment) => payment.employeeId === employeeId)
        : audience === "department-manager" && excludeEmployeeId
          ? eligibleRows.filter((payment) => payment.employeeId !== excludeEmployeeId)
          : eligibleRows;
      setPayments(rows);
      setDrafts(Object.fromEntries(rows.map((p) => [p.employeeId, { amount: p.amount == null ? "" : String(p.amount), currencyCode: p.currencyCode || "RWF", status: p.status === "PAID" ? "PAID" : "UNPAID", paymentReference: p.paymentReference || "", notes: p.notes || "" }])));
    } catch (e) {
      if (requestId === loadRequestId.current) {
        setPayments([]);
        setDrafts({});
        setError(e instanceof Error ? e.message : "Unable to load salary payments.");
      }
    }
    finally { if (requestId === loadRequestId.current) setLoading(false); }
  }, [month, audience, employeeId, excludeEmployeeId]);
  useEffect(() => {
    void load();
    return () => { loadRequestId.current += 1; };
  }, [load]);

  useWorkspaceAutoRefresh(() => load(true), {
    enabled: true,
    intervalMs: 60_000,
    shouldRefresh: () => !loading && !saving && (!canEdit || !payments.some((payment) => {
      const draft = drafts[payment.employeeId];
      return !draft ||
        draft.amount !== (payment.amount == null ? "" : String(payment.amount)) ||
        draft.currencyCode !== (payment.currencyCode || "RWF") ||
        draft.status !== (payment.status === "PAID" ? "PAID" : "UNPAID") ||
        draft.paymentReference !== (payment.paymentReference || "") ||
        draft.notes !== (payment.notes || "");
    })),
  });
  const paidCount = payments.filter((payment) => payment.status === "PAID").length;
  const noHoursCount = payments.filter((payment) => payment.status === "NO_RECORDED_HOURS").length;
  const unpaidCount = payments.filter((payment) => payment.status === "UNPAID").length;
  const rateRequiredCount = payments.filter((payment) => payment.status === "RATE_REQUIRED").length;
  const currencyMismatchCount = payments.filter((payment) => payment.status === "CURRENCY_MISMATCH").length;
  const needsReviewCount = rateRequiredCount + currencyMismatchCount;
  const visiblePayments = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const filtered = payments.filter((payment) => {
      const name = [payment.firstName, payment.lastName].filter(Boolean).join(" ") || payment.employeeCode || "Employee";
      const matchesSearch = !query || [name, payment.employeeCode, payment.departmentName]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
      const matchesFilter = paymentFilter === "ALL"
        || (paymentFilter === "PAID" && payment.status === "PAID")
        || (paymentFilter === "UNPAID" && payment.status === "UNPAID")
        || (paymentFilter === "REVIEW" && (payment.status === "RATE_REQUIRED" || payment.status === "CURRENCY_MISMATCH"))
        || (paymentFilter === "NO_HOURS" && payment.status === "NO_RECORDED_HOURS");
      return matchesSearch && matchesFilter;
    });
    return filtered.sort((a, b) => {
      const nameA = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.employeeCode || "Employee";
      const nameB = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.employeeCode || "Employee";
      const result = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      return nameSortOrder === "asc" ? result : -result;
    });
  }, [payments, searchQuery, paymentFilter, nameSortOrder]);

  async function save(employeeId: string) {
    const draft = drafts[employeeId]; if (!draft) return;
    setSaving(employeeId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/backend/payroll/payments", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId, month, ...draft }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
      setNotice("Salary payment record saved."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save salary payment."); }
    finally { setSaving(""); }
  }
  return <section className="hr-manager-payroll-workspace min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sky-300"><BadgeDollarSign size={18} /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Payroll tracking</span></div><h2 className="mt-1 text-xl font-bold text-white">Monthly salary payments</h2><p className="mt-1 text-sm leading-6 text-slate-400">Review payroll status, investigate missing pay inputs, and record payments. Amounts are calculated from recorded work, approved paid leave, paid public holidays, and effective pay rates.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-sm font-medium text-slate-300">Payroll month<input type="month" value={month} disabled={Boolean(saving)} onChange={(e) => setMonth(e.target.value)} className={INPUT} /></label></div></div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{error}</p>}{notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">{notice}</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><p className="text-xs text-slate-500">Employees in view</p><p className="mt-1 text-xl font-bold text-white">{loading ? "—" : payments.length}</p></div>
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3"><p className="text-xs text-slate-500">Paid</p><p className="mt-1 text-xl font-bold text-emerald-200">{loading ? "—" : paidCount}</p></div>
      <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3"><p className="text-xs text-slate-500">Unpaid</p><p className="mt-1 text-xl font-bold text-amber-200">{loading ? "—" : unpaidCount}</p></div>
      <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><p className="text-xs text-slate-500">No recorded hours</p><p className="mt-1 text-xl font-bold text-slate-200">{loading ? "—" : noHoursCount}</p></div>
      <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3"><p className="text-xs text-slate-500">Needs review</p><p className="mt-1 text-xl font-bold text-rose-200">{loading ? "—" : needsReviewCount}</p></div>
    </div>
    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-[#101722]/80 p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="block text-sm font-medium text-slate-300">
          <span className="flex items-center gap-2"><Search size={15} className="text-slate-500" />Find an employee</span>
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name, employee code, or department" className={INPUT} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><SlidersHorizontal size={14} />Filter</span>
          {([
            ["ALL", "All", payments.length],
            ["UNPAID", "Unpaid", unpaidCount],
            ["PAID", "Paid", paidCount],
            ["REVIEW", "Needs review", needsReviewCount],
            ["NO_HOURS", "No hours", noHoursCount],
          ] as const).map(([value, label, count]) => <button key={value} type="button" onClick={() => setPaymentFilter(value)} aria-pressed={paymentFilter === value} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${paymentFilter === value ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-slate-700 bg-white/[0.02] text-slate-400 hover:text-slate-200"}`}>{label}<span className="rounded-md bg-black/20 px-1.5 py-0.5 tabular-nums">{loading ? "—" : count}</span></button>)}
          <button type="button" onClick={() => setNameSortOrder((current) => current === "asc" ? "desc" : "asc")} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]" aria-label={`Sort employee names ${nameSortOrder === "asc" ? "descending" : "ascending"}`}>Name {nameSortOrder === "asc" ? "A–Z" : "Z–A"}</button>

        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-slate-500"><span>{loading ? "Loading payment records…" : `Showing ${visiblePayments.length} of ${payments.length} employees`}</span><span className="inline-flex items-center gap-1.5"><CalendarDays size={13} />{month}</span></div>

    </div>
    {loading ? <div className="mt-4 grid gap-3 xl:grid-cols-2"><div className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" /><div className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" /></div> : payments.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-700 p-8 text-center"><CircleDollarSign size={24} className="mx-auto text-slate-500" /><p className="mt-3 font-semibold text-slate-200">No payment records for this month</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-400">{canEdit ? "Payment records appear when employees have payable time. Check attendance and pay rates if you expected records here." : "Payment records will appear here when HR records them."}</p></div> : visiblePayments.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-700 p-8 text-center"><Search size={20} className="mx-auto text-slate-500" /><p className="mt-3 font-semibold text-slate-200">No matching employees</p><p className="mt-1 text-sm text-slate-400">Try a different search or select another payment status.</p><button type="button" onClick={() => { setSearchQuery(""); setPaymentFilter("ALL"); }} className="mt-3 text-sm font-semibold text-sky-300 hover:text-sky-200">Clear filters</button></div> : <div className="mt-4 space-y-3">{visiblePayments.map((p) => {
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.employeeCode || "Employee";
      const draft = drafts[p.employeeId] || { amount: p.amount == null ? "" : String(p.amount), currencyCode: p.currencyCode || "RWF", status: p.status === "PAID" ? "PAID" : "UNPAID", paymentReference: p.paymentReference || "", notes: p.notes || "" };
      const isReview = p.status === "RATE_REQUIRED" || p.status === "CURRENCY_MISMATCH";
      const statusLabel = p.status === "PAID" ? "Paid" : p.status === "NO_RECORDED_HOURS" ? "No recorded hours" : p.status === "RATE_REQUIRED" ? "Pay rate required" : p.status === "CURRENCY_MISMATCH" ? "Currency mismatch" : "Unpaid";
      const statusStyle = p.status === "PAID" ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200" : p.status === "NO_RECORDED_HOURS" ? "border-slate-600 bg-slate-700/30 text-slate-300" : isReview ? "border-rose-400/20 bg-rose-400/[0.07] text-rose-200" : "border-amber-400/20 bg-amber-400/[0.07] text-amber-200";
      return <article key={p.employeeId} className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#151f2d] to-[#101722] shadow-lg shadow-black/10 transition hover:border-white/[0.13]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3"><EmployeeProfilePhoto employeeId={p.employeeId} name={name} className="size-10 rounded-xl border border-sky-400/15 bg-sky-400/[0.07]" textClassName="text-sm font-bold text-sky-200" /><div className="min-w-0"><h3 className="break-words font-semibold text-white">{name}</h3><p className="mt-1 break-words text-xs text-slate-400">{p.employeeCode || "Employee code unavailable"}{p.departmentName ? ` · ${p.departmentName}` : ""}</p><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Clock3 size={12} />{Math.floor(Math.max(0, p.workedMinutes || 0) / 60)}h {String(Math.max(0, p.workedMinutes || 0) % 60).padStart(2, "0")}m recorded</span>{((p.paidLeaveMinutes || 0) + (p.paidHolidayMinutes || 0)) > 0 && <span className="text-emerald-300">{Math.floor(((p.paidLeaveMinutes || 0) + (p.paidHolidayMinutes || 0)) / 60)}h {String(((p.paidLeaveMinutes || 0) + (p.paidHolidayMinutes || 0)) % 60).padStart(2, "0")}m paid leave / holiday</span>}</div></div></div>
          <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle}`}>{p.status === "PAID" ? <CheckCircle size={13} /> : isReview ? <AlertTriangle size={13} /> : p.status === "NO_RECORDED_HOURS" ? <Clock3 size={13} /> : <CircleDollarSign size={13} />}{statusLabel}</span><p className="text-xs text-slate-500">{p.paidAt ? `Paid ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(p.paidAt))}` : p.status === "PAID" ? "Payment recorded" : "Payment not completed"}</p></div>
        </div>
        {canEdit ? <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calculated earnings</p><p className="mt-2 text-2xl font-bold tracking-tight text-white">{money(p.calculatedAmount == null ? null : String(p.calculatedAmount), p.currencyCode)}</p><p className="mt-1 text-xs leading-5 text-slate-500">Based on recorded work, approved paid leave, public holidays, and effective rates.</p><div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3"><div><p className="text-[11px] text-slate-500">Currency</p><p className="mt-1 text-sm font-semibold text-slate-200">{p.currencyCode || "—"}</p></div><div><p className="text-[11px] text-slate-500">Payable time</p><p className="mt-1 text-sm font-semibold text-slate-200">{Math.floor(Math.max(0, p.payableMinutes || 0) / 60)}h {String(Math.max(0, p.payableMinutes || 0) % 60).padStart(2, "0")}m</p></div></div></div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-400">Payment status<select value={draft.status} onChange={(e) => setDrafts((old) => ({ ...old, [p.employeeId]: { ...draft, status: e.target.value as "PAID" | "UNPAID" } }))} className={INPUT}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option></select></label><label className="block text-xs font-medium text-slate-400">Payment reference<input maxLength={120} value={draft.paymentReference} onChange={(e) => setDrafts((old) => ({ ...old, [p.employeeId]: { ...draft, paymentReference: e.target.value } }))} className={INPUT} placeholder="Bank / transfer reference (optional)" /></label><label className="block text-xs font-medium text-slate-400 sm:col-span-2">Notes<input maxLength={1000} value={draft.notes} onChange={(e) => setDrafts((old) => ({ ...old, [p.employeeId]: { ...draft, notes: e.target.value } }))} className={INPUT} placeholder="Optional payment note" /></label><div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2"><p className="text-xs leading-5 text-slate-500">{(p.payableMinutes || 0) <= 0 ? "No payable time is available for this month." : p.status === "CURRENCY_MISMATCH" ? "Resolve the currency mismatch in pay-rate history before recording payment." : p.calculatedAmount == null ? "Set a valid effective pay rate before recording payment." : "Only payment status, reference, and notes can be changed here."}</p><button type="button" className={BUTTON} disabled={Boolean(saving) || (p.payableMinutes || 0) <= 0 || p.calculatedAmount == null} onClick={() => void save(p.employeeId)}>{saving === p.employeeId ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Save payment</button></div></div>
        </div> : <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5"><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-xs text-slate-500">{p.status === "PAID" ? "Paid amount" : "Calculated amount"}</p><p className="mt-1 break-words font-semibold text-white">{money(p.amount, p.currencyCode)}</p></div><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-xs text-slate-500">Payment date</p><p className="mt-1 text-sm text-slate-200">{p.paidAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(p.paidAt)) : "Not paid yet"}</p></div><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-xs text-slate-500">Reference</p><p className="mt-1 break-words text-sm text-slate-200">{p.paymentReference || "—"}</p></div>{p.notes && <p className="text-sm text-slate-400 sm:col-span-3">{p.notes}</p>}</div>}
      </article>;
    })}</div>}
    {canEdit && <p className="mt-4 text-xs leading-5 text-slate-500">Salary amounts and currency are calculated from recorded working time, approved paid leave, paid public holidays, and effective pay rates. Only the payment status and reference/notes are editable here. Employees with no payable hours cannot be marked paid.</p>}
  </section>;
}

