"use client";

import EmployeeProfileWorkspace from "../../components/employee/EmployeeProfileWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

export default function HRManagerProfilePage() {
  const auth = useHRManagerSession();

  if (auth.checking) {
    return <HRManagerLoading message="Loading your profile…" />;
  }

  if (!auth.user) {
    return (
      <HRManagerUnavailable
        message={auth.error || "Your HR Manager session could not be verified."}
        onRetry={() => void auth.reload()}
      />
    );
  }

  return (
    <HRManagerShell
      user={auth.user}
      activePage="profile"
      title=""
      description=""
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <EmployeeProfileWorkspace
        employeeId={auth.user.employeeId}
        permissions={auth.user.permissions}
        homeHref="/hr/dashboard"
        roleLabel="HR Manager"
        allowSelfEdit
      />
    </HRManagerShell>
  );
}
