"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarClock, FileClock, Send } from "lucide-react";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Row = Record<string, unknown>;
type Payload = { message?: string; events?: Row[]; requests?: Row[]; clockStatus?: string };
function read(row: Row | undefined, ...keys: string[]): string { if (!row) return ""; for (const key of keys) { const value = row[key]; if (typeof value === "string" && value.trim()) return value; if (typeof value === "number" && Number.isFinite(value)) return String(value); } return ""; }
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function plusDays(value: string, count: number): string { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+count); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; }
function toOrganizationIso(value: string, timeZone: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !timeZone) return "";
  const [, y, mo, d, h, mi] = match;
  const target = { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi) };
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);
  let guess = targetUtc;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    for (let i = 0; i < 5; i += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
      const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      const correction = targetUtc - shown; guess += correction; if (correction === 0) break;
    }
    const verify = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    if (Number(verify.year) !== target.year || Number(verify.month) !== target.month || Number(verify.day) !== target.day || Number(verify.hour) !== target.hour || Number(verify.minute) !== target.minute) return "";
    return new Date(guess).toISOString();
  } catch { return ""; }
}
async function api(path: string, init?: RequestInit): Promise<Payload> { const response = await fetch(`/api/backend${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } }); const data = await response.json().catch(() => null) as Payload | null; if (!response.ok) throw new Error(data?.message || `Request failed (${response.status}).`); return data ?? {}; }
const panel = "min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-5";
const input = "mt-1.5 w-full min-w-0 rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";

export default function DepartmentManagerSelfRequests({ employeeId }: { employeeId: string }) {
  const [events, setEvents] = useState<Row[]>([]);
  const [timeZone, setTimeZone] = useState("Africa/Kigali");
  const [corrections, setCorrections] = useState<Row[]>([]);
  const [overtime, setOvertime] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [eventId, setEventId] = useState("");
  const [eventType, setEventType] = useState<"CLOCK_IN" | "CLOCK_OUT">("CLOCK_IN");
  const [workDate, setWorkDate] = useState(localDate(new Date()));
  const [requestedAt, setRequestedAt] = useState(`${localDate(new Date())}T08:00`);
  const [correctionReason, setCorrectionReason] = useState("");
  const [overtimeDate, setOvertimeDate] = useState(plusDays(localDate(new Date()), 1));
  const [minutes, setMinutes] = useState("60");
  const [overtimeReason, setOvertimeReason] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError("");
    try {
      const [eventData, correctionData, overtimeData, overviewData] = await Promise.all([
        api("/attendance/events"), api("/attendance/corrections"), api("/attendance/overtime"), api("/department-manager/overview"),
      ]);
      const ownEvents = (Array.isArray(eventData.events) ? eventData.events : []).filter((row) => read(row,"employeeId","employee_id") === employeeId && ["CLOCK_IN","CLOCK_OUT"].includes(read(row,"eventType","event_type")));
      setEvents(ownEvents.slice(0,30));
      setTimeZone(read(overviewData as Row, "timeZone", "time_zone") || read(ownEvents[0], "timeZone", "time_zone") || read(eventData as Row, "timeZone", "time_zone") || "Africa/Kigali");
      setCorrections((Array.isArray(correctionData.requests) ? correctionData.requests : []).filter((row) => read(row,"employeeId","employee_id") === employeeId).slice(0,8));
      setOvertime((Array.isArray(overtimeData.requests) ? overtimeData.requests : []).filter((row) => read(row,"employeeId","employee_id") === employeeId).slice(0,8));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load your requests."); }
    finally { setLoading(false); }
  }, [employeeId]);
  useEffect(() => { void load(); }, [load]);
  useWorkspaceAutoRefresh(() => load(true), {
    intervalMs: 60_000,
    shouldRefresh: () => !loading && !saving && !correctionReason.trim() && !overtimeReason.trim(),
  });

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving("correction"); setError(""); setNotice("");
    const reason = correctionReason.trim(); const iso = toOrganizationIso(requestedAt, timeZone);
    if (!iso || !reason || reason.length > 500 || (!eventId && !workDate)) { setError("Choose a valid organization-local date/time and provide a reason of no more than 500 characters. If the selected time is invalid in the organization time zone, choose another time."); setSaving(""); return; }
    const selected = events.find((row) => read(row,"id") === eventId);
    const actualType = selected ? read(selected,"eventType","event_type") : eventType;
    const body: Row = { eventType: actualType, requestedAt: iso, originalEventId: eventId || null, reason };
    if (!eventId) body.workDate = workDate;
    try { const result = await api("/attendance/corrections", { method: "POST", body: JSON.stringify(body) }); setNotice(result.message || "Your correction request was submitted for review."); setCorrectionReason(""); setEventId(""); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit correction."); }
    finally { setSaving(""); }
  }
  async function submitOvertime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving("overtime"); setError(""); setNotice("");
    const amount = Number(minutes); const reason = overtimeReason.trim();
    if (!overtimeDate || overtimeDate <= localDate(new Date()) || !Number.isInteger(amount) || amount < 1 || amount > 1440 || !reason || reason.length > 500) { setError("Choose a future work date, enter 1–1440 minutes, and provide a reason (maximum 500 characters). Overtime must be requested in advance."); setSaving(""); return; }
    try { const result = await api("/attendance/overtime", { method: "POST", body: JSON.stringify({ requestType: "PREAUTHORIZATION", workDate: overtimeDate, requestedMinutes: amount, reason }) }); setNotice(result.message || "Your advance overtime request was submitted. Wait for approval before working extra time."); setOvertimeReason(""); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit overtime request."); }
    finally { setSaving(""); }
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">Personal self-service</p><h2 className="mt-1 text-xl font-bold text-white">My attendance requests</h2><p className="mt-1 text-sm leading-6 text-slate-400">Request corrections to your own punches and seek overtime approval before the future work date. Team-review actions stay separate.</p></div></div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${error ? "border-rose-300/20 bg-rose-300/[0.05] text-rose-200" : "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-200"}`}>{error || notice}</p>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <form onSubmit={submitCorrection} className={panel}><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200"><FileClock size={18}/></span><div><h3 className="text-sm font-bold text-white">Attendance correction</h3><p className="mt-1 text-xs leading-5 text-slate-500">Correct one of your recorded punches or request a missing punch.</p></div></div>

        <label className="mt-4 block text-xs font-semibold text-slate-300">Existing punch (optional)<select className={input} value={eventId} onChange={(e)=>{setEventId(e.target.value);const row=events.find((item)=>read(item,"id")===e.target.value);if(row)setEventType(read(row,"eventType","event_type")==="CLOCK_OUT"?"CLOCK_OUT":"CLOCK_IN");}}><option value="">Missing punch / new correction</option>{events.map((row,index)=><option key={read(row,"id")||index} value={read(row,"id")}>{read(row,"eventType","event_type")==="CLOCK_OUT"?"Clock-out":"Clock-in"} · {read(row,"recordedAt","recorded_at")}</option>)}</select></label>
        {!eventId && <><label className="mt-3 block text-xs font-semibold text-slate-300">Punch type<select className={input} value={eventType} onChange={(e)=>setEventType(e.target.value as "CLOCK_IN"|"CLOCK_OUT")}><option value="CLOCK_IN">Clock-in</option><option value="CLOCK_OUT">Clock-out</option></select></label><label className="mt-3 block text-xs font-semibold text-slate-300">Work date<input className={input} type="date" value={workDate} max={localDate(new Date())} onChange={(e)=>setWorkDate(e.target.value)} required/></label></>}
        <label className="mt-3 block text-xs font-semibold text-slate-300">Correct time<input className={input} type="datetime-local" value={requestedAt} max={`${localDate(new Date())}T23:59`} onChange={(e)=>setRequestedAt(e.target.value)} required/></label><label className="mt-3 block text-xs font-semibold text-slate-300">Reason<textarea className={input} rows={3} maxLength={500} value={correctionReason} onChange={(e)=>setCorrectionReason(e.target.value)} placeholder="Explain what needs to be corrected" required/></label><button className={`${button} mt-4 w-full`} type="submit" disabled={Boolean(saving)}><Send size={15}/>{saving==="correction"?"Submitting…":"Submit correction"}</button></form>
      <form onSubmit={submitOvertime} className={panel}><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.06] text-amber-200"><CalendarClock size={18}/></span><div><h3 className="text-sm font-bold text-white">Advance overtime request</h3><p className="mt-1 text-xs leading-5 text-slate-500">Requests must be submitted for a future scheduled shift and approved before overtime begins.</p></div></div><label className="mt-4 block text-xs font-semibold text-slate-300">Future work date<input className={input} type="date" min={plusDays(localDate(new Date()),1)} value={overtimeDate} onChange={(e)=>setOvertimeDate(e.target.value)} required/></label><label className="mt-3 block text-xs font-semibold text-slate-300">Requested overtime (minutes)<input className={input} type="number" min={1} max={1440} step={1} value={minutes} onChange={(e)=>setMinutes(e.target.value)} required/></label><label className="mt-3 block text-xs font-semibold text-slate-300">Reason<textarea className={input} rows={3} maxLength={500} value={overtimeReason} onChange={(e)=>setOvertimeReason(e.target.value)} placeholder="Explain why overtime is needed" required/></label><div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100/80">Submitting a request does not authorize overtime. Wait for an approval before working beyond your shift.</div><button className={`${button} mt-4 w-full`} type="submit" disabled={Boolean(saving)}><Send size={15}/>{saving==="overtime"?"Submitting…":"Request overtime"}</button></form>
    </div>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2"><RequestList title="My correction requests" rows={corrections} loading={loading}/><RequestList title="My overtime requests" rows={overtime} loading={loading}/></div>
  </section>;
}
function RequestList({title,rows,loading}:{title:string;rows:Row[];loading:boolean}) { return <article className={panel}><h3 className="text-sm font-bold text-white">{title}</h3>{loading?<p className="mt-3 text-xs text-slate-500">Loading…</p>:rows.length===0?<p className="mt-3 rounded-xl border border-dashed border-white/[0.1] p-3 text-xs text-slate-500">No personal requests returned.</p>:<div className="mt-3 divide-y divide-white/[0.06]">{rows.slice(0,5).map((row,index)=><div key={read(row,"id")||index} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="text-xs font-semibold text-slate-200">{read(row,"workDate","work_date")||read(row,"requestedAt","requested_at")||"Request"}</p><p className="mt-1 break-words text-xs text-slate-500">{read(row,"reason")||`${read(row,"requestedMinutes","requested_minutes")} minutes`}</p></div><span className="shrink-0 rounded-full border border-sky-300/15 bg-sky-300/[0.05] px-2 py-1 text-[10px] font-bold text-sky-200">{read(row,"status")||"Unknown"}</span></div>)}</div>}</article>; }

