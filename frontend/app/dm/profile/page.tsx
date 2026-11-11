"use client";

import EmployeeProfileWorkspace from "../../components/employee/EmployeeProfileWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerProfilePage() {
  const auth = useDepartmentManagerSession();

  if (auth.checking) {
    return <DepartmentManagerLoading message="Loading your profile…" />;
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
      title=""
      description=""
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
    >
      <EmployeeProfileWorkspace
        employeeId={auth.user.employeeId}
        permissions={auth.user.permissions}
        homeHref="/dm/dashboard"
        roleLabel="Department Manager"
        allowSelfEdit
      />
    </DepartmentManagerShell>
  );
}
