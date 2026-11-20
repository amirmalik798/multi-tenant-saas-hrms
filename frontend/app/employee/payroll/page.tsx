"use client";

import EmployeeEarningsWorkspace from "../../components/employee/EmployeeEarningsWorkspace";
import { useEmployeeWorkspaceUser } from "../../components/employee/EmployeeChrome";

export default function EmployeePayrollPage() {
  const user = useEmployeeWorkspaceUser();
  return <EmployeeEarningsWorkspace employeeId={user?.employeeId} allowOwnPayslips />;
}
