"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, CreditCard, RefreshCw, ShieldAlert } from "lucide-react";

type LicensePayload = {
  status?: string;
  license?: {
    status?: "ACTIVE" | "NOT_ACTIVATED" | "EXPIRED" | string;
    canAccess?: boolean;
    restrictionReason?: string | null;
  };
  setupCompleted?: boolean;
  role?: string | null;
};

type GateState = "checking" | "allowed" | "restricted" | "error";

export default function OrganizationLicenseGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("checking");
  const [licenseStatus, setLicenseStatus] = useState("NOT_ACTIVATED");
  const [isOrganizationAdmin, setIsOrganizationAdmin] = useState(false);

  const isLicensePaymentPage =
    pathname === "/org/license" || pathname.startsWith("/org/license/");

  const checkLicense = useCallback(async () => {
    setState("checking");
    try {
      const response = await fetch("/api/backend/license-access", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        // Let the existing role-specific session guard handle authentication.
        setState("allowed");
        return;
      }
      if (!response.ok) throw new Error("License access could not be verified");

      const payload = await response.json() as LicensePayload;
      if (payload.status !== "ok" || !payload.license) {
        throw new Error("License access response was incomplete");
      }

      const admin = payload.role === "ORGANIZATION_ADMIN";
      const completed = payload.setupCompleted !== false;
      setIsOrganizationAdmin(admin);
      setLicenseStatus(payload.license.status ?? "NOT_ACTIVATED");

      // Preserve the mandatory first-time setup flow. License & Payments is
      // always reachable by Organization Admin so an inactive tenant can pay.
      if ((admin && !completed) || (admin && isLicensePaymentPage)) {
        setState("allowed");
      } else if (payload.license.canAccess === true) {
        setState("allowed");
      } else {
        setState("restricted");
      }
    } catch {
      setState("error");
    }
  }, [isLicensePaymentPage, pathname]);

  useEffect(() => {
    void checkLicense();
  }, [checkLicense]);

  useEffect(() => {
    if (state === "checking") return;
    // Keep restricted sessions in place and automatically restore access as
    // soon as Super Admin activates or renews the tenant license.
    const timer = window.setInterval(() => void checkLicense(), 30_000);
    const onFocus = () => void checkLicense();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkLicense, state]);

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080b12] text-slate-200">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#121b29] px-5 py-4 text-sm">
          <RefreshCw size={18} className="animate-spin text-sky-400" />
          Verifying organization license…
        </div>
      </div>
    );
  }

  if (state === "allowed") return <>{children}</>;

  const expired = licenseStatus === "EXPIRED";
  const title = state === "error"
    ? "Unable to verify organization license"
    : expired
      ? "Organization license expired"
      : "Organization license not activated";
  const description = state === "error"
    ? "We can’t confirm that this organization has an active license. Workspace access remains locked until the license status can be verified."
    : expired
      ? "This organization’s license has expired. Workspace access is unavailable until the license is renewed and activated."
      : "This organization does not have an active license yet. Workspace access is unavailable until the license is activated.";

  return (
    <div className="relative min-h-screen">
      <div aria-hidden="true" inert className="pointer-events-none select-none blur-[3px] opacity-55">
        {children}
      </div>

      <div
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/65 px-4 py-8 backdrop-blur-md"
        role="presentation"
      >
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="organization-license-title"
          aria-describedby="organization-license-description"
          className="w-full max-w-lg rounded-3xl border border-amber-400/25 bg-[#111a28] p-7 text-slate-100 shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:p-9"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            {state === "error" ? <AlertTriangle size={27} /> : <ShieldAlert size={27} />}
          </div>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
            Organization access restricted
          </p>
          <h1 id="organization-license-title" className="mt-2 text-2xl font-bold tracking-tight text-white">
            {title}
          </h1>
          <p id="organization-license-description" className="mt-3 text-sm leading-7 text-slate-300">
            {description}
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-sm font-semibold text-slate-100">What happens next?</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-400">
              {isOrganizationAdmin
                ? "Open License & Payments to review the subscription and submit or resubmit payment proof. Access will return after the platform approves the payment."
                : "Please contact your Organization Admin. They can review the license and complete the renewal process with the platform administrator."}
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {isOrganizationAdmin && (
              <Link
                href="/org/license"
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-300"
              >
                <CreditCard size={17} />
                Open License &amp; Payments
              </Link>
            )}
            <button
              type="button"
              onClick={() => void checkLicense()}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
            >
              <RefreshCw size={16} />
              {state === "error" ? "Retry verification" : "Check license again"}
            </button>
          </div>
          <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">
            This notice cannot be dismissed. Workspace controls remain disabled until an active license is confirmed.
          </p>
        </section>
      </div>
    </div>
  );
}
