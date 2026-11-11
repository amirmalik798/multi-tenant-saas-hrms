"use client";

import { Suspense } from "react";
import AttendanceManagementWorkspace from "../../../components/attendance/AttendanceManagementWorkspace";
import { useSearchParams } from "next/navigation";
import {
  HRManagerLoading,
  HRManagerShell,
  HRManagerUnavailable,
  useHRManagerSession,
} from "../../../components/hr/HRManagerChrome";

type AttendanceSection = "calendar" | "hours" | "schedules" | "corrections" | "overtime";
const ATTENDANCE_SECTIONS: readonly AttendanceSection[] = ["calendar", "hours", "schedules", "corrections", "overtime"];

function HRManagerAttendancePageContent() {
  const auth = useHRManagerSession();
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const initialSection: AttendanceSection = requestedSection && ATTENDANCE_SECTIONS.includes(requestedSection as AttendanceSection)
    ? (requestedSection as AttendanceSection)
    : "calendar";

  if (auth.checking) {
    return <HRManagerLoading message="Verifying your HR Manager session…" />;
  }

  if (!auth.user) {
    return (
      <HRManagerUnavailable
        message={auth.error || "Your HR Manager session is unavailable."}
        onRetry={() => void auth.reload()}
      />
    );
  }

  return (
    <HRManagerShell
      user={auth.user}
      activePage="modules"
      title="Attendance & Time"
      description="Organization attendance, schedules, corrections and overtime."
      onLogout={() => void auth.logout()}
      loggingOut={auth.loggingOut}
      logoutError={auth.error}
    >
      <AttendanceManagementWorkspace key={initialSection} audience="hr-manager" initialSection={initialSection} />
    </HRManagerShell>
  );
}

export default function HRManagerAttendancePage() {
  return (
    <Suspense fallback={<HRManagerLoading message="Loading attendance workspace…" />}>
      <HRManagerAttendancePageContent />
    </Suspense>
  );
}
