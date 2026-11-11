"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { CountrySelect, formatCountryWithFlag, replacePhoneCountryCode } from "../../components/workforce/CountryPhoneFields";

type InvitationPreview = {
  organizationName: string;
  email: string;
  expiresAt: string;
  adminProfile?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    country?: string | null;
    city?: string | null;
  };
};

type AcceptedInvitation = {
  user: {
    id: string;
    email: string;
    status: string;
  };
  employee: {
    phone: string;
    country?: string | null;
    city?: string | null;
  };
  organization: {
    id: string;
    name: string;
    status: string;
  };
};

const STARMAP_LED_COUNT = 42;

function ShieldIcon({ className = "size-5" }: { className?: string }) {
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
      <path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function UserIcon({ className = "size-5" }: { className?: string }) {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhoneIcon({ className = "size-5" }: { className?: string }) {
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function BuildingIcon({ className = "size-5" }: { className?: string }) {
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
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
      <path d="M12 14h.01" />
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

/**
 * Starmap progress rail used by the successful invitation screen.
 * Defining this component prevents the StarmapRail ReferenceError.
 */
type StarmapRailProps = {
  progress: number;
  state?: "default" | "success" | "error";
  status: string;
};

function StarmapRail({
  progress,
  state = "default",
  status,
}: StarmapRailProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  const litLedCount = Math.round(
    (safeProgress / 100) * STARMAP_LED_COUNT
  );

  const ledColor =
    state === "success"
      ? "16, 185, 129"
      : state === "error"
        ? "244, 63, 94"
        : "96, 165, 250";

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.07] bg-[#111a28]/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">
          {status}
        </span>

        <span className="text-xs font-semibold tabular-nums text-slate-400">
          {Math.round(safeProgress)}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={status}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safeProgress)}
        className="flex h-2 items-center gap-[3px] overflow-hidden rounded-full border border-white/[0.06] bg-[#080d15] px-1.5"
      >
        {Array.from({ length: STARMAP_LED_COUNT }, (_, index) => {
          const isLit = index < litLedCount;

          return (
            <span
              key={index}
              className={`h-[3px] min-w-0 flex-1 rounded-full transition-colors duration-300 ${
                isLit
                  ? "opacity-100"
                  : "bg-slate-700/50 opacity-60"
              }`}
              style={
                isLit
                  ? {
                      backgroundColor: `rgba(${ledColor}, 0.95)`,
                      boxShadow: `0 0 7px rgba(${ledColor}, 0.55)`,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function formatExpiry(value: string) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f17] px-6 text-[#f8fafc]">
      <div className="relative overflow-hidden rounded-3xl bg-[#182232]/85 px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.06] backdrop-blur-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent"
        />

        <div className="relative flex items-center gap-4">
          <span
            className="size-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent motion-reduce:animate-none"
            aria-hidden="true"
          />

          <div>
            <p className="text-sm font-semibold text-slate-100">
              Preparing your invitation
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Loading secure account setup...
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AcceptInvitationForm />
    </Suspense>
  );
}

function AcceptInvitationForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const invitationProfileLockedRef = useRef(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitationPreview, setInvitationPreview] =
    useState<InvitationPreview | null>(null);
  const [isLoadingInvitationPreview, setIsLoadingInvitationPreview] =
    useState(true);
  const [invitationPreviewError, setInvitationPreviewError] = useState("");
  const [acceptedInvitation, setAcceptedInvitation] =
    useState<AcceptedInvitation | null>(null);

  useEffect(() => {
    firstNameInputRef.current?.focus({ preventScroll: true });
  }, []);

  // Auto-detect country, city, country code, and calling code.
  useEffect(() => {
    async function detectLocationAndCallingCode() {
      try {
        const response = await fetch("https://ipapi.co/json/");

        if (!response.ok) return;

        const data = await response.json();

        if (data && !invitationProfileLockedRef.current) {
          if (data.country_name) {
            setCountry(data.country_name);
          }

          if (data.city) {
            setCity(data.city);
          }

          if (data.country_calling_code) {
            setPhone((previousPhone) =>
              previousPhone ? previousPhone : `${data.country_calling_code} `
            );
          }
        }
      } catch {
        // Keep manual entry available if location detection fails.
      }
    }

    void detectLocationAndCallingCode();
  }, []);

  // Load and validate the invitation before allowing registration.
  useEffect(() => {
    let isActive = true;

    async function loadInvitationPreview() {
      if (!token) {
        setIsLoadingInvitationPreview(false);
        return;
      }

      setIsLoadingInvitationPreview(true);
      setInvitationPreviewError("");
      invitationProfileLockedRef.current = false;

      try {
        const response = await fetch(
          `/api/backend/invitations/accept?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message ||
              "We could not verify this invitation. Please request a new one."
          );
        }

        if (
          !data.invitation ||
          typeof data.invitation.organizationName !== "string" ||
          typeof data.invitation.email !== "string"
        ) {
          throw new Error(
            "The invitation details could not be loaded. Please request a new invitation."
          );
        }

        if (isActive) {
          const adminProfile = data.invitation.adminProfile && typeof data.invitation.adminProfile === "object"
            ? data.invitation.adminProfile
            : undefined;
          const hasStoredAdminProfile = Boolean(
            typeof adminProfile?.firstName === "string" && adminProfile.firstName.trim() &&
            typeof adminProfile?.lastName === "string" && adminProfile.lastName.trim() &&
            typeof adminProfile?.phone === "string" && adminProfile.phone.trim() &&
            typeof adminProfile?.country === "string" && adminProfile.country.trim() &&
            typeof adminProfile?.city === "string" && adminProfile.city.trim()
          );
          if (hasStoredAdminProfile && adminProfile) {
            invitationProfileLockedRef.current = true;
            setFirstName(adminProfile.firstName!.trim());
            setLastName(adminProfile.lastName!.trim());
            setPhone(adminProfile.phone!.trim());
            setCountry(adminProfile.country!.trim());
            setCity(adminProfile.city!.trim());
          }
          setInvitationPreview({
            organizationName: data.invitation.organizationName,
            email: data.invitation.email,
            expiresAt: String(data.invitation.expiresAt ?? ""),
            adminProfile,
          });
        }
      } catch (previewError) {
        if (isActive) {
          setInvitationPreviewError(
            previewError instanceof Error
              ? previewError.message
              : "We could not verify this invitation. Please request a new one."
          );
        }
      } finally {
        if (isActive) {
          setIsLoadingInvitationPreview(false);
        }
      }
    }

    void loadInvitationPreview();

    return () => {
      isActive = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError(
        "This invitation link is missing its token. Please request a new invitation."
      );
      return;
    }

    if (country.trim().length > 100 || city.trim().length > 100) {
      setError("Country and city must each be 100 characters or fewer.");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");

    if (
      !/^\+?[0-9][0-9\s().-]*[0-9]$/.test(phone.trim()) ||
      phoneDigits.length < 7 ||
      phoneDigits.length > 15
    ) {
      setError(
        "Enter a valid contact number with 7–15 digits including your country calling code."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match. Please check both fields.");
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setError("Password must be between 12 and 128 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/backend/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          country: country.trim(),
          city: city.trim(),
          phone: phone.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          data.message ||
            "Could not accept this invitation. Please try again."
        );
        return;
      }

      setAcceptedInvitation(data as AcceptedInvitation);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Invitation acceptance failed:", err);
      setError(
        "Could not connect to the server. Check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Missing-token screen.
  if (!token) {
    return (
      <main className="relative flex min-h-screen w-full max-w-[100vw] items-center justify-center overflow-x-hidden bg-[#0b0f17] px-4 py-6 text-[#f8fafc] sm:px-6 sm:py-8">
        <div
          className="pointer-events-none absolute left-1/2 -top-8 size-64 -translate-x-1/2 rounded-full bg-rose-600/[0.08] blur-3xl sm:left-[-6rem] sm:top-[-6rem] sm:size-80 sm:translate-x-0"
          aria-hidden="true"
        />

        <section className="relative isolate w-full max-w-lg overflow-hidden rounded-3xl bg-[#182232]/85 p-6 shadow-[0_24px_70px_rgba(244,63,94,0.10)] ring-1 ring-rose-400/15 backdrop-blur-xl sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-rose-300/[0.06] via-rose-300/[0.015] to-transparent"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/45 to-transparent"
          />

          <div className="relative z-10">
            <div className="flex size-16 items-center justify-center rounded-[1.35rem] border border-white/10 bg-blue-500/15 text-lg font-extrabold tracking-tight text-blue-300 shadow-lg shadow-blue-500/10 ring-1 ring-blue-400/10">
              HRMS
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200">
              <span
                className="size-1.5 rounded-full bg-rose-300"
                aria-hidden="true"
              />
              Invitation issue
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#f8fafc] sm:text-3xl">
              Invalid invitation link
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              This link is missing its invitation token. Open the complete link
              from your invitation email or ask your platform administrator for
              a new invitation.
            </p>

            <div className="mt-8 flex items-center gap-3 pt-1 text-xs text-slate-400">
              <ShieldIcon className="size-4 text-blue-300" />
              HRMS Platform <span className="text-slate-600">/</span> Secure
              account setup
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Successful registration screen.
  if (acceptedInvitation) {
    return (
      <main className="relative flex min-h-screen w-full max-w-[100vw] items-center justify-center overflow-x-hidden bg-[#0b0f17] px-4 py-6 text-[#f8fafc] sm:px-6 sm:py-8">
        <div
          className="pointer-events-none absolute left-1/2 -top-8 size-64 -translate-x-1/2 rounded-full bg-emerald-600/[0.09] blur-3xl sm:left-auto sm:right-[-6rem] sm:top-[-6rem] sm:size-80 sm:translate-x-0 lg:size-96"
          aria-hidden="true"
        />

        <section className="relative isolate w-full max-w-2xl overflow-hidden rounded-3xl bg-[#182232]/90 p-6 shadow-[0_24px_70px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/15 backdrop-blur-xl sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-emerald-300/[0.07] via-emerald-300/[0.02] to-transparent"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
          />

          <div className="relative z-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-[1.1rem] border border-white/10 bg-blue-500/15 text-sm font-extrabold tracking-tight text-blue-300 shadow-lg ring-1 ring-blue-400/10">
                  HRMS
                </div>

                <div>
                  <p className="text-sm font-bold tracking-tight text-slate-100">
                    HRMS Platform
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Organization workspace
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                <span
                  className="size-1.5 rounded-full bg-emerald-300"
                  aria-hidden="true"
                />
                Completed
              </span>
            </div>

            <div className="mt-8 flex size-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/10">
              <CheckIcon />
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Setup complete
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#f8fafc] sm:text-4xl">
              Welcome to {acceptedInvitation.organization.name}
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Your Organization Admin account has been created successfully.
              Keep these details handy for your records.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.07] bg-[#111a28]/80 p-5 sm:col-span-2">
                <p className="text-xs font-medium text-slate-400">
                  Organization
                </p>
                <p className="mt-1.5 break-words text-lg font-semibold text-slate-100">
                  {acceptedInvitation.organization.name}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#111a28]/80 p-5">
                <p className="text-xs font-medium text-slate-400">
                  Account email
                </p>
                <p className="mt-1.5 break-all text-sm font-medium text-slate-200">
                  {acceptedInvitation.user.email}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#111a28]/80 p-5">
                <p className="text-xs font-medium text-slate-400">
                  Contact number
                </p>
                <p className="mt-1.5 break-words text-sm font-medium text-slate-200">
                  {acceptedInvitation.employee?.phone || phone}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#111a28]/80 p-5">
                <p className="text-xs font-medium text-slate-400">
                  City
                </p>
                <p className="mt-1.5 break-words text-sm font-medium text-slate-200">
                  {acceptedInvitation.employee?.city || city || "Not provided"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#111a28]/80 p-5">
                <p className="text-xs font-medium text-slate-400">
                  Country
                </p>
                <p className="mt-1.5 break-words text-sm font-medium text-slate-200">
                  {formatCountryWithFlag(acceptedInvitation.employee?.country || country)}
                </p>
              </div>
            </div>

            <StarmapRail
              progress={100}
              state="success"
              status="Setup complete"
            />

            <div className="mt-5 flex gap-3 rounded-2xl bg-blue-500/[0.08] p-4 ring-1 ring-inset ring-blue-400/10">
              <ShieldIcon className="mt-0.5 size-5 shrink-0 text-blue-300" />
              <div>
                <p className="text-sm font-semibold text-blue-100">
                  You’re ready to sign in
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Use your account email and the password you created to access
                  your organization workspace.
                </p>
              </div>
            </div>

            <footer className="mt-8 pt-1 text-xs text-slate-500">
              © {new Date().getFullYear()} HRMS Platform
            </footer>
          </div>
        </section>
      </main>
    );
  }

  const expiryLabel = invitationPreview
    ? formatExpiry(invitationPreview.expiresAt)
    : "";
  const adminProfileIsPredefined = Boolean(
    invitationPreview?.adminProfile?.firstName &&
    invitationPreview?.adminProfile?.lastName &&
    invitationPreview?.adminProfile?.phone &&
    invitationPreview?.adminProfile?.country &&
    invitationPreview?.adminProfile?.city
  );

  const phoneDigits = phone.replace(/\D/g, "");

  const phoneLooksValid =
    /^\+?[0-9][0-9\s().-]*[0-9]$/.test(phone.trim()) &&
    phoneDigits.length >= 7 &&
    phoneDigits.length <= 15;

  let filledFieldsCount = 0;

  if (firstName.trim().length >= 2) filledFieldsCount++;
  if (lastName.trim().length >= 1) filledFieldsCount++;
  if (country.trim().length >= 2) filledFieldsCount++;
  if (city.trim().length >= 2) filledFieldsCount++;
  if (phoneLooksValid) filledFieldsCount++;
  if (password.length >= 12) filledFieldsCount++;

  if (confirmPassword.length > 0 && password === confirmPassword) {
    filledFieldsCount++;
  }

  const progressFraction = isSubmitting ? 1 : filledFieldsCount / 7;
  const litLedCount = Math.round(progressFraction * STARMAP_LED_COUNT);

  const visualState = error
    ? "error"
    : isSubmitting
      ? "success"
      : "default";

  const ledRgb =
    visualState === "error"
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
    error
      ? "via-rose-400/65"
      : isSubmitting
        ? "via-emerald-400/65"
        : "via-blue-400/60";

  const cardGlow =
    error
      ? "shadow-[0_24px_70px_rgba(244,63,94,0.16)] ring-1 ring-rose-400/15"
      : isSubmitting
        ? "shadow-[0_24px_70px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/15"
        : "shadow-[0_24px_70px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.06]";

  const statusPill =
    error
      ? "border-rose-400/20 bg-rose-500/[0.08] text-rose-200"
      : isSubmitting
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

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-16">
        {/* Brand and invitation information */}
        <div className="w-full text-center sm:w-1/2 sm:max-w-md sm:text-left">
          <div className="relative mx-auto mb-4 flex size-16 items-center justify-center rounded-[1.35rem] border border-white/10 bg-blue-500/15 text-lg font-extrabold tracking-tight text-blue-300 shadow-lg shadow-blue-500/10 ring-1 ring-blue-400/10 sm:mx-0">
            <span
              className="absolute inset-1 rounded-[1rem] border border-white/[0.04]"
              aria-hidden="true"
            />
            <span className="relative">HRMS</span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300">
            HRMS Platform
          </p>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#f8fafc] sm:text-4xl">
            {invitationPreview ? (
              <>
                Joining{" "}
                <span className="text-blue-300">
                  {invitationPreview.organizationName}
                </span>
              </>
            ) : (
              "Workspace invitation"
            )}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
            Set up your administrator account to join your organization’s secure
            collaborative workspace.
          </p>

          <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-[#182232]/50 p-4 backdrop-blur-xl">
            {isLoadingInvitationPreview ? (
              <p className="text-xs text-slate-400">
                Verifying invitation token...
              </p>
            ) : invitationPreview ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Assigned Email Account
                </p>

                <p className="text-sm font-medium text-slate-100">
                  {invitationPreview.email}
                </p>

                {expiryLabel && (
                  <p className="mt-1 border-t border-white/10 pt-2 text-[11px] text-slate-400">
                    Token Expiration: {expiryLabel}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-rose-300">
                {invitationPreviewError || "Could not load preview details."}
              </p>
            )}
          </div>
        </div>

        {/* Invitation form */}
        <div className="w-full max-w-md shrink-0">
          <div
            style={{ "--led-rgb": ledRgb } as CSSProperties}
            className={`relative isolate w-full overflow-hidden rounded-3xl bg-[#182232]/85 backdrop-blur-xl transition-[box-shadow] duration-500 ${cardGlow}`}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3 bg-gradient-to-r from-blue-300/[0.08] via-blue-300/[0.025] to-transparent"
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
              <div className="mb-5">
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-300 ${statusPill}`}
                  role="status"
                >
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400/50" />
                    <span className="relative inline-flex size-2 rounded-full bg-blue-400" />
                  </span>
                  {isSubmitting ? "Creating account..." : "Secure account setup"}
                </div>
              </div>

              {adminProfileIsPredefined && (
                <p className="rounded-xl border border-blue-400/15 bg-blue-500/[0.07] px-3.5 py-3 text-xs leading-5 text-blue-100/80">
                  Your administrator profile details were provided by the platform administrator and are saved with this invitation. Contact them if any detail needs correction.
                </p>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="firstName"
                      className="mb-1.5 block text-xs font-medium text-slate-200"
                    >
                      First name
                    </label>

                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                        <UserIcon className="size-4" />
                      </span>

                      <input
                        ref={firstNameInputRef}
                        id="firstName"
                        name="firstName"
                        type="text"
                        autoComplete="given-name"
                        required
                        readOnly={adminProfileIsPredefined}
                        value={firstName}
                        onChange={(event) => {
                          setFirstName(event.target.value);
                          setError("");
                        }}
                        placeholder="Amina"
                        className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] pl-10 pr-3.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="lastName"
                      className="mb-1.5 block text-xs font-medium text-slate-200"
                    >
                      Last name
                    </label>

                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                        <UserIcon className="size-4" />
                      </span>

                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        autoComplete="family-name"
                        required
                        readOnly={adminProfileIsPredefined}
                        value={lastName}
                        onChange={(event) => {
                          setLastName(event.target.value);
                          setError("");
                        }}
                        placeholder="Uwase"
                        className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] pl-10 pr-3.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="country"
                        className="block text-xs font-medium text-slate-200"
                      >
                        Country
                      </label>
                      <span className="text-[9px] text-blue-300">Auto</span>
                    </div>

                    <CountrySelect
                      id="country"
                      value={country}
                      required
                      disabled={adminProfileIsPredefined}
                      onChange={(nextCountry) => {
                        setPhone((previousPhone) => replacePhoneCountryCode(previousPhone, country, nextCountry));
                        setCountry(nextCountry);
                        setError("");
                      }}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] px-3.5 text-xs text-slate-100 outline-none hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="city"
                        className="block text-xs font-medium text-slate-200"
                      >
                        City
                      </label>
                      <span className="text-[9px] text-blue-300">Auto</span>
                    </div>

                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                        <BuildingIcon className="size-4" />
                      </span>

                      <input
                        id="city"
                        name="city"
                        type="text"
                        autoComplete="address-level2"
                        required
                        maxLength={100}
                        readOnly={adminProfileIsPredefined}
                        value={city}
                        onChange={(event) => {
                          setCity(event.target.value);
                          setError("");
                        }}
                        placeholder="City"
                        className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] pl-10 pr-3.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="phone"
                      className="block text-xs font-medium text-slate-200"
                    >
                      Contact number
                    </label>
                    <span className="text-[9px] text-blue-300">
                      Calling code auto-prefilled
                    </span>
                  </div>

                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                      <PhoneIcon className="size-4" />
                    </span>

                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      readOnly={adminProfileIsPredefined}
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setError("");
                      }}
                      placeholder="+250 788 000 000"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] pl-10 pr-3.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-xs font-medium text-slate-200"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                      <LockIcon className="size-4" />
                    </span>

                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="At least 12 characters"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] pl-10 pr-12 text-xs text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                    />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-lg px-2.5 text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1.5 block text-xs font-medium text-slate-200"
                  >
                    Confirm password
                  </label>

                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                      <LockIcon className="size-4" />
                    </span>

                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="Retype password"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#111a28] pl-10 pr-12 text-xs text-slate-100 outline-none placeholder:text-slate-500 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
                    />
                    <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showConfirmPassword} className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-lg px-2.5 text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50">{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300"
                  >
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    isLoadingInvitationPreview ||
                    !invitationPreview
                  }
                  aria-busy={isSubmitting}
                  className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition duration-200 hover:bg-blue-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/35 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSubmitting ? "login-submit-button--igniting" : ""
                  }`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating account...
                    </span>
                  ) : (
                    <span>Create admin account</span>
                  )}
                </button>

                <div className="flex items-center justify-center gap-1.5 pt-0.5 text-xs text-slate-500">
                  <LockIcon className="size-3.5" />
                  <span>Secure encrypted registration session.</span>
                </div>
              </form>
            </div>

            {/* Starmap rail */}
            <div
              aria-hidden="true"
              className={`starmap-rail pointer-events-none absolute inset-x-6 bottom-3 z-20 flex h-[11px] items-center gap-[3px] overflow-hidden rounded-full px-1.5 ${
                isSubmitting ? "starmap-rail--scanning" : ""
              }`}
              style={{ "--led-rgb": ledRgb } as CSSProperties}
            >
              <span className="starmap-scan" />

              {Array.from({ length: STARMAP_LED_COUNT }, (_, index) => {
                const isLit = index < litLedCount;
                const isWaypoint = index % 7 === 0;

                return (
                  <span
                    key={index}
                    className={`starmap-led${
                      isWaypoint ? " starmap-led--waypoint" : ""
                    }${isLit ? " starmap-led--lit" : ""}`}
                    style={{ "--led-rgb": ledRgb } as CSSProperties}
                  />
                );
              })}
            </div>
          </div>
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

        @keyframes starmap-led-wave {
          0% {
            opacity: 0.25;
            transform: scaleY(0.65);
          }

          48% {
            opacity: 1;
            transform: scaleY(1.25);
          }

          100% {
            opacity: 0.98;
            transform: scaleY(1);
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
      `}</style>
    </main>
  );
}