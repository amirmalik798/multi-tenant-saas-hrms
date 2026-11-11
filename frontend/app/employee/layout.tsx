import type { ReactNode } from "react";
import { EmployeeChrome } from "../components/employee/EmployeeChrome";

export default function EmployeeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <EmployeeChrome>{children}</EmployeeChrome>;
}