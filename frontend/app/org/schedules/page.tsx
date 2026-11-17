"use client";

import AttendanceManagementWorkspace from "../../components/attendance/AttendanceManagementWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminSchedulesPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="schedules"
      title="Schedules"
      description="Create work schedules and assign shifts to Department Managers, employees and the HR Manager."
    >
      <AttendanceManagementWorkspace audience="organization-admin" initialSection="schedules" />
    </OrganizationAdminHRModuleShell>
  );
}
