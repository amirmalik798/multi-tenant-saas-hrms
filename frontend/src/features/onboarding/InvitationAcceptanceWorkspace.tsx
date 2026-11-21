"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
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
        setPhone(invitation.adminProfile?.phone || "");
        setCountry(invitation.adminProfile?.country || "");
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
    if (isAdmin && password !== confirmPassword) {
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
      <div className="org-invitation-layout">
        <aside className="org-invitation-aside">
          <div className="org-invitation-aside-inner">
            <span className="org-invitation-kicker"><ShieldCheck size={14} /> ORGANIZATION ADMINISTRATION</span>
            <div className="org-invitation-emblem"><ShieldCheck size={27} strokeWidth={1.7} /></div>
            <p className="org-invitation-overline">A secure start for your organization</p>
            <h2>People operations, brought together.</h2>
            <p className="org-invitation-aside-copy">You are one step away from your organization's HRMS workspace. Set up your administrator access to get started.</p>
            <div className="org-invitation-trust-list">
              <div><span><CheckCircle2 size={15} /></span><p><strong>One connected workspace</strong><small>Manage your organization and workforce in one place.</small></p></div>
              <div><span><LockKeyhole size={15} /></span><p><strong>Protected administrator access</strong><small>Your account is activated through a verified invitation.</small></p></div>
              <div><span><Activity size={15} /></span><p><strong>Ready for your next step</strong><small>Complete setup and configure your organization.</small></p></div>
            </div>
          </div>
          <div className="org-invitation-aside-footer">SECURE WORKFORCE MANAGEMENT <span>·</span> HRMS</div>
        </aside>
        <section className="org-invitation-main">
          <div className="org-invitation-main-inner">
            <Panel className="auth-card org-invitation-card panel-pad">
              {loading ? <div className="loading-state">Verifying your invitation…</div> : accepted ? <div className="auth-success">
                <span className="state-icon"><CheckCircle2 size={22} /></span><p className="eyebrow">Invitation accepted</p><h1>Your account is ready</h1><p>{isAdmin ? "Your Organization Admin account has been created and the organization has completed its initial activation workflow." : "Your workforce account has been activated. You can now sign in using the invited email address and the password you created."}</p><Link className="button button-primary" href="/">Continue to sign in</Link>
              </div> : error && !preview ? <div className="auth-error-state"><span className="state-icon"><ShieldCheck size={20} /></span><h1>Invitation unavailable</h1><p>{error}</p><Link className="button button-secondary" href="/">Return to sign in</Link></div> : preview ? <>
                <div className="org-invitation-card-heading">
                  <span className="org-invitation-step">ACCOUNT ACTIVATION <span>01 / 01</span></span>
                  <p className="eyebrow">Secure account setup</p>
                  <h1>Set up your organization account</h1>
                  <p className="auth-intro">You have been invited to activate administrator access for your organization. Review the details, complete your profile and create a secure password.</p>
                </div>
                <div className="invitation-summary"><div><span>Organization</span><strong>{preview.organizationName}</strong></div><div><span>Email address</span><strong>{preview.email}</strong></div><div><span>Invitation expires</span><strong>{new Date(preview.expiresAt).toLocaleString()}</strong></div></div>
                <form className="auth-form org-invitation-form" onSubmit={submit}>
                  <div className="org-invitation-section-title"><span>01</span><div><strong>Administrator details</strong><small>Confirm your contact information.</small></div></div>
                  <div className="form-grid org-invitation-profile-grid"><Field label="First name"><TextInput required minLength={2} maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field><Field label="Last name"><TextInput required minLength={1} maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field><Field label="Contact number"><TextInput required maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Include country code" /></Field><Field label="Country"><TextInput maxLength={100} value={country} onChange={(event) => setCountry(event.target.value)} /></Field><Field label="City"><TextInput maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} /></Field></div>
                  <div className="org-invitation-section-title org-invitation-password-title"><span>02</span><div><strong>Secure your account</strong><small>Create a strong password to protect administrator access.</small></div></div>
                  <div className="form-grid org-invitation-password-grid">
                    <Field label="Create password" hint="At least 15 characters and no more than 72 UTF-8 bytes."><TextInput type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
                    <Field label="Confirm password"><TextInput type="password" required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>
                  </div>
                  {passwordError ? <p className="field-error">{passwordError}</p> : null}
                  {error ? <div className="form-error" role="alert">{error}</div> : null}
                  <Button type="submit" size="lg" busy={saving} className="auth-submit org-invitation-submit">Create Organization Admin account <ShieldCheck size={16}/></Button>
                  <p className="org-invitation-legal"><LockKeyhole size={13}/> Your password is securely processed. Invitation verification and account creation are handled by HRMS.</p>
                </form>
              </> : null}
            </Panel>
            <p className="auth-footnote org-invitation-footnote"><LockKeyhole size={13} /> This invitation is verified by HRMS. Your account is activated only after successful acceptance.</p>
          </div>
        </section>
      </div>
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
                  <Field label="Create password" hint="At least 15 characters and no more than 72 UTF-8 bytes."><TextInput type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
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
