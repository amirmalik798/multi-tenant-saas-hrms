"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Clock3, Mail, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextArea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { formatDate, humanize } from "@/lib/format";

interface Invitation {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  email: string;
  status: string;
  display_status: string;
  expires_at: string;
  created_at: string;
  workforce_role: string | null;
  invited_by_email: string | null;
  history?: { event_type: string; reason: string | null; effective_at: string | null }[];
}
interface InvitationPayload {
  invitations?: Invitation[];
  summary?: { total: number; pending: number; accepted: number; expired: number; revoked: number };
  pagination?: { total?: number; totalPages?: number; page?: number };
}

const statusFilters = ["ALL", "PENDING", "ACCEPTED", "EXPIRED", "REVOKED"] as const;

export function InvitationsWorkspace() {
  const { user, timeZone } = useWorkspace();
  const canManage = user.role === "ORGANIZATION_ADMIN" || (user.role === "HR_MANAGER" && user.permissions.includes("employee.create") && user.permissions.includes("user.invite"));
  const [items, setItems] = useState<Invitation[]>([]);
  const [summary, setSummary] = useState<InvitationPayload["summary"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Invitation | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const loadSequenceRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", status });
      if (query.trim()) params.set("q", query.trim());
      const result = await apiRequest<InvitationPayload>(`/org/invitations?${params.toString()}`);
      if (requestId !== loadSequenceRef.current) return;
      setItems(Array.isArray(result.invitations) ? result.invitations : []);
      setSummary(result.summary);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
    } catch (caught) {
      if (requestId === loadSequenceRef.current) setError(caught instanceof Error ? caught.message : "Unable to load invitations.");
    } finally {
      if (requestId === loadSequenceRef.current) setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !revokeOpen && !saving);

  const visibleSummary = useMemo(() => summary ?? { total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 }, [summary]);

  async function resend(invitation: Invitation) {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/employees/${invitation.employee_id}/invitation/resend`, { method: "POST" });
      setNotice(`A new invitation email was sent to ${invitation.email}.`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to resend this invitation."); }
    finally { setSaving(false); }
  }

  async function revoke() {
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/employees/${selected.employee_id}/invitation/revoke`, { method: "POST", body: JSON.stringify({ invitationId: selected.id, reason: reason.trim() || "Invitation revoked by an authorized organization user." }) });
      setRevokeOpen(false); setSelected(null); setReason("");
      setNotice(`The invitation for ${selected.email} was revoked.`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to revoke this invitation."); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="People" title="Invitations" description="Track onboarding invitations, see whether people have accepted, and safely manage pending access." />
    <div className="metric-grid metric-grid-5" style={{ marginBottom: 16 }}>
      <Metric label="All invitations" value={visibleSummary.total} icon={<Mail size={16} />} />
      <Metric label="Pending" value={visibleSummary.pending} icon={<Clock3 size={16} />} />
      <Metric label="Accepted" value={visibleSummary.accepted} icon={<CheckCircle2 size={16} />} />
      <Metric label="Expired" value={visibleSummary.expired} icon={<RefreshCw size={16} />} />
      <Metric label="Revoked" value={visibleSummary.revoked} icon={<XCircle size={16} />} />
    </div>
    {notice ? <div className="success-callout" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
    <Panel>
      <div className="toolbar">
        <div className="toolbar-left"><label className="search-field"><Search size={14} /><input aria-label="Search invitations" placeholder="Search by person, code, or email…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <select className="filter-select" aria-label="Filter invitation status" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}>{statusFilters.map((value) => <option key={value} value={value}>{value === "ALL" ? "All statuses" : humanize(value)}</option>)}</select>
        </div>
        <div className="toolbar-right"><span style={{ fontSize: 12, color: "var(--muted)" }}>{loading ? "Loading…" : `${items.length} shown`}</span></div>
      </div>
      {loading && !items.length ? <div className="loading-state">Loading invitation records…</div> : null}
      {!loading && !error && !items.length ? <div className="empty-state"><div className="state-icon"><Mail size={18} /></div><h3>{query || status !== "ALL" ? "No matching invitations" : "No invitations yet"}</h3><p>{query || status !== "ALL" ? "Try a different search or status." : "When workforce profiles are invited, their status and history will appear here."}</p></div> : null}
      {items.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Sent</th><th>Expires</th><th>Invited by</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map((item) => {
        const pending = item.display_status === "PENDING";
        const canResend = canManage && pending && (user.role === "ORGANIZATION_ADMIN" || item.workforce_role !== "HR_MANAGER");
        return <tr key={item.id}>
          <td><span className="table-primary">{item.employee_name || item.email}</span><span className="table-secondary">{item.employee_code || "No employee code"} · {item.email}</span></td>
          <td>{humanize(item.workforce_role || "EMPLOYEE")}</td>
          <td><StatusBadge value={item.display_status || item.status} /></td>
          <td>{formatDate(item.created_at, timeZone)}</td>
          <td>{formatDate(item.expires_at, timeZone)}</td>
          <td>{item.invited_by_email || "—"}</td>
          <td><div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>{canResend ? <Button size="sm" variant="ghost" disabled={saving} onClick={() => void resend(item)}>Resend</Button> : null}{canManage && pending ? <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setSelected(item); setReason(""); setRevokeOpen(true); }}>Revoke</Button> : null}<Button size="sm" variant="ghost" onClick={() => setSelected(item)}>History</Button></div></td>
        </tr>;
      })}</tbody></table></div> : null}
      <div className="table-footer"><span>Page {page} of {totalPages}</span><div style={{ display: "flex", gap: 7 }}><Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button></div></div>
    </Panel>
    <Drawer open={revokeOpen} title="Revoke invitation" description="The existing invitation link will no longer be usable. This does not delete the workforce profile." onClose={() => { if (!saving) setRevokeOpen(false); }} width="standard" footer={<><Button variant="secondary" disabled={saving} onClick={() => setRevokeOpen(false)}>Keep invitation</Button><Button variant="danger" busy={saving} onClick={() => void revoke()}>Revoke invitation</Button></>}>
      {selected ? <div className="form-section"><div className="form-note"><ShieldCheck size={15} /> {selected.email}</div><Field label="Reason (optional)" hint="The reason is recorded in the invitation history."><TextArea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field></div> : null}
    </Drawer>
    <Drawer open={Boolean(selected) && !revokeOpen} title="Invitation history" description="Current invitation status and recorded events." onClose={() => setSelected(null)} width="standard" footer={<Button onClick={() => setSelected(null)}>Close</Button>}>
      {selected ? <><div className="form-grid"><div><p className="field-hint">Person</p><p className="table-primary">{selected.employee_name || selected.email}</p></div><div><p className="field-hint">Status</p><StatusBadge value={selected.display_status || selected.status} /></div><div><p className="field-hint">Invitation email</p><p className="table-primary">{selected.email}</p></div><div><p className="field-hint">Created</p><p className="table-primary">{formatDate(selected.created_at, timeZone)}</p></div></div><div className="form-section"><h3 className="form-section-title">History</h3>{selected.history?.length ? selected.history.map((event, index) => <div key={`${event.event_type}-${index}`} className="history-event"><span className="history-dot" /><div><strong>{humanize(event.event_type)}</strong><p>{event.reason || "No additional note"}</p><small>{event.effective_at ? formatDate(event.effective_at, timeZone) : "Time unavailable"}</small></div></div>) : <p className="field-hint">No additional invitation history is available.</p>}</div></> : null}
    </Drawer>
  </>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <Panel className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-value">{value.toLocaleString()}</span><span className="metric-label">{label}</span></Panel>;
}
