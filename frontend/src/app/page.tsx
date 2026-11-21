"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldCheck, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiRequest, ApiError } from "@/lib/api-client";

interface LoginResponse {
  status?: string;
  message?: string;
  destination?: string;
  user?: { role?: string; email?: string };
}

type AuthView = "login" | "forgot" | "reset" | "reset-complete";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) { setResetToken(token); setView("reset"); }
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<LoginResponse>("/unified-auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const destinations: Record<string, string> = {
        SUPER_ADMIN: "/dashboard",
        ORGANIZATION_ADMIN: "/org/dashboard",
        HR_MANAGER: "/hr/dashboard",
        DEPARTMENT_MANAGER: "/dm/dashboard",
        EMPLOYEE: "/employee/dashboard",
      };
      const role = result.user?.role;
      const destination = role ? destinations[role] : undefined;
      const safeDestination = destination ?? (typeof result.destination === "string" && result.destination.startsWith("/") ? result.destination : undefined);
      if (!safeDestination) throw new Error(result.message || "The server did not provide a valid workspace destination.");

      if (role === "SUPER_ADMIN") {
        if (result.destination !== "/dashboard") {
          throw new Error("The server did not provide a valid Super Admin workspace destination.");
        }
        const session = await apiRequest<{ authenticated?: boolean; user?: { role?: string } }>("/auth/me");
        if (session.authenticated !== true || session.user?.role !== "SUPER_ADMIN") {
          throw new Error("Session verification failed. Please sign in again.");
        }
      }
      router.replace(safeDestination);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
      setBusy(false);
    }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ message?: string }>("/password-reset/request", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setNotice(result.message || "If an account with that email exists, password reset instructions will be sent.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Password reset is temporarily unavailable."); }
    finally { setBusy(false); }
  }

  async function completeReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setNotice("");
    if (Array.from(password).length < 15) { setError("Your password must contain at least 15 characters."); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("Your password must not exceed 72 UTF-8 bytes."); return; }
    if (password !== confirmPassword) { setError("Your passwords do not match."); return; }
    setBusy(true);
    try {
      await apiRequest("/password-reset/complete", { method: "POST", body: JSON.stringify({ token: resetToken, password, confirmPassword }) });
      setPassword(""); setConfirmPassword(""); setView("reset-complete");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Password reset is temporarily unavailable."); }
    finally { setBusy(false); }
  }

  const titles: Record<AuthView, { eyebrow: string; title: string; intro: string }> = {
    login: { eyebrow: "WELCOME BACK", title: "Sign in to HRMS", intro: "Use your HRMS account to continue to the workspace assigned to your role." },
    forgot: { eyebrow: "ACCOUNT RECOVERY", title: "Reset your password", intro: "Enter your account email. For security, we will show the same confirmation whether or not an account exists." },
    reset: { eyebrow: "ACCOUNT RECOVERY", title: "Choose a new password", intro: "Create a strong password for your HRMS account." },
    "reset-complete": { eyebrow: "PASSWORD UPDATED", title: "Your password has changed", intro: "Your password reset was successful. Sign in with your new password." },
  };
  const current = titles[view];

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="HRMS platform">
        <div className="brand" style={{ padding: 0, border: 0, height: "auto" }}>
          <span className="brand-mark"><Activity size={19} /></span>
          <span><span className="brand-name" style={{ color: "#fff" }}>HRMS</span><span className="brand-caption" style={{ color: "#91a5c2" }}>Workforce platform</span></span>
        </div>
        <div className="login-story-content">
          <p className="eyebrow" style={{ color: "#9fc0ff", marginBottom: 15 }}>PEOPLE. OPERATIONS. CLARITY.</p>
          <h1>Good work starts with <em>clarity.</em></h1>
          <p>One connected workspace for the people, schedules, time, and decisions that keep your organization moving.</p>
          <div className="login-points">
            <div className="login-point"><ShieldCheck size={17} /> Secure role-based access</div>
            <div className="login-point"><Users size={17} /> Connected workforce</div>
            <div className="login-point"><Zap size={17} /> Clear everyday workflows</div>
            <div className="login-point"><Fingerprint size={17} /> Trusted account sessions</div>
          </div>
        </div>
        <div className="login-story-footer">A focused experience for every role in your organization.</div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">{current.eyebrow}</p>
          <h2>{current.title}</h2>
          <p>{current.intro}</p>

          {view === "login" ? <form className="login-form" onSubmit={submitLogin}>
            <label className="field"><span className="field-label">Email address</span><span style={{ position: "relative" }}><Mail size={16} color="var(--muted)" style={{ position: "absolute", top: 15, left: 13 }} /><input className="text-input" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@organization.com" style={{ paddingLeft: 39 }} /></span></label>
            <label className="field"><span className="field-label">Password</span><span className="password-wrap"><LockKeyhole size={16} color="var(--muted)" style={{ position: "absolute", top: 15, left: 13 }} /><input className="text-input" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" style={{ paddingLeft: 39 }} /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <Button type="submit" size="lg" busy={busy} className="login-submit">Sign in <ArrowRight size={16} /></Button>
            <button type="button" className="auth-text-button" onClick={() => { setView("forgot"); setError(""); setNotice(""); }}>Forgot password?</button>
          </form> : null}

          {view === "forgot" ? <form className="login-form" onSubmit={requestReset}>
            <label className="field"><span className="field-label">Account email</span><input className="text-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@organization.com" /></label>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            {notice ? <div className="success-callout" role="status">{notice}</div> : null}
            <Button type="submit" size="lg" busy={busy} className="login-submit">Send reset instructions <ArrowRight size={16} /></Button>
            <button type="button" className="auth-text-button" onClick={() => { setView("login"); setError(""); setNotice(""); }}><ArrowLeft size={14} /> Back to sign in</button>
          </form> : null}

          {view === "reset" ? <form className="login-form" onSubmit={completeReset}>
            <label className="field"><span className="field-label">New password</span><input className="text-input" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 15 characters" /></label>
            <label className="field"><span className="field-label">Confirm new password</span><input className="text-input" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the same password again" /></label>
            <p className="field-hint">At least 15 characters, no more than 72 UTF-8 bytes. The server also checks against common weak passwords.</p>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <Button type="submit" size="lg" busy={busy} className="login-submit">Update password <ArrowRight size={16} /></Button>
          </form> : null}

          {view === "reset-complete" ? <div className="login-form"><div className="success-callout" role="status">Your password was updated successfully. All previous sessions have been invalidated.</div><Button size="lg" className="login-submit" onClick={() => { setView("login"); setResetToken(""); window.history.replaceState({}, "", "/"); }}>Continue to sign in</Button></div> : null}

          {view !== "login" && view !== "reset-complete" ? <div className="login-helper"><button type="button" onClick={() => { setView("login"); setError(""); setNotice(""); }} className="auth-text-button">Return to sign in</button></div> : null}
          {view === "login" ? <div className="login-helper">Your workspace is selected automatically based on your verified account role. If you cannot access your account, contact your administrator.</div> : null}
        </div>
      </section>
    </main>
  );
}
