import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  busy?: boolean;
  leading?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", busy, leading, disabled, children, className = "", ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`button button-${variant} button-${size} ${className}`.trim()}
    >
      {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : leading}
      {children}
    </button>
  );
}
