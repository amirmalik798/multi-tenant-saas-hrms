"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

export default function OrganizationLogo({
  className = "size-10",
}: {
  className?: string;
}) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion(Date.now());
    window.addEventListener("hrms:organization-logo-updated", refresh);
    return () => window.removeEventListener("hrms:organization-logo-updated", refresh);
  }, []);

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 ${className}`}>
      <Building2 size={20} aria-hidden="true" />
      <img
        key={version}
        src={`/api/backend/org/logo?v=${version}`}
        alt="Organization logo"
        className="absolute inset-0 h-full w-full bg-[#101722] object-contain p-1"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}
