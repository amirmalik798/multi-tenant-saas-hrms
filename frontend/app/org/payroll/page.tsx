"use client";

import SalaryPaymentsWorkspace from "../../components/payroll/SalaryPaymentsWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminPayrollPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="payroll"
      title="Salary Payments"
      description="Review monthly earnings calculations and record salary payment status."
    >
      <SalaryPaymentsWorkspace audience="organization-admin" />
    </OrganizationAdminHRModuleShell>
  );
}
