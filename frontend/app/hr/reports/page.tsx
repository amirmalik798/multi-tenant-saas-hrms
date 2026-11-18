"use client";

import AttendanceReportsWorkspace from "../../components/attendance/AttendanceReportsWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

export default function HRManagerAttendanceReportsPage() {
  const auth = useHRManagerSession();

  if (auth.checking) return <HRManagerLoading message="Loading attendance reports…" />;
  if (!auth.user) {
    return <HRManagerUnavailable
      message={auth.error || "Your HR Manager session is unavailable."}
      onRetry={() => void auth.reload()}
    />;
  }

  return (
    <HRManagerShell
      user={auth.user}
      activePage="reports"
      title="Attendance reports"
      description="Monthly workforce and individual attendance PDFs within your reporting scope."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <AttendanceReportsWorkspace audience="hr-manager" />
    </HRManagerShell>
  );
}
