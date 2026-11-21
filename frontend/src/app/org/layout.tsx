import type { ReactNode } from "react";
import { WorkspaceGate } from "@/components/layout/WorkspaceGate";
export default function OrganizationAdminLayout({ children }: { children: ReactNode }) { return <WorkspaceGate role="ORGANIZATION_ADMIN">{children}</WorkspaceGate>; }
