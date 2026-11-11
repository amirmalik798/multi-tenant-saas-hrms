"use client";

import CommunicationWorkspace from "../../components/communications/CommunicationWorkspace";
import {
  DepartmentManagerLoading,
  DepartmentManagerShell,
  DepartmentManagerUnavailable,
  useDepartmentManagerSession,
} from "../../components/dm/DepartmentManagerChrome";

export default function DepartmentManagerCommunicationsPage() {
  const auth = useDepartmentManagerSession();
  if (auth.checking) return <DepartmentManagerLoading message="Loading messages…" />;
  if (!auth.user) return <DepartmentManagerUnavailable message={auth.error || "Your Department Manager session could not be verified."} onRetry={() => void auth.reload()} />;
  return (
    <DepartmentManagerShell user={auth.user} title="" description="" onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}>
      <CommunicationWorkspace roleLabel="Department Manager" />
    </DepartmentManagerShell>
  );
}
