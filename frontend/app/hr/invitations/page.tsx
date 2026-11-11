"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileClock,
  Filter,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
  useHRManagerAutoRefresh,
} from "../../components/hr/HRManagerChrome";

type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";

type StatusFilter = "ALL" | InvitationStatus;
type ViewMode = "table" | "cards";

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

type Summary = {
  total: number;
  pending: number;
  accepted: number;
  expired: number;
  revoked: number;
};

type InvitationResponse = {
  status?: string;
  message?: string;
  invitations: Invitation[];
  summary: Summary;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

const PAGE_SIZE = 20;

const EMPTY_SUMMARY: Summary = {
  total: 0,
  pending: 0,
  accepted: 0,
  expired: 0,
  revoked: 0,
};

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function formatDateTime(
  value: string | null | undefined,
): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "ORGANIZATION_ADMIN":
      return "Organization Admin";
    case "HR_MANAGER":
      return "HR Manager";
    case "DEPARTMENT_MANAGER":
      return "Department Manager";
    case "EMPLOYEE":
      return "Employee";
    default:
      return role || "Role unavailable";
  }
}

function statusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "UNKNOWN").toUpperCase();

  switch (normalized) {
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "EXPIRED":
      return "Expired";
    case "REVOKED":
      return "Revoked";
    default:
      return status || "Unknown";
  }
}

function statusClass(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "PENDING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "ACCEPTED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "EXPIRED":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "REVOKED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-400";
    default:
      return "border-[#3A4A60] bg-[#202D40] text-[#E8EEF5]";
  }
}

function initials(invitation: Invitation): string {
  const name =
    invitation.employee_name ||
    invitation.email ||
    "IN";

  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "IN"
  );
}

function employeeName(invitation: Invitation): string {
  return (
    invitation.employee_name ||
    [invitation.first_name, invitation.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    invitation.email
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  iconTone,
}: {
  label: string;
  value: number | string;
  icon: typeof Mail;
  accent: string;
  iconTone: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-[#344357]/80 border-t-[3px] ${accent} bg-[#192333] p-5 shadow-xl transition-all hover:border-[#3A4A60]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C5D0DE]">
            {label}
          </p>
          <p className="mt-2.5 text-3xl font-extrabold tracking-tight text-white">
            {typeof value === "number" ? new Intl.NumberFormat().format(value) : value}
          </p>
        </div>
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
        >
          <Icon size={21} />
        </div>
      </div>
    </article>
  );
}

function InvitationHistory({
  invitation,
}: {
  invitation: Invitation;
}) {
  const events = invitation.history ?? [];

  return (
    <details className="group mt-3 rounded-xl border border-[#344357] bg-[#151C28]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold text-[#E8EEF5] outline-none hover:bg-[#202D40]/80 transition-colors">
        <span className="flex items-center gap-2">
          <FileClock size={15} className="text-blue-400" />
          Status history
          <span className="rounded-full bg-[#202D40] px-2 py-0.5 text-[10px] text-[#C5D0DE] ring-1 ring-slate-700">
            {events.length}
          </span>
        </span>
        <span className="text-[#C5D0DE] transition group-open:rotate-180">
          ↓
        </span>
      </summary>

      <div className="border-t border-[#344357] px-4 py-3.5">
        {events.length === 0 ? (
          <p className="text-xs leading-relaxed text-[#C5D0DE]">
            No invitation-linked history events were returned.
          </p>
        ) : (
          <ol className="space-y-4">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-[#F8FAFC]">
                      {event.event_type.replace(/_/g, " ")}
                    </p>
                    <time className="text-[10px] text-[#9AA8BA]">
                      {formatDateTime(
                        event.effective_at || event.created_at,
                      )}
                    </time>
                  </div>
                  {event.reason && (
                    <p className="mt-1 text-xs leading-relaxed text-[#C5D0DE]">
                      {event.reason}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

export default function HRManagerInvitationsPage() {
  const auth = useHRManagerSession();
  const user = auth.user;

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [summary, setSummary] = useState<Summary>({
    ...EMPTY_SUMMARY,
  });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(0);
  const [matchingTotal, setMatchingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const hasLoadedRef = useRef(false);

  const canViewInvitations = Boolean(
    user?.permissions.includes("invitation.view"),
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadInvitations = useCallback(async () => {
    if (!user) return;

    if (!canViewInvitations) {
      setError(
        "Your HR Manager account does not have permission to view workforce invitations. Ask your administrator to review the invitation.view permission.",
      );
      setInvitations([]);
      setSummary({ ...EMPTY_SUMMARY });
      hasLoadedRef.current = true;
      setLoading(false);
      return;
    }

    if (!hasLoadedRef.current) setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });

    if (debouncedSearch) {
      params.set("q", debouncedSearch);
    }

    if (statusFilter !== "ALL") {
      params.set("status", statusFilter);
    }

    try {
      const response = await fetch(
        `/api/backend/org/invitations?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const data =
        await readJson<InvitationResponse>(response);

      if (response.status === 401) {
        await auth.reload();
        return;
      }

      if (
        !response.ok ||
        !data ||
        !Array.isArray(data.invitations) ||
        !data.summary ||
        !data.pagination
      ) {
        throw new Error(
          (data as InvitationResponse | null)?.message ||
            "Unable to load workforce invitations.",
        );
      }

      setInvitations(data.invitations);

      setSummary({
        total: Number(data.summary.total) || 0,
        pending: Number(data.summary.pending) || 0,
        accepted: Number(data.summary.accepted) || 0,
        expired: Number(data.summary.expired) || 0,
        revoked: Number(data.summary.revoked) || 0,
      });

      setTotalPages(Number(data.pagination.totalPages) || 0);
      setMatchingTotal(Number(data.pagination.total) || 0);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load workforce invitations.",
      );
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [
    user,
    canViewInvitations,
    page,
    debouncedSearch,
    statusFilter,
    auth.reload,
  ]);

  useEffect(() => {
    if (user) void loadInvitations();
  }, [user, loadInvitations]);

  useHRManagerAutoRefresh(loadInvitations, {
    enabled: Boolean(user && canViewInvitations),
    intervalMs: 60_000,
  });

  const hasFilters =
    Boolean(debouncedSearch) || statusFilter !== "ALL";

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
  }

  if (auth.checking) {
    return <HRManagerLoading />;
  }

  if (!user) {
    return (
      <HRManagerUnavailable
        message={
          auth.error ||
          "Your HR Manager session could not be verified."
        }
        onRetry={() => void auth.reload()}
      />
    );
  }

  const metricCards = [
    {
      label: "Total invitations",
      value: loading ? "…" : error ? "—" : summary.total,
      icon: Mail,
      accent: "border-t-blue-500",
      iconTone: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
    },
    {
      label: "Pending",
      value: loading ? "…" : error ? "—" : summary.pending,
      icon: Clock3,
      accent: "border-t-amber-500",
      iconTone: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    },
    {
      label: "Accepted",
      value: loading ? "…" : error ? "—" : summary.accepted,
      icon: CheckCircle2,
      accent: "border-t-emerald-500",
      iconTone: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    },
    {
      label: "Expired or revoked",
      value: loading ? "…" : error ? "—" : summary.expired + summary.revoked,
      icon: CalendarClock,
      accent: "border-t-slate-500",
      iconTone: "bg-[#202D40] text-[#C5D0DE] ring-1 ring-slate-700",
    },
  ];

  return (
    <HRManagerShell
      user={user}
      activePage="invitations"
      title="Workforce invitations"
      description="Review workforce invitation status and history."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <style jsx global>{`
        :root[data-hr-manager-theme="light"] .hr-invitations-page {
          color: #172033;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class*="text-[#"],
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-white"]:not([class*="bg-blue-500"]) {
          color: #263449 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-blue-400"],
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-blue-300"] {
          color: #1d4ed8 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-emerald-400"],
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-emerald-300"] {
          color: #047857 !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-rose-400"],
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-rose-300"] {
          color: #be123c !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="text-amber-400"] {
          color: #92400e !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class*="bg-[#"],
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="bg-[#192333"],
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class~="bg-[#151C28"] {
          background-color: #ffffff !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page [class*="border-[#344357"] {
          border-color: #d5deea !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page input,
        :root[data-hr-manager-theme="light"] .hr-invitations-page select {
          color: #172033 !important;
          background-color: #ffffff !important;
          border-color: #c5d0df !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page input::placeholder {
          color: #64748b !important;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page button:not([class*="bg-blue-500"]) {
          color: #263449;
        }
        :root[data-hr-manager-theme="light"] .hr-invitations-page a:not([class*="bg-blue-500"]) {
          color: #1d4ed8;
        }
      `}</style>
      <div className="hr-invitations-page">

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 shadow-lg"
        >
          <span className="mt-0.5 shrink-0 text-rose-400">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">
              Invitations could not be loaded
            </p>
            <p className="mt-1 leading-relaxed text-rose-200/90">{error}</p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-[#344357]/80 bg-[#192333] shadow-xl">
        <div className="flex flex-col justify-between gap-4 border-b border-[#344357]/80 px-6 py-5 bg-[#151C28]/60 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Invitation directory
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border border-[#344357] bg-[#151C28] p-1 shadow-inner">
              <button
                type="button"
                aria-pressed={viewMode === "table"}
                onClick={() => setViewMode("table")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  viewMode === "table"
                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                    : "text-[#C5D0DE] hover:text-white"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  viewMode === "cards"
                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                    : "text-[#C5D0DE] hover:text-white"
                }`}
              >
                Cards
              </button>
            </div>

            <Link
              href="/hr/employees"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold !text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 [&>svg]:!text-white"
            >
              <Users size={15} />
              Employee directory
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>

        <div className="grid gap-3.5 border-b border-[#344357]/80 p-5 bg-[#192333] sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3.5 top-3.5 text-[#C5D0DE] pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="Search email, employee, code, role…"
              aria-label="Search invitations"
              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#151C28] pl-10 pr-4 text-xs font-medium text-[#F8FAFC] placeholder:text-[#9AA8BA] transition-all focus:bg-[#2D3A4F] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none shadow-inner"
            />
          </label>

          <label className="relative block">
            <Filter
              size={15}
              className="absolute left-3.5 top-3.5 text-[#C5D0DE] pointer-events-none"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              aria-label="Filter invitations by status"
              className="h-10.5 w-full rounded-xl border border-[#344357] bg-[#151C28] pl-10 pr-4 text-xs font-medium text-[#F8FAFC] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="EXPIRED">Expired</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10.5 items-center justify-center gap-2 rounded-xl border border-[#344357] bg-[#151C28] px-4 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] shadow-xs"
            >
              <X size={14} />
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-col justify-between gap-2 border-b border-[#344357]/80 bg-[#151C28]/40 px-6 py-3.5 sm:flex-row sm:items-center">
          <p className="text-xs text-[#C5D0DE] font-medium">
            {loading
              ? "Loading invitation records…"
              : `${invitations.length} shown on this page · ${matchingTotal.toLocaleString()} matching invitation(s)`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-[#C5D0DE]">
            <RefreshCw
              size={17}
              className="animate-spin text-blue-400"
            />
            Loading invitation records…
          </div>
        ) : invitations.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#202D40] text-[#C5D0DE]">
              <Mail size={24} />
            </div>
            <h3 className="mt-4 text-sm font-bold text-white">
              {summary.total === 0 && !hasFilters
                ? "No invitations yet"
                : "No matching invitations"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[#C5D0DE]">
              {summary.total === 0 && !hasFilters
                ? "Invitations will appear here after a workforce profile has been invited."
                : "No invitation records match your current search and filters."}
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear filters
              </button>
            ) : (
              <Link
                href="/hr/employees"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400"
              >
                <Users size={15} />
                Open employee directory
                <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-[#151C28]/80 text-[11px] font-bold uppercase tracking-[0.12em] text-[#C5D0DE] border-b border-[#344357]/80">
                <tr>
                  <th className="px-6 py-3.5">Employee</th>
                  <th className="px-6 py-3.5">Workforce role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created</th>
                  <th className="px-6 py-3.5">Expires</th>
                  <th className="px-6 py-3.5">Invited by</th>
                  <th className="px-6 py-3.5">Employee</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60">
                {invitations.map((invitation) => (
                  <Fragment key={invitation.id}>
                    <tr className="transition hover:bg-[#202D40]/40">
                      <td className="px-6 py-4">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <EmployeeProfilePhoto
                            employeeId={invitation.employee_id}
                            name={employeeName(invitation)}
                            className="size-10 rounded-xl border border-blue-500/20 bg-blue-500/10"
                            textClassName="text-xs font-bold text-blue-400"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {employeeName(invitation)}
                            </p>
                            <p className="mt-0.5 break-all text-xs text-[#C5D0DE]">
                              {invitation.email}
                            </p>
                            {invitation.employee_code && (
                              <p className="mt-1 font-mono text-[11px] text-[#9AA8BA]">
                                {invitation.employee_code}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-xs font-semibold text-[#F8FAFC]">
                          {roleLabel(invitation.workforce_role)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#C5D0DE]">
                          Employment:{" "}
                          {invitation.employment_status || "Unknown"}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                            invitation.display_status,
                          )}`}
                        >
                          {statusLabel(invitation.display_status)}
                        </span>

                        {invitation.accepted_at && (
                          <p className="mt-1.5 text-[10px] text-emerald-400 font-medium">
                            Accepted {formatDateTime(invitation.accepted_at)}
                          </p>
                        )}

                        {invitation.revoked_at && (
                          <p className="mt-1.5 text-[10px] text-rose-400 font-medium">
                            Revoked {formatDateTime(invitation.revoked_at)}
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-xs text-[#E8EEF5]">
                        {formatDateTime(invitation.created_at)}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-xs text-[#E8EEF5]">
                        {formatDateTime(invitation.expires_at)}
                      </td>

                      <td className="max-w-[180px] break-all px-6 py-4 text-xs text-[#C5D0DE]">
                        {invitation.invited_by_email || "Unavailable"}
                      </td>

                      <td className="px-6 py-4">
                        <Link
                          href="/hr/employees"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-blue-400 shadow-xs"
                        >
                          Open directory
                          <ArrowUpRight size={13} />
                        </Link>
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={7} className="px-6 pb-4 pt-1">
                        <InvitationHistory invitation={invitation} />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {invitations.map((invitation) => (
              <article
                key={invitation.id}
                className="rounded-2xl border border-[#344357]/80 bg-[#151C28] p-5 shadow-xl transition-all hover:border-[#3A4A60]"
              >
                <div className="flex items-start gap-3.5">
                  <EmployeeProfilePhoto
                    employeeId={invitation.employee_id}
                    name={employeeName(invitation)}
                    className="size-10 rounded-xl border border-blue-500/20 bg-blue-500/10"
                    textClassName="text-xs font-bold text-blue-400"
                  />

                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold text-white">
                      {employeeName(invitation)}
                    </h3>
                    <p className="mt-0.5 break-all text-xs text-[#C5D0DE]">
                      {invitation.email}
                    </p>
                    {invitation.employee_code && (
                      <p className="mt-1 font-mono text-[11px] text-[#9AA8BA]">
                        {invitation.employee_code}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[#344357]/80 bg-[#192333] p-3.5 shadow-inner">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#C5D0DE]">
                    Assigned workforce role
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#F8FAFC]">
                    {roleLabel(invitation.workforce_role)}
                  </p>
                  <p className="mt-1 text-xs text-[#C5D0DE]">
                    Employment: {invitation.employment_status || "Unknown"}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                      invitation.display_status,
                    )}`}
                  >
                    {statusLabel(invitation.display_status)}
                  </span>
                  <span className="text-xs text-[#C5D0DE]">
                    {formatDateTime(invitation.created_at)}
                  </span>
                </div>

                <dl className="mt-4 space-y-2 border-t border-[#344357]/80 pt-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-[#C5D0DE]">Expires</dt>
                    <dd className="text-right font-medium text-[#F8FAFC]">
                      {formatDateTime(invitation.expires_at)}
                    </dd>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-[#C5D0DE]">Invited by</dt>
                    <dd className="break-all text-right font-medium text-[#F8FAFC]">
                      {invitation.invited_by_email || "Unavailable"}
                    </dd>
                  </div>

                  {invitation.accepted_at && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-[#C5D0DE]">Accepted</dt>
                      <dd className="text-right font-medium text-emerald-400">
                        {formatDateTime(invitation.accepted_at)}
                      </dd>
                    </div>
                  )}

                  {invitation.revoked_at && (
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-[#C5D0DE]">Revoked</dt>
                      <dd className="text-right font-medium text-rose-400">
                        {formatDateTime(invitation.revoked_at)}
                      </dd>
                    </div>
                  )}
                </dl>

                <Link
                  href="/hr/employees"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#344357] bg-[#192333] px-3.5 py-2.5 text-xs font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] hover:text-white shadow-xs"
                >
                  Open employee directory
                  <ArrowUpRight size={14} className="text-blue-400" />
                </Link>

                <InvitationHistory invitation={invitation} />
              </article>
            ))}
          </div>
        )}

        {!loading && invitations.length > 0 && (
          <div className="flex flex-col justify-between gap-3 border-t border-[#344357]/80 bg-[#151C28]/40 px-6 py-4 text-xs text-[#C5D0DE] sm:flex-row sm:items-center">
            <p>
              Showing {invitations.length} record(s) on this page ·{" "}
              <span className="font-semibold text-[#F8FAFC]">
                {matchingTotal.toLocaleString()}
              </span>{" "}
              matching invitations
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
              >
                <ChevronLeft size={14} />
                Previous
              </button>

              <span className="px-2 text-[#C5D0DE] font-medium">
                Page {page} of {Math.max(totalPages, 1)}
              </span>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() =>
                  setPage((current) =>
                    Math.min(Math.max(totalPages, 1), current + 1),
                  )
                }
                className="inline-flex items-center gap-1 rounded-xl border border-[#344357] bg-[#151C28] px-3.5 py-2 font-semibold text-[#E8EEF5] transition hover:bg-[#202D40] hover:border-[#3A4A60] disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>
      </div>
    </HRManagerShell>
  );
}