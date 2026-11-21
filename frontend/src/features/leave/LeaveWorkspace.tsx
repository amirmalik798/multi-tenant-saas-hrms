"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Clock3, Plus, Trash2, XCircle } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { apiRequest } from "@/lib/api-client";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { formatDate, humanize } from "@/lib/format";

interface LeaveRequest { id: string; employeeId: string; employeeCode?: string; firstName?: string; lastName?: string; departmentName?: string; leaveType: string; startDate: string; endDate: string; isPaid: boolean; reason: string; status: string; reviewerNote?: string | null; isOwnRequest?: boolean; createdAt?: string }
interface Holiday { id: string; holidayDate: string; name: string; isPaid: boolean; notes?: string | null }
type Tab = "requests" | "holidays";

export function LeaveWorkspace() {
  const { user, timeZone } = useWorkspace();
  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [canManageHolidays, setCanManageHolidays] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidayToRemove, setHolidayToRemove] = useState<Holiday | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<LeaveRequest | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | "CANCELLED">("APPROVED");
  const [reviewerNote, setReviewerNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); setError("");
    const [requestResult, holidayResult] = await Promise.allSettled([
      apiRequest<{ requests?: LeaveRequest[] }>("/leave/requests"),
      apiRequest<{ holidays?: Holiday[]; canManage?: boolean }>("/leave/holidays"),
    ]);
    const errors: string[] = [];
    if (requestResult.status === "fulfilled") setRequests(requestResult.value.requests ?? []);
    else errors.push(requestResult.reason instanceof Error ? requestResult.reason.message : "Unable to load leave requests.");
    if (holidayResult.status === "fulfilled") { setHolidays(holidayResult.value.holidays ?? []); setCanManageHolidays(Boolean(holidayResult.value.canManage)); }
    else errors.push(holidayResult.reason instanceof Error ? holidayResult.reason.message : "Unable to load public holidays.");
    setError(errors.join(" · "));
    if (!silent) setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !requestOpen && !holidayOpen && !decisionTarget && !holidayToRemove && !saving);

  const visibleRequests = useMemo(() => requests.filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [item.firstName, item.lastName, item.employeeCode, item.departmentName, item.leaveType, item.status, item.reason].some((value) => String(value ?? "").toLowerCase().includes(needle));
  }), [requests, search]);
  const pending = requests.filter((item) => item.status === "PENDING").length;
  const showRequestActions = visibleRequests.some((item) => {
    const own = Boolean(item.isOwnRequest) || item.employeeId === user.employeeId;
    return (!own && item.status === "PENDING" && ["ORGANIZATION_ADMIN", "HR_MANAGER", "DEPARTMENT_MANAGER"].includes(user.role)) || (own && item.status === "PENDING");
  });

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const startDate = String(form.get("startDate"));
      const endDate = String(form.get("endDate"));
      if (!startDate || !endDate || startDate > endDate) throw new Error("The end date must be on or after the start date.");
      await apiRequest("/leave/requests", { method: "POST", body: JSON.stringify({ leaveType: String(form.get("leaveType")), startDate, endDate, reason: String(form.get("reason")).trim() }) });
      setRequestOpen(false); setLeaveStartDate(""); setLeaveEndDate(""); setNotice("Leave request submitted. Its status will update when it is reviewed."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit your leave request."); }
    finally { setSaving(false); }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!decisionTarget || saving) return;
    if (decision === "REJECTED" && !reviewerNote.trim()) { setError("A reason is required when rejecting a leave request."); return; }
    setSaving(true); setError("");
    try {
      await apiRequest(`/leave/requests/${decisionTarget.id}`, { method: "PATCH", body: JSON.stringify({ status: decision, reviewerNote: reviewerNote.trim() || null }) });
      setDecisionTarget(null); setNotice(decision === "CANCELLED" ? "Your leave request has been cancelled." : `Leave request ${decision.toLowerCase()}.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update this leave request."); }
    finally { setSaving(false); }
  }

  async function submitHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/leave/holidays", { method: "POST", body: JSON.stringify({ holidayDate: String(form.get("holidayDate")), name: String(form.get("name")).trim(), notes: String(form.get("notes")).trim() || null, isPaid: form.get("isPaid") === "on" }) });
      setHolidayOpen(false); setNotice("Public holiday saved."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save the public holiday."); }
    finally { setSaving(false); }
  }

  async function removeHoliday() {
    if (!holidayToRemove) return;
    setSaving(true); setError("");
    try {
      await apiRequest(`/leave/holidays/${holidayToRemove.id}`, { method: "DELETE" });
      setNotice(`${holidayToRemove.name} was removed from the public holiday calendar.`);
      setHolidayToRemove(null);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to remove this public holiday."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Time off" title="Leave & holidays" description="Keep leave requests, review decisions, and organization holidays in one clear view." action={<div style={{ display:"flex", gap:8 }}>{user.role !== "ORGANIZATION_ADMIN" ? <Button variant="primary" leading={<Plus size={14} />} onClick={() => { setError(""); setLeaveStartDate(""); setLeaveEndDate(""); setRequestOpen(true); }}>Request leave</Button> : null}{canManageHolidays ? <Button variant="secondary" leading={<Plus size={14} />} onClick={() => setHolidayOpen(true)}>Add holiday</Button> : null}</div>} />
    {notice ? <div role="status" className="success-callout" style={{ marginBottom: 13 }}><CheckCircle2 size={15} />{notice}</div> : null}
    {error ? <div role="alert" className="form-error" style={{ marginBottom: 13 }}>{error}</div> : null}
    <Panel>
      <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:12, padding:"12px 16px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ display:"flex", gap:5 }}><button type="button" className={`button button-sm ${tab === "requests" ? "button-primary" : "button-ghost"}`} onClick={() => setTab("requests")}>Leave requests <span className="task-count">{requests.length}</span></button><span className="field-hint" style={{ alignSelf: "center" }}>{pending} pending</span><button type="button" className={`button button-sm ${tab === "holidays" ? "button-primary" : "button-ghost"}`} onClick={() => setTab("holidays")}>Public holidays</button></div>
        {tab === "requests" && user.role !== "EMPLOYEE" ? <label className="search-field" style={{ maxWidth:280 }}><CalendarDays size={14} /><input aria-label="Search leave requests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people or request…" /></label> : null}
      </div>
      {loading && !requests.length && !holidays.length ? <div className="loading-state">Loading leave information…</div> : null}
      {tab === "requests" ? visibleRequests.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{user.role !== "EMPLOYEE" ? <th>Person</th> : null}<th>Leave type</th><th>Dates</th><th>Paid</th><th>Reason</th><th>Status</th>{showRequestActions ? <th>Actions</th> : null}</tr></thead><tbody>{visibleRequests.map((item) => {
        const own = Boolean(item.isOwnRequest) || item.employeeId === user.employeeId;
        const canDecide = !own && item.status === "PENDING" && ["ORGANIZATION_ADMIN","HR_MANAGER","DEPARTMENT_MANAGER"].includes(user.role);
        return <tr key={item.id}>{user.role !== "EMPLOYEE" ? <td><div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}><ProfilePhoto name={`${item.firstName ?? (own ? user.displayName : "Employee")} ${item.lastName ?? ""}`.trim()} employeeId={item.employeeId} currentUser={own} className="user-avatar" /><span style={{ minWidth: 0 }}><span className="table-primary">{`${item.firstName ?? (own ? user.displayName : "Employee")} ${item.lastName ?? ""}`.trim()}</span><span className="table-secondary">{item.employeeCode || item.departmentName || (own ? "Your request" : "")}</span></span></div></td> : null}<td>{humanize(item.leaveType)}</td><td><span className="table-primary">{formatDate(item.startDate, timeZone)}</span><span className="table-secondary">to {formatDate(item.endDate, timeZone)}</span></td><td><StatusBadge value={item.isPaid ? "PAID" : "UNPAID"} /></td><td style={{ maxWidth:220 }}><span className="table-secondary">{item.reason}</span></td><td><StatusBadge value={item.status} /></td>{showRequestActions ? <td><div style={{ display:"flex", justifyContent:"flex-end", gap:5 }}>{canDecide ? <><Button size="sm" variant="secondary" leading={<CheckCircle2 size={13} />} onClick={() => {setDecisionTarget(item);setDecision("APPROVED");setReviewerNote("");}}>Approve</Button><Button size="sm" variant="ghost" leading={<XCircle size={13} />} onClick={() => {setDecisionTarget(item);setDecision("REJECTED");setReviewerNote("");}}>Reject</Button></> : null}{own && item.status === "PENDING" ? <Button size="sm" variant="ghost" onClick={() => {setDecisionTarget(item);setDecision("CANCELLED");setReviewerNote("");}}>Cancel request</Button> : null}</div></td> : null}</tr>;
      })}</tbody></table></div> : <div className="empty-state"><div className="state-icon"><CalendarDays size={18} /></div><h3>{search ? "No matching requests" : "No leave requests"}</h3><p>{search ? "Try another search term." : "New requests and their review status will appear here."}</p></div> : holidays.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Holiday</th><th>Paid</th><th>Notes</th><th /></tr></thead><tbody>{holidays.map((holiday) => <tr key={holiday.id}><td>{formatDate(holiday.holidayDate, timeZone)}</td><td><span className="table-primary">{holiday.name}</span></td><td><StatusBadge value={holiday.isPaid ? "PAID" : "UNPAID"} /></td><td>{holiday.notes || "—"}</td><td>{canManageHolidays ? <button type="button" className="icon-button" aria-label={`Remove ${holiday.name}`} disabled={saving} onClick={() => setHolidayToRemove(holiday)}><Trash2 size={15} /></button> : null}</td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="state-icon"><CalendarDays size={18} /></div><h3>No public holidays configured</h3><p>Organization Admins and HR Managers can add public holidays to the organization calendar.</p></div>}
    </Panel>

    <Drawer open={requestOpen} title="Request time off" description="Send a leave request for your manager to review." onClose={() => { if (!saving) setRequestOpen(false); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setRequestOpen(false)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#leave-request-form")?.requestSubmit()}>Submit request</Button></>}>
      <form id="leave-request-form" onSubmit={submitLeave}>{error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}<div className="form-grid"><Field label="Leave type"><SelectInput name="leaveType" required><option value="ANNUAL">Annual leave</option><option value="SICK">Sick leave</option><option value="PERSONAL">Personal leave</option><option value="PARENTAL">Parental leave</option><option value="UNPAID">Unpaid leave</option><option value="OTHER">Other</option></SelectInput></Field><Field label="Start date"><TextInput name="startDate" type="date" required max={leaveEndDate || undefined} value={leaveStartDate} onChange={(event) => { setLeaveStartDate(event.target.value); if (leaveEndDate && event.target.value > leaveEndDate) setLeaveEndDate(""); }} /></Field><Field label="End date"><TextInput name="endDate" type="date" required min={leaveStartDate || undefined} value={leaveEndDate} onChange={(event) => setLeaveEndDate(event.target.value)} /></Field><Field label="Reason" hint="3–1,000 characters"><TextArea name="reason" required minLength={3} maxLength={1000} rows={4} /></Field></div><div className="form-note"><Clock3 size={15} /> The backend prevents overlapping pending or approved leave requests and determines paid/unpaid treatment from the selected leave type.</div></form>
    </Drawer>

    <Drawer open={holidayOpen} title="Add public holiday" description="Add a date to the organization's public holiday calendar." onClose={() => setHolidayOpen(false)} footer={<><Button variant="secondary" onClick={() => setHolidayOpen(false)}>Cancel</Button><Button variant="primary" busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#holiday-form")?.requestSubmit()}>Save holiday</Button></>}>
      <form id="holiday-form" onSubmit={submitHoliday}><div className="form-grid"><Field label="Holiday date"><TextInput name="holidayDate" type="date" required /></Field><Field label="Holiday name"><TextInput name="name" required minLength={2} maxLength={160} /></Field><Field label="Notes"><TextArea name="notes" maxLength={500} rows={3} /></Field><label className="field"><span className="field-label">Payment treatment</span><span className="check-row"><input type="checkbox" name="isPaid" defaultChecked /> Paid public holiday</span></label></div></form>
    </Drawer>

    <Drawer open={Boolean(holidayToRemove)} title="Remove public holiday?" description="This removes the selected date from the organization holiday calendar. Attendance and pay calculations for that date may be affected by this change." onClose={() => { if (!saving) setHolidayToRemove(null); }} width="standard" footer={<><Button variant="secondary" disabled={saving} onClick={() => setHolidayToRemove(null)}>Keep holiday</Button><Button variant="danger" busy={saving} onClick={() => void removeHoliday()}>Remove holiday</Button></>}>
      {holidayToRemove ? <div className="detail-list"><div><span>Holiday</span><strong>{holidayToRemove.name}</strong></div><div><span>Date</span><strong>{formatDate(holidayToRemove.holidayDate, timeZone)}</strong></div><div><span>Payment treatment</span><strong>{holidayToRemove.isPaid ? "Paid" : "Unpaid"}</strong></div></div> : null}
    </Drawer>

    <Drawer open={Boolean(decisionTarget)} title={`${decision === "APPROVED" ? "Approve" : decision === "REJECTED" ? "Reject" : "Cancel"} leave request`} description="Check the request details before recording this decision." onClose={() => { if (!saving) setDecisionTarget(null); }} footer={<><Button variant="secondary" disabled={saving} onClick={() => setDecisionTarget(null)}>Back</Button><Button variant={decision === "REJECTED" ? "danger" : "primary"} busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#leave-decision-form")?.requestSubmit()}>{decision === "APPROVED" ? "Approve" : decision === "REJECTED" ? "Reject request" : "Cancel request"}</Button></>}>
      {decisionTarget ? <form id="leave-decision-form" onSubmit={submitDecision}>{error ? <div role="alert" className="form-error" style={{ marginBottom: 12 }}>{error}</div> : null}<section className="request-review-summary" aria-label="Leave request details">
          <div className="request-review-person">
            <ProfilePhoto name={`${decisionTarget.firstName ?? "Employee"} ${decisionTarget.lastName ?? ""}`} employeeId={decisionTarget.employeeId} currentUser={Boolean(decisionTarget.isOwnRequest) || decisionTarget.employeeId === user.employeeId} />
            <div className="request-review-person-copy">
              <strong>{`${decisionTarget.firstName ?? "Employee"} ${decisionTarget.lastName ?? ""}</strong>
              {decisionTarget.employeeCode || decisionTarget.departmentName ? <span>{decisionTarget.employeeCode || decisionTarget.departmentName}</span> : null}
            </div>
          </div>
          <div className="request-review-facts">
            <div><span>Leave type</span><strong>{humanize(decisionTarget.leaveType)}</strong></div>
            <div><span>Dates</span><strong>{formatDate(decisionTarget.startDate, timeZone)} – {formatDate(decisionTarget.endDate, timeZone)}</strong></div>
            <div><span>Paid</span><strong>{decisionTarget.isPaid ? "Yes" : "No"}</strong></div>
            {decisionTarget.reason ? <div className="request-review-fact-wide"><span>Reason</span><strong>{decisionTarget.reason}</strong></div> : null}
          </div>
        </section><Field label={decision === "REJECTED" ? "Reason for rejection" : "Reviewer note (optional)"}><TextArea maxLength={1000} required={decision === "REJECTED"} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} /></Field></form> : null}
    </Drawer>
  </>;
}
