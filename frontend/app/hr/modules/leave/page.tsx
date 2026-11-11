"use client";
import LeaveManagementWorkspace from "../../../components/leave/LeaveManagementWorkspace";
import { HRManagerLoading, HRManagerShell, HRManagerUnavailable, useHRManagerSession } from "../../../components/hr/HRManagerChrome";
export default function HRManagerLeavePage() {
  const auth = useHRManagerSession();
  if (auth.checking) return <HRManagerLoading message="Loading leave and holidays…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;
  return <HRManagerShell user={auth.user} activePage="modules" title="Leave & public holidays" description="Leave requests and holiday calendar." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}
      logoutError={auth.error}><LeaveManagementWorkspace audience="hr-manager" /></HRManagerShell>;
}
