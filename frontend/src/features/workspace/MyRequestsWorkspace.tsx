"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarClock, Clock3, FileClock, Plus } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { useAttendanceRefresh } from "@/lib/attendance-events";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { formatDate, getISODateInTimeZone, humanize, zonedDateTimeToOffsetISO } from "@/lib/format";

interface CorrectionRequest { id: string; employeeId: string; eventType: string; requestedAt: string; workDate: string; reason: string; status: string; reviewerNote?: string | null; createdAt: string }
interface OvertimeRequest { id: string; employeeId: string; workDate: string; requestType: string; requestedMinutes: number; approvedMinutes?: number | null; reason: string; status: string; reviewerNote?: string | null; requestedAt: string }
interface AttendanceEvent { id: string; eventType: "CLOCK_IN" | "CLOCK_OUT"; recordedAt: string; source: string }
interface CalendarEntry { employeeId: string; workDate: string; events?: AttendanceEvent[] }

export function MyRequestsWorkspace() {
  const { user, timeZone, workDate } = useWorkspace();
  const organizationToday = workDate || getISODateInTimeZone(timeZone);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRequest[]>([]);
  const [recentEvents, setRecentEvents] = useState<{ id: string; eventType: "CLOCK_IN" | "CLOCK_OUT"; recordedAt: string; workDate: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadSequenceRef = useRef(0);
  const [correctionDateTouched, setCorrectionDateTouched] = useState(false);
  const [tab, setTab] = useState<"all" | "corrections" | "overtime">("all");
  const [drawer, setDrawer] = useState<"correction" | "overtime" | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestMode, setRequestMode] = useState<"existing" | "missing">("existing");
  const [eventId, setEventId] = useState("");
  const [eventType, setEventType] = useState<"CLOCK_IN" | "CLOCK_OUT">("CLOCK_IN");
  const [correctionDate, setCorrectionDate] = useState(organizationToday);
  useEffect(() => { if (!correctionDateTouched) setCorrectionDate(organizationToday); }, [organizationToday, correctionDateTouched]);
  const [correctionTime, setCorrectionTime] = useState("08:00");
  const [correctionReason, setCorrectionReason] = useState("");
  const [overtimeDate, setOvertimeDate] = useState("");
  const [overtimeMinutes, setOvertimeMinutes] = useState("60");
  const [overtimeReason, setOvertimeReason] = useState("");

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!silent) setLoading(true); setError("");
    try {
      const suffix = user.role === "HR_MANAGER" || user.role === "DEPARTMENT_MANAGER" ? "?scope=self" : "";
      const [correctionResult, overtimeResult, calendarResult] = await Promise.all([
        apiRequest<{ requests?: CorrectionRequest[] }>(`/attendance/corrections${suffix}`),
        apiRequest<{ requests?: OvertimeRequest[] }>(`/attendance/overtime${suffix}`),
        apiRequest<{ entries?: CalendarEntry[] }>(makeCalendarUrl(user.role, organizationToday)),
      ]);
      if (requestId !== loadSequenceRef.current) return;
      const ownCorrections = (correctionResult.requests ?? []).filter((item) => user.role === "DEPARTMENT_MANAGER" ? item.employeeId === user.employeeId : true);
      const ownOvertime = (overtimeResult.requests ?? []).filter((item) => user.role === "DEPARTMENT_MANAGER" ? item.employeeId === user.employeeId : true);
      setCorrections(ownCorrections);
      setOvertime(ownOvertime);
      const events = (calendarResult.entries ?? []).filter((entry) => entry.employeeId === user.employeeId).flatMap((entry) => (entry.events ?? []).filter((event) => event.source === "ATTENDANCE_EVENT" && event.id && event.recordedAt).map((event) => ({ id: event.id, eventType: event.eventType, recordedAt: event.recordedAt, workDate: entry.workDate }))).sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt));
      setRecentEvents(events.slice(0, 100));
      if (!eventId && events[0]) { setEventId(events[0].id); setEventType(events[0].eventType); setCorrectionTime(timeInputValue(events[0].recordedAt, timeZone)); }
    } catch (caught) { if (requestId === loadSequenceRef.current) setError(caught instanceof Error ? caught.message : "Unable to load your requests."); }
    finally { if (!silent && requestId === loadSequenceRef.current) setLoading(false); }
  }, [user.role, user.employeeId, organizationToday, eventId]);

  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !drawer && !saving);
  useAttendanceRefresh(() => { void load(true); });

  const pendingCount = useMemo(() => [...corrections, ...overtime].filter((request) => request.status === "PENDING").length, [corrections, overtime]);
  const selectedEvent = recentEvents.find((event) => event.id === eventId);

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const date = requestMode === "existing" ? selectedEvent?.workDate : correctionDate;
      if (!date) throw new Error("Choose an attendance event or work date.");
      const requestedAt = zonedDateTimeToOffsetISO(date, correctionTime, timeZone);
      const body: Record<string, unknown> = { eventType: requestMode === "existing" ? selectedEvent?.eventType : eventType, requestedAt, reason: correctionReason.trim() };
      if (requestMode === "existing") body.originalEventId = selectedEvent?.id;
      else body.workDate = correctionDate;
      await apiRequest("/attendance/corrections", { method: "POST", body: JSON.stringify(body) });
      setDrawer(null); setCorrectionReason(""); setNotice("Your attendance correction request has been submitted for review.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit this correction request."); }
    finally { setSaving(false); }
  }

  async function submitOvertime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/attendance/overtime", { method: "POST", body: JSON.stringify({ requestType: "PREAUTHORIZATION", workDate: overtimeDate, requestedMinutes: Number(overtimeMinutes), reason: overtimeReason.trim() }) });
      setDrawer(null); setOvertimeReason(""); setNotice("Your advance overtime request has been submitted. Wait for approval before working overtime.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit this overtime request."); }
    finally { setSaving(false); }
  }

  const displayedCorrections = corrections.filter((item) => tab === "all" || tab === "corrections");
  const displayedOvertime = overtime.filter((item) => tab === "all" || tab === "overtime");

  return <>
    <PageHeader eyebrow="My workspace" title="My requests" description="Submit an attendance correction or request overtime in advance, then follow the decision here." action={<div style={{ display: "flex", gap: 8 }}><Button size="sm" variant="primary" leading={<Plus size={14} />} onClick={() => { setError(""); setDrawer("correction"); }}>Attendance correction</Button><Button size="sm" variant="secondary" leading={<Clock3 size={14} />} onClick={() => { setError(""); setDrawer("overtime"); }}>Request overtime</Button></div>} />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error && !drawer ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    <div className="request-summary-row"><Panel className="request-summary"><span className="metric-icon"><FileClock size={16} /></span><strong>{pendingCount}</strong><span>Awaiting review</span></Panel><Panel className="request-summary"><span className="metric-icon"><CalendarClock size={16} /></span><strong>{corrections.length}</strong><span>Attendance corrections</span></Panel><Panel className="request-summary"><span className="metric-icon"><Clock3 size={16} /></span><strong>{overtime.length}</strong><span>Overtime requests</span></Panel></div>
    <Panel>
      <div className="toolbar"><div className="toolbar-left"><div className="segmented-tabs" role="tablist" aria-label="Request type">{(["all", "corrections", "overtime"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`segment-tab ${tab === value ? "segment-tab-active" : ""}`} onClick={() => setTab(value)}>{value === "all" ? "All requests" : humanize(value)}</button>)}</div></div><span style={{ color: "var(--muted)", fontSize: 12 }}>{loading ? "Updating…" : `${displayedCorrections.length + displayedOvertime.length} requests`}</span></div>
      {loading && !corrections.length && !overtime.length ? <div className="loading-state">Loading your request history…</div> : null}
      {!loading && !displayedCorrections.length && !displayedOvertime.length ? <div className="empty-state"><div className="state-icon"><FileClock size={18} /></div><h3>No requests yet</h3><p>When you submit an attendance correction or advance overtime request, its status will appear here.</p></div> : null}
      {displayedCorrections.length ? <RequestSection timeZone={timeZone} title="Attendance corrections" items={displayedCorrections.map((item) => ({ id: item.id, title: `${humanize(item.eventType)} · ${formatDate(item.workDate, timeZone)}`, detail: item.reason, status: item.status, createdAt: item.createdAt, note: item.reviewerNote }))} /> : null}
      {displayedOvertime.length ? <RequestSection timeZone={timeZone} title="Advance overtime" items={displayedOvertime.map((item) => ({ id: item.id, title: `${formatDate(item.workDate, timeZone)} · ${formatMinutes(item.requestedMinutes)}`, detail: item.reason, status: item.status, createdAt: item.requestedAt, note: item.reviewerNote, meta: item.status === "PENDING" ? "Awaiting approval" : item.status === "APPROVED" ? `${formatMinutes(item.approvedMinutes ?? 0)} approved` : undefined }))} /> : null}
    </Panel>
    <Drawer open={drawer === "correction"} title="Request an attendance correction" description="Request a correction to an existing punch or report a missing punch. All times are interpreted in your organization's timezone." onClose={() => { if (!saving) setDrawer(null); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setDrawer(null)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#correction-request-form")?.requestSubmit()}>Submit request</Button></>}>
      <form id="correction-request-form" onSubmit={submitCorrection}>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-section"><Field label="Request type"><SelectInput value={requestMode} onChange={(e) => setRequestMode(e.target.value as "existing" | "missing")}><option value="existing">Correct an existing attendance event</option><option value="missing">Report a missing punch</option></SelectInput></Field></div>
        {requestMode === "existing" ? <div className="form-section"><Field label="Attendance event" hint="Only your recent original attendance events are listed."><SelectInput required value={eventId} onChange={(e) => { setEventId(e.target.value); const event = recentEvents.find((item) => item.id === e.target.value); if (event) { setEventType(event.eventType); setCorrectionTime(timeInputValue(event.recordedAt, timeZone)); } }}><option value="">Choose event</option>{recentEvents.map((event) => <option key={event.id} value={event.id}>{humanize(event.eventType)} · {formatDate(event.workDate, timeZone)} · {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(event.recordedAt))}</option>)}</SelectInput></Field>{selectedEvent ? <div className="form-note"><CalendarClock size={14} /> This correction keeps the original work date, {formatDate(selectedEvent.workDate, timeZone)}.</div> : <p className="field-hint">No recent original events are available to select. Use the missing-punch option if you need to report a punch that was not recorded.</p>}</div> : <div className="form-section"><div className="form-grid"><Field label="Work date"><TextInput type="date" required max={organizationToday} value={correctionDate} onChange={(e) => { setCorrectionDateTouched(true); setCorrectionDate(e.target.value); }} /></Field><Field label="Missing event"><SelectInput value={eventType} onChange={(e) => setEventType(e.target.value as "CLOCK_IN" | "CLOCK_OUT")}><option value="CLOCK_IN">Clock in</option><option value="CLOCK_OUT">Clock out</option></SelectInput></Field></div></div>}
        <div className="form-section"><Field label="Correct time" hint={`Use the organization's timezone: ${timeZone}. The server validates the work date and offset.`}><TextInput required type="time" value={correctionTime} onChange={(e) => setCorrectionTime(e.target.value)} /></Field><Field label="Reason" hint="Required. Maximum 500 characters."><TextArea required minLength={1} maxLength={500} rows={3} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="Explain what happened and why this attendance record needs correction." /></Field></div>
      </form>
    </Drawer>
    <Drawer open={drawer === "overtime"} title="Request overtime in advance" description="This is a pre-approval request. You must wait for approval before working overtime." onClose={() => { if (!saving) setDrawer(null); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setDrawer(null)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#overtime-request-form")?.requestSubmit()}>Submit request</Button></>}>
      <form id="overtime-request-form" onSubmit={submitOvertime}>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-section"><div className="form-note"><ShieldCheckIcon /> Choose a future work date with an active assigned shift. The backend checks shift eligibility.</div><div className="form-grid" style={{ marginTop: 14 }}><Field label="Work date"><TextInput required type="date" min={nextDate(organizationToday)} value={overtimeDate} onChange={(e) => setOvertimeDate(e.target.value)} /></Field><Field label="Requested time (minutes)" hint="Whole number from 1 to 1440."><TextInput required type="number" min={1} max={1440} step={1} value={overtimeMinutes} onChange={(e) => setOvertimeMinutes(e.target.value)} /></Field></div><Field label="Reason" hint="Required. Maximum 500 characters."><TextArea required maxLength={500} rows={3} value={overtimeReason} onChange={(e) => setOvertimeReason(e.target.value)} placeholder="Explain why additional working time is needed." /></Field></div>
      </form>
    </Drawer>
  </>;
}

function timeInputValue(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "08:00";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : "08:00";
  } catch {
    return "08:00";
  }
}

function makeCalendarUrl(role: string, date: string) {
  const start = new Date(`${date}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 30);
  const fromDate = start.toISOString().slice(0, 10);
  const params = new URLSearchParams({ fromDate, toDate: date });
  if (role === "HR_MANAGER" || role === "DEPARTMENT_MANAGER") params.set("scope", "self");
  return `/attendance/calendar?${params.toString()}`;
}
function nextDate(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function formatMinutes(value: number) { const hours = Math.floor(value / 60); const minutes = value % 60; return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function formatRequestTimestamp(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(date);
  } catch {
    return value;
  }
}

function RequestSection({ title, items, timeZone }: { title: string; timeZone: string; items: { id: string; title: string; detail: string; status: string; createdAt: string; note?: string | null; meta?: string }[] }) {
  return <section className="request-section"><header className="request-section-heading"><h3>{title}</h3><span>{items.length}</span></header>{items.map((item) => <article className="request-item" key={item.id}><div className="request-item-main"><strong>{item.title}</strong><p>{item.detail}</p>{item.note ? <small>Reviewer: {item.note}</small> : null}</div><div className="request-item-side"><StatusBadge value={item.status} />{item.meta ? <small>{item.meta}</small> : null}<small>{formatRequestTimestamp(item.createdAt, timeZone)}</small></div></article>)}</section>;
}
function ShieldCheckIcon() { return <CalendarClock size={15} />; }
