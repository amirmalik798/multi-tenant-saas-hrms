"use client";

import AttendanceManagementWorkspace from "../../components/attendance/AttendanceManagementWorkspace";
import OrganizationAdminHRModuleShell from "../../components/org-admin/OrganizationAdminHRModuleShell";

export default function OrganizationAdminAttendancePage() {
  return (
    <OrganizationAdminHRModuleShell
      activePage="attendance"
      title="Attendance & Time"
      description="Review organization attendance, recorded clock events, working hours and overtime."
    >
      <AttendanceManagementWorkspace audience="organization-admin" />
    </OrganizationAdminHRModuleShell>
  );
}
