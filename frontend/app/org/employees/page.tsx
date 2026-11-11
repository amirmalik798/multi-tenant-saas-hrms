"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrganizationAdminSidebar, OrganizationAdminHeader, useOrganizationAdminAutoRefresh } from "../../components/org-admin/OrganizationAdminChrome";
import { CountrySelect, formatCountryWithFlag, replacePhoneCountryCode, isCallingCodeOnly } from "../../components/workforce/CountryPhoneFields";
import { WorkforceContactDetails } from "../../components/workforce/WorkforceContactDetails";
import { WorkforceEmergencyContactFields } from "../../components/workforce/WorkforceEmergencyContactFields";
import { WorkforceCreationGuide } from "../../components/workforce/WorkforceCreationGuide";
import EmployeeProfilePhoto from "../../components/employee/EmployeeProfilePhoto";

type OrgAdminUser = {
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

type EmploymentStatus = "ACTIVE" | "INACTIVE" | "FORMER";
type DrawerMode = "create" | "view" | "edit" | null;
type WorkforceRole = "HR_MANAGER" | "DEPARTMENT_MANAGER" | "EMPLOYEE";
type StatusFilter = "ALL" | EmploymentStatus;
type EmployeeSortBy =
  | "created_at"
  | "employee_code"
  | "name"
  | "department"
  | "designation"
  | "workforce_role"
  | "employment_status"
  | "joining_date";
type EmployeeSortOrder = "asc" | "desc";
type EmployeeFormField = keyof EmployeeForm;

type Employee = {
  id: string;
  organization_id?: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  country: string | null;
  city: string | null;
  designation: string | null;
  joining_date: string | null;
  employment_status: EmploymentStatus;
  department_id?: string | null;
  department_name: string | null;
  manager_id?: string | null;
  manager_name: string | null;
  workforce_role?: WorkforceRole | null;
  is_primary_hr_manager?: boolean;
  manager_employee_code?: string | null;
  manager_first_name?: string | null;
  manager_last_name?: string | null;
  manager_email?: string | null;
  manager_employment_status?: EmploymentStatus | null;
  manager_workforce_role?: WorkforceRole | null;
  manager_account_status?: string | null;
  created_at?: string;
  updated_at?: string;
  invitation_id?: string | null;
  invitation_status?: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED" | string | null;
  invitation_expires_at?: string | null;
  has_pending_invitation?: boolean;
  managed_department_count?: number | null;
  managed_departments?: ManagedDepartment[];
};

type ManagedDepartment = {
  id: string;
  name: string;
  status: string;
};

type InvitationHistoryEvent = {
  id: string;
  event_type: string;
  reason?: string | null;
  effective_at?: string | null;
  created_at: string;
};

type EmployeeInvitationLog = {
  id: string;
  employee_id: string;
  email: string;
  status: string;
  display_status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  invited_by_email?: string | null;
  history?: InvitationHistoryEvent[];
};

type EmployeeHistoryEntry = {
  id: string;
  event_type: string;
  reason?: string | null;
  effective_at: string;
  created_at: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  actor_user_id?: string | null;
  actor_display_name?: string | null;
  actor_role_label?: string | null;
};

type EmployeeDetailTab = "overview" | "departments" | "invitations" | "history";

type EmployeeResponse = {
  status?: string;
  employees: Employee[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type EmployeeDetailResponse = { employee: Employee; message?: string };

type EmployeeInvitationResponse = {
  status?: string;
  message?: string;
  emailSent?: boolean;
  invitationUrl?: string;
  invitation?: {
    id: string;
    status: string;
    expires_at: string;
  };
};

type Department = {
  id: string;
  name: string;
  status: string;
  manager_id?: string | null;
  manager_employee_code?: string | null;
  manager_name?: string | null;
  manager_role?: string | null;
  manager_employment_status?: EmploymentStatus | null;
  manager_account_status?: string | null;
  manager_eligible?: boolean;
};
type DepartmentResponse = { status?: string; departments: Department[]; message?: string };
type Manager = {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  designation: string | null;
  workforce_role?: WorkforceRole;
  account_status?: string;
  is_primary_hr_manager?: boolean;
};
type ManagerResponse = { status?: string; employees: Manager[]; message?: string };

type EmployeeForm = {
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  country: string;
  phone: string;
  designation: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  joining_date: string;
  employment_status: EmploymentStatus;
  department_id: string;
  manager_id: string;
};

type IconName =
  | "dashboard"
  | "users"
  | "building"
  | "search"
  | "command"
  | "logout"
  | "arrow"
  | "shield"
  | "mail"
  | "phone"
  | "mapPin"
  | "globe"
  | "briefcase"
  | "calendar"
  | "clock"
  | "plus"
  | "eye"
  | "edit"
  | "close"
  | "chevron"
  | "filter"
  | "check"
  | "alert"
  | "code"
  | "layers"
  | "copy"
  | "userCheck"
  | "more";

function getCurrentDateInputValue() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

const initialForm: EmployeeForm = {
  employee_code: "",
  first_name: "",
  last_name: "",
  email: "",
  city: "",
  country: "",
  phone: "",
  designation: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  joining_date: "",
  employment_status: "INACTIVE",
  department_id: "",
  manager_id: "",
};


function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    command: <path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7Z" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.3-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.68A2 2 0 0 1 22 16.92Z" />,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M10.3 3.9 1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    copy: <><rect width="13" height="13" x="9" y="9" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    userCheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>{paths[name]}</svg>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  // PostgreSQL DATE values are calendar dates, not instants. Parse YYYY-MM-DD
  // with local calendar components so the display never shifts by timezone.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (dateOnly && (
    date.getFullYear() !== Number(dateOnly[1]) ||
    date.getMonth() !== Number(dateOnly[2]) - 1 ||
    date.getDate() !== Number(dateOnly[3])
  )) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function invitationStatusClasses(status: string) {
  switch (status.toUpperCase()) {
    case "PENDING": return "border-amber-400/25 bg-amber-500/[0.08] text-amber-200";
    case "ACCEPTED": return "border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200";
    case "EXPIRED": return "border-slate-500/30 bg-slate-500/[0.08] text-slate-300";
    case "REVOKED": return "border-rose-400/25 bg-rose-500/[0.06] text-rose-200";
    default: return "border-[#34465d] bg-[#182232] text-slate-300";
  }
}

function invitationStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";

  // Preserve date-only database values exactly; parsing YYYY-MM-DD with
  // `new Date()` can shift the calendar day in some time zones.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const check = new Date(year, month - 1, day);
    if (
      Number.isNaN(check.getTime()) ||
      check.getFullYear() !== year ||
      check.getMonth() !== month - 1 ||
      check.getDate() !== day
    ) return "";
    return value;
  }

  // The API should return DATE columns as YYYY-MM-DD. This fallback supports
  // legacy ISO datetime values without blindly taking the UTC date prefix.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function getFullName(employee: Pick<Employee, "first_name" | "last_name">) {
  return [employee.first_name, employee.last_name].filter(Boolean).join(" ") || "Unnamed employee";
}

function getInitials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "EM";
}

function statusStyle(status: EmploymentStatus) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 font-bold";
    case "INACTIVE": return "bg-slate-500/15 text-slate-300 ring-slate-400/30 font-bold";
    case "FORMER": return "bg-amber-500/15 text-amber-300 ring-amber-400/30 font-bold";
  }
}

function statusDotStyle(status: EmploymentStatus) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-400";
    case "INACTIVE": return "bg-slate-400";
    case "FORMER": return "bg-amber-400";
  }
}

function employeeToForm(employee: Employee): EmployeeForm {
  return {
    employee_code: employee.employee_code ?? "",
    first_name: employee.first_name ?? "",
    last_name: employee.last_name ?? "",
    email: employee.email ?? "",
    city: employee.city ?? "",
    country: employee.country ?? "",
    phone: employee.phone ?? "",
    designation: employee.designation ?? "",
    emergency_contact_name: employee.emergency_contact_name ?? "",
    emergency_contact_relationship: employee.emergency_contact_relationship ?? "",
    emergency_contact_phone: employee.emergency_contact_phone ?? "",
    joining_date: toDateInputValue(employee.joining_date),
    employment_status: employee.employment_status ?? "ACTIVE",
    department_id: employee.department_id ?? "",
    manager_id: employee.manager_id ?? "",
  };
}

function changedForm(form: EmployeeForm, baseline: EmployeeForm) {
  return (Object.keys(form) as Array<keyof EmployeeForm>).some((key) => form[key] !== baseline[key]);
}

function validateEmployeeForm(form: EmployeeForm, requireCreationContacts = false): Partial<Record<EmployeeFormField, string>> {
  const errors: Partial<Record<EmployeeFormField, string>> = {};
  const employeeCode = form.employee_code.trim();
  const firstName = form.first_name.trim();
  const lastName = form.last_name.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  const designation = form.designation.trim();
  const country = form.country.trim();
  const city = form.city.trim();
  const emergencyContactName = form.emergency_contact_name.trim();
  const emergencyContactRelationship = form.emergency_contact_relationship.trim();
  const emergencyContactPhone = form.emergency_contact_phone.trim();
  const emergencyContactHasAnyValue = Boolean(
    emergencyContactName || emergencyContactRelationship || emergencyContactPhone,
  );

  if (!employeeCode) errors.employee_code = "Employee code is required.";
  else if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(employeeCode)) {
    errors.employee_code = "Use up to 50 letters, numbers, hyphens, or underscores; start with a letter or number.";
  }

  if (!firstName) errors.first_name = "First name is required.";
  else if (firstName.length < 2 || firstName.length > 100 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(firstName)) {
    errors.first_name = "First name must be 2–100 characters and use letters, spaces, apostrophes, periods, or hyphens.";
  }

  if (requireCreationContacts && !lastName) errors.last_name = "Last name is required.";
  else if (lastName.length > 100) errors.last_name = "Last name must be 100 characters or fewer.";
  else if (lastName && (lastName.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(lastName))) {
    errors.last_name = "Enter a valid last name using letters, spaces, apostrophes, periods, or hyphens.";
  }

  if (!email) errors.email = "Email address is required.";
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (requireCreationContacts && (!phone || isCallingCodeOnly(phone, country))) {
    errors.phone = "A complete employee phone number is required.";
  } else if (phone && !isCallingCodeOnly(phone, country)) {
    const digits = phone.replace(/\D/g, "").length;
    if (phone.length > 50 || digits < 7 || digits > 15 || !/^[+0-9().\-\s]+$/.test(phone)) {
      errors.phone = "Use 7–15 digits; only digits, spaces, +, parentheses, periods, and hyphens are allowed.";
    }
  }

  if (!city) errors.city = "City is required.";
  else if (city.length > 100) errors.city = "City must be 100 characters or fewer.";

  if (!country) errors.country = "Country is required.";
  else if (country.length > 100) errors.country = "Country must be 100 characters or fewer.";

  if (!designation) errors.designation = "Designation is required.";
  else if (designation.length > 100) errors.designation = "Designation must be 100 characters or fewer.";

  if (emergencyContactName.length > 120) {
    errors.emergency_contact_name = "Emergency contact name must be 120 characters or fewer.";
  } else if (requireCreationContacts && !emergencyContactName) {
    errors.emergency_contact_name = "Emergency contact name is required.";
  } else if (emergencyContactName && (emergencyContactName.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(emergencyContactName))) {
    errors.emergency_contact_name = "Enter a valid contact name using letters, spaces, apostrophes, periods, or hyphens.";
  } else if (emergencyContactHasAnyValue && !emergencyContactName) {
    errors.emergency_contact_name = "Enter the emergency contact name when adding contact details.";
  }

  if (emergencyContactRelationship.length > 80) {
    errors.emergency_contact_relationship = "Relationship must be 80 characters or fewer.";
  } else if (requireCreationContacts && !emergencyContactRelationship) {
    errors.emergency_contact_relationship = "Emergency contact relationship is required.";
  } else if (emergencyContactRelationship && (emergencyContactRelationship.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(emergencyContactRelationship))) {
    errors.emergency_contact_relationship = "Enter a valid relationship, such as parent, spouse, or sibling.";
  }

  if (emergencyContactPhone.length > 30) {
    errors.emergency_contact_phone = "Emergency contact phone must be 30 characters or fewer.";
  } else if (!emergencyContactPhone && requireCreationContacts) {
    errors.emergency_contact_phone = "Emergency contact phone is required.";
  } else if (emergencyContactPhone) {
    const emergencyPhoneDigits = emergencyContactPhone.replace(/\D/g, "").length;
    if (!/^\+?[0-9][0-9\s().-]*$/.test(emergencyContactPhone) || emergencyPhoneDigits < 7 || emergencyPhoneDigits > 15) {
      errors.emergency_contact_phone = "Use 7 to 15 digits and only digits, spaces, +, parentheses, periods, or hyphens.";
    }
  } else if (emergencyContactHasAnyValue) {
    errors.emergency_contact_phone = "Enter the emergency contact phone when adding contact details.";
  }

  if (requireCreationContacts && !form.joining_date) {
    errors.joining_date = "Joining date is required.";
  } else if (form.joining_date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.joining_date);
    if (!match) errors.joining_date = "Enter a valid joining date.";
    else {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        errors.joining_date = "Enter a real calendar date.";
      }
    }
  }

  if (!["ACTIVE", "INACTIVE", "FORMER"].includes(form.employment_status)) {
    errors.employment_status = "Choose a valid employment status.";
  }
  return errors;
}



const WORKFORCE_ROLE_OPTIONS: Array<{
  value: WorkforceRole;
  title: string;
  subtitle: string;
  description: string;
}> = [
  {
    value: "HR_MANAGER",
    title: "HR Manager",
    subtitle: "Organization-wide HR operations",
    description: "Organization-wide HR authority. Organization Admin appoints HR Managers and explicitly maintains the single Primary HR Manager designation.",
  },
  {
    value: "DEPARTMENT_MANAGER",
    title: "Department Manager",
    subtitle: "Leads one or more departments",
    description: "Owns department operations, may manage multiple departments, and must report to an active HR Manager with an active account.",
  },
  {
    value: "EMPLOYEE",
    title: "Employee",
    subtitle: "Individual contributor",
    description: "Must be assigned to an active department with an eligible active Department Manager. The reporting line is derived from that department.",
  },
];

function workforceRoleLabel(role: WorkforceRole): string {
  return WORKFORCE_ROLE_OPTIONS.find((option) => option.value === role)?.title ?? "Employee";
}

function invitationIsPending(employee: Pick<Employee, "has_pending_invitation">): boolean {
  return employee.has_pending_invitation === true;
}

function invitationActionLabel(employee: Employee): string {
  if (invitationIsPending(employee)) return "Pending";
  if (employee.invitation_status?.toUpperCase() === "EXPIRED") return "Invite again";
  return "Invite";
}

function invitationActionTitle(employee: Employee): string {
  if (invitationIsPending(employee)) return "An active invitation already exists for this employee";
  if (employee.employment_status === "FORMER") return "Former employees require the rehire workflow";
  if (!employee.email) return "Add an email address before inviting";
  if (!employee.workforce_role) return "Assign a workforce role before inviting";
  return employee.invitation_status?.toUpperCase() === "EXPIRED"
    ? "The prior invitation expired; create a new activation link"
    : "Create an activation link using the role assigned to this employee profile";
}

function invitationActionDisabled(employee: Employee): boolean {
  return invitationIsPending(employee) || employee.employment_status === "FORMER" || !employee.email || !employee.workforce_role;
}

function FieldStatus({ complete, invalid }: { complete: boolean; invalid?: boolean }) {
  if (complete) {
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-200"><Icon name="check" size={13} />Looks good</span>;
  }
  if (invalid) {
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-200"><Icon name="alert" size={13} />Needs attention</span>;
  }
  return null;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [user, setUser] = useState<OrgAdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoadedEmployeesRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<EmployeeSortBy>("created_at");
  const [sortOrder, setSortOrder] = useState<EmployeeSortOrder>("desc");
  const [directoryDepartments, setDirectoryDepartments] = useState<Department[]>([]);
  const [directoryDepartmentsLoading, setDirectoryDepartmentsLoading] = useState(true);
  const [directoryDepartmentsError, setDirectoryDepartmentsError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const limit = 10;

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [creationRole, setCreationRole] = useState<WorkforceRole | null>(null);
  const [roleStepConfirmed, setRoleStepConfirmed] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeDetailTab, setEmployeeDetailTab] = useState<EmployeeDetailTab>("overview");
  const [employeeDrawerInvitations, setEmployeeDrawerInvitations] = useState<EmployeeInvitationLog[]>([]);
  const [employeeDrawerInvitationsLoading, setEmployeeDrawerInvitationsLoading] = useState(false);
  const [employeeDrawerInvitationsError, setEmployeeDrawerInvitationsError] = useState("");
  const [employeeDrawerInvitationsLoadedFor, setEmployeeDrawerInvitationsLoadedFor] = useState<string | null>(null);
  const [employeeDrawerHistory, setEmployeeDrawerHistory] = useState<EmployeeHistoryEntry[]>([]);
  const [employeeDrawerHistoryLoading, setEmployeeDrawerHistoryLoading] = useState(false);
  const [employeeDrawerHistoryError, setEmployeeDrawerHistoryError] = useState("");
  const [employeeDrawerHistoryLoadedFor, setEmployeeDrawerHistoryLoadedFor] = useState<string | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerNotice, setDrawerNotice] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmWorkflowChanges, setConfirmWorkflowChanges] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [baselineForm, setBaselineForm] = useState<EmployeeForm>(initialForm);
  const [touchedFields, setTouchedFields] = useState<Set<EmployeeFormField>>(() => new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentError, setDepartmentError] = useState("");
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [managerError, setManagerError] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [invitingEmployee, setInvitingEmployee] = useState<Employee | null>(null);
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [revokingInvitationEmployeeId, setRevokingInvitationEmployeeId] = useState<string | null>(null);
  const [revokeConfirmationEmployee, setRevokeConfirmationEmployee] = useState<Employee | null>(null);
  const [invitationError, setInvitationError] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [invitationEmailSent, setInvitationEmailSent] = useState(false);
  const [invitationLinkCopied, setInvitationLinkCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(() => new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<EmploymentStatus>("INACTIVE");
  const [bulkStatusConfirmOpen, setBulkStatusConfirmOpen] = useState(false);
  const [bulkStatusProcessing, setBulkStatusProcessing] = useState(false);
  const [bulkStatusError, setBulkStatusError] = useState("");
  const [bulkStatusNotice, setBulkStatusNotice] = useState("");

  const drawerRef = useRef<HTMLElement | null>(null);
  const revokeModalCancelRef = useRef<HTMLButtonElement | null>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const employeeCodeInputRef = useRef<HTMLInputElement | null>(null);
  const discardDialogRef = useRef<HTMLElement | null>(null);
  const discardKeepEditingRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openRequestRef = useRef(0);
  const requestedEmployeeHandledRef = useRef(false);
  const formIsDirty = useMemo(() => changedForm(form, baselineForm), [form, baselineForm]);
  const employeeFieldErrors = useMemo(() => validateEmployeeForm(form, drawerMode === "create"), [form, drawerMode]);
  const isDrawerOpen = drawerMode !== null;

  useOrganizationAdminAutoRefresh(
    () => setReloadKey((value) => value + 1),
    {
      enabled: Boolean(user),
      shouldRefresh: () => !loading && !saving && !drawerMode && !formIsDirty && !bulkStatusProcessing,
    },
  );
  const eligibleDepartmentOptions = useMemo(
    () => departments.filter((department) => department.status === "ACTIVE" && department.manager_eligible === true && Boolean(department.manager_id)),
    [departments],
  );
  const selectedEligibleDepartment = useMemo(
    () => eligibleDepartmentOptions.find((department) => department.id === form.department_id) ?? null,
    [eligibleDepartmentOptions, form.department_id],
  );
  const eligibleHrManagerOptions = useMemo(
    () => managers.filter((manager) => manager.workforce_role === "HR_MANAGER" && manager.account_status === "ACTIVE"),
    [managers],
  );

  useEffect(() => {
    let active = true;
    async function verifyOrganizationSession() {
      try {
        const response = await fetch("/api/backend/org/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.authenticated !== true || data?.user?.role !== "ORGANIZATION_ADMIN" || !data?.user?.organizationId) {
          router.replace("/");
          return;
        }
        if (active) setUser(data.user as OrgAdminUser);
      } catch (sessionError) {
        console.error("Organization employee session check failed:", sessionError);
        router.replace("/");
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void verifyOrganizationSession();
    return () => { active = false; };
  }, [router]);

  const showEmployeeFieldError = (field: EmployeeFormField) => (submitAttempted || touchedFields.has(field)) && Boolean(employeeFieldErrors[field]);
  const employeeFieldComplete = (field: EmployeeFormField) => {
    const value = form[field];
    if (typeof value === "string" && !value.trim()) return false;
    return !employeeFieldErrors[field];
  };

  useEffect(() => {
    if (!user) return;
    let isActive = true;
    async function loadEmployees() {
      if (!hasLoadedEmployeesRef.current) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
        const query = debouncedSearchQuery.trim();
        if (query) params.set("q", query);
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (departmentFilter === "UNASSIGNED") params.set("unassigned", "true");
        else if (departmentFilter !== "ALL") params.set("departmentId", departmentFilter);

        const response = await fetch(`/api/backend/employees?${params.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (response.status === 401) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error(data?.message || "Unable to load employees.");
        const result = data as EmployeeResponse;
        if (!Array.isArray(result.employees) || !result.pagination) {
          throw new Error("The employee API returned an unexpected response.");
        }
        const nextTotal = Number(result.pagination.total);
        const nextTotalPages = Number(result.pagination.totalPages);
        if (!Number.isFinite(nextTotal) || nextTotal < 0 || !Number.isFinite(nextTotalPages) || nextTotalPages < 0) {
          throw new Error("The employee API returned invalid pagination totals.");
        }
        if (isActive) {
          setEmployees(result.employees);
          hasLoadedEmployeesRef.current = true;
          setTotal(nextTotal);
          setTotalPages(nextTotalPages);
        }
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : "Something went wrong while loading employees.");
      } finally {
        if (isActive) setLoading(false);
      }
    }
    void loadEmployees();
    return () => { isActive = false; };
  }, [page, reloadKey, router, user, debouncedSearchQuery, statusFilter, departmentFilter, sortBy, sortOrder]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    async function loadDirectoryDepartments() {
      setDirectoryDepartmentsLoading(true);
      setDirectoryDepartmentsError("");
      try {
        const response = await fetch("/api/backend/departments?includeInactive=true", {
          method: "GET", credentials: "same-origin", cache: "no-store",
        });
        const data = await response.json().catch(() => null) as DepartmentResponse | null;
        if (response.status === 401) { router.replace("/"); return; }
        if (!response.ok) throw new Error(data?.message || "Unable to load departments for filtering.");
        if (active) setDirectoryDepartments(Array.isArray(data?.departments) ? data.departments : []);
      } catch (err) {
        if (active) setDirectoryDepartmentsError(err instanceof Error ? err.message : "Unable to load departments for filtering.");
      } finally {
        if (active) setDirectoryDepartmentsLoading(false);
      }
    }
    void loadDirectoryDepartments();
    return () => { active = false; };
  }, [reloadKey, router, user]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, departmentFilter, sortBy, sortOrder]);

  // The API has already applied search/status/department filters before pagination.
  // Do not filter only the current page in the browser, which would hide valid
  // matches from other pages and make the displayed total inconsistent.
  const filteredEmployees = employees;
  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL" || departmentFilter !== "ALL";
  const selectedEmployees = employees.filter((employee) => selectedEmployeeIds.has(employee.id));
  const allCurrentPageSelected = employees.length > 0 && employees.every((employee) => selectedEmployeeIds.has(employee.id));

  useEffect(() => {
    // Selection is deliberately scoped to the visible server-paginated page.
    // Changing filters/page never leaves hidden records selected for a bulk action.
    setSelectedEmployeeIds(new Set());
  }, [page, debouncedSearchQuery, statusFilter, departmentFilter, sortBy, sortOrder, reloadKey]);

  const pageCounts = useMemo(() => {
    const departmentKeys = new Set(employees
      .filter((employee) => employee.department_id || employee.department_name)
      .map((employee) => employee.department_id || employee.department_name || ""));
    const active = employees.filter((employee) => employee.employment_status === "ACTIVE").length;
    const unassigned = employees.filter((employee) => !employee.department_id && !employee.department_name).length;
    const assigned = employees.length - unassigned;
    return {
      active,
      inactive: employees.filter((employee) => employee.employment_status === "INACTIVE").length,
      former: employees.filter((employee) => employee.employment_status === "FORMER").length,
      departmentsRepresented: departmentKeys.size,
      unassigned,
      activePercent: employees.length ? Math.round((active / employees.length) * 100) : 0,
      departmentCoverage: employees.length ? Math.round((assigned / employees.length) * 100) : 0,
    };
  }, [employees]);


  const closeDrawerImmediately = useCallback(() => {
    openRequestRef.current += 1;
    setDrawerMode(null);
    setFormStep(1);
    setCreationRole(null);
    setRoleStepConfirmed(false);
    setSelectedEmployee(null);
    setDrawerLoading(false);
    setDrawerError("");
    setDrawerNotice("");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setConfirmDiscard(false);
    setConfirmWorkflowChanges(false);
    const opener = openerRef.current;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      openerRef.current = null;
    });
  }, []);

  const requestCloseDrawer = useCallback(() => {
    if (saving) return;
    if ((drawerMode === "create" || drawerMode === "edit") && formIsDirty) {
      setConfirmDiscard(true);
      return;
    }
    closeDrawerImmediately();
  }, [saving, drawerMode, formIsDirty, closeDrawerImmediately]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      if (drawerMode === "create" && !roleStepConfirmed) {
        document.getElementById("workforce-role-EMPLOYEE")?.focus();
      } else if (drawerMode === "create" || drawerMode === "edit") {
        employeeCodeInputRef.current?.focus();
      } else {
        drawerCloseButtonRef.current?.focus();
      }
    });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen, drawerMode, roleStepConfirmed]);

  useEffect(() => {
    if (!revokeConfirmationEmployee) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => revokeModalCancelRef.current?.focus());

    function handleRevokeModalKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const confirmButton = document.getElementById("revoke-invitation-confirm-button") as HTMLButtonElement | null;
        if (!confirmButton?.disabled) setRevokeConfirmationEmployee(null);
        return;
      }

      if (event.key !== "Tab") return;
      const modal = document.getElementById("revoke-invitation-dialog");
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleRevokeModalKeys, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleRevokeModalKeys, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [revokeConfirmationEmployee]);

  useEffect(() => {
    if (!confirmDiscard) return;
    const frame = window.requestAnimationFrame(() => discardKeepEditingRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => {
        if (drawerCloseButtonRef.current?.isConnected) drawerCloseButtonRef.current.focus();
      });
    };
  }, [confirmDiscard]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    function handleDrawerKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (commandPaletteOpen) return;
        event.preventDefault();
        event.stopPropagation();
        if (confirmWorkflowChanges) setConfirmWorkflowChanges(false);
        else if (confirmDiscard) setConfirmDiscard(false);
        else requestCloseDrawer();
        return;
      }
      if (event.key !== "Tab" || confirmDiscard || confirmWorkflowChanges || !drawerRef.current) return;
      if (!drawerRef.current.contains(document.activeElement)) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleDrawerKeys, true);
    return () => window.removeEventListener("keydown", handleDrawerKeys, true);
  }, [isDrawerOpen, confirmDiscard, confirmWorkflowChanges, requestCloseDrawer, commandPaletteOpen]);


  useEffect(() => {
    if (drawerMode !== "create" && drawerMode !== "edit") return;
    let active = true;
    setDepartmentsLoading(true);
    setDepartments([]);
    setDepartmentError("");
    const employeeId = drawerMode === "edit" ? selectedEmployee?.id : undefined;
    const shouldLoadManagerCandidates = drawerMode === "edit" || creationRole === "DEPARTMENT_MANAGER";

    async function loadDepartments() {
      try {
        const response = await fetch("/api/backend/departments", {
          method: "GET", credentials: "same-origin", cache: "no-store",
        });
        const data = await response.json().catch(() => null) as DepartmentResponse | null;
        if (response.status === 401) { router.replace("/"); return; }
        if (!response.ok) throw new Error(data?.message || "Unable to load departments.");
        if (active) setDepartments(Array.isArray(data?.departments) ? data.departments : []);
      } catch (err) {
        if (active) setDepartmentError(err instanceof Error ? err.message : "Unable to load departments.");
      } finally {
        if (active) setDepartmentsLoading(false);
      }
    }

    async function loadManagers() {
      if (!shouldLoadManagerCandidates) {
        if (active) {
          setManagers([]);
          setManagerError("");
          setManagersLoading(false);
        }
        return;
      }

      setManagersLoading(true);
      setManagerError("");
      try {
        const params = new URLSearchParams();
        if (employeeId) params.set("excludeId", employeeId);
        if (
          (drawerMode === "create" && creationRole === "DEPARTMENT_MANAGER") ||
          (drawerMode === "edit" && selectedEmployee?.workforce_role === "DEPARTMENT_MANAGER")
        ) {
          params.set("role", "HR_MANAGER");
        }
        const query = params.toString();
        const url = `/api/backend/employees/managers${query ? `?${query}` : ""}`;
        const response = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store" });
        const data = await response.json().catch(() => null) as ManagerResponse | null;
        if (response.status === 401) { router.replace("/"); return; }
        if (!response.ok) throw new Error(data?.message || "Unable to load managers.");
        if (active) setManagers(Array.isArray(data?.employees) ? data.employees : []);
      } catch (err) {
        if (active) setManagerError(err instanceof Error ? err.message : "Unable to load managers.");
      } finally {
        if (active) setManagersLoading(false);
      }
    }

    void loadDepartments();
    void loadManagers();
    return () => { active = false; };
  }, [drawerMode, selectedEmployee?.id, selectedEmployee?.workforce_role, creationRole, router]);

  useEffect(() => {
    if (drawerMode !== "view" || !selectedEmployee || employeeDetailTab !== "invitations") return;
    const employeeId = selectedEmployee.id;
    if (employeeDrawerInvitationsLoadedFor === employeeId) return;
    let active = true;
    setEmployeeDrawerInvitationsLoading(true);
    setEmployeeDrawerInvitationsError("");

    async function loadInvitations() {
      try {
        const params = new URLSearchParams({ employeeId, limit: "100", page: "1" });
        const response = await fetch(`/api/backend/org/invitations?${params.toString()}`, {
          method: "GET", credentials: "same-origin", cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (response.status === 401) { router.replace("/"); return; }
        if (!response.ok || !Array.isArray(data?.invitations)) {
          throw new Error(data?.message || "Unable to load invitation history for this employee.");
        }
        if (active) setEmployeeDrawerInvitations(data.invitations as EmployeeInvitationLog[]);
      } catch (loadError) {
        if (active) setEmployeeDrawerInvitationsError(loadError instanceof Error ? loadError.message : "Unable to load employee invitations.");
      } finally {
        if (active) {
          setEmployeeDrawerInvitationsLoadedFor(employeeId);
          setEmployeeDrawerInvitationsLoading(false);
        }
      }
    }

    void loadInvitations();
    return () => { active = false; };
  }, [drawerMode, selectedEmployee?.id, employeeDetailTab, employeeDrawerInvitationsLoadedFor, router]);

  useEffect(() => {
    if (drawerMode !== "view" || !selectedEmployee || employeeDetailTab !== "history") return;
    const employeeId = selectedEmployee.id;
    if (employeeDrawerHistoryLoadedFor === employeeId) return;
    let active = true;
    setEmployeeDrawerHistoryLoading(true);
    setEmployeeDrawerHistoryError("");

    async function loadHistory() {
      try {
        const response = await fetch(`/api/backend/employees/${encodeURIComponent(employeeId)}/history?limit=100&offset=0`, {
          method: "GET", credentials: "same-origin", cache: "no-store",
        });
        const data = await response.json().catch(() => null);
        if (response.status === 401) { router.replace("/"); return; }
        if (!response.ok || !Array.isArray(data?.history)) {
          throw new Error(data?.message || "Unable to load employee history.");
        }
        if (active) setEmployeeDrawerHistory(data.history as EmployeeHistoryEntry[]);
      } catch (loadError) {
        if (active) setEmployeeDrawerHistoryError(loadError instanceof Error ? loadError.message : "Unable to load employee history.");
      } finally {
        if (active) {
          setEmployeeDrawerHistoryLoadedFor(employeeId);
          setEmployeeDrawerHistoryLoading(false);
        }
      }
    }

    void loadHistory();
    return () => { active = false; };
  }, [drawerMode, selectedEmployee?.id, employeeDetailTab, employeeDrawerHistoryLoadedFor, router]);

  function openCreateDrawer() {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openRequestRef.current += 1;
    setSelectedEmployee(null);
    const createForm = {
      ...initialForm,
      joining_date: getCurrentDateInputValue(),
    };
    setForm(createForm);
    setBaselineForm(createForm);
    setFormStep(1);
    setCreationRole(null);
    setRoleStepConfirmed(false);
    setDrawerError("");
    setDrawerNotice("");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setNotice("");
    setNoticeError("");
    setDrawerLoading(false);
    setConfirmDiscard(false);
    setConfirmWorkflowChanges(false);
    setDrawerMode("create");
  }

  async function openEmployeeDrawer(mode: "view" | "edit", employee: Employee) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestId = ++openRequestRef.current;
    setSelectedEmployee(employee);
    if (mode === "view") {
      setEmployeeDetailTab("overview");
      setEmployeeDrawerInvitations([]);
      setEmployeeDrawerInvitationsError("");
      setEmployeeDrawerInvitationsLoadedFor(null);
      setEmployeeDrawerHistory([]);
      setEmployeeDrawerHistoryError("");
      setEmployeeDrawerHistoryLoadedFor(null);
    }
    if (mode === "edit") {
      const nextForm = employeeToForm(employee);
      setForm(nextForm);
      setBaselineForm(nextForm);
    }
    setFormStep(1);
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setDrawerMode(mode);
    setDrawerLoading(true);
    setDrawerError("");
    setDrawerNotice("");
    setConfirmDiscard(false);
    try {
      const response = await fetch(`/api/backend/employees/${encodeURIComponent(employee.id)}`, {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json().catch(() => null) as EmployeeDetailResponse | null;
      if (response.status === 401) { router.replace("/"); return; }
      if (response.status === 404) throw new Error("Employee not found in your organization.");
      if (!response.ok || !data?.employee) throw new Error(data?.message || "Unable to load employee details.");
      if (openRequestRef.current !== requestId) return;
      setSelectedEmployee(data.employee);
      if (mode === "edit") {
        const nextForm = employeeToForm(data.employee);
        setForm(nextForm);
        setBaselineForm(nextForm);
      }
    } catch (err) {
      if (openRequestRef.current === requestId) {
        setDrawerError(err instanceof Error ? err.message : "Unable to load employee details.");
        if (mode === "view") setSelectedEmployee(null);
      }
    } finally {
      if (openRequestRef.current === requestId) setDrawerLoading(false);
    }
  }

  const openEmployeeDrawerRef = useRef(openEmployeeDrawer);
  openEmployeeDrawerRef.current = openEmployeeDrawer;
  useEffect(() => {
    if (requestedEmployeeHandledRef.current || loading) return;
    requestedEmployeeHandledRef.current = true;
    const requestedEmployeeId = new URLSearchParams(window.location.search).get("employeeId");
    if (!requestedEmployeeId) return;

    const candidate = employees.find((employee) => employee.id === requestedEmployeeId) ?? {
      id: requestedEmployeeId,
      organization_id: undefined,
      employee_code: "",
      first_name: "Loading employee",
      last_name: null,
      email: null,
      phone: null,
      country: null,
      city: null,
      designation: null,
      joining_date: null,
      employment_status: "ACTIVE" as EmploymentStatus,
      department_id: null,
      department_name: null,
      manager_id: null,
      manager_name: null,
    };
    window.history.replaceState(window.history.state, "", "/org/employees");
    void openEmployeeDrawerRef.current("view", candidate);
  }, [employees, loading]);

  function beginEditing() {
    if (!selectedEmployee) return;
    setEmployeeDetailTab("overview");
    const nextForm = employeeToForm(selectedEmployee);
    setForm(nextForm);
    setBaselineForm(nextForm);
    setFormStep(1);
    setDrawerError("");
    setDrawerNotice("");
    setTouchedFields(new Set());
    setSubmitAttempted(false);
    setConfirmWorkflowChanges(false);
    setDrawerMode("edit");
    window.requestAnimationFrame(() => {
      employeeCodeInputRef.current?.focus();
    });
  }

  function updateField<K extends keyof EmployeeForm>(field: K, value: EmployeeForm[K]) {
    setForm((current) => {
      if (field === "country") {
        const nextCountry = String(value);
        return {
          ...current,
          country: nextCountry,
          phone: replacePhoneCountryCode(current.phone, current.country, nextCountry),
        };
      }
      return { ...current, [field]: value };
    });
    setTouchedFields((current) => {
      const next = new Set(current).add(field);
      if (field === "country") next.add("phone");
      return next;
    });
    setDrawerError("");
  }

  function handleNextStep() {
    // Validate only fields visible on Step 1. Emergency-contact fields are
    // rendered on Step 2, so validating them here traps new profiles on Step 1.
    const step1Fields: EmployeeFormField[] = ["employee_code", "first_name", "last_name", "country", "city", "phone", "email", "designation"];
    setTouchedFields((current) => {
      const next = new Set(current);
      step1Fields.forEach((f) => next.add(f));
      return next;
    });
    setSubmitAttempted(true);
    const errors = validateEmployeeForm(form, drawerMode === "create");
    const hasStep1Error = step1Fields.some((f) => errors[f]);
    if (hasStep1Error) {
      setDrawerError("Please correct the highlighted personal, contact, and location fields before proceeding. The role was selected in the previous step.");
      const firstErrField = step1Fields.find((f) => errors[f]);
      if (firstErrField) {
        window.requestAnimationFrame(() => document.getElementById(firstErrField)?.focus());
      }
      return;
    }
    setDrawerError("");
    setFormStep(2);
  }

 async function handleSubmitEmployee(confirmedWorkflowChanges = false) {
  setDrawerError("");
  setDrawerNotice("");

  if (
    drawerMode !== "create" &&
    (drawerMode !== "edit" || !selectedEmployee)
  ) {
    return;
  }

  setSubmitAttempted(true);
  setTouchedFields(
    new Set(Object.keys(form) as EmployeeFormField[]),
  );

  const creating = drawerMode === "create";
  const validationErrors = validateEmployeeForm(form, creating);
  const firstInvalidField = (
    Object.keys(form) as EmployeeFormField[]
  ).find((field) => validationErrors[field]);

  if (firstInvalidField) {
    // Keep step routing aligned with the UI: emergency-contact fields are on
    // Step 2, and invalid values must return the user to the step that shows them.
    const step1Fields: EmployeeFormField[] = [
      "employee_code",
      "first_name",
      "last_name",
      "country",
      "city",
      "phone",
      "email",
      "designation",
    ];

    setFormStep(
      step1Fields.includes(firstInvalidField) ? 1 : 2,
    );

    setDrawerError(
      "Please correct the highlighted fields before saving.",
    );

    window.requestAnimationFrame(() =>
      document.getElementById(firstInvalidField)?.focus(),
    );

    return;
  }

  if (creating) {
    if (!creationRole) {
      setFormStep(1);
      setDrawerError(
        "Choose the workforce role before saving this profile.",
      );
      return;
    }

    if (
      creationRole === "DEPARTMENT_MANAGER" &&
      (
        managersLoading ||
        Boolean(managerError) ||
        !eligibleHrManagerOptions.some(
          (manager) => manager.id === form.manager_id,
        )
      )
    ) {
      setFormStep(2);
      setDrawerError(
        "Select an eligible active HR Manager before creating a Department Manager profile.",
      );
      return;
    }

    if (
      creationRole === "EMPLOYEE" &&
      (
        departmentsLoading ||
        Boolean(departmentError) ||
        !selectedEligibleDepartment
      )
    ) {
      setFormStep(2);
      setDrawerError(
        "Select an active department with an eligible active Department Manager before creating an Employee profile.",
      );
      return;
    }
  }

  if (!creating && selectedEmployee) {
    if (
      selectedEmployee.is_primary_hr_manager &&
      form.employment_status !== "ACTIVE"
    ) {
      setFormStep(2);
      setDrawerError(
        "The Primary HR Manager must remain ACTIVE. Transfer the Primary HR Manager designation through the authorized workflow before changing this employee's status.",
      );
      return;
    }

    if (
      selectedEmployee.workforce_role === "EMPLOYEE" &&
      form.employment_status === "ACTIVE" &&
      !selectedEligibleDepartment
    ) {
      setFormStep(2);
      setDrawerError(
        "An ACTIVE Employee must be assigned to an active department with an eligible active Department Manager. Select an eligible department before saving.",
      );
      return;
    }

    if (
      selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" &&
      !eligibleHrManagerOptions.some((manager) => manager.id === form.manager_id)
    ) {
      setFormStep(2);
      setDrawerError(
        "A Department Manager must report to an active HR Manager with an active organization account. Select an eligible HR Manager before saving.",
      );
      return;
    }

    const departmentChanged =
      (form.department_id || null) !== (selectedEmployee.department_id || null);
    const statusChanged = form.employment_status !== selectedEmployee.employment_status;
    const managerChanged =
      selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" &&
      (form.manager_id || null) !== (selectedEmployee.manager_id || null);

    if (
      !confirmedWorkflowChanges &&
      (departmentChanged || statusChanged || managerChanged)
    ) {
      setConfirmWorkflowChanges(true);
      return;
    }
  }

  if (confirmedWorkflowChanges) setConfirmWorkflowChanges(false);
  setSaving(true);

  const creationDepartment =
    creating && creationRole === "EMPLOYEE"
      ? eligibleDepartmentOptions.find(
          (department) => department.id === form.department_id,
        ) ?? null
      : null;

  const emergencyContactChanged = creating || (
    form.emergency_contact_name !== baselineForm.emergency_contact_name ||
    form.emergency_contact_relationship !== baselineForm.emergency_contact_relationship ||
    form.emergency_contact_phone !== baselineForm.emergency_contact_phone
  );

  const payload = {
    employee_code: form.employee_code.trim().toUpperCase(),
    first_name: form.first_name.trim().replace(/\s+/g, " "),
    last_name: form.last_name.trim().replace(/\s+/g, " ") || null,
    email: form.email.trim().toLowerCase() || null,
    phone: form.phone.trim() || null,
    country: form.country.trim(),
    city: form.city.trim(),
    designation: form.designation.trim() || null,

    // For updates, do not send joining_date unless the user actually changed it.
    // This prevents an unrelated profile edit from overwriting a date if an older
    // API response represented the PostgreSQL DATE using a timezone-shifted ISO value.
    ...(creating || form.joining_date !== baselineForm.joining_date
      ? { joining_date: form.joining_date || null }
      : {}),

    // Save the complete emergency-contact section on creation, and only include it
    // in edits when that section changed. The backend validates all three fields.
    ...(emergencyContactChanged ? {
      emergency_contact_name: form.emergency_contact_name.trim().replace(/\s+/g, " ") || null,
      emergency_contact_relationship: form.emergency_contact_relationship.trim().replace(/\s+/g, " ") || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
    } : {}),

    // New profiles must never be activated by this form.
    employment_status: creating
      ? "INACTIVE"
      : form.employment_status,

    workforce_role: creating ? creationRole : undefined,

    // Submit a department assignment only when it actually changes. The API
    // still validates the effective department whenever employment is ACTIVE,
    // but a status-only update to an inactive/former employee should not be
    // treated as a fresh department assignment.
    department_id: creating
      ? creationRole === "EMPLOYEE"
        ? creationDepartment?.id ?? null
        : null
      : selectedEmployee?.workforce_role === "EMPLOYEE" &&
          (form.department_id || null) !== (selectedEmployee.department_id || null)
        ? form.department_id || null
        : undefined,

    manager_id: creating
      ? creationRole === "HR_MANAGER"
        ? null
        : creationRole === "DEPARTMENT_MANAGER"
          ? form.manager_id || null
          : creationDepartment?.manager_id ?? null
      : selectedEmployee?.workforce_role === "EMPLOYEE"
        ? (form.department_id || null) !== (selectedEmployee.department_id || null)
          ? departments.find((department) => department.id === form.department_id)?.manager_id ?? null
          : selectedEmployee.manager_id ?? null
        : form.manager_id || null,
  };

  try {
    const url = creating
      ? "/api/backend/employees"
      : `/api/backend/employees/${encodeURIComponent(
          selectedEmployee!.id,
        )}`;

    const response = await fetch(url, {
      method: creating ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      router.replace("/");
      return;
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
          (creating
            ? "Unable to create workforce profile."
            : "Unable to update employee."),
      );
    }

    if (creating) {
      const createdEmployee = data?.employee as Employee | undefined;
      const selectedRole = creationRole;
      setPage(1);
      setReloadKey((value) => value + 1);
      closeDrawerImmediately();
      setNoticeError("");

      if (!createdEmployee?.id || !selectedRole || !createdEmployee.email) {
        setNoticeError(
          "The workforce profile was saved, but the server did not return all details required to send its invitation. Refresh the directory and use the invitation action to retry.",
        );
        setNotice("");
        return;
      }

      try {
        const invitationResponse = await fetch(
          `/api/backend/employees/${encodeURIComponent(createdEmployee.id)}/invitation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ roleName: createdEmployee.workforce_role ?? selectedRole }),
          },
        );
        const invitationData = await invitationResponse.json().catch(() => null) as EmployeeInvitationResponse | null;
        if (invitationResponse.status === 401) {
          router.replace("/");
          return;
        }
        if (!invitationResponse.ok || invitationData?.emailSent !== true) {
          throw new Error(invitationData?.message || "The email service did not confirm invitation delivery.");
        }
        setNotice(`Workforce profile created and invitation email sent to ${createdEmployee.email}.`);
      } catch (invitationFailure) {
        setNoticeError(
          `The workforce profile was created, but its invitation email could not be confirmed: ${invitationFailure instanceof Error ? invitationFailure.message : "Unknown email delivery error"} Refresh the directory and use the invitation action to retry.`,
        );
      }
      return;
    }

    const updatedEmployeeId = selectedEmployee!.id;

    let updatedEmployee: Employee | null =
      (data?.employee as Employee | undefined) ?? null;

    try {
      const detailResponse = await fetch(
        `/api/backend/employees/${encodeURIComponent(
          updatedEmployeeId,
        )}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const detailData =
        (await detailResponse.json().catch(() => null)) as
          | EmployeeDetailResponse
          | null;

      if (detailResponse.status === 401) {
        router.replace("/");
        return;
      }

      if (detailResponse.ok && detailData?.employee) {
        updatedEmployee = detailData.employee;
      }
    } catch {
      // Retain the update response as a fallback.
    }

    const assignedDepartment = departments.find(
      (department) => department.id === payload.department_id,
    );

    const assignedManager = managers.find(
      (manager) => manager.id === payload.manager_id,
    );

    const fallbackUpdated: Employee = {
      ...selectedEmployee!,
      ...(updatedEmployee ?? {}),
      ...payload,
      department_name:
        updatedEmployee?.department_name ??
        assignedDepartment?.name ??
        null,
      manager_name:
        updatedEmployee?.manager_name ??
        (
          assignedManager
            ? [
                assignedManager.first_name,
                assignedManager.last_name,
              ].filter(Boolean).join(" ")
            : null
        ),
    };

    setSelectedEmployee(fallbackUpdated);

    setEmployees((current) =>
      current.map((item) =>
        item.id === updatedEmployeeId
          ? { ...item, ...fallbackUpdated }
          : item,
      ),
    );

    const nextForm = employeeToForm(fallbackUpdated);

    setForm(nextForm);
    setBaselineForm(nextForm);
    setDrawerMode("view");
    const statusChanged = selectedEmployee!.employment_status !== fallbackUpdated.employment_status;
    const departmentChanged = (selectedEmployee!.department_id || null) !== (fallbackUpdated.department_id || null);
    const managerChanged = (selectedEmployee!.manager_id || null) !== (fallbackUpdated.manager_id || null);
    const workflowMessages: string[] = [];
    if (statusChanged) workflowMessages.push(`employment status changed to ${fallbackUpdated.employment_status.toLowerCase()}`);
    if (departmentChanged) workflowMessages.push(`department changed to ${fallbackUpdated.department_name || "unassigned"}`);
    if (managerChanged && selectedEmployee!.workforce_role === "DEPARTMENT_MANAGER") workflowMessages.push("reporting manager updated");
    setDrawerNotice(
      workflowMessages.length
        ? `Employee updated successfully: ${workflowMessages.join("; ")}.`
        : "Employee updated successfully.",
    );
    setReloadKey((value) => value + 1);
  } catch (err) {
    setDrawerError(
      err instanceof Error
        ? err.message
        : "Something went wrong. Please try again.",
    );
  } finally {
    setSaving(false);
  }
}

  function openInvitationDialog(employee: Employee) {
    setInvitingEmployee(employee);
    setInvitationError(
      employee.has_pending_invitation
        ? "This employee already has a pending invitation. Create another invitation only after the existing invitation expires or is revoked."
        : !employee.workforce_role
          ? "This employee profile has no assigned workforce role. Correct the profile before inviting."
          : ""
    );
    setInvitationUrl("");
    setInvitationEmailSent(false);
    setInvitationLinkCopied(false);
  }

  function closeInvitationDialog() {
    if (creatingInvitation) return;

    setInvitingEmployee(null);
    setInvitationError("");
    setInvitationUrl("");
    setInvitationEmailSent(false);
    setInvitationLinkCopied(false);
  }

  async function handleCreateInvitation() {
    if (!invitingEmployee || creatingInvitation) return;

    const profileRole = invitingEmployee.workforce_role;
    if (!profileRole) {
      setInvitationError("This employee profile has no assigned workforce role. Correct the profile before inviting.");
      return;
    }
    if (invitingEmployee.has_pending_invitation) {
      setInvitationError("This employee already has a pending invitation. Revoke or let the existing invitation expire before creating another.");
      return;
    }

    setCreatingInvitation(true);
    setInvitationError("");
    setInvitationUrl("");
    setInvitationEmailSent(false);
    setInvitationLinkCopied(false);

    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(invitingEmployee.id)}/invitation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ roleName: profileRole }),
        }
      );

      const data = (await response.json().catch(() => null)) as EmployeeInvitationResponse | null;

      if (response.status === 401) {
        router.replace("/");
        return;
      }

      if (!response.ok) {
        throw new Error(data?.message || "Unable to create the employee invitation.");
      }

      if (!data?.invitationUrl) {
        throw new Error("The invitation was created, but no activation link was returned.");
      }
      if (data.emailSent !== true) {
        throw new Error("The email service did not confirm that the invitation was delivered.");
      }

      setInvitationEmailSent(true);
      setInvitationUrl(data.invitationUrl);
      setInvitingEmployee((current) => current ? {
        ...current,
        invitation_id: data.invitation?.id ?? current.invitation_id ?? null,
        invitation_status: "PENDING",
        invitation_expires_at: data.invitation?.expires_at ?? current.invitation_expires_at ?? null,
        has_pending_invitation: true,
      } : current);
      setReloadKey((current) => current + 1);
    } catch (err) {
      setInvitationError(
        err instanceof Error ? err.message : "Unable to create the employee invitation."
      );
    } finally {
      setCreatingInvitation(false);
    }
  }

  function handleRevokeInvitation(employee: Employee) {
    if (revokingInvitationEmployeeId) return;

    if (!invitationIsPending(employee)) {
      setNoticeError("This employee no longer has a pending invitation. Refresh the directory and try again.");
      setReloadKey((current) => current + 1);
      return;
    }

    if (!employee.invitation_id) {
      setNoticeError("The pending invitation ID is missing from the directory response. Refresh the directory before revoking it.");
      setReloadKey((current) => current + 1);
      return;
    }

    setNoticeError("");
    setRevokeConfirmationEmployee(employee);
  }

  async function confirmRevokeInvitation() {
    const employee = revokeConfirmationEmployee;
    if (!employee || revokingInvitationEmployeeId) return;

    if (!invitationIsPending(employee) || !employee.invitation_id) {
      setRevokeConfirmationEmployee(null);
      setNoticeError("This invitation is no longer pending or its ID is missing. The directory will refresh.");
      setReloadKey((current) => current + 1);
      return;
    }

    const employeeName = getFullName(employee);
    setRevokingInvitationEmployeeId(employee.id);
    setNoticeError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/backend/employees/${encodeURIComponent(employee.id)}/invitation/revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            invitationId: employee.invitation_id,
            reason: "Revoked by an authorized organization administrator from the Employee Directory.",
          }),
        },
      );

      const data = await response.json().catch(() => null) as {
        message?: string;
        invitation?: { status?: string };
      } | null;

      if (response.status === 401) {
        router.replace("/");
        return;
      }

      // Expired invitations are finalized by the API before it returns 409.
      if (response.status === 409 && data?.invitation?.status?.toUpperCase() === "EXPIRED") {
        setEmployees((current) => current.map((item) =>
          item.id === employee.id
            ? { ...item, invitation_status: "EXPIRED", has_pending_invitation: false }
            : item,
        ));
        setRevokeConfirmationEmployee(null);
        setNotice(`The invitation for ${employeeName} had already expired and is now marked EXPIRED.`);
        setReloadKey((current) => current + 1);
        return;
      }

      if (!response.ok) {
        throw new Error(data?.message || "Unable to revoke this invitation.");
      }

      const returnedStatus = data?.invitation?.status?.toUpperCase();
      const effectiveStatus = returnedStatus || "REVOKED";
      if (effectiveStatus !== "REVOKED") {
        throw new Error("The server did not confirm that the invitation was revoked. Refresh the directory and try again.");
      }

      setEmployees((current) => current.map((item) =>
        item.id === employee.id
          ? {
              ...item,
              invitation_status: "REVOKED",
              has_pending_invitation: false,
            }
          : item,
      ));

      setRevokeConfirmationEmployee(null);
      setInvitationError("");
      setNotice(`The pending invitation for ${employeeName} was revoked. Its activation link can no longer be used.`);
      setReloadKey((current) => current + 1);
    } catch (revokeError) {
      setNoticeError(
        revokeError instanceof Error
          ? revokeError.message
          : "Unable to revoke this invitation. Refresh the directory and try again.",
      );
    } finally {
      setRevokingInvitationEmployeeId(null);
    }
  }

  async function handleCopyInvitationLink() {
    if (!invitationUrl) return;

    try {
      await navigator.clipboard.writeText(invitationUrl);
      setInvitationLinkCopied(true);
      setInvitationError("");
    } catch {
      setInvitationError("Clipboard access failed. Select and copy the activation link manually.");
    }
  }

  function toggleEmployeeSelection(employeeId: string) {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function toggleCurrentPageSelection() {
    setSelectedEmployeeIds(allCurrentPageSelected ? new Set() : new Set(employees.map((employee) => employee.id)));
  }

  function exportSelectedEmployees() {
    const chosen = employees.filter((employee) => selectedEmployeeIds.has(employee.id));
    if (chosen.length === 0) return;
    const exportRows = chosen.map((employee) => ({
      employeeCode: employee.employee_code,
      firstName: employee.first_name,
      lastName: employee.last_name,
      email: employee.email,
      phone: employee.phone,
      department: employee.department_name,
      workforceRole: employee.workforce_role,
      reportingManager: employee.manager_name,
      location: [employee.city, employee.country ? formatCountryWithFlag(employee.country) : ""].filter(Boolean).join(", "),
      designation: employee.designation,
      joiningDate: employee.joining_date,
      employmentStatus: employee.employment_status,
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), count: exportRows.length, employees: exportRows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `selected-employees-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBulkStatusNotice(`Exported ${chosen.length} selected employee record${chosen.length === 1 ? "" : "s"}.`);
    setBulkStatusError("");
  }

  async function applyBulkStatusChange() {
    const chosen = employees.filter((employee) => selectedEmployeeIds.has(employee.id));
    if (chosen.length === 0 || bulkStatusProcessing) return;
    setBulkStatusProcessing(true);
    setBulkStatusError("");
    setBulkStatusNotice("");
    const succeeded: Employee[] = [];
    const failed: Array<{ employee: Employee; message: string }> = [];

    try {
      for (const employee of chosen) {
        if (employee.employment_status === bulkStatusTarget) continue;
        if (employee.is_primary_hr_manager && bulkStatusTarget !== "ACTIVE") {
          failed.push({ employee, message: "The Primary HR Manager must remain active until the designation is transferred." });
          continue;
        }
        try {
          const response = await fetch(`/api/backend/employees/${encodeURIComponent(employee.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ employment_status: bulkStatusTarget }),
          });
          const data = await response.json().catch(() => null);
          if (response.status === 401) {
            router.replace("/");
            return;
          }
          if (!response.ok) throw new Error(data?.message || `Update returned HTTP ${response.status}.`);
          succeeded.push(employee);
        } catch (err) {
          failed.push({ employee, message: err instanceof Error ? err.message : "Update failed." });
        }
      }

      setSelectedEmployeeIds(new Set());
      setBulkStatusConfirmOpen(false);
      if (succeeded.length > 0) setReloadKey((current) => current + 1);
      setBulkStatusNotice(`${succeeded.length} employee${succeeded.length === 1 ? "" : "s"} updated to ${bulkStatusTarget.toLowerCase()}.${failed.length ? ` ${failed.length} could not be updated.` : ""}`);
      if (failed.length) {
        setBulkStatusError(failed.slice(0, 4).map(({ employee, message }) => `${employee.employee_code}: ${message}`).join(" "));
      }
    } finally {
      setBulkStatusProcessing(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/backend/org/auth/logout", { method: "POST", credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Logout failed.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (checkingSession || !user) {
    return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f17] px-6 text-slate-100"><div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,132,196,0.14),transparent_44%)]" /><div role="status" aria-live="polite" className="relative flex items-center gap-3 rounded-2xl border border-[#29384b] bg-[#111a28]/90 px-6 py-5 shadow-2xl backdrop-blur-xl"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#75c7ff] shadow-[0_0_14px_rgba(117,199,255,0.6)]" /><p className="text-sm font-medium text-slate-200">Verifying your organization session…</p></div></main>;
  }

  return (
    <div className="org-admin-workspace relative min-h-screen bg-[#0b0f17] text-[#f8fafc] font-sans scheme-dark selection:bg-[#75c7ff]/20 selection:text-white">
      <OrganizationAdminSidebar activePage="employees" />

      <main className="relative z-10 min-h-screen lg:ml-64">
        <OrganizationAdminHeader
          activePage="employees"
          organizationName={user.organizationName}
          loggingOut={loggingOut}
          onLogout={() => void handleLogout()}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteOpenChange={setCommandPaletteOpen}
          onCreate={() => {
            if ((drawerMode === "create" || drawerMode === "edit") && formIsDirty) {
              setDrawerError("Save or discard your unsaved employee changes before opening another form.");
              return false;
            }
            openCreateDrawer();
            return true;
          }}
          onNavigateRequest={() => {
            if ((drawerMode === "create" || drawerMode === "edit") && formIsDirty) {
              setDrawerError("Save or discard your unsaved employee changes before navigating away.");
              return false;
            }
            if (drawerMode) closeDrawerImmediately();
            return true;
          }}
        />

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {(logoutError || noticeError) && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">{logoutError || noticeError}</div>}
          {notice && <div role="status" aria-live="polite" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-4 text-sm font-medium text-emerald-200"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss success message"><Icon name="close" size={16} /></button></div>}

          {/* Metrics Grid */}
          <section aria-label="Employee metrics" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total records</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/15 text-blue-300"><Icon name="users" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : total.toLocaleString()}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">Across matching directory results</p>
              </div>
            </article>

            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active on page</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"><Icon name="userCheck" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : pageCounts.active}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">{loading ? "Updating" : `${pageCounts.activePercent}% of loaded list`}</p>
              </div>
            </article>

            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Departments</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 text-violet-300"><Icon name="layers" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : pageCounts.departmentsRepresented}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">Represented on this page</p>
              </div>
            </article>

            <article className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm transition-colors hover:border-[#3b536d]">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Unassigned</p>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-300"><Icon name="alert" size={20} /></span>
                </div>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-white">{loading ? "…" : error ? "—" : pageCounts.unassigned}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">Without active department</p>
              </div>
            </article>
          </section>

          {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200"><Icon name="alert" size={18} /><div className="flex-1"><p>{error}</p></div></div>}

          {/* Employee directory — dense table by default, optional cards for individual review. */}
          <section className="overflow-hidden rounded-xl border border-[#29384b] bg-[#141f2e]/90">
            <div className="flex flex-col gap-3 border-b border-[#29384b] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-bold text-white">Employee directory</h2>
                
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-[#29384b] bg-[#0f1724] p-1" aria-label="Directory view">
                  <button type="button" onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === "table" ? "bg-[#26374b] text-white" : "text-slate-400 hover:text-white"}`}>Table</button>
                  <button type="button" onClick={() => setViewMode("cards")} aria-pressed={viewMode === "cards"} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${viewMode === "cards" ? "bg-[#26374b] text-white" : "text-slate-400 hover:text-white"}`}>Cards</button>
                </div>
                <span className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-300">Page {page} / {Math.max(totalPages, 1)}</span>
                <button type="button" onClick={openCreateDrawer} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#75c7ff] px-3.5 text-xs font-bold text-[#07111d] transition hover:bg-[#a0dcff]"><Icon name="plus" size={14} />Add Employee</button>
                
              </div>
            </div>

            <div className="space-y-3 border-b border-[#29384b] px-4 py-4 sm:px-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(250px,1.4fr)_minmax(170px,0.9fr)_minmax(145px,0.75fr)_minmax(170px,0.9fr)_minmax(125px,0.6fr)]">
                <div className="min-w-0">
                  <label htmlFor="employee-search-table" className="mb-1.5 block text-xs font-semibold text-slate-300">Search directory</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-3 text-slate-500"><Icon name="search" size={16} /></span>
                    <input id="employee-search-table" type="search" maxLength={100} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name, code, email, location…" className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-[#75c7ff]/70 focus:ring-2 focus:ring-[#75c7ff]/10" />
                  </div>
                </div>
                <div className="min-w-0">
                  <label htmlFor="employee-department-filter" className="mb-1.5 block text-xs font-semibold text-slate-300">Department</label>
                  <select id="employee-department-filter" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} disabled={directoryDepartmentsLoading} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none transition focus:border-[#75c7ff]/70 disabled:opacity-60">
                    <option value="ALL">All departments</option>
                    <option value="UNASSIGNED">No department assigned</option>
                    {directoryDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.status && department.status !== "ACTIVE" ? ` · ${department.status.toLowerCase()}` : ""}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="employee-status-filter" className="mb-1.5 block text-xs font-semibold text-slate-300">Employment status</label>
                  <select id="employee-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none transition focus:border-[#75c7ff]/70">
                    <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="FORMER">Former</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="employee-sort-by" className="mb-1.5 block text-xs font-semibold text-slate-300">Sort by</label>
                  <select
                    id="employee-sort-by"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as EmployeeSortBy)}
                    className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none transition focus:border-[#75c7ff]/70"
                  >
                    <option value="created_at">Date added</option>
                    <option value="employee_code">Employee code</option>
                    <option value="name">Employee name</option>
                    <option value="department">Department</option>
                    <option value="designation">Designation</option>
                    <option value="workforce_role">Workforce role</option>
                    <option value="employment_status">Employment status</option>
                    <option value="joining_date">Joining date</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="employee-sort-order" className="mb-1.5 block text-xs font-semibold text-slate-300">Order</label>
                  <select
                    id="employee-sort-order"
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value as EmployeeSortOrder)}
                    className="h-10 w-full rounded-lg border border-[#29384b] bg-[#0f1724] px-3 text-sm text-white outline-none transition focus:border-[#75c7ff]/70"
                  >
                    <option value="asc">Ascending (A–Z / oldest first)</option>
                    <option value="desc">Descending (Z–A / newest first)</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">{loading ? "Loading records…" : `${filteredEmployees.length} shown on this page · ${total.toLocaleString()} matching in total`}</p>
                {hasActiveFilters && <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setDepartmentFilter("ALL"); setPage(1); }} className="text-xs font-semibold text-[#9ed8ff] underline-offset-4 hover:underline">Reset all filters</button>}
              </div>
              {directoryDepartmentsError && <p role="status" aria-live="polite" className="text-xs text-amber-200">Department choices could not be loaded. Search and status filters remain available.</p>}
            </div>

            {bulkStatusNotice && <div role="status" aria-live="polite" className="mx-4 mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-200 sm:mx-5">{bulkStatusNotice}</div>}
            {bulkStatusError && <div role="alert" className="mx-4 mt-3 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-100 sm:mx-5">Some bulk updates were rejected by workforce rules: {bulkStatusError}</div>}

            {selectedEmployees.length > 0 && !loading && (
              <div className="sticky top-2 z-20 mx-4 mt-3 flex flex-col gap-2 rounded-xl border border-[#3a4d64] bg-[#101a28] p-3 shadow-md sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-white">{selectedEmployees.length} selected <span className="font-normal text-slate-400">(this page)</span></p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={exportSelectedEmployees} className="h-9 rounded-lg border border-[#34465d] bg-[#172334] px-3 text-xs font-semibold text-slate-200 hover:bg-[#1c2b40]">Export selected</button>
                  <label className="sr-only" htmlFor="bulk-status-target">New employment status</label>
                  <select id="bulk-status-target" value={bulkStatusTarget} onChange={(event) => setBulkStatusTarget(event.target.value as EmploymentStatus)} className="h-9 rounded-lg border border-[#34465d] bg-[#0b0f17] px-3 text-xs text-white">
                    <option value="ACTIVE">Set Active</option><option value="INACTIVE">Set Inactive</option><option value="FORMER">Set Former</option>
                  </select>
                  <button type="button" onClick={() => { setBulkStatusError(""); setBulkStatusConfirmOpen(true); }} className="h-9 rounded-lg bg-[#75c7ff] px-3.5 text-xs font-bold text-[#07111d] hover:bg-[#a0dcff]">Review status change</button>
                  <button type="button" onClick={() => setSelectedEmployeeIds(new Set())} className="h-9 rounded-lg border border-[#34465d] px-3 text-xs font-semibold text-slate-300 hover:text-white">Clear selection</button>
                </div>
              </div>
            )}

            {loading ? (
              <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse divide-y divide-[#29384b]/75 px-5 py-3">
                {[1, 2, 3, 4, 5].map((item) => <div key={item} className="flex items-center justify-between py-3"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-[#29384b]" /><div className="space-y-2"><div className="h-3.5 w-32 rounded bg-[#29384b]" /><div className="h-3 w-48 rounded bg-[#29384b]/60" /></div></div><div className="hidden sm:block"><div className="h-3.5 w-24 rounded bg-[#29384b]" /></div></div>)}
              </div>
            ) : error ? (
              <div className="px-5 py-10 text-center text-sm text-slate-300">Employee records could not be loaded.</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] text-slate-400"><Icon name="users" size={21} /></span>
                <h3 className="mt-3 text-base font-bold text-white">{total === 0 && !hasActiveFilters ? "No employees yet" : "No matching employees"}</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{total === 0 && !hasActiveFilters ? "Create your first employee record to start building the organization directory." : "No records match the current search and filters. Reset them or create a new employee profile."}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {hasActiveFilters && <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setDepartmentFilter("ALL"); setPage(1); }} className="inline-flex items-center gap-2 rounded-lg border border-[#34465d] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.04]">Reset all filters</button>}
                  <button type="button" onClick={openCreateDrawer} className="inline-flex items-center gap-2 rounded-lg bg-[#75c7ff] px-3.5 py-2 text-xs font-bold text-[#07111d] hover:bg-[#a0dcff]"><Icon name="plus" size={14} />Create employee</button>
                </div>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto overscroll-x-contain px-3 pb-2 sm:px-4">
                <table className="w-full min-w-[930px] text-left text-sm">
                  <thead className="border-b border-[#29384b] bg-[#111a28]/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th scope="col" className="w-10 px-2 py-3"><input aria-label="Select all employees on this page" type="checkbox" checked={allCurrentPageSelected} onChange={toggleCurrentPageSelection} className="h-4 w-4 rounded border-[#526277] bg-[#0f1724] accent-[#75c7ff]" /></th>
                      <th scope="col" className="px-3 py-3">Employee</th><th scope="col" className="px-3 py-3">Department</th><th scope="col" className="px-3 py-3">Role & reporting</th><th scope="col" className="px-3 py-3">Location</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#29384b]/80">
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id} className={`transition-colors hover:bg-white/[0.02] ${selectedEmployeeIds.has(employee.id) ? "bg-[#75c7ff]/[0.035]" : ""}`}>
                        <td className="px-2 py-3 align-top"><input aria-label={`Select ${getFullName(employee)}`} type="checkbox" checked={selectedEmployeeIds.has(employee.id)} onChange={() => toggleEmployeeSelection(employee.id)} className="mt-1 h-4 w-4 rounded border-[#526277] bg-[#0f1724] accent-[#75c7ff]" /></td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex min-w-0 items-start gap-2.5"><EmployeeProfilePhoto employeeId={employee.id} name={getFullName(employee)} className="h-9 w-9 shrink-0 rounded-lg border border-[#34465d] bg-[#182232] text-xs font-bold text-slate-100" /><div className="min-w-0"><button type="button" onClick={() => void openEmployeeDrawer("view", employee)} className="block max-w-[210px] truncate text-left text-sm font-semibold text-white hover:text-[#9ed8ff]">{getFullName(employee)}</button><p className="mt-0.5 max-w-[210px] truncate text-xs text-slate-400">{employee.email || "No email"}</p><p className="mt-1 text-[11px] text-slate-500"><span className="font-mono text-slate-300">{employee.employee_code}</span>{employee.designation ? ` · ${employee.designation}` : ""}{employee.joining_date ? ` · Joined ${formatDate(employee.joining_date)}` : ""}</p></div></div>
                        </td>
                        <td className="max-w-[145px] px-3 py-3 align-top text-xs font-medium text-slate-200"><span className="line-clamp-2">{employee.department_name || <span className="text-slate-500">Unassigned</span>}</span></td>
                        <td className="max-w-[220px] px-3 py-3 align-top"><div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md border border-[#34465d] bg-[#182232] px-2 py-1 text-[10px] font-semibold text-slate-200">{employee.workforce_role ? workforceRoleLabel(employee.workforce_role) : "Role not assigned"}</span>{employee.is_primary_hr_manager && <span className="rounded-md border border-amber-400/20 bg-amber-500/[0.06] px-2 py-1 text-[10px] font-semibold text-amber-200">Primary HR</span>}</div><div className="mt-1.5 flex min-w-0 items-center gap-1.5">{employee.manager_id && <EmployeeProfilePhoto employeeId={employee.manager_id} name={employee.manager_name || "Reporting manager"} className="h-6 w-6 shrink-0 rounded-md border border-[#34465d] bg-[#182232] text-[9px]" />}<p className="truncate text-xs font-medium text-slate-200">{employee.manager_name || "No manager assigned"}</p></div>{employee.manager_name && <p className="mt-0.5 truncate text-[10px] text-slate-500">{employee.manager_workforce_role ? workforceRoleLabel(employee.manager_workforce_role) : "Manager role unavailable"}{employee.manager_employee_code ? ` · ${employee.manager_employee_code}` : ""}</p>}{employee.workforce_role === "DEPARTMENT_MANAGER" && <span className="mt-1 inline-flex rounded-md border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] px-2 py-1 text-[10px] font-semibold text-[#bfe5ff]">Manages {Number(employee.managed_department_count ?? 0)} department{Number(employee.managed_department_count ?? 0) === 1 ? "" : "s"}</span>}</td>
                        <td className="max-w-[120px] px-3 py-3 align-top text-xs text-slate-300"><span className="line-clamp-2">{[employee.city, employee.country ? formatCountryWithFlag(employee.country) : ""].filter(Boolean).join(", ") || <span className="text-slate-500">—</span>}</span></td>
                        <td className="px-3 py-3 align-top"><div className="flex min-w-[130px] flex-col items-start gap-1.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle(employee.employment_status)}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDotStyle(employee.employment_status)}`} />{employee.employment_status.charAt(0) + employee.employment_status.slice(1).toLowerCase()}</span>{invitationIsPending(employee) ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/[0.08] px-2 py-1 text-[10px] font-semibold text-amber-200" title={employee.invitation_expires_at ? `Expires ${formatDate(employee.invitation_expires_at)}` : "An invitation is waiting for acceptance"}><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Invitation pending</span> : employee.invitation_status?.toUpperCase() === "EXPIRED" ? <span className="rounded-full border border-slate-500/30 bg-slate-500/[0.08] px-2 py-1 text-[10px] font-semibold text-slate-300">Invitation expired</span> : employee.invitation_status?.toUpperCase() === "ACCEPTED" ? <span className="rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] px-2 py-1 text-[10px] font-semibold text-emerald-200">Invitation accepted</span> : employee.invitation_status?.toUpperCase() === "REVOKED" ? <span className="rounded-full border border-rose-400/25 bg-rose-500/[0.06] px-2 py-1 text-[10px] font-semibold text-rose-200">Invitation revoked</span> : null}</div></td>
                        <td className="px-3 py-3 align-top"><div className="flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => void openEmployeeDrawer("view", employee)} aria-label={`View ${getFullName(employee)}`} className="rounded-md border border-[#34465d] px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.05]">View</button><button type="button" onClick={() => void openEmployeeDrawer("edit", employee)} aria-label={`Edit ${getFullName(employee)}`} className="rounded-md border border-[#34465d] px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.05]">Edit</button><button type="button" onClick={() => openInvitationDialog(employee)} disabled={invitationActionDisabled(employee)} title={invitationActionTitle(employee)} className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed ${invitationIsPending(employee) ? "border-amber-400/25 bg-amber-500/[0.06] text-amber-200 opacity-90" : "border-[#75c7ff]/30 bg-[#75c7ff]/10 text-[#bfe5ff] hover:bg-[#75c7ff]/15 disabled:opacity-40"}`}>{invitationActionLabel(employee)}</button>{invitationIsPending(employee) && <button type="button" onClick={() => void handleRevokeInvitation(employee)} disabled={revokingInvitationEmployeeId !== null || !employee.invitation_id} title={!employee.invitation_id ? "Refresh the directory to load the pending invitation ID" : "Revoke this pending activation invitation"} aria-label={`Revoke pending invitation for ${getFullName(employee)}`} className="rounded-md border border-rose-400/30 bg-rose-500/[0.08] px-2 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40">{revokingInvitationEmployeeId === employee.id ? "Revoking…" : "Revoke"}</button>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredEmployees.map((employee) => (
                  <article key={employee.id} className={`rounded-xl border p-4 transition-colors ${selectedEmployeeIds.has(employee.id) ? "border-[#75c7ff]/50 bg-[#75c7ff]/[0.035]" : "border-[#29384b] bg-[#0f1724]/55 hover:border-[#3b536d]"}`}>
                    <div className="flex items-start gap-3"><input aria-label={`Select ${getFullName(employee)}`} type="checkbox" checked={selectedEmployeeIds.has(employee.id)} onChange={() => toggleEmployeeSelection(employee.id)} className="mt-1 h-4 w-4 rounded border-[#526277] bg-[#0f1724] accent-[#75c7ff]" /><EmployeeProfilePhoto employeeId={employee.id} name={getFullName(employee)} className="h-10 w-10 shrink-0 rounded-lg border border-[#34465d] bg-[#182232] text-xs font-bold text-slate-100" /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-white">{getFullName(employee)}</h3><p className="truncate text-xs text-slate-400">{employee.email || "No email"}</p><p className="mt-1 font-mono text-[11px] text-slate-300">{employee.employee_code}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle(employee.employment_status)}`}>{employee.employment_status.charAt(0) + employee.employment_status.slice(1).toLowerCase()}</span>{invitationIsPending(employee) ? <span className="rounded-full border border-amber-400/25 bg-amber-500/[0.08] px-2 py-1 text-[9px] font-semibold text-amber-200">Invite pending</span> : employee.invitation_status?.toUpperCase() === "EXPIRED" ? <span className="rounded-full border border-slate-500/30 bg-slate-500/[0.08] px-2 py-1 text-[9px] font-semibold text-slate-300">Invite expired</span> : employee.invitation_status?.toUpperCase() === "ACCEPTED" ? <span className="rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] px-2 py-1 text-[9px] font-semibold text-emerald-200">Invite accepted</span> : employee.invitation_status?.toUpperCase() === "REVOKED" ? <span className="rounded-full border border-rose-400/25 bg-rose-500/[0.06] px-2 py-1 text-[9px] font-semibold text-rose-200">Invite revoked</span> : null}</div></div>
                    <dl className="mt-4 space-y-2 border-t border-[#29384b] pt-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Department</dt><dd className="max-w-[65%] text-right font-medium text-slate-200">{employee.department_name || "Unassigned"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Role</dt><dd className="text-right font-medium text-slate-200">{employee.workforce_role ? workforceRoleLabel(employee.workforce_role) : "Unassigned"}{employee.is_primary_hr_manager ? " · Primary HR" : ""}</dd></div>{employee.workforce_role === "DEPARTMENT_MANAGER" && <div className="flex justify-between gap-3"><dt className="text-slate-500">Managed departments</dt><dd className="text-right font-semibold text-[#bfe5ff]">{Number(employee.managed_department_count ?? 0)}</dd></div>}<div className="flex justify-between gap-3"><dt className="text-slate-500">Reports to</dt><dd className="flex max-w-[65%] items-center justify-end gap-1.5 text-right text-slate-300">{employee.manager_id && <EmployeeProfilePhoto employeeId={employee.manager_id} name={employee.manager_name || "Reporting manager"} className="h-6 w-6 shrink-0 rounded-md border border-[#34465d] bg-[#182232] text-[9px]" />}<span>{employee.manager_name || "No manager assigned"}</span></dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Location</dt><dd className="max-w-[65%] text-right text-slate-300">{[employee.city, employee.country ? formatCountryWithFlag(employee.country) : ""].filter(Boolean).join(", ") || "—"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Designation / joined</dt><dd className="max-w-[65%] text-right text-slate-300">{employee.designation || "—"}{employee.joining_date ? ` · ${formatDate(employee.joining_date)}` : ""}</dd></div></dl>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#29384b] pt-3"><button type="button" onClick={() => void openEmployeeDrawer("view", employee)} className="flex-1 rounded-lg border border-[#34465d] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]">View</button><button type="button" onClick={() => void openEmployeeDrawer("edit", employee)} className="flex-1 rounded-lg border border-[#34465d] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.05]">Edit</button><button type="button" onClick={() => openInvitationDialog(employee)} disabled={invitationActionDisabled(employee)} title={invitationActionTitle(employee)} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${invitationIsPending(employee) ? "border-amber-400/25 bg-amber-500/[0.06] text-amber-200 opacity-90" : "border-[#75c7ff]/30 bg-[#75c7ff]/10 text-[#bfe5ff] hover:bg-[#75c7ff]/15 disabled:opacity-40"}`}>{invitationActionLabel(employee)}</button>{invitationIsPending(employee) && <button type="button" onClick={() => void handleRevokeInvitation(employee)} disabled={revokingInvitationEmployeeId !== null || !employee.invitation_id} title={!employee.invitation_id ? "Refresh the directory to load the pending invitation ID" : "Revoke this pending activation invitation"} aria-label={`Revoke pending invitation for ${getFullName(employee)}`} className="rounded-lg border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40">{revokingInvitationEmployeeId === employee.id ? "Revoking…" : "Revoke invitation"}</button>}</div>
                  </article>
                ))}
              </div>
            )}

            {!loading && !error && totalPages > 0 && (
              <div className="flex flex-col gap-3 border-t border-[#29384b] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs text-slate-400">Showing {filteredEmployees.length} records on this page · <span className="font-semibold text-slate-200">{total.toLocaleString()}</span> matching records total</p>
                <div className="flex items-center gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#3b536d] disabled:opacity-35">Previous</button><span className="min-w-[90px] text-center text-xs font-semibold text-slate-300">Page {page} of {totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-lg border border-[#29384b] bg-[#0f1724] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#3b536d] disabled:opacity-35">Next</button></div>
              </div>
            )}
          </section>

          <footer className="mt-8 flex flex-col gap-2 border-t border-[#29384b] py-5 text-xs font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>{total.toLocaleString()} matching employees</span>
          </footer>
        </div>
      </main>

      {bulkStatusConfirmOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="bulk-status-title" aria-describedby="bulk-status-description" className="my-auto w-full max-w-lg rounded-2xl border border-[#34465d] bg-[#111a28] p-6 text-white shadow-xl">
            <h2 id="bulk-status-title" className="text-lg font-bold">Confirm bulk status change</h2>
            <p id="bulk-status-description" className="mt-2 text-sm leading-relaxed text-slate-300">You are about to set {selectedEmployees.length} selected employee record{selectedEmployees.length === 1 ? "" : "s"} to <strong className="text-white">{bulkStatusTarget.toLowerCase()}</strong>. Each update will go through the existing employee API and its workforce validation. Some records may be rejected if a rule prevents the change.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setBulkStatusConfirmOpen(false)} disabled={bulkStatusProcessing} className="h-10 rounded-lg border border-[#34465d] px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.04] disabled:opacity-50">Cancel</button><button type="button" onClick={() => void applyBulkStatusChange()} disabled={bulkStatusProcessing || selectedEmployees.length === 0} className="h-10 rounded-lg bg-[#75c7ff] px-4 text-sm font-bold text-[#07111d] hover:bg-[#a0dcff] disabled:opacity-50">{bulkStatusProcessing ? "Updating…" : "Confirm and apply"}</button></div>
          </section>
        </div>
      )}

      {/* Slide-Over Drawer */}
      {drawerMode && <>
        <button type="button" aria-label="Close employee drawer" onClick={requestCloseDrawer} disabled={saving} className="fixed inset-0 z-40 cursor-default bg-black/70 backdrop-blur-md transition-opacity disabled:cursor-wait" />
        <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="employee-drawer-title" aria-describedby="employee-drawer-description" tabIndex={-1} className="organization-slide-over-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[#29384b] bg-[#111a28] text-white shadow-2xl">
          
          <header className="shrink-0 border-b border-[#29384b] bg-[#0f1724]/95 px-6 py-5 backdrop-blur-xl sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/30 bg-[#75c7ff]/15 text-[#75c7ff]">
                  <Icon name={drawerMode === "create" ? "plus" : drawerMode === "edit" ? "edit" : "users"} size={21} />
                </span>
                <div className="min-w-0">
                  <h2 id="employee-drawer-title" className="text-xl font-bold tracking-tight text-white">
                    {drawerMode === "create" ? "Add workforce member" : drawerMode === "edit" ? "Edit workforce profile" : "Workforce profile"}
                  </h2>
                  <p id="employee-drawer-description" className="mt-1 text-xs font-medium text-slate-300">
                    {drawerMode === "create" ? "Choose the workforce role first, then complete the profile and prepare its activation invitation." : drawerMode === "edit" ? "Update profile information, location, and permitted work assignment details." : "Workforce profile, contact information, and reporting relationships."}
                  </p>
                </div>
              </div>
              <button ref={drawerCloseButtonRef} type="button" onClick={requestCloseDrawer} disabled={saving} aria-label="Close employee drawer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] text-slate-300 transition hover:border-[#3b536d] hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
                <Icon name="close" size={18} />
              </button>
            </div>

            {(drawerMode === "create" || drawerMode === "edit") && (
              <div className="mt-5 flex items-center justify-between border-t border-[#29384b] pt-4">
                {drawerMode === "create" && !roleStepConfirmed ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-[#75c7ff]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#75c7ff] text-xs font-extrabold text-[#07111d]">1</span>
                    Workforce role
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setFormStep(1)} className={`flex items-center gap-2 text-xs font-bold transition ${formStep === 1 ? "text-[#75c7ff]" : "text-slate-400 hover:text-slate-200"}`}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${formStep === 1 ? "bg-[#75c7ff] text-[#07111d]" : "bg-[#29384b] text-slate-300"}`}>{drawerMode === "create" ? "2" : "1"}</span>
                      Personal & Location
                    </button>
                    <span className="text-slate-600">/</span>
                    <button type="button" onClick={handleNextStep} className={`flex items-center gap-2 text-xs font-bold transition ${formStep === 2 ? "text-[#75c7ff]" : "text-slate-400 hover:text-slate-200"}`}>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${formStep === 2 ? "bg-[#75c7ff] text-[#07111d]" : "bg-[#29384b] text-slate-300"}`}>{drawerMode === "create" ? "3" : "2"}</span>
                      Organization
                    </button>
                  </div>
                )}
                <span className="rounded-full border border-[#29384b] bg-[#0f1724] px-3 py-1 text-xs font-bold text-slate-300">
                  {drawerMode === "create" && !roleStepConfirmed ? "Step 1 of 3" : `Step ${drawerMode === "create" ? formStep + 1 : formStep} of ${drawerMode === "create" ? 3 : 2}`}
                </span>
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-7 space-y-6">
            {drawerLoading ? (
              <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 rounded-xl border border-[#29384b] bg-[#0f1724]/75 px-5 py-16 text-sm font-medium text-slate-300">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent" />
                Loading employee record…
              </div>
            ) : drawerError && drawerMode === "view" && !selectedEmployee ? (
              <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
                {drawerError}
                <button type="button" onClick={closeDrawerImmediately} className="mt-3 block font-bold underline">Close drawer</button>
              </div>
            ) : drawerMode === "view" && selectedEmployee ? (
              <>
                {drawerNotice && <div role="status" aria-live="polite" className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-3.5 text-sm font-medium text-emerald-200">{drawerNotice}</div>}

                <section className="relative overflow-hidden rounded-2xl border border-[#29384b] bg-gradient-to-br from-[#17283c] via-[#111d2c] to-[#0b111b] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[#75c7ff]/10 blur-3xl" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                    <EmployeeProfilePhoto employeeId={selectedEmployee.id} name={getFullName(selectedEmployee)} className="h-16 w-16 shrink-0 rounded-2xl border border-[#75c7ff]/35 bg-[#75c7ff]/10 text-xl font-extrabold text-white shadow-inner shadow-[#75c7ff]/[0.04]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold tracking-tight text-white">{getFullName(selectedEmployee)}</h3>
                        {selectedEmployee.workforce_role && <span className="rounded-full border border-[#75c7ff]/25 bg-[#75c7ff]/[0.07] px-2.5 py-1 text-[10px] font-bold text-[#cceaff]">{workforceRoleLabel(selectedEmployee.workforce_role)}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{selectedEmployee.designation || "No designation specified"}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#34465d] bg-[#0b111b]/80 px-2.5 py-1.5 font-mono text-[11px] font-bold text-slate-200"><Icon name="code" size={13} />{selectedEmployee.employee_code}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold ring-1 ring-inset ${statusStyle(selectedEmployee.employment_status)}`}><span className={`h-1.5 w-1.5 rounded-full ${statusDotStyle(selectedEmployee.employment_status)}`} />{selectedEmployee.employment_status}</span>
                        {selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" && <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-violet-200"><Icon name="layers" size={12} />{Number(selectedEmployee.managed_department_count ?? selectedEmployee.managed_departments?.length ?? 0)} managed department{Number(selectedEmployee.managed_department_count ?? selectedEmployee.managed_departments?.length ?? 0) === 1 ? "" : "s"}</span>}
                        {selectedEmployee.is_primary_hr_manager && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-amber-200"><Icon name="shield" size={12} />Primary HR Manager</span>}
                      </div>
                    </div>
                  </div>
                </section>

                <nav className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-[#29384b] bg-[#0b111b]/95 p-1.5 backdrop-blur-xl" role="tablist" aria-label="Employee profile sections">
                  {([
                    { id: "overview", label: "Overview" },
                    ...(selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" ? [{ id: "departments", label: "Managed departments" }] : []),
                    { id: "invitations", label: "Invitations" },
                    { id: "history", label: "History" },
                  ] as Array<{ id: EmployeeDetailTab; label: string }>).map((tab) => (
                    <button key={tab.id} type="button" role="tab" aria-selected={employeeDetailTab === tab.id} onClick={() => setEmployeeDetailTab(tab.id)} className={`shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold transition ${employeeDetailTab === tab.id ? "border border-[#75c7ff]/25 bg-[#18314a] text-[#e3f2ff] shadow-sm" : "border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}>
                      {tab.label}
                    </button>
                  ))}
                </nav>

                {employeeDetailTab === "overview" && (
                  <div className="space-y-4">
                    <WorkforceContactDetails
                      email={selectedEmployee.email}
                      phone={selectedEmployee.phone}
                      city={selectedEmployee.city}
                      country={selectedEmployee.country}
                      emergencyContactName={selectedEmployee.emergency_contact_name}
                      emergencyContactRelationship={selectedEmployee.emergency_contact_relationship}
                      emergencyContactPhone={selectedEmployee.emergency_contact_phone}
                      showEmergencyContact={
                        Object.prototype.hasOwnProperty.call(selectedEmployee, "emergency_contact_name") ||
                        Object.prototype.hasOwnProperty.call(selectedEmployee, "emergency_contact_relationship") ||
                        Object.prototype.hasOwnProperty.call(selectedEmployee, "emergency_contact_phone")
                      }
                    />

                    <section className="rounded-2xl border border-[#29384b] bg-[#141f2e]/90 p-4 sm:p-5">
                      <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#9bd7ff]"><Icon name="shield" size={16} />Workforce hierarchy</h4>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{selectedEmployee.workforce_role === "HR_MANAGER" ? "Organization-wide HR role. HR Managers do not report to another workforce member or have a home department." : selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" ? "Department-level leadership. The full set of managed departments is available in the Managed Departments tab." : "Employee reporting is derived from the assigned department and its eligible Department Manager."}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#29384b] bg-[#0b111b] p-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Home department</p><p className="mt-1 text-sm font-semibold text-white">{selectedEmployee.department_name || "No home department"}</p></div>
                        <div className="rounded-xl border border-[#29384b] bg-[#0b111b] p-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reports to</p>{selectedEmployee.workforce_role === "HR_MANAGER" ? <><p className="mt-1 text-sm font-semibold text-white">Organization-wide</p><p className="mt-1 text-xs text-slate-500">No workforce reporting manager</p></> : <><div className="mt-1 flex items-center gap-2">{selectedEmployee.manager_id && <EmployeeProfilePhoto employeeId={selectedEmployee.manager_id} name={selectedEmployee.manager_name || "Reporting manager"} className="h-8 w-8 shrink-0 rounded-lg border border-[#34465d] bg-[#182232] text-[10px]" />}<p className="text-sm font-semibold text-white">{selectedEmployee.manager_name || "No manager assigned"}</p></div>{selectedEmployee.manager_employee_code && <p className="mt-1 font-mono text-xs text-slate-400">{selectedEmployee.manager_employee_code}</p>}{selectedEmployee.manager_workforce_role && <p className="mt-1 text-xs font-semibold text-[#bfe5ff]">{workforceRoleLabel(selectedEmployee.manager_workforce_role)}</p>}{selectedEmployee.manager_employment_status && <p className="mt-1 text-xs text-slate-400">Employment: {selectedEmployee.manager_employment_status}</p>}{selectedEmployee.manager_account_status && <p className="mt-1 text-xs text-slate-400">Account: {selectedEmployee.manager_account_status}</p>}{selectedEmployee.manager_email && <p className="mt-1 break-all text-xs text-slate-400">{selectedEmployee.manager_email}</p>}</>}</div>
                        <div className="rounded-xl border border-[#29384b] bg-[#0b111b] p-3.5 sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Joining date</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white"><Icon name="calendar" size={15} className="text-slate-400" />{formatDate(selectedEmployee.joining_date)}</p></div>
                      </div>
                    </section>

                    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[#29384b] bg-[#0b111b] p-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Profile created</p><p className="mt-1 text-sm font-semibold text-white">{formatDateTime(selectedEmployee.created_at)}</p></div><div className="rounded-xl border border-[#29384b] bg-[#0b111b] p-3.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last updated</p><p className="mt-1 text-sm font-semibold text-white">{formatDateTime(selectedEmployee.updated_at)}</p></div></div>
                  </div>
                )}

                {employeeDetailTab === "departments" && selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" && (
                  <section className="space-y-4">
                    <div className="flex flex-wrap items-end justify-between gap-3"><div><h4 className="text-base font-bold text-white">Managed departments</h4><p className="mt-1 text-sm text-slate-400">Every department assigned to this manager in the current organization.</p></div><span className="rounded-xl border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] px-3 py-2 text-sm font-extrabold text-[#bfe5ff]">{(selectedEmployee.managed_departments ?? []).length} total</span></div>
                    {(selectedEmployee.managed_departments ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-[#34465d] bg-[#0b111b]/70 px-5 py-10 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#29384b] bg-[#141f2e] text-slate-400"><Icon name="layers" size={20} /></span><p className="mt-3 text-sm font-bold text-white">No departments assigned</p><p className="mt-1 text-xs text-slate-400">Assign this Department Manager to a department from the Departments workspace.</p></div> : <div className="grid gap-3">{(selectedEmployee.managed_departments ?? []).map((department) => <article key={department.id} className="rounded-2xl border border-[#29384b] bg-[#141f2e]/90 p-4 transition hover:border-[#3b536d]"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] text-[#bfe5ff]"><Icon name="layers" size={20} /></span><div className="min-w-0 flex-1"><h5 className="break-words text-sm font-bold text-white">{department.name}</h5><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{department.id}</p><span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${department.status?.toUpperCase() === "ACTIVE" ? "border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200" : "border-slate-500/30 bg-slate-500/[0.08] text-slate-300"}`}>{department.status || "Status unavailable"}</span></div></div><div className="mt-3 border-t border-[#29384b] pt-3"><Link href={`/org/departments?departmentId=${encodeURIComponent(department.id)}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#9bd7ff] hover:text-white">View department details <Icon name="arrow" size={13} /></Link></div></article>)}</div>}
                  </section>
                )}

                {employeeDetailTab === "invitations" && (
                  <section className="space-y-4">
                    <div><h4 className="text-base font-bold text-white">Invitation history</h4><p className="mt-1 text-sm text-slate-400">All recorded invitations for this employee, including accepted, expired, revoked, and pending states.</p></div>
                    {employeeDrawerInvitationsLoading ? <div role="status" className="flex items-center justify-center gap-3 rounded-xl border border-[#29384b] bg-[#0b111b] px-4 py-10 text-sm text-slate-300"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent" />Loading invitation history…</div> : employeeDrawerInvitationsError ? <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-4 text-sm text-rose-200">{employeeDrawerInvitationsError}<button type="button" onClick={() => setEmployeeDrawerInvitationsLoadedFor(null)} className="mt-2 block font-bold text-white underline">Retry</button></div> : employeeDrawerInvitations.length === 0 ? <div className="rounded-xl border border-dashed border-[#34465d] bg-[#0b111b]/70 px-5 py-10 text-center"><p className="text-sm font-bold text-white">No invitations recorded</p><p className="mt-1 text-xs text-slate-400">An invitation will appear here after one is created for this profile.</p></div> : <div className="space-y-3">{employeeDrawerInvitations.map((invitation) => <article key={invitation.id} className="overflow-hidden rounded-2xl border border-[#29384b] bg-[#141f2e]/90"><div className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-bold text-white">{invitation.email}</p><p className="mt-1 font-mono text-[10px] text-slate-500">Invitation ID · {invitation.id}</p></div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${invitationStatusClasses(invitation.display_status || invitation.status)}`}>{invitationStatusLabel(invitation.display_status || invitation.status)}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-[#29384b] bg-[#0b111b] p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Created</p><p className="mt-1 text-xs font-semibold text-slate-200">{formatDateTime(invitation.created_at)}</p></div><div className="rounded-lg border border-[#29384b] bg-[#0b111b] p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Expires</p><p className="mt-1 text-xs font-semibold text-slate-200">{formatDateTime(invitation.expires_at)}</p></div>{invitation.accepted_at && <div className="rounded-lg border border-[#29384b] bg-[#0b111b] p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Accepted</p><p className="mt-1 text-xs font-semibold text-emerald-200">{formatDateTime(invitation.accepted_at)}</p></div>}{invitation.revoked_at && <div className="rounded-lg border border-[#29384b] bg-[#0b111b] p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Revoked</p><p className="mt-1 text-xs font-semibold text-rose-200">{formatDateTime(invitation.revoked_at)}</p></div>}</div>{invitation.invited_by_email && <p className="mt-3 text-xs text-slate-500">Created by <span className="font-semibold text-slate-300">{invitation.invited_by_email}</span></p>}</div>{(invitation.history ?? []).length > 0 && <div className="border-t border-[#29384b] bg-[#0b111b]/65 p-4"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Status events</p><ol className="space-y-2">{(invitation.history ?? []).map((event) => <li key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#75c7ff]" /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-200">{event.event_type.replace(/_/g, " ")}</p><p className="mt-0.5 text-[10px] text-slate-500">{formatDateTime(event.effective_at || event.created_at)}</p>{event.reason && <p className="mt-1 text-xs leading-relaxed text-slate-400">{event.reason}</p>}</div></li>)}</ol></div>}</article>)}</div>}
                  </section>
                )}

                {employeeDetailTab === "history" && (
                  <section className="space-y-4">
                    <div><h4 className="text-base font-bold text-white">Employee history</h4><p className="mt-1 text-sm text-slate-400">Recorded lifecycle events and changes for this workforce profile.</p></div>
                    {employeeDrawerHistoryLoading ? <div role="status" className="flex items-center justify-center gap-3 rounded-xl border border-[#29384b] bg-[#0b111b] px-4 py-10 text-sm text-slate-300"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#75c7ff] border-t-transparent" />Loading employee history…</div> : employeeDrawerHistoryError ? <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-4 text-sm text-rose-200">{employeeDrawerHistoryError}<button type="button" onClick={() => setEmployeeDrawerHistoryLoadedFor(null)} className="mt-2 block font-bold text-white underline">Retry</button></div> : employeeDrawerHistory.length === 0 ? <div className="rounded-xl border border-dashed border-[#34465d] bg-[#0b111b]/70 px-5 py-10 text-center"><p className="text-sm font-bold text-white">No history events available</p><p className="mt-1 text-xs text-slate-400">The history API returned no events for this employee. Some workflows may not currently record history.</p></div> : <ol className="space-y-3">{employeeDrawerHistory.map((event) => <li key={event.id} className="relative rounded-2xl border border-[#29384b] bg-[#141f2e]/90 p-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] text-[#bfe5ff]"><Icon name="clock" size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-xs font-extrabold text-white">{event.event_type.replace(/_/g, " ")}</h5><time className="text-[10px] text-slate-500">{formatDateTime(event.effective_at || event.created_at)}</time></div>{event.reason && <p className="mt-2 text-xs leading-relaxed text-slate-300">{event.reason}</p>}<p className="mt-1 text-[10px] text-slate-500">Changed by <span className="font-semibold text-slate-300">{event.actor_display_name || "Unknown actor"}</span>{event.actor_role_label ? <span> · {event.actor_role_label}</span> : null}</p>{Array.isArray(event.metadata?.updated_fields) && event.metadata.updated_fields.length > 0 && <div className="mt-3 rounded-lg border border-[#29384b] bg-[#0b111b] p-2.5"><p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Fields recorded as changed</p><p className="mt-1 text-xs leading-relaxed text-slate-300">{(event.metadata.updated_fields as unknown[]).filter((field): field is string => typeof field === "string").map((field) => field.replace(/_/g, " ")).join(", ") || "No field details recorded"}</p></div>}{((event.before_state && Object.keys(event.before_state).length > 0) || (event.after_state && Object.keys(event.after_state).length > 0)) && <div className="mt-3 grid gap-2 sm:grid-cols-2">{event.before_state && Object.keys(event.before_state).length > 0 && <div className="rounded-lg border border-[#29384b] bg-[#0b111b] p-2.5"><p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Before</p><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-300">{JSON.stringify(event.before_state, null, 2)}</pre></div>}{event.after_state && Object.keys(event.after_state).length > 0 && <div className="rounded-lg border border-[#29384b] bg-[#0b111b] p-2.5"><p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">After</p><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-300">{JSON.stringify(event.after_state, null, 2)}</pre></div>}</div>}</div></div></li>)}</ol>}
                  </section>
                )}
              </>
            ) : drawerMode === "create" && !roleStepConfirmed ? (
              <div className="space-y-4">
                {drawerError && (
                  <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
                    <div className="flex items-start gap-2.5"><Icon name="alert" size={18} /><span>{drawerError}</span></div>
                  </div>
                )}
                <section aria-labelledby="workforce-role-heading" className="space-y-4 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm">
                  <div className="border-b border-[#29384b] pb-3.5">
                    <h3 id="workforce-role-heading" className="text-sm font-bold text-white flex items-center gap-2">
                      <Icon name="shield" size={17} className="text-[#75c7ff]" /> Choose workforce role
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">Select the person’s intended access role first. The choice will be carried into the activation invitation.</p>
                  </div>
                  <div role="radiogroup" aria-labelledby="workforce-role-heading" className="space-y-3">
                    {WORKFORCE_ROLE_OPTIONS.map((option) => {
                      const selected = creationRole === option.value;
                      return (
                        <button
                          key={option.value}
                          id={`workforce-role-${option.value}`}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            setCreationRole(option.value);
                            setForm((current) => ({ ...current, department_id: "", manager_id: "" }));
                            setDrawerError("");
                            setDepartmentError("");
                            setManagerError("");
                          }}
                          className={`w-full rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#75c7ff] ${selected ? "border-[#75c7ff]/70 bg-[#75c7ff]/10 shadow-[0_0_0_1px_rgba(117,199,255,0.12)]" : "border-[#29384b] bg-[#0f1724] hover:border-[#496783] hover:bg-white/[0.03]"}`}
                        >
                          <span className="flex items-start gap-3">
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#75c7ff] bg-[#75c7ff] text-[#07111d]" : "border-slate-500 text-transparent"}`}>
                              <Icon name="check" size={12} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-extrabold text-white">{option.title}</span>
                                <span className="text-[11px] font-semibold text-[#9ccff3]">{option.subtitle}</span>
                              </span>
                              <span className="mt-1.5 block text-xs leading-relaxed text-slate-300">{option.description}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-lg border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] p-3 text-xs leading-relaxed text-slate-300">
                    <span className="font-bold text-white">Next:</span> enter the workforce profile details, then review and prepare a one-time activation invitation for the selected role.
                  </div>
                </section>
              </div>
            ) : (drawerMode === "create" || drawerMode === "edit") && (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (formStep === 1) {
                    handleNextStep();
                  } else {
                    void handleSubmitEmployee();
                  }
                }}
                className="space-y-4"
              >
                {drawerMode === "create" && <WorkforceCreationGuide />}
                {drawerError && (
                  <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-medium text-rose-200">
                    <div className="flex items-start gap-2.5"><Icon name="alert" size={18} /><span>{drawerError}</span></div>
                  </div>
                )}
                {departmentError && <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/15 p-4 text-sm font-medium text-amber-200">Departments could not be loaded: {departmentError}</div>}
                {managerError && <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/15 p-4 text-sm font-medium text-amber-200">Managers could not be loaded: {managerError}</div>}

                {drawerMode === "edit" && selectedEmployee && (
                  <section aria-labelledby="current-workforce-hierarchy-title" className="space-y-3 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id="current-workforce-hierarchy-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#75c7ff]"><Icon name="shield" size={15} /> Current role & reporting line</h3>
                      <span className="rounded-md border border-[#75c7ff]/30 bg-[#75c7ff]/10 px-2.5 py-1 text-xs font-extrabold text-[#d9f0ff]">{selectedEmployee.workforce_role ? workforceRoleLabel(selectedEmployee.workforce_role) : "Role not assigned"}</span>
                    </div>
                    {selectedEmployee.workforce_role === "HR_MANAGER" && selectedEmployee.is_primary_hr_manager && <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-200"><Icon name="shield" size={13} />Primary HR Manager</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-[#29384b] bg-[#0f1724] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Department</p>
                        <p className="mt-1 text-sm font-bold text-white">{selectedEmployee.department_name || "No home department"}</p>
                      </div>
                      <div className="rounded-lg border border-[#29384b] bg-[#0f1724] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reports to</p>
                        <p className="mt-1 text-sm font-bold text-white">{selectedEmployee.workforce_role === "HR_MANAGER" ? "Organization-wide · no manager" : selectedEmployee.manager_name || "No manager assigned"}</p>
                        {selectedEmployee.manager_workforce_role && <p className="mt-1 text-xs text-[#bfe5ff]">{workforceRoleLabel(selectedEmployee.manager_workforce_role)}{selectedEmployee.manager_employee_code ? ` · ${selectedEmployee.manager_employee_code}` : ""}</p>}
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">The workforce role is read-only in this profile editor. Primary HR Manager designation and department ownership are managed through their dedicated authorized workflows.</p>
                  </section>
                )}

                {formStep === 1 && (
                  <div className="space-y-4 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm">
                    <div className="border-b border-[#29384b] pb-3.5">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Icon name="users" size={17} className="text-[#75c7ff]" /> Personal, Contact & Location
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-300">Fill out required identity, contact, and geography details.</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="employee_code" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                          <span>Employee code <span className="text-rose-400">*</span></span>
                          <FieldStatus complete={employeeFieldComplete("employee_code")} invalid={showEmployeeFieldError("employee_code")} />
                        </label>
                        <input id="employee_code" ref={employeeCodeInputRef} name="employee_code" autoComplete="off" required maxLength={50} value={form.employee_code} onBlur={() => setTouchedFields((current) => new Set(current).add("employee_code"))} onChange={(event) => updateField("employee_code", event.target.value)} placeholder="e.g. EMP-001" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("employee_code") ? "border-rose-400/60" : employeeFieldComplete("employee_code") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                        {showEmployeeFieldError("employee_code") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.employee_code}</p>}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="first_name" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                            <span>First name <span className="text-rose-400">*</span></span>
                            <FieldStatus complete={employeeFieldComplete("first_name")} invalid={showEmployeeFieldError("first_name")} />
                          </label>
                          <input id="first_name" name="first_name" autoComplete="given-name" required minLength={2} maxLength={100} value={form.first_name} onBlur={() => setTouchedFields((current) => new Set(current).add("first_name"))} onChange={(event) => updateField("first_name", event.target.value)} placeholder="First name" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("first_name") ? "border-rose-400/60" : employeeFieldComplete("first_name") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                          {showEmployeeFieldError("first_name") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.first_name}</p>}
                        </div>
                        <div>
                          <label htmlFor="last_name" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                            <span>Last name {drawerMode === "create" ? <span className="text-rose-400">*</span> : <span className="font-medium text-slate-500">(optional)</span>}</span>
                            <FieldStatus complete={employeeFieldComplete("last_name")} invalid={showEmployeeFieldError("last_name")} />
                          </label>
                          <input id="last_name" name="last_name" autoComplete="family-name" maxLength={100} value={form.last_name} onBlur={() => setTouchedFields((current) => new Set(current).add("last_name"))} onChange={(event) => updateField("last_name", event.target.value)} placeholder="Last name" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("last_name") ? "border-rose-400/60" : employeeFieldComplete("last_name") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                          {showEmployeeFieldError("last_name") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.last_name}</p>}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="country" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                          <span>Country <span className="text-rose-400">*</span></span>
                          <FieldStatus complete={employeeFieldComplete("country")} invalid={showEmployeeFieldError("country")} />
                        </label>
                        <CountrySelect id="country" value={form.country} required onBlur={() => setTouchedFields((current) => new Set(current).add("country"))} onChange={(value) => updateField("country", value)} invalid={showEmployeeFieldError("country")} describedBy={showEmployeeFieldError("country") ? "country-error" : undefined} className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("country") ? "border-rose-400/60" : employeeFieldComplete("country") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                        <p className="mt-1.5 text-[10px] text-slate-500">Choose the employee's country. The selection sets the international calling-code prefix.</p>
                        {showEmployeeFieldError("country") && <p id="country-error" role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.country}</p>}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="city" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                            <span>City <span className="text-rose-400">*</span></span>
                            <FieldStatus complete={employeeFieldComplete("city")} invalid={showEmployeeFieldError("city")} />
                          </label>
                          <input id="city" name="city" required maxLength={100} value={form.city} onBlur={() => setTouchedFields((current) => new Set(current).add("city"))} onChange={(event) => updateField("city", event.target.value)} placeholder="e.g. Kigali" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("city") ? "border-rose-400/60" : employeeFieldComplete("city") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                          {showEmployeeFieldError("city") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.city}</p>}
                        </div>
                        <div>
                          <label htmlFor="phone" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                            <span>Phone {drawerMode === "create" ? <span className="text-rose-400">*</span> : <span className="font-medium text-slate-500">(optional)</span>}</span>
                            <FieldStatus complete={employeeFieldComplete("phone")} invalid={showEmployeeFieldError("phone")} />
                          </label>
                          <input id="phone" name="phone" type="tel" inputMode="tel" required={drawerMode === "create"} maxLength={50} value={form.phone} onBlur={() => setTouchedFields((current) => new Set(current).add("phone"))} onChange={(event) => updateField("phone", event.target.value)} placeholder="+250 788 123 456" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("phone") ? "border-rose-400/60" : employeeFieldComplete("phone") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                          {showEmployeeFieldError("phone") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.phone}</p>}
                          <p className="mt-1.5 text-[10px] text-slate-500">{drawerMode === "create" ? "Required. Include the country calling code." : "Include the country calling code when updating this number."}</p>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="email" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                          <span>Email address <span className="text-rose-400">*</span></span>
                          <FieldStatus complete={employeeFieldComplete("email")} invalid={showEmployeeFieldError("email")} />
                        </label>
                        <input id="email" name="email" type="email" inputMode="email" required maxLength={254} value={form.email} onBlur={() => setTouchedFields((current) => new Set(current).add("email"))} onChange={(event) => updateField("email", event.target.value)} placeholder="employee@example.com" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("email") ? "border-rose-400/60" : employeeFieldComplete("email") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                        {showEmployeeFieldError("email") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.email}</p>}
                      </div>

                      <div>
                        <label htmlFor="designation" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                          <span>Designation / Job Title <span className="text-rose-400">*</span></span>
                          <FieldStatus complete={employeeFieldComplete("designation")} invalid={showEmployeeFieldError("designation")} />
                        </label>
                        <input id="designation" name="designation" required maxLength={100} value={form.designation} onBlur={() => setTouchedFields((current) => new Set(current).add("designation"))} onChange={(event) => updateField("designation", event.target.value)} placeholder="e.g. Senior Product Manager" className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("designation") ? "border-rose-400/60" : employeeFieldComplete("designation") ? "border-emerald-400/50" : "border-[#29384b]"}`} />
                        {showEmployeeFieldError("designation") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.designation}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {formStep === 2 && (
                  <div className="space-y-4 rounded-xl border border-[#29384b] bg-[#141f2e]/90 p-5 shadow-sm">
                    <div className="border-b border-[#29384b] pb-3.5">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Icon name="building" size={17} className="text-[#75c7ff]" /> Organization & Status
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-300">{drawerMode === "create" ? "Assignment fields and prerequisites are tailored to the selected workforce role." : "Review the current work assignment and employment status."}</p>
                    </div>

                    <div className="space-y-4">
                      {drawerMode === "create" ? (
                        <>
                          {creationRole === "HR_MANAGER" && (
                            <div className="rounded-xl border border-[#75c7ff]/25 bg-[#75c7ff]/[0.07] p-4 space-y-2">
                              <p className="flex items-center gap-2 text-sm font-bold text-white"><Icon name="shield" size={16} className="text-[#75c7ff]" /> Organization-wide HR role</p>
                              <p className="text-xs leading-relaxed text-slate-300">HR Managers do not belong to a department and do not report to another workforce member. Organization Admin appoints HR Managers and maintains exactly one Primary HR Manager designation.</p>
                              <p className="text-xs leading-relaxed text-slate-400">This profile form does not silently replace the current Primary HR Manager. Primary designation is handled through the dedicated appointment workflow.</p>
                            </div>
                          )}

                          {creationRole === "DEPARTMENT_MANAGER" && (
                            <>
                              <div className="rounded-xl border border-[#75c7ff]/25 bg-[#75c7ff]/[0.07] p-4 space-y-1.5">
                                <p className="text-sm font-bold text-white">Department leadership prerequisites</p>
                                <p className="text-xs leading-relaxed text-slate-300">A Department Manager may own multiple departments. Their reporting manager must be an active HR Manager with an active organization account. Department ownership is assigned in Department Management, not by assigning a home department here.</p>
                              </div>
                              <div>
                                <label htmlFor="manager_id" className="text-xs font-bold text-slate-200">Reports to HR Manager <span className="text-rose-400">*</span></label>
                                <select id="manager_id" name="manager_id" value={form.manager_id} onChange={(event) => updateField("manager_id", event.target.value)} disabled={managersLoading || eligibleHrManagerOptions.length === 0} className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] disabled:opacity-60">
                                  <option value="">{managersLoading ? "Loading eligible HR Managers…" : eligibleHrManagerOptions.length === 0 ? "No eligible HR Manager available" : "Select HR Manager"}</option>
                                  {eligibleHrManagerOptions.map((manager) => (
                                    <option key={manager.id} value={manager.id}>{[manager.first_name, manager.last_name].filter(Boolean).join(" ")} — {manager.employee_code}{manager.is_primary_hr_manager ? " · Primary HR Manager" : ""}</option>
                                  ))}
                                </select>
                                {managerError && <p role="alert" className="mt-2 text-xs text-rose-300">{managerError}</p>}
                                {!managersLoading && !managerError && eligibleHrManagerOptions.length === 0 && <p className="mt-2 text-xs leading-relaxed text-amber-200">An active HR Manager with an active account is required. Resolve HR Manager onboarding before creating this profile.</p>}
                              </div>
                            </>
                          )}

                          {creationRole === "EMPLOYEE" && (
                            <>
                              <div className="rounded-xl border border-[#75c7ff]/25 bg-[#75c7ff]/[0.07] p-4 space-y-1.5">
                                <p className="text-sm font-bold text-white">Department assignment</p>
                                <p className="text-xs leading-relaxed text-slate-300">Employees must belong to an active department with an eligible active Department Manager. The reporting manager is derived from the department to prevent conflicting reporting lines.</p>
                              </div>
                              <div>
                                <label htmlFor="department_id" className="text-xs font-bold text-slate-200">Department <span className="text-rose-400">*</span></label>
                                <select id="department_id" name="department_id" value={form.department_id} onChange={(event) => {
                                  const value = event.target.value;
                                  const department = eligibleDepartmentOptions.find((candidate) => candidate.id === value);
                                  updateField("department_id", value);
                                  updateField("manager_id", department?.manager_id ?? "");
                                }} disabled={departmentsLoading || eligibleDepartmentOptions.length === 0} className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] disabled:opacity-60">
                                  <option value="">{departmentsLoading ? "Loading eligible departments…" : eligibleDepartmentOptions.length === 0 ? "No eligible department available" : "Select department"}</option>
                                  {eligibleDepartmentOptions.map((department) => (
                                    <option key={department.id} value={department.id}>{department.name} — {department.manager_name || department.manager_employee_code || "Assigned manager"}</option>
                                  ))}
                                </select>
                                {departmentError && <p role="alert" className="mt-2 text-xs text-rose-300">{departmentError}</p>}
                                {!departmentsLoading && !departmentError && eligibleDepartmentOptions.length === 0 && <p className="mt-2 text-xs leading-relaxed text-amber-200">No active department with an eligible active Department Manager is available. Create or assign a Department Manager in Department Management first.</p>}
                              </div>
                              {selectedEligibleDepartment && (
                                <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reporting manager · derived from department</p>
                                  <p className="mt-1 text-sm font-bold text-white">{selectedEligibleDepartment.manager_name || "Department Manager"}</p>
                                  <p className="mt-1 text-xs text-slate-400">{selectedEligibleDepartment.manager_employee_code || "Manager code unavailable"} · {selectedEligibleDepartment.name}</p>
                                </div>
                              )}
                            </>
                          )}

                          {!creationRole && (
                            <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">Choose a workforce role before configuring its work assignment.</div>
                          )}
                        </>
                      ) : selectedEmployee?.workforce_role === "EMPLOYEE" ? (
                        <>
                          <div>
                            <label htmlFor="department_id" className="text-xs font-bold text-slate-200">Department <span className="text-rose-400">*</span></label>
                            <select
                              id="department_id"
                              name="department_id"
                              value={form.department_id}
                              onChange={(event) => {
                                const value = event.target.value;
                                const department = eligibleDepartmentOptions.find((candidate) => candidate.id === value);
                                updateField("department_id", value);
                                updateField("manager_id", department?.manager_id ?? "");
                              }}
                              disabled={departmentsLoading || eligibleDepartmentOptions.length === 0}
                              className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] disabled:opacity-60"
                            >
                              <option value="">{departmentsLoading ? "Loading eligible departments…" : "Select an eligible department"}</option>
                              {departments
                                .filter((department) => department.id === form.department_id || eligibleDepartmentOptions.some((eligible) => eligible.id === department.id))
                                .map((department) => {
                                  const eligible = eligibleDepartmentOptions.some((candidate) => candidate.id === department.id);
                                  return <option key={department.id} value={department.id}>{department.name}{eligible ? ` — ${department.manager_name || department.manager_employee_code || "Assigned manager"}` : " · current assignment needs review"}</option>;
                                })}
                            </select>
                            {departmentError && <p role="alert" className="mt-2 text-xs text-rose-300">{departmentError}</p>}
                            {form.department_id && !selectedEligibleDepartment && (
                              <p role="alert" className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                                This department does not currently meet the active-department and eligible-manager requirements. Choose an eligible department before saving this employee as ACTIVE.
                              </p>
                            )}
                            {!departmentsLoading && eligibleDepartmentOptions.length === 0 && (
                              <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">No eligible active department is available. Department assignment or activation must wait until Department Management has an active eligible Department Manager.</p>
                            )}
                          </div>
                          <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reporting manager · derived from department</p>
                            <p className="mt-1 text-sm font-bold text-white">{selectedEligibleDepartment?.manager_name || selectedEligibleDepartment?.manager_employee_code || (form.department_id ? "Current manager assignment requires review" : "No manager assigned")}</p>
                            {selectedEligibleDepartment && <p className="mt-1 text-xs text-slate-400">{selectedEligibleDepartment.name} · manager assigned by Department Management</p>}
                            <p className="mt-2 text-xs leading-relaxed text-slate-400">The manager is derived from the selected department; it cannot be independently overridden here.</p>
                          </div>
                        </>
                      ) : selectedEmployee?.workforce_role === "DEPARTMENT_MANAGER" ? (
                        <>
                          <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Home department</p>
                            <p className="mt-1 text-sm font-bold text-white">No home department</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-400">Department Manager ownership is assigned through Department Management.</p>
                          </div>
                          <div>
                            <label htmlFor="manager_id" className="text-xs font-bold text-slate-200">Reports to HR Manager <span className="text-rose-400">*</span></label>
                            <select id="manager_id" name="manager_id" value={form.manager_id} onChange={(event) => updateField("manager_id", event.target.value)} disabled={managersLoading || eligibleHrManagerOptions.length === 0} className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] disabled:opacity-60">
                              <option value="">{managersLoading ? "Loading eligible HR Managers…" : eligibleHrManagerOptions.length === 0 ? "No eligible HR Manager available" : "Select HR Manager"}</option>
                              {eligibleHrManagerOptions.map((manager) => (
                                <option key={manager.id} value={manager.id}>{[manager.first_name, manager.last_name].filter(Boolean).join(" ")} — {manager.employee_code}{manager.is_primary_hr_manager ? " · Primary HR Manager" : ""}</option>
                              ))}
                            </select>
                            {managerError && <p role="alert" className="mt-2 text-xs text-rose-300">{managerError}</p>}
                            {!managersLoading && eligibleHrManagerOptions.length === 0 && <p className="mt-2 text-xs leading-relaxed text-amber-200">An active HR Manager with an active organization account is required to maintain this reporting line.</p>}
                          </div>
                        </>
                      ) : selectedEmployee?.workforce_role === "HR_MANAGER" ? (
                        <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Work assignment</p>
                          <p className="mt-1 text-sm font-bold text-white">Organization-wide · no home department or reporting manager</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">HR Manager assignment is managed through the authorized workforce hierarchy workflow.</p>
                        </div>
                      ) : (
                        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">This employee's workforce role could not be resolved. Department and reporting changes are unavailable until the role is corrected.</div>
                      )}

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="joining_date" className="flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
                            <span>Joining date {drawerMode === "create" ? <span className="text-rose-400">*</span> : null}</span>
                            <FieldStatus complete={employeeFieldComplete("joining_date")} invalid={showEmployeeFieldError("joining_date")} />
                          </label>
                          <input id="joining_date" name="joining_date" type="date" value={form.joining_date} onBlur={() => setTouchedFields((current) => new Set(current).add("joining_date"))} onChange={(event) => updateField("joining_date", event.target.value)} className={`mt-2 h-11 w-full rounded-xl border bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff] ${showEmployeeFieldError("joining_date") ? "border-rose-400/60" : "border-[#29384b]"}`} />
                          {showEmployeeFieldError("joining_date") && <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">{employeeFieldErrors.joining_date}</p>}
                        </div>
                        <div>
                          <label htmlFor="employment_status" className="text-xs font-bold text-slate-200">Employment status</label>
                          {drawerMode === "create" ? (
                            <div id="employment_status" className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-3.5 py-3">
                              <p className="text-sm font-bold text-amber-200">Inactive — awaiting invitation acceptance</p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-300">Access is activated only after the person accepts the one-time invitation and sets a password.</p>
                            </div>
                          ) : (
                            <select id="employment_status" name="employment_status" value={form.employment_status} onChange={(event) => updateField("employment_status", event.target.value as EmploymentStatus)} className="mt-2 h-11 w-full rounded-xl border border-[#29384b] bg-[#0f1724] px-3.5 text-sm font-medium text-white outline-none transition focus:border-[#75c7ff]">
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                              <option value="FORMER">Former</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {(drawerMode === "create" || (drawerMode === "edit" && selectedEmployee)) && (
                        <WorkforceEmergencyContactFields
                          values={{
                            emergency_contact_name: form.emergency_contact_name,
                            emergency_contact_relationship: form.emergency_contact_relationship,
                            emergency_contact_phone: form.emergency_contact_phone,
                          }}
                          onChange={(field, value) => updateField(field, value)}
                          onBlur={(field) => setTouchedFields((current) => new Set(current).add(field))}
                          showError={(field) => showEmployeeFieldError(field)}
                          getError={(field) => employeeFieldErrors[field] ?? null}
                          required={drawerMode === "create"}
                        />
                      )}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {drawerMode === "create" && !roleStepConfirmed ? (
            <footer className="shrink-0 border-t border-[#29384b] bg-[#0f1724]/95 px-6 py-4.5 backdrop-blur-xl sm:px-7">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={requestCloseDrawer} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50">Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    if (!creationRole) {
                      setDrawerError("Choose a workforce role to continue.");
                      return;
                    }
                    setRoleStepConfirmed(true);
                    setDrawerError("");
                    window.requestAnimationFrame(() => employeeCodeInputRef.current?.focus());
                  }}
                  disabled={!creationRole || saving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-5 text-xs font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
                >
                  Continue <Icon name="arrow" size={14} />
                </button>
              </div>
            </footer>
          ) : drawerMode !== "view" &&
  (drawerMode === "create" || drawerMode === "edit") && (
    <footer className="shrink-0 border-t border-[#29384b] bg-[#0f1724]/95 px-6 py-4.5 backdrop-blur-xl sm:px-7">
      <div className="flex items-center justify-between gap-3">
        {formStep === 2 ? (
          <button
            type="button"
            onClick={() => setFormStep(1)}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            Back
          </button>
        ) : drawerMode === "create" ? (
          <button
            type="button"
            onClick={() => {
              setRoleStepConfirmed(false);
              setDrawerError("");
            }}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            Back to role
          </button>
        ) : (
          <button
            type="button"
            onClick={requestCloseDrawer}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        {formStep === 1 ? (
          <button
            type="button"
            onClick={handleNextStep}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-5 text-xs font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:opacity-50 shadow-sm"
          >
            Next step <Icon name="arrow" size={14} />
          </button>
        ) : drawerMode === "create" ? (
          <button
            type="button"
            onClick={() => void handleSubmitEmployee()}
            disabled={saving || drawerLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-5 text-xs font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:opacity-50 shadow-sm"
          >
            {saving ? "Creating & sending invitation…" : "Create & Send Invitation"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmitEmployee()}
            disabled={saving || drawerLoading || !formIsDirty}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-5 text-xs font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:opacity-50 shadow-sm"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>
    </footer>
  )}

          {drawerMode === "view" && (
            <footer className="shrink-0 border-t border-[#29384b] bg-[#0f1724]/95 px-6 py-4.5 backdrop-blur-xl sm:px-7">
              <div className="flex justify-between gap-3">
                <button type="button" onClick={requestCloseDrawer} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#29384b] px-4.5 text-sm font-bold text-slate-200 hover:bg-white/[0.08]">Close</button>
                <button type="button" onClick={beginEditing} disabled={!selectedEmployee || drawerLoading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#75c7ff] px-4.5 text-sm font-bold text-[#07111d] hover:bg-[#a0dcff] disabled:opacity-50 shadow-sm"><Icon name="edit" size={16} />Edit Employee</button>
              </div>
            </footer>
          )}
        </aside>

        {confirmDiscard && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <section ref={discardDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-employee-title" aria-describedby="discard-employee-description" tabIndex={-1} className="w-full max-w-md rounded-2xl border border-[#34465d] bg-[#111a28] p-6 text-white shadow-2xl outline-none">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15 text-amber-300"><Icon name="alert" size={22} /></span>
              <h3 id="discard-employee-title" className="mt-4 text-lg font-bold text-white">Discard unsaved changes?</h3>
              <p id="discard-employee-description" className="mt-2 text-sm leading-relaxed text-slate-300">Your {drawerMode === "create" ? "new employee details" : "employee edits"} have not been saved. You can continue editing or discard those changes.</p>
              <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button ref={discardKeepEditingRef} type="button" onClick={() => setConfirmDiscard(false)} className="h-10 rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]">Keep editing</button>
                <button type="button" onClick={closeDrawerImmediately} className="h-10 rounded-xl border border-rose-400/35 bg-rose-500/15 px-4.5 text-sm font-bold text-rose-200 transition hover:bg-rose-500/25">Discard changes</button>
              </div>
            </section>
          </div>
        )}
      </>}

      {confirmWorkflowChanges && selectedEmployee && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md">
          <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-workforce-changes-title" aria-describedby="confirm-workforce-changes-description" className="my-auto w-full max-w-lg rounded-2xl border border-[#34465d] bg-[#111a28] p-6 text-white shadow-2xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15 text-amber-300"><Icon name="alert" size={22} /></span>
            <h3 id="confirm-workforce-changes-title" className="mt-4 text-lg font-bold text-white">Confirm workforce changes</h3>
            <p id="confirm-workforce-changes-description" className="mt-2 text-sm leading-relaxed text-slate-300">Review the employment or reporting changes before saving. The server will validate the workforce rules and record the update in employee history.</p>
            <div className="mt-4 space-y-3 rounded-xl border border-[#29384b] bg-[#0b0f17] p-4">
              {form.employment_status !== selectedEmployee.employment_status && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employment status</p>
                  <p className="mt-1 text-sm font-bold text-white">{selectedEmployee.employment_status} <span className="text-[#75c7ff]">→</span> {form.employment_status}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">This updates the employee's employment record and how the profile is categorized in the workforce directory.</p>
                </div>
              )}
              {(form.department_id || null) !== (selectedEmployee.department_id || null) && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Department assignment</p>
                  <p className="mt-1 text-sm font-bold text-white">{selectedEmployee.department_name || "Unassigned"} <span className="text-[#75c7ff]">→</span> {departments.find((department) => department.id === form.department_id)?.name || "Unassigned"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">For Employees, the reporting manager is derived from the chosen department. The final assignment is subject to server-side eligibility checks.</p>
                </div>
              )}
              {(form.manager_id || null) !== (selectedEmployee.manager_id || null) && selectedEmployee.workforce_role === "DEPARTMENT_MANAGER" && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reporting manager</p>
                  <p className="mt-1 text-sm font-bold text-white">{selectedEmployee.manager_name || "Unassigned"} <span className="text-[#75c7ff]">→</span> {(() => { const manager = eligibleHrManagerOptions.find((candidate) => candidate.id === form.manager_id); return manager ? [manager.first_name, manager.last_name].filter(Boolean).join(" ") : "Unassigned"; })()}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmWorkflowChanges(false)} disabled={saving} className="h-10 rounded-xl border border-[#29384b] bg-[#0f1724] px-4.5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50">Review again</button>
              <button type="button" onClick={() => void handleSubmitEmployee(true)} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-4.5 text-sm font-extrabold text-[#07111d] transition hover:bg-[#a0dcff] disabled:opacity-50">{saving ? "Saving…" : "Confirm & Save"}</button>
            </div>
          </section>
        </div>
      )}

      {invitingEmployee && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-invitation-title"
            className="my-auto w-full max-w-xl rounded-2xl border border-[#34465d] bg-[#111a28] text-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#29384b] px-6 py-5">
              <div>
                <h2 id="employee-invitation-title" className="text-lg font-bold">Invite employee to HRMS</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Create a one-time activation link for {getFullName(invitingEmployee)}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInvitationDialog}
                disabled={creatingInvitation}
                aria-label="Close invitation dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded-xl border border-[#29384b] bg-[#0f1724] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Employee</p>
                <p className="mt-1 font-bold text-white">{getFullName(invitingEmployee)}</p>
                <p className="mt-1 break-all text-sm text-slate-300">{invitingEmployee.email || "No email address"}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Employee code: <span className="font-mono text-slate-200">{invitingEmployee.employee_code}</span>
                </p>
              </div>

              {!invitationUrl && (
                <div className="rounded-xl border border-[#34465d] bg-[#0f1724] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Assigned workforce role</p>
                  <p className="mt-1 text-sm font-extrabold text-white">{invitingEmployee.workforce_role ? workforceRoleLabel(invitingEmployee.workforce_role) : "Role not assigned"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">The invitation uses the role already assigned to this employee profile. It cannot be changed here.</p>
                  {invitationIsPending(invitingEmployee) && <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/[0.08] px-3 py-2 text-xs font-semibold text-amber-200">A pending invitation already exists for this employee.</p>}
                  {!invitingEmployee.workforce_role && <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/[0.08] px-3 py-2 text-xs text-rose-200">Assign a workforce role to this profile before inviting.</p>}
                </div>
              )}

              {invitationError && (
                <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3.5 text-sm text-rose-200">
                  {invitationError}
                </div>
              )}

              {invitationUrl ? (
                <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-emerald-200">
                    <Icon name="check" size={16} />Activation link created
                  </p>
                  <p className="text-sm leading-relaxed text-slate-300">
{invitationEmailSent ? `Invitation email confirmed sent to ${invitingEmployee.email}. The activation link below is available as an administrative fallback and expires in 48 hours.` : "The invitation endpoint returned a link, but email delivery has not been confirmed. Do not assume the employee received it; verify the email configuration before sharing the fallback link."}
                  </p>
                  <div className="break-all rounded-lg border border-[#29384b] bg-[#0b0f17] p-3 font-mono text-xs leading-relaxed text-slate-200">
                    {invitationUrl}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void handleCopyInvitationLink()}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-4 text-sm font-bold text-[#07111d] hover:bg-[#a0dcff]"
                    >
                      <Icon name="copy" size={15} />{invitationLinkCopied ? "Copied" : "Copy activation link"}
                    </button>
                    <a
                      href={invitationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#34465d] bg-[#0f1724] px-4 text-sm font-bold text-slate-200 hover:bg-white/[0.08]"
                    >
                      Open link <Icon name="arrow" size={15} />
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-slate-400">
                  Creating an invitation calls the same server-side delivery workflow used for automatic invitations. The activation link is shown only after delivery is confirmed.
                </p>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[#29384b] px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeInvitationDialog}
                disabled={creatingInvitation}
                className="h-10 rounded-xl border border-[#34465d] bg-[#0f1724] px-4 text-sm font-bold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
              >
                {invitationUrl ? "Done" : "Cancel"}
              </button>
              {!invitationUrl && (
                <button
                  type="button"
                  onClick={() => void handleCreateInvitation()}
                  disabled={creatingInvitation || !invitingEmployee.email || invitingEmployee.employment_status === "FORMER" || !invitingEmployee.workforce_role || invitationIsPending(invitingEmployee)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#75c7ff] px-4 text-sm font-extrabold text-[#07111d] hover:bg-[#a0dcff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingInvitation ? "Creating link…" : "Create activation link"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {revokeConfirmationEmployee && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !revokingInvitationEmployeeId) {
              setRevokeConfirmationEmployee(null);
            }
          }}
        >
          <section
            id="revoke-invitation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="revoke-invitation-title"
            aria-describedby="revoke-invitation-description"
            className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-rose-400/25 bg-[#101927] text-white shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
          >
            <div className="relative overflow-hidden border-b border-white/[0.07] px-6 pb-5 pt-6 sm:px-7">
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl" />
              <div className="relative flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-200 shadow-inner shadow-rose-400/[0.04]">
                  <Icon name="alert" size={23} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-rose-300/90">Access control</p>
                  <h2 id="revoke-invitation-title" className="mt-1 text-xl font-bold tracking-tight text-white">Revoke activation invitation?</h2>
                  <p id="revoke-invitation-description" className="mt-2 text-sm leading-relaxed text-slate-300">The pending activation link will be disabled. The employee profile itself will not be deleted or changed.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close revoke confirmation"
                  onClick={() => setRevokeConfirmationEmployee(null)}
                  disabled={Boolean(revokingInvitationEmployeeId)}
                  className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5 sm:px-7">
              <div className="rounded-2xl border border-[#34465d] bg-[#0b111b] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#34465d] bg-[#182232] text-sm font-extrabold text-slate-100">
                    {getInitials(getFullName(revokeConfirmationEmployee))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{getFullName(revokeConfirmationEmployee)}</p>
                    <p className="mt-0.5 break-all text-xs text-slate-300">{revokeConfirmationEmployee.email || "No email address"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-[#34465d] bg-[#182232] px-2 py-1 font-mono text-[10px] font-bold text-slate-300">{revokeConfirmationEmployee.employee_code}</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/[0.08] px-2.5 py-1 text-[10px] font-bold text-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Invitation pending</span>
                    </div>
                    {revokeConfirmationEmployee.invitation_expires_at && (
                      <p className="mt-2 text-[11px] text-slate-500">Current link expires {formatDate(revokeConfirmationEmployee.invitation_expires_at)}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 rounded-xl border border-rose-400/15 bg-rose-500/[0.06] p-3.5">
                <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-rose-200" />
                <p className="text-xs leading-relaxed text-slate-300"><span className="font-bold text-rose-100">This action cannot be undone.</span> If this person still needs access, you can prepare a new invitation after the revocation is confirmed.</p>
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-white/[0.07] bg-[#0b111b]/70 px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
              <button
                ref={revokeModalCancelRef}
                type="button"
                onClick={() => setRevokeConfirmationEmployee(null)}
                disabled={Boolean(revokingInvitationEmployeeId)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#34465d] bg-[#111a28] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Keep invitation
              </button>
              <button
                id="revoke-invitation-confirm-button"
                type="button"
                onClick={() => void confirmRevokeInvitation()}
                disabled={Boolean(revokingInvitationEmployeeId)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {revokingInvitationEmployeeId ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Revoking invitation…</> : <><Icon name="close" size={16} />Revoke invitation</>}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}