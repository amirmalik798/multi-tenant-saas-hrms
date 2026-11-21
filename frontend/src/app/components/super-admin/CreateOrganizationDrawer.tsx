"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CountrySelect, replacePhoneCountryCode } from "../workforce/CountryPhoneFields";

type CreateOrganizationDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (organizationName: string) => void;
};

type IconName = "building" | "clock" | "check" | "info" | "x" | "alert";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    alert: <><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3h.01" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {paths[name]}
    </svg>
  );
}

function createOrganizationSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function FieldStatus({ complete, invalid }: { complete: boolean; invalid?: boolean }) {
  if (complete) {
    return (
      <span className="create-org-field-status inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
        <Icon name="check" size={12} />
        Looks good
      </span>
    );
  }
  if (invalid) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
        <Icon name="alert" size={12} />
        Needs attention
      </span>
    );
  }
  return null;
}

const inputBaseClass = "mt-2 h-11 w-full rounded-lg border bg-[#0f1724] px-3.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:border-[#29384b] disabled:bg-[#0b0f17] disabled:text-slate-500 motion-reduce:transition-none";
const inputClass = (complete: boolean, invalid = false) => `${inputBaseClass} ${complete ? "border-emerald-400/40" : invalid ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-500/10" : "border-[#29384b]"}`;

export function CreateOrganizationDrawer({ open, onClose, onCreated }: CreateOrganizationDrawerProps) {
  const router = useRouter();
  const drawerRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [organizationAdminEmail, setOrganizationAdminEmail] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminCountry, setAdminCountry] = useState("Rwanda");
  const [adminCity, setAdminCity] = useState("");
  const [adminPhone, setAdminPhone] = useState("+250 ");
  const [organizationCountry, setOrganizationCountry] = useState("Rwanda");
  const [contactPhone, setContactPhone] = useState("+250 ");
  const [address, setAddress] = useState("");
  const [createdOrganizationId, setCreatedOrganizationId] = useState("");
  const [createdOrganizationName, setCreatedOrganizationName] = useState("");
  const [uncertainCreationSlug, setUncertainCreationSlug] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isSubmittingRef = useRef(isSubmitting);
  const confirmDiscardRef = useRef(confirmDiscard);

  isSubmittingRef.current = isSubmitting;
  confirmDiscardRef.current = confirmDiscard;

  const nameIsValid = name.trim().length >= 2;
  const slugIsValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
  const adminEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizationAdminEmail.trim());
  const adminFirstNameIsValid = adminFirstName.trim().length >= 2;
  const adminLastNameIsValid = adminLastName.trim().length >= 1;
  const adminCountryIsValid = adminCountry.trim().length > 0;
  const adminCityIsValid = adminCity.trim().length >= 2;
  const adminPhoneDigits = adminPhone.replace(/\D/g, "").length;
  const adminPhoneIsValid = adminPhoneDigits >= 7 && adminPhoneDigits <= 15 && /^\+?[0-9][0-9\s().-]*[0-9]$/.test(adminPhone.trim());
  const countryIsValid = organizationCountry.trim().length > 0;
  const phoneDigits = contactPhone.trim().replace(/\D/g, "").length;
  const phoneIsValid = phoneDigits >= 7 && /^[+0-9().\-\s]+$/.test(contactPhone.trim());
  const addressIsValid = address.trim().length >= 3;
  const completion = useMemo(() => [nameIsValid, slugIsValid, emailIsValid, adminEmailIsValid, countryIsValid, phoneIsValid, addressIsValid, adminFirstNameIsValid, adminLastNameIsValid, adminCountryIsValid, adminCityIsValid, adminPhoneIsValid], [nameIsValid, slugIsValid, emailIsValid, adminEmailIsValid, countryIsValid, phoneIsValid, addressIsValid, adminFirstNameIsValid, adminLastNameIsValid, adminCountryIsValid, adminCityIsValid, adminPhoneIsValid]);
  const completedCount = completion.filter(Boolean).length;
  const hasUnsavedInput = Boolean(name || slug || contactEmail || organizationAdminEmail || adminFirstName || adminLastName || adminCity || (adminCountry && adminCountry !== "Rwanda") || (adminPhone.trim() && adminPhone.trim() !== "+250") || (organizationCountry && organizationCountry !== "Rwanda") || (contactPhone.trim() && contactPhone.trim() !== "+250") || address);
  const organizationAlreadyCreated = Boolean(createdOrganizationId);

  const resetForm = useCallback(() => {
    setName("");
    setSlug("");
    setSlugManuallyEdited(false);
    setContactEmail("");
    setOrganizationAdminEmail("");
    setAdminFirstName("");
    setAdminLastName("");
    setAdminCountry("Rwanda");
    setAdminCity("");
    setAdminPhone("+250 ");
    setOrganizationCountry("Rwanda");
    setContactPhone("+250 ");
    setAddress("");
    setCreatedOrganizationId("");
    setCreatedOrganizationName("");
    setUncertainCreationSlug("");
    setError("");
    setIsSubmitting(false);
    setConfirmDiscard(false);
  }, []);

  const requestClose = useCallback(() => {
    if (isSubmittingRef.current) return;
    if (hasUnsavedInput) {
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    onClose();
  }, [hasUnsavedInput, onClose]);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    resetForm();
    const focusFrame = window.requestAnimationFrame(() => nameInputRef.current?.focus());

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Let an open country combobox consume Escape first. Otherwise the
      // capture-phase drawer listener would close the entire drawer before
      // the country selector can dismiss only its own result list.
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.getAttribute("role") === "combobox" &&
        activeElement.getAttribute("aria-expanded") === "true"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isSubmittingRef.current) return;
      if (confirmDiscardRef.current) {
        setConfirmDiscard(false);
      } else {
        requestCloseRef.current();
      }
    }

    window.addEventListener("keydown", handleEscape, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleEscape, true);
      document.body.style.overflow = previousOverflow;
      if (previousActive?.isConnected) previousActive.focus();
    };
    // Reset only on the closed -> open lifecycle. Other callbacks/state should not reset user input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function trapTabKey(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusScope = confirmDiscard
      ? drawerRef.current.querySelector<HTMLElement>('[role="alertdialog"]')
      : drawerRef.current;
    if (!focusScope) return;
    const focusable = Array.from(focusScope.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!organizationAlreadyCreated && (!nameIsValid || !slugIsValid || !emailIsValid || !adminEmailIsValid || !countryIsValid || !phoneIsValid || !addressIsValid || !adminFirstNameIsValid || !adminLastNameIsValid || !adminCountryIsValid || !adminCityIsValid || !adminPhoneIsValid)) {
      setError("Complete all required fields before creating the organization.");
      return;
    }
    if (organizationAlreadyCreated && !adminEmailIsValid) {
      setError("Enter a valid Organization Admin email to retry the invitation.");
      return;
    }

    setIsSubmitting(true);
    let organizationId = createdOrganizationId;
    let createdName = createdOrganizationName || name.trim();
    try {
      // If a previous POST lost its response, first reconcile by the unique slug.
      // This prevents blind retries from creating duplicate organization records.
      if (!organizationId && uncertainCreationSlug) {
        const verificationResponse = await fetch("/api/backend/organizations", { cache: "no-store" });
        const verificationData = (await verificationResponse.json().catch(() => ({}))) as {
          message?: string;
          organizations?: Array<{ id?: string; name?: string; slug?: string }>;
        };
        if (verificationResponse.status === 401) {
          router.replace("/");
          return;
        }
        if (!verificationResponse.ok || !Array.isArray(verificationData.organizations)) {
          throw new Error(verificationData.message || "Could not verify whether the organization was created. Do not submit another organization yet.");
        }
        const existingOrganization = verificationData.organizations.find((item) => item.slug?.toLowerCase() === uncertainCreationSlug.toLowerCase());
        if (existingOrganization?.id) {
          organizationId = existingOrganization.id;
          createdName = existingOrganization.name || createdName;
          setCreatedOrganizationId(organizationId);
          setCreatedOrganizationName(createdName);
          setUncertainCreationSlug("");
          setError(`Found “${createdName}” in the organization directory. The organization will not be created again. Submit once more to send the Organization Admin invitation.`);
          onCreated(createdName);
          return;
        }
        setUncertainCreationSlug("");
        setError("The organization was not found in the directory. Your form data is preserved; submit again to create it safely.");
        return;
      }

      if (!organizationId) {
        const response = await fetch("/api/backend/organizations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim().toLowerCase(),
            contactEmail: contactEmail.trim().toLowerCase(),
            contactPhone: contactPhone.trim(),
            address: address.trim(),
            country: organizationCountry.trim(),
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
          organization?: { id?: string; name?: string };
        };
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) {
          setError(data.message || "The organization could not be created. Check the fields and try again.");
          return;
        }
        organizationId = data.organization?.id ?? "";
        createdName = data.organization?.name ?? name.trim();
        if (!organizationId) {
          setUncertainCreationSlug(slug.trim().toLowerCase());
          setError("The organization may have been created, but the response did not include its ID. Verify the organization by its unique slug before any new create attempt.");
          onCreated(createdName);
          return;
        }
        setUncertainCreationSlug("");
        setCreatedOrganizationId(organizationId);
        setCreatedOrganizationName(createdName);
        // Refresh the directory as soon as the organization exists, even if email delivery later fails.
        onCreated(createdName);
      }

      const invitationResponse = await fetch(`/api/backend/organizations/${encodeURIComponent(organizationId)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: organizationAdminEmail.trim().toLowerCase(),
          adminFirstName: adminFirstName.trim(),
          adminLastName: adminLastName.trim(),
          adminPhone: adminPhone.trim(),
          adminCountry: adminCountry.trim(),
          adminCity: adminCity.trim(),
        }),
      });
      const invitationData = (await invitationResponse.json().catch(() => ({}))) as {
        message?: string;
        emailSent?: boolean;
      };
      if (invitationResponse.status === 401) {
        router.replace("/");
        return;
      }
      if (!invitationResponse.ok || invitationData.emailSent !== true) {
        setError(`Organization “${createdName}” was created, but the administrator invitation was not confirmed as sent. ${invitationData.message || "Check the email delivery configuration and retry the invitation below."}`);
        return;
      }

      onClose();
    } catch (submitError) {
      console.error("Organization creation or invitation failed:", submitError);
      if (organizationId) {
        setCreatedOrganizationId(organizationId);
        setCreatedOrganizationName(createdName);
        setError(`Organization “${createdName}” exists, but invitation delivery could not be confirmed. Do not create it again. Verify the invitation status or retry the administrator invitation below.`);
      } else if (!organizationAlreadyCreated) {
        setUncertainCreationSlug(slug.trim().toLowerCase());
        setError("The connection failed before the organization ID was confirmed. We will check the organization directory by its unique slug before allowing another create attempt.");
      } else {
        setError("The server could not be reached. Your organization details remain available, and no new organization was submitted.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirmDiscard) requestClose(); }}>
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-organization-drawer-title"
        aria-describedby="create-organization-drawer-description"
        tabIndex={-1}
        onKeyDown={trapTabKey}
        className="sa-create-organization-drawer organization-slide-over-panel relative ml-auto flex h-full w-full max-w-3xl flex-col border-l border-[#29384b] bg-[#141d2b] text-[#f8fafc] shadow-[-24px_0_64px_rgba(0,0,0,0.6)] motion-reduce:transition-none"
      >
        <style jsx global>{`
          @keyframes create-org-field-ready {
            from { opacity: .4; transform: scale(.92); }
            to { opacity: 1; transform: scale(1); }
          }
          .create-org-field-status { animation: create-org-field-ready 150ms ease-out both; }
          @media (prefers-reduced-motion: reduce) {
            .create-org-field-status { animation: none !important; }
          }
        `}</style>
        <header className="flex shrink-0 items-start gap-4 border-b border-[#29384b] bg-[#0f1724]/95 px-5 py-5 backdrop-blur-xl sm:px-7">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Organization Management</p>
            <h2 id="create-organization-drawer-title" className="mt-2 text-2xl font-bold tracking-tight text-[#f8fafc]">Create Organization</h2>
            <p id="create-organization-drawer-description" className="mt-2 text-xs leading-5 text-slate-300">Register an organization and prepare it for administrator onboarding.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={isSubmitting} aria-label="Close create organization drawer" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] text-slate-100 transition hover:border-[#29384b] hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">
            <Icon name="x" size={21} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <section className="mb-5 rounded-2xl border border-[#29384b] bg-gradient-to-br from-[#1a2a40] to-[#141d2b] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)] sm:p-5" aria-label="Organization creation progress">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-200"><Icon name="building" size={19} /></span>
                <div>
                  <p className="text-sm font-bold text-white">Organization setup</p>
                  <p className="mt-0.5 text-xs text-slate-300">Complete the details below, then invite the first administrator.</p>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs font-semibold tabular-nums text-slate-200" aria-live="polite">{completedCount} of {completion.length} required fields ready</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/25" role="progressbar" aria-label="Required fields completed" aria-valuemin={0} aria-valuemax={completion.length} aria-valuenow={completedCount}>
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(completedCount / completion.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">Format checks help catch common mistakes. The server performs the final validation and uniqueness checks.</p>
          </section>

          <form id="create-organization-drawer-form" onSubmit={handleSubmit} className="space-y-4">
            {/* 01 — Organization identity */}
            <section className="overflow-hidden rounded-2xl border border-[#29384b] bg-[#182232]/85 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
              <div className="flex items-start gap-3 border-b border-[#29384b] bg-[#1b2a3d]/75 px-5 py-4 sm:px-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-200"><Icon name="building" size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-300">01 · Identity</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-300">Organization profile</span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-white">Organization details</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-300">Start with the official name. We will suggest a URL-friendly slug that you can edit.</p>
                </div>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <div className="sm:col-span-2">
                  <label htmlFor="create-org-name" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Organization name <span className="text-rose-400">*</span></span><FieldStatus complete={nameIsValid} invalid={name.length > 0 && !nameIsValid} /></label>
                  <input ref={nameInputRef} id="create-org-name" name="name" type="text" required minLength={2} maxLength={120} autoComplete="organization" disabled={isSubmitting || organizationAlreadyCreated} value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slugManuallyEdited) setSlug(createOrganizationSlug(next)); }} placeholder="e.g. Kigali Solutions" aria-invalid={name.length > 0 && !nameIsValid} aria-describedby="create-org-name-help" className={`${inputClass(nameIsValid, name.length > 0 && !nameIsValid)} h-12 text-[15px]`} />
                  <p id="create-org-name-help" className={`mt-2 text-xs leading-5 ${name.length > 0 && !nameIsValid ? "text-rose-300" : "text-slate-400"}`}>{name.length > 0 && !nameIsValid ? "Enter at least 2 characters for the official organization name." : "Use the organization's registered or commonly recognized name."}</p>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="create-org-slug" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Organization slug <span className="text-rose-400">*</span></span><FieldStatus complete={slugIsValid} invalid={slug.length > 0 && !slugIsValid} /></label>
                  <div className="relative">
                    <input id="create-org-slug" name="slug" type="text" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Use lowercase letters, numbers, and single hyphens only." autoCapitalize="none" spellCheck={false} disabled={isSubmitting || organizationAlreadyCreated} value={slug} onChange={(event) => { setSlugManuallyEdited(true); setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 80)); }} placeholder="e.g. kigali-solutions" aria-invalid={slug.length > 0 && !slugIsValid} aria-describedby="create-org-slug-help" className={`${inputClass(slugIsValid, slug.length > 0 && !slugIsValid)} h-12 font-mono text-sm`} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                    <p id="create-org-slug-help" className={`max-w-2xl text-xs leading-5 ${slug.length > 0 && !slugIsValid ? "text-rose-300" : "text-slate-400"}`}>{slug.length > 0 && !slugIsValid ? "Use lowercase letters and numbers separated by single hyphens. Avoid a leading or trailing hyphen." : slugManuallyEdited ? "Custom slug: automatic name syncing is paused. The server will still check uniqueness." : "Suggested from the organization name. You can edit it; the server will check that it is unique."}</p>
                    {slugManuallyEdited && <span className="inline-flex shrink-0 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-200">Custom slug</span>}
                  </div>
                </div>
              </div>
            </section>

            {/* 02 — Country and phone are intentionally full-width and consecutive. */}
            <section className="overflow-visible rounded-2xl border border-[#29384b] bg-[#182232]/85 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
              <div className="flex items-start gap-3 rounded-t-2xl border-b border-[#29384b] bg-[#1b2a3d]/75 px-5 py-4 sm:px-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><Icon name="info" size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-300">02 · Contact & location</p>
                  <h3 className="mt-1 text-base font-bold text-white">Where the organization is based</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-300">Choose the country first. The phone field follows it so the correct international calling code can be applied.</p>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <label htmlFor="create-org-country" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Country <span className="text-rose-400">*</span></span><FieldStatus complete={countryIsValid} invalid={!countryIsValid} /></label>
                  <div className="mt-2 rounded-xl ring-1 ring-white/[0.04]">
                    <CountrySelect id="create-org-country" value={organizationCountry} required disabled={isSubmitting || organizationAlreadyCreated} onChange={(nextCountry) => { setOrganizationCountry(nextCountry); setContactPhone((current) => replacePhoneCountryCode(current, organizationCountry, nextCountry)); }} className={`${inputClass(countryIsValid, !countryIsValid)} h-[54px] rounded-xl text-[15px]`} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">Type a country name or ISO code, or use the arrow keys and Enter to choose one. This country is saved on the organization profile.</p>
                </div>
                <div>
                  <label htmlFor="create-org-phone" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Organization contact phone <span className="text-rose-400">*</span></span><FieldStatus complete={phoneIsValid} invalid={contactPhone.length > 0 && !phoneIsValid} /></label>
                  <input id="create-org-phone" name="contactPhone" type="tel" autoComplete="tel" required maxLength={30} disabled={isSubmitting || organizationAlreadyCreated} value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="e.g. +250 788 123 456" aria-invalid={contactPhone.length > 0 && !phoneIsValid} aria-describedby="create-org-phone-help" className={`${inputClass(phoneIsValid, contactPhone.length > 0 && !phoneIsValid)} h-12 text-[15px] tabular-nums`} />
                  <p id="create-org-phone-help" className={`mt-2 text-xs leading-5 ${contactPhone.length > 0 && !phoneIsValid ? "text-rose-300" : "text-slate-400"}`}>{contactPhone.length > 0 && !phoneIsValid ? "Enter at least 7 digits. Spaces, +, parentheses, periods, and hyphens are allowed." : "Include the country calling code. Changing the country updates the prefix while preserving the subscriber number when possible."}</p>
                </div>
                <div>
                  <label htmlFor="create-org-email" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Organization contact email <span className="text-rose-400">*</span></span><FieldStatus complete={emailIsValid} invalid={contactEmail.length > 0 && !emailIsValid} /></label>
                  <input id="create-org-email" name="contactEmail" type="email" required maxLength={254} autoComplete="email" disabled={isSubmitting || organizationAlreadyCreated} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="e.g. contact@example.com" aria-invalid={contactEmail.length > 0 && !emailIsValid} aria-describedby="create-org-email-help" className={`${inputClass(emailIsValid, contactEmail.length > 0 && !emailIsValid)} h-12`} />
                  <p id="create-org-email-help" className={`mt-2 text-xs leading-5 ${contactEmail.length > 0 && !emailIsValid ? "text-rose-300" : "text-slate-400"}`}>{contactEmail.length > 0 && !emailIsValid ? "Enter an email in the format name@example.com." : "Used for general organization correspondence. This is separate from the administrator's login email."}</p>
                </div>
                <div>
                  <label htmlFor="create-org-address" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Registered or physical address <span className="text-rose-400">*</span></span><FieldStatus complete={addressIsValid} invalid={address.length > 0 && !addressIsValid} /></label>
                  <textarea id="create-org-address" name="address" required minLength={3} maxLength={255} rows={3} autoComplete="street-address" disabled={isSubmitting || organizationAlreadyCreated} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, building, district/city, postal details" aria-invalid={address.length > 0 && !addressIsValid} aria-describedby="create-org-address-help" className={`${inputBaseClass.replace("h-11", "min-h-[104px]")} resize-y rounded-xl py-3 ${addressIsValid ? "border-emerald-400/40" : address.length > 0 && !addressIsValid ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-500/10" : "border-[#29384b]"}`} />
                  <p id="create-org-address-help" className={`mt-2 text-xs leading-5 ${address.length > 0 && !addressIsValid ? "text-rose-300" : "text-slate-400"}`}>{address.length > 0 && !addressIsValid ? "Enter an address with at least 3 characters." : "Provide enough detail to identify the organization's location."}</p>
                </div>
              </div>
            </section>

            {/* 03 — Initial administrator invitation is distinct from the organization contact. */}
            <section className="overflow-hidden rounded-2xl border border-[#29384b] bg-[#182232]/85 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
              <div className="flex items-start gap-3 border-b border-[#29384b] bg-[#1b2a3d]/75 px-5 py-4 sm:px-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200"><Icon name="check" size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-300">03 · Administrator access</p>
                  <h3 className="mt-1 text-base font-bold text-white">Invite the first Organization Admin</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-300">This person will receive the initial invitation to activate and manage the organization.</p>
                </div>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="create-org-admin-first-name" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>First name <span className="text-rose-400">*</span></span><FieldStatus complete={adminFirstNameIsValid} invalid={adminFirstName.length > 0 && !adminFirstNameIsValid} /></label>
                    <input id="create-org-admin-first-name" name="adminFirstName" required minLength={2} maxLength={100} autoComplete="given-name" disabled={isSubmitting || organizationAlreadyCreated} value={adminFirstName} onChange={(event) => setAdminFirstName(event.target.value)} placeholder="e.g. Amina" className={`${inputClass(adminFirstNameIsValid, adminFirstName.length > 0 && !adminFirstNameIsValid)} h-12`} />
                  </div>
                  <div>
                    <label htmlFor="create-org-admin-last-name" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Last name <span className="text-rose-400">*</span></span><FieldStatus complete={adminLastNameIsValid} invalid={adminLastName.length > 0 && !adminLastNameIsValid} /></label>
                    <input id="create-org-admin-last-name" name="adminLastName" required minLength={1} maxLength={100} autoComplete="family-name" disabled={isSubmitting || organizationAlreadyCreated} value={adminLastName} onChange={(event) => setAdminLastName(event.target.value)} placeholder="e.g. Uwase" className={`${inputClass(adminLastNameIsValid, adminLastName.length > 0 && !adminLastNameIsValid)} h-12`} />
                  </div>
                </div>
                <div>
                  <label htmlFor="create-org-admin-country" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Administrator country <span className="text-rose-400">*</span></span><FieldStatus complete={adminCountryIsValid} invalid={!adminCountryIsValid} /></label>
                  <div className="mt-2 rounded-xl ring-1 ring-white/[0.04]">
                    <CountrySelect id="create-org-admin-country" value={adminCountry} required disabled={isSubmitting || organizationAlreadyCreated} onChange={(nextCountry) => { setAdminPhone((current) => replacePhoneCountryCode(current, adminCountry, nextCountry)); setAdminCountry(nextCountry); }} className={`${inputClass(adminCountryIsValid, !adminCountryIsValid)} h-[54px] rounded-xl text-[15px]`} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="create-org-admin-city" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Administrator city <span className="text-rose-400">*</span></span><FieldStatus complete={adminCityIsValid} invalid={adminCity.length > 0 && !adminCityIsValid} /></label>
                    <input id="create-org-admin-city" name="adminCity" required minLength={2} maxLength={100} autoComplete="address-level2" disabled={isSubmitting || organizationAlreadyCreated} value={adminCity} onChange={(event) => setAdminCity(event.target.value)} placeholder="e.g. Kigali" className={`${inputClass(adminCityIsValid, adminCity.length > 0 && !adminCityIsValid)} h-12`} />
                  </div>
                  <div>
                    <label htmlFor="create-org-admin-phone" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Administrator phone <span className="text-rose-400">*</span></span><FieldStatus complete={adminPhoneIsValid} invalid={adminPhone.length > 0 && !adminPhoneIsValid} /></label>
                    <input id="create-org-admin-phone" name="adminPhone" type="tel" required maxLength={50} autoComplete="tel" disabled={isSubmitting || organizationAlreadyCreated} value={adminPhone} onChange={(event) => setAdminPhone(event.target.value)} placeholder="e.g. +250 788 123 456" aria-invalid={adminPhone.length > 0 && !adminPhoneIsValid} className={`${inputClass(adminPhoneIsValid, adminPhone.length > 0 && !adminPhoneIsValid)} h-12 tabular-nums`} />
                  </div>
                </div>
                <div>
                  <label htmlFor="create-org-admin-email" className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-200"><span>Organization Admin email <span className="text-rose-400">*</span></span><FieldStatus complete={adminEmailIsValid} invalid={organizationAdminEmail.length > 0 && !adminEmailIsValid} /></label>
                  <input id="create-org-admin-email" name="organizationAdminEmail" type="email" required maxLength={254} autoComplete="email" disabled={isSubmitting} value={organizationAdminEmail} onChange={(event) => setOrganizationAdminEmail(event.target.value)} placeholder="admin@example.com" aria-invalid={organizationAdminEmail.length > 0 && !adminEmailIsValid} aria-describedby="create-org-admin-email-help" className={`${inputClass(adminEmailIsValid, organizationAdminEmail.length > 0 && !adminEmailIsValid)} h-12`} />
                  <p id="create-org-admin-email-help" className={`mt-2 text-xs leading-5 ${organizationAdminEmail.length > 0 && !adminEmailIsValid ? "text-rose-300" : "text-slate-400"}`}>{organizationAlreadyCreated ? "The organization already exists. Change this address only if you need to retry the initial administrator invitation." : "The invitation is sent after the organization record is successfully created. The recipient will activate their own account. These personal details are saved to the administrator profile, separately from the organization contact details."}</p>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-400/10 text-amber-200"><Icon name="clock" size={18} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-100">Initial status: Pending Setup</p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/75">The organization is created in Pending Setup. It becomes operational through the initial Organization Admin activation workflow. The invitation is sent after the organization is saved.</p>
                  </div>
                </div>
              </div>
            </section>

            {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200"><Icon name="alert" size={19} /><div className="min-w-0 flex-1"><p className="font-semibold text-rose-100">{uncertainCreationSlug ? "Confirm organization creation" : organizationAlreadyCreated ? "Organization created — invitation needs attention" : "Organization could not be created"}</p><p className="mt-1 leading-5">{error}</p></div><button type="button" onClick={() => setError("")} className="shrink-0 text-xs font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Dismiss</button></div>}
          </form>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[#29384b] bg-[#0f1724]/95 px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs text-slate-300"><span className="text-rose-400">*</span> Required fields</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={requestClose} disabled={isSubmitting} className="sa-create-org-cancel inline-flex min-h-11 items-center justify-center rounded-lg border border-[#29384b] bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none">Cancel</button>
            <button type="submit" form="create-organization-drawer-form" disabled={isSubmitting || (!organizationAlreadyCreated && !(nameIsValid && slugIsValid && emailIsValid && adminEmailIsValid && countryIsValid && phoneIsValid && addressIsValid && adminFirstNameIsValid && adminLastNameIsValid && adminCountryIsValid && adminCityIsValid && adminPhoneIsValid)) || (organizationAlreadyCreated && !adminEmailIsValid)} className="sa-create-org-submit inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none">
              {isSubmitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" />{uncertainCreationSlug ? "Checking Organization..." : organizationAlreadyCreated ? "Sending Invitation..." : "Creating Organization..."}</> : <><Icon name="check" size={17} />{uncertainCreationSlug ? "Verify Organization Status" : organizationAlreadyCreated ? "Retry Admin Invitation" : "Create Organization & Invite Admin"}</>}
            </button>
          </div>
        </footer>

        {confirmDiscard && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="create-org-discard-title" aria-describedby="create-org-discard-description" className="w-full max-w-sm rounded-2xl border border-amber-400/25 bg-[#182232] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)]"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-200"><Icon name="info" size={20} /></span><div><h3 id="create-org-discard-title" className="text-base font-bold text-white">{organizationAlreadyCreated ? "Close invitation retry?" : "Discard organization details?"}</h3><p id="create-org-discard-description" className="mt-2 text-sm leading-5 text-slate-300">{organizationAlreadyCreated ? "The organization has already been created. You can close this panel and manage its invitation from the organization invitation workflow; do not create the organization again." : "You have entered information that has not been saved. Close anyway and discard these changes?"}</p></div></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-[#29384b] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Keep editing</button><button type="button" onClick={() => { setConfirmDiscard(false); resetForm(); onClose(); }} className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Discard and close</button></div></div></div>}
      </aside>
    </div>
  );
}
