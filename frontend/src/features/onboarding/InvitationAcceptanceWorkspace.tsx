"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, PasswordInput, TextInput } from "@/components/ui/Field";
import { CountrySelect, COUNTRY_OPTIONS, countryOption, getCountryCallingCode, replacePhoneCountryCode, type CountryOption } from "@/components/ui/CountryPhoneFields";
import { Panel } from "@/components/ui/Panel";
import { apiRequest } from "@/lib/api-client";

interface InvitationPreview {
  email: string;
  organizationName: string;
  expiresAt: string;
  employeeCode?: string;
  employeeName?: string;
  role?: string;
  adminProfile?: { firstName?: string | null; lastName?: string | null; phone?: string | null; country?: string | null; city?: string | null };
}

function detectCountryFromPhone(phone: string, preferredCountry?: string): CountryOption | null {
  const digits = phone.trim().startsWith("+") ? phone.replace(/\D/g, "") : "";
  if (!digits) return null;
  const matches = COUNTRY_OPTIONS
    .filter((item) => digits.startsWith(item.callingCode))
    .sort((left, right) => right.callingCode.length - left.callingCode.length);
  const preferred = countryOption(preferredCountry);
  return matches.find((item) => item.code === preferred?.code) ?? matches[0] ?? null;
}

function detectCountryFromBrowser(): CountryOption | null {
  if (typeof navigator === "undefined") return null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneCountries: Record<string, string> = {
    "Africa/Kigali": "RW",
    "Africa/Nairobi": "KE",
    "Africa/Kampala": "UG",
    "Africa/Dar_es_Salaam": "TZ",
    "Africa/Johannesburg": "ZA",
    "Africa/Lagos": "NG",
    "Africa/Accra": "GH",
    "Africa/Cairo": "EG",
    "Africa/Casablanca": "MA",
    "Europe/London": "GB",
    "Europe/Paris": "FR",
    "Europe/Berlin": "DE",
    "Asia/Karachi": "PK",
    "Asia/Kolkata": "IN",
    "Asia/Dhaka": "BD",
    "Asia/Dubai": "AE",
    "Asia/Riyadh": "SA",
    "Asia/Singapore": "SG",
    "Asia/Tokyo": "JP",
    "Asia/Seoul": "KR",
    "Asia/Bangkok": "TH",
    "Asia/Jakarta": "ID",
    "Asia/Manila": "PH",
    "Asia/Colombo": "LK",
    "America/New_York": "US",
    "America/Chicago": "US",
    "America/Denver": "US",
    "America/Los_Angeles": "US",
    "America/Toronto": "CA",
    "America/Vancouver": "CA",
    "America/Mexico_City": "MX",
    "America/Sao_Paulo": "BR",
    "Australia/Sydney": "AU",
    "Pacific/Auckland": "NZ",
  };
  const timeZoneCountry = countryOption(timeZoneCountries[timeZone] ?? "");
  if (timeZoneCountry) return timeZoneCountry;

  const localeRegion = navigator.language.match(/[-_]([A-Za-z]{2})(?:-|$)/)?.[1];
  return countryOption(localeRegion);
}

export function InvitationAcceptanceWorkspace({ token, type }: { token: string; type: "organization-admin" | "workforce" }) {
  const isAdmin = type === "organization-admin";
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setError("The invitation link does not contain a valid token.");
      setLoading(false);
      return;
    }
    const endpoint = isAdmin ? "/invitations/accept" : "/employee-invitations/accept";
    apiRequest<{ invitation?: InvitationPreview }>(`${endpoint}?token=${encodeURIComponent(token)}`)
      .then((result) => {
        if (!active) return;
        const invitation = result.invitation;
        if (!invitation) throw new Error("The invitation preview was not returned by the server.");
        setPreview(invitation);
        setFirstName(invitation.adminProfile?.firstName || "");
        setLastName(invitation.adminProfile?.lastName || "");
        const savedPhone = invitation.adminProfile?.phone || "";
        const storedCountry = invitation.adminProfile?.country || "";
        const detectedCountry =
          detectCountryFromPhone(savedPhone, storedCountry) ??
          countryOption(storedCountry) ??
          detectCountryFromBrowser();
        const resolvedCountry = detectedCountry?.name ?? storedCountry;
        setCountry(resolvedCountry);
        setPhone(
          savedPhone.startsWith("+")
            ? savedPhone
            : resolvedCountry
              ? replacePhoneCountryCode(savedPhone, "", resolvedCountry)
              : savedPhone,
        );
        setCity(invitation.adminProfile?.city || "");
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to verify this invitation."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin, token]);

  const passwordError = password.length > 0 && Array.from(password).length < 15
    ? "Use at least 15 characters."
    : password.length > 0 && new TextEncoder().encode(password).length > 72
      ? "Password must not exceed 72 UTF-8 bytes."
      : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (Array.from(password).length < 15 || new TextEncoder().encode(password).length > 72) {
      setError("Password must contain at least 15 characters and must not exceed 72 UTF-8 bytes.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true); setError("");
    try {
      if (isAdmin) {
        await apiRequest("/invitations/accept", { method: "POST", body: JSON.stringify({ token, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), country: country.trim(), city: city.trim(), password }) });
      } else {
        await apiRequest("/employee-invitations/accept", { method: "POST", body: JSON.stringify({ token, password }) });
      }
      setPassword(""); setConfirmPassword(""); setAccepted(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to accept this invitation."); }
    finally { setSaving(false); }
  }

  return <main className={isAdmin ? "auth-page org-invitation-page" : "auth-page workforce-invitation-page"}>
    <div className={isAdmin ? "auth-brand org-invitation-brand" : "auth-brand"}><span className="brand-mark"><Activity size={19} /></span><span><strong>HRMS</strong><small>Workforce platform</small></span></div>
    {isAdmin ? <>
      <section className="org-invitation-simple-shell">
        <div className="org-invitation-simple-card">
          {loading ? <div className="loading-state">Verifying your invitation…</div> : accepted ? <div className="org-invitation-simple-state">
            <span className="state-icon"><CheckCircle2 size={22} /></span>
            <p className="eyebrow">INVITATION ACCEPTED</p>
            <h1>Your account is ready.</h1>
            <p>Your Organization Admin account has been created. Sign in to continue to your workspace.</p>
            <Link className="button button-primary" href="/">Continue to sign in</Link>
          </div> : error && !preview ? <div className="org-invitation-simple-state">
            <span className="state-icon"><ShieldCheck size={20} /></span>
            <p className="eyebrow">INVITATION STATUS</p>
            <h1>Invitation unavailable</h1>
            <p>{error}</p>
            <Link className="button button-secondary" href="/">Return to sign in</Link>
          </div> : preview ? <>
            <div className="org-invitation-simple-heading">
              <p className="eyebrow">ORGANIZATION ADMINISTRATION</p>
              <h1>Set up your account</h1>
              <p>Confirm your details and create a password to activate administrator access.</p>
              <div className="org-invitation-simple-context">
                <strong>{preview.organizationName}</strong>
                <span>{preview.email}</span>
              </div>
            </div>
            <form className="org-invitation-simple-form" onSubmit={submit}>
              <div className="org-invitation-simple-grid">
                <Field label="First name">
                  <TextInput required minLength={2} maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
                </Field>
                <Field label="Last name">
                  <TextInput required minLength={1} maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
                </Field>
                <Field label="Country">
                  <CountrySelect
                    id="org-admin-country"
                    value={country}
                    onChange={(value) => {
                      setCountry(value);
                      setPhone((current) => replacePhoneCountryCode(current, country, value));
                    }}
                    required
                    className="text-input"
                    placeholder="Search or select your country"
                  />
                </Field>
                <Field label="Phone number" hint="The country calling code is added automatically. Enter an international prefix to detect a different country.">
                  <TextInput
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    maxLength={50}
                    value={phone}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPhone(value);
                      const detected = detectCountryFromPhone(value, country);
                      if (detected && detected.name !== country) setCountry(detected.name);
                    }}
                    placeholder={country ? getCountryCallingCode(country) : "Select a country first"}
                  />
                </Field>
                <Field label="City">
                  <TextInput required maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" />
                </Field>
              </div>
              <div className="org-invitation-simple-divider">
                <span>Secure your account</span>
              </div>
              <div className="org-invitation-simple-grid">
                <Field label="Create password" hint="At least 15 characters; maximum 72 UTF-8 bytes.">
                  <PasswordInput required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </Field>
                <Field label="Confirm password">
                  <PasswordInput required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </Field>
              </div>
              {passwordError ? <p className="field-error">{passwordError}</p> : null}
              {error ? <div className="form-error" role="alert">{error}</div> : null}
              <Button type="submit" size="lg" busy={saving} className="org-invitation-simple-submit">
                Create administrator account <ShieldCheck size={16} />
              </Button>
              <p className="org-invitation-simple-footnote"><LockKeyhole size={13} /> Your invitation is verified and your account is activated securely by HRMS.</p>
            </form>
          </> : null}
        </div>
      </section>
    </> : <>
      <div className="workforce-invitation-layout">
        <aside className="workforce-invitation-aside">
          <div className="workforce-invitation-aside-inner">
            <span className="workforce-invitation-kicker"><Users size={14} /> WORKFORCE ACCESS</span>
            <div className="workforce-invitation-emblem"><ShieldCheck size={28} strokeWidth={1.7} /></div>
            <p className="workforce-invitation-overline">Your next chapter starts here</p>
            <h2>One team. One place to do great work.</h2>
            <p className="workforce-invitation-aside-copy">Your organization has invited you to its HRMS workspace. Activate your account to connect with your team and access the tools for your role.</p>
            <div className="workforce-invitation-trust">
              <div><CheckCircle2 size={16} /><span><strong>Verified invitation</strong><small>Your access is linked to your organization.</small></span></div>
              <div><LockKeyhole size={16} /><span><strong>Private account</strong><small>Your password protects your personal workspace.</small></span></div>
              <div><Activity size={16} /><span><strong>Role-based workspace</strong><small>See the tools and information assigned to you.</small></span></div>
            </div>
          </div>
          <p className="workforce-invitation-aside-footer">PEOPLE OPERATIONS <span>·</span> HRMS</p>
        </aside>
        <section className="workforce-invitation-main">
          <div className="workforce-invitation-main-inner">
            <Panel className="auth-card workforce-invitation-card panel-pad">
              {loading ? <div className="loading-state">Verifying your invitation…</div> : accepted ? <div className="auth-success">
                <span className="state-icon"><CheckCircle2 size={22} /></span><p className="eyebrow">Invitation accepted</p><h1>Your account is ready</h1><p>Your workforce account has been activated. You can now sign in using the invited email address and the password you created.</p><Link className="button button-primary" href="/">Continue to sign in</Link>
              </div> : error && !preview ? <div className="auth-error-state"><span className="state-icon"><ShieldCheck size={20} /></span><h1>Invitation unavailable</h1><p>{error}</p><Link className="button button-secondary" href="/">Return to sign in</Link></div> : preview ? <>
                <div className="workforce-invitation-heading">
                  <span className="workforce-invitation-step">ACCOUNT ACTIVATION <span>01 / 01</span></span>
                  <p className="eyebrow">Secure account setup</p>
                  <h1>Activate your workforce account</h1>
                  <p className="auth-intro">Your organization has invited you to join its workforce workspace. Review your details and create your password to activate access.</p>
                </div>
                <div className="invitation-summary workforce-invitation-summary">
                  <div><span>Organization</span><strong>{preview.organizationName}</strong></div>
                  <div><span>Email address</span><strong>{preview.email}</strong></div>
                  <div><span>Workforce member</span><strong>{preview.employeeName || preview.employeeCode || "Employee"}</strong></div>
                  <div><span>Assigned role</span><strong>{(preview.role || "EMPLOYEE").replaceAll("_", " ")}</strong></div>
                </div>
                <form className="auth-form workforce-invitation-form" onSubmit={submit}>
                  <div className="workforce-invitation-password-heading"><span className="workforce-invitation-password-icon"><LockKeyhole size={15} /></span><span><strong>Secure your account</strong><small>Choose a strong, private password.</small></span></div>
                  <Field label="Create password" hint="At least 15 characters and no more than 72 UTF-8 bytes."><PasswordInput required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
                  <Field label="Confirm password"><PasswordInput required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>
                  {passwordError ? <p className="field-error">{passwordError}</p> : null}
                  {error ? <div className="form-error" role="alert">{error}</div> : null}
                  <Button type="submit" size="lg" busy={saving} className="auth-submit">Activate workforce account <ShieldCheck size={16} /></Button>
                </form>
              </> : null}
            </Panel>
            <p className="auth-footnote workforce-invitation-footnote"><LockKeyhole size={13} /> Your invitation is verified by the HRMS backend. Account creation and invitation consumption happen atomically.</p>
          </div>
        </section>
      </div>
    </>}
  </main>;
}
