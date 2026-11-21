"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { WorkspaceGate } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiRequest } from "@/lib/api-client";
import type { WorkspaceRole, WorkspaceSessionPayload } from "@/types/workspace";

function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const result = await apiRequest<{ message?: string }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      setSuccess(result.message || "Password changed. Please sign in again.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      window.setTimeout(() => router.replace("/"), 1600);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to change the password."); }
    finally { setBusy(false); }
  }

  return <><PageHeader eyebrow="Account security" title="Change password" description="Update your sign-in credentials. Your current session will be signed out after a successful change." /><div style={{ maxWidth: 640, margin: "0 auto" }}><Panel className="panel-pad"><div className="form-note" style={{ marginBottom: 20 }}><ShieldCheck size={16} /> The existing backend applies password policy, rate limiting, and invalidates existing sessions after a successful change.</div><form onSubmit={submit} style={{ display: "grid", gap: 15 }}>
    {error ? <div role="alert" className="form-error">{error}</div> : null}{success ? <div role="status" className="info-callout">{success}</div> : null}
    <Field label="Current password"><TextInput type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
    <Field label="New password"><TextInput type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
    <Field label="Confirm new password"><TextInput type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
    <div style={{ display: "flex", justifyContent: "flex-end" }}><Button type="submit" variant="primary" busy={busy} leading={<KeyRound size={15} />}>Change password</Button></div>
  </form></Panel></div></>;
}

function SessionRoleResolver({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function resolve() {
      try {
        const admin = await apiRequest<WorkspaceSessionPayload>("/org/auth/me");
        if (admin.authenticated && admin.user?.role === "ORGANIZATION_ADMIN") { if (active) setRole("ORGANIZATION_ADMIN"); return; }
      } catch { /* Not an organization-admin session; try workforce auth. */ }
      try {
        const workforce = await apiRequest<WorkspaceSessionPayload>("/employee-auth/me");
        const candidate = workforce.user?.role;
        if (workforce.authenticated && (candidate === "HR_MANAGER" || candidate === "DEPARTMENT_MANAGER" || candidate === "EMPLOYEE")) {
          if (active) setRole(candidate);
          return;
        }
      } catch { /* WorkspaceGate will enforce the actual authenticated session. */ }
      if (active) setFailed(true);
    }
    void resolve();
    return () => { active = false; };
  }, []);
  if (!role) return <main className="loading-state" style={{ minHeight: "60vh", display: "grid", alignContent: "center", justifyContent: "center", textAlign: "center", padding: 24 }}><p>{failed ? <>Your session could not be verified. <Link href="/" style={{ color: "var(--accent)", fontWeight: 700 }}>Return to sign in</Link>.</> : "Verifying your account…"}</p></main>;
  return <WorkspaceGate role={role}>{children}</WorkspaceGate>;
}

export default function ChangePasswordPage() {
  return <SessionRoleResolver><ChangePasswordForm /></SessionRoleResolver>;
}
