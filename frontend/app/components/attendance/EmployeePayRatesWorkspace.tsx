"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BadgeDollarSign, RefreshCw, Save } from "lucide-react";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Row = Record<string, unknown>;
type Employee = { id: string; first_name?: string; last_name?: string; employee_code?: string; department_name?: string; employment_status?: string; workforce_role?: string; workforceRole?: string; roleName?: string; role_name?: string; role?: string | { name?: string; title?: string; slug?: string }; userRole?: string; user_role?: string; user?: { role?: string | { name?: string; title?: string; slug?: string } } };
type Rate = { id: string; employeeId: string; hourlyRate: string; overtimeRate: string; currencyCode: string; effectiveFrom: string; effectiveTo: string | null; updatedAt?: string };

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function message(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") return payload.message;
  return "The request could not be completed.";
}
async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/backend${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(message(payload));
  return payload as Record<string, unknown>;
}
function name(employee: Employee) {
  return [employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.employee_code || "Employee";
}
function isExcludedHrTarget(employee: Employee) {
  const normalizeRole = (value: unknown): string[] => {
    if (typeof value === "string") return [value.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_")];
    if (value && typeof value === "object") {
      const role = value as { name?: unknown; title?: unknown; slug?: unknown };
      return [role.name, role.title, role.slug].filter((item): item is string => typeof item === "string").map((item) => item.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_"));
    }
    return [];
  };
  const roleValues = [
    ...normalizeRole(employee.workforce_role),
    ...normalizeRole(employee.workforceRole),
    ...normalizeRole(employee.roleName),
    ...normalizeRole(employee.role_name),
    ...normalizeRole(employee.role),
    ...normalizeRole(employee.userRole),
    ...normalizeRole(employee.user_role),
    ...normalizeRole(employee.user?.role),
  ];
  return roleValues.some((role) =>
    ["ORGANIZATION_ADMIN", "ORG_ADMIN", "ORGANIZATIONADMIN", "ORGANIZATION_ADMINISTRATOR", "ORGANIZATION_OWNER", "ORG_OWNER", "TENANT_ADMIN", "ADMINISTRATOR", "HR_MANAGER", "HRMANAGER"].includes(role) ||
    role.startsWith("ORGANIZATION_ADMIN_") || role.startsWith("ORGANIZATIONADMIN_") ||
    role.startsWith("ORG_ADMIN_") || role.startsWith("HR_MANAGER_") || role.startsWith("HRMANAGER_"),
  );
}
const INPUT = "mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b111b] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-sky-400";
const PRIMARY = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";

export default function EmployeePayRatesWorkspace() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [rates, setRates] = useState<Rate[]>([]);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [hourlyRate, setHourlyRate] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [organizationCurrencyCode, setOrganizationCurrencyCode] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(localDate);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const rateRequestId = useRef(0);
  const employeeIdRef = useRef(employeeId);
  employeeIdRef.current = employeeId;

  const loadEmployees = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const firstPage = await api("/employees?page=1&limit=100&status=ACTIVE&sortBy=name&sortOrder=asc");
      if (!Array.isArray(firstPage.employees)) throw new Error("The employee list response was invalid. Try again in a moment.");
      const responseRows = firstPage.employees as Employee[];
      const pagination = firstPage.pagination && typeof firstPage.pagination === "object" ? firstPage.pagination as { totalPages?: unknown } : {};
      const totalPages = Math.max(1, Number(pagination.totalPages) || 1);
      if (totalPages > 10001) throw new Error("The employee list is too large to load safely. Use employee search or contact your administrator.");
      for (let page = 2; page <= totalPages; page += 1) {
        const next = await api(`/employees?page=${page}&limit=100&status=ACTIVE&sortBy=name&sortOrder=asc`);
        if (!Array.isArray(next.employees)) throw new Error("The employee list response was incomplete. Try again in a moment.");
        responseRows.push(...next.employees as Employee[]);
      }
      const rows = responseRows.filter((employee) => !isExcludedHrTarget(employee));
      setEmployees(rows);
      setEmployeeId((current) => rows.some((employee) => employee.id === current) ? current : rows[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load employees.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadRates = useCallback(async () => {
    const requestId = ++rateRequestId.current;
    if (!employeeId) {
      setRates([]); setEditingRateId(null); setHourlyRate(""); setOvertimeRate(""); setCurrencyCode("");
      return;
    }
    // Never leave another employee's rates visible while this employee is loading.
    setRates([]); setEditingRateId(null); setHourlyRate(""); setOvertimeRate(""); setCurrencyCode("");
    setError("");
    try {
      const payload = await api(`/attendance/pay-rates?employeeId=${encodeURIComponent(employeeId)}`);
      if (requestId !== rateRequestId.current) return;
      const rows = Array.isArray(payload.rates) ? payload.rates as Rate[] : [];
      const configuredCurrency = typeof payload.organizationCurrencyCode === "string" ? payload.organizationCurrencyCode.toUpperCase() : "";
      setOrganizationCurrencyCode(configuredCurrency);
      setRates(rows);
      const latest = rows[0];
      setEditingRateId(null);
      if (latest) {
        setHourlyRate(latest.hourlyRate);
        setOvertimeRate(latest.overtimeRate);
        setCurrencyCode(configuredCurrency || latest.currencyCode);
        setEffectiveFrom(localDate());
        setEffectiveTo("");
      } else {
        setHourlyRate(""); setOvertimeRate(""); setCurrencyCode(configuredCurrency);
        setEffectiveFrom(localDate()); setEffectiveTo("");
      }
    } catch (caught) {
      if (requestId === rateRequestId.current) setError(caught instanceof Error ? caught.message : "Unable to load pay rates.");
    }
  }, [employeeId]);

  useEffect(() => { void loadEmployees(); }, [loadEmployees]);

  const refreshRates = useCallback(async () => {
    if (!employeeId) return;
    const requestId = ++rateRequestId.current;
    const targetEmployeeId = employeeId;
    try {
      const payload = await api(`/attendance/pay-rates?employeeId=${encodeURIComponent(targetEmployeeId)}`);
      if (requestId === rateRequestId.current && employeeIdRef.current === targetEmployeeId) {
        setRates(Array.isArray(payload.rates) ? payload.rates as Rate[] : []);
      }
    } catch (caught) {
      if (requestId === rateRequestId.current && employeeIdRef.current === targetEmployeeId) {
        setError(caught instanceof Error ? caught.message : "Unable to refresh pay rates.");
      }
    }
  }, [employeeId]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([loadEmployees(true), refreshRates()]);
  }, [loadEmployees, refreshRates]);

  useWorkspaceAutoRefresh(refreshWorkspace, {
    enabled: true,
    intervalMs: 60_000,
    shouldRefresh: () => !loading && !saving && !editingRateId,
  });
  useEffect(() => {
    void loadRates();
    return () => { rateRequestId.current += 1; };
  }, [loadRates]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      await api("/attendance/pay-rates", { method: "PUT", body: JSON.stringify({ employeeId, hourlyRate: Number(hourlyRate), overtimeRate: Number(overtimeRate), currencyCode: organizationCurrencyCode, effectiveFrom, effectiveTo: effectiveTo || null }) });
      setSuccess("Pay rates saved. The employee can now see their rates and estimated monthly earnings.");
      await loadRates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save pay rates.");
    } finally { setSaving(false); }
  }

  return <section className="space-y-5 text-slate-100">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Compensation settings</p><h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">Employee pay rates</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Set the hourly and overtime rates that drive each employee's minute-based earnings estimate. Rate changes are effective-dated so previous work keeps the rate that applied on that date.</p></div>
    {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{error}</div>}
    {success && <div role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-sm text-emerald-100">{success}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form onSubmit={save} className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200"><BadgeDollarSign size={21} /></span><div><h3 className="font-semibold text-white">{editingRateId ? "Edit saved pay rates" : "Set pay rates"}</h3><p className="mt-1 text-xs text-slate-400">All amounts are hourly rates. {editingRateId ? "Saving updates the selected effective period." : "Choose Edit in rate history to revise an existing period."}</p></div></div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-300">Employee<select required disabled={saving} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={INPUT}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{name(employee)}{employee.employee_code ? ` · ${employee.employee_code}` : ""}{employee.department_name ? ` · ${employee.department_name}` : ""}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-300">Hourly rate<input required disabled={saving} type="number" min="0" max="99999999" step="0.0001" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} className={INPUT} placeholder="e.g. 2500" /><span className="mt-1 block text-xs font-normal text-slate-500">Per hour · per minute is calculated automatically.</span></label><label className="block text-sm font-medium text-slate-300">Overtime rate<input required disabled={saving} type="number" min="0" max="99999999" step="0.0001" value={overtimeRate} onChange={(event) => setOvertimeRate(event.target.value)} className={INPUT} placeholder="e.g. 3750" /><span className="mt-1 block text-xs font-normal text-slate-500">Per overtime hour · only approved overtime is payable.</span></label></div>
          <label className="block text-sm font-medium text-slate-300">Organization currency<input required readOnly disabled={saving || !organizationCurrencyCode} value={organizationCurrencyCode} className={`${INPUT} cursor-not-allowed opacity-80`} placeholder="Configure currency in Organization Profile & Settings" /><span className="mt-1 block text-xs font-normal text-slate-500">Set centrally in Organization Profile & Settings. Employee pay rates always use this currency.</span></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-300">Effective from<input required type="date" disabled={saving || Boolean(editingRateId)} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={INPUT} /></label><label className="block text-sm font-medium text-slate-300">Effective to (optional)<input type="date" disabled={saving} min={effectiveFrom} value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} className={INPUT} /><span className="mt-1 block text-xs font-normal text-slate-500">Leave blank for an ongoing rate.</span></label></div>
          <div className="rounded-xl border border-sky-300/10 bg-sky-300/[0.04] p-3 text-sm text-slate-300"><p>Per-minute regular rate: <strong>{hourlyRate !== "" && Number.isFinite(Number(hourlyRate)) ? `${currencyCode || "Currency"} ${(Number(hourlyRate) / 60).toFixed(4)}` : "—"}</strong></p><p className="mt-1">Per-minute overtime rate: <strong>{overtimeRate !== "" && Number.isFinite(Number(overtimeRate)) ? `${currencyCode || "Currency"} ${(Number(overtimeRate) / 60).toFixed(4)}` : "—"}</strong></p></div>
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving || loading || !employeeId || !organizationCurrencyCode} className={PRIMARY}>{saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}{editingRateId ? "Save rate changes" : "Save effective-dated rates"}</button>{editingRateId && <button type="button" disabled={saving} onClick={() => { setEditingRateId(null); setEffectiveFrom(localDate()); setEffectiveTo(""); const latest = rates[0]; if (latest) { setHourlyRate(latest.hourlyRate); setOvertimeRate(latest.overtimeRate); setCurrencyCode(organizationCurrencyCode || latest.currencyCode); } }} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.04] disabled:opacity-50">Cancel edit</button>}</div>
        </div>
      </form>
      <div className="rounded-2xl border border-white/[0.08] bg-[#141c28] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{employees.find((item) => item.id === employeeId) && <EmployeeProfilePhoto employeeId={employeeId} name={name(employees.find((item) => item.id === employeeId)!)} className="size-10 rounded-xl border border-slate-700 bg-slate-800" textClassName="text-xs font-bold text-slate-200" />}<div className="min-w-0"><h3 className="font-semibold text-white">Rate history</h3><p className="mt-1 truncate text-sm text-slate-400">{employees.find((item) => item.id === employeeId) ? name(employees.find((item) => item.id === employeeId)!) : "Choose an employee"}</p></div></div></div>
        {loading ? <p className="mt-5 text-sm text-slate-400">Loading employees…</p> : rates.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-5 text-sm leading-6 text-slate-400">No rates have been saved for this employee yet.</p> : <div className="mt-5 space-y-3">{rates.map((rate) => <article key={rate.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-white">{rate.currencyCode} {Number(rate.hourlyRate).toLocaleString()} / hour</p><p className="mt-1 text-sm text-violet-200">{rate.currencyCode} {Number(rate.overtimeRate).toLocaleString()} overtime / hour</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-xs text-slate-300">{rate.effectiveTo ? "Fixed period" : "Ongoing"}</span><button type="button" disabled={saving} className="rounded-lg border border-sky-400/30 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-400/10 disabled:opacity-50" onClick={() => { setEditingRateId(rate.id); setHourlyRate(rate.hourlyRate); setOvertimeRate(rate.overtimeRate); setCurrencyCode(organizationCurrencyCode || rate.currencyCode); setEffectiveFrom(rate.effectiveFrom); setEffectiveTo(rate.effectiveTo || ""); setError(""); setSuccess(""); }}>Edit</button></div></div><p className="mt-3 text-xs leading-5 text-slate-400">Effective {rate.effectiveFrom}{rate.effectiveTo ? ` through ${rate.effectiveTo}` : " onward"}</p></article>)}</div>}
      </div>
    </div>

    <p className="text-xs leading-5 text-slate-500">This module configures rates and estimated earnings only. It does not calculate taxes, deductions, statutory contributions, or generate final payslips.</p>
  </section>;
}

