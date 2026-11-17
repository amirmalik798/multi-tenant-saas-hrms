import AttendanceReportsWorkspace from "../../components/attendance/AttendanceReportsWorkspace";

export default function EmployeeAttendanceReportsPage() {
  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-300">My attendance</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Attendance reports</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Generate and print a PDF of your recorded attendance, approved corrections, assigned shifts and monthly hours.
        </p>
      </div>
      <AttendanceReportsWorkspace audience="employee" />
    </section>
  );
}
