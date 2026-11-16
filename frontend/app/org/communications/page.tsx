"use client";

import CommunicationWorkspace from "../../components/communications/CommunicationWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationCommunicationsPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="communications"
      title="Messages"
      description="Communicate with your workforce and manage organization conversations."
    >
      <CommunicationWorkspace roleLabel="Organization Admin" />
    </OrganizationAdminHRModuleShell>
  );
}
