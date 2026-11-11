"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Clock3, ExternalLink, ShieldCheck } from "lucide-react";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Row = Record<string, unknown>;
type Payload = { entries?: Row[]; holidays?: Row[]; requests?: Row[]; message?: string };

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
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  } catch { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
}
function plusDays(date: string, count: number): string {
  const parsed = new Date(`${date}T12:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + count);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth()+1).padStart(2,"0")}-${String(parsed.getUTCDate()).padStart(2,"0")}`;
}
function dateLabel(value: string): string {
  if (!value) return "Date not provided";
  const parsed = new Date(`${value.slice(0,10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(parsed);
}
function timeLabel(value: string, timeZone: string): string {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  try { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(parsed); }
  catch { return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }); }
}
async function get(path: string): Promise<Payload> {
  const response = await fetch(`/api/backend${path}`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => null) as Payload | null;
  if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status}).`);
  return payload ?? {};
}

export default function DepartmentManagerMyDay({ employeeId, organizationTimeZone }: { employeeId: string; organizationTimeZone: string }) {
  const [shift, setShift] = useState<Row | null>(null);
  const [holidays, setHolidays] = useState<Row[]>([]);
  const [leaveToday, setLeaveToday] = useState<Row | null>(null);
  const [holidayToday, setHolidayToday] = useState<Row | null>(null);
  const [timeZone, setTimeZone] = useState(organizationTimeZone || "Africa/Kigali");
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError("");
    try {
      const requestedToday = dateInZone(new Date(), timeZone);
      const [calendar, holidayData, leaveData] = await Promise.all([
        get(`/attendance/calendar?fromDate=${encodeURIComponent(requestedToday)}&toDate=${encodeURIComponent(plusDays(requestedToday, 30))}`),
        get(`/leave/holidays?fromDate=${encodeURIComponent(requestedToday)}&toDate=${encodeURIComponent(plusDays(requestedToday, 90))}`),
        get("/leave/requests"),
      ]);
      const entries = Array.isArray(calendar.entries) ? calendar.entries : [];
      const zone = entries.find((row) => read(row, "timeZone", "time_zone")) ? read(entries.find((row) => read(row, "timeZone", "time_zone")), "timeZone", "time_zone") : timeZone;
      const tenantToday = dateInZone(new Date(), zone);
      setTimeZone(zone); setToday(tenantToday);
      const todayShift = entries.find((row) => read(row, "employeeId", "employee_id") === employeeId && read(row, "workDate", "work_date").slice(0, 10) === tenantToday) ?? null;
      setShift(todayShift);
      const holidayRows = Array.isArray(holidayData.holidays) ? holidayData.holidays : [];
      const normalizedHolidayDate = (row: Row) => read(row, "holidayDate", "holiday_date", "date", "workDate").slice(0, 10);
      const matchingHoliday = holidayRows.find((row) => normalizedHolidayDate(row) === tenantToday) ?? null;
      setHolidayToday(matchingHoliday);
      const leaveRows = Array.isArray(leaveData.requests) ? leaveData.requests : [];
      const matchingLeave = leaveRows.find((row) =>
        read(row, "employeeId", "employee_id") === employeeId &&
        read(row, "status").toUpperCase() === "APPROVED" &&
        read(row, "startDate", "start_date").slice(0, 10) <= tenantToday &&
        read(row, "endDate", "end_date").slice(0, 10) >= tenantToday
      ) ?? null;
      setLeaveToday(matchingLeave);
      setHolidays(holidayRows.filter((row) => {
        const date = normalizedHolidayDate(row);
        return date && date >= tenantToday && date <= plusDays(tenantToday, 90);
      }).sort((a,b) => normalizedHolidayDate(a).localeCompare(normalizedHolidayDate(b))).slice(0,4));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load today's shift and holiday information.");
      setShift(null); setHolidays([]); setLeaveToday(null); setHolidayToday(null);
    } finally { setLoading(false); }
  }, [employeeId, organizationTimeZone, timeZone]);

  useEffect(() => { void load(); }, [load]);
  useWorkspaceAutoRefresh(() => load(true), {
    intervalMs: 60_000,
    shouldRefresh: () => !loading,
  });

  return <section className="mb-5 grid min-w-0 gap-4 xl:grid-cols-[1.1fr_.9fr]">
    <article className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-200"><CalendarClock size={19}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">My day</p><h2 className="mt-1 text-lg font-bold text-white">Today's shift</h2><p className="mt-1 text-xs leading-5 text-slate-500">{today ? dateLabel(today) : "Organization work date"} · {timeZone}</p></div></div></div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.05] p-3 text-sm text-rose-200">{error}</p> : loading ? <p className="mt-5 text-sm text-slate-400">Checking your assigned shift and time-off status…</p> : leaveToday ? <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4"><p className="text-sm font-bold text-amber-100">Approved leave today</p><p className="mt-1 text-xs leading-5 text-amber-100/80">{read(leaveToday,"leaveType","leave_type").replaceAll("_"," ").toLowerCase().replace(/\\b\\w/g,(letter) => letter.toUpperCase()) || "Approved leave"} is approved for today. Your planned shift is not shown as a working shift.</p></div> : holidayToday ? <div className="dm-myday-holiday-notice mt-5 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] p-4"><p className="text-sm font-bold text-violet-100">Public holiday today</p><p className="dm-myday-holiday-detail mt-1 text-xs leading-5 text-violet-100/80">{read(holidayToday,"name") || "Organization public holiday"}. Your planned shift is not shown as a normal working shift.</p></div> : shift && read(shift,"scheduleName","schedule_name") ? <div className="mt-5 rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-4"><p className="dm-myday-shift-name text-base font-bold text-white">{read(shift,"scheduleName","schedule_name")}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Starts</p><p className="mt-1 text-sm font-bold text-slate-100">{timeLabel(read(shift,"expectedStart","expected_start"), read(shift,"timeZone","time_zone") || timeZone)}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ends</p><p className="mt-1 text-sm font-bold text-slate-100">{timeLabel(read(shift,"expectedEnd","expected_end"), read(shift,"timeZone","time_zone") || timeZone)}</p></div></div>{read(shift,"scheduledBreakMinutes","scheduled_break_minutes") && <p className="mt-3 text-xs text-slate-400">Scheduled break: {read(shift,"scheduledBreakMinutes","scheduled_break_minutes")} minutes</p>}<p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck size={13}/> Actual hours come from recorded attendance, not the planned shift.</p></div> : <div className="mt-5 rounded-xl border border-dashed border-white/[0.1] p-4"><p className="text-sm font-semibold text-slate-200">No shift assigned for today</p><p className="mt-1 text-xs leading-5 text-slate-500">Check your schedule or contact your HR Manager if you expect to work today.</p></div>}
      <Link href="/dm/schedule" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-300 hover:text-sky-200">View full schedule <ExternalLink size={13}/></Link>
    </article>

    <article className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-5">
      <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-300/[0.07] text-violet-200"><CalendarDays size={19}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-300">Plan ahead</p><h2 className="mt-1 text-lg font-bold text-white">Upcoming holidays</h2><p className="mt-1 text-xs leading-5 text-slate-500">Organization public holidays over the next 90 days.</p></div></div>
      {error ? <p className="mt-4 text-sm text-slate-500">Holiday information is unavailable until the source can be verified.</p> : loading ? <p className="mt-4 text-sm text-slate-400">Loading holidays…</p> : holidays.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-white/[0.1] p-4 text-xs leading-5 text-slate-500">No upcoming holidays were returned for this period.</div> : <div className="mt-4 divide-y divide-white/[0.06]">{holidays.map((holiday, index) => <div key={read(holiday,"id") || `${read(holiday,"holidayDate","holiday_date","date")}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{read(holiday,"name","title") || "Public holiday"}</p><p className="mt-1 text-xs text-slate-500">{dateLabel(read(holiday,"holidayDate","holiday_date","date"))}</p></div><span className="dm-upcoming-holiday-paid shrink-0 rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-2 py-1 text-[10px] font-semibold text-violet-200">{(holiday.isPaid === true || holiday.is_paid === true) ? "Paid" : "Holiday"}</span></div>)}</div>}
      <Link href="/dm/leave" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-violet-200 hover:text-violet-100">Leave & holiday calendar <ExternalLink size={13}/></Link>
    </article>
  </section>;
}

