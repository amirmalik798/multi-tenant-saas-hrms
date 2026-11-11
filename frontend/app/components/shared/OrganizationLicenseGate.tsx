"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, CreditCard, LogOut, RefreshCw, ShieldAlert, LockKeyhole, CheckCircle2 } from "lucide-react";

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
  const [loggingOut, setLoggingOut] = useState(false);
  const [checkingAgain, setCheckingAgain] = useState(false);

  const isLicensePaymentPage =
    pathname === "/org/license" || pathname.startsWith("/org/license/");

  const checkLicense = useCallback(async () => {
    setCheckingAgain(true);

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

      // Preserve mandatory first-time setup and License & Payments access.
      if ((admin && !completed) || (admin && isLicensePaymentPage)) {
        setState("allowed");
      } else if (payload.license.canAccess === true) {
        setState("allowed");
      } else {
        setState("restricted");
      }
    } catch {
      setState("error");
    } finally {
      setCheckingAgain(false);
    }
  }, [isLicensePaymentPage, pathname]);

  useEffect(() => {
    void checkLicense();
  }, [checkLicense]);

  useEffect(() => {
    if (state === "checking") return;
    const timer = window.setInterval(() => void checkLicense(), 30_000);
    const onFocus = () => void checkLicense();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkLicense, state]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const endpoint = isOrganizationAdmin
        ? "/api/backend/org/auth/logout"
        : "/api/backend/employee-auth/logout";
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to sign out");
      window.location.assign("/");
    } catch {
      setLoggingOut(false);
    }
  };

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
    ? "We couldn’t verify your license"
    : expired
      ? "Your organization license has expired"
      : "Your organization isn’t licensed yet";
  const description = state === "error"
    ? "We couldn’t confirm an active license for this organization. Workspace access is paused until the license status can be verified."
    : expired
      ? "The subscription for this organization has expired. Renew the license to restore access to the HRMS workspace."
      : "This organization’s license has not been activated. Complete the licensing process to unlock the HRMS workspace.";

  return (
    <div className="organization-license-gate relative min-h-screen">
      <div
        aria-hidden="true"
        inert={true}
        data-license-locked="true"
        className="select-none blur-[3px] opacity-45"
        onPointerDownCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDownCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStartCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onAuxClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onContextMenuCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDownCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onSubmitCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>

      <div className="organization-license-backdrop fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto px-4 py-7">
        <section
          data-license-dialog="true"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="organization-license-title"
          aria-describedby="organization-license-description"
          className="organization-license-dialog relative w-full max-w-[540px] overflow-hidden rounded-[28px] border p-7 shadow-2xl sm:p-9"
        >
          <div className="organization-license-accent absolute inset-x-0 top-0 h-1" />

          <div className="flex items-start justify-between gap-4">
            <div className="organization-license-icon flex size-14 shrink-0 items-center justify-center rounded-2xl">
              {state === "error" ? <AlertTriangle size={27} /> : <ShieldAlert size={27} />}
            </div>
            <div className="organization-license-status inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em]">
              <span className="size-1.5 rounded-full bg-current" />
              Access restricted
            </div>
          </div>

          <p className="organization-license-eyebrow mt-7 text-[11px] font-bold uppercase tracking-[0.2em]">
            Organization licensing
          </p>
          <h1 id="organization-license-title" className="organization-license-title mt-2 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">
            {title}
          </h1>
          <p id="organization-license-description" className="organization-license-description mt-3 text-sm leading-7">
            {description}
          </p>

          <div className="organization-license-next mt-7 flex gap-3 rounded-2xl border p-4">
            <div className="organization-license-next-icon mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl">
              {isOrganizationAdmin ? <CreditCard size={18} /> : <LockKeyhole size={18} />}
            </div>
            <div className="min-w-0">
              <p className="organization-license-next-title text-sm font-bold">
                {isOrganizationAdmin ? "Restore your workspace" : "Contact your administrator"}
              </p>
              <p className="organization-license-next-copy mt-1.5 text-sm leading-6">
                {isOrganizationAdmin
                  ? "Review the license details and submit or resubmit payment proof. Your workspace will unlock automatically once the platform approves the license."
                  : "Your Organization Admin can review the organization’s license and complete the activation or renewal process."}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {isOrganizationAdmin && (
              <Link
                href="/org/license"
                className="organization-license-primary inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition"
              >
                <CreditCard size={17} />
                License &amp; Payments
              </Link>
            )}
            <button
              type="button"
              onClick={() => void checkLicense()}
              disabled={checkingAgain}
              className="organization-license-secondary inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-65"
            >
              <RefreshCw size={16} className={checkingAgain ? "animate-spin" : ""} />
              {checkingAgain ? "Checking…" : "Check license"}
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="organization-license-logout inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={16} />
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>

          <div className="organization-license-footnote mt-6 flex items-center justify-center gap-2 text-center text-[11px] leading-5">
            <CheckCircle2 size={13} />
            Workspace controls remain disabled until an active license is confirmed.
          </div>
        </section>
      </div>
    </div>
  );
}
