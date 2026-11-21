"use client";

import { WorkforceWorkspace } from "@/features/workforce/WorkforceWorkspace";
import { DepartmentsWorkspace } from "@/features/departments/DepartmentsWorkspace";
import { WorkspaceDashboard } from "@/components/features/WorkspaceDashboard";
import { ResourceWorkspace } from "@/components/features/ResourceWorkspace";
import { AttendanceWorkspace } from "@/features/workspace/AttendanceWorkspace";
import { MessagesWorkspace } from "@/features/workspace/MessagesWorkspace";
import { ReviewQueueWorkspace } from "@/features/workspace/ReviewQueueWorkspace";
import { LeaveWorkspace } from "@/features/leave/LeaveWorkspace";
import { PayrollWorkspace } from "@/features/payroll/PayrollWorkspace";
import { PayRatesWorkspace } from "@/features/pay-rates/PayRatesWorkspace";
import { OrganizationSettingsWorkspace } from "@/features/settings/OrganizationSettingsWorkspace";
import { InvitationsWorkspace } from "@/features/workforce/InvitationsWorkspace";
import { MyRequestsWorkspace } from "@/features/workspace/MyRequestsWorkspace";
import { ScheduleWorkspace } from "@/features/workspace/ScheduleWorkspace";
import { ReportsWorkspace } from "@/features/workspace/ReportsWorkspace";
import { ProfileWorkspace } from "@/features/workspace/ProfileWorkspace";
import { OrganizationChartWorkspace } from "@/features/workspace/OrganizationChartWorkspace";
import { LicenseWorkspace } from "@/features/licensing/LicenseWorkspace";
import { SupportWorkspace } from "@/features/support/SupportWorkspace";
import { PersonalEarningsWorkspace } from "@/features/workspace/PersonalEarningsWorkspace";
import type { WorkspaceRole } from "@/types/workspace";

export function WorkspaceFeaturePage({ role, segments }: { role: WorkspaceRole; segments: string[] }) {
  let pageKey = segments[segments.length - 1] || "dashboard";
  if (segments[0] === "modules") {
    if (pageKey === "time-schedules") pageKey = "schedules";
    if (pageKey === "pay-rates") pageKey = "pay-rates";
  }
  if (pageKey === "welcome") pageKey = "dashboard";

  if (pageKey === "dashboard") return <WorkspaceDashboard role={role} />;
  if (pageKey === "employees" || pageKey === "team") return <WorkforceWorkspace />;
  if (pageKey === "departments") return <DepartmentsWorkspace />;
  if (pageKey === "invitations") return <InvitationsWorkspace />;
  if (pageKey === "organization-chart") return <OrganizationChartWorkspace />;
  if (pageKey === "requests") return <MyRequestsWorkspace />;
  if (["schedule", "schedules"].includes(pageKey)) return <ScheduleWorkspace />;
  if (pageKey === "reports") return <ReportsWorkspace />;
  if (pageKey === "earnings" || pageKey === "my-earnings") return <PersonalEarningsWorkspace />;
  if (pageKey === "profile") return <ProfileWorkspace />;
  if (["attendance", "my-attendance"].includes(pageKey)) return <AttendanceWorkspace pageKey={pageKey} />;
  if (["reviews", "work-queue"].includes(pageKey)) return <ReviewQueueWorkspace />;
  if (pageKey === "communications") return <MessagesWorkspace />;
  if (pageKey === "leave") return <LeaveWorkspace />;
  if (pageKey === "payroll") return <PayrollWorkspace />;
  if (pageKey === "pay-rates") return <PayRatesWorkspace />;
  if (pageKey === "settings") return <OrganizationSettingsWorkspace />;
  if (pageKey === "license") return <LicenseWorkspace />;
  if (pageKey === "support") return <SupportWorkspace />;
  return <ResourceWorkspace pageKey={pageKey} />;
}

export function workspaceRoleFromPath(path: string): WorkspaceRole | null {
  if (path.startsWith("/org")) return "ORGANIZATION_ADMIN";
  if (path.startsWith("/hr")) return "HR_MANAGER";
  if (path.startsWith("/dm")) return "DEPARTMENT_MANAGER";
  if (path.startsWith("/employee")) return "EMPLOYEE";
  return null;
}
