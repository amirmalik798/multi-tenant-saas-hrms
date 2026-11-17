"use client";

import EmployeeAttendanceWorkspace from "../../components/attendance/EmployeeAttendanceWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

export default function HRManagerPersonalAttendancePage() {
  const auth = useHRManagerSession();

  if (auth.checking) {
    return <HRManagerLoading message="Verifying your HR Manager session…" />;
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
      title="My attendance"
      description="Clock in and out, review your attendance history and monthly working hours."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <EmployeeAttendanceWorkspace userOverride={auth.user} />
    </HRManagerShell>
  );
}
