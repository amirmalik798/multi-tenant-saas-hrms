"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

type InvitationRole =
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

type InvitationPreview = {
  email: string;
  employeeCode: string;
  employeeName: string;
  role: InvitationRole;
  organizationName: string;
  expiresAt: string;
};

type PageState =
  | "loading"
  | "ready"
  | "failed"
  | "submitting"
  | "accepted";

const ALLOWED_INVITATION_ROLES = new Set<string>([
  "HR_MANAGER",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
]);

const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_CHARACTERS = 128;
const MAX_PASSWORD_UTF8_BYTES = 72;

const INVALID_INVITATION_MESSAGE =
  "This activation link is invalid or no longer available.";

const UNSUPPORTED_ROLE_MESSAGE =
  "This invitation uses a role that is no longer supported. Ask your organization administrator to issue a new invitation.";

const MALFORMED_INVITATION_MESSAGE =
  "The invitation information could not be validated. Ask your organization administrator to review the invitation.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getResponseMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.message === "string" &&
    value.message.trim().length > 0
  ) {
    return value.message;
  }

  return undefined;
}

function isInvitationRole(value: unknown): value is InvitationRole {
  return (
    typeof value === "string" &&
    ALLOWED_INVITATION_ROLES.has(value)
  );
}

function validateInvitationPreview(
  value: unknown
): InvitationPreview {
  if (!isRecord(value)) {
    throw new Error(MALFORMED_INVITATION_MESSAGE);
  }

  if (
    typeof value.role === "string" &&
    !isInvitationRole(value.role)
  ) {
    throw new Error(UNSUPPORTED_ROLE_MESSAGE);
  }

  if (!isInvitationRole(value.role)) {
    throw new Error(MALFORMED_INVITATION_MESSAGE);
  }

  const requiredNonEmptyStrings = [
    value.email,
    value.employeeCode,
    value.organizationName,
    value.expiresAt,
  ];

  if (
    !requiredNonEmptyStrings.every(
      (field) =>
        typeof field === "string" &&
        field.trim().length > 0
    ) ||
    typeof value.employeeName !== "string"
  ) {
    throw new Error(MALFORMED_INVITATION_MESSAGE);
  }

  if (Number.isNaN(Date.parse(value.expiresAt as string))) {
    throw new Error(MALFORMED_INVITATION_MESSAGE);
  }

  return {
    email: value.email as string,
    employeeCode: value.employeeCode as string,
    employeeName: value.employeeName,
    role: value.role,
    organizationName: value.organizationName as string,
    expiresAt: value.expiresAt as string,
  };
}

function getPasswordCharacterCount(value: string): number {
  return Array.from(value).length;
}

function getPasswordUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function getPasswordValidationError(
  value: string
): string | null {
  const characterCount = getPasswordCharacterCount(value);

  if (characterCount < MIN_PASSWORD_CHARACTERS) {
    return `Choose a password with at least ${MIN_PASSWORD_CHARACTERS} characters.`;
  }

  if (characterCount > MAX_PASSWORD_CHARACTERS) {
    return `The password must not exceed ${MAX_PASSWORD_CHARACTERS} characters.`;
  }

  const byteCount = getPasswordUtf8ByteLength(value);

  if (byteCount > MAX_PASSWORD_UTF8_BYTES) {
    return `The password must not exceed ${MAX_PASSWORD_UTF8_BYTES} UTF-8 bytes. Try a shorter password or use fewer multi-byte characters.`;
  }

  return null;
}

function formatExpiry(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "the listed expiration time";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function EmployeeInvitationAcceptance() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [pageState, setPageState] =
    useState<PageState>("loading");

  const [invitation, setInvitation] =
    useState<InvitationPreview | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");

  const passwordValidationError = password
    ? getPasswordValidationError(password)
    : null;

  const passwordsMatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  useEffect(() => {
    let active = true;

    async function verifyInvitation() {
      if (!token) {
        if (active) {
          setError(
            "This activation link is missing its invitation token. Ask your organization administrator for a new link."
          );

          setPageState("failed");
        }

        return;
      }

      setPageState("loading");
      setError("");
      setInvitation(null);

      try {
        const response = await fetch(
          `/api/backend/employee-invitations/accept?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          }
        );

        const data: unknown = await response
          .json()
          .catch(() => null);

        if (!response.ok) {
          throw new Error(
            getResponseMessage(data) ||
              INVALID_INVITATION_MESSAGE
          );
        }

        if (!isRecord(data) || !("invitation" in data)) {
          throw new Error(MALFORMED_INVITATION_MESSAGE);
        }

        const verifiedInvitation =
          validateInvitationPreview(data.invitation);

        if (active) {
          setInvitation(verifiedInvitation);
          setPageState("ready");
        }
      } catch (verificationError) {
        if (active) {
          setError(
            verificationError instanceof Error
              ? verificationError.message
              : "Unable to verify this activation link."
          );

          setPageState("failed");
        }
      }
    }

    void verifyInvitation();

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!token || pageState === "submitting") {
      return;
    }

    setError("");

    const passwordError =
      getPasswordValidationError(password);

    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setPageState("submitting");

    try {
      const response = await fetch(
        "/api/backend/employee-invitations/accept",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          getResponseMessage(data) ||
            "Unable to activate this account. Please request a new invitation if needed."
        );
      }

      setPassword("");
      setConfirmPassword("");
      setError("");
      setPageState("accepted");
    } catch (acceptanceError) {
      setError(
        acceptanceError instanceof Error
          ? acceptanceError.message
          : "Unable to activate this account."
      );

      setPageState("ready");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f17] px-4 py-10 text-[#f8fafc] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-emerald-600/[0.07] blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <section className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-white/[0.08] bg-[#182232]/90 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <div className="h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />

        <div className="p-6 sm:p-9">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 text-sm font-extrabold tracking-tight text-emerald-200">
              HR
            </span>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                HRMS Platform
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Employee account activation
              </p>
            </div>
          </div>

          {pageState === "loading" && (
            <div
              className="py-12 text-center"
              role="status"
            >
              <span className="mx-auto block size-3 animate-pulse rounded-full bg-[#75c7ff] shadow-[0_0_20px_rgba(117,199,255,0.7)]" />

              <h1 className="mt-5 text-xl font-bold">
                Verifying your invitation
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                Checking the invitation, organization, employee
                record, and expiration.
              </p>
            </div>
          )}

          {pageState === "failed" && (
            <div className="pt-8">
              <div className="flex size-12 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-xl font-bold text-rose-200">
                !
              </div>

              <h1 className="mt-5 text-2xl font-bold">
                Invitation unavailable
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                This link could not be verified. It may have
                expired, already been used, or the employee or
                organization may no longer be active.
              </p>

              <div
                role="alert"
                className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm leading-6 text-rose-100"
              >
                {error ||
                  "Ask your organization administrator to review the invitation and issue another one if appropriate."}
              </div>

              <Link
                href="/"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#34465d] bg-[#0f1724] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.06]"
              >
                Return to sign in
              </Link>
            </div>
          )}

          {(pageState === "ready" ||
            pageState === "submitting") &&
            invitation && (
              <div className="pt-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                  You&apos;re invited
                </p>

                <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  Set up your account
                </h1>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Create a password to activate your employee
                  account and access your organization&apos;s HRMS
                  workspace.
                </p>

                <div className="mt-6 space-y-3 rounded-2xl border border-[#29384b] bg-[#0f1724]/90 p-4 sm:p-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Organization
                    </p>

                    <p className="mt-1 text-sm font-bold text-white">
                      {invitation.organizationName}
                    </p>
                  </div>

                  <div className="grid gap-3 border-t border-[#29384b] pt-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Employee
                      </p>

                      <p className="mt-1 text-sm font-semibold text-white">
                        {invitation.employeeName ||
                          invitation.employeeCode}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Assigned role
                      </p>

                      <p className="mt-1 text-sm font-semibold text-white">
                        {invitation.role.replaceAll("_", " ")}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[#29384b] pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Sign-in email
                    </p>

                    <p className="mt-1 break-all text-sm font-semibold text-white">
                      {invitation.email}
                    </p>
                  </div>

                  <p className="border-t border-[#29384b] pt-3 text-xs leading-5 text-slate-400">
                    Invitation expires{" "}
                    {formatExpiry(invitation.expiresAt)}.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="mt-6 space-y-4"
                >
                  <div>
                    <label
                      htmlFor="employee-password"
                      className="mb-2 block text-sm font-semibold text-slate-200"
                    >
                      Create password
                    </label>

                    <div className="relative">
                      <input
                        id="employee-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={MIN_PASSWORD_CHARACTERS}
                        maxLength={MAX_PASSWORD_CHARACTERS}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={pageState === "submitting"}
                        placeholder="At least 12 characters"
                        aria-invalid={Boolean(passwordValidationError)}
                        aria-describedby="employee-password-help"
                        className="h-12 w-full rounded-xl border border-[#34465d] bg-[#0b0f17] px-4 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/15 disabled:opacity-60"
                      />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={pageState === "submitting"} className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-lg px-2.5 text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/50 disabled:opacity-50">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>

                    <p
                      id="employee-password-help"
                      className={`mt-2 text-xs ${
                        passwordValidationError
                          ? "text-rose-300"
                          : "text-slate-400"
                      }`}
                    >
                      {passwordValidationError ||
                        "Use 12–128 characters and no more than 72 UTF-8 bytes. Avoid reusing another account password."}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="employee-confirm-password"
                      className="mb-2 block text-sm font-semibold text-slate-200"
                    >
                      Confirm password
                    </label>

                    <div className="relative">
                      <input
                        id="employee-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={MIN_PASSWORD_CHARACTERS}
                        maxLength={MAX_PASSWORD_CHARACTERS}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={pageState === "submitting"}
                        placeholder="Enter the same password again"
                        aria-invalid={Boolean(confirmPassword && password !== confirmPassword)}
                        aria-describedby="employee-confirm-password-help"
                        className="h-12 w-full rounded-xl border border-[#34465d] bg-[#0b0f17] px-4 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/15 disabled:opacity-60"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showConfirmPassword} disabled={pageState === "submitting"} className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-lg px-2.5 text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/50 disabled:opacity-50">{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>

                    <p
                      id="employee-confirm-password-help"
                      className={`mt-2 text-xs ${
                        confirmPassword &&
                        password !== confirmPassword
                          ? "text-rose-300"
                          : "text-slate-400"
                      }`}
                    >
                      {confirmPassword &&
                      password !== confirmPassword
                        ? "The passwords do not match."
                        : "Enter the same password in both fields."}
                    </p>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3.5 text-sm leading-5 text-rose-200"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      pageState === "submitting" ||
                      Boolean(passwordValidationError) ||
                      !passwordsMatch
                    }
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-4 text-sm font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pageState === "submitting"
                      ? "Activating account…"
                      : "Activate employee account"}
                  </button>
                </form>
              </div>
            )}

          {pageState === "accepted" && (
            <div className="pt-9 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                <svg
                  viewBox="0 0 24 24"
                  className="size-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>

              <h1 className="mt-5 text-2xl font-bold">
                Account activated
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                Your password is set and your employee account is
                ready. Sign in with the email address from the
                invitation and the password you just created.
              </p>

              <Link
                href="/"
                className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#75c7ff] px-4 text-sm font-extrabold text-[#07111d] transition hover:bg-[#a0dcff]"
              >
                Continue to sign in
              </Link>
            </div>
          )}

          <footer className="mt-9 border-t border-[#29384b] pt-4 text-center text-[11px] text-slate-500">
            © {new Date().getFullYear()} HRMS Platform
          </footer>
        </div>
      </section>
    </main>
  );
}

export default function EmployeeInvitationAcceptancePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-4 text-slate-200">
          <p
            role="status"
            className="rounded-xl border border-[#29384b] bg-[#111a28] px-5 py-4 text-sm"
          >
            Loading invitation…
          </p>
        </main>
      }
    >
      <EmployeeInvitationAcceptance />
    </Suspense>
  );
}