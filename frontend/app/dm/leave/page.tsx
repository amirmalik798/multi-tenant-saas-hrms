"use client";
import LeaveManagementWorkspace from "../../components/leave/LeaveManagementWorkspace";
import { DepartmentManagerLoading, DepartmentManagerShell, DepartmentManagerUnavailable, useDepartmentManagerSession } from "../../components/dm/DepartmentManagerChrome";
export default function DepartmentManagerLeavePage() {
  const auth = useDepartmentManagerSession();
  if (auth.checking) return <DepartmentManagerLoading message="Loading team leave requests…" />;
  if (!auth.user) return <DepartmentManagerUnavailable message={auth.error || "Your Department Manager session could not be verified."} onRetry={() => void auth.reload()} />;
  return <DepartmentManagerShell user={auth.user} title="Team leave & holidays" description="Review leave requests for your managed departments and view public holidays." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}><LeaveManagementWorkspace audience="department-manager" /></DepartmentManagerShell>;
}
