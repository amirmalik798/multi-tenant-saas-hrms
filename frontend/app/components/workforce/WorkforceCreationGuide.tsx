"use client";

import { ContactRound, ShieldCheck, HeartPulse } from "lucide-react";

const STEPS = [
  { title: "Personal details", description: "Identity, contact and location", icon: ContactRound },
  { title: "Role & reporting", description: "Role, department and manager", icon: ShieldCheck },
  { title: "Emergency contact", description: "Required backup contact details", icon: HeartPulse },
] as const;

export function WorkforceCreationGuide() {
  return (
    <section aria-label="Workforce creation checklist" className="rounded-2xl border border-slate-700/80 bg-gradient-to-br from-[#111c2a] via-[#111820] to-[#0b1118] p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-300">Guided setup</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">Work through these three sections. Required fields are marked, and the form will highlight anything that needs attention.</p>
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="flex min-w-0 items-start gap-2.5 rounded-xl border border-slate-700/70 bg-slate-950/30 p-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-200">
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-white">{index + 1}. {step.title}</span>
                <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">{step.description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
