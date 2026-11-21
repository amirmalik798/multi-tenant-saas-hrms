import type { ReactNode } from "react";
import { WorkspaceGate } from "@/components/layout/WorkspaceGate";
export default function EmployeeLayout({ children }: { children: ReactNode }) { return <WorkspaceGate role="EMPLOYEE">{children}</WorkspaceGate>; }
