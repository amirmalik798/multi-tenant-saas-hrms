"use client";

import EmployeePayRatesWorkspace from "../../components/attendance/EmployeePayRatesWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminPayRatesPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="pay-rates"
      title="Employee Pay Rates"
      description="Configure effective-dated hourly and overtime rates, including the HR Manager."
    >
      <EmployeePayRatesWorkspace audience="organization-admin" />
    </OrganizationAdminHRModuleShell>
  );
}
