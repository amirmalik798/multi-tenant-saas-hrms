import type { ReactNode } from "react";
import { EmployeeChrome } from "../components/employee/EmployeeChrome";
import OrganizationLicenseGate from "../components/shared/OrganizationLicenseGate";

export default function EmployeeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OrganizationLicenseGate>
      <EmployeeChrome>{children}</EmployeeChrome>
    </OrganizationLicenseGate>
  );
}
