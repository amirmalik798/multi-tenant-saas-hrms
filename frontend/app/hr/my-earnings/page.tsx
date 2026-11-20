"use client";

import EmployeeEarningsWorkspace from "../../components/employee/EmployeeEarningsWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

export default function HRManagerMyEarningsPage() {
  const auth = useHRManagerSession();

  if (auth.checking) {
    return <HRManagerLoading message="Loading your earnings…" />;
  }

  if (!auth.user) {
    return (
      <HRManagerUnavailable
        message={auth.error || "Your HR Manager session is unavailable."}
        onRetry={() => void auth.reload()}
      />
    );
  }

  return (
    <HRManagerShell
      user={auth.user}
      activePage="modules"
      title="My earnings"
      description="Review your assigned hourly rates, monthly earnings estimates and recorded salary payments."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <EmployeeEarningsWorkspace employeeId={auth.user.employeeId} allowOwnPayslips />
    </HRManagerShell>
  );
}
