"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Eye,
  FileImage,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  buildSuperAdminCommandItems,
  CommandPalette,
  CommandPaletteTrigger,
  type CommandPaletteItem,
  type CommandPaletteOrganization,
} from "../../components/super-admin/CommandPalette";
import SuperAdminThemeToggle from "../../components/super-admin/SuperAdminThemeToggle";
import WorkspaceClock from "../../components/WorkspaceClock";

type AdminUser = { email: string; role: string };
type PaymentStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
type LicenseStatus = "NOT_ACTIVATED" | "ACTIVE" | "EXPIRED" | null;
type PaymentRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  amount: string;
  currency: string;
  transactionReference: string | null;
  status: PaymentStatus;
  rejectionReason: string | null;
  proofMimeType: string;
  proofFilename: string | null;
  proofSizeBytes: number;
  submittedAt: string;
  submittedByEmail: string;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  licenseStatus: LicenseStatus;
  licenseActivationSource: string | null;
  licenseStartsAt: string | null;
  licenseExpiresAt: string | null;
};
type PaymentSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  organizationsWithPending: number;
};
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type PaymentPayload = {
  status: "ok";
  payments: PaymentRow[];
  summary: PaymentSummary;
  pagination: Pagination;
  filters: { status: string; search: string; sort: string };
};
type ReviewDecision = "APPROVE" | "REJECT";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
  { label: "Organization Admins", href: "/dashboard/organization-admins", icon: Users },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { label: "Invitations", href: "/dashboard/invitations", icon: Mail },
  { label: "Platform Support", href: "/dashboard/support", icon: MessageSquare },
  { label: "System Health", href: "/dashboard/system-health", icon: Activity },
  { label: "Audit Logs", href: "/dashboard/audit-logs", icon: ShieldCheck },
];

const shellBackground = {
  backgroundImage:
    "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)",
  backgroundSize: "auto, 42px 42px, 42px 42px",
};

const EMPTY_SUMMARY: PaymentSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  organizationsWithPending: 0,
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function formatStatus(value: string | null) {
  if (!value) return "Unknown";
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function paymentStatusClasses(status: PaymentStatus) {
  if (status === "APPROVED") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (status === "REJECTED") return "border-rose-400/20 bg-rose-500/10 text-rose-300";
  return "border-amber-400/20 bg-amber-500/10 text-amber-300";
}

function licenseStatusClasses(status: LicenseStatus) {
  if (status === "ACTIVE") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (status === "EXPIRED") return "border-rose-400/20 bg-rose-500/10 text-rose-300";
  return "border-slate-400/20 bg-slate-500/10 text-slate-300";
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: "blue" | "amber" | "green" | "rose";
}) {
  const tones = {
    blue: "border-sky-400/20 bg-sky-500/10 text-sky-300",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-300",
    green: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
    rose: "border-rose-400/20 bg-rose-500/10 text-rose-300",
  };
  return (
    <section className="rounded-2xl border border-[#29384b] bg-[#111a28]/90 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white tabular-nums">{value.toLocaleString()}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tones[tone]}`}>
          <Icon size={19} />
        </span>
      </div>
    </section>
  );
}

export default function PlatformPaymentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteOrganizations, setPaletteOrganizations] = useState<CommandPaletteOrganization[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [payload, setPayload] = useState<PaymentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [sort, setSort] = useState("NEWEST");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [proofLoadError, setProofLoadError] = useState(false);
  const [proofRetry, setProofRetry] = useState(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const lastSuccessfulRefreshRef = useRef(0);
  const hasPayloadRef = useRef(false);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function verifySession() {
      try {
        const response = await fetch("/api/backend/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.authenticated !== true || result?.user?.role !== "SUPER_ADMIN") {
          router.replace("/");
          return;
        }
        if (active) setUser(result.user as AdminUser);
      } catch {
        if (active) setSessionError("Unable to verify your Super Admin session.");
      } finally {
        if (active) setChecking(false);
      }
    }
    void verifySession();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadPaletteOrganizations() {
      try {
        const response = await fetch("/api/backend/organizations", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json().catch(() => null);
        const candidates = Array.isArray(result) ? result : result?.organizations;
        if (!Array.isArray(candidates)) return;
        const valid = candidates.filter((item: unknown): item is CommandPaletteOrganization =>
          typeof item === "object" && item !== null &&
          typeof (item as CommandPaletteOrganization).id === "string" &&
          typeof (item as CommandPaletteOrganization).name === "string" &&
          typeof (item as CommandPaletteOrganization).slug === "string" &&
          typeof (item as CommandPaletteOrganization).status === "string"
        );
        if (active) setPaletteOrganizations(valid);
      } catch {
        // Organization suggestions are optional; static commands remain available.
      }
    }
    void loadPaletteOrganizations();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    hasPayloadRef.current = payload !== null;
  }, [payload]);

  const loadPayments = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestSequence = ++requestSequenceRef.current;
    const hasExistingData = hasPayloadRef.current;

    if (hasExistingData) {
      setRefreshing(true);
      setRefreshError("");
    } else {
      setLoading(true);
      setLoadError("");
    }

    const params = new URLSearchParams({
      page: String(page),
      pageSize: "25",
      status,
      sort,
      search,
    });

    try {
      const response = await fetch(`/api/backend/platform-payments?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== "ok") {
        throw new Error(typeof result?.message === "string" ? result.message : "Unable to load payment submissions.");
      }
      if (requestSequence !== requestSequenceRef.current) return;
      setPayload(result as PaymentPayload);
      hasPayloadRef.current = true;
      lastSuccessfulRefreshRef.current = Date.now();
      setLoadError("");
      setRefreshError("");
    } catch (caught) {
      if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to load payment submissions.";
      if (hasPayloadRef.current) {
        setRefreshError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [page, search, sort, status]);

  useEffect(() => {
    if (user) void loadPayments();
    return () => {
      requestControllerRef.current?.abort();
    };
  }, [loadPayments, refreshKey, user]);

  useEffect(() => {
    if (!user) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      const lastRefresh = lastSuccessfulRefreshRef.current;
      if (lastRefresh > 0 && Date.now() - lastRefresh >= 60_000) {
        void loadPayments();
      }
    };
    const intervalId = window.setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [loadPayments, user]);

  useEffect(() => {
    if (!selectedPayment) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = [
      "a[href]", "button:not([disabled])", "input:not([disabled])",
      "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusFirst = () => {
      const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? dialogRef.current)?.focus();
    };
    focusFirst();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!reviewing) {
          event.preventDefault();
          setSelectedPayment(null);
          setReviewDecision(null);
          setReviewError("");
        }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [selectedPayment?.id, reviewing]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/auth/logout", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setLogoutError(caught instanceof Error ? caught.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function openPayment(payment: PaymentRow) {
    setProofLoadError(false);
    setProofRetry(0);
    setSelectedPayment(payment);
    setReviewDecision(null);
    setRejectionReason("");
    setReviewError("");
  }

  function closePaymentDialog() {
    if (reviewing) return;
    setSelectedPayment(null);
    setReviewDecision(null);
    setReviewError("");
  }

  async function submitReview() {
    if (!selectedPayment || !reviewDecision || reviewing) return;
    if (reviewDecision === "REJECT" && !rejectionReason.trim()) {
      setReviewError("Enter a rejection reason before rejecting this payment.");
      return;
    }
    setReviewing(true);
    setReviewError("");
    try {
      const response = await fetch(`/api/backend/platform-payments/${encodeURIComponent(selectedPayment.id)}/review`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reviewDecision === "APPROVE"
            ? { decision: "APPROVE" }
            : { decision: "REJECT", rejectionReason: rejectionReason.trim() },
        ),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== "ok") {
        throw new Error(typeof result?.message === "string" ? result.message : "The payment review could not be completed.");
      }
      const completedDecision = reviewDecision;
      setSelectedPayment(null);
      setReviewDecision(null);
      setRejectionReason("");
      setNotice(completedDecision === "APPROVE"
        ? "Payment approved. The organization license has been activated or extended for 30 days."
        : "Payment rejected. The organization administrator can review the rejection reason.");
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "The payment review could not be completed.");
    } finally {
      setReviewing(false);
    }
  }

  const commandItems = useMemo(
    () => buildSuperAdminCommandItems(paletteOrganizations),
    [paletteOrganizations],
  );

  const payments = payload?.payments ?? [];
  const summary = payload?.summary ?? EMPTY_SUMMARY;
  const pagination = payload?.pagination ?? { page, pageSize: 25, total: 0, totalPages: 1 };

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-5 text-sm text-slate-300">Verifying your Super Admin session…</main>;
  }
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-5 text-slate-200">
        <section className="max-w-md rounded-2xl border border-slate-800 bg-[#131a24] p-6">
          <h1 className="text-lg font-semibold">Payments workspace unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{sessionError || "Your Super Admin session could not be verified."}</p>
          <button type="button" onClick={() => router.replace("/")} className="mt-4 rounded-xl bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950">Return to sign in</button>
        </section>
      </main>
    );
  }

  return (
    <div className="sa-payments-page min-h-screen bg-[#0b0f17] text-[#f8fafc] scheme-dark" style={shellBackground}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#29384b] bg-[#0f1724] text-white lg:flex">
        <Link href="/dashboard" className="flex h-[86px] items-center gap-3 border-b border-[#29384b] px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-[#d8efff]"><ShieldCheck size={23} /></span>
          <span><span className="block text-lg font-bold tracking-tight">HRMS Platform</span><span className="mt-0.5 block text-sm text-slate-300">Super Admin</span></span>
        </Link>
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4" aria-label="Super Admin navigation">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = href === "/dashboard/payments";
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex h-[49px] items-center gap-3 rounded-lg px-3.5 text-[15px] transition ${active ? "border border-blue-300/10 border-l-2 border-l-[#75c7ff] bg-[#14283e] pl-[calc(0.875rem-2px)] font-semibold text-[#e3f2ff]" : "border border-transparent font-medium text-slate-300 hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-white"}`}><Icon size={21} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="border-t border-[#29384b] p-4"><div className="rounded-xl border border-[#29384b] bg-[#111a28]/70 p-4"><p className="text-xs font-semibold text-slate-300">Platform Console</p><p className="mt-1 text-xs leading-5 text-slate-400">Review payments, verify receipts and manage subscription activation.</p></div></div>
      </aside>

      <main className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-20 border-b border-[#29384b] bg-[#0f1724]/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-h-[43px] items-center justify-between gap-4">
            <div className="relative hidden h-[43px] w-full max-w-[482px] sm:block">
              <button type="button" onClick={() => setCommandPaletteOpen(true)} aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" className="absolute inset-0 flex h-[43px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#111a28] py-2.5 pl-12 pr-4 text-left text-sm text-slate-300 outline-none transition hover:border-[#75c7ff]/35 hover:bg-[#182232] focus-visible:border-[#75c7ff] focus-visible:ring-2 focus-visible:ring-[#75c7ff]/20"><span className="truncate">Search commands or organizations…</span></button>
              <span className="pointer-events-none absolute left-4 top-[11px] text-slate-300"><Search size={20} /></span><CommandPaletteTrigger onClick={() => setCommandPaletteOpen(true)} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
              <WorkspaceClock />
              <div className="hidden h-9 w-px bg-slate-700/70 sm:block" />
              <SuperAdminThemeToggle />
              <div className="flex items-center gap-3" aria-label="Signed in as Super Admin"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-gradient-to-br from-[#1c3854] to-[#142033] text-sm font-bold text-[#d8efff]">SA</div><div className="hidden min-w-0 sm:block"><p className="text-sm font-semibold leading-5">Super Admin</p><p className="max-w-[190px] truncate text-xs leading-5 text-slate-400">{user.email || "Platform Administrator"}</p></div></div>
              <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#182232]/90 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05] disabled:opacity-60 sm:text-sm"><LogOut size={14} />{loggingOut ? "Logging out…" : "Logout"}</button>
            </div>
          </div>
          <div className="relative mt-3 sm:hidden"><button type="button" onClick={() => setCommandPaletteOpen(true)} aria-label="Search commands and organizations" aria-keyshortcuts="Control+K Meta+K" className="flex h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-[#111a28] px-3.5 text-left text-sm text-slate-300 transition hover:border-[#75c7ff]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"><Search size={18} /><span className="min-w-0 flex-1 truncate">Search commands or organizations…</span></button></div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Super Admin mobile navigation">{navItems.map(({ label, href, icon: Icon }) => <Link key={href} href={href} aria-current={href === "/dashboard/payments" ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${href === "/dashboard/payments" ? "border-[#75c7ff]/25 bg-[#18314a] font-semibold text-[#e3f2ff]" : "border-white/10 bg-[#182232]/90 text-slate-200 hover:border-white/20 hover:bg-white/[0.05]"}`}><Icon size={16} /><span>{label}</span></Link>)}</nav>
        </header>

        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <section className="mb-6 flex flex-col gap-4 border-b border-[#29384b] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#75c7ff]">Platform Control <span className="px-1.5 text-slate-600">/</span> Super Admin</p>
              <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-[-0.04em] text-[#f8fafc] sm:text-[36px]">Payments & Licenses</h1>
            </div>
          </section>

          {notice && <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><span className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" />{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification" className="rounded-md p-1 hover:bg-white/10"><X size={16} /></button></div>}
          {logoutError && <p role="alert" className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{logoutError}</p>}

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="All submissions" value={summary.total} detail="Recorded payment proofs" icon={CreditCard} tone="blue" />
            <StatCard label="Awaiting review" value={summary.pending} detail={`${summary.organizationsWithPending} organizations waiting`} icon={Clock3} tone="amber" />
            <StatCard label="Approved" value={summary.approved} detail="Verified payment submissions" icon={BadgeCheck} tone="green" />
            <StatCard label="Rejected" value={summary.rejected} detail="Submissions requiring correction" icon={XCircle} tone="rose" />
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-[#29384b] bg-[#111a28]/90 shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
            <div className="flex flex-col gap-4 border-b border-[#29384b] p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
              <div><h2 className="text-lg font-semibold text-white">Payment submissions</h2><p className="mt-1 text-xs text-slate-400">Review receipts and inspect the license state associated with each organization.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="payment-status-filter">Filter payment status</label>
                <select id="payment-status-filter" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="h-10 rounded-lg border border-[#34485e] bg-[#111a28] px-3 text-xs font-semibold text-slate-200 outline-none focus:border-[#75c7ff]">
                  <option value="PENDING_REVIEW">Pending review</option><option value="ALL">All submissions</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
                </select>
                <label className="sr-only" htmlFor="payment-sort">Sort payments</label>
                <select id="payment-sort" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }} className="h-10 rounded-lg border border-[#34485e] bg-[#111a28] px-3 text-xs font-semibold text-slate-200 outline-none focus:border-[#75c7ff]">
                  <option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option><option value="AMOUNT_HIGH">Amount: high to low</option><option value="AMOUNT_LOW">Amount: low to high</option>
                </select>
              </div>
            </div>

            <form onSubmit={applySearch} className="flex flex-col gap-2 border-b border-[#29384b] bg-[#0f1724]/55 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="relative min-w-0 flex-1"><Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" /><label htmlFor="payment-search" className="sr-only">Search payments</label><input id="payment-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search organization, reference, submitter or payment ID…" className="h-11 w-full rounded-lg border border-[#34485e] bg-[#111a28] pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/15" /></div>
              <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#75c7ff] px-5 text-sm font-semibold text-[#07111d] transition hover:bg-[#9bd8ff]"><Search size={15} />Search</button>
              {search && <button type="button" onClick={() => { setSearchDraft(""); setSearch(""); setPage(1); }} className="h-11 rounded-lg border border-[#34485e] px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05]">Clear</button>}
            </form>

            {refreshing && <div className="flex items-center justify-end gap-2 px-5 pt-3 text-[11px] text-slate-400" role="status"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />Updating payment records</div>}
            {refreshError && <div role="status" className="mx-4 mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Latest refresh failed: {refreshError}. Previously loaded records are still displayed.</div>}
            {loadError && <div role="alert" className="m-4 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">Could not load payment submissions</p><p className="mt-1 text-rose-100/80">{loadError}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="mt-3 rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/10">Try again</button></div></div>}

            <div className="grid gap-3 p-3 sm:p-4 lg:hidden">
              {!loading && !loadError && payments.map((payment) => (
                <article key={`mobile-${payment.id}`} className="sa-payment-mobile-card rounded-xl border border-[#29384b] bg-[#111a28] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#293c52] bg-[#18283b] text-[#8bcaff]"><Building2 size={18} /></span>
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{payment.organizationName}</p><p className="truncate text-xs text-slate-500">{payment.organizationSlug}</p></div>
                    </div>
                    <span className={`shrink-0 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paymentStatusClasses(payment.status)}`}>{formatStatus(payment.status)}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Amount</p><p className="mt-1 text-sm font-semibold tabular-nums text-slate-100">{formatMoney(payment.amount, payment.currency)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">License</p><span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${licenseStatusClasses(payment.licenseStatus)}`}>{formatStatus(payment.licenseStatus)}</span></div>
                    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Submitted</p><p className="mt-1 text-xs text-slate-200">{formatDate(payment.submittedAt)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Submitted by</p><p className="mt-1 truncate text-xs text-slate-200">{payment.submittedByEmail}</p></div>
                  </div>
                  <button type="button" onClick={() => openPayment(payment)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#34485e] bg-[#182232] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#75c7ff]/40 hover:text-white"><Eye size={14} />{payment.status === "PENDING_REVIEW" ? "Review payment" : "View details"}</button>
                </article>
              ))}
              {loading && !payload && Array.from({ length: 3 }, (_, index) => <div key={`mobile-loading-${index}`} className="h-36 animate-pulse rounded-xl bg-white/[0.06]" />)}
              {!loading && !loadError && payments.length === 0 && <div className="rounded-xl border border-[#29384b] p-8 text-center"><FileImage className="mx-auto text-slate-400" size={22}/><p className="mt-3 text-sm font-semibold text-slate-200">No payment submissions found</p><p className="mt-1 text-xs text-slate-500">Try another status filter or search term.</p></div>}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead><tr className="border-b border-[#29384b] bg-[#0f1724]/90 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400"><th className="px-5 py-3">Organization</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Payment status</th><th className="px-5 py-3">License</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
                <tbody className="divide-y divide-[#29384b]">
                  {loading && !payload && Array.from({ length: 5 }, (_, index) => <tr key={`loading-${index}`}><td colSpan={6} className="px-5 py-4"><div className="h-5 animate-pulse rounded bg-white/[0.06]" /></td></tr>)}
                  {!loading && !loadError && payments.map((payment) => (
                    <tr key={payment.id} className="transition-colors hover:bg-white/[0.025]">
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#293c52] bg-[#18283b] text-[#8bcaff]"><Building2 size={17} /></span><div className="min-w-0"><p className="max-w-[250px] truncate text-sm font-semibold text-slate-100">{payment.organizationName}</p><p className="mt-0.5 text-xs text-slate-500">{payment.organizationSlug}</p><p className="mt-1 text-[10px] text-slate-500">Admin: {payment.submittedByEmail}</p></div></div></td>
                      <td className="px-5 py-4"><p className="text-sm font-semibold tabular-nums text-slate-100">{formatMoney(payment.amount, payment.currency)}</p><p className="mt-1 max-w-[190px] truncate text-xs text-slate-500">{payment.transactionReference || "No transaction reference"}</p></td>
                      <td className="px-5 py-4"><p className="text-xs font-medium text-slate-200">{formatDate(payment.submittedAt)}</p><p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500"><FileImage size={12} />{payment.proofFilename || "Payment proof attached"}</p></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paymentStatusClasses(payment.status)}`}>{formatStatus(payment.status)}</span></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${licenseStatusClasses(payment.licenseStatus)}`}>{formatStatus(payment.licenseStatus)}</span>{payment.licenseExpiresAt && <p className="mt-1 text-[10px] text-slate-500">Expires {formatDate(payment.licenseExpiresAt)}</p>}</td>
                      <td className="px-5 py-4 text-right"><button type="button" onClick={() => openPayment(payment)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#34485e] bg-[#182232] px-3 text-xs font-semibold text-slate-200 transition hover:border-[#75c7ff]/40 hover:text-white"><Eye size={14} />{payment.status === "PENDING_REVIEW" ? "Review" : "View details"}</button></td>
                    </tr>
                  ))}
                  {!loading && !loadError && payments.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#34485e] bg-[#182232] text-slate-400"><FileImage size={20} /></span><p className="mt-3 text-sm font-semibold text-slate-200">No payment submissions found</p><p className="mt-1 text-xs text-slate-500">Try another status filter or search term.</p></td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#29384b] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-slate-400">{pagination.total === 0 ? "No records" : `Showing ${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total.toLocaleString()} submissions`}</p>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#34485e] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-40"><ChevronLeft size={14} />Previous</button><span className="min-w-[92px] text-center text-xs tabular-nums text-slate-400">Page {pagination.page} of {pagination.totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={loading || page >= pagination.totalPages} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#34485e] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-40">Next<ChevronRight size={14} /></button></div>
            </div>
          </section>

        </div>
      </main>

      {selectedPayment && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-6 backdrop-blur-sm sm:items-center sm:px-5" onMouseDown={(event) => { if (event.target === event.currentTarget) closePaymentDialog(); }}>
          <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="payment-detail-title" className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-[#34485e] bg-[#111a28] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#29384b] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#75c7ff]">Payment submission</p><h2 id="payment-detail-title" className="mt-1 text-xl font-bold text-white">{selectedPayment.organizationName}</h2><p className="mt-1 text-xs text-slate-400">{selectedPayment.organizationSlug} · {selectedPayment.id}</p></div><button type="button" onClick={closePaymentDialog} disabled={reviewing} aria-label="Close payment details" className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-40"><X size={17} /></button></div>
            <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] sm:p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Amount paid</p><p className="mt-1 text-lg font-bold tabular-nums text-white">{formatMoney(selectedPayment.amount, selectedPayment.currency)}</p></div><div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Payment status</p><span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paymentStatusClasses(selectedPayment.status)}`}>{formatStatus(selectedPayment.status)}</span></div></div>
                <dl className="space-y-3 rounded-xl border border-[#29384b] bg-[#0f1724] p-4 text-sm"><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">Transaction reference</dt><dd className="break-all text-xs font-medium text-slate-200 sm:text-right">{selectedPayment.transactionReference || "Not provided"}</dd></div><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">Submitted by</dt><dd className="break-all text-xs font-medium text-slate-200 sm:text-right">{selectedPayment.submittedByEmail}</dd></div><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">Submitted at</dt><dd className="text-xs font-medium text-slate-200 sm:text-right">{formatDate(selectedPayment.submittedAt)}</dd></div><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">Organization status</dt><dd className="text-xs font-medium text-slate-200 sm:text-right">{formatStatus(selectedPayment.organizationStatus)}</dd></div><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">License status</dt><dd className="text-xs font-medium text-slate-200 sm:text-right">{formatStatus(selectedPayment.licenseStatus)}</dd></div><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">License expires</dt><dd className="text-xs font-medium text-slate-200 sm:text-right">{formatDate(selectedPayment.licenseExpiresAt)}</dd></div>{selectedPayment.reviewedAt && <><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">Reviewed by</dt><dd className="text-xs font-medium text-slate-200 sm:text-right">{selectedPayment.reviewedByEmail || "Super Admin"}</dd></div><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><dt className="text-xs text-slate-500">Reviewed at</dt><dd className="text-xs font-medium text-slate-200 sm:text-right">{formatDate(selectedPayment.reviewedAt)}</dd></div></>}</dl>
                {selectedPayment.rejectionReason && <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3"><p className="text-xs font-semibold text-rose-300">Rejection reason</p><p className="mt-1 whitespace-pre-wrap text-sm text-rose-100">{selectedPayment.rejectionReason}</p></div>}
                {selectedPayment.status === "PENDING_REVIEW" && !reviewDecision && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setReviewDecision("APPROVE"); setReviewError(""); }} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400"><CheckCircle2 size={16} />Approve payment</button><button type="button" onClick={() => { setReviewDecision("REJECT"); setReviewError(""); }} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"><XCircle size={16} />Reject payment</button></div>}
                {reviewDecision && <div className={`rounded-xl border p-4 ${reviewDecision === "APPROVE" ? "border-emerald-400/25 bg-emerald-500/[0.07]" : "border-rose-400/25 bg-rose-500/[0.07]"}`}>
                  <div className="flex items-start gap-2">{reviewDecision === "APPROVE" ? <CheckCircle2 size={18} className="mt-0.5 text-emerald-300" /> : <AlertCircle size={18} className="mt-0.5 text-rose-300" />}<div><p className="text-sm font-semibold text-white">{reviewDecision === "APPROVE" ? "Confirm payment approval" : "Confirm payment rejection"}</p><p className="mt-1 text-xs leading-5 text-slate-300">{reviewDecision === "APPROVE" ? "This verifies the receipt and activates or extends the organization license by 30 days. This action cannot be reversed." : "The organization administrator will see this reason and can submit a corrected payment proof."}</p></div></div>
                  {reviewDecision === "REJECT" && <div className="mt-3"><label htmlFor="payment-rejection-reason" className="mb-1.5 block text-xs font-semibold text-slate-300">Rejection reason <span className="text-rose-300">*</span></label><textarea id="payment-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={3} placeholder="Explain what needs to be corrected…" className="w-full resize-y rounded-lg border border-[#34485e] bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#75c7ff]" /><p className="mt-1 text-right text-[10px] text-slate-500">{rejectionReason.length}/1000</p></div>}
                  {reviewError && <p role="alert" className="mt-3 text-xs font-medium text-rose-300">{reviewError}</p>}
                  <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setReviewDecision(null); setReviewError(""); }} disabled={reviewing} className="h-9 rounded-lg border border-[#34485e] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-50">Cancel</button><button type="button" onClick={() => void submitReview()} disabled={reviewing || (reviewDecision === "REJECT" && !rejectionReason.trim())} className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition disabled:opacity-50 ${reviewDecision === "APPROVE" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"}`}>{reviewing ? "Processing…" : reviewDecision === "APPROVE" ? "Confirm approval" : "Confirm rejection"}</button></div>
                </div>}
              </div>
              <div className="min-w-0"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-300">Payment proof</p><span className="text-[10px] text-slate-500">Private receipt</span></div><div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border border-[#34485e] bg-[#0b1220] p-2 sm:min-h-[360px]">{proofLoadError ? <div className="px-4 py-8 text-center"><FileImage size={28} className="mx-auto text-slate-500"/><p className="mt-3 text-sm font-semibold text-slate-200">Receipt unavailable</p><p className="mt-1 text-xs text-slate-400">The private receipt could not be loaded.</p><button type="button" onClick={() => { setProofLoadError(false); setProofRetry((value) => value + 1); }} className="mt-3 rounded-lg border border-[#34485e] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]">Retry receipt</button></div> : <img key={`${selectedPayment.id}-${proofRetry}`} src={`/api/backend/payment-submissions/${encodeURIComponent(selectedPayment.id)}/proof`} alt={`Payment proof submitted by ${selectedPayment.submittedByEmail}`} onError={() => setProofLoadError(true)} className="max-h-[520px] w-full object-contain" loading="lazy" />}</div><p className="mt-2 break-all text-[10px] text-slate-500">{selectedPayment.proofFilename || "Uploaded payment receipt"} · {(selectedPayment.proofSizeBytes / 1024).toFixed(1)} KB</p></div>
            </div>
          </section>
        </div>
      )}

      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} items={commandItems} onSelect={(item: CommandPaletteItem) => { if (item.href) router.push(item.href); }} />
    </div>
  );
}
