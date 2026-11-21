import type { ReactNode } from "react";
import { WorkspaceGate } from "@/components/layout/WorkspaceGate";
export default function HRManagerLayout({ children }: { children: ReactNode }) { return <WorkspaceGate role="HR_MANAGER">{children}</WorkspaceGate>; }
