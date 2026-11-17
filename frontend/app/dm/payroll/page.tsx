"use client";

import SalaryPaymentsWorkspace from "../../components/payroll/SalaryPaymentsWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerPayrollPage() {
  const auth = useDepartmentManagerSession();
  if (auth.checking) return <DepartmentManagerLoading message="Loading team salary payments…" />;
  if (!auth.user) return <DepartmentManagerUnavailable message={auth.error || "Your Department Manager session could not be verified."} onRetry={() => void auth.reload()} />;
  return <DepartmentManagerShell user={auth.user} title="Team Payroll" description="Read-only salary payments for managed departments." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}>
    <SalaryPaymentsWorkspace audience="department-manager" excludeEmployeeId={auth.user.employeeId} />
  </DepartmentManagerShell>;
}
