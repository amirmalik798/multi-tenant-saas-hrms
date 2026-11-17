"use client";

import AttendanceReportsWorkspace from "../../components/attendance/AttendanceReportsWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerAttendanceReportsPage() {
  const auth = useDepartmentManagerSession();

  if (auth.checking) return <DepartmentManagerLoading message="Loading attendance reports…" />;
  if (!auth.user) {
    return <DepartmentManagerUnavailable
      message={auth.error || "Your Department Manager session could not be verified."}
      onRetry={() => void auth.reload()}
    />;
  }

  return (
    <DepartmentManagerShell
      user={auth.user}
      title="Attendance reports"
      description="Attendance PDFs for employees in your assigned departments."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
    >
      <AttendanceReportsWorkspace audience="department-manager" />
    </DepartmentManagerShell>
  );
}
