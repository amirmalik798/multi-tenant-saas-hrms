"use client";

type PdfPreparationIndicatorProps = {
  label: string;
  className?: string;
};

export function PdfPreparationIndicator({ label, className = "" }: PdfPreparationIndicatorProps) {
  return (
    <div className={`pdf-preparation-indicator ${className}`.trim()} role="status" aria-label={label}>
      <span className="pdf-preparation-spinner" aria-hidden="true">
        <span className="pdf-preparation-spinner-inner" />
        <span className="pdf-preparation-spinner-core">HR</span>
      </span>
      <span className="pdf-preparation-caption">{label}</span>
    </div>
  );
}
