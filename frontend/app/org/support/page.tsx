"use client";

import PlatformSupportWorkspace from "../../components/communications/PlatformSupportWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationSupportPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="support"
      title="Platform Support"
      description="Contact the platform team and follow support conversations."
    >
      <PlatformSupportWorkspace role="ORGANIZATION_ADMIN" />
    </OrganizationAdminHRModuleShell>
  );
}
