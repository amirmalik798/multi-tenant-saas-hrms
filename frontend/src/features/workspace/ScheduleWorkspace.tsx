"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarClock, CalendarRange, Plus, Power, PowerOff, UserRound, Users } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { formatDate, getISODateInTimeZone, humanize } from "@/lib/format";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { loadAllPages } from "@/lib/paginated-data";

interface ScheduleDay { dayOfWeek: number; startTime: string; endTime: string; breakMinutes: number }
interface Schedule { id: string; name: string; description: string | null; status: string; days: ScheduleDay[] }
interface Assignment { id: string; employeeId: string; employeeCode: string; firstName: string; lastName: string; departmentName: string | null; scheduleId: string; scheduleName: string; effectiveFrom: string; effectiveTo: string | null; days: ScheduleDay[] }
interface Person { id: string; first_name: string; last_name: string; employee_code: string; workforce_role: string; department_name?: string | null }
const weekdays = [{ value: 1, label: "Monday", short: "Mon" }, { value: 2, label: "Tuesday", short: "Tue" }, { value: 3, label: "Wednesday", short: "Wed" }, { value: 4, label: "Thursday", short: "Thu" }, { value: 5, label: "Friday", short: "Fri" }, { value: 6, label: "Saturday", short: "Sat" }, { value: 7, label: "Sunday", short: "Sun" }];
const defaultDays = (): ScheduleDay[] => weekdays.slice(0, 5).map((day) => ({ dayOfWeek: day.value, startTime: "08:00", endTime: "17:00", breakMinutes: 60 }));

function SearchIcon() { return <span aria-hidden="true">⌕</span>; }

function formatShiftTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value || "");
  if (!match) return value || "—";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export function ScheduleWorkspace() {
  const { user, workDate, timeZone } = useWorkspace();
  const organizationToday = workDate || getISODateInTimeZone(timeZone);
  const canManage = user.role === "ORGANIZATION_ADMIN" || user.role === "HR_MANAGER";
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"assignments" | "definitions">("assignments");
  const [search, setSearch] = useState("");
  const [scheduleDrawer, setScheduleDrawer] = useState(false);
  const [assignmentDrawer, setAssignmentDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [days, setDays] = useState<ScheduleDay[]>(defaultDays);
  const [personId, setPersonId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(organizationToday);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [statusConfirm, setStatusConfirm] = useState<Schedule | null>(null);
  const loadSequenceRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!silent) setLoading(true); setError("");
    try {
      const assignmentsPromise = apiRequest<{ assignments?: Assignment[] }>("/schedule-assignments");
      const schedulePromise = canManage ? apiRequest<{ schedules?: Schedule[] }>("/schedules?includeInactive=true") : Promise.resolve({ schedules: [] as Schedule[] });
      const peoplePromise = canManage
        ? loadAllPages<Person>(async (page) => {
            const result = await apiRequest<{ employees?: Person[]; pagination?: { totalPages?: number } }>(`/employees?page=${page}&limit=100&status=ACTIVE&sortBy=name&sortOrder=asc`);
            return { items: result.employees ?? [], totalPages: result.pagination?.totalPages };
          }).then((people) => ({ people, error: "" })).catch((caught) => ({
            people: [] as Person[],
            error: caught instanceof Error ? `The eligible workforce list could not be fully loaded: ${caught.message}` : "The eligible workforce list could not be fully loaded.",
          }))
        : Promise.resolve({ people: [] as Person[], error: "" });
      const [assignmentResult, scheduleResult, peopleResult] = await Promise.all([assignmentsPromise, schedulePromise, peoplePromise]);
      if (requestId !== loadSequenceRef.current) return;
      setAssignments(Array.isArray(assignmentResult.assignments) ? assignmentResult.assignments : []);
      setSchedules(Array.isArray(scheduleResult.schedules) ? scheduleResult.schedules : []);
      const eligible = peopleResult.people.filter((person) => {
        const role = (person.workforce_role || "EMPLOYEE").replaceAll("-", "_").toUpperCase();
        if (user.role === "HR_MANAGER") return ["EMPLOYEE", "DEPARTMENT_MANAGER"].includes(role);
        return ["EMPLOYEE", "DEPARTMENT_MANAGER", "HR_MANAGER"].includes(role);
      });
      setPeople(eligible);
      if (peopleResult.error) setError(peopleResult.error);
    } catch (caught) {
      if (requestId === loadSequenceRef.current) setError(caught instanceof Error ? caught.message : "Unable to load schedules.");
    } finally {
      if (!silent && requestId === loadSequenceRef.current) setLoading(false);
    }
  }, [canManage, user.role]);

  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !scheduleDrawer && !assignmentDrawer && !statusConfirm && !saving);
  useEffect(() => { if (effectiveFrom === getISODateInTimeZone(timeZone)) setEffectiveFrom(organizationToday); }, [workDate, effectiveFrom, organizationToday, timeZone]);
  const activeSchedules = useMemo(() => schedules.filter((item) => item.status === "ACTIVE"), [schedules]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleAssignments = useMemo(() => assignments.filter((assignment) =>
    [assignment.firstName, assignment.lastName, `${assignment.firstName} ${assignment.lastName}`, assignment.employeeCode, assignment.departmentName, assignment.scheduleName]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedSearch)),
  ), [assignments, normalizedSearch]);
  const visibleSchedules = useMemo(() => schedules.filter((schedule) =>
    [schedule.name, schedule.description, schedule.status].some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedSearch)),
  ), [schedules, normalizedSearch]);

  function toggleDay(dayOfWeek: number) {
    setDays((current) => current.some((day) => day.dayOfWeek === dayOfWeek)
      ? current.filter((day) => day.dayOfWeek !== dayOfWeek)
      : [...current, { dayOfWeek, startTime: "08:00", endTime: "17:00", breakMinutes: 60 }].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
  }
  function updateDay(dayOfWeek: number, key: keyof ScheduleDay, value: string | number) {
    setDays((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, [key]: value } : day));
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ schedule?: Schedule }>("/schedules", { method: "POST", body: JSON.stringify({ name: scheduleName.trim(), description: scheduleDescription.trim() || null, status: "ACTIVE", days }) });
      setScheduleDrawer(false); setScheduleName(""); setScheduleDescription(""); setDays(defaultDays()); setNotice(`Schedule ${result.schedule?.name || scheduleName} created.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create the schedule."); }
    finally { setSaving(false); }
  }

  async function changeScheduleStatus(schedule: Schedule) {
    if (schedule.status === "ACTIVE") {
      setStatusConfirm(schedule);
      return;
    }
    await saveScheduleStatus(schedule);
  }

  async function saveScheduleStatus(schedule: Schedule) {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/schedules/${schedule.id}`, { method: "PATCH", body: JSON.stringify({ status: schedule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }) });
      setStatusConfirm(null);
      setNotice(`Schedule ${schedule.name} updated.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update this schedule."); }
    finally { setSaving(false); }
  }

  async function assignSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/schedule-assignments", { method: "POST", body: JSON.stringify({ employeeId: personId, scheduleId, effectiveFrom, effectiveTo: effectiveTo || null }) });
      setAssignmentDrawer(false); setPersonId(""); setScheduleId(""); setEffectiveTo(""); setNotice("The schedule has been assigned. The backend validated the effective period and any overlap."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to assign this schedule."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Time & work" title={user.role === "EMPLOYEE" ? "My schedule" : user.role === "DEPARTMENT_MANAGER" ? "Team schedule" : "Schedules"} description={user.role === "EMPLOYEE" ? "See the shifts assigned to you and the dates they apply." : user.role === "DEPARTMENT_MANAGER" ? "Review shift coverage for your assigned departments." : "Define working patterns and assign them to eligible workforce members."} action={canManage ? <div style={{ display: "flex", gap: 8 }}><Button variant="secondary" leading={<Plus size={14} />} onClick={() => { setError(""); setAssignmentDrawer(true); }}>Assign schedule</Button><Button variant="primary" leading={<Plus size={14} />} onClick={() => { setError(""); setScheduleDrawer(true); }}>Create schedule</Button></div> : undefined} />
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error && !scheduleDrawer && !assignmentDrawer ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    <Panel>
      <div className="toolbar"><div className="toolbar-left" style={{ flexWrap: "wrap" }}><div className="segmented-tabs" role="tablist" aria-label="Schedule view"><button type="button" role="tab" aria-selected={tab === "assignments"} className={`segment-tab ${tab === "assignments" ? "segment-tab-active" : ""}`} onClick={() => setTab("assignments")}>Assignments</button>{canManage ? <button type="button" role="tab" aria-selected={tab === "definitions"} className={`segment-tab ${tab === "definitions" ? "segment-tab-active" : ""}`} onClick={() => setTab("definitions")}>Schedule definitions</button> : null}</div>{user.role !== "EMPLOYEE" ? <label className="search-field" style={{ minWidth: 250 }}><SearchIcon /><input aria-label="Search schedules and assignments" type="search" placeholder="Search employee name, code, department…" value={search} onChange={(event) => setSearch(event.target.value)} /></label> : null}</div><span style={{ fontSize: 11, color: "var(--muted)" }}>{loading ? "Loading…" : tab === "assignments" ? `${visibleAssignments.length} of ${assignments.length} assignments` : `${visibleSchedules.length} of ${schedules.length} schedules`}</span></div>
      {loading && !assignments.length && !schedules.length ? <div className="loading-state">Loading schedule information…</div> : null}
      {tab === "assignments" ? visibleAssignments.length ? <div className="schedule-list">{visibleAssignments.map((assignment) => <article className="schedule-assignment" key={assignment.id}><ProfilePhoto name={`${assignment.firstName} ${assignment.lastName}`} employeeId={assignment.employeeId} className="user-avatar" /><div className="schedule-assignment-person"><strong>{assignment.firstName} {assignment.lastName}</strong><span>{assignment.employeeCode} · {assignment.departmentName || "No department"}</span></div><div className="schedule-assignment-pattern"><strong>{assignment.scheduleName}</strong><span>{(assignment.days || []).map((day) => { const label = weekdays.find((item) => item.value === day.dayOfWeek)?.short; return `${label || "Day"} ${formatShiftTime(day.startTime)}–${formatShiftTime(day.endTime)}`; }).join(" · ") || "Shift pattern unavailable"}</span></div><div className="schedule-assignment-dates"><span>{formatDate(assignment.effectiveFrom, timeZone)}</span><span>{assignment.effectiveTo ? `Until ${formatDate(assignment.effectiveTo, timeZone)}` : "Ongoing"}</span></div></article>)}</div> : <div className="empty-state"><div className="state-icon"><CalendarRange size={18} /></div><h3>{assignments.length ? "No matching assignments" : "No schedule assignments"}</h3><p>{assignments.length ? "Try another employee name, employee code, department or schedule name." : user.role === "EMPLOYEE" ? "Your assigned shifts will appear here once your manager has scheduled you." : "There are no schedule assignments in the data available to this workspace."}</p></div> : visibleSchedules.length ? <div className="schedule-definition-grid">{visibleSchedules.map((schedule) => <article className="schedule-definition" key={schedule.id}><div className="schedule-definition-head"><span className="metric-icon"><CalendarClock size={16} /></span><StatusBadge value={schedule.status} /></div><h3>{schedule.name}</h3><p>{schedule.description || "No additional description."}</p><div className="schedule-weekdays">{weekdays.map((day) => { const scheduleDay = schedule.days?.find((value) => value.dayOfWeek === day.value); return <div key={day.value} className={scheduleDay ? "schedule-weekday-active" : ""}><span>{day.short}</span>{scheduleDay ? <strong>{formatShiftTime(scheduleDay.startTime)}–{formatShiftTime(scheduleDay.endTime)}</strong> : <small>—</small>}</div>; })}</div><div className="schedule-definition-footer"><span>{schedule.days?.length || 0} scheduled days</span><button type="button" className={`icon-button status-icon-action ${schedule.status === "ACTIVE" ? "status-action-deactivate" : "status-action-activate"}`} disabled={saving} title={schedule.status === "ACTIVE" ? "Deactivate schedule" : "Activate schedule"} aria-label={schedule.status === "ACTIVE" ? `Deactivate ${schedule.name}` : `Activate ${schedule.name}`} onClick={() => void changeScheduleStatus(schedule)}>{schedule.status === "ACTIVE" ? <PowerOff size={16} /> : <Power size={16} />}</button></div></article>)}</div> : <div className="empty-state"><div className="state-icon"><CalendarClock size={18} /></div><h3>{schedules.length ? "No matching schedules" : "No schedules defined"}</h3><p>{schedules.length ? "Try a different schedule name or status." : "Create a working pattern, then assign it to eligible workforce members."}</p></div>}
    </Panel>
    <Drawer open={scheduleDrawer} title="Create work schedule" description="Define the days and hours for this working pattern. Overnight shifts are supported by the backend." onClose={() => { if (!saving) setScheduleDrawer(false); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setScheduleDrawer(false)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#schedule-definition-form")?.requestSubmit()}>Create schedule</Button></>}>
      <form id="schedule-definition-form" onSubmit={createSchedule}>
        {error ? <div role="alert" className="form-error">{error}</div> : null}
        <div className="form-section"><Field label="Schedule name"><TextInput required maxLength={100} value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="e.g. Standard day shift" /></Field><Field label="Description (optional)"><TextArea maxLength={500} rows={2} value={scheduleDescription} onChange={(e) => setScheduleDescription(e.target.value)} placeholder="Describe when this schedule should be used." /></Field></div>
        <div className="form-section"><h3 className="form-section-title">Working days</h3>{weekdays.map((day) => { const selected = days.find((item) => item.dayOfWeek === day.value); return <div className="schedule-day-row" key={day.value}><label><input type="checkbox" checked={Boolean(selected)} onChange={() => toggleDay(day.value)} /> <span>{day.label}</span></label>{selected ? <div className="schedule-day-fields"><Field label="Start"><TextInput type="time" required value={selected.startTime} onChange={(e) => updateDay(day.value, "startTime", e.target.value)} /></Field><Field label="End"><TextInput type="time" required value={selected.endTime} onChange={(e) => updateDay(day.value, "endTime", e.target.value)} /></Field><Field label="Break (min)"><TextInput type="number" min={0} max={1439} required value={selected.breakMinutes} onChange={(e) => updateDay(day.value, "breakMinutes", Number(e.target.value))} /></Field></div> : <span className="schedule-day-off">Not scheduled</span>}</div>; })}</div>
        <p className="form-note">After a schedule has assignments, the backend prevents changing its weekday/time pattern to preserve historical records. Create a new schedule when the pattern needs to change.</p>
      </form>
    </Drawer>
    <Drawer open={assignmentDrawer} title="Assign a schedule" description="Choose an active workforce member, an active schedule, and the effective period. Existing overlapping assignments are rejected by the backend." onClose={() => { if (!saving) setAssignmentDrawer(false); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setAssignmentDrawer(false)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#schedule-assignment-form")?.requestSubmit()}>Assign schedule</Button></>}>
      <form id="schedule-assignment-form" onSubmit={assignSchedule}>
        {error ? <div role="alert" className="form-error">{error}</div> : null}
        <div className="form-section"><Field label="Workforce member"><SelectInput required value={personId} onChange={(e) => setPersonId(e.target.value)}><option value="">Select a person</option>{people.map((person) => <option value={person.id} key={person.id}>{person.first_name} {person.last_name} · {person.employee_code} · {humanize(person.workforce_role)}</option>)}</SelectInput></Field><Field label="Schedule"><SelectInput required value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}><option value="">Select a schedule</option>{activeSchedules.map((schedule) => <option value={schedule.id} key={schedule.id}>{schedule.name}</option>)}</SelectInput></Field><div className="form-grid"><Field label="Effective from"><TextInput required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></Field><Field label="Effective until (optional)"><TextInput type="date" min={effectiveFrom} value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} /></Field></div></div>
        <div className="form-note"><Users size={14} /> Schedule changes affect expected attendance from the effective date. Historical recorded attendance cannot be silently reinterpreted by changing an assigned schedule's pattern.</div>
      </form>
    </Drawer>
    <Drawer open={Boolean(statusConfirm)} title="Deactivate schedule?" description="This schedule will no longer be available for new assignments. Existing assignments and historical attendance records remain unchanged." onClose={() => { if (!saving) setStatusConfirm(null); }} width="standard" footer={<><Button variant="secondary" disabled={saving} onClick={() => setStatusConfirm(null)}>Keep active</Button><Button variant="danger" busy={saving} onClick={() => statusConfirm && void saveScheduleStatus(statusConfirm)}>Deactivate schedule</Button></>}>
      {statusConfirm ? <div className="form-section"><div className="form-note"><CalendarClock size={15} /> {statusConfirm.name}</div><p className="field-hint">People already assigned to this schedule keep their existing historical and effective-date records. New assignments cannot use an inactive schedule.</p></div> : null}
    </Drawer>
  </>;
}
