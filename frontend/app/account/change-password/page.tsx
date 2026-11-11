
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ChangePasswordResponse = {
  status?: string;
  message?: string;
};

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function validateNewPassword(): string | null {
    if (Array.from(newPassword).length < 15) {
      return "Your new password must contain at least 15 characters.";
    }

    if (newPassword.trim().length === 0) {
      return "Your new password cannot consist only of whitespace.";
    }

    if (new TextEncoder().encode(newPassword).length > 72) {
      return "Your new password must not exceed 72 UTF-8 bytes because the application uses bcrypt.";
    }

    if (newPassword !== confirmPassword) {
      return "Your new password and confirmation do not match.";
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || success) {
      return;
    }

    setError("");

    const validationError = validateNewPassword();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/backend/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | ChangePasswordResponse
        | null;

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Your session is invalid or expired. Please sign in again before changing your password.",
          );
        }

        throw new Error(
          data?.message ||
            "Unable to change your password. Please try again.",
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function returnToSignIn() {
    router.replace("/");
    router.refresh();
  }

  function returnToPreviousPage() {
    router.back();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f17] px-4 py-8 text-[#f8fafc] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-blue-600/10 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-20 size-96 rounded-full bg-slate-800/40 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-sm font-extrabold tracking-tight text-blue-300 shadow-lg shadow-blue-500/10">
            HR
          </div>

          <div>
            <p className="text-sm font-bold tracking-tight text-white">
              HRMS Platform
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Account security
            </p>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#182232]/90 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent"
          />

          <div className="p-6 sm:p-8">
            {success ? (
              <div className="py-3">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Password updated
                </p>

                <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
                  Your password has changed
                </h1>

                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Your password was changed successfully. For your security,
                  you must sign in again with your new password.
                </p>

                <button
                  type="button"
                  onClick={returnToSignIn}
                  className="mt-7 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
                >
                  Continue to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                    Account security
                  </p>

                  <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Change password
                  </h1>

                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Update your account password. You will need your current
                    password to verify your identity.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-5"
                >
                  <PasswordField
                    id="current-password"
                    label="Current password"
                    value={currentPassword}
                    onChange={(value) => {
                      setCurrentPassword(value);
                      setError("");
                    }}
                    visible={showCurrentPassword}
                    onToggleVisibility={() =>
                      setShowCurrentPassword((visible) => !visible)
                    }
                    autoComplete="current-password"
                    placeholder="Enter your current password"
                  />

                  <PasswordField
                    id="new-password"
                    label="New password"
                    value={newPassword}
                    onChange={(value) => {
                      setNewPassword(value);
                      setError("");
                    }}
                    visible={showNewPassword}
                    onToggleVisibility={() =>
                      setShowNewPassword((visible) => !visible)
                    }
                    autoComplete="new-password"
                    placeholder="Enter your new password"
                    hint="Use at least 15 characters. Avoid common or easily guessed passwords."
                  />

                  <PasswordField
                    id="confirm-password"
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={(value) => {
                      setConfirmPassword(value);
                      setError("");
                    }}
                    visible={showConfirmPassword}
                    onToggleVisibility={() =>
                      setShowConfirmPassword((visible) => !visible)
                    }
                    autoComplete="new-password"
                    placeholder="Enter your new password again"
                  />

                  <div className="rounded-xl border border-white/[0.07] bg-[#111a28]/80 px-4 py-3">
                    <p className="text-xs leading-5 text-slate-400">
                      Passwords must contain at least 15 characters and fit
                      within bcrypt&apos;s 72-byte UTF-8 limit. The server also
                      checks for common passwords.
                    </p>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-300"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    aria-busy={loading}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
                        />
                        Updating password...
                      </>
                    ) : (
                      "Update password"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={returnToPreviousPage}
                    disabled={loading}
                    className="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.025] px-4 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </form>
              </>
            )}
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Keep your password private. HRMS Platform will never ask you to share
          your password by email.
        </p>
      </div>
    </main>
  );
}

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  hint?: string;
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisibility,
  autoComplete,
  placeholder,
  hint,
}: PasswordFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-medium text-slate-200 sm:text-sm"
      >
        {label}
      </label>

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
          <svg
            viewBox="0 0 24 24"
            className="size-5"
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
        </span>

        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          maxLength={1024}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-white/10 bg-[#111a28] pl-11 pr-20 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
        />

        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-2 inline-flex items-center rounded-lg px-3 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>

      {hint && (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
