"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowDownToLine, CalendarDays, CheckCircle2, Clock3, FileBarChart, FileClock, Mail, ShieldCheck, Wallet } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiRequest, isRecord, pickArray, stringValue } from "@/lib/api-client";
import { formatDate, getLocalISODate, humanize } from "@/lib/format";
import { routePageMeta } from "@/lib/workspace-config";
import { useSmartRefresh } from "@/lib/smart-refresh";

interface ResourceConfig { endpoint: string; keys: string[]; description?: string; secondary?: { endpoint: string; keys: string[]; label: string } }
const configs: Record<string, (role: string) => ResourceConfig | null> = {
  "pay-rates": () => ({ endpoint: "/attendance/pay-rates", keys: ["payRates", "rates", "employees"] }),
  payroll: () => ({ endpoint: `/payroll/payments?month=${getLocalISODate().slice(0, 7)}`, keys: ["payments"] }),
  "my-earnings": () => ({ endpoint: `/employee/earnings?month=${getLocalISODate().slice(0, 7)}`, keys: ["days", "earnings", "records"] }),
  earnings: () => ({ endpoint: `/employee/earnings?month=${getLocalISODate().slice(0, 7)}`, keys: ["days", "earnings", "records"] }),
  leave: () => ({ endpoint: "/leave/requests", keys: ["requests"], secondary: { endpoint: "/leave/holidays", keys: ["holidays"], label: "Public holidays" } }),
  settings: () => ({ endpoint: "/org/settings", keys: ["settings", "organizationSettings"] }),
  license: () => ({ endpoint: "/org/license", keys: ["license", "submissions", "payments"] }),
  support: () => null,
  "organization-chart": (role) => role === "HR_MANAGER" ? ({ endpoint: "/hr-manager/organization-chart", keys: ["nodes", "employees", "departments"] }) : null,
};

export function ResourceWorkspace({ pageKey }: { pageKey: string }) {
  const { user, timeZone, currencyCode } = useWorkspace();
  const meta = routePageMeta[pageKey] ?? { title: humanize(pageKey), description: "Review the information available in your workspace." };
  const config = useMemo(() => configs[pageKey]?.(user.role) ?? null, [pageKey, user.role]);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [secondaryRecords, setSecondaryRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [secondaryError, setSecondaryError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"primary" | "secondary">("primary");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!config) { if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true); setError(""); setSecondaryError("");
    try {
      const result = await apiRequest<unknown>(config.endpoint);
      setRecords(pickArray(result, ...config.keys));
      if (config.secondary) {
        try {
          const secondary = await apiRequest<unknown>(config.secondary.endpoint);
          setSecondaryRecords(pickArray(secondary, ...config.secondary.keys));
        } catch (caught) { setSecondaryError(caught instanceof Error ? caught.message : "Unable to load this section."); }
      } else setSecondaryRecords([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load this workspace data."); }
    finally { if (!silent) setLoading(false); }
  }, [config]);
  useEffect(() => { void load(); }, [load]);
  useSmartRefresh(() => load(true), Boolean(config) && !detail);

  const visibleRecords = useMemo(() => {
    const source = tab === "secondary" ? secondaryRecords : records;
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((record) => Object.values(record).some((value) => typeof value === "string" || typeof value === "number" ? String(value).toLowerCase().includes(needle) : false));
  }, [records, secondaryRecords, query, tab]);

  if (pageKey === "support") return <NotConnected title="Organization support" description="The existing source exposes a platform-support route family, but this front-end increment has not yet verified the tenant-specific support contract. No unsupported ticket creation or status changes are simulated." />;
  if (pageKey === "organization-chart" && !config) return <NotConnected title="Organization chart" description="This role’s current backend access contract for the organization hierarchy must be verified before displaying or editing reporting relationships." />;
  if (!config) return <NotConnected title={meta.title} description="This workspace surface is part of the planned experience. Its API contract must be confirmed against the current backend before wiring real data or actions." />;

  const rows = visibleRecords;
  const columns = preferredColumns(pageKey, rows);
  const title = config.secondary && tab === "secondary" ? config.secondary.label : meta.title;
  const activeError = tab === "secondary" ? secondaryError : error;

  return <>
    <PageHeader eyebrow={groupLabel(pageKey)} title={meta.title} description={meta.description} />
    <Panel>
      {config.secondary ? <div style={{ display: "flex", gap: 5, padding: "12px 18px 0" }}><button type="button" className={`button ${tab === "primary" ? "button-primary" : "button-ghost"} button-sm`} onClick={() => setTab("primary")}>{meta.title}</button><button type="button" className={`button ${tab === "secondary" ? "button-primary" : "button-ghost"} button-sm`} onClick={() => setTab("secondary")}>{config.secondary.label}</button></div> : null}
      <div className="toolbar"><div className="toolbar-left"><label className="search-field"><SearchIcon /><input placeholder={`Search ${title.toLowerCase()}…`} aria-label={`Search ${title}`} value={query} onChange={(e) => setQuery(e.target.value)} /></label></div><span style={{ fontSize: 12, color: "var(--muted)" }}>{loading ? "Loading…" : `${rows.length} records`}</span></div>
      {loading && !rows.length ? <div style={{ padding: 20, display: "grid", gap: 12 }}>{[1,2,3,4].map((n) => <div className="skeleton" key={n} style={{ height: 48 }} />)}</div> : null}
      {!loading && activeError ? <div className="error-state"><div className="state-icon"><AlertCircle size={18} /></div><h3>Unable to load {title.toLowerCase()}</h3><p>{activeError} This section will retry automatically.</p></div> : null}
      {!loading && !activeError && !rows.length ? <div className="empty-state"><div className="state-icon"><FileBarChart size={18} /></div><h3>{query ? "No matching records" : `No ${title.toLowerCase()} records`}</h3><p>{query ? "Try another search term." : "When the backend has records available to this role, they will appear here."}</p></div> : null}
      {rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{labelFor(column)}</th>)}<th><span className="sr-only">Details</span></th></tr></thead><tbody>{rows.map((record, index) => <tr key={stringValue(record, "id") || index} onClick={() => setDetail(record)} style={{ cursor: "pointer" }}>{columns.map((column) => <td key={column}>{renderCell(record[column], column, record, timeZone, currencyCode)}</td>)}<td><span style={{ color: "var(--accent-strong)", fontSize: 12 }}>View</span></td></tr>)}</tbody></table></div> : null}
    </Panel>
    {detail ? <RecordDetail record={detail} onClose={() => setDetail(null)} /> : null}
  </>;
}

function preferredColumns(pageKey: string, rows: Record<string, unknown>[]) {
  const known: Record<string, string[]> = {
    invitations: ["email", "employeeName", "employeeCode", "status", "createdAt", "expiresAt"],
    "pay-rates": ["employeeName", "employeeCode", "hourlyRate", "overtimeRate", "currencyCode", "effectiveFrom"],
    payroll: ["employeeName", "employeeCode", "payMonth", "calculatedAmount", "currencyCode", "status"],
    "my-earnings": ["workDate", "scheduleName", "totalRecordedMinutes", "approvedOvertimeMinutes", "calculatedAmount"],
    earnings: ["workDate", "scheduleName", "totalRecordedMinutes", "approvedOvertimeMinutes", "calculatedAmount"],
    schedules: ["name", "description", "startTime", "endTime", "status"],
    schedule: ["employeeName", "scheduleName", "effectiveFrom", "effectiveTo", "status"],
    leave: ["employeeName", "leaveType", "startDate", "endDate", "isPaid", "status"],
    "organization-chart": ["firstName", "lastName", "employeeCode", "designation", "departmentName", "workforceRole"],
  };
  if (!rows.length) return known[pageKey] ?? [];
  const available = new Set(Object.keys(rows[0]));
  const preferred = (known[pageKey] ?? []).filter((key) => available.has(key));
  return [...preferred, ...Object.keys(rows[0]).filter((key) => !preferred.includes(key) && !/organizationId|employeeId|managerId|createdAt|updatedAt|id/i.test(key)).slice(0, Math.max(0, 5 - preferred.length))].slice(0, 6);
}
function labelFor(value: string) { return humanize(value.replace(/([a-z])([A-Z])/g, "$1 $2")); }
function renderCell(value: unknown, key: string, record: Record<string, unknown>, timeZone: string, currencyCode: string | null) {
  if (value === null || value === undefined || value === "") return <span style={{ color: "var(--subtle)" }}>—</span>;
  if (/status/i.test(key)) return <StatusBadge value={value} />;
  if (/date|At$/i.test(key) && typeof value === "string") return formatDate(value, timeZone);
  if (/paid$/i.test(key) && typeof value === "boolean") return value ? "Paid" : "Unpaid";
  if (/amount|rate|salary|earning|hourly/i.test(key)) {
    const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(num)) return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode || String(record.currencyCode ?? "USD"), maximumFractionDigits: 2 }).format(num);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Details available";
  return String(value);
}
function RecordDetail({ record, onClose }: { record: Record<string, unknown>; onClose: () => void }) {
  const entries = Object.entries(record).filter(([key, value]) => !/organizationId|organization_id|password|token/i.test(key) && value !== null && value !== undefined && typeof value !== "object");
  return <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="drawer-panel drawer-standard" role="dialog" aria-modal="true" aria-label="Record details"><header className="drawer-header"><div><h2>Record details</h2><p>Information returned by the current workspace API.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><XIcon /></button></header><div className="drawer-body"><div className="form-grid">{entries.map(([key, value]) => <div key={key}><p className="field-hint">{labelFor(key)}</p><p style={{ color: "var(--text-strong)", fontSize: 12, fontWeight: 600, overflowWrap: "anywhere" }}>{typeof value === "string" && /status/i.test(key) ? <StatusBadge value={value} /> : String(value)}</p></div>)}</div></div><footer className="drawer-footer"><Button onClick={onClose}>Close</Button></footer></section></div>;
}

function ReportsNotice() {
  return <><PageHeader eyebrow="Insights" title="Reports" description="Build a focused view of attendance and workforce activity for a selected period." /><Panel className="panel-pad"><div className="state-icon"><FileBarChart size={19} /></div><h3 style={{ color: "var(--text-strong)", margin: "0 0 6px", fontSize: 15 }}>Report generation is being connected</h3><p style={{ color: "var(--muted)", fontSize: 12, maxWidth: 560, lineHeight: 1.7 }}>The source backend exposes daily, monthly, and organization attendance report endpoints. Their exact filters, PDF response handling, and role scopes are being verified before report generation is enabled here.</p></Panel></>;
}
function NotConnected({ title, description }: { title: string; description: string }) { return <><PageHeader eyebrow="Workspace" title={title} description={description} /><Panel className="panel-pad"><div className="state-icon"><ShieldCheck size={19} /></div><h3 style={{ color: "var(--text-strong)", margin: "0 0 6px", fontSize: 15 }}>Integration pending</h3><p style={{ color: "var(--muted)", fontSize: 12, maxWidth: 610, lineHeight: 1.7 }}>{description}</p></Panel></>; }
function groupLabel(pageKey: string) { return ["employees", "departments", "team", "organization-chart", "invitations"].includes(pageKey) ? "People" : ["attendance", "my-attendance", "schedule", "schedules", "leave"].includes(pageKey) ? "Time & work" : ["payroll", "pay-rates", "earnings", "my-earnings"].includes(pageKey) ? "Compensation" : "Workspace"; }
function SearchIcon() { return <Activity size={14} />; }
function XIcon() { return <span aria-hidden="true">×</span>; }
