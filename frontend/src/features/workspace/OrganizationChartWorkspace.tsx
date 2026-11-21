"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, Search, Users, UserRound, Building2, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest } from "@/lib/api-client";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { humanize } from "@/lib/format";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";

interface PersonNode {
  id: string;
  employee_code?: string | null;
  first_name: string;
  last_name?: string | null;
  designation?: string | null;
  email?: string | null;
  manager_id?: string | null;
  reporting_manager_user_id?: string | null;
  manager_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  workforce_role?: string | null;
  employment_status?: string | null;
  is_primary_hr_manager?: boolean;
  managed_department_count?: number;
}

function personName(person: PersonNode) { return [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || person.email || "Workforce member"; }

export function OrganizationChartWorkspace() {
  const { user } = useWorkspace();
  const [people, setPeople] = useState<PersonNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [truncated, setTruncated] = useState(false);
  const loadSequenceRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadSequenceRef.current;
    if (!silent) setLoading(true); setError(""); if (!silent) setTruncated(false);
    try {
      if (user.role === "HR_MANAGER") {
        const result = await apiRequest<{ employees?: PersonNode[] }>("/hr-manager/organization-chart");
        if (requestId !== loadSequenceRef.current) return;
        setPeople(Array.isArray(result.employees) ? result.employees : []);
      } else if (user.role === "ORGANIZATION_ADMIN") {
        const first = await apiRequest<{ employees?: PersonNode[]; pagination?: { totalPages?: number } }>("/employees?page=1&limit=100&sortBy=name&sortOrder=asc");
        if (requestId !== loadSequenceRef.current) return;
        const totalPages = Math.max(1, first.pagination?.totalPages || 1);
        const cappedPages = Math.min(totalPages, 100);
        const pages: PersonNode[][] = [Array.isArray(first.employees) ? first.employees : []];
        for (let start = 2; start <= cappedPages; start += 5) {
          const pageNumbers = Array.from({ length: Math.min(5, cappedPages - start + 1) }, (_, index) => start + index);
          const batch = await Promise.all(pageNumbers.map((page) => apiRequest<{ employees?: PersonNode[] }>(`/employees?page=${page}&limit=100&sortBy=name&sortOrder=asc`)));
          pages.push(...batch.map((result) => Array.isArray(result.employees) ? result.employees : []));
        }
        if (requestId !== loadSequenceRef.current) return;
        setPeople(pages.flat());
        setTruncated(totalPages > cappedPages);
      } else {
        throw new Error("Organization chart access is not available for this role.");
      }
    } catch (caught) { if (requestId === loadSequenceRef.current) setError(caught instanceof Error ? caught.message : "Unable to load the organization chart."); }
    finally { if (!silent && requestId === loadSequenceRef.current) setLoading(false); }
  }, [user.role]);

  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true));

  const byId = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const children = useMemo(() => {
    const map = new Map<string, PersonNode[]>();
    for (const person of people) {
      if (person.manager_id && byId.has(person.manager_id)) {
        const current = map.get(person.manager_id) || [];
        current.push(person);
        map.set(person.manager_id, current);
      }
    }
    return map;
  }, [people, byId]);
  const roots = useMemo(() => {
    const rootRows = people.filter((person) => !person.manager_id || !byId.has(person.manager_id) || Boolean(person.reporting_manager_user_id));
    const rootIds = new Set(rootRows.map((person) => person.id));
    // Defensive fallback for malformed/cyclic reporting lines: show orphaned rows rather than hiding them.
    const covered = new Set<string>();
    const mark = (person: PersonNode) => { if (covered.has(person.id)) return; covered.add(person.id); for (const child of children.get(person.id) || []) mark(child); };
    for (const root of rootRows) mark(root);
    const extra = people.filter((person) => !covered.has(person.id) && !rootIds.has(person.id));
    return [...rootRows, ...extra];
  }, [people, byId, children]);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return [];
    return people.filter((person) => [personName(person), person.employee_code, person.designation, person.department_name, person.workforce_role, person.manager_name].some((item) => String(item || "").toLocaleLowerCase().includes(value)));
  }, [people, query]);

  const leaderCount = people.filter((person) => ["HR_MANAGER", "DEPARTMENT_MANAGER"].includes((person.workforce_role || "").toUpperCase())).length;
  const activeCount = people.filter((person) => person.employment_status === "ACTIVE").length;
  const unassignedCount = people.filter((person) => !person.department_id && (person.workforce_role || "EMPLOYEE").toUpperCase() === "EMPLOYEE").length;

  function renderNode(person: PersonNode, visited: Set<string>) {
    if (visited.has(person.id)) return null;
    const nextVisited = new Set(visited).add(person.id);
    const directReports = (children.get(person.id) || []).filter((child) => !nextVisited.has(child.id));
    return <li className="hierarchy-node" key={person.id}>
      <article className="hierarchy-person">
        <ProfilePhoto name={personName(person)} employeeId={person.id} className="user-avatar" />
        <div className="hierarchy-person-copy"><strong>{personName(person)}</strong><span>{person.designation || humanize(person.workforce_role || "EMPLOYEE")}</span><small>{person.employee_code || "No employee code"}{person.department_name ? ` · ${person.department_name}` : " · No department"}</small></div>
        <div className="hierarchy-person-status"><StatusBadge value={person.employment_status || "UNKNOWN"} />{person.is_primary_hr_manager ? <span className="primary-hr-flag"><ShieldCheck size={12} /> Primary HR</span> : null}</div>
      </article>
      {directReports.length ? <ul className="hierarchy-children">{directReports.map((child) => renderNode(child, nextVisited))}</ul> : null}
    </li>;
  }

  return <>
    <PageHeader eyebrow="People" title="Organization chart" description="Explore who reports to whom, how teams are arranged, and where a reporting relationship is missing." />
    <div className="metric-grid metric-grid-3" style={{ marginBottom: 16 }}>
      <Panel className="metric-card"><span className="metric-icon"><Users size={16} /></span><strong className="metric-value">{people.length.toLocaleString()}</strong><span className="metric-label">Workforce records</span></Panel>
      <Panel className="metric-card"><span className="metric-icon"><Network size={16} /></span><strong className="metric-value">{leaderCount.toLocaleString()}</strong><span className="metric-label">Managers</span></Panel>
      <Panel className="metric-card"><span className="metric-icon"><Building2 size={16} /></span><strong className="metric-value">{unassignedCount.toLocaleString()}</strong><span className="metric-label">Employees without a department</span></Panel>
    </div>
    {error ? <div className="form-error" role="alert" style={{ marginBottom: 14 }}>{error} The organization chart will retry automatically.</div> : null}
    {truncated ? <div className="form-note" style={{ marginBottom: 14 }}>The organization has more than 10,000 records. This chart currently shows the first 10,000 records; use Workforce to search the complete directory.</div> : null}
    <Panel>
      <div className="toolbar"><div className="toolbar-left"><label className="search-field"><Search size={14} /><input aria-label="Search organization chart" placeholder="Find a person, role, or department…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div><span style={{ color: "var(--muted)", fontSize: 12 }}>{loading ? "Loading structure…" : `${people.length.toLocaleString()} people · ${activeCount.toLocaleString()} active`}</span></div>
      {loading && !people.length ? <div className="loading-state">Building the organization structure…</div> : error && !people.length ? null : query.trim() ? filtered.length ? <div className="hierarchy-search-results">{filtered.map((person) => <article className="hierarchy-person" key={person.id}><ProfilePhoto name={personName(person)} employeeId={person.id} className="user-avatar" /><div className="hierarchy-person-copy"><strong>{personName(person)}</strong><span>{person.designation || humanize(person.workforce_role || "EMPLOYEE")}</span><small>{person.employee_code || "No employee code"} · {person.department_name || "No department"} · Reports to {person.manager_name || (person.reporting_manager_user_id ? "Organization Admin" : "No manager assigned")}</small></div><StatusBadge value={person.employment_status || "UNKNOWN"} /></article>)}</div> : <div className="empty-state"><h3>No matching people</h3><p>Try a different name, job title, or department.</p></div> : people.length ? <div className="hierarchy-tree"><ul>{roots.map((person) => renderNode(person, new Set()))}</ul></div> : <div className="empty-state"><div className="state-icon"><UserRound size={18} /></div><h3>No workforce records</h3><p>People will appear here after their workforce profiles have been created.</p></div>}
    </Panel>
  </>;
}
