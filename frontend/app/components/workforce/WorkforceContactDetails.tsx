"use client";

import { Globe2, Mail, MapPin, Phone, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCountryWithFlag } from "./CountryPhoneFields";

type WorkforceContactDetailsProps = {
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  /** True only when the authorized detail API returned emergency-contact fields. */
  showEmergencyContact?: boolean;
  className?: string;
};

function displayValue(value: string | null | undefined): string {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function ContactTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#29384b] bg-[#0b111b] p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon size={13} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words text-sm font-semibold leading-5 text-white">{value}</p>
    </div>
  );
}

export function WorkforceContactDetails({
  email,
  phone,
  city,
  country,
  emergencyContactName,
  emergencyContactRelationship,
  emergencyContactPhone,
  showEmergencyContact = false,
  className = "",
}: WorkforceContactDetailsProps) {
  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <section aria-labelledby="workforce-contact-information-heading" className="rounded-2xl border border-[#29384b] bg-[#141f2e]/90 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#75c7ff]/20 bg-[#75c7ff]/[0.06] text-[#bfe5ff]">
            <Mail size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="workforce-contact-information-heading" className="text-sm font-semibold text-white">Contact information</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Employee contact details and location, using the same field order across workforce drawers.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ContactTile label="Email address" value={displayValue(email)} icon={Mail} />
          <ContactTile label="Phone number" value={displayValue(phone)} icon={Phone} />
          <ContactTile label="City" value={displayValue(city)} icon={MapPin} />
          <ContactTile label="Country" value={formatCountryWithFlag(country)} icon={Globe2} />
        </div>
      </section>

      {showEmergencyContact && (
        <section aria-labelledby="workforce-emergency-contact-heading" className="rounded-2xl border border-amber-500/20 bg-[#141f2e]/90 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-200">
              <UserRound size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="workforce-emergency-contact-heading" className="text-sm font-semibold text-white">Emergency contact</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">Private contact details. Use only when relevant to employee support or an emergency.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ContactTile label="Contact name" value={displayValue(emergencyContactName) === "—" ? "Not provided" : displayValue(emergencyContactName)} icon={UserRound} />
            <ContactTile label="Relationship" value={displayValue(emergencyContactRelationship) === "—" ? "Not provided" : displayValue(emergencyContactRelationship)} icon={UserRound} />
            <div className="sm:col-span-2">
              <ContactTile label="Contact phone" value={displayValue(emergencyContactPhone) === "—" ? "Not provided" : displayValue(emergencyContactPhone)} icon={Phone} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
