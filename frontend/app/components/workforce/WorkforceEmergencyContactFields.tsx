"use client";

import { HeartHandshake, Phone, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type WorkforceEmergencyContactField =
  | "emergency_contact_name"
  | "emergency_contact_relationship"
  | "emergency_contact_phone";

export type WorkforceEmergencyContactValues = Record<WorkforceEmergencyContactField, string>;

type Props = {
  values: WorkforceEmergencyContactValues;
  onChange: (field: WorkforceEmergencyContactField, value: string) => void;
  onBlur: (field: WorkforceEmergencyContactField) => void;
  showError: (field: WorkforceEmergencyContactField) => boolean;
  getError: (field: WorkforceEmergencyContactField) => string | null | undefined;
  required?: boolean;
};

const inputBaseClass =
  "mt-2 h-11 w-full rounded-xl border bg-[#0b111b] px-3.5 text-sm font-medium text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/15";

function Field({
  field,
  label,
  value,
  maxLength,
  placeholder,
  type = "text",
  icon: Icon,
  onChange,
  onBlur,
  showError,
  getError,
  required = false,
  className = "",
}: {
  field: WorkforceEmergencyContactField;
  label: string;
  value: string;
  maxLength: number;
  placeholder: string;
  type?: "text" | "tel";
  icon: LucideIcon;
  onChange: Props["onChange"];
  onBlur: Props["onBlur"];
  showError: Props["showError"];
  getError: Props["getError"];
  required?: boolean;
  className?: string;
}) {
  const error = showError(field) ? getError(field) : null;
  const inputId = `workforce-${field}`;
  const errorId = `${inputId}-error`;

  return (
    <label htmlFor={inputId} className={`block min-w-0 ${className}`.trim()}>
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
        <Icon size={14} className="text-slate-400" aria-hidden="true" />
        {label}
        {required ? <span className="text-rose-400">*</span> : field === "emergency_contact_relationship" ? (
          <span className="font-normal text-slate-500">(optional)</span>
        ) : null}
      </span>
      <input
        id={inputId}
        name={field}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        autoComplete="off"
        maxLength={maxLength}
        required={required}
        value={value}
        onBlur={() => onBlur(field)}
        onChange={(event) => onChange(field, event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`${inputBaseClass} ${error ? "border-rose-400/70 focus:border-rose-300" : "border-[#29384b]"}`}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-semibold text-rose-300">
          {error}
        </p>
      )}
    </label>
  );
}

export function WorkforceEmergencyContactFields({
  values,
  onChange,
  onBlur,
  showError,
  getError,
  required = false,
}: Props) {
  return (
    <section
      aria-labelledby="workforce-emergency-contact-form-heading"
      className="space-y-4 rounded-2xl border border-[#29384b] bg-[#141f2e]/90 p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3 border-b border-[#29384b] pb-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-500/[0.08] text-amber-200">
          <HeartHandshake size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id="workforce-emergency-contact-form-heading" className="text-sm font-bold text-white">
            Emergency contact
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {required
              ? "All three details are required when creating a workforce profile, so the organization can contact the right person in an emergency."
              : "Keep these details current. They are stored separately from ordinary directory contact information."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          field="emergency_contact_name"
          label="Contact name"
          value={values.emergency_contact_name}
          maxLength={120}
          placeholder="Full name"
          icon={UserRound}
          onChange={onChange}
          onBlur={onBlur}
          showError={showError}
          getError={getError}
          required={required}
          className="sm:col-span-2"
        />
        <Field
          field="emergency_contact_relationship"
          label="Relationship"
          value={values.emergency_contact_relationship}
          maxLength={80}
          placeholder="e.g. Spouse, parent, sibling"
          icon={UserRound}
          onChange={onChange}
          onBlur={onBlur}
          showError={showError}
          getError={getError}
          required={required}
        />
        <Field
          field="emergency_contact_phone"
          label="Contact phone"
          value={values.emergency_contact_phone}
          maxLength={30}
          placeholder="Include calling code, e.g. +250 788 000 000"
          type="tel"
          icon={Phone}
          onChange={onChange}
          onBlur={onBlur}
          showError={showError}
          getError={getError}
          required={required}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Emergency-contact information is kept separate from ordinary directory details and should only be accessed when appropriate.
      </p>
    </section>
  );
}
