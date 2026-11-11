"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  CheckCircle2,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  OrganizationAdminHeader,
  OrganizationAdminSidebar,
} from "../../components/org-admin/OrganizationAdminChrome";
import {
  CountrySelect,
  formatCountryWithFlag,
  replacePhoneCountryCode,
} from "../../components/workforce/CountryPhoneFields";

type AdminSession = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
  firstName?: string;
  lastName?: string;
};

const LABEL =
  "text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500";

function ProfileField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof UserRound;
}) {
  return (
    <div className="min-w-0 border-b border-white/[0.055] py-3 last:border-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1.5 flex min-w-0 items-start gap-2 break-words text-sm font-medium leading-6 text-slate-200">
        {Icon && <Icon size={15} className="mt-0.5 shrink-0 text-slate-500" />}
        <span>{value || "Not provided"}</span>
      </dd>
    </div>
  );
}

export default function OrganizationAdminProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState({ contactPhone: "", country: "", city: "" });
  const [contactDraft, setContactDraft] = useState({ contactPhone: "", country: "", city: "" });
  const [photoVersion, setPhotoVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/backend/org/auth/me", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (
          !response.ok ||
          payload?.authenticated !== true ||
          payload?.user?.role !== "ORGANIZATION_ADMIN" ||
          !payload?.user?.organizationId
        ) {
          throw new Error(payload?.message || "Your Organization Admin session could not be verified.");
        }
        if (active) setUser(payload.user as AdminSession);
        try {
          const profileResponse = await fetch("/api/backend/org/profile", {
            credentials: "same-origin",
            cache: "no-store",
          });
          const profilePayload = await profileResponse.json().catch(() => null);
          if (!profileResponse.ok) {
            throw new Error(profilePayload?.message || "Unable to load your contact details.");
          }
          const details = {
            contactPhone: typeof profilePayload?.profile?.contactPhone === "string" ? profilePayload.profile.contactPhone : "",
            country: typeof profilePayload?.profile?.country === "string" ? profilePayload.profile.country : "",
            city: typeof profilePayload?.profile?.city === "string" ? profilePayload.profile.city : "",
          };
          if (active) {
            setContact(details);
            setContactDraft(details);
            setUser((current) => current ? {
              ...current,
              firstName: typeof profilePayload?.profile?.firstName === "string" ? profilePayload.profile.firstName : "",
              lastName: typeof profilePayload?.profile?.lastName === "string" ? profilePayload.profile.lastName : "",
            } : current);
          }
        } catch (profileError) {
          if (active) {
            setError(profileError instanceof Error ? profileError.message : "Unable to load your contact details.");
          }
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load your profile.");
          router.replace("/");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function saveContactDetails() {
    if (savingContact) return;
    setSavingContact(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/backend/org/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactDraft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to save your contact details.");
      }
      const saved = {
        contactPhone: String(payload?.profile?.contactPhone || ""),
        country: String(payload?.profile?.country || ""),
        city: String(payload?.profile?.city || ""),
      };
      setContact(saved);
      setContactDraft(saved);
      setEditingContact(false);
      setMessage(payload?.message || "Your contact details have been updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your contact details.");
    } finally {
      setSavingContact(false);
    }
  }

  function cancelContactEdit() {
    setContactDraft(contact);
    setEditingContact(false);
  }

  async function uploadPhoto(file?: File) {
    if (!file || uploading) return;
    setError("");
    setMessage("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 25 * 1024) {
      setError("Your profile photo must not exceed 25 KB.");
      return;
    }

    const body = new FormData();
    body.append("photo", file);
    setUploading(true);
    try {
      const response = await fetch("/api/backend/org/profile/photo", {
        method: "PUT",
        credentials: "same-origin",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Photo upload failed.");
      setPhotoVersion(Date.now());
      window.dispatchEvent(new Event("hrms:org-admin-photo-updated"));
      setMessage("Your profile photo has been updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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

  const adminDisplayName = [user?.firstName, user?.lastName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    || user?.email?.split("@")[0]
    || "Organization Admin";
  const initials = adminDisplayName
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "OA";

  return (
    <div className="org-admin-workspace min-h-screen bg-[#0b0f17] font-sans text-slate-100">
      <OrganizationAdminSidebar activePage="profile" />
      <main className="min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="profile"
          organizationName={user?.organizationName || "Organization"}
          loggingOut={loggingOut}
          onLogout={() => void logout()}
          commandPaletteOpen={paletteOpen}
          onCommandPaletteOpenChange={setPaletteOpen}
        />

        <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">My Profile</h1>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}

          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-br from-[#17263a] via-[#121d2d] to-[#101722] p-5 shadow-2xl shadow-black/20 sm:p-7">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border border-sky-200/[0.08]" />
              <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-10 size-44 rounded-full bg-sky-300/[0.06] blur-3xl" />

              <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-[1.6rem] border border-sky-200/20 bg-gradient-to-br from-sky-300/20 to-indigo-300/10 text-2xl font-black text-sky-100 shadow-inner">
                    {initials}
                    <img
                      key={photoVersion}
                      src={`/api/backend/org/profile/photo?v=${photoVersion}`}
                      alt="Organization Admin profile"
                      className="absolute inset-0 z-10 h-full w-full object-cover"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => void uploadPhoto(event.target.files?.[0])}
                    aria-label="Choose a profile photo"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || loading || !user}
                    className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-sky-200/15 bg-sky-200/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-200/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Camera size={13} />
                    {uploading ? "Uploading…" : "Change photo"}
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/15 bg-sky-200/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-sky-200">
                      <ShieldCheck size={13} />
                      Verified organization admin
                    </span>
                    <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-200">
                      {loading ? "Verifying…" : user ? "Authenticated" : "Unavailable"}
                    </span>
                  </div>

                  <h2 className="mt-3 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {adminDisplayName}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={14} className="text-sky-300" />
                      {user?.organizationName || "Organization"}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                      <Mail size={14} className="shrink-0 text-sky-300" />
                      {user?.email || (loading ? "Loading account…" : "Account unavailable")}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
              <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#121b29] p-5 shadow-xl shadow-black/10 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-sky-200">
                      <UserRound size={17} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-white">Contact information</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Keep your phone number and location details up to date.
                      </p>
                    </div>
                  </div>
                  {!editingContact ? (
                    <button
                      type="button"
                      onClick={() => {
                        setContactDraft({
                          ...contact,
                          contactPhone: replacePhoneCountryCode(contact.contactPhone, "", contact.country),
                        });
                        setEditingContact(true);
                      }}
                      disabled={loading || !user}
                      className="rounded-lg border border-sky-300/20 bg-sky-300/[0.06] px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-300/[0.12] disabled:opacity-50"
                    >
                      Edit details
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={cancelContactEdit} disabled={savingContact} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.04] disabled:opacity-50">
                        Cancel
                      </button>
                      <button type="button" onClick={() => void saveContactDetails()} disabled={savingContact} className="rounded-lg bg-sky-300 px-3 py-2 text-xs font-bold text-[#071421] hover:bg-sky-200 disabled:opacity-50">
                        {savingContact ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  )}
                </div>
                {editingContact ? (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Phone number
                      <input
                        type="tel"
                        maxLength={50}
                        autoComplete="tel"
                        value={contactDraft.contactPhone}
                        onChange={(event) => setContactDraft((current) => ({ ...current, contactPhone: event.target.value }))}
                        className="mt-2 w-full rounded-xl border border-white/[0.11] bg-[#0b121d] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-sky-300/50"
                        placeholder="Enter phone number"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-300">
                      Country
                      <CountrySelect
                        id="organization-admin-profile-country"
                        value={contactDraft.country}
                        onChange={(nextCountry) => setContactDraft((current) => ({
                          ...current,
                          country: nextCountry,
                          contactPhone: replacePhoneCountryCode(
                            current.contactPhone,
                            current.country,
                            nextCountry,
                          ),
                        }))}
                        className="mt-2 h-11 w-full rounded-xl border border-white/[0.11] bg-[#0b121d] px-3.5 text-sm text-slate-100 outline-none focus:border-sky-300/50"
                        placeholder="Select or search your country…"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-300 sm:col-span-2">
                      City
                      <input
                        type="text"
                        maxLength={100}
                        autoComplete="address-level2"
                        value={contactDraft.city}
                        onChange={(event) => setContactDraft((current) => ({ ...current, city: event.target.value }))}
                        className="mt-2 w-full rounded-xl border border-white/[0.11] bg-[#0b121d] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-sky-300/50"
                        placeholder="Enter city"
                      />
                    </label>
                  </div>
                ) : (
                  <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
                    <ProfileField label="Phone number" value={contact.contactPhone} />
                    <ProfileField label="Country" value={formatCountryWithFlag(contact.country)} />
                    <ProfileField label="City" value={contact.city} />
                  </dl>
                )}
              </section>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
