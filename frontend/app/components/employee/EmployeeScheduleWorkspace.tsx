"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEmployeeWorkspaceUser } from "./EmployeeChrome";

type Row = Record<string, unknown>;
type ViewMode = "week" | "agenda";

const PANEL = "min-w-0 rounded-2xl border border-white/[0.08] bg-[#121b29] shadow-lg shadow-black/10";
const SECONDARY = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.11] bg-white/[0.03] px-3.5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50";

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read(row: Row | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function nestedRecord(row: Row | null | undefined, key: string): Row | null {
  if (!row) return null;
  const value = row[key];
  return isRecord(value) ? value : null;
}

function rowsFrom(payload: unknown, key: string): Row[] {
  if (!isRecord(payload)) return [];
  const direct = payload[key];
  if (Array.isArray(direct)) return direct.filter(isRecord);
  if (isRecord(payload.data) && Array.isArray(payload.data[key])) {
    return (payload.data[key] as unknown[]).filter(isRecord);
  }
  return [];
}

function apiError(payload: unknown): string {
  return isRecord(payload) ? read(payload, "message", "error", "detail") : "";
}

async function loadCalendar(fromDate: string, toDate: string): Promise<Row[]> {
  const query = `?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`;
  const response = await fetch(`/api/backend/attendance/calendar${query}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiError(payload) || `Unable to load schedule (HTTP ${response.status}).`);
  }
  return rowsFrom(payload, "entries");
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, amount: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

function monday(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const dayOfWeek = date.getDay();
  date.setDate(date.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));
  return localDate(date);
}

function inTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return localDate(date);
  }
}

function dateOf(row: Row, timeZone: string): string {
  const raw = read(row, "workDate", "work_date", "date");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw.slice(0, 10) : inTimeZone(date, timeZone);
}

function hasAssignedShift(row: Row): boolean {
  return Boolean(read(row, "scheduleName", "schedule_name", "expectedStart", "expected_start", "expectedEnd", "expected_end"));
}

function timeLabel(value: string, timeZone: string): string {
  if (!value) return "—";
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) { const [hours, minutes] = value.split(":").map(Number); if (hours <= 23 && minutes <= 59) return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`; return value; }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(date);
  } catch {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
}

function dateLabel(value: string, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, options ?? { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function sameDayEntries(entries: Row[], date: string, timeZone: string): Row[] {
  return entries.filter((row) => dateOf(row, read(row, "timeZone") || timeZone) === date);
}

export default function EmployeeScheduleWorkspace() {
  const user = useEmployeeWorkspaceUser();
  const [anchorDate, setAnchorDate] = useState("");
  const [entries, setEntries] = useState<Row[]>([]);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Kigali");
  const [view, setView] = useState<ViewMode>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [manuallyNavigated, setManuallyNavigated] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    setClockTick(Date.now());
    const intervalId = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const today = inTimeZone(new Date(clockTick || Date.now()), timeZone);
  useEffect(() => {
    if (!manuallyNavigated) setAnchorDate(today);
  }, [today, manuallyNavigated]);

  const weekStart = anchorDate ? monday(anchorDate) : "";
  const rangeStart = weekStart;
  const rangeEnd = weekStart ? addDays(weekStart, 27) : "";

  useEffect(() => {
    if (!user || user.role !== "EMPLOYEE" || !rangeStart || !rangeEnd) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    loadCalendar(rangeStart, rangeEnd)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        const nextTimeZone = rows.find((row) => read(row, "timeZone"))
          ? read(rows.find((row) => read(row, "timeZone")) ?? {}, "timeZone")
          : "";
        if (nextTimeZone) setTimeZone(nextTimeZone);
      })
      .catch((caught) => {
        if (cancelled) return;
        setEntries([]);
        setError(caught instanceof Error ? caught.message : "Unable to load your schedule.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, rangeStart, rangeEnd, reloadKey]);

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [weekStart]);

  const assignedEntries = useMemo(
    () => entries.filter(hasAssignedShift).sort((a, b) => dateOf(a, read(a, "timeZone") || timeZone).localeCompare(dateOf(b, read(b, "timeZone") || timeZone))),
    [entries, timeZone],
  );

  const selectedDay = selectedDate || (weekDays.includes(today) ? today : weekStart);
  const selectedShifts = useMemo(
    () => sameDayEntries(assignedEntries, selectedDay, timeZone),
    [assignedEntries, selectedDay, timeZone],
  );
  const weekShifts = useMemo(
    () => assignedEntries.filter((row) => weekDays.includes(dateOf(row, read(row, "timeZone") || timeZone))),
    [assignedEntries, weekDays, timeZone],
  );
  const nextShift = assignedEntries.find((row) => dateOf(row, read(row, "timeZone") || timeZone) > today);

  function navigateWeeks(amount: number) {
    if (!weekStart) return;
    const nextWeek = addDays(weekStart, amount * 7);
    setAnchorDate(nextWeek);
    setSelectedDate("");
    setManuallyNavigated(true);
  }

  if (!user || user.role !== "EMPLOYEE") return null;

  return (
    <div className="min-w-0 space-y-6 pb-8 text-slate-100">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300">Plan your work</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">My Schedule</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">See assigned shifts, check upcoming work, and compare the plan with recorded attendance where available.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY} disabled={loading} onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <Link href="/employee/attendance" className={SECONDARY}>Attendance &amp; Time <ArrowRight size={15} /></Link>
        </div>
      </header>

      <section className={`${PANEL} overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Schedule window</p>
            <h2 className="mt-1 text-lg font-bold text-white">{weekStart ? `${dateLabel(weekStart, { day: "numeric", month: "short" })} – ${dateLabel(addDays(weekStart, 6), { day: "numeric", month: "short", year: "numeric" })}` : "Loading dates…"}</h2>
            <p className="mt-1 text-xs text-slate-500">Organization time zone: {timeZone}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={SECONDARY} disabled={!weekStart || loading} onClick={() => navigateWeeks(-1)} aria-label="Previous week"><ArrowLeft size={15} /> Previous</button>
            <button type="button" className={SECONDARY} disabled={!weekStart || loading} onClick={() => { setManuallyNavigated(false); setAnchorDate(today); setSelectedDate(today); }} >Today</button>
            <button type="button" className={SECONDARY} disabled={!weekStart || loading} onClick={() => navigateWeeks(1)} aria-label="Next week">Next <ArrowRight size={15} /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="inline-flex rounded-xl border border-white/[0.09] bg-black/10 p-1" role="group" aria-label="Schedule view">
            {(["week", "agenda"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setView(mode)} aria-pressed={view === mode} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${view === mode ? "bg-sky-300 text-[#061421]" : "text-slate-400 hover:text-white"}`}>
                {mode === "week" ? "Week" : "Agenda"}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">{weekShifts.length} assigned shift{weekShifts.length === 1 ? "" : "s"} this week</p>
        </div>

        {error && (
          <div role="alert" className="mx-4 mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200 sm:mx-5">
            <p className="font-semibold">Schedule unavailable</p>
            <p className="mt-1 leading-6">{error}</p>
            <button type="button" className={`${SECONDARY} mt-3`} onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={14} /> Try again</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 px-5 py-12 text-sm text-slate-400"><RefreshCw size={17} className="animate-spin text-sky-300" />Loading assigned shifts…</div>
        ) : !error && view === "week" ? (
          <div className="grid grid-cols-2 gap-2 p-4 pt-0 sm:grid-cols-4 lg:grid-cols-7 sm:p-5 sm:pt-0">
            {weekDays.map((day) => {
              const shifts = sameDayEntries(assignedEntries, day, timeZone);
              const selected = selectedDay === day;
              return (
                <button key={day} type="button" onClick={() => setSelectedDate(day)} aria-pressed={selected} className={`min-w-0 rounded-xl border p-3 text-left transition ${selected ? "border-sky-300/35 bg-sky-300/[0.09]" : "border-white/[0.07] bg-black/10 hover:border-white/[0.15] hover:bg-white/[0.025]"}`}>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{dateLabel(day, { weekday: "short" })}</span>
                  <span className={`mt-1 block text-lg font-black ${day === today ? "text-sky-200" : "text-white"}`}>{dateLabel(day, { day: "numeric" })}</span>
                  <span className="mt-2 block text-[10px] text-slate-400">{shifts.length ? `${shifts.length} shift${shifts.length === 1 ? "" : "s"}` : "No shift"}</span>
                  {shifts.length > 0 && <span aria-hidden="true" className="mt-2 flex gap-1">{shifts.slice(0, 4).map((shift, index) => <span key={read(shift, "id") || index} className="h-1.5 flex-1 rounded-full bg-sky-300/80" />)}</span>}
                </button>
              );
            })}
          </div>
        ) : !error && view === "agenda" ? (
          <div className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
            {weekShifts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.12] p-8 text-center">
                <CalendarRange size={25} className="mx-auto text-slate-500" />
                <p className="mt-3 text-sm font-semibold text-white">No assigned shifts in this week</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">No scheduled shifts were returned for the displayed week.</p>
              </div>
            ) : weekShifts.map((row, index) => {
              const date = dateOf(row, read(row, "timeZone") || timeZone);
              const zone = read(row, "timeZone") || timeZone;
              return (
                <article key={read(row, "id") || `${date}-${index}`} className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
                      <span className="text-[9px] font-bold uppercase">{dateLabel(date, { month: "short" })}</span>
                      <span className="text-base font-black leading-none">{dateLabel(date, { day: "numeric" })}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold text-white">{read(row, "scheduleName", "schedule_name") || "Assigned shift"}</h3>
                      <p className="mt-1 text-xs text-slate-400">{dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                      {nestedRecord(row, "publicHoliday") && <p className="mt-2 text-xs font-semibold text-violet-300">Public holiday: {read(nestedRecord(row, "publicHoliday"), "name")}{nestedRecord(row, "publicHoliday")?.isPaid === true ? " · Paid" : ""}</p>}
                      {nestedRecord(row, "leaveRequest") && <p className={`mt-2 text-xs font-semibold ${read(nestedRecord(row, "leaveRequest"), "status") === "APPROVED" ? "text-emerald-300" : "text-amber-200"}`}>Leave: {read(nestedRecord(row, "leaveRequest"), "leaveType").replaceAll("_", " ")} · {read(nestedRecord(row, "leaveRequest"), "status")}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Start</p><p className="mt-1 font-mono font-bold text-slate-100">{timeLabel(read(row, "expectedStart", "expected_start"), zone)}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-500">End</p><p className="mt-1 font-mono font-bold text-slate-100">{timeLabel(read(row, "expectedEnd", "expected_end"), zone)}</p></div>
                    {read(row, "scheduledBreakMinutes", "scheduled_break_minutes") && <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Scheduled break</p><p className="mt-1 font-semibold text-slate-200">{read(row, "scheduledBreakMinutes", "scheduled_break_minutes")} min</p></div>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && !error && view === "week" && (
          <div className="border-t border-white/[0.07] p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{selectedDay ? dateLabel(selectedDay, { weekday: "long", day: "numeric", month: "long" }) : "Selected day"}</h3>
                <p className="mt-1 text-xs text-slate-500">Planned schedule, with actual time kept separate.</p>
              </div>
              <Link href="/employee/attendance" className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200">View attendance records <ArrowRight size={14} /></Link>
            </div>
            {selectedShifts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.1] bg-black/10 p-5 text-sm text-slate-400">No assigned shift appears for this day in the returned schedule.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedShifts.map((row, index) => {
                  const zone = read(row, "timeZone") || timeZone;
                  const date = dateOf(row, zone);
                  return (
                    <article key={read(row, "id") || `${date}-${index}`} className="rounded-xl border border-sky-300/15 bg-sky-300/[0.035] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h4 className="break-words text-sm font-bold text-white">{read(row, "scheduleName", "schedule_name") || "Assigned shift"}</h4><p className="mt-1 text-xs text-slate-400">{dateLabel(date, { day: "numeric", month: "short", year: "numeric" })}</p></div>
                        <span className="rounded-lg border border-sky-300/15 bg-sky-300/[0.06] px-2 py-1 text-[10px] font-bold text-sky-200">Scheduled</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-black/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Starts</p><p className="mt-1 text-lg font-black text-white">{timeLabel(read(row, "expectedStart", "expected_start"), zone)}</p></div>
                        <div className="rounded-lg bg-black/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ends</p><p className="mt-1 text-lg font-black text-white">{timeLabel(read(row, "expectedEnd", "expected_end"), zone)}</p></div>
                      </div>
                      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-400"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-sky-300" /> A schedule is the expected shift. Recorded punches are the attendance record.</div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {nextShift && !loading && (
        <section className={`${PANEL} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200"><Clock3 size={18} /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Next upcoming shift</p><p className="mt-1 text-sm font-bold text-white">{read(nextShift, "scheduleName", "schedule_name") || "Assigned shift"}</p><p className="mt-1 text-xs text-slate-400">{dateLabel(dateOf(nextShift, read(nextShift, "timeZone") || timeZone), { weekday: "long", day: "numeric", month: "long" })} · {timeLabel(read(nextShift, "expectedStart", "expected_start"), read(nextShift, "timeZone") || timeZone)}</p></div>
          </div>
          <Link href="/employee/attendance" className={SECONDARY}>Attendance history <ArrowRight size={15} /></Link>
        </section>
      )}
    </div>
  );
}
