import {
  Activity, Building2, CalendarCheck, CalendarDays, CalendarRange, ChartNoAxesCombined,
  ClipboardCheck, Clock3, CreditCard, FileBarChart, FolderKanban, Gauge, HeartHandshake,
  LayoutDashboard, Mail, Network, Settings2, ShieldCheck, UserRound, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceRole } from "@/types/workspace";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  section: string;
}
export interface NavGroup { label: string; items: NavItem[] }

export const roleLabels: Record<WorkspaceRole, string> = {
  ORGANIZATION_ADMIN: "Organization Admin",
  HR_MANAGER: "HR Manager",
  DEPARTMENT_MANAGER: "Department Manager",
  EMPLOYEE: "Employee",
};

const item = (label: string, href: string, icon: LucideIcon, section: string, permission?: string): NavItem => ({ label, href, icon, section, ...(permission ? { permission } : {}) });

export const workspaceNavigation: Record<WorkspaceRole, NavGroup[]> = {
  ORGANIZATION_ADMIN: [
    { label: "Workspace", items: [item("Overview", "/org/dashboard", LayoutDashboard, "dashboard")] },
    { label: "People", items: [item("Workforce", "/org/employees", Users, "employees", "employee.view"), item("Departments", "/org/departments", Building2, "departments", "department.view"), item("Organization chart", "/org/organization-chart", Network, "organization-chart"), item("Invitations", "/org/invitations", Mail, "invitations")] },
    { label: "Time & work", items: [item("Attendance", "/org/attendance", Clock3, "attendance"), item("Schedules", "/org/schedules", CalendarRange, "schedules"), item("Leave & holidays", "/org/leave", CalendarDays, "leave")] },
    { label: "Compensation", items: [item("Pay rates", "/org/pay-rates", Wallet, "pay-rates"), item("Payroll", "/org/payroll", CreditCard, "payroll")] },
    { label: "Insights & support", items: [item("Reports", "/org/reports", FileBarChart, "reports"), item("Messages", "/org/communications", Mail, "communications"), item("Support", "/org/support", HeartHandshake, "support")] },
    { label: "Organization", items: [item("Settings", "/org/settings", Settings2, "settings"), item("License & payments", "/org/license", ShieldCheck, "license"), item("My profile", "/org/profile", UserRound, "profile")] },
  ],
  HR_MANAGER: [
    { label: "Workspace", items: [item("Overview", "/hr/dashboard", LayoutDashboard, "dashboard"), item("Review queue", "/hr/work-queue", ClipboardCheck, "work-queue")] },
    { label: "People", items: [item("Workforce", "/hr/employees", Users, "employees", "employee.view"), item("Departments", "/hr/departments", Building2, "departments", "department.view"), item("Organization chart", "/hr/organization-chart", Network, "organization-chart"), item("Invitations", "/hr/invitations", Mail, "invitations", "invitation.view")] },
    { label: "Time & leave", items: [item("Attendance", "/hr/modules/attendance", Clock3, "attendance"), item("Schedules", "/hr/modules/time-schedules", CalendarRange, "schedules"), item("Leave & holidays", "/hr/modules/leave", CalendarDays, "leave")] },
    { label: "Pay & reporting", items: [item("Pay rates", "/hr/modules/pay-rates", Wallet, "pay-rates"), item("Salary payments", "/hr/modules/payroll", CreditCard, "payroll"), item("Reports", "/hr/reports", FileBarChart, "reports")] },
    { label: "Communication", items: [item("Messages", "/hr/communications", Mail, "communications")] },
    { label: "My account", items: [item("My attendance", "/hr/my-attendance", CalendarCheck, "my-attendance"), item("My earnings", "/hr/my-earnings", Wallet, "my-earnings"), item("My profile", "/hr/profile", UserRound, "profile"), item("Password & security", "/account/change-password", ShieldCheck, "change-password")] },
  ],
  DEPARTMENT_MANAGER: [
    { label: "Workspace", items: [item("My overview", "/dm/dashboard", LayoutDashboard, "dashboard"), item("My team", "/dm/team", Users, "team")] },
    { label: "Time & approvals", items: [item("Attendance", "/dm/attendance", Clock3, "attendance"), item("Team schedule", "/dm/schedule", CalendarRange, "schedule"), item("Review queue", "/dm/reviews", ClipboardCheck, "reviews"), item("Leave & holidays", "/dm/leave", CalendarDays, "leave")] },
    { label: "Pay & reporting", items: [item("Team payments", "/dm/payroll", CreditCard, "payroll"), item("Attendance reports", "/dm/reports", FileBarChart, "reports")] },
    { label: "Communication", items: [item("Messages", "/dm/communications", Mail, "communications")] },
    { label: "My account", items: [item("My attendance", "/dm/my-attendance", CalendarCheck, "my-attendance"), item("My earnings", "/dm/earnings", Wallet, "earnings"), item("My profile", "/dm/profile", UserRound, "profile"), item("Password & security", "/account/change-password", ShieldCheck, "change-password")] },
  ],
  EMPLOYEE: [
    { label: "My workspace", items: [item("My day", "/employee/dashboard", LayoutDashboard, "dashboard"), item("My time", "/employee/attendance", Clock3, "attendance"), item("My schedule", "/employee/schedule", CalendarRange, "schedule"), item("Attendance reports", "/employee/reports", FileBarChart, "reports")] },
    { label: "My requests", items: [item("Leave & holidays", "/employee/leave", CalendarDays, "leave"), item("Requests", "/employee/requests", ClipboardCheck, "requests")] },
    { label: "My pay", items: [item("Earnings & payslips", "/employee/payroll", Wallet, "payroll")] },
    { label: "Communication", items: [item("Messages", "/employee/communications", Mail, "communications")] },
    { label: "My account", items: [item("My profile", "/employee/profile", UserRound, "profile"), item("Password & security", "/account/change-password", ShieldCheck, "change-password")] },
  ],
};

export const routePageMeta: Record<string, { title: string; description: string }> = {
  dashboard: { title: "Overview", description: "A clear view of what matters today." },
  employees: { title: "Workforce", description: "Find people, understand their role, and keep workforce records current." },
  team: { title: "My team", description: "The people and departments within your management scope." },
  departments: { title: "Departments", description: "Understand team structure, ownership, and staffing." },
  "organization-chart": { title: "Organization chart", description: "Explore reporting lines and the structure of your organization." },
  invitations: { title: "Invitations", description: "Track onboarding invitations and their current status." },
  attendance: { title: "Attendance", description: "Understand attendance, recorded time, and items that need attention." },
  schedules: { title: "Schedules", description: "Review working patterns and employee shift assignments." },
  schedule: { title: "My schedule", description: "Know when and where you are expected to work." },
  leave: { title: "Leave & holidays", description: "Review time-off requests and public holidays." },
  "pay-rates": { title: "Pay rates", description: "Manage approved hourly and overtime rates with their effective dates." },
  payroll: { title: "Payroll", description: "Review calculated compensation and recorded payment status." },
  earnings: { title: "My earnings", description: "Review your own earnings and payment history." },
  "my-earnings": { title: "My earnings", description: "Review your own earnings and payment history." },
  reports: { title: "Reports", description: "Generate clear, period-based workforce reports." },
  communications: { title: "Messages", description: "Private conversations with the people in your reporting line." },
  support: { title: "Support", description: "Get help with your organization workspace." },
  settings: { title: "Organization settings", description: "Manage the organization context used throughout HRMS." },
  profile: { title: "My profile", description: "Your personal details and account information." },
  license: { title: "License & payments", description: "Review subscription access and payment verification status." },
  "work-queue": { title: "Review queue", description: "Resolve the work items waiting for your attention." },
  reviews: { title: "Review queue", description: "Resolve attendance and leave items for your assigned team." },
  requests: { title: "My requests", description: "Track corrections, overtime, and leave requests." },
  "my-attendance": { title: "My attendance", description: "Your own attendance record and hours." },
  "change-password": { title: "Password & security", description: "Keep your account credentials secure." },
};
