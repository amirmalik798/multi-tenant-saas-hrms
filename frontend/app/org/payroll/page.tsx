"use client";

import SalaryPaymentsWorkspace from "../../components/payroll/SalaryPaymentsWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminPayrollPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="payroll"
      title="Payroll"
      description="Monthly payroll and payment control."
    >
      <SalaryPaymentsWorkspace audience="organization-admin" />
    </OrganizationAdminHRModuleShell>
  );
}
