import type { ReactNode } from "react";
import { WorkspaceGate } from "@/components/layout/WorkspaceGate";
export default function DepartmentManagerLayout({ children }: { children: ReactNode }) { return <WorkspaceGate role="DEPARTMENT_MANAGER">{children}</WorkspaceGate>; }
