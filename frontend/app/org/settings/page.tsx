"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
  useOrganizationAdminAutoRefresh,
} from "../../components/org-admin/OrganizationAdminChrome";
import { COUNTRY_OPTIONS, CountrySelect } from "../../components/workforce/CountryPhoneFields";

type OrgAdminUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type OrganizationSettings = {
  organizationId: string;
  timeZone: string;
  locale: string;
  currencyCode: string | null;
  dateFormat: string;
  weekStartsOn: number;
  workingDays: number[];
  countryCode: string | null;
  legalEntityName: string | null;
  legalEntityCountryCode: string | null;
  createdAt?: string;
  updatedAt?: string;
  setupCompletedAt?: string | null;
};

type OrganizationProfile = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  country: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type SettingsResponse = {
  status?: string;
  message?: string;
  settings?: OrganizationSettings;
  organization?: OrganizationProfile;
};

type SettingsForm = {
  timeZone: string;
  locale: string;
  currencyCode: string;
  dateFormat: string;
  weekStartsOn: number;
  workingDays: number[];
  countryCode: string;
  legalEntityName: string;
  legalEntityCountryCode: string;
};

const DEFAULT_FORM: SettingsForm = {
  timeZone: "UTC",
  locale: "en",
  currencyCode: "",
  dateFormat: "YYYY-MM-DD",
  weekStartsOn: 1,
  workingDays: [1, 2, 3, 4, 5],
  countryCode: "",
  legalEntityName: "",
  legalEntityCountryCode: "",
};

const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
] as const;

const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD.MM.YYYY"] as const;

function getCountryFlagEmoji(code: string): string {
  return String.fromCodePoint(...code.split("").map((character) => 127397 + character.charCodeAt(0)));
}

function getCountryCode(countryName: string | null, countryCode: string | null): string | null {
  const normalizedCode = countryCode?.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalizedCode || "") && COUNTRY_OPTIONS.some((country) => country.code === normalizedCode)) {
    return normalizedCode!;
  }

  const normalizedName = (countryName || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  if (!normalizedName) return null;
  const match = COUNTRY_OPTIONS.find((country) =>
    country.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase() === normalizedName
  );
  if (match) return match.code;

  const aliases: Record<string, string> = {
    "rwanda": "RW",
    "united states of america": "US",
    "usa": "US",
    "uk": "GB",
    "united kingdom": "GB",
    "south korea": "KR",
    "north korea": "KP",
    "ivory coast": "CI",
    "cote d'ivoire": "CI",
    "côte d’ivoire": "CI",
    "democratic republic of the congo": "CD",
    "dr congo": "CD",
    "congo": "CG",
    "tanzania": "TZ",
    "the gambia": "GM",
    "viet nam": "VN",
    "cape verde": "CV",
    "eswatini": "SZ",
    "swaziland": "SZ",
    "czech republic": "CZ",
    "moldova": "MD",
    "palestine": "PS",
    "taiwan": "TW",
  };
  return aliases[normalizedName] || null;
}

const inputClassName =
  "mt-2 block w-full rounded-xl border border-[#29384b] bg-[#0b111b] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20 disabled:cursor-not-allowed disabled:opacity-60";

function SettingsGlyph({ kind }: { kind: "globe" | "calendar" | "building" | "check" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" {...common}>
      {kind === "globe" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      )}
      {kind === "calendar" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </>
      )}
      {kind === "building" && (
        <>
          <rect x="4" y="2.5" width="16" height="19" rx="2" />
          <path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" />
        </>
      )}
      {kind === "check" && <path d="m5 12 4 4L19 6" />}
    </svg>
  );
}

function SettingsCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: "globe" | "calendar" | "building";
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#29384b] bg-[#141f2e]/85 shadow-[0_12px_38px_rgba(0,0,0,0.16)] backdrop-blur-xl">
      <header className="flex items-start gap-3 border-b border-[#29384b] px-5 py-5 sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/25 bg-[#75c7ff]/10 text-[#9bd8ff]">
          <SettingsGlyph kind={icon} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        </div>
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile | null>(null);
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [completingSetup, setCompletingSetup] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const settingsRequestIdRef = useRef(0);
  const hasLoadedSettingsRef = useRef(false);
  const hasUnsavedSettingsRef = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoSuccess, setLogoSuccess] = useState("");

  async function uploadOrganizationLogo(file?: File) {
    if (!file || uploadingLogo) return;
    setLogoError("");
    setLogoSuccess("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setLogoError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 100 * 1024) {
      setLogoError("The organization logo must not exceed 100 KB.");
      return;
    }
    const body = new FormData();
    body.append("logo", file);
    setUploadingLogo(true);
    try {
      const response = await fetch("/api/backend/org/logo", {
        method: "PUT",
        credentials: "same-origin",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Logo upload failed.");
      setLogoVersion(Date.now());
      window.dispatchEvent(new Event("hrms:organization-logo-updated"));
      setLogoSuccess("Organization logo updated successfully.");
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : "Logo upload failed.");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  // Controls the shared command palette on the Settings page.
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    const requestId = ++settingsRequestIdRef.current;
    if (!hasLoadedSettingsRef.current) setSettingsLoading(true);
    setLoadError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/backend/org/settings", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as SettingsResponse | null;
      if (requestId !== settingsRequestIdRef.current) return;

      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data?.message || "Unable to load organization settings.");
      }
      if (
        !data?.settings ||
        typeof data.settings.organizationId !== "string" ||
        !data.organization ||
        typeof data.organization.id !== "string"
      ) {
        throw new Error("The organization profile and settings response was incomplete.");
      }

      const loaded = data.settings;
      if (hasLoadedSettingsRef.current && hasUnsavedSettingsRef.current) return;
      setOrganizationProfile(data.organization);
      setSettings(loaded);
      hasLoadedSettingsRef.current = true;
      setForm({
        timeZone: loaded.timeZone || "UTC",
        locale: loaded.locale || "en",
        currencyCode: loaded.currencyCode || "",
        dateFormat: loaded.dateFormat || "YYYY-MM-DD",
        weekStartsOn: Number(loaded.weekStartsOn) || 1,
        workingDays: Array.isArray(loaded.workingDays)
          ? loaded.workingDays.map(Number)
          : [1, 2, 3, 4, 5],
        countryCode: loaded.countryCode || "",
        legalEntityName: loaded.legalEntityName || "",
        legalEntityCountryCode: loaded.legalEntityCountryCode || "",
      });
    } catch (error) {
      if (requestId === settingsRequestIdRef.current) {
        setLoadError(error instanceof Error ? error.message : "Unable to load organization settings.");
      }
    } finally {
      if (requestId === settingsRequestIdRef.current) setSettingsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (
          !response.ok ||
          data?.authenticated !== true ||
          data?.user?.role !== "ORGANIZATION_ADMIN" ||
          !data?.user?.organizationId
        ) {
          router.replace("/");
          return;
        }

        if (active) setUser(data.user as OrgAdminUser);
      } catch (error) {
        console.error("Organization settings session check failed:", error);
        router.replace("/");
      } finally {
        if (active) setCheckingSession(false);
      }
    }

    void verifySession();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void loadSettings();
    return () => {
      // Invalidate an in-flight load when the page unmounts or a newer reload starts.
      settingsRequestIdRef.current += 1;
    };
  }, [user, loadSettings, reloadKey]);

  function updateForm<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveError("");
    setSuccessMessage("");
  }

  function toggleWorkingDay(day: number) {
    const exists = form.workingDays.includes(day);

    if (exists && form.workingDays.length === 1) {
      setSaveError("Select at least one working day.");
      return;
    }

    updateForm(
      "workingDays",
      exists
        ? form.workingDays.filter((value) => value !== day)
        : [...form.workingDays, day].sort((a, b) => a - b),
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const timeZone = form.timeZone.trim();
    const locale = form.locale.trim();
    const currencyCode = form.currencyCode.trim().toUpperCase();
    const countryCode = form.countryCode.trim().toUpperCase();
    const legalEntityCountryCode = form.legalEntityCountryCode.trim().toUpperCase();

    if (!timeZone) {
      setSaveError("Enter a time zone, such as Africa/Kigali.");
      return;
    }
    if (!locale) {
      setSaveError("Enter a locale, such as en or en-GB.");
      return;
    }
    if (currencyCode && !/^[A-Z]{3}$/.test(currencyCode)) {
      setSaveError("Currency must be a three-letter code, such as RWF or USD.");
      return;
    }
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      setSaveError("Country code must contain two letters, such as RW.");
      return;
    }
    if (legalEntityCountryCode && !/^[A-Z]{2}$/.test(legalEntityCountryCode)) {
      setSaveError("Legal entity country code must contain two letters, such as RW.");
      return;
    }
    if (form.workingDays.length === 0) {
      setSaveError("Select at least one working day.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSuccessMessage("");

    const payload = {
      timeZone,
      locale,
      currencyCode: currencyCode || null,
      dateFormat: form.dateFormat,
      weekStartsOn: Number(form.weekStartsOn),
      workingDays: [...form.workingDays].sort((a, b) => a - b),
      countryCode: countryCode || null,
      legalEntityName: form.legalEntityName.trim() || null,
      legalEntityCountryCode: legalEntityCountryCode || null,
    };

    try {
      const response = await fetch("/api/backend/org/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as SettingsResponse | null;

      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data?.message || "Unable to save organization settings.");
      }
      if (!data?.settings) {
        throw new Error("The save response did not include the updated settings.");
      }

      setSettings(data.settings);
      setForm({
        timeZone: data.settings.timeZone || "UTC",
        locale: data.settings.locale || "en",
        currencyCode: data.settings.currencyCode || "",
        dateFormat: data.settings.dateFormat || "YYYY-MM-DD",
        weekStartsOn: Number(data.settings.weekStartsOn) || 1,
        workingDays: Array.isArray(data.settings.workingDays)
          ? data.settings.workingDays.map(Number)
          : [1, 2, 3, 4, 5],
        countryCode: data.settings.countryCode || "",
        legalEntityName: data.settings.legalEntityName || "",
        legalEntityCountryCode: data.settings.legalEntityCountryCode || "",
      });
      setSuccessMessage(data.message || "Organization settings saved successfully.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save organization settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteSetup() {
    if (completingSetup || saving || hasChanges || !settings) {
      if (hasChanges) {
        setSetupError("Save your changes before completing organization setup.");
      }
      return;
    }

    setSetupError("");
    setCompletingSetup(true);
    try {
      const response = await fetch("/api/backend/org/settings/complete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReview: true }),
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data?.message || "Unable to complete organization setup.");
      }

      setSettings((current) =>
        current
          ? { ...current, setupCompletedAt: data?.setupCompletedAt ?? new Date().toISOString() }
          : current,
      );
      setSuccessMessage(data?.message || "Organization setup reviewed and completed.");
    } catch (error) {
      setSetupError(
        error instanceof Error ? error.message : "Unable to complete organization setup.",
      );
    } finally {
      setCompletingSetup(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/backend/org/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.message || "Logout failed.");

      router.replace("/");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  const selectedWorkingDays = new Set(form.workingDays);

  const hasChanges = settings
    ? (
        form.timeZone !== settings.timeZone ||
        form.locale !== settings.locale ||
        form.currencyCode !== (settings.currencyCode || "") ||
        form.dateFormat !== settings.dateFormat ||
        Number(form.weekStartsOn) !== settings.weekStartsOn ||
        form.workingDays.length !== settings.workingDays.length ||
        !form.workingDays.every((day) => settings.workingDays.includes(day)) ||
        form.countryCode !== (settings.countryCode || "") ||
        form.legalEntityName !== (settings.legalEntityName || "") ||
        form.legalEntityCountryCode !== (settings.legalEntityCountryCode || "")
      )
    : false;

  hasUnsavedSettingsRef.current = hasChanges;

  // This hook must run on every render, including while the session/loading
  // states are displayed. Keeping it before conditional returns preserves
  // React's hook order when the session resolves.
  useOrganizationAdminAutoRefresh(
    () => setReloadKey((current) => current + 1),
    {
      enabled: Boolean(user),
      shouldRefresh: () => !settingsLoading && !saving && !completingSetup && !hasChanges,
    },
  );

  if (checkingSession) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f17] px-6 text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,132,196,0.14),transparent_44%)]" />
        <div className="relative flex items-center gap-3 rounded-2xl border border-[#29384b] bg-[#111a28]/90 px-6 py-5 shadow-2xl backdrop-blur-xl">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#75c7ff] shadow-[0_0_14px_rgba(117,199,255,0.6)]" />
          <p className="text-sm font-medium text-slate-200">Verifying your organization session…</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <div
      className="org-admin-workspace relative min-h-screen bg-[#0b0f17] font-sans text-[#f8fafc] scheme-dark selection:bg-[#75c7ff]/25 selection:text-white"
      style={{
        backgroundImage:
          "radial-gradient(circle at 74% 0%, rgba(36, 105, 160, 0.10), transparent 34%), linear-gradient(rgba(117, 199, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 199, 255, 0.025) 1px, transparent 1px)",
        backgroundSize: "auto, 42px 42px, 42px 42px",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(35,91,130,0.07),transparent_42%)]" />

      <OrganizationAdminSidebar activePage="settings" />

      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="settings"
          organizationName={user.organizationName}
          loggingOut={loggingOut}
          onLogout={() => void handleLogout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
        />

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {logoutError && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              <div className="flex items-start justify-between gap-4">
                <p>{logoutError}</p>
                <button
                  type="button"
                  onClick={() => setLogoutError("")}
                  className="text-xs font-bold underline underline-offset-4"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#29384b] bg-[#141f2e]/80 px-5 py-5 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/30 bg-[#75c7ff]/10 text-sm font-extrabold text-[#75c7ff]">
                {user.organizationName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                    Organization Profile &amp; Settings
                  </h1>
                  <span className="rounded-md border border-[#75c7ff]/20 bg-[#75c7ff]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#bfe5ff]">
                    Tenant configuration
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">

              <button
                type="submit"
                form="organization-settings-form"
                disabled={settingsLoading || saving || !settings || !hasChanges}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#75c7ff]/40 bg-[#75c7ff] px-4 text-xs font-extrabold text-[#0b0f17] shadow-[0_4px_18px_rgba(117,199,255,0.16)] transition hover:bg-[#9bd8ff] disabled:cursor-not-allowed disabled:border-[#29384b] disabled:bg-[#253243] disabled:text-slate-500 disabled:shadow-none"
              >
                {saving ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0b0f17]/50 border-t-[#0b0f17]" />
                ) : (
                  <SettingsGlyph kind="check" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          <section className={`mb-5 rounded-2xl border p-5 sm:p-6 ${
            settings?.setupCompletedAt
              ? "border-emerald-400/25 bg-emerald-500/[0.06]"
              : "border-[#75c7ff]/30 bg-[#111b29]/95 shadow-[0_12px_36px_rgba(0,0,0,0.18)]"
          }`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-extrabold text-white">
                    {settings?.setupCompletedAt ? "Organization setup reviewed" : "Complete your organization setup"}
                  </h2>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    settings?.setupCompletedAt
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-300/25 bg-amber-400/10 text-amber-100"
                  }`}>
                    {settings?.setupCompletedAt ? "Completed" : "Action required"}
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-300">
                  {settings?.setupCompletedAt
                    ? `Your organization settings were reviewed on ${new Date(settings.setupCompletedAt).toLocaleString()}. You can return here to update them when needed.`
                    : "Regional settings are pre-filled from the country entered by your Super Admin. Review the time zone, locale, currency, date format, and working calendar below; adjust anything that does not match your organization, save your choices, then confirm setup. Required settings must be complete before setup can be marked finished."}
                </p>
                {!settings?.setupCompletedAt && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      { label: "Time zone", done: Boolean(form.timeZone.trim()) },
                      { label: "Locale", done: Boolean(form.locale.trim()) },
                      { label: "Currency", done: /^[A-Z]{3}$/.test(form.currencyCode.trim().toUpperCase()) },
                      { label: "Date format", done: Boolean(form.dateFormat) },
                      { label: "At least one working day", done: form.workingDays.length > 0 },
                      { label: "Organization country", done: /^[A-Z]{2}$/.test(form.countryCode.trim().toUpperCase()) },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2 rounded-lg border border-[#29384b] bg-[#0b111b]/70 px-3 py-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                          item.done ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/10 text-amber-100"
                        }`}>{item.done ? "✓" : "!"}</span>
                        <span className="text-[11px] font-semibold text-slate-200">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!settings?.setupCompletedAt && (
                <button
                  type="button"
                  onClick={() => void handleCompleteSetup()}
                  disabled={settingsLoading || saving || completingSetup || hasChanges || !settings ||
                    !form.timeZone.trim() || !form.locale.trim() ||
                    !/^[A-Z]{3}$/.test(form.currencyCode.trim().toUpperCase()) ||
                    !form.dateFormat || form.workingDays.length === 0 ||
                    !/^[A-Z]{2}$/.test(form.countryCode.trim().toUpperCase())}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#75c7ff]/40 bg-[#75c7ff] px-4 py-3 text-xs font-extrabold text-[#0b0f17] transition hover:bg-[#9bd8ff] disabled:cursor-not-allowed disabled:border-[#29384b] disabled:bg-[#253243] disabled:text-slate-500"
                >
                  {completingSetup ? "Completing setup…" : "Confirm & complete setup"}
                </button>
              )}
            </div>
            {setupError && (
              <div role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {setupError}
              </div>
            )}
          </section>

          {loadError && (
            <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">Settings could not be loaded</p>
                <p className="mt-1 text-rose-200/90">{loadError}</p>
              </div>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
                className="shrink-0 rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-bold hover:bg-rose-500/10"
              >
                Try again
              </button>
            </div>
          )}

          {saveError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              <p>{saveError}</p>
              <button
                type="button"
                onClick={() => setSaveError("")}
                className="shrink-0 text-xs font-bold underline underline-offset-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {successMessage && (
            <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] p-4 text-sm text-emerald-200">
              <span className="mt-0.5 text-emerald-300">
                <SettingsGlyph kind="check" />
              </span>
              <div>
                <p className="font-bold">Settings saved</p>
                <p className="mt-0.5 text-emerald-200/80">{successMessage}</p>
              </div>
            </div>
          )}

          {organizationProfile && (
            <section className="mb-5 overflow-hidden rounded-2xl border border-[#29384b] bg-[#141f2e]/85 shadow-[0_12px_38px_rgba(0,0,0,0.16)] backdrop-blur-xl">
              <header className="flex flex-col gap-3 border-b border-[#29384b] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#75c7ff]/25 bg-[#75c7ff]/10 text-[#9bd8ff]"><SettingsGlyph kind="building" /></div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Organization profile</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Registered organization details associated with this tenant.</p>
                  </div>
                </div>
                <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${organizationProfile.status.toUpperCase() === "ACTIVE" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-400/25 bg-amber-400/10 text-amber-200"}`}>
                  {organizationProfile.status.replaceAll("_", " ")}
                </span>
              </header>
              <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
                {([
                  ["Organization name", organizationProfile.name],
                  ["Organization slug", organizationProfile.slug],
                  ["Contact email", organizationProfile.contactEmail],
                  ["Contact phone", organizationProfile.contactPhone],
                  ["Country", organizationProfile.country || "Not provided"],
                  ["Registered address", organizationProfile.address],
                  ["Organization ID", organizationProfile.id],
                  ["Created", organizationProfile.createdAt ? new Date(organizationProfile.createdAt).toLocaleDateString() : "Not available"],
                  ["Last updated", organizationProfile.updatedAt ? new Date(organizationProfile.updatedAt).toLocaleDateString() : "Not available"],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                    <p className={`mt-1.5 break-words text-sm font-semibold ${label === "Organization ID" ? "font-mono text-xs text-slate-300" : "text-slate-100"}`}>
                    {label === "Country" && getCountryCode(organizationProfile.country, settings?.countryCode || null) && (
                      <span className="mr-2 inline-flex align-[-4px] items-center" title={`${organizationProfile.country || "Organization"} flag`}>
                        <img
                          src={`https://flagcdn.com/w40/${getCountryCode(organizationProfile.country, settings?.countryCode || null)!.toLowerCase()}.png`}
                          srcSet={`https://flagcdn.com/w80/${getCountryCode(organizationProfile.country, settings?.countryCode || null)!.toLowerCase()}.png 2x`}
                          width="28"
                          height="21"
                          alt={`${organizationProfile.country || "Organization country"} flag`}
                          className="h-[21px] w-7 rounded-[3px] object-cover shadow-sm ring-1 ring-white/15"
                          loading="lazy"
                          onError={(event) => {
                            const image = event.currentTarget;
                            image.style.display = "none";
                            const fallback = image.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = "inline";
                          }}
                        />
                        <span className="hidden text-base leading-none" role="img" aria-label={`${organizationProfile.country || "Organization country"} flag`}>
                          {getCountryFlagEmoji(getCountryCode(organizationProfile.country, settings?.countryCode || null)!)}
                        </span>
                      </span>
                    )}
                    {value || "Not provided"}
                  </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-5 rounded-2xl border border-[#29384b] bg-[#141f2e]/85 p-5 shadow-[0_12px_38px_rgba(0,0,0,0.16)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#75c7ff]/25 bg-[#0f1724]">
                <span className="text-2xl font-bold text-slate-500">{organizationProfile?.name?.slice(0, 1).toUpperCase() || "O"}</span>
                <img key={logoVersion} src={`/api/backend/org/logo?v=${logoVersion}`} alt="Organization logo" className="absolute inset-0 h-full w-full bg-[#0f1724] object-contain p-2" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-white">Organization logo</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">Upload your organization’s logo. It will appear in the Organization Admin workspace.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void uploadOrganizationLogo(event.target.files?.[0])} />
                  <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo || settingsLoading} className="rounded-lg bg-[#75c7ff] px-4 py-2 text-xs font-bold text-[#081321] transition hover:bg-[#9bd8ff] disabled:opacity-50">{uploadingLogo ? "Uploading…" : "Upload logo"}</button>
                  <span className="text-[11px] text-slate-500">JPEG, PNG or WebP · Maximum 100 KB</span>
                </div>
                {logoError && <p role="alert" className="mt-2 text-xs text-rose-300">{logoError}</p>}
                {logoSuccess && <p role="status" className="mt-2 text-xs text-emerald-300">{logoSuccess}</p>}
              </div>
            </div>
          </section>

          {settingsLoading && !settings ? (
            <div className="grid gap-5 xl:grid-cols-2" aria-label="Loading organization settings">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-72 animate-pulse rounded-2xl border border-[#29384b] bg-[#141f2e]/55" />
              ))}
            </div>
          ) : settings ? (
            <form id="organization-settings-form" onSubmit={handleSave} className="space-y-5">
              <div className="grid min-w-0 gap-5 xl:grid-cols-2">
                <SettingsCard
                  title="Regional preferences"
                  description="Control the formats and regional conventions used in this organization."
                  icon="globe"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-slate-300">
                      Time zone <span className="text-rose-300">*</span>
                      <input
                        className={inputClassName}
                        value={form.timeZone}
                        onChange={(event) => updateForm("timeZone", event.target.value)}
                        placeholder="Africa/Kigali"
                        autoComplete="off"
                        required
                        maxLength={64}
                        disabled={settingsLoading || saving}
                      />
                      <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                        Use an IANA name, for example Africa/Kigali or UTC.
                      </span>
                    </label>

                    <label className="block text-xs font-bold text-slate-300">
                      Locale <span className="text-rose-300">*</span>
                      <input
                        className={inputClassName}
                        value={form.locale}
                        onChange={(event) => updateForm("locale", event.target.value)}
                        placeholder="en or en-GB"
                        autoComplete="off"
                        required
                        maxLength={35}
                        disabled={settingsLoading || saving}
                      />
                      <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                        BCP 47 locale tag; the server validates and canonicalizes it.
                      </span>
                    </label>

                    <label className="block text-xs font-bold text-slate-300">
                      Currency <span className="text-rose-300">*</span>
                      <input
                        className={inputClassName}
                        value={form.currencyCode}
                        onChange={(event) => updateForm("currencyCode", event.target.value.toUpperCase().slice(0, 3))}
                        placeholder="RWF"
                        autoComplete="off"
                        maxLength={3}
                        required
                        disabled={settingsLoading || saving}
                      />
                      <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                        Required for organization-wide financial display. Use a three-letter code such as RWF, USD or EUR.
                      </span>
                    </label>

                    <label className="block text-xs font-bold text-slate-300">
                      Date format <span className="text-rose-300">*</span>
                      <select
                        className={inputClassName}
                        value={form.dateFormat}
                        onChange={(event) => updateForm("dateFormat", event.target.value)}
                        required
                        disabled={settingsLoading || saving}
                      >
                        {DATE_FORMATS.map((format) => (
                          <option key={format} value={format} className="bg-[#0b111b]">
                            {format}{format === "YYYY-MM-DD" ? " (ISO)" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                        Controls the preferred display format for dates.
                      </span>
                    </label>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title="Working schedule"
                  description="Set the standard work week and the first day shown in calendar views."
                  icon="calendar"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-300">Working days</p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      Select all days that normally count as working days. At least one is required.
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {WEEKDAYS.map((day) => {
                        const active = selectedWorkingDays.has(day.value);

                        return (
                          <button
                            key={day.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleWorkingDay(day.value)}
                            disabled={settingsLoading || saving}
                            className={`min-h-11 rounded-xl border px-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${
                              active
                                ? "border-[#75c7ff]/50 bg-[#75c7ff]/15 text-[#c8eaff] shadow-[inset_0_0_0_1px_rgba(117,199,255,0.06)]"
                                : "border-[#29384b] bg-[#0b111b] text-slate-400 hover:border-white/20 hover:text-white"
                            }`}
                            title={day.label}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="block text-xs font-bold text-slate-300 sm:max-w-sm">
                    First day of the week
                    <select
                      className={inputClassName}
                      value={form.weekStartsOn}
                      onChange={(event) => updateForm("weekStartsOn", Number(event.target.value))}
                      disabled={settingsLoading || saving}
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value} className="bg-[#0b111b]">
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-xl border border-[#29384b] bg-[#0b111b]/75 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Schedule preview
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {form.workingDays.length} working {form.workingDays.length === 1 ? "day" : "days"} per week
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Calendar week begins on {WEEKDAYS.find((day) => day.value === Number(form.weekStartsOn))?.label ?? "Monday"}.
                    </p>
                  </div>
                </SettingsCard>
              </div>

              <SettingsCard
                title="Country and legal entity"
                description="Set the organization's operating country. Legal registration details can be added here when applicable."
                icon="building"
              >
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="block text-xs font-bold text-slate-300">
                    Organization country <span className="text-rose-300">*</span>
                    <CountrySelect
                      id="organization-country-code"
                      value={form.countryCode}
                      valueFormat="code"
                      placeholder="Select organization country"
                      onChange={(value) => updateForm("countryCode", value)}
                      className={`${inputClassName} flex items-center gap-2 text-left`}
                      disabled={settingsLoading || saving}
                    />
                    <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                      Required operating country, stored as a two-letter ISO code such as RW.
                    </span>
                  </label>

                  <label className="block text-xs font-bold text-slate-300">
                    Legal entity name
                    <input
                      className={inputClassName}
                      value={form.legalEntityName}
                      onChange={(event) => updateForm("legalEntityName", event.target.value)}
                      placeholder="Registered legal name"
                      autoComplete="organization"
                      maxLength={200}
                      disabled={settingsLoading || saving}
                    />
                    <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                      The formally registered entity name, if applicable.
                    </span>
                  </label>

                  <label className="block text-xs font-bold text-slate-300">
                    Legal registration country
                    <CountrySelect
                      id="legal-entity-country-code"
                      value={form.legalEntityCountryCode}
                      valueFormat="code"
                      placeholder="Select registration country"
                      onChange={(value) => updateForm("legalEntityCountryCode", value)}
                      className={`${inputClassName} flex items-center gap-2 text-left`}
                      disabled={settingsLoading || saving}
                    />
                    <span className="mt-1.5 block text-[11px] font-medium leading-4 text-slate-500">
                      Two-letter ISO country code for registration.
                    </span>
                  </label>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
                  <span className="mt-0.5 text-amber-300">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path d="M12 3 2.7 19a1.5 1.5 0 0 0 1.3 2.2h16a1.5 1.5 0 0 0 1.3-2.2L12 3Z" />
                      <path d="M12 9v4m0 4h.01" />
                    </svg>
                  </span>
                  <p className="text-xs leading-5 text-amber-100/80">
                    These details are optional at this stage. Enter only information that your organization has confirmed; blank optional fields are stored as empty values.
                  </p>
                </div>
              </SettingsCard>

              <div className="flex flex-col gap-3 rounded-2xl border border-[#29384b] bg-[#141f2e]/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                <div>
                  <p className="text-sm font-bold text-white">Review before saving</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Changes apply to this organization only. Save when you are ready to persist the configuration.
                  </p>
                  {settings.updatedAt && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Last saved: {new Date(settings.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadSettings()}
                    disabled={settingsLoading || saving || !hasChanges}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] px-4 text-xs font-bold text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Discard changes
                  </button>
                  <button
                    type="submit"
                    disabled={settingsLoading || saving || !hasChanges}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-5 text-xs font-extrabold text-[#0b0f17] transition hover:bg-[#9bd8ff] disabled:cursor-not-allowed disabled:bg-[#253243] disabled:text-slate-500"
                  >
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </div>
            </form>
          ) : !loadError ? (
            <div className="rounded-2xl border border-[#29384b] bg-[#141f2e]/75 p-10 text-center text-sm text-slate-400">
              No settings are available.
            </div>
          ) : null}

        </div>
      </main>
    </div>
  );
}