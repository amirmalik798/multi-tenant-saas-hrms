export default function EmployeeWelcomeRedirectPage() {
  return (
    <section className="flex min-h-56 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111a27] p-6">
      <div className="text-center">
        <span className="mx-auto block size-2 animate-pulse rounded-full bg-sky-400" />
        <h1 className="mt-4 text-base font-semibold text-white">
          Opening your workspace
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Your verified session is being directed to the correct workspace.
        </p>
      </div>
    </section>
  );
}