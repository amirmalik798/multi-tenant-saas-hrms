
"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  status?: string;
  message?: string;
  destination?: string;
  user?: {
    email?: string;
    role?: string;
    organizationId?: string;
    employeeId?: string | null;
  };
};

type PasswordResetResponse = {
  status?: string;
  message?: string;
};

type AuthView = "login" | "forgot-password" | "reset-password";

const ROLE_DESTINATIONS: Record<string, string> = {
  SUPER_ADMIN: "/dashboard",
  ORGANIZATION_ADMIN: "/org/dashboard",
  HR_MANAGER: "/employee/welcome",
  DEPARTMENT_MANAGER: "/employee/welcome",
  EMPLOYEE: "/employee/welcome",
};

const STARMAP_LED_COUNT = 42;

function MailIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3" />
    </svg>
  );
}

function EyeIcon({ hidden = false }: { hidden?: boolean }) {
  return hidden ? (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.7 4.8 9.5 6.1a1.7 1.7 0 0 1 0 1.8 15.4 15.4 0 0 1-3.1 3.5M6.2 6.2a16.6 16.6 0 0 0-3.7 4.9 1.7 1.7 0 0 0 0 1.8C3.3 14.2 6.8 19 12 19c1 0 2-.2 2.9-.5" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

type HrmsNetworkVisualizationProps = {
  active: boolean;
  accessGranted: boolean;
  failed: boolean;
};

/** An HRMS workspace map: employee records and workforce workflows connect through one secure platform. */
function HrmsNetworkVisualization({
  active,
  accessGranted,
  failed,
}: HrmsNetworkVisualizationProps) {
  const networkRgb = failed
    ? "244, 63, 94"
    : accessGranted
      ? "52, 211, 153"
      : active
        ? "96, 165, 250"
        : "100, 116, 139";

  const networkClass = failed
    ? "crm-network--failed"
    : accessGranted
      ? "crm-network--access-granted"
      : active
        ? "crm-network--awake"
        : "";

  const statusText = failed
    ? "Sign-in failed"
    : accessGranted
      ? "Workspace access granted"
      : active
        ? "Customer records connecting"
        : "HRMS workspace standby";

  const accessibleSummary = failed
    ? "Human resource management workspace showing employees, attendance, leave, recruitment, performance, payroll, and documents. The sign-in attempt failed and workspace access was not established."
    : "Human resource management workspace connecting employee records, attendance, leave, recruitment, performance, payroll, and documents around the HRMS platform core.";

  return (
    <div
      className={`crm-network-visualization mt-6 hidden w-full max-w-md sm:block ${networkClass}`}
      style={{ "--network-rgb": networkRgb } as CSSProperties}
      role="img"
      aria-label={accessibleSummary}
    >
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-[10px]">
          Human resource management
        </span>
        <span className="crm-network-status inline-flex shrink-0 items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em]">
          <span
            className="crm-network-status-dot size-1.5 rounded-full"
            aria-hidden="true"
          />
          {statusText}
        </span>
      </div>

      <svg
        viewBox="0 0 420 180"
        className="crm-network-svg block h-[126px] w-full sm:h-[148px]"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="crm-network-core-glow">
            <stop
              offset="0%"
              stopColor={`rgb(${networkRgb})`}
              stopOpacity={failed ? "0.16" : "0.22"}
            />
            <stop
              offset="100%"
              stopColor={`rgb(${networkRgb})`}
              stopOpacity="0"
            />
          </radialGradient>

          <linearGradient id="crm-network-access-line">
            <stop
              offset="0%"
              stopColor={`rgb(${networkRgb})`}
              stopOpacity="0.72"
            />
            <stop
              offset="100%"
              stopColor={`rgb(${networkRgb})`}
              stopOpacity={failed ? "0.08" : "0.45"}
            />
          </linearGradient>
        </defs>

        <circle
          cx="210"
          cy="88"
          r="62"
          fill="url(#crm-network-core-glow)"
          className="crm-network-core-aura"
        />

        {/* Relationships between HRMS entities and workflows. */}
        <g className="crm-network-connections">
          <path className="crm-network-connection" d="M40 46 C91 45 142 63 193 82" />
          <path className="crm-network-connection" d="M112 23 C150 35 177 55 200 75" />
          <path className="crm-network-connection" d="M45 130 C101 123 153 105 194 92" />
          <path className="crm-network-connection" d="M120 148 C158 129 183 110 201 99" />
          <path className="crm-network-connection" d="M222 75 C245 56 267 39 290 27" />
          <path className="crm-network-connection" d="M227 80 C278 46 329 43 380 67" />
          <path className="crm-network-connection" d="M224 99 C264 112 304 126 345 133" />
          <path className="crm-network-connection crm-network-connection--secondary" d="M40 46 Q31 89 45 130" />
          <path className="crm-network-connection crm-network-connection--secondary" d="M112 23 Q103 91 120 148" />
          <path className="crm-network-connection crm-network-connection--secondary" d="M290 27 Q314 75 345 133" />
          <path className="crm-network-connection crm-network-connection--secondary" d="M345 133 Q369 103 380 67" />
          <path className="crm-network-connection crm-network-connection--secondary" d="M130 148 Q238 171 345 133" />
        </g>

        <g className="crm-network-node crm-network-node--leads">
          <circle className="crm-network-node-halo" cx="40" cy="46" r="9" />
          <circle className="crm-network-node-dot crm-network-dot--leads" cx="40" cy="46" r="3.4" />
          <circle className="crm-network-node-dot crm-network-dot--leads" cx="46" cy="130" r="2.8" />
          <text x="27" y="27" className="crm-network-label">EMPLOYEES</text>
        </g>

        <g className="crm-network-node crm-network-node--contacts">
          <circle className="crm-network-node-halo" cx="112" cy="23" r="8" />
          <circle className="crm-network-node-dot crm-network-dot--contacts" cx="112" cy="23" r="3.2" />
          <text x="90" y="12" className="crm-network-label">ATTENDANCE</text>
        </g>

        <g className="crm-network-node crm-network-node--activities">
          <circle className="crm-network-node-halo" cx="45" cy="130" r="7" />
          <circle className="crm-network-node-dot crm-network-dot--activities" cx="45" cy="130" r="2.9" />
          <text x="7" y="151" className="crm-network-label">LEAVE</text>
        </g>

        <g className="crm-network-node crm-network-node--pipeline">
          <circle className="crm-network-node-halo" cx="120" cy="148" r="8" />
          <circle className="crm-network-node-dot crm-network-dot--pipeline" cx="120" cy="148" r="3.2" />
          <text x="96" y="169" className="crm-network-label">RECRUITMENT</text>
        </g>

        <g className="crm-network-node crm-network-node--opportunities">
          <circle className="crm-network-node-halo" cx="290" cy="27" r="8" />
          <circle className="crm-network-node-dot crm-network-dot--opportunities" cx="290" cy="27" r="3.2" />
          <text x="260" y="12" className="crm-network-label">PERFORMANCE</text>
        </g>

        <g className="crm-network-node crm-network-node--customers">
          <circle className="crm-network-node-halo" cx="380" cy="67" r="8" />
          <circle className="crm-network-node-dot crm-network-dot--customers" cx="380" cy="67" r="3.2" />
          <text x="348" y="51" className="crm-network-label">PAYROLL</text>
        </g>

        <g className="crm-network-node crm-network-node--deals">
          <circle className="crm-network-node-halo" cx="345" cy="133" r="8" />
          <circle className="crm-network-node-dot crm-network-dot--deals" cx="345" cy="133" r="3.2" />
          <text x="333" y="153" className="crm-network-label">DOCUMENTS</text>
        </g>

        <g className="crm-network-core">
          <circle className="crm-network-core-ring" cx="210" cy="88" r="20" />
          <circle className="crm-network-core-node" cx="210" cy="88" r="10" />
          <circle className="crm-network-core-center" cx="210" cy="88" r="3" />
          <text x="210" y="116" textAnchor="middle" className="crm-network-core-label">
            HRMS PLATFORM
          </text>
        </g>

        {/* Workspace access is a distinct gateway; on failure, this connection visibly breaks. */}
        <path
          className="crm-network-access-connection"
          d="M231 88 L260 88"
          stroke="url(#crm-network-access-line)"
          strokeWidth="1.3"
          strokeLinecap="round"
        />

        <g className="crm-network-access-gateway">
          <circle className="crm-network-access-halo" cx="267" cy="88" r="10" />
          <circle className="crm-network-access-node" cx="267" cy="88" r="5.2" />
          <path
            className="crm-network-access-check"
            d="M264.5 88 266.4 89.8 270 86.2"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="crm-network-access-failure"
            d="M264.5 85.5 269.5 90.5M269.5 85.5 264.5 90.5"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <text x="267" y="107" textAnchor="middle" className="crm-network-access-label">
            ACCESS
          </text>
        </g>
      </svg>

      <div className="crm-network-caption flex items-center justify-between gap-2 px-1 text-[9px] uppercase tracking-[0.1em]">
        <span>
          {failed
            ? "Workspace session not established"
            : "Connected employee lifecycle"}
        </span>
        <span>
          {failed ? "Signal rejected" : "Records · Activity · Revenue"}
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authSuccess, setAuthSuccess] = useState(false);

  const [authView, setAuthView] = useState<AuthView>("login");
  const [resetToken, setResetToken] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");

  const normalizedEmail = email.trim();
  const emailLooksValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const showEmailError =
    emailTouched && normalizedEmail.length > 0 && !emailLooksValid;
  const showEmailSuccess = emailTouched && emailLooksValid;

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const tokenFromUrl = currentUrl.searchParams.get("token");

    if (tokenFromUrl) {
      setResetToken(tokenFromUrl);
      setAuthView("reset-password");

      // Keep the one-time token in component state, not in the visible URL
      // or subsequent browser-history entries.
      currentUrl.searchParams.delete("token");
      const cleanUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState(null, "", cleanUrl);
      return;
    }

    emailInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function handleSignInShortcut(event: globalThis.KeyboardEvent) {
      if (
        authView === "login" &&
        event.ctrlKey &&
        event.key === "Enter" &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.isComposing
      ) {
        event.preventDefault();
        if (!loading) formRef.current?.requestSubmit();
      }
    }

    window.addEventListener("keydown", handleSignInShortcut);
    return () => window.removeEventListener("keydown", handleSignInShortcut);
  }, [loading, authView]);

  function updateCapsLock(event: ReactKeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(event.getModifierState("CapsLock"));
  }

  function openForgotPassword() {
    setResetEmail(email.trim().toLowerCase());
    setResetError("");
    setResetMessage("");
    setNewPassword("");
    setConfirmNewPassword("");
    setResetToken("");
    setPassword("");
    setShowPassword(false);
    setCapsLockOn(false);
    setError("");
    setLoginNotice("");
    setAuthSuccess(false);
    setAuthView("forgot-password");
  }

  function returnToSignIn() {
    setAuthView("login");
    setResetToken("");
    setResetError("");
    setResetMessage("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
  }

  async function handleResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetLoading) return;

    setResetError("");
    setResetMessage("");
    setResetLoading(true);

    try {
      const response = await fetch("/api/backend/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
      });

      const data = (await response.json().catch(() => null)) as
        | PasswordResetResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "Unable to process the request right now. Please try again.",
        );
      }

      setResetMessage(
        data?.message ||
          "If an account with that email address exists, password reset instructions will be sent.",
      );
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : "Unable to process the request right now. Please try again.",
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResetComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetLoading) return;

    setResetError("");
    setResetMessage("");

    if (!resetToken) {
      setResetError("This reset link is missing or invalid. Request a new one.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setResetError("The passwords do not match.");
      return;
    }

    if (Array.from(newPassword).length < 15) {
      setResetError("Password must contain at least 15 characters.");
      return;
    }

    if (newPassword.trim().length === 0) {
      setResetError("Password cannot consist only of whitespace.");
      return;
    }

    if (new TextEncoder().encode(newPassword).length > 72) {
      setResetError(
        "Password must not exceed 72 UTF-8 bytes because the application uses bcrypt.",
      );
      return;
    }

    setResetLoading(true);

    try {
      const response = await fetch("/api/backend/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          token: resetToken,
          password: newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | PasswordResetResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "Unable to reset your password. Request a new link and try again.",
        );
      }

      setPassword("");
      setError("");
      setLoginNotice(
        data?.message ||
          "Your password has been reset. Please sign in with your new password.",
      );
      setResetToken("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
      setResetError("");
      setResetMessage("");
      setAuthView("login");
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : "Unable to reset your password. Request a new link and try again.",
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setLoginNotice("");
    setAuthSuccess(false);
    setEmailTouched(true);
    setLoading(true);

    try {
      const response = await fetch("/api/backend/unified-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | LoginResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "Unable to sign in. Please check your details and try again.",
        );
      }

      const role = data?.user?.role;
      const destination = role ? ROLE_DESTINATIONS[role] : undefined;

      if (!destination || data?.destination !== destination) {
        throw new Error(
          "Sign-in succeeded, but the account destination was invalid.",
        );
      }

      setAuthSuccess(true);

      if (role === "SUPER_ADMIN") {
        const sessionResponse = await fetch("/api/backend/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        const sessionData = await sessionResponse.json().catch(() => null);

        if (
          !sessionResponse.ok ||
          sessionData?.authenticated !== true ||
          sessionData?.user?.role !== "SUPER_ADMIN"
        ) {
          throw new Error(
            "Session verification failed. Please sign in again.",
          );
        }
      } else if (role === "ORGANIZATION_ADMIN") {
        const sessionResponse = await fetch("/api/backend/org/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        const sessionData = await sessionResponse.json().catch(() => null);

        if (
          !sessionResponse.ok ||
          sessionData?.authenticated !== true ||
          sessionData?.user?.role !== "ORGANIZATION_ADMIN" ||
          sessionData?.user?.organizationId !==
            data?.user?.organizationId
        ) {
          throw new Error(
            "Session verification failed. Please sign in again.",
          );
        }
      } else if (
        role === "HR_MANAGER" ||
        role === "DEPARTMENT_MANAGER" ||
        role === "EMPLOYEE"
      ) {
        const sessionResponse = await fetch(
          "/api/backend/employee-auth/me",
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        const sessionData = await sessionResponse.json().catch(() => null);

        if (
          !sessionResponse.ok ||
          sessionData?.authenticated !== true ||
          sessionData?.user?.role !== role ||
          sessionData?.user?.organizationId !==
            data?.user?.organizationId ||
          sessionData?.user?.employeeId !== data?.user?.employeeId
        ) {
          throw new Error(
            "Session verification failed. Please sign in again.",
          );
        }
      }

      setPassword("");
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setAuthSuccess(false);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const visualState = authView === "login"
    ? error
      ? "error"
      : authSuccess
        ? "success"
        : "default"
    : resetError
      ? "error"
      : resetMessage
        ? "success"
        : "default";

  const signInProgress = authView === "login"
    ? loading || authSuccess
      ? 3
      : emailLooksValid && password.length > 0
        ? 2
        : emailLooksValid
          ? 1
          : 0
    : resetLoading
      ? 3
      : authView === "forgot-password"
        ? resetEmail.trim().length > 0
          ? 2
          : 0
        : resetToken
          ? 2
          : 0;

  const litLedCount = Math.round(
    (signInProgress / 3) * STARMAP_LED_COUNT,
  );

  const ledRgb = visualState === "error"
    ? "244, 63, 94"
    : visualState === "success"
      ? "16, 185, 129"
      : "96, 165, 250";

  const ambientLeft =
    visualState === "error"
      ? "bg-rose-600/15"
      : visualState === "success"
        ? "bg-emerald-500/15"
        : "bg-blue-600/10";

  const ambientRight =
    visualState === "error"
      ? "bg-red-950/45"
      : visualState === "success"
        ? "bg-emerald-950/35"
        : "bg-slate-900/40";

  const ambientCenter =
    visualState === "error"
      ? "bg-rose-950/20"
      : visualState === "success"
        ? "bg-emerald-950/20"
        : "bg-blue-950/10";

  const highlightColor =
    visualState === "error"
      ? "via-rose-400/65"
      : visualState === "success"
        ? "via-emerald-400/65"
        : "via-blue-400/60";

  const cardGlow =
    visualState === "error"
      ? "shadow-[0_24px_70px_rgba(244,63,94,0.16)] ring-1 ring-rose-400/15"
      : visualState === "success"
        ? "shadow-[0_24px_70px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/15"
        : "shadow-[0_24px_70px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.06]";

  const statusPill =
    visualState === "error"
      ? "border-rose-400/20 bg-rose-500/[0.08] text-rose-200"
      : visualState === "success"
        ? "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200"
        : "border-blue-400/15 bg-blue-500/[0.07] text-blue-200";

  return (
    <main className="login-main relative flex min-h-screen w-full max-w-[100vw] items-center justify-center overflow-x-hidden overflow-y-auto bg-[#0b0f17] px-4 py-6 text-[#f8fafc] sm:h-screen sm:min-h-0 sm:overflow-hidden sm:px-8 lg:px-12">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-4 size-64 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-500 sm:left-0 sm:top-0 sm:size-96 sm:translate-x-0 ${ambientLeft}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-1/2 size-64 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-500 sm:bottom-0 sm:left-auto sm:right-0 sm:size-[28rem] sm:translate-x-0 ${ambientRight}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-500 sm:size-[34rem] ${ambientCenter}`}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
      />

      {/* Split container: Brand & Intro on the left, Login Card on the right */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-16">
        {/* Left Side: Brand and Introduction */}
        <div className="w-full text-center sm:w-1/2 sm:max-w-md sm:text-left">
          <div className="relative mx-auto mb-4 flex size-16 items-center justify-center rounded-[1.35rem] border border-white/10 bg-blue-500/15 text-lg font-extrabold tracking-tight text-blue-300 shadow-lg shadow-blue-500/10 ring-1 ring-blue-400/10 sm:mx-0">
            <span
              className="absolute inset-1 rounded-[1rem] border border-white/[0.04]"
              aria-hidden="true"
            />
            <span className="relative">HR</span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300">
            HRMS Platform
          </p>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#f8fafc] sm:text-4xl">
            Welcome back
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
            Sign in to continue to your workspace. We’ll route you to the right
            dashboard based on your account.
          </p>

          <HrmsNetworkVisualization
            active={
              authView === "login"
                ? email.trim().length > 0
                : authView === "forgot-password"
                  ? resetEmail.trim().length > 0
                  : Boolean(resetToken)
            }
            accessGranted={authSuccess}
            failed={Boolean(error || resetError)}
          />
        </div>

        {/* Right Side: The Login Card */}
        <div className="w-full max-w-md shrink-0">
          <div
            style={{ "--led-rgb": ledRgb } as CSSProperties}
            className={`relative isolate w-full overflow-hidden rounded-3xl bg-[#182232]/85 backdrop-blur-xl transition-[box-shadow] duration-500 ${cardGlow}`}
          >
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3 bg-gradient-to-r transition-colors duration-500 ${
                visualState === "error"
                  ? "from-rose-300/[0.08] via-rose-300/[0.025] to-transparent"
                  : visualState === "success"
                    ? "from-emerald-300/[0.08] via-emerald-300/[0.025] to-transparent"
                    : "from-blue-300/[0.08] via-blue-300/[0.025] to-transparent"
              }`}
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-white/[0.05]"
            />

            <div
              aria-hidden="true"
              className={`relative z-10 h-px w-full bg-gradient-to-r from-transparent ${highlightColor} to-transparent transition-colors duration-500`}
            />

            <div className="relative z-10 w-full p-6 sm:p-8">
              {authView === "login" ? (
                <>
                  <div className="mb-6">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-300 ${statusPill}`}
                      role="status"
                      aria-live="polite"
                    >
                      <span className="relative flex size-2" aria-hidden="true">
                        <span
                          className={`absolute inline-flex size-full animate-ping rounded-full motion-reduce:animate-none ${
                            visualState === "error"
                              ? "bg-rose-400/50"
                              : visualState === "success"
                                ? "bg-emerald-400/50"
                                : "bg-blue-400/50"
                          }`}
                        />
                        <span
                          className={`relative inline-flex size-2 rounded-full ${
                            visualState === "error"
                              ? "bg-rose-400"
                              : visualState === "success"
                                ? "bg-emerald-400"
                                : "bg-blue-400"
                          }`}
                        />
                      </span>

                      {visualState === "error"
                        ? "Sign-in needs attention"
                        : visualState === "success"
                          ? loading
                            ? "Credentials accepted"
                            : "Access verified"
                          : loading
                            ? "Verifying credentials"
                            : "Secure workspace access"}
                    </div>
                  </div>

                  <form
                    ref={formRef}
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-3"
                    noValidate={false}
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label
                          htmlFor="email"
                          className="block text-xs font-medium text-slate-200 sm:text-sm"
                        >
                          Email address
                        </label>
                        <span className="text-[11px] text-slate-500">
                          Work account
                        </span>
                      </div>

                      <div className="relative">
                        <span
                          className={`pointer-events-none absolute inset-y-0 left-3.5 flex items-center transition-colors duration-200 ${
                            emailFocused
                              ? "text-blue-300"
                              : showEmailSuccess
                                ? "text-emerald-300"
                                : "text-slate-500"
                          }`}
                        >
                          <MailIcon />
                        </span>

                        <input
                          ref={emailInputRef}
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          required
                          maxLength={254}
                          data-lpignore="true"
                          value={email}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            setError("");
                            setLoginNotice("");
                            setAuthSuccess(false);
                          }}
                          onFocus={() => setEmailFocused(true)}
                          onBlur={() => {
                            setEmailFocused(false);
                            setEmailTouched(true);
                          }}
                          placeholder="you@company.com"
                          aria-invalid={showEmailError}
                          aria-describedby={
                            showEmailError ? "email-feedback" : undefined
                          }
                          className={`h-12 w-full rounded-xl border bg-[#111a28] pl-11 pr-11 text-sm text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 ${
                            showEmailError
                              ? "border-rose-400/50 focus:border-rose-400"
                              : showEmailSuccess
                                ? "border-emerald-400/30"
                                : "border-white/10"
                          }`}
                        />

                        {showEmailSuccess && (
                          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-emerald-300">
                            <CheckIcon />
                          </span>
                        )}
                      </div>

                      <div className="mt-1 min-h-4" aria-live="polite">
                        <p
                          id="email-feedback"
                          aria-hidden={!showEmailError}
                          className={`text-xs leading-4 text-rose-300 transition-opacity duration-200 ${
                            showEmailError
                              ? "opacity-100"
                              : "pointer-events-none opacity-0"
                          }`}
                        >
                          Enter a valid email address, such as name@company.com.
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label
                          htmlFor="password"
                          className="block text-xs font-medium text-slate-200 sm:text-sm"
                        >
                          Password
                        </label>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                          <LockIcon className="size-3.5" /> Protected sign-in
                        </span>
                      </div>

                      <div className="relative">
                        <span
                          className={`pointer-events-none absolute inset-y-0 left-3.5 flex items-center transition-colors duration-200 ${
                            passwordFocused
                              ? "text-blue-300"
                              : password.length > 0 && !error
                                ? "text-emerald-300"
                                : "text-slate-500"
                          }`}
                        >
                          <LockIcon />
                        </span>

                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          maxLength={1024}
                          data-lpignore="true"
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            setError("");
                            setLoginNotice("");
                            setAuthSuccess(false);
                          }}
                          onKeyDown={updateCapsLock}
                          onKeyUp={updateCapsLock}
                          onFocus={() => setPasswordFocused(true)}
                          onBlur={() => {
                            setPasswordFocused(false);
                            setCapsLockOn(false);
                          }}
                          placeholder="Enter your password"
                          aria-describedby={
                            capsLockOn ? "caps-lock-warning" : undefined
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-[#111a28] pl-11 pr-20 text-sm text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                        />

                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          className="absolute inset-y-0 right-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                        >
                          <EyeIcon hidden={showPassword} />
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>

                      <div className="relative mt-2 min-h-7" aria-live="polite">
                        <p
                          id="caps-lock-warning"
                          role="status"
                          aria-hidden={!capsLockOn}
                          className={`absolute left-0 top-0 inline-flex items-center gap-2 rounded-lg border border-amber-400/15 bg-amber-500/[0.07] px-3 py-1 text-xs text-amber-200 transition-all duration-300 ease-out ${
                            capsLockOn
                              ? "translate-y-0 opacity-100"
                              : "pointer-events-none -translate-y-1 opacity-0"
                          }`}
                        >
                          <span aria-hidden="true">!</span> Caps Lock is on
                        </p>

                        <p
                          className={`absolute inset-x-0 top-0 text-xs leading-5 text-slate-500 transition-opacity duration-200 ${
                            capsLockOn ? "opacity-0" : "opacity-100"
                          }`}
                          aria-hidden={capsLockOn}
                        >
                          Use the password associated with your HRMS account.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end -mt-1">
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        className="rounded-md text-xs font-semibold text-blue-300 underline-offset-4 transition hover:text-blue-200 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {loginNotice && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-5 text-emerald-200"
                      >
                        {loginNotice}
                      </div>
                    )}

                    {error && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-300"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="mt-0.5 size-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path
                            d="M12 7.5v5m0 3h.01"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition duration-200 hover:bg-blue-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 disabled:cursor-not-allowed disabled:opacity-60 ${
                        loading ? "login-submit-button--igniting" : ""
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                      />

                      {loading ? (
                        <span className="relative flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
                          />
                          Verifying account...
                        </span>
                      ) : (
                        <span className="relative inline-flex items-center gap-2">
                          Sign in securely
                          <svg
                            viewBox="0 0 24 24"
                            className="size-4 transition-transform group-hover:translate-x-0.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14m-6-6 6 6-6 6" />
                          </svg>
                        </span>
                      )}

                      {!loading && (
                        <span
                          aria-hidden="true"
                          className="absolute right-3 inline-flex items-center rounded-md border border-white/20 bg-white/[0.08] px-1.5 py-1 font-mono text-[10px] font-medium leading-none tracking-tight text-blue-50/90 shadow-inner"
                        >
                          Ctrl&nbsp;↵
                        </span>
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-2 pt-0.5 text-xs text-slate-500">
                      <LockIcon className="size-3.5" />
                      <span>
                        Your credentials are sent over the secure same-origin
                        session.
                      </span>
                    </div>
                  </form>

                  <footer className="mt-6 pt-1">
                    <p className="text-center text-xs leading-5 text-slate-400">
                      Super Admin, Organization Admin, and employee access are
                      determined by your account.
                    </p>
                  </footer>
                </>
              ) : (
                <section
                  aria-labelledby={
                    authView === "forgot-password"
                      ? "forgot-password-title"
                      : "reset-password-title"
                  }
                  aria-live="polite"
                >
                  <div className="mb-6">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-300 ${statusPill}`}
                      role="status"
                    >
                      <span className="relative flex size-2" aria-hidden="true">
                        <span
                          className={`absolute inline-flex size-full rounded-full ${
                            visualState === "error"
                              ? "bg-rose-400/50"
                              : visualState === "success"
                                ? "bg-emerald-400/50"
                                : "bg-blue-400/50"
                          }`}
                        />
                        <span
                          className={`relative inline-flex size-2 rounded-full ${
                            visualState === "error"
                              ? "bg-rose-400"
                              : visualState === "success"
                                ? "bg-emerald-400"
                                : "bg-blue-400"
                          }`}
                        />
                      </span>
                      {resetLoading
                        ? authView === "forgot-password"
                          ? "Preparing account recovery"
                          : "Updating password"
                        : resetError
                          ? "Password recovery needs attention"
                          : resetMessage
                            ? "Instructions requested"
                            : authView === "forgot-password"
                              ? "Account recovery"
                              : "Secure password reset"}
                    </div>
                  </div>

                  {authView === "forgot-password" ? (
                    <>
                      <div className="mb-6">
                        <h2
                          id="forgot-password-title"
                          className="text-xl font-bold tracking-tight text-[#f8fafc]"
                        >
                          Forgot your password?
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          Enter your work email. If an account exists, we’ll send
                          instructions to reset its password.
                        </p>
                      </div>

                      <form
                        onSubmit={handleResetRequest}
                        className="flex flex-col gap-4"
                      >
                        <div>
                          <label
                            htmlFor="reset-email"
                            className="mb-2 block text-xs font-medium text-slate-200 sm:text-sm"
                          >
                            Email address
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                              <MailIcon />
                            </span>
                            <input
                              id="reset-email"
                              name="resetEmail"
                              type="email"
                              autoComplete="email"
                              autoCapitalize="none"
                              spellCheck={false}
                              required
                              maxLength={254}
                              value={resetEmail}
                              onChange={(event) => {
                                setResetEmail(event.target.value);
                                setResetError("");
                                setResetMessage("");
                              }}
                              placeholder="you@company.com"
                              className="h-12 w-full rounded-xl border border-white/10 bg-[#111a28] pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                            />
                          </div>
                        </div>

                        {resetError && (
                          <div
                            role="alert"
                            className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-300"
                          >
                            {resetError}
                          </div>
                        )}

                        {resetMessage && (
                          <div
                            role="status"
                            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-5 text-emerald-200"
                          >
                            {resetMessage}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={resetLoading}
                          aria-busy={resetLoading}
                          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition duration-200 hover:bg-blue-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resetLoading ? "Sending instructions..." : "Send reset instructions"}
                        </button>

                        <button
                          type="button"
                          onClick={returnToSignIn}
                          className="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                        >
                          Back to sign in
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className="mb-6">
                        <h2
                          id="reset-password-title"
                          className="text-xl font-bold tracking-tight text-[#f8fafc]"
                        >
                          Choose a new password
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          Create a strong password for your HRMS account. This
                          link can be used only once and expires after 30 minutes.
                        </p>
                      </div>

                      <form
                        onSubmit={handleResetComplete}
                        className="flex flex-col gap-4"
                      >
                        <div>
                          <label
                            htmlFor="new-password"
                            className="mb-2 block text-xs font-medium text-slate-200 sm:text-sm"
                          >
                            New password
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                              <LockIcon />
                            </span>
                            <input
                              id="new-password"
                              name="newPassword"
                              type={showNewPassword ? "text" : "password"}
                              autoComplete="new-password"
                              required
                              minLength={15}
                              value={newPassword}
                              onChange={(event) => {
                                setNewPassword(event.target.value);
                                setResetError("");
                              }}
                              placeholder="Enter a new password"
                              className="h-12 w-full rounded-xl border border-white/10 bg-[#111a28] pl-11 pr-20 text-sm text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword((visible) => !visible)}
                              aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                              aria-pressed={showNewPassword}
                              className="absolute inset-y-0 right-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                            >
                              <EyeIcon hidden={showNewPassword} />
                              {showNewPassword ? "Hide" : "Show"}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="confirm-new-password"
                            className="mb-2 block text-xs font-medium text-slate-200 sm:text-sm"
                          >
                            Confirm new password
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                              <LockIcon />
                            </span>
                            <input
                              id="confirm-new-password"
                              name="confirmNewPassword"
                              type={showConfirmNewPassword ? "text" : "password"}
                              autoComplete="new-password"
                              required
                              minLength={15}
                              value={confirmNewPassword}
                              onChange={(event) => {
                                setConfirmNewPassword(event.target.value);
                                setResetError("");
                              }}
                              placeholder="Re-enter your new password"
                              className="h-12 w-full rounded-xl border border-white/10 bg-[#111a28] pl-11 pr-20 text-sm text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmNewPassword((visible) => !visible)}
                              aria-label={showConfirmNewPassword ? "Hide confirmation password" : "Show confirmation password"}
                              aria-pressed={showConfirmNewPassword}
                              className="absolute inset-y-0 right-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                            >
                              <EyeIcon hidden={showConfirmNewPassword} />
                              {showConfirmNewPassword ? "Hide" : "Show"}
                            </button>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Use at least 15 characters. Passwords must fit within
                            bcrypt’s 72-byte UTF-8 limit. Avoid common passwords.
                          </p>
                        </div>

                        {resetError && (
                          <div
                            role="alert"
                            className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-300"
                          >
                            {resetError}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={resetLoading}
                          aria-busy={resetLoading}
                          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition duration-200 hover:bg-blue-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resetLoading ? "Resetting password..." : "Reset password"}
                        </button>

                        <button
                          type="button"
                          onClick={openForgotPassword}
                          className="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                        >
                          Request another reset link
                        </button>

                        <button
                          type="button"
                          onClick={returnToSignIn}
                          className="text-center text-xs font-semibold text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                        >
                          Back to sign in
                        </button>
                      </form>
                    </>
                  )}
                </section>
              )}
            </div>

            <div
              aria-hidden="true"
              className={`starmap-rail pointer-events-none absolute inset-x-6 bottom-3 z-20 flex h-[11px] items-center gap-[3px] overflow-hidden rounded-full px-1.5 ${loading || resetLoading ? "starmap-rail--scanning" : ""}`}
              style={{ "--led-rgb": ledRgb } as CSSProperties}
            >
              <span className="starmap-scan" />

              {Array.from({ length: STARMAP_LED_COUNT }, (_, index) => {
                const isLit = index < litLedCount;
                const isWaypoint = index % 7 === 0;
                const isMilestone =
                  (index === 7 && signInProgress >= 1) ||
                  (index === 21 && signInProgress >= 2) ||
                  (index === 35 && signInProgress >= 3);

                return (
                  <span
                    key={index}
                    className={`starmap-led${isWaypoint ? " starmap-led--waypoint" : ""}${isLit ? " starmap-led--lit" : ""}${isMilestone ? " starmap-led--milestone-reached" : ""}`}
                    style={{
                      "--led-rgb": ledRgb,
                      animationDelay: isLit ? `${index * 9}ms` : "0ms",
                    } as CSSProperties}
                  />
                );
              })}
            </div>
          </div>

          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500 sm:hidden">
            <LockIcon className="size-3.5" /> Authorized access only.
          </p>
        </div>
      </div>

      <style jsx global>{`
        html,
        body {
          box-sizing: border-box;
          width: 100%;
          max-width: 100vw;
          margin: 0;
          padding: 0;
          background-color: #0b0f17 !important;
          color: #f8fafc !important;
          overflow-x: hidden !important;
          overscroll-behavior-x: none;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #111a28 inset !important;
          -webkit-text-fill-color: #f8fafc !important;
          caret-color: #f8fafc !important;
          transition: background-color 5000s ease-in-out 0s;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }

        input:-moz-autofill {
          box-shadow: 0 0 0 1000px #111a28 inset !important;
          color: #f8fafc !important;
          caret-color: #f8fafc !important;
        }

        @keyframes sapphire-focus-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.08);
          }

          100% {
            box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
          }
        }

        .login-field:focus {
          animation: sapphire-focus-pulse 20ms ease-out;
        }

        .login-submit-button--igniting::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 5;
          pointer-events: none;
          border: 1px solid rgba(191, 219, 254, 0.82);
          border-radius: inherit;
          box-shadow:
            inset 0 0 12px rgba(147, 197, 253, 0.34),
            0 0 14px rgba(96, 165, 250, 0.42);
          animation: ignition-perimeter-flare 900ms
            cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes ignition-perimeter-flare {
          0% {
            opacity: 0.15;
            filter: brightness(1);
            box-shadow:
              inset 0 0 0 rgba(147, 197, 253, 0),
              0 0 0 rgba(96, 165, 250, 0);
          }

          35% {
            opacity: 1;
            filter: brightness(1.35);
            box-shadow:
              inset 0 0 14px rgba(147, 197, 253, 0.42),
              0 0 18px rgba(96, 165, 250, 0.62);
          }

          100% {
            opacity: 0;
            filter: brightness(1);
            box-shadow:
              inset 0 0 2px rgba(147, 197, 253, 0.08),
              0 0 2px rgba(96, 165, 250, 0.05);
          }
        }

        .starmap-rail {
          isolation: isolate;
          border: 1px solid rgba(148, 163, 184, 0.13);
          background: linear-gradient(
            180deg,
            rgba(5, 10, 19, 0.92),
            rgba(15, 23, 42, 0.82)
          );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.075),
            inset 0 -2px 4px rgba(0, 0, 0, 0.42),
            0 0 16px rgba(var(--led-rgb), 0.055);
          transition: border-color 420ms ease, box-shadow 420ms ease;
        }

        .starmap-rail::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(var(--led-rgb), 0.105),
            transparent
          );
          opacity: 0.7;
          transition: background 420ms ease, opacity 420ms ease;
        }

        .starmap-rail--scanning {
          border-color: rgba(var(--led-rgb), 0.36);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.09),
            inset 0 -2px 4px rgba(0, 0, 0, 0.42),
            0 0 18px rgba(var(--led-rgb), 0.14);
        }

        .starmap-scan {
          position: absolute;
          z-index: 2;
          top: 1px;
          bottom: 1px;
          left: -24%;
          width: 22%;
          border-radius: 9999px;
          opacity: 0;
          pointer-events: none;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(219, 234, 254, 0.72),
            transparent
          );
          filter: blur(1px);
        }

        .starmap-rail--scanning .starmap-scan {
          opacity: 0.9;
          animation: starmap-scan-travel 1.35s ease-in-out infinite;
        }

        .starmap-led {
          position: relative;
          z-index: 1;
          display: block;
          height: 2px;
          min-width: 0;
          flex: 1 1 0%;
          border-radius: 9999px;
          opacity: 0.72;
          background: rgba(148, 163, 184, 0.24);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
          transition:
            opacity 280ms ease,
            background-color 280ms ease,
            box-shadow 280ms ease,
            height 280ms ease;
        }

        .starmap-led--waypoint {
          height: 3px;
          background: rgba(var(--led-rgb), 0.42);
          box-shadow: 0 0 3px rgba(var(--led-rgb), 0.14);
        }

        .starmap-led--lit {
          opacity: 0.98;
          background: rgba(var(--led-rgb), 0.9);
          box-shadow:
            0 0 6px rgba(var(--led-rgb), 0.56),
            0 0 12px rgba(var(--led-rgb), 0.18);
          animation: starmap-led-wave 520ms
            cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .starmap-led--lit.starmap-led--waypoint {
          height: 4px;
          box-shadow:
            0 0 8px rgba(var(--led-rgb), 0.78),
            0 0 15px rgba(var(--led-rgb), 0.28);
        }

        .starmap-led--milestone-reached {
          opacity: 1;
          background: rgba(var(--led-rgb), 1);
          box-shadow:
            0 0 9px rgba(var(--led-rgb), 0.96),
            0 0 18px rgba(var(--led-rgb), 0.58),
            0 0 25px rgba(var(--led-rgb), 0.22);
        }

        .starmap-led--lit.starmap-led--milestone-reached {
          transform: scaleY(1.22);
        }

        @keyframes starmap-led-wave {
          0% {
            opacity: 0.25;
            transform: scaleY(0.65);
            box-shadow: 0 0 0 rgba(var(--led-rgb), 0);
          }

          48% {
            opacity: 1;
            transform: scaleY(1.25);
            box-shadow: 0 0 11px rgba(var(--led-rgb), 0.82);
          }

          100% {
            opacity: 0.98;
            transform: scaleY(1);
            box-shadow:
              0 0 6px rgba(var(--led-rgb), 0.56),
              0 0 12px rgba(var(--led-rgb), 0.18);
          }
        }

        @keyframes starmap-scan-travel {
          0% {
            transform: translateX(0);
            opacity: 0;
          }

          12% {
            opacity: 0.78;
          }

          88% {
            opacity: 0.78;
          }

          100% {
            transform: translateX(1500%);
            opacity: 0;
          }
        }

        /* HRMS workspace visualization: workforce functions converge on the platform core and secure access gateway. */
        .crm-network-visualization {
          --network-rgb: 100, 116, 139;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.045);
          border-radius: 18px;
          padding: 11px 12px 9px;
          background:
            radial-gradient(
              ellipse at 50% 48%,
              rgba(var(--network-rgb), 0.075),
              transparent 62%
            ),
            linear-gradient(
              145deg,
              rgba(24, 34, 50, 0.44),
              rgba(11, 15, 23, 0.22)
            );
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
          transition:
            border-color 420ms ease,
            background 420ms ease,
            box-shadow 420ms ease;
        }

        .crm-network-status {
          color: rgba(148, 163, 184, 0.72);
          transition: color 420ms ease;
        }

        .crm-network-status-dot {
          background: rgba(var(--network-rgb), 0.6);
          box-shadow: 0 0 5px rgba(var(--network-rgb), 0.18);
          transition: background 420ms ease, box-shadow 420ms ease;
        }

        .crm-network-svg {
          overflow: visible;
        }

        .crm-network-connection {
          stroke: rgba(148, 163, 184, 0.24);
          stroke-width: 0.9;
          stroke-linecap: round;
          stroke-dasharray: 2 4;
          opacity: 0.78;
          transition:
            stroke 420ms ease,
            opacity 420ms ease,
            filter 420ms ease;
        }

        .crm-network-connection--secondary {
          stroke-dasharray: 1 6;
          opacity: 0.34;
        }

        .crm-network-node-dot {
          fill: rgba(148, 163, 184, 0.68);
          transition: fill 420ms ease, filter 420ms ease;
        }

        .crm-network-node-halo {
          fill: rgba(var(--network-rgb), 0.025);
          stroke: rgba(var(--network-rgb), 0.16);
          stroke-width: 0.8;
          transition: fill 420ms ease, stroke 420ms ease;
        }

        .crm-network-label {
          fill: rgba(148, 163, 184, 0.62);
          font-size: 7px;
          font-weight: 600;
          letter-spacing: 1.1px;
          transition: fill 420ms ease;
        }

        .crm-network-core-ring {
          stroke: rgba(var(--network-rgb), 0.35);
          stroke-width: 0.8;
          stroke-dasharray: 2 4;
          transition: stroke 420ms ease;
        }

        .crm-network-core-node {
          fill: rgba(24, 34, 50, 0.94);
          stroke: rgba(var(--network-rgb), 0.64);
          stroke-width: 1.2;
          transition: stroke 420ms ease;
        }

        .crm-network-core-center {
          fill: rgb(var(--network-rgb));
          transition: fill 420ms ease;
        }

        .crm-network-core-label {
          fill: rgba(203, 213, 225, 0.76);
          font-size: 7px;
          font-weight: 700;
          letter-spacing: 1.35px;
          transition: fill 420ms ease;
        }

        .crm-network--awake,
        .crm-network--access-granted,
        .crm-network--failed {
          border-color: rgba(var(--network-rgb), 0.2);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.035),
            0 0 26px rgba(var(--network-rgb), 0.045);
        }

        .crm-network--awake .crm-network-status,
        .crm-network--access-granted .crm-network-status,
        .crm-network--failed .crm-network-status {
          color: rgba(var(--network-rgb), 0.96);
        }

        .crm-network--awake .crm-network-status-dot,
        .crm-network--access-granted .crm-network-status-dot {
          animation: crm-network-status-pulse 2.4s ease-in-out infinite;
        }

        .crm-network--awake .crm-network-connection,
        .crm-network--access-granted .crm-network-connection {
          stroke: rgba(var(--network-rgb), 0.48);
          opacity: 0.92;
          filter: drop-shadow(0 0 2px rgba(var(--network-rgb), 0.16));
          animation: crm-network-link-pulse 2.6s ease-in-out infinite alternate;
        }

        .crm-network--awake .crm-network-connection--secondary,
        .crm-network--access-granted .crm-network-connection--secondary {
          opacity: 0.58;
        }

        .crm-network--awake .crm-network-node-dot,
        .crm-network--access-granted .crm-network-node-dot {
          fill: rgba(var(--network-rgb), 0.98);
          filter: drop-shadow(0 0 3px rgba(var(--network-rgb), 0.58));
          animation: crm-network-node-pulse 2.4s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        .crm-network--awake .crm-network-node--contacts .crm-network-node-dot,
        .crm-network--access-granted .crm-network-node--contacts .crm-network-node-dot {
          animation-delay: 180ms;
        }

        .crm-network--awake .crm-network-node--pipeline .crm-network-node-dot,
        .crm-network--access-granted .crm-network-node--pipeline .crm-network-node-dot {
          animation-delay: 300ms;
        }

        .crm-network--awake .crm-network-node--opportunities .crm-network-node-dot,
        .crm-network--access-granted .crm-network-node--opportunities .crm-network-node-dot {
          animation-delay: 420ms;
        }

        .crm-network--awake .crm-network-node--deals .crm-network-node-dot,
        .crm-network--access-granted .crm-network-node--deals .crm-network-node-dot {
          animation-delay: 540ms;
        }

        .crm-network--awake .crm-network-node-halo,
        .crm-network--access-granted .crm-network-node-halo {
          fill: rgba(var(--network-rgb), 0.08);
          stroke: rgba(var(--network-rgb), 0.44);
        }

        .crm-network--awake .crm-network-core-ring,
        .crm-network--access-granted .crm-network-core-ring {
          animation: crm-network-ring-pulse 2.4s ease-in-out infinite;
        }

        .crm-network--access-granted .crm-network-label {
          fill: rgba(110, 231, 183, 0.82);
        }

        .crm-network--access-granted .crm-network-core-label {
          fill: rgba(167, 243, 208, 0.96);
        }

        .crm-network-caption {
          color: rgba(100, 116, 139, 0.84);
          transition: color 420ms ease;
        }

        .crm-network-access-connection {
          opacity: 0.8;
          transition: opacity 300ms ease, stroke 300ms ease;
        }

        .crm-network-access-halo {
          fill: rgba(var(--network-rgb), 0.07);
          stroke: rgba(var(--network-rgb), 0.45);
          stroke-width: 0.9;
          transition: fill 300ms ease, stroke 300ms ease;
        }

        .crm-network-access-node {
          fill: rgba(15, 23, 42, 0.95);
          stroke: rgba(var(--network-rgb), 0.78);
          stroke-width: 1.1;
          transition: stroke 300ms ease;
        }

        .crm-network-access-check {
          stroke: rgb(var(--network-rgb));
          opacity: 0.95;
          transition: opacity 220ms ease;
        }

        .crm-network-access-failure {
          stroke: rgb(var(--network-rgb));
          opacity: 0;
          transition: opacity 220ms ease;
        }

        .crm-network-access-label {
          fill: rgba(148, 163, 184, 0.68);
          font-size: 6.5px;
          font-weight: 700;
          letter-spacing: 1px;
          transition: fill 300ms ease;
        }

        .crm-network--failed .crm-network-status-dot {
          animation: crm-network-failure-pulse 1.4s ease-in-out infinite;
        }

        .crm-network--failed .crm-network-connection {
          stroke: rgba(251, 113, 133, 0.32);
          opacity: 0.58;
          filter: none;
          animation: none;
        }

        .crm-network--failed .crm-network-connection--secondary {
          opacity: 0.22;
        }

        .crm-network--failed .crm-network-node-dot {
          fill: rgba(251, 113, 133, 0.72);
          filter: drop-shadow(0 0 2px rgba(244, 63, 94, 0.22));
          animation: none;
        }

        .crm-network--failed .crm-network-label {
          fill: rgba(253, 164, 175, 0.76);
        }

        .crm-network--failed .crm-network-core-ring {
          stroke: rgba(251, 113, 133, 0.48);
          animation: none;
        }

        .crm-network--failed .crm-network-core-center {
          fill: rgb(251, 113, 133);
        }

        .crm-network--failed .crm-network-core-label {
          fill: rgba(254, 202, 202, 0.92);
        }

        .crm-network--failed .crm-network-access-connection {
          opacity: 0.28;
          stroke-dasharray: 2 3;
        }

        .crm-network--failed .crm-network-access-halo {
          fill: rgba(244, 63, 94, 0.18);
          stroke: rgba(251, 113, 133, 0.9);
          animation: crm-network-failure-flash 620ms ease-out both;
        }

        .crm-network--failed .crm-network-access-node {
          stroke: rgba(251, 113, 133, 0.98);
        }

        .crm-network--failed .crm-network-access-check {
          opacity: 0;
        }

        .crm-network--failed .crm-network-access-failure {
          opacity: 1;
        }

        .crm-network--failed .crm-network-access-label {
          fill: rgba(253, 164, 175, 0.96);
        }

        .crm-network--failed .crm-network-caption {
          color: rgba(253, 164, 175, 0.82);
        }

        @keyframes crm-network-node-pulse {
          0%,
          100% {
            opacity: 0.76;
            transform: scale(1);
          }

          50% {
            opacity: 1;
            transform: scale(1.18);
          }
        }

        @keyframes crm-network-link-pulse {
          from {
            opacity: 0.55;
          }

          to {
            opacity: 0.95;
          }
        }

        @keyframes crm-network-ring-pulse {
          0%,
          100% {
            opacity: 0.62;
            transform: scale(1);
          }

          50% {
            opacity: 1;
            transform: scale(1.07);
          }
        }

        @keyframes crm-network-status-pulse {
          0%,
          100% {
            opacity: 0.65;
          }

          50% {
            opacity: 1;
          }
        }

        @keyframes crm-network-failure-pulse {
          0%,
          100% {
            box-shadow: 0 0 4px rgba(244, 63, 94, 0.24);
          }

          50% {
            box-shadow: 0 0 8px rgba(244, 63, 94, 0.7);
          }
        }

        @keyframes crm-network-failure-flash {
          0% {
            opacity: 0.25;
          }

          40% {
            opacity: 1;
          }

          100% {
            opacity: 0.9;
          }
        }

        @media (min-width: 640px) and (max-height: 760px) {
          .crm-network-visualization {
            margin-top: 13px !important;
            padding-top: 7px;
            padding-bottom: 6px;
          }

          .crm-network-svg {
            height: 94px !important;
          }

          .crm-network-caption {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .crm-network--awake *,
          .crm-network--access-granted *,
          .crm-network--failed *,
          .crm-network--awake .crm-network-connection,
          .crm-network--access-granted .crm-network-connection,
          .crm-network--awake .crm-network-status-dot,
          .crm-network--access-granted .crm-network-status-dot,
          .crm-network--failed .crm-network-status-dot,
          .crm-network--failed .crm-network-access-halo {
            animation: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-field:focus {
            animation: none;
          }

          .login-submit-button--igniting::after {
            animation: none;
          }

          .starmap-led--lit,
          .starmap-rail--scanning .starmap-scan {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
