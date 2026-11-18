"use client";

import AttendanceReportsWorkspace from "../../components/attendance/AttendanceReportsWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminReportsPage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="reports"
      title="Attendance reports"
      description="Daily, monthly and individual attendance PDFs."
    >
      <AttendanceReportsWorkspace audience="organization-admin" />
    </OrganizationAdminHRModuleShell>
  );
}
