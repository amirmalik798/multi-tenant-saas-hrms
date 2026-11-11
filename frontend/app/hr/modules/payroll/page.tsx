"use client";

import SalaryPaymentsWorkspace from "../../../components/payroll/SalaryPaymentsWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../../components/hr/HRManagerChrome";

export default function HRManagerPayrollPage() {
  const auth = useHRManagerSession();
  if (auth.checking) return <HRManagerLoading message="Loading salary payments…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;
  return <HRManagerShell user={auth.user} activePage="modules" title="Salary payments" description="Review calculated monthly earnings and record salary payments." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}
      logoutError={auth.error}>
    <SalaryPaymentsWorkspace audience="hr-manager" />
  </HRManagerShell>;
}
