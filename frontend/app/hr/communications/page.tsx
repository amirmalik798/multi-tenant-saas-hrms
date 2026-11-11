"use client";

import CommunicationWorkspace from "../../components/communications/CommunicationWorkspace";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../components/hr/HRManagerChrome";

export default function HRManagerCommunicationsPage() {
  const auth = useHRManagerSession();
  if (auth.checking) return <HRManagerLoading message="Loading messages…" />;
  if (!auth.user) return <HRManagerUnavailable message={auth.error || "Your HR Manager session is unavailable."} onRetry={() => void auth.reload()} />;
  return (
    <HRManagerShell user={auth.user} activePage="communications" title="Messages" description="Private conversations with your Organization Admin and replies from your team." onLogout={() => void auth.logout()} loggingOut={auth.loggingOut}
      logoutError={auth.error}>
      <CommunicationWorkspace roleLabel="HR Manager" />
    </HRManagerShell>
  );
}
