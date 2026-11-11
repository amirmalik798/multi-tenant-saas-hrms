"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, LogIn, LogOut, RefreshCw, ShieldCheck, Timer } from "lucide-react";

type Row = Record<string, unknown>;
type EventRow = Row & { id?: string; employeeId?: string; eventType?: string; recordedAt?: string; workDate?: string; timeZone?: string };
type Payload = { message?: string; events?: EventRow[]; personalEvents?: EventRow[]; clockStatus?: "CLOCKED_IN" | "CLOCKED_OUT"; entries?: Row[]; requests?: Row[]; holidays?: Row[]; timeZone?: string; today?: string };

function read(row: Row | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function dateInZone(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
}
function plusDays(date: string, count: number): string {
  const parsed = new Date(`${date}T12:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + count);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth()+1).padStart(2,"0")}-${String(parsed.getUTCDate()).padStart(2,"0")}`;
}
function timestamp(row: Row): number | null {
  const value = read(row, "recordedAt", "recorded_at", "requestedAt", "requested_at");
  const result = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(result) ? result : null;
}
function duration(ms: number, live = false): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return live ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : h ? `${h}h ${String(m).padStart(2,"0")}m` : `${m}m`;
}
function dateLabel(value: string): string {
  if (!value) return "Date not provided";
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const parsed = dateOnly ? new Date(`${dateOnly}T12:00:00Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(parsed);
}

function workDateOf(event: Row, timeZone: string): string {
  const value = read(event, "workDate", "work_date");
  // PostgreSQL DATE values may arrive from older deployments as ISO timestamps.
  // Keep the calendar date portion instead of comparing the full timestamp.
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (dateOnly) return dateOnly;
  const stamp = timestamp(event);
  return stamp === null ? "" : dateInZone(new Date(stamp), read(event, "timeZone") || timeZone);
}

function recordedDateOf(event: Row, timeZone: string): string {
  const stamp = timestamp(event);
  if (stamp !== null) {
    return dateInZone(new Date(stamp), read(event, "timeZone") || timeZone);
  }
  return workDateOf(event, timeZone);
}
function timeLabel(value?: string, timeZone?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true, ...(timeZone ? { timeZone } : {}) }).format(date); }
  catch { return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
}
async function get(path: string): Promise<Payload> {
  const response = await fetch(`/api/backend${path}`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => null) as Payload | null;
  if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status}).`);
  return payload ?? {};
}

export default function DepartmentManagerSelfAttendance({ employeeId, organizationTimeZone = "Africa/Kigali" }: { employeeId: string; organizationTimeZone?: string }) {
  const [status, setStatus] = useState<"CLOCKED_IN" | "CLOCKED_OUT" | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [todayEntry, setTodayEntry] = useState<Row | null>(null);
  const [leaveToday, setLeaveToday] = useState<Row | null>(null);
  const [holidayToday, setHolidayToday] = useState<Row | null>(null);
  const [timeZone, setTimeZone] = useState(organizationTimeZone || "Africa/Kigali");
  const [today, setToday] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const assumedZone = organizationTimeZone || timeZone || "Africa/Kigali";
      const day = dateInZone(new Date(), assumedZone);
      const query = `fromDate=${encodeURIComponent(plusDays(day,-2))}&toDate=${encodeURIComponent(plusDays(day,14))}`;
      const [eventData, calendarData, leaveData, holidayData] = await Promise.all([
        get("/attendance/events"), get(`/attendance/calendar?${query}`), get("/leave/requests"),
        get(`/leave/holidays?fromDate=${encodeURIComponent(day)}&toDate=${encodeURIComponent(plusDays(day,90))}`),
      ]);
      const zone = calendarData.timeZone || eventData.events?.find((event) => event.timeZone)?.timeZone || assumedZone;
      const orgToday = calendarData.today || dateInZone(new Date(), zone);
      if (eventData.clockStatus !== "CLOCKED_IN" && eventData.clockStatus !== "CLOCKED_OUT") throw new Error("Your personal clock status could not be verified. Refresh before recording time.");
      setStatus(eventData.clockStatus); setTimeZone(zone); setToday(orgToday);
      const ownEvents = (eventData.personalEvents ?? eventData.events ?? [])
        .filter((event) => event.employeeId === employeeId && ["CLOCK_IN","CLOCK_OUT"].includes(String(event.eventType).toUpperCase()));
      setEvents(ownEvents.sort((a,b) => (timestamp(b) ?? 0) - (timestamp(a) ?? 0)).slice(0,100));
      const entries = calendarData.entries ?? [];
      setTodayEntry(entries.find((entry) => read(entry,"employeeId","employee_id") === employeeId && read(entry,"workDate","work_date") === orgToday) ?? null);
      const ownLeave = (leaveData.requests ?? []).find((row) => read(row,"employeeId","employee_id") === employeeId && read(row,"status").toUpperCase() === "APPROVED" && read(row,"startDate","start_date").slice(0,10) <= orgToday && read(row,"endDate","end_date").slice(0,10) >= orgToday) ?? null;
      const holiday = (holidayData.holidays ?? []).find((row) => read(row,"holidayDate","holiday_date").slice(0,10) === orgToday) ?? null;
      setLeaveToday(ownLeave); setHolidayToday(holiday);
    } catch (caught) {
      setStatus(null); setError(caught instanceof Error ? caught.message : "Unable to verify your attendance and workday status.");
    } finally { setLoading(false); }
  }, [employeeId, organizationTimeZone, timeZone]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (status !== "CLOCKED_IN") { setNowMs(0); return; }
    setNowMs(Date.now()); const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const clockedIn = status === "CLOCKED_IN";
  const clockInBlocked = Boolean(leaveToday || holidayToday || error);
  const ownTodayEvents = useMemo(() => events.filter((event) => {
    return workDateOf(event, timeZone) === today;
  }).sort((a,b) => (timestamp(a) ?? 0) - (timestamp(b) ?? 0)), [events,today,timeZone]);
  const sessionSummary = useMemo(() => {
    let todayOpenStart: number | null = null;
    let total = 0;
    let completed = 0;
    let lastCompleted: number | null = null;

    // Daily totals are based on today's punches, preserving the existing
    // organization work-date behavior.
    for (const event of ownTodayEvents) {
      const stamp = timestamp(event);
      if (stamp === null) continue;
      const kind = String(event.eventType ?? "").toUpperCase();

      if (kind === "CLOCK_IN" && todayOpenStart === null) {
        todayOpenStart = stamp;
      } else if (kind === "CLOCK_OUT" && todayOpenStart !== null && stamp >= todayOpenStart) {
        const length = stamp - todayOpenStart;
        total += length;
        completed += 1;
        lastCompleted = length;
        todayOpenStart = null;
      }
    }

    // The live session can begin before midnight (for example, an overnight
    // shift), so resolve its unmatched clock-in from the employee's complete
    // returned event history rather than today's events only.
    let openSessionStart: number | null = null;
    const chronologicalEvents = [...events].sort(
      (a, b) => (timestamp(a) ?? 0) - (timestamp(b) ?? 0),
    );

    for (const event of chronologicalEvents) {
      const stamp = timestamp(event);
      if (stamp === null) continue;
      const kind = String(event.eventType ?? "").toUpperCase();

      if (kind === "CLOCK_IN") {
        openSessionStart = stamp;
      } else if (kind === "CLOCK_OUT" && openSessionStart !== null && stamp >= openSessionStart) {
        openSessionStart = null;
      }
    }

    const activeStart = clockedIn ? (openSessionStart ?? todayOpenStart) : null;
    const elapsed = activeStart === null ? null : Math.max(0, (nowMs || Date.now()) - activeStart);

    if (activeStart !== null && elapsed !== null) total += elapsed;

    return {
      total,
      active: elapsed,
      activeStart,
      completed,
      lastCompleted,
    };
  }, [ownTodayEvents, events, clockedIn, nowMs]);

  async function toggleClock() {
    if (status === null || loading || saving || (!clockedIn && clockInBlocked)) return;
    const action = clockedIn ? "CLOCK_OUT" : "CLOCK_IN";
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/backend/attendance/events", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (!response.ok) throw new Error(payload?.message || "Unable to record attendance.");
      window.dispatchEvent(new Event("hrms:attendance-status-changed"));
      setNotice(action === "CLOCK_IN" ? "Clock-in recorded successfully." : "Clock-out recorded successfully.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to record attendance."); }
    finally { setSaving(false); }
  }

  const timeOffTitle = leaveToday ? "Approved leave today" : holidayToday ? "Public holiday today" : error ? "Unable to verify leave or holiday" : "Normal workday";
  const timeOffDetail = leaveToday
    ? `${read(leaveToday,"leaveType","leave_type").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter) => letter.toUpperCase()) || "Leave"} is approved for today. Clock-in is unavailable.`
    : holidayToday ? `${read(holidayToday,"name") || "Organization holiday"}. Clock-in is unavailable for this date.`
    : error ? "Clock-in remains disabled until leave and public-holiday status can be verified." : "No approved leave or public holiday is recorded for today.";

  return <section className="mb-5 overflow-hidden rounded-2xl border border-sky-400/15 bg-gradient-to-br from-[#152438] via-[#131e2d] to-[#111821] shadow-lg shadow-black/10">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.07] p-4 sm:p-5">
      <div className="flex items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200"><Clock3 size={21}/></div><div><p className="dm-personal-attendance-label text-[10px] font-bold uppercase tracking-[.16em] text-sky-200/80">Personal attendance</p><h2 className="mt-1 text-lg font-semibold text-white">{loading ? "Verifying your workday…" : status === null ? "Status unavailable" : clockedIn ? "Your work session is active" : "You are clocked out"}</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">Your attendance, session timer and time-off status, using the same rules as employee self-service.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Refresh</button>
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
      <div className="rounded-xl border border-white/[.07] bg-black/10 p-3.5"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-slate-400"><CalendarDays size={14} className="text-sky-300"/> Today's status</div><p className={`dm-personal-attendance-status mt-2 text-sm font-semibold ${leaveToday ? "text-amber-200" : holidayToday ? "text-sky-200" : error ? "text-rose-200" : "text-emerald-200"}`}>{timeOffTitle}</p><p className="mt-1 text-xs leading-5 text-slate-400">{timeOffDetail}</p>{todayEntry && <p className="mt-2 text-xs text-slate-300">Shift: {read(todayEntry,"scheduleName","schedule_name") || "No shift assigned"}{read(todayEntry,"expectedStart") && read(todayEntry,"expectedEnd") ? ` · ${timeLabel(read(todayEntry,"expectedStart"),timeZone)}–${timeLabel(read(todayEntry,"expectedEnd"),timeZone)}` : ""}</p>}</div>
      <div className="rounded-xl border border-sky-300/15 bg-sky-300/[.04] p-3.5"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-sky-200"><Timer size={14}/>{clockedIn ? "Current work session" : "Time worked today"}{clockedIn && <span className="ml-auto rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold text-emerald-200">LIVE</span>}</div><p className="mt-2 font-mono text-3xl font-bold tracking-tight text-white tabular-nums">{clockedIn ? sessionSummary.active === null ? "Start unavailable" : duration(sessionSummary.active,true) : duration(sessionSummary.total)}</p><p className="mt-1 text-xs leading-5 text-slate-400">{clockedIn ? sessionSummary.activeStart ? `Clocked in at ${timeLabel(new Date(sessionSummary.activeStart).toISOString(),timeZone)}. Timer updates every second.` : "Your clock-in is confirmed, but its starting punch was not included in the attendance history response." : `${sessionSummary.completed} completed session${sessionSummary.completed === 1 ? "" : "s"} today. Elapsed time is separate from payable hours.`}</p></div>
    </div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={`mx-4 rounded-lg px-3 py-2 text-sm sm:mx-5 ${error ? "border border-rose-400/20 bg-rose-400/10 text-rose-200" : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{error || notice}</p>}
    <div className="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-5 sm:pb-5"><button type="button" onClick={() => void toggleClock()} disabled={loading || saving || status === null || (!clockedIn && clockInBlocked)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${clockedIn ? "border border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15" : "bg-sky-400 text-[#07111d] hover:bg-sky-300"}`}>{saving ? <RefreshCw size={17} className="animate-spin"/> : clockedIn ? <LogOut size={17}/> : <LogIn size={17} />}{saving ? "Recording…" : !status ? "Status unavailable" : clockedIn ? "Clock out" : clockInBlocked ? "Clock-in unavailable" : "Clock in"}</button><span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[.07] px-3 text-xs text-slate-400"><ShieldCheck size={14}/> Server-validated · own record only</span></div>
    <div className="border-t border-white/[.07] px-4 py-3 sm:px-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Recent personal attendance events</p>{loading ? <p className="text-sm text-slate-500">Loading attendance history…</p> : events.length === 0 ? <p className="text-sm text-slate-500">No attendance events have been recorded yet.</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{events.slice(0,4).map((event,index) => <div key={event.id ?? `${event.eventType}-${event.recordedAt}-${index}`} className="rounded-xl border border-white/[.06] bg-black/10 px-3 py-2"><p className="text-xs text-slate-500">{String(event.eventType).toUpperCase() === "CLOCK_IN" ? "Clock-in" : "Clock-out"} · {dateLabel(recordedDateOf(event,timeZone))}</p><p className="mt-1 text-sm font-medium text-slate-200">{timeLabel(read(event,"recordedAt","recorded_at"),read(event,"timeZone") || timeZone)}</p></div>)}</div>}</div>
  </section>;
}
