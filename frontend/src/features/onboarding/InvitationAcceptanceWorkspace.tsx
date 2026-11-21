"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
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

  return <main className="auth-page">
    <div className="auth-brand"><span className="brand-mark"><Activity size={19} /></span><span><strong>HRMS</strong><small>Workforce platform</small></span></div>
    <Panel className="auth-card panel-pad">
      {loading ? <div className="loading-state">Verifying your invitation…</div> : accepted ? <div className="auth-success">
        <span className="state-icon"><CheckCircle2 size={22} /></span><p className="eyebrow">Invitation accepted</p><h1>Your account is ready</h1><p>{isAdmin ? "Your Organization Admin account has been created and the organization has completed its initial activation workflow." : "Your workforce account has been activated. You can now sign in using the invited email address and the password you created."}</p><Link className="button button-primary" href="/">Continue to sign in</Link>
      </div> : error && !preview ? <div className="auth-error-state"><span className="state-icon"><ShieldCheck size={20} /></span><h1>Invitation unavailable</h1><p>{error}</p><Link className="button button-secondary" href="/">Return to sign in</Link></div> : preview ? <>
        <p className="eyebrow">Secure account setup</p><h1>{isAdmin ? "Set up your organization account" : "Activate your workforce account"}</h1><p className="auth-intro">You have been invited to {preview.organizationName}. Review the details before activating access.</p>
        <div className="invitation-summary"><div><span>Organization</span><strong>{preview.organizationName}</strong></div><div><span>Email address</span><strong>{preview.email}</strong></div>{!isAdmin ? <><div><span>Workforce member</span><strong>{preview.employeeName || preview.employeeCode || "Employee"}</strong></div><div><span>Assigned role</span><strong>{(preview.role || "EMPLOYEE").replaceAll("_", " ")}</strong></div></> : <div><span>Invitation expires</span><strong>{new Date(preview.expiresAt).toLocaleString()}</strong></div>}</div>
        <form className="auth-form" onSubmit={submit}>
          {isAdmin ? <><div className="form-grid"><Field label="First name"><TextInput required minLength={2} maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field><Field label="Last name"><TextInput required minLength={1} maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field><Field label="Contact number"><TextInput required maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Include country code" /></Field><Field label="Country"><TextInput maxLength={100} value={country} onChange={(event) => setCountry(event.target.value)} /></Field><Field label="City"><TextInput maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} /></Field></div></> : null}
          <Field label="Create password" hint="At least 15 characters and no more than 72 UTF-8 bytes."><TextInput type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          {isAdmin ? <Field label="Confirm password"><TextInput type="password" required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field> : null}
          {passwordError ? <p className="field-error">{passwordError}</p> : null}
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <Button type="submit" size="lg" busy={saving} className="auth-submit">{isAdmin ? "Create Organization Admin account" : "Activate workforce account"}</Button>
        </form>
      </> : null}
    </Panel>
    <p className="auth-footnote"><LockKeyhole size={13} /> Your invitation is verified by the HRMS backend. Account creation and invitation consumption happen atomically.</p>
  </main>;
}
