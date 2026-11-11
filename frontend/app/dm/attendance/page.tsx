"use client";

import AttendanceManagementWorkspace from "../../components/attendance/AttendanceManagementWorkspace";
import DepartmentManagerSelfAttendance from "../../components/dm/DepartmentManagerSelfAttendance";
import DepartmentManagerSelfRequests from "../../components/dm/DepartmentManagerSelfRequests";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerAttendancePage() {
  const auth = useDepartmentManagerSession();

  if (auth.checking) {
    return <DepartmentManagerLoading message="Loading team attendance workspace…" />;
  }

  if (!auth.user) {
    return (
      <DepartmentManagerUnavailable
        message={auth.error || "Your Department Manager session could not be verified."}
        onRetry={() => void auth.reload()}
      />
    );
  }

  return (
    <DepartmentManagerShell
      user={auth.user}
      title="Attendance & Time"
      description="Team attendance and overtime."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
    >
      <div className="space-y-5">
        <DepartmentManagerSelfAttendance employeeId={auth.user.employeeId} />
        <DepartmentManagerSelfRequests employeeId={auth.user.employeeId} />
        <AttendanceManagementWorkspace audience="department-manager" actorEmployeeId={auth.user.employeeId} />
      </div>
    </DepartmentManagerShell>
  );
}
