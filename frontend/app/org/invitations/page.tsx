"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";
import { useRouter } from "next/navigation";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
  useOrganizationAdminAutoRefresh,
} from "../../components/org-admin/OrganizationAdminChrome";

type OrgAdminUser = {
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
type InvitationHistoryEvent = {
  id: string;
  event_type: string;
  reason?: string | null;
  effective_at?: string | null;
  created_at: string;
};
type Invitation = {
  id: string;
  organization_id: string;
  employee_id: string;
  email: string;
  status: string;
  display_status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  employee_code: string | null;
  first_name: string | null;
  last_name: string | null;
  employee_name: string | null;
  employment_status: string | null;
  workforce_role: string | null;
  invited_by_email: string | null;
  history: InvitationHistoryEvent[];
};
type Summary = { total: number; pending: number; accepted: number; expired: number; revoked: number };
type InvitationResponse = {
  status: string;
  message?: string;
  invitations: Invitation[];
  summary: Summary;
  pagination: { page: number; limit: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
};
type StatusFilter = "ALL" | InvitationStatus;
type IconName = "dashboard" | "mail" | "search" | "filter" | "calendar" | "clock" | "arrow" | "users" | "check" | "alert" | "table" | "grid" | "building";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M10.3 3.9 1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>,
    building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">{paths[name]}</svg>;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status: string) {
  switch (status.toUpperCase()) {
    case "PENDING": return "border-amber-400/25 bg-amber-500/[0.08] text-amber-200";
    case "ACCEPTED": return "border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200";
    case "EXPIRED": return "border-slate-500/30 bg-slate-500/[0.08] text-slate-300";
    case "REVOKED": return "border-rose-400/25 bg-rose-500/[0.06] text-rose-200";
    default: return "border-[#34465d] bg-[#182232] text-slate-300";
  }
}

function statusLabel(status: string) {
  const value = status.toUpperCase();
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function roleLabel(role: string | null) {
  switch (role) {
    case "ORGANIZATION_ADMIN": return "Organization Admin";
    case "HR_MANAGER": return "HR Manager";
    case "DEPARTMENT_MANAGER": return "Department Manager";
    case "EMPLOYEE": return "Employee";
    default: return role || "Role unavailable";
  }
}

export default function OrganizationInvitationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoadedInvitationsRef = useRef(false);
  const loadedInvitationQueryRef = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 });
  const [totalPages, setTotalPages] = useState(0);
  const [matchingTotal, setMatchingTotal] = useState(0);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let active = true;
    async function verifySession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", { credentials: "same-origin", cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.authenticated !== true || data?.user?.role !== "ORGANIZATION_ADMIN" || !data?.user?.organizationId) {
          router.replace("/");
          return;
        }
        if (active) setUser(data.user as OrgAdminUser);
      } catch {
        router.replace("/");
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void verifySession();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => { setPage(1); }, [debouncedSearchQuery, statusFilter]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const requestKey = `${page}|${debouncedSearchQuery}|${statusFilter}`;
    async function loadInvitations() {
      if (!hasLoadedInvitationsRef.current) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (debouncedSearchQuery) params.set("q", debouncedSearchQuery);
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        const response = await fetch(`/api/backend/org/invitations?${params.toString()}`, { credentials: "same-origin", cache: "no-store" });
        const data = await response.json().catch(() => null) as InvitationResponse | null;
        if (response.status === 401) { router.replace("/"); return; }
        if (!response.ok || !data || !Array.isArray(data.invitations) || !data.summary || !data.pagination) {
          throw new Error(data?.message || "Unable to load workforce invitations.");
        }
        if (active) {
          setInvitations(data.invitations);
          hasLoadedInvitationsRef.current = true;
          loadedInvitationQueryRef.current = requestKey;
          setSummary({
            total: Number(data.summary.total) || 0,
            pending: Number(data.summary.pending) || 0,
            accepted: Number(data.summary.accepted) || 0,
            expired: Number(data.summary.expired) || 0,
            revoked: Number(data.summary.revoked) || 0,
          });
          setTotalPages(Number(data.pagination.totalPages) || 0);
          setMatchingTotal(Number(data.pagination.total) || 0);
        }
      } catch (loadError) {
        if (active) {
          // Keep the last successful result visible during a background refresh failure.
          if (loadedInvitationQueryRef.current !== requestKey) {
            setInvitations([]);
            setSummary({ total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 });
            setTotalPages(0);
            setMatchingTotal(0);
          }
          setError(loadError instanceof Error ? loadError.message : "Unable to load workforce invitations.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInvitations();
    return () => { active = false; };
  }, [user, page, reloadKey, debouncedSearchQuery, statusFilter, router]);

  const hasFilters = Boolean(debouncedSearchQuery) || statusFilter !== "ALL";
  const refresh = useCallback(() => { setReloadKey((value) => value + 1); }, []);

  useOrganizationAdminAutoRefresh(refresh, {
    enabled: Boolean(user),
    shouldRefresh: () => !loading && !resendingId,
  });

  async function handleResendInvitation(invitation: Invitation) {
    if (resendingId) return;
    setResendingId(invitation.employee_id);
    setActionMessage(null);
    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(invitation.employee_id)}/invitation/resend`,
        { method: "POST", credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "Unable to resend this invitation.");
      setActionMessage({ type: "success", text: payload?.message || `Invitation sent again to ${invitation.email}.` });
      refresh();
    } catch (resendError) {
      setActionMessage({
        type: "error",
        text: resendError instanceof Error ? resendError.message : "Unable to resend this invitation.",
      });
    } finally {
      setResendingId(null);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Unable to log out.");
      }
      router.replace("/");
    } catch (logoutFailure) {
      setLogoutError(logoutFailure instanceof Error ? logoutFailure.message : "Unable to log out.");
      setLoggingOut(false);
    }
  }

  if (checkingSession) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-white"><div role="status" className="flex items-center gap-3 rounded-xl border border-[#29384b] bg-[#111a28] px-5 py-4 text-sm text-slate-300"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent" />Verifying organization session…</div></main>;
  }
  if (!user) return null;

  const closedCount = summary.expired + summary.revoked;
  const metricCards: Array<{ label: string; value: number; note: string; tone: string; icon: IconName }> = [
    { label: "Total invitations", value: summary.total, note: "All invitation records in this organization", tone: "border-blue-400/30 bg-blue-500/15 text-blue-300", icon: "mail" },
    { label: "Pending invitations", value: summary.pending, note: "Awaiting acceptance and still valid", tone: "border-amber-400/30 bg-amber-500/15 text-amber-300", icon: "clock" },
    { label: "Accepted invitations", value: summary.accepted, note: "Completed activation invitations", tone: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300", icon: "check" },
    { label: "Expired / revoked", value: closedCount, note: "Invitations no longer available for acceptance", tone: "border-violet-400/30 bg-violet-500/15 text-violet-300", icon: "alert" },
  ];

  const renderInvitationHistory = (invitation: Invitation) => (
    <details className="group mt-3 rounded-xl border border-[#29384b] bg-[#0b111b]/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-bold text-slate-300 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#75c7ff]">
        <span className="flex items-center gap-2"><Icon name="clock" size={14} />Status history ({invitation.history?.length ?? 0} events)</span>
        <span className="text-slate-500 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-[#29384b] px-3.5 py-3">
        {(invitation.history ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">No invitation-linked history events are recorded for this invitation.</p>
        ) : (
          <ol className="space-y-3">
            {invitation.history.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#75c7ff]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-200">{event.event_type.replace(/_/g, " ")}</p>
                    <time className="text-[10px] text-slate-500">{formatDateTime(event.effective_at || event.created_at)}</time>
                  </div>
                  {event.reason && <p className="mt-1 text-xs leading-relaxed text-slate-400">{event.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );

  return (
    <div className="org-admin-workspace relative min-h-screen bg-[#0b0f17] font-sans text-[#f8fafc] scheme-dark selection:bg-[#75c7ff]/20 selection:text-white">
      <OrganizationAdminSidebar activePage="invitations" />
      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="invitations"
          organizationName={user.organizationName}
          loggingOut={loggingOut}
          onLogout={() => void handleLogout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
          onNavigateRequest={() => true}
        />

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">{logoutError}</div>}

          {/* Metrics follow the four-card layout used by the Departments directory. */}
          <section aria-label="Invitation metrics" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricCards.map((metric) => (
              <article key={metric.label} className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{metric.label}</p>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${metric.tone}`}><Icon name={metric.icon} size={20} /></span>
                  </div>
                  <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : metric.value.toLocaleString()}</p>
                  <p className="mt-1 text-xs font-medium text-slate-300">{metric.note}</p>
                </div>
              </article>
            ))}
          </section>

          {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200"><Icon name="alert" size={18} /><div className="flex-1"><p>{error}</p></div></div>}
          {actionMessage && <div role={actionMessage.type === "error" ? "alert" : "status"} className={`mb-5 rounded-xl border p-3 text-sm font-medium ${actionMessage.type === "error" ? "border-rose-400/30 bg-rose-500/10 text-rose-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>{actionMessage.text}</div>}

          <section className="overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90">
            <div className="flex flex-col gap-3 border-b border-[#29384b] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-bold text-white">Workforce invitation directory</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-[#29384b] bg-[#0f1724] p-1" aria-label="Directory view">
                  <button type="button" onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === "table" ? "bg-[#26374b] text-white" : "text-slate-400 hover:text-white"}`}><Icon name="table" size={14} />Table</button>
                  <button type="button" onClick={() => setViewMode("cards")} aria-pressed={viewMode === "cards"} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === "cards" ? "bg-[#26374b] text-white" : "text-slate-400 hover:text-white"}`}><Icon name="grid" size={14} />Cards</button>
                </div>
                <span className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-300">Page {page} / {Math.max(totalPages, 1)}</span>
                <Link href="/org/employees" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#75c7ff] px-3.5 text-xs font-bold text-[#07111d] transition hover:bg-[#a0dcff]"><Icon name="users" size={14} />Employees</Link>
                
              </div>
            </div>

            <div className="space-y-3 border-b border-[#29384b] px-4 py-4 sm:px-5">
              <div className="grid gap-3 md:grid-cols-[minmax(260px,1.4fr)_minmax(190px,0.8fr)]">
                <div className="min-w-0">
                  <label htmlFor="invitation-search" className="mb-1.5 block text-xs font-semibold text-slate-300">Search directory</label>
                  <div className="relative"><span className="pointer-events-none absolute left-3 top-3 text-slate-500"><Icon name="search" size={16} /></span><input id="invitation-search" type="search" maxLength={100} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Email, employee code, name, or role…" className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-[#75c7ff]/70 focus:ring-2 focus:ring-[#75c7ff]/10" /></div>
                </div>
                <div className="min-w-0">
                  <label htmlFor="invitation-status" className="mb-1.5 block text-xs font-semibold text-slate-300">Invitation status</label>
                  <select id="invitation-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none transition focus:border-[#75c7ff]/70">
                    <option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="ACCEPTED">Accepted</option><option value="EXPIRED">Expired</option><option value="REVOKED">Revoked</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">{loading ? "Loading records…" : `${invitations.length} shown on this page · ${matchingTotal.toLocaleString()} matching in total`}</p>
                {(searchQuery.trim() || statusFilter !== "ALL") && <button type="button" onClick={() => { setSearchQuery(""); setDebouncedSearchQuery(""); setStatusFilter("ALL"); setPage(1); }} className="text-xs font-semibold text-[#9ed8ff] underline-offset-4 hover:underline">Reset all filters</button>}
              </div>
            </div>

            {loading ? (
              <div role="status" aria-live="polite" aria-busy="true" className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl border border-[#29384b] bg-[#0f1724]" />)}</div>
            ) : error ? null : invitations.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] text-slate-400"><Icon name="mail" size={22} /></span>
                <h3 className="mt-3 text-base font-bold text-white">{summary.total === 0 && !hasFilters ? "No invitations yet" : "No matching invitations"}</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{summary.total === 0 && !hasFilters ? "Workforce invitations will appear here after an employee profile is invited." : "No invitations match the current search and status filters. Try another term or reset the filters."}</p>
                {hasFilters && <button type="button" onClick={() => { setSearchQuery(""); setDebouncedSearchQuery(""); setStatusFilter("ALL"); setPage(1); }} className="mt-4 inline-flex items-center rounded-lg border border-[#34465d] bg-[#0b0f17] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05]">Reset filters</button>}
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto overscroll-x-contain px-4 pb-3 sm:px-5">
                <table className="w-full min-w-[1150px] text-left text-sm">
                  <thead className="border-b border-[#29384b] bg-[#111a28]/85 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a2b8cc]">
                    <tr>
                      <th scope="col" className="px-3 py-3">Invitation / employee</th>
                      <th scope="col" className="px-3 py-3">Role &amp; employment</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3">Created</th>
                      <th scope="col" className="px-3 py-3">Expires</th>
                      <th scope="col" className="px-3 py-3">Invited by</th>
                      <th scope="col" className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#29384b]">
                    {invitations.map((invitation) => (
                      <Fragment key={invitation.id}>
                      <tr className="align-top transition-colors hover:bg-white/[0.025]">
                        <td className="max-w-[290px] px-3 py-3">
                          <div className="flex min-w-0 items-start gap-3"><EmployeeProfilePhoto
                              employeeId={invitation.employee_id}
                              name={invitation.employee_name || invitation.email}
                              className="h-10 w-10 rounded-xl border border-[#34465d] bg-[#182232]"
                              textClassName="text-xs font-bold text-slate-100"
                            /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{invitation.employee_name || invitation.email}</p><p className="mt-0.5 break-all text-xs text-slate-300">{invitation.email}</p>{invitation.employee_code && <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{invitation.employee_code}</p>}</div></div>
                        </td>
                        <td className="px-3 py-3"><p className="text-xs font-semibold text-slate-200">{roleLabel(invitation.workforce_role)}</p><p className="mt-1 text-[11px] text-slate-500">Employment: {invitation.employment_status || "Unknown"}</p></td>
                        <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(invitation.display_status)}`}><span className={`h-1.5 w-1.5 rounded-full ${invitation.display_status === "PENDING" ? "bg-amber-300" : invitation.display_status === "ACCEPTED" ? "bg-emerald-300" : invitation.display_status === "REVOKED" ? "bg-rose-300" : "bg-slate-300"}`} />{statusLabel(invitation.display_status)}</span>{invitation.accepted_at && <p className="mt-1.5 text-[10px] text-emerald-200">Accepted {formatDateTime(invitation.accepted_at)}</p>}{invitation.revoked_at && <p className="mt-1.5 text-[10px] text-rose-200">Revoked {formatDateTime(invitation.revoked_at)}</p>}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-300">{formatDateTime(invitation.created_at)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-300">{formatDateTime(invitation.expires_at)}</td>
                        <td className="max-w-[170px] break-all px-3 py-3 text-xs text-slate-400">{invitation.invited_by_email || "Unavailable"}</td>
                        <td className="px-3 py-3"><div className="flex flex-col items-start gap-2"><Link href={`/org/employees?employeeId=${encodeURIComponent(invitation.employee_id)}`} className="inline-flex items-center gap-1.5 rounded-md border border-[#34465d] px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.05]">View <Icon name="arrow" size={12} /></Link>{invitation.display_status === "PENDING" && <button type="button" onClick={() => void handleResendInvitation(invitation)} disabled={resendingId !== null} className="inline-flex items-center gap-1.5 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/15 disabled:cursor-wait disabled:opacity-50">{resendingId === invitation.employee_id ? "Sending…" : "Resend invite"}</button>}</div></td>
                      </tr>
                      <tr className="border-b border-[#29384b] bg-[#111a28]/45">
                        <td colSpan={7} className="px-3 pb-3 pt-0">{renderInvitationHistory(invitation)}</td>
                      </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {invitations.map((invitation) => (
                  <article key={invitation.id} className="rounded-xl border border-[#29384b] bg-[#0f1724]/55 p-4 transition-colors hover:border-[#3b536d]">
                    <div className="flex items-start gap-3"><EmployeeProfilePhoto
                        employeeId={invitation.employee_id}
                        name={invitation.employee_name || invitation.email}
                        className="h-11 w-11 rounded-xl border border-[#34465d] bg-[#182232]"
                        textClassName="text-xs font-bold text-slate-100"
                      /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold text-white">{invitation.employee_name || invitation.email}</h3><p className="mt-0.5 break-all text-xs text-slate-300">{invitation.email}</p>{invitation.employee_code && <p className="mt-1 font-mono text-[11px] text-slate-500">{invitation.employee_code}</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(invitation.display_status)}`}>{statusLabel(invitation.display_status)}</span></div>
                    <div className="mt-3 rounded-lg border border-[#29384b] bg-[#111a28]/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assigned workforce role</p><p className="mt-1 text-xs font-semibold text-slate-200">{roleLabel(invitation.workforce_role)}</p><p className="mt-1 text-[11px] text-slate-500">Employment: {invitation.employment_status || "Unknown"}</p></div>
                    <dl className="mt-4 space-y-2 border-t border-[#29384b] pt-3 text-xs"><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Created</dt><dd className="text-right font-medium text-slate-200">{formatDateTime(invitation.created_at)}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Expires</dt><dd className="text-right font-medium text-slate-200">{formatDateTime(invitation.expires_at)}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Last update</dt><dd className="text-right font-medium text-slate-200">{formatDateTime(invitation.updated_at)}</dd></div><div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-slate-500">Invited by</dt><dd className="break-all text-right font-medium text-slate-200">{invitation.invited_by_email || "Unavailable"}</dd></div></dl>
                    {invitation.accepted_at && <p className="mt-3 text-[11px] text-emerald-200">Accepted {formatDateTime(invitation.accepted_at)}</p>}
                    {invitation.revoked_at && <p className="mt-1 text-[11px] text-rose-200">Revoked {formatDateTime(invitation.revoked_at)}</p>}
                    <div className="mt-4 flex flex-col gap-2 border-t border-[#29384b] pt-3"><Link href={`/org/employees?employeeId=${encodeURIComponent(invitation.employee_id)}`} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#34465d] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05]">Open employee <Icon name="arrow" size={13} /></Link>{invitation.display_status === "PENDING" && <button type="button" onClick={() => void handleResendInvitation(invitation)} disabled={resendingId !== null} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-wait disabled:opacity-50">{resendingId === invitation.employee_id ? "Sending invitation…" : "Resend invitation"}</button>}</div>
                    {renderInvitationHistory(invitation)}
                  </article>
                ))}
              </div>
            )}

            {!loading && !error && invitations.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-[#29384b] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs text-slate-400">Showing {invitations.length} records on this page · <span className="font-semibold text-slate-200">{matchingTotal.toLocaleString()}</span> matching invitations total</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#3b536d] disabled:opacity-35">Previous</button>
                  <span className="min-w-[90px] text-center text-xs font-semibold text-slate-300">Page {page} of {Math.max(totalPages, 1)}</span>
                  <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#3b536d] disabled:opacity-35">Next</button>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}
