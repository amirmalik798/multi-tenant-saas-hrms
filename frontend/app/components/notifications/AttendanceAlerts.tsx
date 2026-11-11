"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";
import { BellRing, CheckCircle2 } from "lucide-react";

type AlertItem = { id: string; title: string; count: number; href: string; tone?: "critical" | "warning" | "info"; detail?: string };
type Payload = { alerts?: AlertItem[]; total?: number; checkedAt?: string; message?: string };

export default function AttendanceAlerts({ additionalAlerts = [], variant = "default", additionalAlertsLoading = false, additionalAlertsError = false, collapsible = false }: { additionalAlerts?: AlertItem[]; variant?: "default" | "action-center"; additionalAlertsLoading?: boolean; additionalAlertsError?: boolean; collapsible?: boolean }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/backend/notifications/summary", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
      setAlerts(Array.isArray(payload?.alerts) ? payload.alerts.filter((item) => item && typeof item.title === "string" && Number.isFinite(item.count) && item.count > 0) : []);
      setCheckedAt(typeof payload?.checkedAt === "string" ? payload.checkedAt : new Date().toISOString());
    } catch (e) { setError(e instanceof Error ? e.message : "Alerts could not be loaded."); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useWorkspaceAutoRefresh(() => load(true), {
    intervalMs: 30_000,
    shouldRefresh: () => !loading,
  });
  const combinedAlerts = useMemo(() => {
    const seen = new Set<string>();
    return [...additionalAlerts, ...alerts].filter((item) => {
      if (!item || !item.id || seen.has(item.id) || !Number.isFinite(item.count) || item.count <= 0) return false;
      seen.add(item.id);
      return true;
    });
  }, [additionalAlerts, alerts]);
  const totalCount = combinedAlerts.reduce((sum, item) => sum + item.count, 0);
  const criticalCount = combinedAlerts.filter((item) => item.tone === "critical").reduce((sum, item) => sum + item.count, 0);
  const warningCount = combinedAlerts.filter((item) => item.tone === "warning").reduce((sum, item) => sum + item.count, 0);
  const infoCount = combinedAlerts.filter((item) => item.tone !== "critical" && item.tone !== "warning").reduce((sum, item) => sum + item.count, 0);

  if (variant !== "action-center") {
    return <section aria-label="Alerts and notifications" className="mb-4 rounded-2xl border border-slate-800/90 bg-[#131a24] p-3.5 shadow-lg shadow-black/10 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => collapsible && setExpanded((value) => !value)} aria-expanded={collapsible ? expanded : undefined} aria-controls={collapsible ? "employee-alerts-content" : undefined} className={`flex min-w-0 items-center gap-2 text-left ${collapsible ? "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70" : "cursor-default"}`}>
          <BellRing size={17} className="shrink-0 text-amber-300" /><h2 className="font-semibold text-slate-100">Alerts</h2><span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">{alerts.reduce((sum, item) => sum + item.count, 0)}</span>
          {collapsible && <span className="ml-1 text-xs text-slate-400">{expanded ? "Hide" : "Show"}</span>}
        </button>
      </div>
      {(!collapsible || expanded) && <div id={collapsible ? "employee-alerts-content" : undefined}>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : loading ? <p className="mt-3 text-sm text-slate-400">Checking for updates…</p> : alerts.length === 0 ? <div className="mt-3 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} /><span>No outstanding alerts.</span></div> : <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{alerts.map((item) => <li key={item.id}><Link href={item.href} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-[#0e141d] px-3 py-2.5 transition hover:border-sky-400/40 hover:bg-white/[0.025]"><span className="text-sm text-slate-200">{item.title}</span><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.tone === "warning" ? "bg-amber-400/10 text-amber-200" : "bg-sky-400/10 text-sky-200"}`}>{item.count}</span></Link></li>)}</ul>}
        {checkedAt && <p className="mt-3 text-xs text-slate-500">Last checked {new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>}
      </div>}
    </section>;
  }

  return <section aria-label="Action center" className="rounded-xl border border-slate-800/90 bg-[#131a24] p-4 shadow-lg shadow-black/10 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-200"><BellRing size={18} /></span>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-100">Action center</h2><span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-200">{(loading || additionalAlertsLoading) && combinedAlerts.length === 0 ? "…" : totalCount} open</span></div><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">Items that may need follow-up. Open an item to review it in the relevant HRMS workspace.</p></div>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Open items by severity">
      <div className="rounded-lg border border-rose-400/15 bg-rose-400/[0.06] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-rose-200/75">Critical</p><p className="mt-1 text-xl font-bold tabular-nums text-rose-100">{criticalCount}</p></div>
      <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/75">Attention</p><p className="mt-1 text-xl font-bold tabular-nums text-amber-100">{warningCount}</p></div>
      <div className="rounded-lg border border-sky-400/15 bg-sky-400/[0.06] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-sky-200/75">Informational</p><p className="mt-1 text-xl font-bold tabular-nums text-sky-100">{infoCount}</p></div>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2 text-xs leading-5 text-rose-200">Some live alerts could not be refreshed: {error}</p>}
    {(loading || additionalAlertsLoading) && combinedAlerts.length === 0 ? <p role="status" className="mt-4 text-sm text-slate-400">Checking for outstanding items…</p> : additionalAlertsError && combinedAlerts.length === 0 ? <p role="alert" className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-3 text-sm text-amber-100">Organization health items could not be evaluated because the dashboard snapshot is unavailable.</p> : combinedAlerts.length === 0 ? <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-3 text-sm text-emerald-200"><CheckCircle2 size={16} /><span>No outstanding action items were found in the available dashboard data.</span></div> : <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{combinedAlerts.map((item) => {
      const tone = item.tone ?? "info";
      const toneStyle = tone === "critical" ? "border-rose-400/25 bg-rose-500/[0.06] hover:border-rose-300/40" : tone === "warning" ? "border-amber-400/20 bg-amber-400/[0.035] hover:border-amber-300/40" : "border-slate-700/80 bg-[#0e141d] hover:border-sky-400/40";
      const badgeStyle = tone === "critical" ? "bg-rose-400/10 text-rose-200" : tone === "warning" ? "bg-amber-400/10 text-amber-200" : "bg-sky-400/10 text-sky-200";
      const severityLabel = tone === "critical" ? "Critical" : tone === "warning" ? "Attention" : "Info";
      return <li key={item.id}><Link href={item.href} className={`group flex h-full min-h-[108px] flex-col rounded-xl border px-3.5 py-3 transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${toneStyle}`}><span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold leading-5 text-slate-100">{item.title}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badgeStyle}`}>{severityLabel} · {item.count}</span></span><span className="mt-1.5 text-xs leading-5 text-slate-400">{item.detail || "Open the relevant workspace to review and resolve this item."}</span><span className="mt-auto flex items-center justify-end gap-1 pt-2 text-[11px] font-semibold text-sky-200">Review item <span aria-hidden="true">→</span></span></Link></li>;
    })}</ul>}
    {checkedAt && <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-5 text-slate-500">Last notification check {new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>}
  </section>;
}


