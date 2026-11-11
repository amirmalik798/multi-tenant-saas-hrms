import type { ReactNode } from "react";
import OrganizationSetupGate from "../components/org-admin/OrganizationSetupGate";

export default function OrganizationAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="org-admin-workspace">
      <OrganizationSetupGate>{children}</OrganizationSetupGate>
    </div>
  );
}
