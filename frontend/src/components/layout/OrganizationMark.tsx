"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { initials } from "@/lib/format";

/** Organization-scoped logo with a graceful initials fallback. */
export function OrganizationMark({ name, className = "" }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`org-avatar ${className}`.trim()} aria-label={`${name} mark`}><Building2 size={15} aria-hidden="true" /></span>;
  }
  return (
    <img
      className={`org-avatar organization-logo ${className}`.trim()}
      src="/api/backend/org/logo"
      alt={`${name} logo`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
