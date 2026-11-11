import type { ReactNode } from "react";
import OrganizationLicenseGate from "../components/shared/OrganizationLicenseGate";

export default function DepartmentManagerLayout({ children }: { children: ReactNode }) {
  return <OrganizationLicenseGate>{children}</OrganizationLicenseGate>;
}
