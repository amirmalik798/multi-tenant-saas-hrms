"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api-client";
import type { WorkspaceRole, WorkspaceSessionPayload, WorkspaceUser } from "@/types/workspace";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { roleLabels } from "@/lib/workspace-config";
import { getISODateInTimeZone } from "@/lib/format";
import { useSmartRefresh } from "@/lib/smart-refresh";

interface WorkspaceContextValue {
  user: WorkspaceUser;
  timeZone: string;
  timeZoneStatus: "loading" | "ready" | "unavailable";
  currencyCode: string | null;
  workDate: string | null;
  setupCompleted: boolean;
  refreshSession: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside a WorkspaceGate");
  return value;
}

function roleHome(role: WorkspaceRole) {
  switch (role) {
    case "ORGANIZATION_ADMIN": return "/org/dashboard";
    case "HR_MANAGER": return "/hr/dashboard";
    case "DEPARTMENT_MANAGER": return "/dm/dashboard";
    case "EMPLOYEE": return "/employee/dashboard";
  }
}

function formatAccountName(_email: string, role: WorkspaceRole) {
  return roleLabels[role];
}

function Loading({ message }: { message: string }) {
  return <main className="loading-state" style={{ minHeight: "100vh", display: "grid", alignContent: "center", justifyContent: "center" }}><div className="state-icon"><LoaderCircle className="spin" size={20} /></div><p>{message}</p></main>;
}

export function WorkspaceGate({ role, children }: { role: WorkspaceRole; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [timeZone, setTimeZone] = useState("Africa/Kigali");
  const [timeZoneStatus, setTimeZoneStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [currencyCode, setCurrencyCode] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState<string | null>(null);
  const [setupCompleted, setSetupCompleted] = useState(true);
  const [licenseDenied, setLicenseDenied] = useState(false);
  const [licenseCheckError, setLicenseCheckError] = useState("");

  const refreshSession = useCallback(async () => {
    setChecking(true);
    setError("");
    setLicenseCheckError("");
    setTimeZoneStatus("loading");
    let organizationTimeZone: string | null = null;
    try {
      const endpoint = role === "ORGANIZATION_ADMIN" ? "/org/auth/me" : "/employee-auth/me";
      const result = await apiRequest<WorkspaceSessionPayload>(endpoint);
      const candidate = result.user;
      if (!result.authenticated || !candidate || candidate.role !== role || typeof candidate.id !== "string" || typeof candidate.organizationId !== "string" || typeof candidate.organizationName !== "string") {
        if (candidate?.role && ["ORGANIZATION_ADMIN", "HR_MANAGER", "DEPARTMENT_MANAGER", "EMPLOYEE"].includes(candidate.role)) {
          router.replace(roleHome(candidate.role as WorkspaceRole));
        } else {
          router.replace("/");
        }
        return;
      }
      const email = typeof candidate.email === "string" ? candidate.email : "";
      let firstName = typeof candidate.firstName === "string" ? candidate.firstName : "";
      let lastName = typeof candidate.lastName === "string" ? candidate.lastName : "";

      // The auth endpoints intentionally return compact session identity. Load
      // the role-scoped profile for the user's actual name without making an
      // optional profile lookup a prerequisite for authentication.
      try {
        if (role === "ORGANIZATION_ADMIN") {
          const profile = await apiRequest<{ profile?: { firstName?: string; lastName?: string } }>("/org/profile");
          firstName = profile.profile?.firstName || firstName;
          lastName = profile.profile?.lastName || lastName;
        } else if (role === "EMPLOYEE") {
          const profile = await apiRequest<{ employee?: { first_name?: string; last_name?: string | null } }>("/employees/me");
          firstName = profile.employee?.first_name || firstName;
          lastName = profile.employee?.last_name || lastName;
        } else if (candidate.employeeId) {
          const profile = await apiRequest<{ employee?: { first_name?: string; last_name?: string | null } }>(`/employees/${encodeURIComponent(candidate.employeeId)}`);
          firstName = profile.employee?.first_name || firstName;
          lastName = profile.employee?.last_name || lastName;
        }
      } catch {
        // Keep the workspace usable if the profile endpoint is temporarily unavailable.
      }

      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || formatAccountName(email, role);
      const verified: WorkspaceUser = {
        id: candidate.id,
        email,
        role: candidate.role,
        organizationId: candidate.organizationId,
        organizationName: candidate.organizationName,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        displayName,
        employeeId: typeof candidate.employeeId === "string" ? candidate.employeeId : undefined,
        permissions: Array.isArray(candidate.permissions) ? candidate.permissions.filter((p): p is string => typeof p === "string") : [],
      };
      setUser(verified);

      try {
        const context = await apiRequest<{ timeZone?: string; currencyCode?: string | null }>("/workspace/context");
        if (typeof context.timeZone === "string" && context.timeZone.trim()) {
          // Validate with Intl before treating a server-supplied timezone as authoritative.
          new Intl.DateTimeFormat("en", { timeZone: context.timeZone }).format(new Date());
          organizationTimeZone = context.timeZone;
          setTimeZone(context.timeZone);
          setTimeZoneStatus("ready");
        } else {
          setTimeZoneStatus("unavailable");
        }
        setCurrencyCode(typeof context.currencyCode === "string" ? context.currencyCode : null);
      } catch {
        setTimeZoneStatus("unavailable");
        // Do not silently present the fallback timezone as authoritative.
      }

      try {
        if (!organizationTimeZone) throw new Error("The organization timezone could not be verified.");
        const organizationDate = getISODateInTimeZone(organizationTimeZone);
        const workContext = await apiRequest<{ today?: string }>(`/attendance/calendar?fromDate=${organizationDate}&toDate=${organizationDate}`);
        if (typeof workContext.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(workContext.today)) setWorkDate(workContext.today);
      } catch {
        // Pages that need a verified work date show their own recoverable warning.
      }

      try {
        const access = await apiRequest<{ license?: { canAccess?: boolean }; setupCompleted?: boolean }>("/license-access");
        const canAccess = access.license?.canAccess === true;
        setLicenseDenied(!canAccess);
        setSetupCompleted(access.setupCompleted !== false);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) throw caught;
        setLicenseCheckError(caught instanceof Error ? caught.message : "Unable to verify your organization license.");
      }
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        router.replace("/");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to verify your workspace session.");
      }
    } finally {
      setChecking(false);
    }
  }, [role, router]);

  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useSmartRefresh(async () => {
    if (error && !user) { await refreshSession(); return; }
    if (licenseCheckError) {
      try {
        const access = await apiRequest<{ license?: { canAccess?: boolean }; setupCompleted?: boolean }>("/license-access");
        setLicenseDenied(access.license?.canAccess !== true);
        setSetupCompleted(access.setupCompleted !== false);
        setLicenseCheckError("");
      } catch (caught) {
        setLicenseCheckError(caught instanceof Error ? caught.message : "Unable to verify your organization license.");
      }
    }
  }, Boolean((error && !user) || licenseCheckError));

  useEffect(() => {
    if (!user) return;
    if (role === "ORGANIZATION_ADMIN" && licenseDenied && pathname !== "/org/license") {
      router.replace("/org/license");
      return;
    }
    if (role === "ORGANIZATION_ADMIN" && !setupCompleted && !licenseDenied && pathname !== "/org/settings") {
      router.replace("/org/settings?setup=required");
    }
  }, [role, user, setupCompleted, licenseDenied, pathname, router]);

  const context = useMemo(() => user ? { user, timeZone, timeZoneStatus, currencyCode, workDate, setupCompleted, refreshSession } : null, [user, timeZone, timeZoneStatus, currencyCode, workDate, setupCompleted, refreshSession]);

  if (checking && !user) return <Loading message="Verifying your secure workspace…" />;
  if (error && !user) {
    return <main className="error-state" style={{ minHeight: "100vh", display: "grid", alignContent: "center", justifyContent: "center" }}>
      <div className="state-icon"><AlertCircle size={20} /></div><h3>Workspace unavailable</h3><p>{error}</p>
    </main>;
  }
  if (!context) return <Loading message="Opening your workspace…" />;
  if (licenseCheckError && !(role === "ORGANIZATION_ADMIN" && pathname === "/org/license")) return <main className="error-state" style={{ minHeight: "100vh", display: "grid", alignContent: "center", justifyContent: "center" }}><div className="state-icon"><ShieldCheck size={20} /></div><h3>License status could not be verified</h3><p>{licenseCheckError}. Workspace access remains unavailable until the license status can be checked.</p></main>;
  if (licenseDenied && role !== "ORGANIZATION_ADMIN") {
    return <main className="error-state" style={{ minHeight: "100vh", display: "grid", alignContent: "center", justifyContent: "center" }}>
      <div className="state-icon"><ShieldCheck size={20} /></div><h3>Workspace access is restricted</h3><p>Your organization’s HRMS license is not currently active. Contact your Organization Admin for assistance.</p>
    </main>;
  }
  return <WorkspaceContext.Provider value={context}><WorkspaceShell>{children}</WorkspaceShell></WorkspaceContext.Provider>;
}
