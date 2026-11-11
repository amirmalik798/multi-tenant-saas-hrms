"use client";

import AttendanceManagementWorkspace from "../../components/attendance/AttendanceManagementWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerReviewsPage() {
  const auth = useDepartmentManagerSession();

  if (auth.checking) {
    return <DepartmentManagerLoading message="Loading your team's review queue…" />;
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
      title="Team Review Queue"
      description="Review attendance corrections and overtime requests for your assigned departments. Each decision retains its existing validation and audit behavior."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
    >
      <AttendanceManagementWorkspace audience="department-manager" initialSection="review" actorEmployeeId={auth.user.employeeId} />
    </DepartmentManagerShell>
  );
}
