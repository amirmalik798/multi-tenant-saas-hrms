"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Audience = "hr-manager" | "department-manager" | "employee";
type LeaveRequest = { id: string; employeeId: string; isOwnRequest?: boolean; leaveType: string; startDate: string; endDate: string; isPaid: boolean; reason: string; status: string; reviewerNote?: string | null; createdAt?: string; employeeCode?: string | null; firstName?: string | null; lastName?: string | null; departmentName?: string | null };
type Holiday = { id: string; holidayDate: string; name: string; isPaid: boolean; notes?: string | null };
type Payload = { message?: string; requests?: LeaveRequest[]; holidays?: Holiday[]; canManage?: boolean; request?: LeaveRequest; holiday?: Holiday };
const TYPES = [{ value: "ANNUAL", label: "Annual leave" }, { value: "SICK", label: "Sick leave" }, { value: "PERSONAL", label: "Personal leave" }, { value: "PARENTAL", label: "Parental leave" }, { value: "UNPAID", label: "Unpaid leave" }, { value: "OTHER", label: "Other" }];

function dateLabel(value: string) { const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
function statusStyle(status: string) { if (status === "APPROVED") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"; if (status === "REJECTED" || status === "CANCELLED") return "border-rose-400/20 bg-rose-400/10 text-rose-300"; return "border-amber-400/20 bg-amber-400/10 text-amber-200"; }
function apiError(payload: Payload | null, fallback: string) { return payload?.message || fallback; }

export default function LeaveManagementWorkspace({ audience }: { audience: Audience }) {
  const isEmployee = audience === "employee";
  const isHr = audience === "hr-manager";
  const canReview = audience !== "employee";
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [canManageHolidays, setCanManageHolidays] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"requests" | "holidays">("requests");
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayNotes, setHolidayNotes] = useState("");
  const [holidayPaid, setHolidayPaid] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError("");
    try {
      const [requestResponse, holidayResponse] = await Promise.all([
        fetch("/api/backend/leave/requests", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/backend/leave/holidays", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [requestPayload, holidayPayload] = await Promise.all([requestResponse.json().catch(() => null) as Promise<Payload | null>, holidayResponse.json().catch(() => null) as Promise<Payload | null>]);
      if (!requestResponse.ok) throw new Error(apiError(requestPayload, "Unable to load leave requests."));
      if (!holidayResponse.ok) throw new Error(apiError(holidayPayload, "Unable to load public holidays."));
      setRequests(Array.isArray(requestPayload?.requests) ? requestPayload?.requests ?? [] : []);
      setHolidays(Array.isArray(holidayPayload?.holidays) ? holidayPayload?.holidays ?? [] : []);
      setCanManageHolidays(Boolean(holidayPayload?.canManage));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load leave and holiday information."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useWorkspaceAutoRefresh(() => load(true), {
    enabled: true,
    intervalMs: 60_000,
    shouldRefresh: () => !loading && !saving,
  });

  const visibleRequests = useMemo(() => requests.filter((r) => (filter === "ALL" || r.status === filter) && `${r.firstName ?? ""} ${r.lastName ?? ""} ${r.employeeCode ?? ""} ${r.departmentName ?? ""} ${r.leaveType} ${r.reason}`.toLowerCase().includes(search.toLowerCase())), [requests, filter, search]);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const upcomingHolidays = useMemo(() => [...holidays].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate)), [holidays]);

  async function post(path: string, method: string, body?: unknown) {
    const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await response.json().catch(() => null) as Payload | null;
    if (!response.ok) throw new Error(apiError(payload, `Request failed (${response.status}).`));
    return payload;
  }
  async function submitLeave(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { await post("/api/backend/leave/requests", "POST", { leaveType, startDate, endDate, reason }); setReason(""); setNotice("Leave request submitted for review."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to submit request."); }
    finally { setSaving(false); }
  }
  async function decide(request: LeaveRequest, status: "APPROVED" | "REJECTED" | "CANCELLED") {
    const promptNote = status === "REJECTED" ? window.prompt("Enter a reason for rejecting this request (required):", "") : "";
    if (status === "REJECTED" && promptNote === null) return;
    if (status === "REJECTED" && !(promptNote ?? "").trim()) {
      setError("A reason is required when rejecting a leave request.");
      setNotice("");
      return;
    }
    if (status === "REJECTED" && (promptNote ?? "").trim().length > 500) {
      setError("The rejection reason cannot exceed 500 characters.");
      setNotice("");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try { await post(`/api/backend/leave/requests/${request.id}`, "PATCH", { status, reviewerNote: promptNote ?? "" }); setNotice(status === "CANCELLED" ? "Pending request cancelled." : `Leave request ${status.toLowerCase()}.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update request."); }
    finally { setSaving(false); }
  }
  async function addHoliday(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { await post("/api/backend/leave/holidays", "POST", { holidayDate, name: holidayName, notes: holidayNotes, isPaid: holidayPaid }); setHolidayName(""); setHolidayNotes(""); setNotice("Public holiday saved."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save public holiday."); }
    finally { setSaving(false); }
  }
  async function removeHoliday(holiday: Holiday) {
    if (!window.confirm(`Remove ${holiday.name} from the public holiday calendar?`)) return;
    setSaving(true); setError(""); setNotice("");
    try { await post(`/api/backend/leave/holidays/${holiday.id}`, "DELETE"); setNotice("Public holiday removed."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to remove holiday."); }
    finally { setSaving(false); }
  }

  return <section className="hr-manager-leave-workspace space-y-6 text-slate-100">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-[#111a28] p-4"><p className="text-xs uppercase tracking-[.14em] text-slate-500">Requests shown</p><p className="mt-2 text-2xl font-semibold">{requests.length}</p><p className="mt-1 text-xs text-slate-500">Leave requests in your permitted scope</p></div>
      <div className="rounded-2xl border border-amber-300/15 bg-[#111a28] p-4"><p className="text-xs uppercase tracking-[.14em] text-slate-500">Awaiting review</p><p className="mt-2 text-2xl font-semibold text-amber-200">{pendingCount}</p><p className="mt-1 text-xs text-slate-500">Pending requests</p></div>
      <div className="rounded-2xl border border-white/10 bg-[#111a28] p-4"><p className="text-xs uppercase tracking-[.14em] text-slate-500">Public holidays</p><p className="mt-2 text-2xl font-semibold">{holidays.length}</p><p className="mt-1 text-xs text-slate-500">Organization calendar entries</p></div>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div className="flex gap-2"><button type="button" onClick={() => setTab("requests")} aria-pressed={tab === "requests"} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === "requests" ? "bg-sky-400/15 text-sky-200" : "text-slate-400 hover:bg-white/5"}`}>Leave requests</button><button type="button" onClick={() => setTab("holidays")} aria-pressed={tab === "holidays"} className={`rounded-xl px-4 py-2 text-sm font-medium ${tab === "holidays" ? "bg-sky-400/15 text-sky-200" : "text-slate-400 hover:bg-white/5"}`}>Public holidays</button></div>

    </div>
    {tab === "requests" ? <div className={`grid gap-5 ${isHr ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_340px]"}`}>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111a28]">

        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4"><div className="min-w-[180px] flex-1"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, type, reason…" className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm outline-none focus:border-sky-400/40"/></div><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option></select></div>
        {loading ? <div className="p-10 text-center text-sm text-slate-400">Loading leave requests…</div> : visibleRequests.length === 0 ? <div className="p-10 text-center"><CalendarDays className="mx-auto text-slate-600"/><p className="mt-3 text-sm font-medium text-slate-300">No leave requests found</p><p className="mt-1 text-xs text-slate-500">Requests will appear here when submitted.</p></div> : <div className="divide-y divide-white/[.07]">{visibleRequests.map((r) => <article key={r.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><EmployeeProfilePhoto employeeId={r.isOwnRequest ? undefined : r.employeeId} name={[r.firstName, r.lastName].filter(Boolean).join(" ") || "Employee"} className="size-11 rounded-xl border border-sky-300/20 bg-slate-900 text-sm" textClassName="text-sm font-bold text-sky-100" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{TYPES.find((t) => t.value === r.leaveType)?.label ?? r.leaveType}</h3><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(r.status)}`}>{r.status.replaceAll("_", " ")}</span><span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-400">{r.isPaid ? "Paid leave" : "Unpaid leave"}</span></div><p className="mt-2 text-sm text-slate-300">{dateLabel(r.startDate)} – {dateLabel(r.endDate)}</p><p className="mt-2 text-sm leading-6 text-slate-400">{r.reason}</p>{!isEmployee && <p className="mt-2 text-xs text-slate-500">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "Employee"}{r.employeeCode ? ` · ${r.employeeCode}` : ""}{r.departmentName ? ` · ${r.departmentName}` : ""}</p>}{r.reviewerNote && <p className="mt-3 rounded-lg bg-white/[.04] px-3 py-2 text-xs text-slate-400">Reviewer note: {r.reviewerNote}</p>}</div></div></div>
          {r.status === "PENDING" && <div className="mt-4 flex flex-wrap gap-2">{canReview && !r.isOwnRequest ? <><button type="button" disabled={saving} onClick={() => void decide(r, "APPROVED")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/25 disabled:opacity-50"><Check size={14}/> Approve</button><button type="button" disabled={saving} onClick={() => void decide(r, "REJECTED")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/15 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-400/10 disabled:opacity-50"><X size={14}/> Reject</button></> : <button type="button" disabled={saving} onClick={() => void decide(r, "CANCELLED")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">Cancel request</button>}</div>}
        </article>)}</div>}
      </div>
      {!isHr && (<form onSubmit={submitLeave} className="h-fit space-y-4 rounded-2xl border border-white/10 bg-[#111a28] p-5"><div><div className="flex size-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200"><Plus size={19}/></div><h2 className="mt-3 text-lg font-semibold">Request time off</h2><p className="mt-1 text-sm text-slate-400">Your manager will review the request.</p></div><label className="block text-xs font-medium text-slate-400">Leave type<select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100">{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}{t.value === "UNPAID" ? " · unpaid" : ""}</option>)}</select></label><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block min-w-0 text-xs font-medium text-slate-400">From<input required type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate && endDate < e.target.value) setEndDate(e.target.value); }} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1220] px-2.5 py-2.5 text-sm text-slate-100"/></label><label className="block min-w-0 text-xs font-medium text-slate-400">To<input required type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1220] px-2.5 py-2.5 text-sm text-slate-100"/></label></div><label className="block text-xs font-medium text-slate-400">Reason<textarea required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Briefly explain the request…" className="mt-1.5 w-full resize-y rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400/40"/></label><p className="text-xs leading-5 text-slate-500">Paid leave is paid only on scheduled workdays with no recorded work. Public holidays and non-working days are not double-counted.</p><button type="submit" disabled={saving || !startDate || !endDate || endDate < startDate || reason.trim().length < 3} className="w-full rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-[#07111d] hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Submitting…" : "Submit leave request"}</button></form>)}
      {canReview && <div className="h-fit rounded-2xl border border-white/10 bg-[#111a28] p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200"><ShieldCheck size={19}/></div><h2 className="mt-3 font-semibold">Review guidance</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400"><li>• Approve or reject pending requests only.</li><li>• Department Managers are limited to their managed departments.</li><li>• HR Managers can review organization-wide requests.</li><li>• Approved paid leave feeds the monthly salary calculation for scheduled days without attendance.</li></ul></div>}
    </div> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111a28]"><div className="border-b border-white/10 p-4"><h2 className="font-semibold">Organization holiday calendar</h2><p className="mt-1 text-sm text-slate-400">Paid public holidays credit scheduled hours when no work is recorded.</p></div>{loading ? <div className="p-10 text-center text-sm text-slate-400">Loading holidays…</div> : upcomingHolidays.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No public holidays have been added yet.</div> : <div className="divide-y divide-white/[.07]">{upcomingHolidays.map((h) => <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200"><CalendarDays size={18}/></div><div><p className="font-medium">{h.name}</p><p className="mt-1 text-sm text-slate-400">{dateLabel(h.holidayDate)} · {h.isPaid ? "Paid holiday" : "Unpaid holiday"}</p>{h.notes && <p className="mt-1 text-xs text-slate-500">{h.notes}</p>}</div></div>{canManageHolidays && <button type="button" disabled={saving} title="Remove holiday" onClick={() => void removeHoliday(h)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:border-rose-300/20 hover:text-rose-200 disabled:opacity-50"><Trash2 size={15}/></button>}</div>)}</div>}</div>
      {canManageHolidays ? <form onSubmit={addHoliday} className="h-fit space-y-4 rounded-2xl border border-white/10 bg-[#111a28] p-5"><h2 className="text-lg font-semibold">Add public holiday</h2><p className="text-sm text-slate-400">Keep the organization calendar accurate for all employees.</p><label className="block text-xs font-medium text-slate-400">Holiday name<input required minLength={2} maxLength={160} value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="e.g. National holiday" className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm"/></label><label className="block text-xs font-medium text-slate-400">Date<input required type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm"/></label><label className="block text-xs font-medium text-slate-400">Notes (optional)<textarea maxLength={500} rows={2} value={holidayNotes} onChange={(e) => setHolidayNotes(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm"/></label><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={holidayPaid} onChange={(e) => setHolidayPaid(e.target.checked)} className="accent-sky-400"/> Paid public holiday</label><button type="submit" disabled={saving || !holidayDate || holidayName.trim().length < 2} className="w-full rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-[#07111d] hover:bg-sky-300 disabled:opacity-50">{saving ? "Saving…" : "Save holiday"}</button></form> : <div className="rounded-2xl border border-white/10 bg-[#111a28] p-5"><h2 className="font-semibold">Holiday pay</h2><p className="mt-2 text-sm leading-6 text-slate-400">Your organization’s public holidays appear here. Paid holidays may be included in calculated monthly pay for scheduled workdays with no recorded work.</p></div>}
    </div>}
    <p className="text-xs leading-5 text-slate-500"><Clock3 className="mr-1 inline" size={13}/>Leave approvals and holiday entries affect salary estimates after the migration is applied. The system preserves attendance events and never treats leave as a clock-in or clock-out event.</p>
  </section>;
}

