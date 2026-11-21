"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Building2, Eye, Pencil, Plus, Power, PowerOff, Search, ShieldCheck, Users } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { formatNumber, humanize } from "@/lib/format";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { loadAllPages } from "@/lib/paginated-data";

interface Department {
  id: string; name: string; description: string | null; status: string;
  manager_id: string | null; manager_name: string | null; manager_employee_code?: string | null;
  manager_eligible?: boolean; total_employee_count?: number; employee_count?: number;
  active_employee_count?: number; inactive_employee_count?: number; former_employee_count?: number;
  employees?: Array<{ id: string; employee_code: string; first_name: string; last_name: string; designation: string; employment_status: string }>;
}
interface DepartmentResponse { departments?: Department[]; pagination?: { total?: number; totalPages?: number }; message?: string }
interface Manager { id: string; first_name: string; last_name: string; workforce_role: string; employee_code: string; employment_status: string }

export function DepartmentsWorkspace() {
  const { user } = useWorkspace();
  const [rows, setRows] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managerOptionsError, setManagerOptionsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [drawer, setDrawer] = useState<"create" | "edit" | "details" | null>(null);
  const [selected, setSelected] = useState<Department | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [statusTarget, setStatusTarget] = useState<Department | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  // Organization Admin is implicitly authorized by the backend's
  // hasTenantPermission() helper. Its session endpoint intentionally omits
  // a permissions array, so mirror that role-level access in the UI rather
  // than hiding department lifecycle controls for an empty array.
  const isOrganizationAdmin = user.role === "ORGANIZATION_ADMIN";
  const canCreate = isOrganizationAdmin || user.permissions.includes("department.create");
  const canEdit = isOrganizationAdmin || user.permissions.includes("department.update");
  const canDeactivate = isOrganizationAdmin || user.permissions.includes("department.deactivate");

  const load = useCallback(async (silent = false) => {
    const requestId = ++listRequestRef.current;
    if (!silent) setLoading(true); setError("");
    try {
      const allDepartments = await loadAllPages<Department>(async (page) => {
        const params = new URLSearchParams({ page: String(page), limit: "100", includeInactive: "true" });
        if (query.trim()) params.set("q", query.trim());
        if (status !== "ALL") params.set("status", status);
        const result = await apiRequest<DepartmentResponse>(`/departments?${params.toString()}`);
        return { items: result.departments ?? [], totalPages: result.pagination?.totalPages };
      });
      if (requestId === listRequestRef.current) setRows(allDepartments);
    } catch (caught) { if (requestId === listRequestRef.current) setError(caught instanceof Error ? caught.message : "Unable to load departments."); }
    finally { if (!silent && requestId === listRequestRef.current) setLoading(false); }
  }, [query, status]);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), !drawer && !statusTarget && !statusSaving && !detailLoading);
  useEffect(() => {
    let active = true;
    setManagerOptionsError("");
    loadAllPages<Manager>(async (page) => {
      const result = await apiRequest<{ employees?: Manager[]; pagination?: { totalPages?: number } }>(`/employees?page=${page}&limit=100&status=ACTIVE&sortBy=name&sortOrder=asc`);
      return { items: result.employees ?? [], totalPages: result.pagination?.totalPages };
    })
      .then((people) => { if (active) setManagers(people.filter((person) => person.workforce_role === "DEPARTMENT_MANAGER")); })
      .catch((caught) => { if (active) setManagerOptionsError(caught instanceof Error ? caught.message : "The department manager list could not be fully loaded."); });
    return () => { active = false; };
  }, []);

  async function openDepartment(id: string, mode: "edit" | "details") {
    const requestId = ++detailRequestRef.current;
    setDrawer(mode); setSelected(null); setDetailLoading(true); setError("");
    try {
      const result = await apiRequest<{ department?: Department }>(`/departments/${id}`);
      if (requestId === detailRequestRef.current) setSelected(result.department ?? null);
    } catch (caught) { if (requestId === detailRequestRef.current) setError(caught instanceof Error ? caught.message : "Unable to load department details."); }
    finally { if (requestId === detailRequestRef.current) setDetailLoading(false); }
  }

  async function confirmDepartmentStatusChange() {
    if (!statusTarget || statusSaving) return;
    const nextStatus = statusTarget.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setStatusSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ employeesDeactivated?: number }>(`/departments/${encodeURIComponent(statusTarget.id)}`, {
        method: "PATCH", body: JSON.stringify({ status: nextStatus }),
      });
      const deactivated = Number(result.employeesDeactivated ?? 0);
      setNotice(nextStatus === "INACTIVE"
        ? `Department deactivated. ${deactivated} currently active workforce member(s) were also marked inactive.`
        : "Department activated. Its workforce members remain in their current employment statuses.");
      setStatusTarget(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update department status.");
    } finally { setStatusSaving(false); }
  }

  return <>
    <PageHeader eyebrow="People" title="Departments" description="Keep teams easy to understand, with clear ownership and staffing context." action={canCreate ? <Button variant="primary" leading={<Plus size={15} />} onClick={() => { setSelected(null); setDrawer("create"); }}>Create department</Button> : undefined} />
    {notice ? <div className="info-callout" style={{ marginBottom: 14 }}>{notice}</div> : null}
    {managerOptionsError ? <div className="form-error" role="alert" style={{ marginBottom: 14 }}>Manager options could not be fully loaded. {managerOptionsError}</div> : null}
    <Panel>
      <div className="toolbar"><div className="toolbar-left"><label className="search-field"><Search size={15} /><input aria-label="Search departments" placeholder="Search departments or managers…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select className="filter-select" aria-label="Filter department status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All departments</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div><span style={{ color: "var(--muted)", fontSize: 11 }}>{loading ? "Loading…" : `${rows.length} departments`}</span></div>
      {error && !rows.length ? <div className="error-state"><div className="state-icon"><Building2 size={18} /></div><h3>Departments unavailable</h3><p>{error} This list will retry automatically.</p></div> : null}
      {loading && !rows.length ? <div style={{ padding: 18, display: "grid", gap: 12 }}>{[1,2,3,4].map((n) => <div key={n} className="skeleton" style={{ height: 54 }} />)}</div> : null}
      {!loading && !rows.length && !error ? <div className="empty-state"><div className="state-icon"><Building2 size={18} /></div><h3>{query ? "No departments found" : "No departments yet"}</h3><p>{query ? "Try a different search." : "Create your first department to establish a clear team structure."}</p>{canCreate ? <Button variant="primary" size="sm" leading={<Plus size={14} />} onClick={() => setDrawer("create")}>Create department</Button> : null}</div> : null}
      {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Department</th><th>Manager</th><th>Team size</th><th>Manager eligibility</th><th>Status</th><th /></tr></thead><tbody>{rows.map((department) => <tr key={department.id}>
        <td><button type="button" onClick={() => void openDepartment(department.id, "details")} style={{ display: "flex", alignItems: "center", gap: 10, border: 0, padding: 0, background: "transparent", textAlign: "left" }}><span className="org-avatar"><Building2 size={15} /></span><span><span className="table-primary">{department.name}</span><span className="table-secondary">{department.description || "No description"}</span></span></button></td>
        <td>{department.manager_name ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><ProfilePhoto name={department.manager_name} employeeId={department.manager_id} className="user-avatar" /><span><span className="table-primary">{department.manager_name}</span><span className="table-secondary">{department.manager_employee_code ?? ""}</span></span></div> : <span style={{ color: "var(--subtle)" }}>Not assigned</span>}</td>
        <td><span className="table-primary">{formatNumber(department.total_employee_count ?? department.employee_count ?? 0)}</span><span className="table-secondary">{formatNumber(department.active_employee_count ?? 0)} active</span></td>
        <td>{department.manager_id ? <StatusBadge value={department.manager_eligible ? "ACTIVE" : "REVIEW"} label={department.manager_eligible ? "Eligible" : "Needs attention"} /> : <span style={{ color: "var(--subtle)" }}>Unassigned</span>}</td>
        <td><StatusBadge value={department.status} /></td>
        <td><div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, flexWrap: "wrap" }}><button type="button" className="icon-button" aria-label={`View ${department.name}`} onClick={() => void openDepartment(department.id, "details")}><Eye size={15} /></button>{canEdit ? <button type="button" className="icon-button" aria-label={`Edit ${department.name}`} onClick={() => void openDepartment(department.id, "edit")}><Pencil size={15} /></button> : null}{canEdit && (department.status === "ACTIVE" ? canDeactivate : true) ? <button type="button" className={`icon-button status-icon-action ${department.status === "ACTIVE" ? "status-action-deactivate" : "status-action-activate"}`} title={department.status === "ACTIVE" ? "Deactivate department" : "Activate department"} aria-label={department.status === "ACTIVE" ? `Deactivate ${department.name}` : `Activate ${department.name}`} onClick={() => setStatusTarget(department)}>{department.status === "ACTIVE" ? <PowerOff size={16} /> : <Power size={16} />}</button> : null}</div></td>
      </tr>)}</tbody></table></div> : null}
    </Panel>
    <Drawer open={Boolean(statusTarget)} title={statusTarget?.status === "ACTIVE" ? "Deactivate department?" : "Activate department?"} description={statusTarget?.status === "ACTIVE" ? "Deactivation also marks currently active workforce members assigned to this department as INACTIVE and deactivates their linked accounts. Former employees are not changed." : "The department will become available for use again. Workforce members who were deactivated with the department will not be automatically reactivated."} onClose={() => { if (!statusSaving) setStatusTarget(null); }} width="standard" footer={<><Button variant="secondary" disabled={statusSaving} onClick={() => setStatusTarget(null)}>Cancel</Button><Button variant={statusTarget?.status === "ACTIVE" ? "danger" : "primary"} busy={statusSaving} onClick={() => void confirmDepartmentStatusChange()}>{statusTarget?.status === "ACTIVE" ? "Confirm deactivation" : "Confirm activation"}</Button></>}>
      {statusTarget ? <div className="form-section">
        <section className="department-status-summary" aria-label="Department activation summary">
          <div className="department-status-summary-heading">
            <span className="department-status-summary-icon"><Building2 size={18} /></span>
            <div>
              <span>Department</span>
              <strong>{statusTarget.name}</strong>
            </div>
          </div>
          <div className="department-status-summary-meta">
            <div>
              <span>Current status</span>
              <StatusBadge value={statusTarget.status} />
            </div>
            <div>
              <span>Currently active members</span>
              <strong>{formatNumber(statusTarget.active_employee_count ?? 0)}</strong>
            </div>
          </div>
        </section>
        {statusTarget.status === "ACTIVE" ? <p className="form-note"><ShieldCheck size={15} /> The backend performs the workforce/account synchronization and audit logging in the same transaction.</p> : null}
      </div> : null}
    </Drawer>
    <DepartmentDrawer open={drawer === "create" || drawer === "edit"} mode={drawer === "edit" ? "edit" : "create"} department={selected} loading={detailLoading} managers={managers} managerOptionsError={managerOptionsError} canDeactivate={canDeactivate} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); setNotice("Department saved successfully."); void load(); setTimeout(() => setNotice(""), 4000); }} />
    <DepartmentDetailsDrawer open={drawer === "details"} department={selected} loading={detailLoading} error={error} canEdit={canEdit} onClose={() => { setDrawer(null); setError(""); }} onEdit={() => { if (selected) void openDepartment(selected.id, "edit"); }} />
  </>;
}

function DepartmentDrawer({ open, mode, department, loading, managers, managerOptionsError, canDeactivate, onClose, onSaved }: { open: boolean; mode: "create" | "edit"; department: Department | null; loading: boolean; managers: Manager[]; managerOptionsError: string; canDeactivate: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [managerId, setManagerId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? ""); setDescription(department?.description ?? ""); setManagerId(department?.manager_id ?? ""); setStatus(department?.status ?? "ACTIVE"); setError("");
  }, [open, department]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (mode === "create") {
        await apiRequest("/departments", { method: "POST", body: JSON.stringify({ name: name.trim(), description: description.trim() || null }) });
      } else if (department) {
        const body: Record<string, unknown> = { name: name.trim(), description: description.trim() || null, manager_id: managerId || null };
        if (canDeactivate) body.status = status;
        await apiRequest(`/departments/${department.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save this department."); }
    finally { setSaving(false); }
  }

  return <Drawer open={open} title={mode === "create" ? "Create department" : "Edit department"} description={mode === "create" ? "Set the department name and purpose. Manager assignment can be completed after creation." : "Update the department details and its eligible manager assignment."} onClose={() => { if (!saving) onClose(); }} width="standard" footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" busy={saving || loading} onClick={() => document.querySelector<HTMLFormElement>("#department-form")?.requestSubmit()}>{mode === "create" ? "Create department" : "Save changes"}</Button></>}>
    {loading ? <div className="loading-state">Loading department…</div> : <form id="department-form" onSubmit={submit}>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <section className="form-section"><h3 className="form-section-title"><Building2 size={15} /> Department details</h3><div className="form-grid department-form-grid">
        <Field label="Department name"><TextInput required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance" /></Field>
        <Field label="Description" hint="Optional · up to 2,000 characters"><TextArea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the department’s purpose, responsibilities, and the work this team owns." /></Field>
        {mode === "edit" ? <>
          <Field label="Department manager" hint={managerOptionsError || "The backend validates whether the selected manager is eligible."}><SelectInput value={managerId} onChange={(e) => setManagerId(e.target.value)}><option value="">No manager assigned</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.first_name} {manager.last_name} · {manager.employee_code}</option>)}</SelectInput></Field>
          <Field label="Status"><SelectInput value={status} disabled={!canDeactivate && status === "INACTIVE"} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE" disabled={!canDeactivate}>Inactive</option></SelectInput></Field>
        </> : null}
      </div></section>
      <div className="form-note"><ShieldCheck size={15} /> Department creation does not assign an owner. Manager assignment is an explicit update and remains subject to server-side eligibility and permission checks.</div>
    </form>}
  </Drawer>;
}

function DepartmentDetailsDrawer({ open, department, loading, error, canEdit, onClose, onEdit }: { open: boolean; department: Department | null; loading: boolean; error: string; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  return <Drawer open={open} title="Department details" description="Team composition and management ownership." onClose={onClose} width="standard" footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{canEdit ? <Button variant="primary" leading={<Pencil size={14} />} onClick={onEdit}>Edit department</Button> : null}</>}>
    {loading ? <div className="loading-state">Loading department…</div> : error ? <div className="error-state"><h3>Department unavailable</h3><p>{error}</p></div> : department ? <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}><span className="org-avatar" style={{ width: 46, height: 46 }}><Building2 size={19} /></span><div><h3 style={{ margin: 0, color: "var(--text-strong)", fontSize: 18 }}>{department.name}</h3><p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 11 }}>{department.description || "No department description"}</p></div></div>
      <div className="form-grid" style={{ marginBottom: 22 }}><div><p className="field-hint">Status</p><StatusBadge value={department.status} /></div><div><p className="field-hint">Team size</p><strong style={{ fontSize: 17, color: "var(--text-strong)" }}>{formatNumber(department.total_employee_count ?? 0)}</strong></div><div><p className="field-hint">Active members</p><strong style={{ fontSize: 17, color: "var(--text-strong)" }}>{formatNumber(department.active_employee_count ?? 0)}</strong></div><div><p className="field-hint">Manager</p>{department.manager_name ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><ProfilePhoto name={department.manager_name} employeeId={department.manager_id} /><strong style={{ fontSize: 12, color: "var(--text-strong)" }}>{department.manager_name}</strong></div> : <strong style={{ fontSize: 12, color: "var(--text-strong)" }}>Not assigned</strong>}</div></div>
      <section className="form-section"><h3 className="form-section-title"><Users size={15} /> Department members</h3>{department.employees?.length ? department.employees.map((employee) => <div className="task-row" key={employee.id}><div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}><ProfilePhoto name={`${employee.first_name} ${employee.last_name}`} employeeId={employee.id} /><span><strong>{employee.first_name} {employee.last_name}</strong><span>{employee.employee_code} · {employee.designation || "—"}</span></span></div><StatusBadge value={employee.employment_status} /></div>) : <div className="empty-state" style={{ padding: 20 }}><h3>No members listed</h3><p>There are currently no employee records associated with this department.</p></div>}</section>
      <div className="form-note"><ShieldCheck size={15} /> Departments can be edited, activated, or deactivated. Permanent deletion is not supported by the current backend API, so this workspace preserves the department record and its history.</div>
    </> : null}
  </Drawer>;
}
