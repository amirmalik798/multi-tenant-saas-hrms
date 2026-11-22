"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BriefcaseBusiness, Eye, Filter, Mail, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, UserCheck, UserRound, UserX, Users, X } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/Field";
import { COUNTRY_OPTIONS, CountrySelect, countryOption, isCallingCodeOnly, replacePhoneCountryCode, type CountryOption } from "@/components/ui/CountryPhoneFields";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest, ApiError, pickArray, stringValue } from "@/lib/api-client";
import { formatDate, getISODateInTimeZone, humanize } from "@/lib/format";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { loadAllPages } from "@/lib/paginated-data";

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  designation: string;
  workforce_role: string;
  employment_status: string;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  manager_workforce_role?: string | null;
  is_primary_hr_manager?: boolean;
  joining_date: string;
  invitation_id?: string | null;
  invitation_status?: string | null;
  has_pending_invitation?: boolean;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  managed_departments?: { id: string; name: string; status?: string }[];
  [key: string]: unknown;
}
interface DepartmentOption { id: string; name: string; status?: string; manager_id?: string | null; manager_name?: string | null; manager_eligible?: boolean }
interface DirectoryResponse { employees?: Employee[]; pagination?: { page?: number; total?: number; totalPages?: number }; message?: string }
interface EmployeeForm {
  employee_code: string; first_name: string; last_name: string; email: string; phone: string;
  country: string; city: string; designation: string; joining_date: string; workforce_role: string;
  manager_id: string; department_id: string; emergency_contact_name: string;
  emergency_contact_relationship: string; emergency_contact_phone: string;
}
const blankForm = (): EmployeeForm => ({ employee_code: "", first_name: "", last_name: "", email: "", phone: "", country: "", city: "", designation: "", joining_date: "", workforce_role: "EMPLOYEE", manager_id: "", department_id: "", emergency_contact_name: "", emergency_contact_relationship: "", emergency_contact_phone: "" });
const roleDisplay: Record<string, string> = { HR_MANAGER: "HR Manager", DEPARTMENT_MANAGER: "Department Manager", EMPLOYEE: "Employee" };

function detectCountryFromPhone(phone: string, preferredCountry?: string): CountryOption | null {
  const value = phone.trim();
  if (!value.startsWith("+")) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  const matches = COUNTRY_OPTIONS
    .filter((country) => digits.startsWith(country.callingCode))
    .sort((left, right) => right.callingCode.length - left.callingCode.length);
  const preferred = countryOption(preferredCountry);
  return matches.find((country) => country.code === preferred?.code) ?? matches[0] ?? null;
}

export function WorkforceWorkspace() {
  const { user } = useWorkspace();
  const [rows, setRows] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [managerOptions, setManagerOptions] = useState<Employee[]>([]);
  const [managerOptionsError, setManagerOptionsError] = useState("");
  const [departmentOptionsError, setDepartmentOptionsError] = useState("");
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [queryFiltersReady, setQueryFiltersReady] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "details" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [statusTarget, setStatusTarget] = useState<Employee | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const canCreate = user.role === "ORGANIZATION_ADMIN" || (user.role === "HR_MANAGER" && user.permissions.includes("employee.create"));
  const canEdit = user.role === "ORGANIZATION_ADMIN" || (user.role === "HR_MANAGER" && user.permissions.includes("employee.update"));
  const canInvite = user.role === "ORGANIZATION_ADMIN" || (user.role === "HR_MANAGER" && user.permissions.includes("employee.create") && user.permissions.includes("user.invite"));
  const canChangeStatus = user.role === "ORGANIZATION_ADMIN"
    || (user.role === "HR_MANAGER" && user.permissions.includes("employee.update") && user.permissions.includes("employee.status.change"))
    || user.role === "DEPARTMENT_MANAGER";

  const load = useCallback(async (silent = false) => {
    const requestId = ++listRequestRef.current;
    if (!silent) setLoading(true); setError(""); setListError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50", sortBy: "name", sortOrder: "asc" });
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (departmentFilter !== "ALL") departmentFilter === "UNASSIGNED" ? params.set("unassigned", "true") : params.set("departmentId", departmentFilter);
       if (new URLSearchParams(window.location.search).get("managementPopulation") === "true") {
         params.set("managementPopulation", "true");
       }
      const result = await apiRequest<DirectoryResponse>(`/employees?${params.toString()}`);
      if (requestId !== listRequestRef.current) return;
      setRows(Array.isArray(result.employees) ? result.employees : []);
      setListError("");
      setTotal(result.pagination?.total ?? 0);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
    } catch (caught) {
      if (requestId === listRequestRef.current) {
        const message = caught instanceof Error ? caught.message : "Unable to load workforce records.";
        setError(message);
        setListError(message);
      }
    } finally { if (!silent && requestId === listRequestRef.current) setLoading(false); }
  }, [page, search, statusFilter, departmentFilter]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedStatus = (query.get("status") || "").toUpperCase();
    const requestedDepartment = query.get("departmentId") || "";
    const requestedUnassigned = query.get("unassigned") === "true";
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (["ACTIVE", "INACTIVE", "FORMER"].includes(requestedStatus)) {
      setStatusFilter(requestedStatus);
    }
    if (requestedUnassigned) {
      setDepartmentFilter("UNASSIGNED");
    } else if (uuidPattern.test(requestedDepartment)) {
      setDepartmentFilter(requestedDepartment);
    }
    setQueryFiltersReady(true);
  }, []);

  useEffect(() => {
    if (queryFiltersReady) void load();
  }, [load, queryFiltersReady]);
  useSmartRefresh(() => load(true), queryFiltersReady && !drawerMode && !statusTarget && !detailLoading && !statusSaving);
  useEffect(() => {
    let active = true;
    setDepartmentOptionsError("");
    setManagerOptionsError("");

    void loadAllPages<DepartmentOption>(async (page) => {
      const result = await apiRequest<{ departments?: DepartmentOption[]; pagination?: { totalPages?: number } }>(`/departments?page=${page}&limit=100&includeInactive=true`);
      return { items: result.departments ?? [], totalPages: result.pagination?.totalPages };
    }).then((values) => {
      if (active) setDepartments(values);
    }).catch((caught) => {
      if (active) setDepartmentOptionsError(caught instanceof Error ? caught.message : "Unable to load the complete department list.");
    });

    if (user.role === "ORGANIZATION_ADMIN") {
      void apiRequest<{ employees?: Employee[] }>("/employees/managers?role=HR_MANAGER")
        .then((result) => {
          if (active) setManagerOptions(result.employees ?? []);
        })
        .catch((caught) => {
          if (active) setManagerOptionsError(caught instanceof Error ? caught.message : "Unable to load eligible HR Managers.");
        });
    } else {
      // HR Managers report Department Managers created by them to their own
      // linked workforce profile. Other roles do not need manager candidates.
      setManagerOptions([]);
    }

    return () => { active = false; };
  }, [user.role]);

  async function openDetails(id: string, mode: "details" | "edit" = "details") {
    const requestId = ++detailRequestRef.current;
    setDrawerMode(mode); setSelectedId(id); setDetailLoading(true); setSelected(null); setError("");
    try {
      const result = await apiRequest<{ employee?: Employee }>(`/employees/${id}`);
      if (requestId !== detailRequestRef.current) return;
      const directoryRecord = rows.find((employee) => employee.id === id);
      if (!result.employee) {
        setSelected(null);
      } else {
        setSelected({
          ...result.employee,
          invitation_id: result.employee.invitation_id ?? directoryRecord?.invitation_id,
          invitation_status: result.employee.invitation_status ?? directoryRecord?.invitation_status,
          has_pending_invitation: result.employee.has_pending_invitation ?? directoryRecord?.has_pending_invitation,
        });
      }
    } catch (caught) { if (requestId === detailRequestRef.current) setError(caught instanceof Error ? caught.message : "Unable to load this employee."); }
    finally { if (requestId === detailRequestRef.current) setDetailLoading(false); }
  }

  async function confirmEmploymentStatusChange() {
    if (!statusTarget || statusSaving) return;
    const nextStatus = statusTarget.employment_status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setStatusSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/employees/${encodeURIComponent(statusTarget.id)}`, {
        method: "PATCH", body: JSON.stringify({ employment_status: nextStatus }),
      });
      setNotice(`${statusTarget.first_name} ${statusTarget.last_name} is now ${nextStatus.toLowerCase()}.`);
      setStatusTarget(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update workforce status.");
    } finally { setStatusSaving(false); }
  }

  const headerAction = canCreate ? <Button variant="primary" leading={<Plus size={15} />} onClick={() => { detailRequestRef.current += 1; setSelected(null); setSelectedId(null); setDetailLoading(false); setDrawerMode("create"); }}>Add workforce member</Button> : undefined;
  const title = user.role === "DEPARTMENT_MANAGER" ? "My team" : "Workforce";

  return <>
    <PageHeader eyebrow="People" title={title} description={user.role === "DEPARTMENT_MANAGER" ? "A focused directory of employees in your assigned departments." : "A single, searchable place to manage employee records and work relationships."} action={headerAction} />
    {notice ? <div className="info-callout" style={{ marginBottom: 14 }}>{notice}</div> : null}
    <Panel>
      <div className="toolbar">
        <div className="toolbar-left"><label className="search-field"><Search size={15} /><input aria-label="Search workforce" placeholder="Search name, code, email, role…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><kbd style={{ color: "var(--subtle)", fontSize: 9 }}>⌕</kbd></label>
          <select className="filter-select" aria-label="Filter by employment status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="FORMER">Former</option></select>
          {user.role !== "DEPARTMENT_MANAGER" ? <select className="filter-select" aria-label="Filter by department" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1); }}><option value="ALL">All departments</option><option value="UNASSIGNED">Unassigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select> : null}
        </div>
        <div className="toolbar-right"><span style={{ color: "var(--muted)", fontSize: 11 }}>{loading ? "Loading…" : `${total} people`}</span></div>
      </div>
      {listError && rows.length > 0 ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>The latest workforce refresh failed. The rows shown are from the last successful load and may not match the current filters. {listError}</div> : null}
      {error && !rows.length ? <div className="error-state"><div className="state-icon"><X size={18} /></div><h3>Workforce could not be loaded</h3><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Retry</Button></div> : null}
      {loading && !rows.length ? <TableSkeleton /> : !rows.length && !error ? <div className="empty-state"><div className="state-icon"><Users size={19} /></div><h3>{search || statusFilter !== "ALL" || departmentFilter !== "ALL" ? "No matching people" : "No workforce records yet"}</h3><p>{search || statusFilter !== "ALL" || departmentFilter !== "ALL" ? "Try adjusting your search or filters." : "Workforce profiles will appear here after they have been created."}</p>{canCreate ? <Button size="sm" variant="primary" leading={<Plus size={14} />} onClick={() => { detailRequestRef.current += 1; setSelected(null); setSelectedId(null); setDetailLoading(false); setDrawerMode("create"); }}>Add workforce member</Button> : null}</div> : null}
      {rows.length ? <><div className="table-wrap"><table className="data-table"><thead><tr><th>Person</th><th>Role & department</th><th>Manager</th><th>Employment</th><th>Invitation</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {rows.map((person) => <tr key={person.id}>
          <td><button type="button" onClick={() => void openDetails(person.id)} style={{ display: "flex", alignItems: "center", gap: 10, border: 0, padding: 0, background: "transparent", textAlign: "left" }}><ProfilePhoto name={`${person.first_name} ${person.last_name}`} employeeId={person.id} className="user-avatar" /><span><span className="table-primary">{person.first_name} {person.last_name}</span><span className="table-secondary">{person.employee_code} · {person.email}</span></span></button></td>
          <td><span className="table-primary">{roleDisplay[person.workforce_role] ?? humanize(person.workforce_role)}</span><span className="table-secondary">{person.department_name || "No department"}</span></td>
          <td>{person.manager_name ? <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><ProfilePhoto name={person.manager_name} employeeId={person.manager_id} currentUser={Boolean(person.manager_id && person.manager_id === user.employeeId)} /><span className="table-primary">{person.manager_name}</span></div> : <span style={{ color: "var(--subtle)" }}>Not assigned</span>}</td>
          <td><StatusBadge value={person.employment_status} /></td>
          <td>{person.invitation_status ? <StatusBadge value={person.invitation_status} /> : <span style={{ color: "var(--subtle)" }}>—</span>}</td>
          <td><div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, flexWrap: "wrap" }}><button type="button" className="icon-button" aria-label={`View ${person.first_name} ${person.last_name}`} onClick={() => void openDetails(person.id)}><Eye size={15} /></button>{canEdit ? <button type="button" className="icon-button" aria-label={`Edit ${person.first_name} ${person.last_name}`} onClick={() => void openDetails(person.id, "edit")}><Pencil size={15} /></button> : null}{canChangeStatus && person.employment_status !== "FORMER" && (user.role !== "DEPARTMENT_MANAGER" || person.workforce_role === "EMPLOYEE") && !(person.is_primary_hr_manager === true && person.employment_status === "ACTIVE") ? <button type="button" className={`icon-button status-icon-action ${person.employment_status === "ACTIVE" ? "status-action-deactivate" : "status-action-activate"}`} title={person.employment_status === "ACTIVE" ? "Deactivate workforce member" : "Activate workforce member"} aria-label={person.employment_status === "ACTIVE" ? `Deactivate ${person.first_name} ${person.last_name}` : `Activate ${person.first_name} ${person.last_name}`} onClick={() => setStatusTarget(person)}>{person.employment_status === "ACTIVE" ? <UserX size={16} /> : <UserCheck size={16} />}</button> : null}</div></td>
        </tr>)}
      </tbody></table></div><div className="table-footer"><span>Showing {Math.min((page - 1) * 50 + 1, total)}–{Math.min(page * 50, total)} of {total} people</span><div style={{ display: "flex", gap: 7 }}><Button size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button></div></div></> : null}
    </Panel>

    <Drawer open={Boolean(statusTarget)} title={statusTarget?.employment_status === "ACTIVE" ? "Deactivate workforce member?" : "Activate workforce member?"} description="Review the employment status change before confirming." onClose={() => { if (!statusSaving) setStatusTarget(null); }} width="standard" footer={<><Button variant="secondary" disabled={statusSaving} onClick={() => setStatusTarget(null)}>Cancel</Button><Button variant={statusTarget?.employment_status === "ACTIVE" ? "danger" : "primary"} busy={statusSaving} onClick={() => void confirmEmploymentStatusChange()}>{statusTarget?.employment_status === "ACTIVE" ? "Confirm deactivation" : "Confirm activation"}</Button></>}>
      {statusTarget ? (() => {
        const deactivating = statusTarget.employment_status === "ACTIVE";
        const nextStatus = deactivating ? "INACTIVE" : "ACTIVE";
        return <div className="workforce-status-confirmation">
          <div className={`workforce-status-intro ${deactivating ? "workforce-status-intro-danger" : "workforce-status-intro-success"}`}>
            <span className="workforce-status-intro-icon">{deactivating ? <UserX size={20} /> : <UserCheck size={20} />}</span>
            <div>
              <strong>{deactivating ? "You are about to deactivate this member" : "You are about to activate this member"}</strong>
              <p>{deactivating ? "Their employment status and linked account access will be updated by the backend." : "The backend will recheck eligibility before restoring active employment."}</p>
            </div>
          </div>
          <div className="workforce-status-member">
            <ProfilePhoto name={`${statusTarget.first_name} ${statusTarget.last_name}`.trim()} employeeId={statusTarget.id} className="user-avatar" />
            <div className="workforce-status-member-copy">
              <strong>{statusTarget.first_name} {statusTarget.last_name}</strong>
              <span>{statusTarget.employee_code || "No employee code"}</span>
            </div>
          </div>
          <div className="workforce-status-transition">
            <div><span>Current status</span><StatusBadge value={statusTarget.employment_status} /></div>
            <div><span>After confirmation</span><StatusBadge value={nextStatus} /></div>
          </div>
          <div className="workforce-status-impact">
            <ShieldCheck size={17} />
            <div>
              <strong>{deactivating ? "Account and session impact" : "Reactivation checks"}</strong>
              <p>{deactivating ? "The linked account is synchronized and existing sessions are invalidated as required. This action does not delete the workforce record or its history." : "The backend verifies the linked account, password, organization status and role eligibility. If any check fails, the member remains inactive."}</p>
            </div>
          </div>
        </div>;
      })() : null}
    </Drawer>
    <EmployeeDrawer open={drawerMode === "create" || drawerMode === "edit"} mode={drawerMode === "edit" ? "edit" : "create"} employee={selected} loading={detailLoading} departments={departments} managers={managerOptions} departmentOptionsError={departmentOptionsError} managerOptionsError={managerOptionsError} onClose={() => { setDrawerMode(null); setSelectedId(null); }} onSaved={() => { setDrawerMode(null); setSelectedId(null); setNotice("Workforce record saved."); void load(); setTimeout(() => setNotice(""), 4500); }} />
    <EmployeeDetailsDrawer open={drawerMode === "details"} employee={selected} loading={detailLoading} error={error} canInvite={canInvite} onClose={() => { setDrawerMode(null); setSelectedId(null); setError(""); }} onInviteComplete={() => { setNotice("Invitation sent successfully."); void load(); setTimeout(() => setNotice(""), 4500); }} onEdit={canEdit ? () => { if (selectedId) void openDetails(selectedId, "edit"); } : undefined} />
  </>;
}

function EmployeeDrawer({ open, mode, employee, loading, departments, managers, departmentOptionsError, managerOptionsError, onClose, onSaved }: { open: boolean; mode: "create" | "edit"; employee: Employee | null; loading: boolean; departments: DepartmentOption[]; managers: Employee[]; departmentOptionsError: string; managerOptionsError: string; onClose: () => void; onSaved: () => void }) {
  const { user, workDate, timeZone } = useWorkspace();
  const dateContextRef = useRef({ workDate, timeZone });
  dateContextRef.current = { workDate, timeZone };
  const [form, setForm] = useState<EmployeeForm>(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showEmergency, setShowEmergency] = useState(false);

  const hrManagerOptions = useMemo(() => managers
    .filter((manager) => manager.workforce_role === "HR_MANAGER" && manager.id !== employee?.id)
    .sort((left, right) => Number(Boolean(right.is_primary_hr_manager)) - Number(Boolean(left.is_primary_hr_manager))), [managers, employee?.id]);
  const reportingHrManagerOptions = useMemo(
    () => user.role === "HR_MANAGER"
      ? hrManagerOptions.filter((manager) => manager.id === user.employeeId)
      : hrManagerOptions,
    [hrManagerOptions, user.role, user.employeeId],
  );
  const departmentManagerOptions = useMemo(
    () => managers.filter((manager) => manager.workforce_role === "DEPARTMENT_MANAGER" && manager.id !== employee?.id),
    [managers, employee?.id],
  );
  const selectedDepartment = departments.find((department) => department.id === form.department_id) ?? null;
  const selectedDepartmentManagerId = selectedDepartment?.manager_id
    || (employee?.workforce_role === "EMPLOYEE" ? form.manager_id : "");
  const selectedDepartmentManager = departmentManagerOptions.find((manager) => manager.id === selectedDepartmentManagerId);
  const selectedDepartmentManagerName = selectedDepartmentManager
    ? `${selectedDepartmentManager.first_name} ${selectedDepartmentManager.last_name}`.trim()
    : selectedDepartment?.manager_name
      || (employee?.manager_id === selectedDepartmentManagerId ? employee.manager_name : "")
      || "";

  useEffect(() => {
    if (!open) return;
    setError("");
    setShowEmergency(Boolean(employee?.emergency_contact_name || employee?.emergency_contact_phone));
    if (employee) {
      const savedPhone = employee.phone ?? "";
      const detectedCountry = detectCountryFromPhone(savedPhone, employee.country ?? undefined);
      const country = employee.country || detectedCountry?.name || "";
      const phone = country ? replacePhoneCountryCode(savedPhone, country, country) : savedPhone;
      setForm({
        employee_code: employee.employee_code ?? "", first_name: employee.first_name ?? "", last_name: employee.last_name ?? "", email: employee.email ?? "", phone, country, city: employee.city ?? "", designation: employee.designation ?? "", joining_date: employee.joining_date?.slice(0, 10) ?? "", workforce_role: employee.workforce_role ?? "EMPLOYEE", manager_id: employee.manager_id ?? "", department_id: employee.department_id ?? "", emergency_contact_name: employee.emergency_contact_name ?? "", emergency_contact_relationship: employee.emergency_contact_relationship ?? "", emergency_contact_phone: employee.emergency_contact_phone ?? "",
      });
    } else {
      const currentDateContext = dateContextRef.current;
      setForm({
        ...blankForm(),
        joining_date: currentDateContext.workDate || getISODateInTimeZone(currentDateContext.timeZone),
      });
    }
  }, [open, employee]);

  const update = (key: keyof EmployeeForm, value: string) => setForm((current) => {
    if (key === "country") {
      return {
        ...current,
        country: value,
        phone: replacePhoneCountryCode(current.phone, current.country, value),
      };
    }
    if (key === "phone") {
      const detectedCountry = detectCountryFromPhone(value, current.country);
      return { ...current, phone: value, country: detectedCountry?.name ?? current.country };
    }
    if (key === "department_id") {
      const department = departments.find((item) => item.id === value);
      return {
        ...current,
        department_id: value,
        manager_id: current.workforce_role === "EMPLOYEE" ? department?.manager_id ?? "" : current.manager_id,
      };
    }
    return { ...current, [key]: value };
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCallingCodeOnly(form.phone, form.country)) {
      setError("Enter the complete phone number after the country calling code.");
      return;
    }
    setSaving(true); setError("");
    const body: Record<string, string | null> = {
      employee_code: form.employee_code.trim().toUpperCase(), first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(), country: form.country.trim(), city: form.city.trim(), designation: form.designation.trim(), joining_date: form.joining_date, workforce_role: form.workforce_role,
      manager_id: form.manager_id || null, department_id: form.department_id || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_relationship: form.emergency_contact_relationship.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
    };
    try {
      if (mode === "create") {
        if (user.role === "HR_MANAGER" && form.workforce_role === "HR_MANAGER") throw new Error("HR Managers cannot create another HR Manager profile.");
        await apiRequest("/employees", { method: "POST", body: JSON.stringify(body) });
      } else if (employee) {
        const { workforce_role: _notPatchable, ...editableBody } = body;
        void _notPatchable;
        await apiRequest(`/employees/${employee.id}`, { method: "PATCH", body: JSON.stringify(editableBody) });
      }
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save this workforce profile."); }
    finally { setSaving(false); }
  }

  const allowRoleChoice = mode === "create";
  return <Drawer open={open} title={mode === "create" ? "Create workforce member" : "Edit workforce member"} description={mode === "create" ? "Create an inactive workforce profile. Account activation happens through the existing invitation acceptance process." : "Update this person’s work and contact details. Server-side role and field permissions remain authoritative."} onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" busy={saving || loading} onClick={() => document.querySelector<HTMLFormElement>("#employee-profile-form")?.requestSubmit()}>{mode === "create" ? "Create profile" : "Save changes"}</Button></>}>
    {loading ? <div className="loading-state">Loading workforce profile…</div> : <form id="employee-profile-form" onSubmit={submit}>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <section className="form-section"><h3 className="form-section-title"><UserRound size={15} /> Personal & employment</h3><div className="form-grid">
        <Field label="Employee code"><TextInput required maxLength={50} value={form.employee_code} onChange={(e) => update("employee_code", e.target.value)} placeholder="e.g. EMP-001" /></Field>
        <Field label="Workforce role"><SelectInput required disabled={!allowRoleChoice} value={form.workforce_role} onChange={(e) => {
          const nextRole = e.target.value as EmployeeForm["workforce_role"];
          const primaryHrManager = hrManagerOptions.find((manager) => manager.is_primary_hr_manager) ?? hrManagerOptions[0];
          const nextManagerId = nextRole === "DEPARTMENT_MANAGER"
            ? user.role === "HR_MANAGER" ? user.employeeId ?? "" : primaryHrManager?.id ?? ""
            : "";
          setForm((current) => ({ ...current, workforce_role: nextRole, department_id: "", manager_id: nextManagerId }));
        }}><option value="EMPLOYEE">Employee</option><option value="DEPARTMENT_MANAGER">Department Manager</option>{user.role === "ORGANIZATION_ADMIN" ? <option value="HR_MANAGER">HR Manager</option> : null}</SelectInput></Field>
        <Field label="First name"><TextInput required minLength={2} maxLength={100} value={form.first_name} onChange={(e) => update("first_name", e.target.value)} /></Field>
        <Field label="Last name"><TextInput required minLength={2} maxLength={100} value={form.last_name} onChange={(e) => update("last_name", e.target.value)} /></Field>
        <Field label="Job title"><TextInput required maxLength={100} value={form.designation} onChange={(e) => update("designation", e.target.value)} placeholder="e.g. Finance Officer" /></Field>
        <Field label="Joining date"><TextInput required type="date" value={form.joining_date} onChange={(e) => update("joining_date", e.target.value)} /></Field>
        {form.workforce_role === "EMPLOYEE" ? <Field label="Department" hint={departmentOptionsError || "The selected department determines the Employee’s Department Manager."}><SelectInput required={mode === "create"} disabled={Boolean(departmentOptionsError) || saving} value={form.department_id} onChange={(e) => update("department_id", e.target.value)}><option value="">{mode === "create" ? "Select department" : "No department assigned"}</option>{departments.filter((d) => d.status !== "INACTIVE").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectInput></Field> : null}
        {form.workforce_role === "HR_MANAGER" ? (
          <Field label="Reporting manager" hint="Automatically assigned to the Organization Admin account that creates this HR Manager profile.">
            <SelectInput value="ORGANIZATION_ADMIN" disabled><option value="ORGANIZATION_ADMIN">Organization Admin · Automatically selected</option></SelectInput>
          </Field>
        ) : form.workforce_role === "DEPARTMENT_MANAGER" ? (
          <Field label="Reporting manager" hint={user.role === "HR_MANAGER" ? "Department Managers created by an HR Manager report to that HR Manager account." : managerOptionsError || (reportingHrManagerOptions.length ? "Only eligible active HR Managers are available." : "No eligible active HR Manager account is available to select.")}>
            <SelectInput
              value={form.manager_id}
              disabled={saving || (user.role === "HR_MANAGER") || (user.role === "ORGANIZATION_ADMIN" && (Boolean(managerOptionsError) || reportingHrManagerOptions.length === 0))}
              onChange={(e) => update("manager_id", e.target.value)}
            >
              <option value="">Select active HR Manager</option>
              {reportingHrManagerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.first_name} {manager.last_name} · {manager.employee_code}{manager.is_primary_hr_manager ? " · Primary HR Manager" : ""}</option>)}
              {user.role === "HR_MANAGER" && user.employeeId && !reportingHrManagerOptions.some((manager) => manager.id === user.employeeId) ? <option value={user.employeeId}>{user.displayName || "Your HR Manager account"} · You</option> : null}
            </SelectInput>
          </Field>
        ) : (
          <Field label="Reporting manager" hint={selectedDepartmentManagerName ? "Automatically assigned from the selected department. Only its Department Manager is shown." : "Select a department with an assigned Department Manager to populate this field."}>
            <SelectInput value={selectedDepartmentManagerId} disabled>
              {selectedDepartmentManagerId ? <option value={selectedDepartmentManagerId}>{selectedDepartmentManagerName || "Assigned Department Manager"}</option> : <option value="">Select department first</option>}
            </SelectInput>
          </Field>
        )}
      </div></section>
      <section className="form-section"><h3 className="form-section-title"><Mail size={15} /> Contact details</h3><div className="form-grid">
        <Field label="Work email"><TextInput type="email" required maxLength={254} value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="person@company.com" /></Field>
        <div className="field">
          <label className="field-label" htmlFor="workforce-country-select">Country</label>
          <CountrySelect id="workforce-country-select" value={form.country} onChange={(value) => update("country", value)} required className="text-input" placeholder="Search country, code or calling code…" />
        </div>
        <Field label="Phone number" hint="The country calling code is added automatically. An international prefix entered here also detects the country."><TextInput type="tel" inputMode="tel" autoComplete="tel" required maxLength={50} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="e.g. +250 788 000 000" /></Field>
        <Field label="City"><TextInput required maxLength={100} value={form.city} onChange={(e) => update("city", e.target.value)} /></Field>
      </div></section>
      <section className="form-section"><button type="button" className="form-section-title" onClick={() => setShowEmergency((value) => !value)} style={{ width: "100%", border: 0, background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}><ShieldCheck size={15} /> Emergency contact <span style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 10 }}>{showEmergency ? "Hide" : "Add details"}</span></button>
        {showEmergency ? <div className="form-grid" style={{ marginTop: 13 }}><Field label="Contact name"><TextInput value={form.emergency_contact_name} onChange={(e) => update("emergency_contact_name", e.target.value)} /></Field><Field label="Relationship"><TextInput value={form.emergency_contact_relationship} onChange={(e) => update("emergency_contact_relationship", e.target.value)} /></Field><Field label="Contact phone"><TextInput value={form.emergency_contact_phone} onChange={(e) => update("emergency_contact_phone", e.target.value)} /></Field></div> : <p className="form-section-description">Optional information. Reveal only when you need to record it.</p>}
      </section>
      {mode === "create" ? <div className="form-note"><ShieldCheck size={15} /> New workforce profiles are created as inactive. The person becomes an active account only after completing the existing invitation flow.</div> : null}
    </form>}
  </Drawer>;
}

function EmployeeDetailsDrawer({ open, employee, loading, error, canInvite, onClose, onInviteComplete, onEdit }: { open: boolean; employee: Employee | null; loading: boolean; error: string; canInvite: boolean; onClose: () => void; onInviteComplete: () => void; onEdit?: () => void }) {
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const { user } = useWorkspace();
  const name = employee ? `${employee.first_name} ${employee.last_name}`.trim() : "Workforce member";
  const invitationStatus = (employee?.invitation_status || (employee?.invitation_id === null ? "NOT_SENT" : "")).toUpperCase();
  const invitationStatusKnown = Boolean(invitationStatus);
  const inviteEligible = Boolean(employee && invitationStatusKnown && employee.employment_status !== "FORMER" && !["PENDING", "ACCEPTED"].includes(invitationStatus));
  async function sendInvitation() {
    if (!employee) return;
    setInviting(true); setInviteError("");
    try {
      await apiRequest(`/employees/${employee.id}/invitation`, { method: "POST", body: JSON.stringify({ roleName: employee.workforce_role }) });
      onInviteComplete();
      onClose();
    } catch (caught) { setInviteError(caught instanceof Error ? caught.message : "Unable to send this invitation."); }
    finally { setInviting(false); }
  }
  return <Drawer open={open} title="Workforce member" description="Work and contact information for this profile." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{canInvite && inviteEligible ? <Button variant="secondary" leading={<Mail size={14} />} busy={inviting} onClick={() => void sendInvitation()}>Send invitation</Button> : null}{onEdit ? <Button variant="primary" leading={<Pencil size={14} />} onClick={onEdit}>Edit profile</Button> : null}</>}>
    {inviteError ? <div className="form-error" role="alert">{inviteError}</div> : null}
    {loading ? <div className="loading-state">Loading profile details…</div> : error ? <div className="error-state"><h3>Details unavailable</h3><p>{error}</p></div> : employee ? <>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 24 }}><ProfilePhoto name={name} employeeId={employee.id} className="user-avatar" /><div><h3 style={{ fontSize: 17, margin: 0, color: "var(--text-strong)" }}>{name}</h3><p style={{ color: "var(--muted)", fontSize: 11, margin: "3px 0 0" }}>{employee.employee_code} · {roleDisplay[employee.workforce_role] ?? humanize(employee.workforce_role)}</p></div></div>
      <div className="form-grid" style={{ marginBottom: 20 }}><Detail label="Employment status"><StatusBadge value={employee.employment_status} /></Detail><Detail label="Invitation status"><StatusBadge value={invitationStatus || "UNKNOWN"} label={invitationStatusKnown ? undefined : "Unavailable"} /></Detail></div>
      <DetailSection title="Work information"><Detail label="Job title" value={employee.designation} /><Detail label="Department" value={employee.department_name || "Not assigned"} /><Detail label="Joining date" value={formatDate(employee.joining_date)} /></DetailSection>{employee.manager_name ? <section className="form-section"><h3 className="form-section-title">Reporting manager</h3><div style={{ display: "flex", alignItems: "center", gap: 10 }}><ProfilePhoto name={employee.manager_name} employeeId={employee.manager_id} currentUser={Boolean(employee.manager_id && employee.manager_id === user.employeeId)} /><strong style={{ color: "var(--text-strong)", fontSize: 12 }}>{employee.manager_name}</strong></div></section> : null}
      <DetailSection title="Contact details"><Detail label="Email" value={employee.email} /><Detail label="Phone" value={employee.phone} /><Detail label="Location" value={[employee.city, employee.country].filter(Boolean).join(", ")} /></DetailSection>
      {employee.emergency_contact_name || employee.emergency_contact_phone ? <DetailSection title="Emergency contact"><Detail label="Name" value={employee.emergency_contact_name} /><Detail label="Relationship" value={employee.emergency_contact_relationship} /><Detail label="Phone" value={employee.emergency_contact_phone} /></DetailSection> : null}
      {Array.isArray(employee.managed_departments) && employee.managed_departments.length ? <DetailSection title="Managed departments"><div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{employee.managed_departments.map((d) => <StatusBadge key={d.id} label={d.name} value={d.status ?? "ACTIVE"} />)}</div></DetailSection> : null}
    </> : null}
  </Drawer>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section className="form-section"><h3 className="form-section-title">{title}</h3><div className="form-grid">{children}</div></section>; }
function Detail({ label, value, children }: { label: string; value?: string | null; children?: ReactNode }) { return <div><p className="field-hint" style={{ margin: 0 }}>{label}</p><div style={{ marginTop: 4, color: "var(--text-strong)", fontSize: 12, fontWeight: 600 }}>{children ?? value ?? "—"}</div></div>; }
function TableSkeleton() { return <div style={{ padding: 19, display: "grid", gap: 15 }}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}</div>; }
