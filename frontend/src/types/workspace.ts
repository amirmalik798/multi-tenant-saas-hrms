export type WorkspaceRole =
  | "ORGANIZATION_ADMIN"
  | "HR_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "EMPLOYEE";

export type WorkforceRole = Exclude<WorkspaceRole, "ORGANIZATION_ADMIN">;

export interface WorkspaceUser {
  id: string;
  email: string;
  role: WorkspaceRole;
  organizationId: string;
  organizationName: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  employeeId?: string;
  permissions: string[];
}

export interface WorkspaceSessionPayload {
  status?: string;
  authenticated?: boolean;
  message?: string;
  user?: Partial<WorkspaceUser>;
}

export interface ApiErrorPayload {
  message?: string;
  error?: string;
  detail?: string;
}

export interface PageMeta {
  title: string;
  description: string;
  eyebrow?: string;
}
