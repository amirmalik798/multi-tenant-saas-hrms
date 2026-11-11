"use client";

import DepartmentManagerScheduleWorkspace from "../../components/dm/DepartmentManagerScheduleWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerSchedulePage() {
  const auth = useDepartmentManagerSession();

  if (auth.checking) {
    return <DepartmentManagerLoading message="Loading your team's schedule…" />;
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
      title="Team Schedule"
      description="Review assigned shifts alongside recorded attendance. Planning data remains read-only for Department Managers."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
    >
      <DepartmentManagerScheduleWorkspace actorEmployeeId={auth.user.employeeId} />
    </DepartmentManagerShell>
  );
}
