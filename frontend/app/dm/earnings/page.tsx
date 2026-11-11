"use client";

import EmployeeEarningsWorkspace from "../../components/employee/EmployeeEarningsWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerEarningsPage() {
  const auth = useDepartmentManagerSession();
  if (auth.checking) return <DepartmentManagerLoading message="Loading your earnings…" />;
  if (!auth.user) return <DepartmentManagerUnavailable message={auth.error || "Your Department Manager session could not be verified."} onRetry={() => void auth.reload()} />;
  return <DepartmentManagerShell user={auth.user} title="My Earnings" description="Review your own estimated earnings and personal payment history." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}>
    <EmployeeEarningsWorkspace employeeId={auth.user.employeeId} showTitle={false} showMonthSelector={false} />
  </DepartmentManagerShell>;
}
