"use client";

import LeaveManagementWorkspace from "../../components/leave/LeaveManagementWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminLeavePage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="leave"
      title="Leave & Public Holidays"
      description="Review organization leave requests and manage public holidays."
    >
      <LeaveManagementWorkspace audience="organization-admin" />
    </OrganizationAdminHRModuleShell>
  );
}
