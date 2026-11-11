"use client";

import AttendanceManagementWorkspace from "../../../components/attendance/AttendanceManagementWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../../components/hr/HRManagerChrome";

export default function HRManagerSchedulesPage() {
  const auth = useHRManagerSession();

  if (auth.checking) {
    return <HRManagerLoading message="Loading work schedules…" />;
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
      title="Schedules & Time"
      description="Create reusable work schedules, assign employees to effective-dated shifts, and review schedule coverage."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <AttendanceManagementWorkspace audience="hr-manager" initialSection="schedules" />
    </HRManagerShell>
  );
}
