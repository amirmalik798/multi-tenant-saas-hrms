import type { ReactNode } from "react";
import OrganizationSetupGate from "../components/org-admin/OrganizationSetupGate";
import OrganizationLicenseGate from "../components/shared/OrganizationLicenseGate";

export default function OrganizationAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="org-admin-workspace">
      <OrganizationLicenseGate>
        <OrganizationSetupGate>{children}</OrganizationSetupGate>
      </OrganizationLicenseGate>
    </div>
  );
}
