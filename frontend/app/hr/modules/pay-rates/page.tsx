"use client";

import EmployeePayRatesWorkspace from "../../../components/attendance/EmployeePayRatesWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../../components/hr/HRManagerChrome";

export default function HRManagerPayRatesPage() {
  const auth = useHRManagerSession();
  if (auth.checking) return <HRManagerLoading message="Loading employee pay rates…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;
  return <HRManagerShell user={auth.user} activePage="modules" title="Employee pay rates" description="Hourly and overtime rates." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}
      logoutError={auth.error}>
    <EmployeePayRatesWorkspace />
  </HRManagerShell>;
}
