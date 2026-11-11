"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  FileImage,
  History,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
  useOrganizationAdminAutoRefresh,
} from "../../components/org-admin/OrganizationAdminChrome";

type AdminSession = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type LicenseStatus = "ACTIVE" | "NOT_ACTIVATED" | "EXPIRED" | string;
type PaymentStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

type LicenseDetails = {
  status: LicenseStatus;
  activationSource: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  remainingDays: number;
  canAccess: boolean;
  restrictionReason: string | null;
  databaseTime: string;
};

type PaymentHistoryItem = {
  id: string;
  amount: string;
  currencyCode: string;
  transactionReference: string | null;
  proofImageMimeType: string;
  proofImageFilename: string | null;
  status: PaymentStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type LicenseResponse = {
  status?: string;
  message?: string;
  license?: LicenseDetails;
  payments?: PaymentHistoryItem[];
  paymentHistoryLimit?: number;
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  NOT_ACTIVATED: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  EXPIRED: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  PENDING_REVIEW: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  APPROVED: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  REJECTED: "border-rose-400/25 bg-rose-400/10 text-rose-300",
};

function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatAmount(amount: string, currencyCode: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `${amount} ${currencyCode}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${numericAmount.toFixed(2)} ${currencyCode}`;
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
        STATUS_STYLES[status] || "border-slate-400/25 bg-slate-400/10 text-slate-300"
      }`}
    >
      {humanizeStatus(status)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CreditCard;
  tone?: "blue" | "green" | "amber";
}) {
  const tones = {
    blue: "border-sky-300/15 bg-sky-300/[0.07] text-sky-200",
    green: "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200",
    amber: "border-amber-300/15 bg-amber-300/[0.07] text-amber-200",
  };

  return (
    <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#121b29] p-5 shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">{label}</p>
          <p className="mt-2 break-words text-xl font-bold tracking-tight text-white sm:text-2xl">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
    </section>
  );
}

export default function OrganizationLicensePage() {
  const router = useRouter();
  const [user, setUser] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [license, setLicense] = useState<LicenseDetails | null>(null);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [proofPayment, setProofPayment] = useState<PaymentHistoryItem | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [transactionReference, setTransactionReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);

        if (
          !response.ok ||
          payload?.authenticated !== true ||
          payload?.user?.role !== "ORGANIZATION_ADMIN" ||
          !payload?.user?.organizationId
        ) {
          router.replace("/");
          return;
        }

        if (active) setUser(payload.user as AdminSession);
      } catch {
        if (active) router.replace("/");
      } finally {
        if (active) setSessionLoading(false);
      }
    }

    void verifySession();
    return () => {
      active = false;
    };
  }, [router]);

  const loadLicense = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/backend/org/license", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as LicenseResponse | null;

      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok || !payload?.license) {
        throw new Error(payload?.message || "Unable to load license information.");
      }

      setLicense(payload.license);
      setPayments(Array.isArray(payload.payments) ? payload.payments : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load license information.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void loadLicense();
  }, [user, loadLicense]);

  useOrganizationAdminAutoRefresh(() => loadLicense(true), {
    enabled: Boolean(user),
    shouldRefresh: () => !loading && !refreshing && !submittingPayment && !proofPayment,
  });

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingPayment) return;
    setSubmissionMessage("");
    setError("");

    const normalizedAmount = paymentAmount.trim();
    const normalizedCurrency = paymentCurrency.trim().toUpperCase();
    const normalizedReference = transactionReference.trim();

    if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalizedAmount) || Number(normalizedAmount) <= 0) {
      setError("Enter a valid payment amount greater than zero, with no more than 2 decimal places.");
      return;
    }
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setError("Enter a valid three-letter currency code, for example USD, RWF, or PKR.");
      return;
    }
    if (normalizedReference.length > 120) {
      setError("The transaction reference must be 120 characters or fewer.");
      return;
    }
    if (!proofFile) {
      setError("Choose an image of your payment receipt before submitting.");
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(proofFile.type)) {
      setError("The receipt must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (proofFile.size > 5 * 1024 * 1024) {
      setError("The receipt image must be 5 MB or smaller.");
      return;
    }

    setSubmittingPayment(true);
    try {
      const formData = new FormData();
      formData.append("proofImage", proofFile);
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Payment-Amount": normalizedAmount,
        "X-Payment-Currency": normalizedCurrency,
      };
      if (normalizedReference) headers["X-Transaction-Reference"] = normalizedReference;

      const response = await fetch("/api/backend/org/license/submissions", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(payload?.message || "A payment is already awaiting review. Please wait for the Super Admin to review it before submitting another.");
        }
        if (response.status === 429) {
          throw new Error(payload?.message || "You have reached the payment submission limit. Please try again later.");
        }
        throw new Error(payload?.message || "Payment proof could not be submitted. Please try again.");
      }

      setPaymentAmount("");
      setTransactionReference("");
      setProofFile(null);
      const fileInput = document.getElementById("license-payment-proof") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setSubmissionMessage("Payment proof submitted successfully. Your license will activate only after Super Admin approval.");
      setPaymentFormOpen(false);
      await loadLicense(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment proof could not be submitted. Please try again.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/backend/org/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to log out.");
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to log out.");
      setLoggingOut(false);
    }
  }

  const pendingCount = useMemo(
    () => payments.filter((payment) => payment.status === "PENDING_REVIEW").length,
    [payments],
  );
  const latestPayment = payments[0] || null;
  const licenseIsActive = license?.status === "ACTIVE" && license.canAccess;
  const remainingDays = Math.max(0, Number(license?.remainingDays) || 0);

  function openProof(payment: PaymentHistoryItem) {
    setProofFailed(false);
    setProofPayment(payment);
  }

  if (sessionLoading || (loading && !license)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-slate-300">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121b29] px-5 py-4 text-sm">
          <LoaderCircle className="animate-spin text-sky-300" size={18} />
          Loading organization license…
        </div>
      </div>
    );
  }

  return (
    <div className="org-admin-workspace min-h-screen bg-[#0b0f17] font-sans text-slate-100">
      <OrganizationAdminSidebar activePage="license" />
      <main className="min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="license"
          organizationName={user?.organizationName || "Organization"}
          loggingOut={loggingOut}
          onLogout={() => void logout()}
          commandPaletteOpen={paletteOpen}
          onCommandPaletteOpenChange={setPaletteOpen}
        />

        <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
                Account & subscription
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                License & Payments
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {license && <StatusBadge status={license.status} />}
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-300">
                  <Clock3 size={13} />
                  Payment under review
                </span>
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3.5 text-sm text-rose-200">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>

            </div>
          )}

          {license && (
            <>
              <section className="relative mb-5 overflow-hidden rounded-3xl border border-sky-300/15 bg-gradient-to-br from-[#172b43] via-[#142235] to-[#101722] p-5 shadow-2xl shadow-black/20 sm:p-7">
                <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 size-72 rounded-full border border-sky-200/[0.08]" />
                <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-12 size-48 rounded-full bg-sky-300/[0.07] blur-3xl" />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/15 bg-sky-200/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-sky-200">
                        <ShieldCheck size={13} />
                        Organization license
                      </span>
                      <StatusBadge status={license.status} />
                    </div>
                    <h2 className="mt-4 text-xl font-black tracking-tight text-white sm:text-2xl">
                      {licenseIsActive ? "Your organization is licensed" : "License activation required"}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                      {licenseIsActive
                        ? "Your organization currently has an active subscription and can access its HRMS workspace."
                        : license.restrictionReason || "Submit your payment proof for Super Admin verification to activate your organization's HRMS access."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col rounded-2xl border border-white/10 bg-black/15 p-4 sm:min-w-52">
                    <span className="text-xs font-semibold text-slate-400">Days remaining</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-tight text-white tabular-nums">
                        {licenseIsActive ? remainingDays : "—"}
                      </span>
                      <span className="text-xs text-slate-400">{licenseIsActive ? (remainingDays === 1 ? "day" : "days") : "not active"}</span>
                    </div>
                    {licenseIsActive && remainingDays <= 7 && (
                      <span className="mt-2 text-[11px] font-semibold text-amber-300">
                        Renewal recommended
                      </span>
                    )}
                  </div>
                </div>
              </section>

              <div className="mb-5 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard
                  label="License starts"
                  value={license.startsAt ? formatDate(license.startsAt) : "Not activated"}
                  detail="Beginning of the current license period"
                  icon={CalendarClock}
                  tone="blue"
                />
                <SummaryCard
                  label="License expires"
                  value={license.expiresAt ? formatDate(license.expiresAt) : "Not scheduled"}
                  detail="Current subscription end date"
                  icon={Clock3}
                  tone={licenseIsActive && remainingDays <= 7 ? "amber" : "green"}
                />
                <SummaryCard
                  label="Latest payment"
                  value={latestPayment ? formatAmount(latestPayment.amount, latestPayment.currencyCode) : "No payments"}
                  detail={latestPayment ? `${humanizeStatus(latestPayment.status)} · ${formatDate(latestPayment.createdAt)}` : "No payment proof submitted yet"}
                  icon={CreditCard}
                  tone={latestPayment?.status === "APPROVED" ? "green" : latestPayment?.status === "REJECTED" ? "amber" : "blue"}
                />
              </div>

              {pendingCount > 0 && (
                <section className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4">
                  <Clock3 size={18} className="mt-0.5 shrink-0 text-sky-300" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white">Payment awaiting verification</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      Your payment proof has been received. Your license will only activate after a Super Admin approves the submission. You can follow its status below.
                    </p>
                  </div>
                </section>
              )}

              <section className="mb-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121b29] shadow-xl shadow-black/10">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
                      <CreditCard size={18} />
                    </span>
                    <h2 className="text-sm font-bold text-white">Submit payment proof</h2>
                  </div>
                  {pendingCount === 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentFormOpen((open) => !open)}
                      aria-expanded={paymentFormOpen}
                      aria-controls="organization-payment-proof-form"
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-bold text-sky-200 transition hover:bg-sky-300/15"
                    >
                      {paymentFormOpen ? "Close form" : "Submit payment proof"}
                    </button>
                  )}
                </div>
                {pendingCount > 0 ? (
                  <div className="flex items-start gap-3 p-5 sm:p-6">
                    <Clock3 size={18} className="mt-0.5 shrink-0 text-sky-300" />
                    <div>
                      <p className="text-sm font-semibold text-white">A payment is already under review</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">You can submit another payment after the current submission has been reviewed.</p>
                    </div>
                  </div>
                ) : paymentFormOpen ? (
                  <form id="organization-payment-proof-form" onSubmit={submitPayment} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6" noValidate>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-300">Payment amount *</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        required
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        placeholder="e.g. 50.00"
                        className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b1420] px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/10"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-300">Currency code *</span>
                      <input
                        type="text"
                        required
                        maxLength={3}
                        value={paymentCurrency}
                        onChange={(event) => setPaymentCurrency(event.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase())}
                        placeholder="USD"
                        autoCapitalize="characters"
                        className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b1420] px-3 text-sm uppercase text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/10"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500">Use a three-letter code such as USD, RWF, or PKR.</span>
                    </label>
                    <label className="block min-w-0 sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-300">Transaction reference <span className="font-normal text-slate-500">(optional)</span></span>
                      <input
                        type="text"
                        maxLength={120}
                        value={transactionReference}
                        onChange={(event) => setTransactionReference(event.target.value)}
                        placeholder="Enter your bank or mobile money transaction ID"
                        className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b1420] px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/10"
                      />
                    </label>
                    <label className="block min-w-0 sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-300">Payment receipt image *</span>
                      <input
                        id="license-payment-proof"
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                        onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                        className="block min-h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-[#0b1420] text-xs text-slate-300 file:mr-3 file:min-h-11 file:border-0 file:bg-white/[0.06] file:px-4 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-white/[0.1]"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500">JPEG, PNG, or WebP · Maximum file size 5 MB.</span>
                      {proofFile && <span className="mt-1 block break-all text-[11px] text-sky-300">Selected: {proofFile.name} ({(proofFile.size / (1024 * 1024)).toFixed(2)} MB)</span>}
                    </label>
                    {submissionMessage && (
                      <p role="status" className="sm:col-span-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-xs leading-5 text-emerald-200">{submissionMessage}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                      <p className="max-w-xl text-[11px] leading-5 text-slate-500">Submitting proof does not activate your license. Access is activated only after the Platform Super Admin approves the payment.</p>
                      <button
                        type="submit"
                        disabled={submittingPayment}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-300/25 bg-sky-300/10 px-5 text-xs font-bold text-sky-200 transition hover:bg-sky-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingPayment ? <LoaderCircle size={15} className="animate-spin" /> : <CreditCard size={15} />}
                        {submittingPayment ? "Submitting…" : "Submit payment proof"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>

              <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121b29] shadow-xl shadow-black/10">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
                      <History size={18} />
                    </span>
                    <div>
                      <h2 className="text-sm font-bold text-white">Payment history</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Showing the latest {payments.length} of up to 50 submissions
                      </p>
                    </div>
                  </div>

                </div>

                {payments.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-12 text-center">
                    <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
                      <FileImage size={21} />
                    </span>
                    <h3 className="mt-4 text-sm font-bold text-white">No payment submissions yet</h3>
                    <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">
                      When your organization submits payment proof, its verification status and receipt will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {payments.map((payment) => (
                      <article key={payment.id} className="grid min-w-0 gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {formatAmount(payment.amount, payment.currencyCode)}
                            </span>
                            <StatusBadge status={payment.status} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>Submitted {formatDate(payment.createdAt)}</span>
                            {payment.transactionReference && (
                              <span className="break-all">Reference: {payment.transactionReference}</span>
                            )}
                            {payment.reviewedAt && <span>Reviewed {formatDate(payment.reviewedAt)}</span>}
                          </div>
                          {payment.status === "REJECTED" && payment.rejectionReason && (
                            <div className="mt-3 rounded-lg border border-rose-300/15 bg-rose-300/[0.06] p-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-300">Rejection reason</p>
                              <p className="mt-1 break-words text-xs leading-5 text-slate-300">{payment.rejectionReason}</p>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openProof(payment)}
                          className="license-view-receipt-button inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-300 transition hover:border-sky-300/25 hover:bg-sky-300/[0.06] hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121b29] lg:self-center"
                        >
                          <FileImage size={14} />
                          View receipt
                          <ExternalLink size={12} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <p className="mt-4 text-[11px] leading-5 text-slate-500">
                Payment verification is performed by the Platform Super Admin. Uploading a receipt does not activate a license. License activation begins only after payment approval.
              </p>
            </>
          )}
        </div>
      </main>

      {proofPayment && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProofPayment(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-proof-title"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#34485e] bg-[#101925] text-white shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 id="payment-proof-title" className="text-sm font-bold">Payment receipt</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {formatAmount(proofPayment.amount, proofPayment.currencyCode)} · {humanizeStatus(proofPayment.status)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProofPayment(null)}
                aria-label="Close receipt preview"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/[0.06]"
              >
                <X size={17} />
              </button>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/20 p-3 sm:p-5">
              {proofFailed ? (
                <div role="alert" className="max-w-sm text-center">
                  <AlertCircle size={25} className="mx-auto text-rose-300" />
                  <p className="mt-3 text-sm font-semibold text-white">Receipt unavailable</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    The receipt could not be loaded. Refresh the page and try again.
                  </p>
                </div>
              ) : (
                <img
                  src={`/api/backend/payment-submissions/${encodeURIComponent(proofPayment.id)}/proof`}
                  alt="Submitted payment receipt"
                  className="max-h-[70vh] max-w-full rounded-lg object-contain"
                  onError={() => setProofFailed(true)}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
